package objectstore

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"io"
	"os"
	"testing"
)

func TestResumableRestartLostAcknowledgementRangeAndCorruption(t *testing.T) {
	ctx := context.Background()
	root := t.TempDir()
	s, _ := NewLocal(root)
	data := bytes.Repeat([]byte{0x41}, int(ChunkSize+1))
	hash := sha256.Sum256(data)
	spec := ResumeSpec{
		Key:         "uploads/resume",
		Size:        int64(len(data)),
		ContentType: "application/octet-stream",
		SHA256:      hex.EncodeToString(hash[:]),
	}
	cap, err := s.BeginResume(ctx, spec)
	if err != nil {
		t.Fatal(err)
	}
	n, err := s.AppendResume(ctx, cap, spec, 0, data[:ChunkSize])
	if err != nil || n != ChunkSize {
		t.Fatal(n, err)
	}
	s, _ = NewLocal(root)
	n, err = s.AppendResume(ctx, cap, spec, 0, data[:ChunkSize])
	if err != nil || n != ChunkSize {
		t.Fatal("lost ack", n, err)
	}
	bad := bytes.Repeat([]byte{0x42}, int(ChunkSize))
	if _, err = s.AppendResume(ctx, cap, spec, 0, bad); err == nil {
		t.Fatal("different replay accepted")
	}
	if _, err = s.FinishResume(ctx, cap, spec); err == nil {
		t.Fatal("partial finalized")
	}
	if _, err = s.AppendResume(ctx, cap, spec, ChunkSize, data[ChunkSize:]); err != nil {
		t.Fatal(err)
	}
	info, err := s.FinishResume(ctx, cap, spec)
	if err != nil {
		t.Fatal(err)
	}
	replay, err := s.FinishResume(ctx, cap, spec)
	if err != nil || replay != info {
		t.Fatal("final replay", err)
	}
	reader, err := s.OpenRange(ctx, spec.Key, info, false, ChunkSize-1, 2)
	if err != nil {
		t.Fatal(err)
	}
	got, _ := io.ReadAll(reader)
	reader.Close()
	if !bytes.Equal(got, data[ChunkSize-1:]) {
		t.Fatal("range differs")
	}
	path, _ := s.paths(spec.Key, false)
	f, _ := os.OpenFile(path, os.O_WRONLY, 0600)
	f.WriteAt([]byte{0}, ChunkSize)
	f.Close()
	if _, err = s.OpenRange(ctx, spec.Key, info, false, ChunkSize, 1); err == nil {
		t.Fatal("corrupt chunk returned")
	}
	other := spec
	other.Key = "uploads/canceled"
	cap, err = s.BeginResume(ctx, other)
	if err != nil {
		t.Fatal(err)
	}
	if err = s.CancelResume(ctx, cap, other); err != nil {
		t.Fatal(err)
	}
	if _, err = s.AppendResume(ctx, cap, other, 0, data[:ChunkSize]); err == nil {
		t.Fatal("canceled partial survived")
	}
}
