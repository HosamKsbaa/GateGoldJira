package pictures

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"

	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"gategoldjira/backend/internal/platform/objectstore"
	"github.com/jackc/pgx/v5"
)

type Content struct {
	Picture PictureView
	Data    []byte
}

func (s *Service) Content(ctx context.Context, actor command.Actor, id command.PictureID) (Content, error) {
	row, err := command.ReadResolved(ctx, s.runner, actor, command.Access{}, pictureScopes(id, false), func(ctx context.Context, m *command.Mutation) (dbgen.PicturesVisibleRow, error) {
		r, err := m.Queries.PicturesVisible(ctx, dbgen.PicturesVisibleParams{ID: id.UUID, CallerID: actor.UserID.UUID})
		if errors.Is(err, pgx.ErrNoRows) {
			return r, unavailable()
		}
		return r, err
	})
	if err != nil {
		return Content{}, err
	}
	r := dbgen.PicturesViewRow(row)
	key := r.StagingKey
	published := r.State == string(Published)
	if published {
		if r.PublishedKey == nil || r.PublishedGeneration == nil {
			return Content{}, busy()
		}
		key = *r.PublishedKey
	}
	reader, err := s.store.Open(ctx, objectstore.Key(key), pictureInfo(r, published), published)
	if err != nil {
		return Content{}, busy()
	}
	defer reader.Close()
	data, err := io.ReadAll(io.LimitReader(reader, objectstore.MaximumSize+1))
	if err != nil || int64(len(data)) != r.ByteSize {
		return Content{}, busy()
	}
	checksum := sha256.Sum256(data)
	if hex.EncodeToString(checksum[:]) != r.Checksum {
		return Content{}, busy()
	}
	// No project lock is held during object I/O. A newly revoked read cannot send
	// bytes merely because its metadata check happened before the transfer.
	view, err := s.Get(ctx, actor, id)
	if err != nil {
		return Content{}, err
	}
	return Content{Picture: view, Data: data}, nil
}
