package pictures

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"gategoldjira/backend/internal/features/attachments"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"gategoldjira/backend/internal/platform/objectstore"
	"github.com/jackc/pgx/v5/pgtype"
	"time"
)

func timestamp(value time.Time) pgtype.Timestamptz {
	return pgtype.Timestamptz{Time: value, Valid: true}
}

type uploadCommand struct {
	IssueID  command.IssueID `json:"issueId"`
	Metadata UploadMetadata  `json:"metadata"`
	ByteSize int32           `json:"byteSize"`
	Checksum string          `json:"checksum"`
}

func (s *Service) Upload(ctx context.Context, actor command.Actor, in UploadInput) (command.SaveOutcome[PictureView], error) {
	metadata, err := normalizeMetadata(in.Metadata)
	if err != nil {
		return command.SaveOutcome[PictureView]{}, err
	}
	checksum := sha256.Sum256(in.Data)
	args := uploadCommand{in.IssueID, metadata, int32(len(in.Data)), hex.EncodeToString(checksum[:])}
	publication := attachments.DraftPublication
	if metadata.Publication == Gallery {
		publication = attachments.IssuePublication
	}
	shared := attachments.AssetMetadata{
		Kind:        attachments.ImageAsset,
		Filename:    metadata.Filename,
		Description: metadata.Description,
		MIMEType:    metadata.MIMEType,
		Publication: publication,
	}
	return attachments.UploadCompatible(ctx, s.assetStorage, actor, in.IssueID, shared, in.Data, in.RetryReference, command.UploadPicture, args, "pictures", func(v attachments.AssetView) PictureView {
		state := Draft
		if v.State == attachments.PublishedAsset {
			state = Published
		}
		result := PictureView{
			ID:          command.PictureID{UUID: v.ID.UUID},
			IssueID:     v.IssueID,
			Filename:    v.Filename,
			Description: v.Description,
			MIMEType:    v.MIMEType,
			ByteSize:    int32(v.ByteSize),
			Uploader:    v.Uploader,
			UploadedAt:  v.UploadedAt,
			State:       state,
			InGallery:   v.InPanel,
			ExpiresAt:   v.ExpiresAt,
		}
		if v.InPanel {
			revision := v.IssueRevision
			result.IssueRevision = &revision
		}
		return result
	}, validateView)
}
func transferFailure(err error) error {
	var failure *command.Failure
	if errors.As(err, &failure) && failure.Code == command.Busy {
		return busy()
	}
	return err
}

func pictureInfo(row dbgen.PicturesViewRow, published bool) objectstore.Info {
	generation := row.StagingGeneration
	if published && row.PublishedGeneration != nil {
		generation = *row.PublishedGeneration
	}
	return objectstore.Info{Generation: generation, Size: row.ByteSize, ContentType: row.MimeType, SHA256: row.Checksum}
}
