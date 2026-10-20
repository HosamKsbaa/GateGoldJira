package objectstore

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

type localBoundaryReader struct {
	reader io.Reader
	bytes  int
}

func (reader *localBoundaryReader) Read(data []byte) (int, error) {
	n, err := reader.reader.Read(data)
	reader.bytes += n
	return n, err
}

type localBoundaryFailureReader struct{ failure error }

func (reader localBoundaryFailureReader) Read([]byte) (int, error) { return 0, reader.failure }

func localBoundaryStore(t *testing.T) (*Local, string) {
	t.Helper()
	root := t.TempDir()
	store, err := NewLocal(root)
	if err != nil {
		t.Fatal(err)
	}
	return store, root
}

func localBoundaryCreate(t *testing.T, store *Local, key Key, data []byte) Info {
	t.Helper()
	info, err := store.CreateStaging(context.Background(), key, bytes.NewReader(data), int64(len(data)), "application/octet-stream")
	if err != nil {
		t.Fatal(err)
	}
	return info
}

func TestLocalBoundaryConstructorRefusesUnusableStorage(t *testing.T) {
	if store, err := NewLocal(""); store != nil || err == nil {
		t.Fatal("empty storage root was accepted")
	}
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "staging"), []byte("ordinary-file"), 0600); err != nil {
		t.Fatal(err)
	}
	if store, err := NewLocal(root); store != nil || err == nil {
		t.Fatal("a staging path that is a regular file was accepted")
	}
}

func TestLocalBoundaryFailedTransfersLeaveNoObjectOrConsumedGeneration(t *testing.T) {
	sentinel := errors.New("owned-source-read-failure")
	for _, test := range []struct {
		name   string
		size   int64
		mime   string
		source func() io.Reader
		ctx    func() context.Context
		want   error
	}{
		{"zero-size", 0, "application/octet-stream", func() io.Reader { return bytes.NewReader([]byte("data")) }, context.Background, nil},
		{"size-limit", MaximumResumableSize + 1, "application/octet-stream", func() io.Reader { return bytes.NewReader([]byte("data")) }, context.Background, nil},
		{"short-source", 4, "application/octet-stream", func() io.Reader { return bytes.NewReader([]byte("abc")) }, context.Background, nil},
		{"surplus-source", 4, "application/octet-stream", func() io.Reader { return bytes.NewReader(bytes.Repeat([]byte("x"), 100)) }, context.Background, nil},
		{"source-error", 4, "application/octet-stream", func() io.Reader {
			return io.MultiReader(bytes.NewReader([]byte("ab")), localBoundaryFailureReader{sentinel})
		}, context.Background, sentinel},
		{"unsupported-type", 4, "application/x-executable", func() io.Reader { return bytes.NewReader([]byte("data")) }, context.Background, nil},
		{"cancelled", 4, "application/octet-stream", func() io.Reader { return bytes.NewReader([]byte("data")) }, func() context.Context {
			ctx, cancel := context.WithCancel(context.Background())
			cancel()
			return ctx
		}, context.Canceled},
	} {
		t.Run(test.name, func(t *testing.T) {
			store, root := localBoundaryStore(t)
			source := &localBoundaryReader{reader: test.source()}
			info, err := store.CreateStaging(test.ctx(), "uploads/failed", source, test.size, test.mime)
			if err == nil || info != (Info{}) {
				t.Fatal("a failed transfer returned confirmed object metadata")
			}
			if test.want != nil && !errors.Is(err, test.want) {
				t.Fatal("the actual source/cancellation error was lost")
			}
			if test.name == "surplus-source" && source.bytes != 5 {
				t.Fatal("declared-size rejection read beyond the one-byte overrun bound")
			}
			if (test.name == "zero-size" || test.name == "size-limit" || test.name == "cancelled") && source.bytes != 0 {
				t.Fatal("invalid or cancelled transfer consumed source bytes")
			}
			if _, err := store.Inspect(context.Background(), "uploads/failed", false); !errors.Is(err, ErrNotFound) {
				t.Fatal("a failed transfer published staging metadata")
			}
			files, err := os.ReadDir(filepath.Join(root, "staging"))
			if err != nil || len(files) != 0 {
				t.Fatal("a failed transfer left an upload temporary or confirmed file")
			}
			retried := localBoundaryCreate(t, store, "uploads/failed", []byte("data"))
			if retried.Generation != 1 {
				t.Fatal("failed transfer consumed an immutable object generation")
			}
		})
	}
}

