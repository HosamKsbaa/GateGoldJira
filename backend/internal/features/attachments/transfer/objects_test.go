package transfer

import (
	"bytes"
	"context"
	"gategoldjira/backend/internal/platform/objectstore"
	"testing"
)

func TestConfirmedTransferRetainsExactGenerationAndRejectsChangedBytes(t *testing.T) {
	store, err := objectstore.NewLocal(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	data := []byte("Immutable upload")
	stage, err := store.CreateStaging(ctx, "assets/original/staging", bytes.NewReader(data), int64(len(data)), "text/plain")
	if err != nil {
		t.Fatal(err)
	}
	plan := Plan{
		StagingKey:        "assets/original/staging",
		StagingGeneration: &stage.Generation,
		PublishedKey:      ptr(objectstore.Key("assets/original/published")),
		Content: Content{
			Size:     stage.Size,
			MIMEType: stage.ContentType,
			Checksum: stage.SHA256,
		},
	}
	confirmed, err := Confirm(ctx, store, plan, data)
	if err != nil || confirmed.Staging.Generation != stage.Generation || confirmed.Published == nil {
		t.Fatal("confirm", confirmed, err)
	}
	plan.PublishedGeneration = &confirmed.Published.Generation
	replay, err := Confirm(ctx, store, plan, data)
	if err != nil || replay.Published.Generation != confirmed.Published.Generation {
		t.Fatal("confirmation changed byte identity", err)
	}
	plan.Content.Checksum = "0000000000000000000000000000000000000000000000000000000000000000"
	if _, err = Confirm(ctx, store, plan, data); err == nil {
		t.Fatal("changed bytes accepted")
	}
}
func TestDraftTransferDoesNotPublishAndChecksReservedGeneration(t *testing.T) {
	store, err := objectstore.NewLocal(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	data := []byte("Private draft")
	info, err := store.CreateStaging(ctx, "assets/draft/staging", bytes.NewReader(data), int64(len(data)), "text/plain")
	if err != nil {
		t.Fatal(err)
	}
	plan := Plan{
		StagingKey: "assets/draft/staging",
		Content: Content{
			Size:     info.Size,
			MIMEType: info.ContentType,
			Checksum: info.SHA256,
		},
	}
	confirmed, err := Confirm(ctx, store, plan, data)
	if err != nil || confirmed.Published != nil {
		t.Fatal("private draft was published", err)
	}
	changed := info.Generation + 1
	plan.StagingGeneration = &changed
	if _, err = Confirm(ctx, store, plan, data); err == nil {
		t.Fatal("replacement generation accepted")
	}
}
func ptr[T any](value T) *T { return &value }
