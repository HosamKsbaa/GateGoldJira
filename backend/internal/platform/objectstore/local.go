package objectstore

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
	"sync"
)

// Local uses a persistent flat directory and retained generation tombstones.
// One local backend owns a directory; Cloud Run rejects this adapter.
type Local struct {
	root  string
	mutex sync.Mutex
}
type localRecord struct {
	Info        Info     `json:"info"`
	Exists      bool     `json:"exists"`
	ChunkHashes []string `json:"chunkHashes,omitempty"`
}

func NewLocal(directory string) (*Local, error) {
	if directory == "" {
		return nil, errors.New("persistent local object directory is required")
	}
	root, err := filepath.Abs(directory)
	if err != nil {
		return nil, err
	}
	for _, kind := range []string{"staging", "published"} {
		if err := os.MkdirAll(filepath.Join(root, kind), 0700); err != nil {
			return nil, err
		}
	}
	return &Local{root: root}, nil
}
func (store *Local) paths(key Key, published bool) (string, string) {
	kind := "staging"
	if published {
		kind = "published"
	}
	hash := sha256.Sum256([]byte(key))
	base := filepath.Join(store.root, kind, hex.EncodeToString(hash[:]))
	return base + ".data", base + ".json"
}
func readRecord(path string) (localRecord, error) {
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return localRecord{}, nil
	}
	if err != nil {
		return localRecord{}, err
	}
	var record localRecord
	if err := json.Unmarshal(data, &record); err != nil {
		return localRecord{}, err
	}
	if err := record.Info.Validate(); err != nil {
		return localRecord{}, err
	}
	return record, nil
}
func saveRecord(path string, record localRecord) error {
	data, err := json.Marshal(record)
	if err != nil {
		return err
	}
	file, err := os.CreateTemp(filepath.Dir(path), ".metadata-")
	if err != nil {
		return err
	}
	defer os.Remove(file.Name())
	if _, err := file.Write(data); err != nil {
		_ = file.Close()
		return err
	}
	if err := file.Sync(); err != nil {
		_ = file.Close()
		return err
	}
	if err := file.Close(); err != nil {
		return err
	}
	return os.Rename(file.Name(), path)
}
func (store *Local) create(ctx context.Context, key Key, source io.Reader, size int64, mime string, published bool) (Info, error) {
	if err := key.Validate(); err != nil {
		return Info{}, err
	}
	dataPath, recordPath := store.paths(key, published)
	old, err := readRecord(recordPath)
	if err != nil {
		return Info{}, err
	}
	if old.Exists {
		return Info{}, ErrExists
	}
	file, err := os.CreateTemp(filepath.Dir(dataPath), ".upload-")
	if err != nil {
		return Info{}, err
	}
	defer os.Remove(file.Name())
	checksum, crc, err := copyChecked(ctx, file, source, size)
	if err != nil {
		_ = file.Close()
		return Info{}, err
	}
	info := Info{Generation: old.Info.Generation + 1, Size: size, ContentType: mime, SHA256: checksum, CRC32C: crc}
	if err := info.Validate(); err != nil {
		_ = file.Close()
		return Info{}, err
	}
	if err := file.Sync(); err != nil {
		_ = file.Close()
		return Info{}, err
	}
	if err := file.Close(); err != nil {
		return Info{}, err
	}
	if err := os.Rename(file.Name(), dataPath); err != nil {
		return Info{}, err
	}
	if err := saveRecord(recordPath, localRecord{Info: info, Exists: true}); err != nil {
		return Info{}, err
	}
	return info, nil
}
func (store *Local) CreateStaging(ctx context.Context, key Key, source io.Reader, size int64, mime string) (Info, error) {
	store.mutex.Lock()
	defer store.mutex.Unlock()
	return store.create(ctx, key, source, size, mime, false)
}
func (store *Local) Publish(ctx context.Context, source Key, expected Info, target Key) (Info, error) {
	store.mutex.Lock()
	defer store.mutex.Unlock()
	if err := source.Validate(); err != nil {
		return Info{}, err
	}
	dataPath, recordPath := store.paths(source, false)
	record, err := readRecord(recordPath)
	if err != nil {
		return Info{}, err
	}
	if !record.Exists {
		return Info{}, ErrNotFound
	}
	if !sameObject(record.Info, expected) {
		return Info{}, ErrGeneration
	}
	file, err := os.Open(dataPath)
	if err != nil {
		return Info{}, err
	}
	defer file.Close()
	info, err := store.create(ctx, target, file, expected.Size, expected.ContentType, true)
	if err != nil {
		return Info{}, err
	}
	if info.SHA256 != expected.SHA256 || info.CRC32C != record.Info.CRC32C {
		return Info{}, errors.New("local copy checksum differs")
	}
	return info, nil
}
func (store *Local) Open(ctx context.Context, key Key, expected Info, published bool) (io.ReadCloser, error) {
	store.mutex.Lock()
	defer store.mutex.Unlock()
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if err := key.Validate(); err != nil {
		return nil, err
	}
	dataPath, recordPath := store.paths(key, published)
	record, err := readRecord(recordPath)
	if err != nil {
		return nil, err
	}
	if !record.Exists {
		return nil, ErrNotFound
	}
	if !sameObject(record.Info, expected) {
		return nil, ErrGeneration
	}
	return os.Open(dataPath)
}
func (store *Local) DeleteFailedStaging(ctx context.Context, key Key, generation int64) error {
	store.mutex.Lock()
	defer store.mutex.Unlock()
	if err := ctx.Err(); err != nil {
		return err
	}
	if err := key.Validate(); err != nil {
		return err
	}
	dataPath, recordPath := store.paths(key, false)
	record, err := readRecord(recordPath)
	if err != nil {
		return err
	}
	if !record.Exists {
		return nil
	}
	if record.Info.Generation != generation {
		return ErrGeneration
	}
	// Persist the tombstone before deletion so restarts never reset generations.
	record.Exists = false
	if err := saveRecord(recordPath, record); err != nil {
		return err
	}
	err = os.Remove(dataPath)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	return err
}

func (store *Local) Inspect(ctx context.Context, key Key, published bool) (Info, error) {
	store.mutex.Lock()
	defer store.mutex.Unlock()
	if err := ctx.Err(); err != nil {
		return Info{}, err
	}
	if err := key.Validate(); err != nil {
		return Info{}, err
	}
	_, recordPath := store.paths(key, published)
	record, err := readRecord(recordPath)
	if err != nil {
		return Info{}, err
	}
	if !record.Exists {
		return Info{}, ErrNotFound
	}
	return record.Info, nil
}