func TestLocalBoundaryInvalidKeysCannotReadWritePublishOrDelete(t *testing.T) {
	for _, key := range []Key{"", "../outside", "uploads/../../outside", "/absolute", "UPPER", Key(strings.Repeat("a", 251))} {
		t.Run(string(key), func(t *testing.T) {
			store, _ := localBoundaryStore(t)
			valid := localBoundaryCreate(t, store, "uploads/valid", []byte("data"))
			ctx := context.Background()
			if _, err := store.CreateStaging(ctx, key, bytes.NewReader([]byte("data")), 4, "application/octet-stream"); err == nil {
				t.Fatal("invalid key created an object")
			}
			if reader, err := store.Open(ctx, key, valid, false); err == nil || reader != nil {
				t.Fatal("invalid key opened object bytes")
			}
			if _, err := store.Inspect(ctx, key, false); err == nil {
				t.Fatal("invalid key exposed metadata")
			}
			if err := store.DeleteFailedStaging(ctx, key, valid.Generation); err == nil {
				t.Fatal("invalid key reached cleanup")
			}
			if _, err := store.Publish(ctx, key, valid, "published/target"); err == nil {
				t.Fatal("invalid source key published content")
			}
			if _, err := store.Publish(ctx, "uploads/valid", valid, key); err == nil {
				t.Fatal("invalid target key published content")
			}
			if actual, err := store.Inspect(ctx, "uploads/valid", false); err != nil || actual != valid {
				t.Fatal("invalid-key operations changed the valid object")
			}
		})
	}
}

func TestLocalBoundaryCorruptedMetadataFailsClosedAndIsNotRewritten(t *testing.T) {
	for _, test := range []struct {
		name string
		data func(localRecord) []byte
	}{
		{"invalid-json", func(localRecord) []byte { return []byte("{") }},
		{"invalid-generation", func(record localRecord) []byte {
			record.Info.Generation = 0
			data, _ := json.Marshal(record)
			return data
		}},
		{"invalid-size", func(record localRecord) []byte { record.Info.Size = -1; data, _ := json.Marshal(record); return data }},
		{"invalid-checksum", func(record localRecord) []byte {
			record.Info.SHA256 = "not-a-checksum"
			data, _ := json.Marshal(record)
			return data
		}},
		{"invalid-content-type", func(record localRecord) []byte {
			record.Info.ContentType = "application/x-executable"
			data, _ := json.Marshal(record)
			return data
		}},
	} {
		t.Run(test.name, func(t *testing.T) {
			store, _ := localBoundaryStore(t)
			info := localBoundaryCreate(t, store, "uploads/metadata", []byte("data"))
			_, metadata := store.paths("uploads/metadata", false)
			corrupt := test.data(localRecord{Info: info, Exists: true})
			if err := os.WriteFile(metadata, corrupt, 0600); err != nil {
				t.Fatal(err)
			}
			ctx := context.Background()
			if _, err := store.Inspect(ctx, "uploads/metadata", false); err == nil {
				t.Fatal("corrupt metadata was inspected successfully")
			}
			if reader, err := store.Open(ctx, "uploads/metadata", info, false); err == nil || reader != nil {
				t.Fatal("corrupt metadata authorized reading bytes")
			}
			if _, err := store.Publish(ctx, "uploads/metadata", info, "published/metadata"); err == nil {
				t.Fatal("corrupt metadata authorized publication")
			}
			if err := store.DeleteFailedStaging(ctx, "uploads/metadata", info.Generation); err == nil {
				t.Fatal("corrupt metadata authorized cleanup")
			}
			if _, err := store.CreateStaging(ctx, "uploads/metadata", bytes.NewReader([]byte("data")), 4, "application/octet-stream"); err == nil {
				t.Fatal("create overwrote an unreadable record")
			}
			after, err := os.ReadFile(metadata)
			if err != nil || !bytes.Equal(corrupt, after) {
				t.Fatal("a rejected operation rewrote corrupted metadata")
			}
		})
	}
}

func TestLocalBoundaryExactObjectIdentityFencesOpenAndPublication(t *testing.T) {
	for _, test := range []struct {
		name   string
		change func(*Info)
	}{
		{"generation", func(info *Info) { info.Generation++ }},
		{"size", func(info *Info) { info.Size++ }},
		{"content-type", func(info *Info) { info.ContentType = "text/plain" }},
		{"sha256", func(info *Info) { info.SHA256 = strings.Repeat("0", 64) }},
	} {
		t.Run(test.name, func(t *testing.T) {
			store, _ := localBoundaryStore(t)
			info := localBoundaryCreate(t, store, "uploads/exact", []byte("data"))
			expected := info
			test.change(&expected)
			ctx := context.Background()
			if reader, err := store.Open(ctx, "uploads/exact", expected, false); !errors.Is(err, ErrGeneration) || reader != nil {
				t.Fatal("stale or different object metadata opened bytes")
			}
			if _, err := store.Publish(ctx, "uploads/exact", expected, "published/exact"); !errors.Is(err, ErrGeneration) {
				t.Fatal("stale or different object metadata published bytes")
			}
			if _, err := store.Inspect(ctx, "published/exact", true); !errors.Is(err, ErrNotFound) {
				t.Fatal("a generation rejection created a published target")
			}
			if actual, err := store.Inspect(ctx, "uploads/exact", false); err != nil || actual != info {
				t.Fatal("a rejected metadata fence changed its source")
			}
		})
	}
}

