package attachments

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"io"

	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"gategoldjira/backend/internal/platform/objectstore"
)

type Content struct {
	Attachment AttachmentView
	Data       []byte
}

func (s *Service) Content(ctx context.Context, actor command.Actor, id command.AttachmentID) (Content, error) {
	row, err := command.ReadResolved(ctx, s.runner, actor, command.Access{}, attachmentScopes(id, false), func(ctx context.Context, m *command.Mutation) (dbgen.AttachmentsViewRow, error) {
		return m.Queries.AttachmentsView(ctx, id.UUID)
	})
	if err != nil {
		return Content{}, err
	}
	reader, err := s.store.Open(ctx, objectstore.Key(row.PublishedKey), attachmentInfo(row), true)
	if err != nil {
		return Content{}, busy()
	}
	defer reader.Close()
	data, err := io.ReadAll(io.LimitReader(reader, objectstore.MaximumSize+1))
	if err != nil || int64(len(data)) != row.ByteSize {
		return Content{}, busy()
	}
	checksum := sha256.Sum256(data)
	if hex.EncodeToString(checksum[:]) != row.Checksum {
		return Content{}, busy()
	}
	// Object I/O holds no database connection. Check current access again before bytes leave the service.
	view, err := s.Get(ctx, actor, id)
	if err != nil {
		return Content{}, err
	}
	return Content{view, data}, nil
}
