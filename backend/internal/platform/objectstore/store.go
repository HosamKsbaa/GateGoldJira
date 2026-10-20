// Package objectstore isolates private object I/O from database transactions.
package objectstore

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"google.golang.org/api/option"
	googlehttp "google.golang.org/api/transport/http"
	"hash/crc32"
	"io"
	"net/http"
	"regexp"
	"sync"

	"cloud.google.com/go/storage"
)

const MaximumSize int64 = 10 * 1024 * 1024

var (
	ErrNotFound   = errors.New("private object is unavailable")
	ErrExists     = errors.New("immutable object already exists")
	ErrGeneration = errors.New("object generation does not match")
	ErrBusy       = errors.New("picture transfer capacity is busy")
	validKey      = regexp.MustCompile(`^[a-z0-9][a-z0-9/_-]{0,249}$`)
)

type Key string

func (key Key) Validate() error {
	if !validKey.MatchString(string(key)) {
		return errors.New("invalid private object key")
	}
	return nil
}

type Info struct {
	Generation  int64  `json:"generation"`
	Size        int64  `json:"size"`
	ContentType string `json:"contentType"`
	SHA256      string `json:"sha256"`
	CRC32C      uint32 `json:"crc32c"`
}

func (info Info) Validate() error {
	checksum, err := hex.DecodeString(info.SHA256)
	if err != nil || len(checksum) != sha256.Size || info.Generation < 1 || info.Size < 1 || info.Size > MaximumResumableSize {
		return errors.New("invalid object metadata")
	}
	if !supportedContentType(info.ContentType) {
		return errors.New("unsupported private file content type")
	}
	return nil
}

func sameObject(actual, expected Info) bool {
	return actual.Generation == expected.Generation && actual.Size == expected.Size && actual.ContentType == expected.ContentType && actual.SHA256 == expected.SHA256
}

// There is deliberately no published-object deletion operation.
type Store interface {
	Inspect(context.Context, Key, bool) (Info, error)
	CreateStaging(context.Context, Key, io.Reader, int64, string) (Info, error)
	Publish(context.Context, Key, Info, Key) (Info, error)
	Open(context.Context, Key, Info, bool) (io.ReadCloser, error)
	DeleteFailedStaging(context.Context, Key, int64) error
}

type TransferGate struct{ slots chan struct{} }

func NewTransferGate() *TransferGate { return &TransferGate{slots: make(chan struct{}, 2)} }
func (gate *TransferGate) Acquire(ctx context.Context) (func(), error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	select {
	case gate.slots <- struct{}{}:
		var once sync.Once
		return func() { once.Do(func() { <-gate.slots }) }, nil
	default:
		return nil, ErrBusy
	}
}

type contextReader struct {
	ctx    context.Context
	reader io.Reader
}

func (reader contextReader) Read(data []byte) (int, error) {
	if err := reader.ctx.Err(); err != nil {
		return 0, err
	}
	return reader.reader.Read(data)
}

func copyChecked(ctx context.Context, target io.Writer, source io.Reader, size int64) (string, uint32, error) {
	if size < 1 || size > MaximumResumableSize {
		return "", 0, errors.New("picture size is outside the limit")
	}
	sha, crc := sha256.New(), crc32.New(crc32.MakeTable(crc32.Castagnoli))
	count, err := io.Copy(io.MultiWriter(target, sha, crc), io.LimitReader(contextReader{ctx, source}, size+1))
	if err != nil {
		return "", 0, err
	}
	if count != size {
		return "", 0, errors.New("picture byte count differs from declared size")
	}
	return hex.EncodeToString(sha.Sum(nil)), crc.Sum32(), nil
}

type Google struct {
	client          *storage.Client
	stagingBucket   string
	publishedBucket string
	resumeClient    *http.Client
}

func NewGoogle(ctx context.Context, staging, published string) (*Google, error) {
	if staging == "" || published == "" || staging == published {
		return nil, errors.New("separate private buckets are required")
	}
	client, err := storage.NewClient(ctx)
	if err != nil {
		return nil, err
	}
	resume, _, err := googlehttp.NewClient(ctx, option.WithScopes(storage.ScopeFullControl))
	if err != nil {
		client.Close()
		return nil, err
	}
	resume.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	return &Google{client: client, stagingBucket: staging, publishedBucket: published, resumeClient: resume}, nil
}
func (store *Google) Close() error { return store.client.Close() }

func (store *Google) CreateStaging(ctx context.Context, key Key, source io.Reader, size int64, mime string) (Info, error) {
	if err := key.Validate(); err != nil {
		return Info{}, err
	}
	if err := (Info{
		Generation:  1,
		Size:        size,
		ContentType: mime,
		SHA256:      hex.EncodeToString(make([]byte, 32)),
	}).Validate(); err != nil {
		return Info{}, err
	}
	object := store.client.Bucket(store.stagingBucket).Object(string(key)).If(storage.Conditions{DoesNotExist: true})
	writer := object.NewWriter(ctx)
	writer.ContentType = mime
	writer.ChunkSize = 1024 * 1024
	checksum, crc, err := copyChecked(ctx, writer, source, size)
	if err != nil {
		_ = writer.CloseWithError(err)
		return Info{}, err
	}
	if err := writer.Close(); err != nil {
		return Info{}, err
	}
	attrs := writer.Attrs()
	if attrs == nil || attrs.Generation < 1 || attrs.Size != size || attrs.CRC32C != crc {
		return Info{}, errors.New("storage checksum or byte count did not match")
	}
	info := Info{Generation: attrs.Generation, Size: size, ContentType: mime, SHA256: checksum, CRC32C: crc}
	_, err = store.client.Bucket(store.stagingBucket).Object(string(key)).Generation(attrs.Generation).Update(ctx, storage.ObjectAttrsToUpdate{Metadata: map[string]string{"sha256": checksum}})
	if err != nil {
		// Preserve the confirmed generation so a failed reservation can reconcile it.
		return info, err
	}
	return info, nil
}

