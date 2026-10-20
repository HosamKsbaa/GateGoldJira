// Package transfer owns byte confirmation shared by image and file adapters.
// It has no database connection and runs outside business transactions.
package transfer

import (
	"bytes"
	"context"
	"errors"
	"gategoldjira/backend/internal/platform/objectstore"
)

var ErrContent = errors.New("reserved object content or generation differs")

type Content struct {
	Size     int64
	MIMEType string
	Checksum string
}
type Plan struct {
	StagingKey          objectstore.Key
	StagingGeneration   *int64
	PublishedKey        *objectstore.Key
	PublishedGeneration *int64
	Content             Content
}
type Confirmed struct {
	Staging   objectstore.Info
	Published *objectstore.Info
}

func Matches(info objectstore.Info, content Content) bool {
	return info.Validate() == nil && info.Size == content.Size && info.ContentType == content.MIMEType && info.SHA256 == content.Checksum
}
func Confirm(ctx context.Context, store objectstore.Store, plan Plan, data []byte) (Confirmed, error) {
	result := Confirmed{}
	if err := plan.StagingKey.Validate(); err != nil {
		return result, err
	}
	info, err := store.Inspect(ctx, plan.StagingKey, false)
	if errors.Is(err, objectstore.ErrNotFound) {
		info, err = store.CreateStaging(ctx, plan.StagingKey, bytes.NewReader(data), plan.Content.Size, plan.Content.MIMEType)
	}
	result.Staging = info
	if err != nil {
		return result, err
	}
	if !Matches(info, plan.Content) || (plan.StagingGeneration != nil && info.Generation != *plan.StagingGeneration) {
		return result, ErrContent
	}
	if plan.PublishedKey == nil {
		return result, nil
	}
	if err = plan.PublishedKey.Validate(); err != nil {
		return result, err
	}
	published, err := store.Inspect(ctx, *plan.PublishedKey, true)
	if errors.Is(err, objectstore.ErrNotFound) {
		published, err = store.Publish(ctx, plan.StagingKey, info, *plan.PublishedKey)
	}
	if err != nil {
		return result, err
	}
	if !Matches(published, plan.Content) || (plan.PublishedGeneration != nil && published.Generation != *plan.PublishedGeneration) {
		return result, ErrContent
	}
	result.Published = &published
	return result, nil
}
