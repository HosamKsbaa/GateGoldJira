package attachments

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"gategoldjira/backend/internal/platform/objectstore"
)

type uploadCommand struct {
	IssueID  command.IssueID          `json:"issueId"`
	Metadata AttachmentUploadMetadata `json:"metadata"`
	ByteSize int32                    `json:"byteSize"`
	Checksum string                   `json:"checksum"`
}

func (s *Service) Upload(ctx context.Context, actor command.Actor, in UploadInput) (command.SaveOutcome[AttachmentView], error) {
	metadata, err := normalizeMetadata(in.Metadata)
	if err != nil {
		return command.SaveOutcome[AttachmentView]{}, err
	}
	checksum := sha256.Sum256(in.Data)
	args := uploadCommand{in.IssueID, metadata, int32(len(in.Data)), hex.EncodeToString(checksum[:])}
	shared := AssetMetadata{
		Kind:        FileAsset,
		Filename:    metadata.Filename,
		MIMEType:    metadata.MIMEType,
		Publication: IssuePublication,
	}
	return UploadCompatible(ctx, s, actor, in.IssueID, shared, in.Data, in.RetryReference, command.UploadAttachment, args, "attachments", func(v AssetView) AttachmentView {
		return AttachmentView{
			ID:         command.AttachmentID{UUID: v.ID.UUID},
			IssueID:    v.IssueID,
			Filename:   v.Filename,
			MIMEType:   v.MIMEType,
			ByteSize:   int32(v.ByteSize),
			Uploader:   v.Uploader,
			UploadedAt: v.UploadedAt,
			Attached:   v.InPanel,
		}
	}, validateView)
}
func attachmentInfo(row dbgen.AttachmentsViewRow) objectstore.Info {
	return objectstore.Info{
		Generation:  row.PublishedGeneration,
		Size:        row.ByteSize,
		ContentType: row.MimeType,
		SHA256:      row.Checksum,
	}
}
func transferFailure(err error) error {
	var failure *command.Failure
	if errors.As(err, &failure) && failure.Code == command.Busy {
		return busy()
	}
	return err
}