func (store *Google) Publish(ctx context.Context, source Key, expected Info, target Key) (Info, error) {
	if err := source.Validate(); err != nil {
		return Info{}, err
	}
	if err := target.Validate(); err != nil {
		return Info{}, err
	}
	if err := expected.Validate(); err != nil {
		return Info{}, err
	}
	from := store.client.Bucket(store.stagingBucket).Object(string(source)).Generation(expected.Generation)
	sourceAttrs, err := from.Attrs(ctx)
	if err != nil {
		return Info{}, err
	}
	if sourceAttrs.Size != expected.Size || sourceAttrs.Metadata["sha256"] != expected.SHA256 {
		return Info{}, ErrGeneration
	}
	to := store.client.Bucket(store.publishedBucket).Object(string(target)).If(storage.Conditions{DoesNotExist: true})
	attrs, err := to.CopierFrom(from).Run(ctx)
	if err != nil {
		return Info{}, err
	}
	if attrs.Generation < 1 || attrs.Size != expected.Size || attrs.CRC32C != sourceAttrs.CRC32C || attrs.Metadata["sha256"] != expected.SHA256 {
		return Info{}, errors.New("published storage metadata did not match")
	}
	expected.Generation = attrs.Generation
	expected.CRC32C = attrs.CRC32C
	return expected, nil
}

func (store *Google) Open(ctx context.Context, key Key, expected Info, published bool) (io.ReadCloser, error) {
	if err := key.Validate(); err != nil {
		return nil, err
	}
	if err := expected.Validate(); err != nil {
		return nil, err
	}
	bucket := store.stagingBucket
	if published {
		bucket = store.publishedBucket
	}
	reader, err := store.client.Bucket(bucket).Object(string(key)).Generation(expected.Generation).NewReader(ctx)
	if errors.Is(err, storage.ErrObjectNotExist) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	if reader.Attrs.Size != expected.Size || reader.Attrs.Generation != expected.Generation {
		_ = reader.Close()
		return nil, ErrGeneration
	}
	return reader, nil
}

func (store *Google) DeleteFailedStaging(ctx context.Context, key Key, generation int64) error {
	if err := key.Validate(); err != nil {
		return err
	}
	if generation < 1 {
		return ErrGeneration
	}
	err := store.client.Bucket(store.stagingBucket).Object(string(key)).If(storage.Conditions{GenerationMatch: generation}).Delete(ctx)
	if errors.Is(err, storage.ErrObjectNotExist) {
		return nil
	}
	return err
}

// Inspect confirms immutable storage metadata for reservation recovery. It
// exposes no object URL and does not grant any business-record permission.
func (store *Google) Inspect(ctx context.Context, key Key, published bool) (Info, error) {
	if err := key.Validate(); err != nil {
		return Info{}, err
	}
	bucket := store.stagingBucket
	if published {
		bucket = store.publishedBucket
	}
	attrs, err := store.client.Bucket(bucket).Object(string(key)).Attrs(ctx)
	if errors.Is(err, storage.ErrObjectNotExist) {
		return Info{}, ErrNotFound
	}
	if err != nil {
		return Info{}, err
	}
	info := Info{
		Generation:  attrs.Generation,
		Size:        attrs.Size,
		ContentType: attrs.ContentType,
		SHA256:      attrs.Metadata["sha256"],
		CRC32C:      attrs.CRC32C,
	}
	if !published && info.SHA256 == "" {
		// A finalized staging writer may have lost its metadata-update reply.
		// Recover only bounded bytes of this exact generation, using the SDK's
		// CRC-checked reader. Never repair or replace a published object.
		probe := info
		probe.SHA256 = hex.EncodeToString(make([]byte, sha256.Size))
		if probe.Validate() != nil {
			return info, ErrGeneration
		}
		object := store.client.Bucket(bucket).Object(string(key)).Generation(info.Generation)
		reader, err := object.NewReader(ctx)
		if err != nil {
			return info, err
		}
		checksum, crc, readErr := copyChecked(ctx, io.Discard, reader, info.Size)
		closeErr := reader.Close()
		if readErr != nil || closeErr != nil || crc != info.CRC32C {
			return info, ErrGeneration
		}
		_, err = object.If(storage.Conditions{MetagenerationMatch: attrs.Metageneration}).Update(ctx, storage.ObjectAttrsToUpdate{Metadata: map[string]string{"sha256": checksum}})
		if err != nil {
			return info, err
		}
		info.SHA256 = checksum
	}
	if err := info.Validate(); err != nil {
		return info, ErrGeneration
	}
	return info, nil
}

func supportedContentType(value string) bool {
	switch value {
	case "application/octet-stream", "image/png", "image/jpeg", "image/webp", "application/pdf", "text/plain", "text/csv", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
		return true
	default:
		return false
	}
}
