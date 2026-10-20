package objectstore

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"os"
)

const MaximumResumableSize int64 = 100 * 1024 * 1024
const ChunkSize int64 = 1024 * 1024

type ResumeSpec struct {
	Key         Key
	Size        int64
	ContentType string
	SHA256      string
}

func (s ResumeSpec) Validate() error {
	if err := s.Key.Validate(); err != nil {
		return err
	}
	return (Info{Generation: 1, Size: s.Size, ContentType: s.ContentType, SHA256: s.SHA256}).Validate()
}

// Capabilities never cross the object-store boundary into public responses.
type ResumableStore interface {
	BeginResume(context.Context, ResumeSpec) (string, error)
	AppendResume(context.Context, string, ResumeSpec, int64, []byte) (int64, error)
	FinishResume(context.Context, string, ResumeSpec) (Info, error)
	CancelResume(context.Context, string, ResumeSpec) error
}
type RangeStore interface {
	OpenRange(context.Context, Key, Info, bool, int64, int64) (io.ReadCloser, error)
}

type partialRecord struct {
	Size        int64
	ContentType string
	SHA256      string
}

func (s *Local) partialPaths(spec ResumeSpec) (string, string) {
	data, meta := s.paths(spec.Key, false)
	return data + ".partial", meta + ".partial"
}
func localCapability(spec ResumeSpec, cap string) error {
	if cap != "local:"+string(spec.Key) {
		return ErrGeneration
	}
	return spec.Validate()
}
func (s *Local) BeginResume(ctx context.Context, spec ResumeSpec) (string, error) {
	if err := spec.Validate(); err != nil {
		return "", err
	}
	if err := ctx.Err(); err != nil {
		return "", err
	}
	s.mutex.Lock()
	defer s.mutex.Unlock()
	data, meta := s.partialPaths(spec)
	record := partialRecord{spec.Size, spec.ContentType, spec.SHA256}
	if b, err := os.ReadFile(meta); err == nil {
		var old partialRecord
		if json.Unmarshal(b, &old) != nil || old != record {
			return "", ErrGeneration
		}
		return "local:" + string(spec.Key), nil
	} else if !errors.Is(err, os.ErrNotExist) {
		return "", err
	}
	f, err := os.OpenFile(data, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil && !errors.Is(err, os.ErrExist) {
		return "", err
	}
	if f != nil {
		f.Close()
	}
	b, _ := json.Marshal(record)
	if err = os.WriteFile(meta, b, 0600); err != nil {
		return "", err
	}
	return "local:" + string(spec.Key), nil
}
func (s *Local) AppendResume(ctx context.Context, cap string, spec ResumeSpec, offset int64, data []byte) (int64, error) {
	if err := localCapability(spec, cap); err != nil {
		return 0, err
	}
	if offset < 0 || len(data) < 1 || int64(len(data)) > ChunkSize || offset+int64(len(data)) > spec.Size || (offset+int64(len(data)) < spec.Size && int64(len(data))%(256*1024) != 0) {
		return 0, ErrGeneration
	}
	s.mutex.Lock()
	defer s.mutex.Unlock()
	if err := ctx.Err(); err != nil {
		return 0, err
	}
	path, _ := s.partialPaths(spec)
	f, err := os.OpenFile(path, os.O_RDWR, 0600)
	if err != nil {
		return 0, err
	}
	defer f.Close()
	st, err := f.Stat()
	if err != nil {
		return 0, err
	}
	if st.Size() > offset {
		if st.Size() != offset+int64(len(data)) {
			return 0, ErrGeneration
		}
		prior := make([]byte, len(data))
		if _, err = f.ReadAt(prior, offset); err != nil {
			return 0, err
		}
		a, b := sha256.Sum256(prior), sha256.Sum256(data)
		if a != b {
			return 0, ErrGeneration
		}
		return st.Size(), nil
	}
	if st.Size() != offset {
		return 0, ErrGeneration
	}
	if _, err = f.WriteAt(data, offset); err != nil {
		return 0, err
	}
	if err = f.Sync(); err != nil {
		return 0, err
	}
	return offset + int64(len(data)), nil
}
func (s *Local) FinishResume(ctx context.Context, cap string, spec ResumeSpec) (Info, error) {
	if err := localCapability(spec, cap); err != nil {
		return Info{}, err
	}
	s.mutex.Lock()
	defer s.mutex.Unlock()
	_, meta := s.paths(spec.Key, false)
	prior, err := readRecord(meta)
	if err != nil {
		return Info{}, err
	}
	if prior.Exists {
		if prior.Info.Size != spec.Size || prior.Info.SHA256 != spec.SHA256 {
			return Info{}, ErrGeneration
		}
		return prior.Info, nil
	}
	path, _ := s.partialPaths(spec)
	f, err := os.Open(path)
	if err != nil {
		return Info{}, err
	}
	defer f.Close()
	hash := sha256.New()
	if n, err := io.Copy(hash, io.LimitReader(contextReader{ctx, f}, spec.Size+1)); err != nil || n != spec.Size || hex.EncodeToString(hash.Sum(nil)) != spec.SHA256 {
		return Info{}, ErrGeneration
	}
	if _, err = f.Seek(0, io.SeekStart); err != nil {
		return Info{}, err
	}
	info, err := s.create(ctx, spec.Key, f, spec.Size, spec.ContentType, false)
	if err != nil {
		return info, err
	}
	data, meta := s.partialPaths(spec)
	_ = os.Remove(data)
	_ = os.Remove(meta)
	return info, nil
}
func (s *Local) CancelResume(ctx context.Context, cap string, spec ResumeSpec) error {
	if err := localCapability(spec, cap); err != nil {
		return err
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	s.mutex.Lock()
	defer s.mutex.Unlock()
	data, meta := s.partialPaths(spec)
	for _, path := range []string{data, meta} {
		if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
			return err
		}
	}
	return nil
}

// Range checksums keep chunk downloads linear in requested bytes. Older local
// objects receive an authenticated manifest only after their whole SHA matches.
func (s *Local) OpenRange(ctx context.Context, key Key, expected Info, published bool, offset, count int64) (io.ReadCloser, error) {
	s.mutex.Lock()
	defer s.mutex.Unlock()
	if key.Validate() != nil || expected.Validate() != nil || offset < 0 || count < 0 || offset+count > expected.Size {
		return nil, ErrGeneration
	}
	path, meta := s.paths(key, published)
	record, err := readRecord(meta)
	if err != nil {
		return nil, err
	}
	if !record.Exists {
		return nil, ErrNotFound
	}
	if !sameObject(record.Info, expected) {
		return nil, ErrGeneration
	}
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	if len(record.ChunkHashes) == 0 {
		hashes, checksum, err := chunkManifest(ctx, f, expected.Size)
		if err != nil || checksum != expected.SHA256 {
			return nil, ErrGeneration
		}
		record.ChunkHashes = hashes
		if err = saveRecord(meta, record); err != nil {
			return nil, err
		}
	}
	result := make([]byte, count)
	for start := offset / ChunkSize; count > 0 && start <= (offset+count-1)/ChunkSize; start++ {
		length := min(ChunkSize, expected.Size-start*ChunkSize)
		chunk := make([]byte, length)
		if _, err = f.ReadAt(chunk, start*ChunkSize); err != nil {
			return nil, err
		}
		hash := sha256.Sum256(chunk)
		if int(start) >= len(record.ChunkHashes) || hex.EncodeToString(hash[:]) != record.ChunkHashes[start] {
			return nil, ErrGeneration
		}
		left, right := max(offset, start*ChunkSize), min(offset+count, start*ChunkSize+length)
		copy(result[left-offset:right-offset], chunk[left-start*ChunkSize:right-start*ChunkSize])
	}
	return io.NopCloser(bytes.NewReader(result)), nil
}
func chunkManifest(ctx context.Context, f *os.File, size int64) ([]string, string, error) {
	if _, err := f.Seek(0, io.SeekStart); err != nil {
		return nil, "", err
	}
	whole := sha256.New()
	hashes := []string{}
	for offset := int64(0); offset < size; offset += ChunkSize {
		data := make([]byte, min(ChunkSize, size-offset))
		if _, err := io.ReadFull(contextReader{ctx, f}, data); err != nil {
			return nil, "", err
		}
		whole.Write(data)
		hash := sha256.Sum256(data)
		hashes = append(hashes, hex.EncodeToString(hash[:]))
	}
	extra := make([]byte, 1)
	if n, _ := f.Read(extra); n != 0 {
		return nil, "", ErrGeneration
	}
	return hashes, hex.EncodeToString(whole.Sum(nil)), nil
}
