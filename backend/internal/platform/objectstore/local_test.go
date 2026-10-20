package objectstore

import (
	"bytes"
	"context"
	"errors"
	"io"
	"testing"
)

func TestPersistentImmutableGenerationsAndTransferLimit(t *testing.T) {
	ctx := context.Background()
	directory := t.TempDir()
	store, err := NewLocal(directory)
	if err != nil {
		t.Fatal(err)
	}
	data := []byte("private-picture-content")
	info, err := store.CreateStaging(ctx, "staging/picture", bytes.NewReader(data), int64(len(data)), "image/png")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.CreateStaging(ctx, "staging/picture", bytes.NewReader(data), int64(len(data)), "image/png"); !errors.Is(err, ErrExists) {
		t.Fatal("immutable object overwritten", err)
	}
	published, err := store.Publish(ctx, "staging/picture", info, "published/picture")
	if err != nil {
		t.Fatal(err)
	}
	store, err = NewLocal(directory)
	if err != nil {
		t.Fatal(err)
	}
	reader, err := store.Open(ctx, "published/picture", published, true)
	if err != nil {
		t.Fatal(err)
	}
	got, err := io.ReadAll(reader)
	_ = reader.Close()
	if err != nil || !bytes.Equal(got, data) {
		t.Fatal("restart lost picture")
	}
	if err := store.DeleteFailedStaging(ctx, "staging/picture", info.Generation+1); !errors.Is(err, ErrGeneration) {
		t.Fatal("cleanup deleted an unmatched generation")
	}
	if err := store.DeleteFailedStaging(ctx, "staging/picture", info.Generation); err != nil {
		t.Fatal(err)
	}
	newInfo, err := store.CreateStaging(ctx, "staging/picture", bytes.NewReader(data), int64(len(data)), "image/png")
	if err != nil || newInfo.Generation <= info.Generation {
		t.Fatal("generation reset after cleanup")
	}
	if err := store.DeleteFailedStaging(ctx, "staging/picture", info.Generation); !errors.Is(err, ErrGeneration) {
		t.Fatal("old cleanup affected a new object")
	}
	if _, err := store.CreateStaging(ctx, "../../outside", bytes.NewReader(data), int64(len(data)), "image/png"); err == nil {
		t.Fatal("unsafe object key accepted")
	}
	if _, err := store.CreateStaging(ctx, "short", bytes.NewReader(data), 1, "image/png"); err == nil {
		t.Fatal("declared size mismatch accepted")
	}
	gate := NewTransferGate()
	one, err := gate.Acquire(ctx)
	if err != nil {
		t.Fatal(err)
	}
	two, err := gate.Acquire(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := gate.Acquire(ctx); !errors.Is(err, ErrBusy) {
		t.Fatal("more than two transfers admitted")
	}
	one()
	one()
	two()
	release, err := gate.Acquire(ctx)
	if err != nil {
		t.Fatal("slot was not released")
	}
	release()
}