func TestLocalBoundaryPublishedTargetStaysImmutableAndSeparateFromStaging(t *testing.T) {
	store, _ := localBoundaryStore(t)
	ctx := context.Background()
	original := localBoundaryCreate(t, store, "uploads/one", []byte("one!"))
	published, err := store.Publish(ctx, "uploads/one", original, "objects/shared")
	if err != nil {
		t.Fatal(err)
	}
	other := localBoundaryCreate(t, store, "uploads/two", []byte("two!"))
	if _, err := store.Publish(ctx, "uploads/two", other, "objects/shared"); !errors.Is(err, ErrExists) {
		t.Fatal("publication overwrote an immutable target")
	}
	if _, err := store.Inspect(ctx, "objects/shared", false); !errors.Is(err, ErrNotFound) {
		t.Fatal("published namespace leaked into staging")
	}
	reader, err := store.Open(ctx, "objects/shared", published, true)
	if err != nil {
		t.Fatal(err)
	}
	defer reader.Close()
	got, err := io.ReadAll(reader)
	if err != nil || string(got) != "one!" {
		t.Fatal("failed replacement changed published bytes")
	}
}

func TestLocalBoundaryCancelledReadInspectAndCleanupLeaveObjectUnchanged(t *testing.T) {
	store, _ := localBoundaryStore(t)
	info := localBoundaryCreate(t, store, "uploads/cancelled", []byte("data"))
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if reader, err := store.Open(ctx, "uploads/cancelled", info, false); !errors.Is(err, context.Canceled) || reader != nil {
		t.Fatal("cancelled read was admitted")
	}
	if _, err := store.Inspect(ctx, "uploads/cancelled", false); !errors.Is(err, context.Canceled) {
		t.Fatal("cancelled inspection was admitted")
	}
	if err := store.DeleteFailedStaging(ctx, "uploads/cancelled", info.Generation); !errors.Is(err, context.Canceled) {
		t.Fatal("cancelled cleanup was admitted")
	}
	if actual, err := store.Inspect(context.Background(), "uploads/cancelled", false); err != nil || actual != info {
		t.Fatal("cancelled cleanup changed the object")
	}
}

func TestLocalBoundaryMissingBytesCleanupRetainsGenerationTombstoneAcrossRestart(t *testing.T) {
	store, root := localBoundaryStore(t)
	ctx := context.Background()
	key := Key("uploads/missing")
	info := localBoundaryCreate(t, store, key, []byte("data"))
	data, _ := store.paths(key, false)
	if err := os.Remove(data); err != nil {
		t.Fatal(err)
	}
	if _, err := store.Open(ctx, key, info, false); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("missing content did not return its filesystem absence error")
	}
	if _, err := store.Publish(ctx, key, info, "published/missing"); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("missing content was published")
	}
	if err := store.DeleteFailedStaging(ctx, key, info.Generation); err != nil {
		t.Fatal("confirmed missing bytes could not be reconciled", err)
	}
	if err := store.DeleteFailedStaging(ctx, key, info.Generation); err != nil {
		t.Fatal("repeated confirmed cleanup was not idempotent")
	}
	restarted, err := NewLocal(root)
	if err != nil {
		t.Fatal(err)
	}
	next := localBoundaryCreate(t, restarted, key, []byte("next"))
	if next.Generation != info.Generation+1 {
		t.Fatal("missing-data reconciliation lost its persistent generation tombstone")
	}
	if err := restarted.DeleteFailedStaging(ctx, key, info.Generation); !errors.Is(err, ErrGeneration) {
		t.Fatal("old cleanup deleted the new generation")
	}
}

func TestLocalBoundaryConcurrentSameKeyCreationHasOneImmutableWinner(t *testing.T) {
	store, _ := localBoundaryStore(t)
	const jobs = 8
	start, failures := make(chan struct{}), make(chan error, jobs)
	var group sync.WaitGroup
	for range jobs {
		group.Add(1)
		go func() {
			defer group.Done()
			<-start
			_, err := store.CreateStaging(context.Background(), "uploads/race", bytes.NewReader([]byte("data")), 4, "application/octet-stream")
			failures <- err
		}()
	}
	close(start)
	group.Wait()
	close(failures)
	winners := 0
	for err := range failures {
		if err == nil {
			winners++
		} else if !errors.Is(err, ErrExists) {
			t.Fatal("concurrent immutable create returned an unrelated error", err)
		}
	}
	if winners != 1 {
		t.Fatal("same-key concurrent creates did not have exactly one winner")
	}
	info, err := store.Inspect(context.Background(), "uploads/race", false)
	if err != nil || info.Generation != 1 {
		t.Fatal("concurrent losers changed the retained generation")
	}
}
