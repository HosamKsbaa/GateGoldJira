package attachments

import (
	"context"
	"encoding/base64"
	"errors"
	"gategoldjira/backend/internal/features/activity"
	"gategoldjira/backend/internal/features/notifications"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"gategoldjira/backend/internal/platform/objectstore"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"io"
)

func assetScopes(id command.AssetID, write bool) func(context.Context, *command.Mutation) ([]command.ProjectScope, error) {
	return func(ctx context.Context, m *command.Mutation) ([]command.ProjectScope, error) {
		row, err := m.Queries.AssetsResolve(ctx, id.UUID)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, unavailable()
		}
		if err != nil {
			return nil, err
		}
		return []command.ProjectScope{{ProjectID: command.ProjectID{UUID: row.ProjectID}, Write: write}}, nil
	}
}
func assetView(row dbgen.AssetsGetRow) AssetView {
	result := AssetView{
		ID:            command.AssetID{UUID: row.ID},
		IssueID:       command.IssueID{UUID: row.IssueID},
		IssueRevision: command.Revision(row.IssueRevision),
		Kind:          AssetKind(row.Kind),
		Filename:      row.Filename,
		Description:   row.Description,
		MIMEType:      row.MimeType,
		ByteSize:      ByteCount(row.ByteSize),
		Uploader: command.IssueUserSummary{
			ID:          command.UserID{UUID: row.UploadedBy},
			DisplayName: row.DisplayName,
		},
		State:      AssetState(row.State),
		InPanel:    row.InPanel,
		UploadedAt: row.UploadedAt.Time.UTC(),
	}
	if row.State == string(PrivateDraft) && row.ExpiresAt.Valid {
		value := row.ExpiresAt.Time.UTC()
		result.ExpiresAt = &value
	}
	return result
}
func validateAssetView(v AssetView) error {
	if v.ID.UUID == uuid.Nil || v.IssueID.UUID == uuid.Nil || v.Uploader.ID.UUID == uuid.Nil || v.IssueRevision < 1 || v.ByteSize < 1 || int64(v.ByteSize) > MaximumAssetBytes || v.UploadedAt.IsZero() || (v.Kind != ImageAsset && v.Kind != FileAsset) || (v.State != PrivateDraft && v.State != PublishedAsset) {
		return errors.New("invalid asset view")
	}
	return nil
}
func (s *Service) GetAsset(ctx context.Context, actor command.Actor, in AssetGetInput) (AssetView, error) {
	return command.ReadResolved(ctx, s.runner, actor, command.Access{}, assetScopes(in.AssetID, false), func(ctx context.Context, m *command.Mutation) (AssetView, error) {
		row, err := m.Queries.AssetsGet(ctx, dbgen.AssetsGetParams{ID: in.AssetID.UUID, CallerID: actor.UserID.UUID})
		if errors.Is(err, pgx.ErrNoRows) {
			return AssetView{}, unavailable()
		}
		return assetView(row), err
	})
}

type assetCursorPosition struct {
	Time pgtype.Timestamptz `json:"time"`
	ID   uuid.UUID          `json:"id"`
}

func (s *Service) ListAssets(ctx context.Context, actor command.Actor, in AssetListInput) (command.Page[AssetView], error) {
	empty := command.Page[AssetView]{}
	limit, err := in.Page.Size()
	if err != nil {
		return empty, err
	}
	return command.ReadResolved(ctx, s.runner, actor, command.Access{RepeatableRead: true}, issueScopes(in.IssueID, false), func(ctx context.Context, m *command.Mutation) (command.Page[AssetView], error) {
		issue, err := m.Queries.AttachmentsResolveIssue(ctx, in.IssueID.UUID)
		if err != nil {
			return empty, err
		}
		scope, err := command.CursorScopeFor(command.ListAssets, actor.UserID, "uploadedAt,id", struct {
			IssueID   command.IssueID
			Revision  command.Revision
			OwnDrafts bool
		}{in.IssueID, command.Revision(issue.Revision), in.IncludeOwnDrafts})
		if err != nil {
			return empty, err
		}
		position := assetCursorPosition{}
		if in.Page.Cursor != nil {
			position, err = command.ReadCursor[assetCursorPosition](s.cursors, scope, *in.Page.Cursor)
			if err != nil {
				return empty, err
			}
		}
		rows, err := m.Queries.AssetsList(ctx, dbgen.AssetsListParams{
			IssueID:          in.IssueID.UUID,
			IncludeOwnDrafts: in.IncludeOwnDrafts,
			CallerID:         actor.UserID.UUID,
			HasCursor:        in.Page.Cursor != nil,
			AfterTime:        position.Time,
			AfterID:          position.ID,
			PageSize:         int32(limit + 1),
		})
		if err != nil {
			return empty, err
		}
		count, err := m.Queries.AssetsCount(ctx, dbgen.AssetsCountParams{
			IssueID:          in.IssueID.UUID,
			IncludeOwnDrafts: in.IncludeOwnDrafts,
			CallerID:         actor.UserID.UUID,
		})
		if err != nil {
			return empty, err
		}
		items := make([]AssetView, 0, len(rows))
		for _, row := range rows {
			items = append(items, assetView(dbgen.AssetsGetRow(row)))
		}
		return command.BuildPage(s.cursors, scope, items, limit, int(count), false, func(v AssetView) assetCursorPosition {
			return assetCursorPosition{pgtype.Timestamptz{Time: v.UploadedAt, Valid: true}, v.ID.UUID}
		})
	})
}
func (s *Service) DetachAsset(ctx context.Context, actor command.Actor, in AssetDetachInput) (command.SaveOutcome[AssetView], error) {
	if in.ExpectedIssueRevision < 1 {
		return command.SaveOutcome[AssetView]{}, validation("expectedIssueRevision", "Read the current issue before detaching.")
	}
	request := command.MutationRequest{
		Actor:           actor,
		Operation:       command.DetachAsset,
		RetryReference:  in.RetryReference,
		ResolveProjects: assetScopes(in.AssetID, true),
	}
	return command.Save(ctx, s.runner, request, in, func(ctx context.Context, m *command.Mutation) error {
		_, err := m.Queries.AssetsGet(ctx, dbgen.AssetsGetParams{ID: in.AssetID.UUID, CallerID: actor.UserID.UUID})
		return err
	}, func(ctx context.Context, m *command.Mutation, in AssetDetachInput) (command.Change[AssetView], error) {
		empty := command.Change[AssetView]{}
		row, err := m.Queries.AssetsGet(ctx, dbgen.AssetsGetParams{ID: in.AssetID.UUID, CallerID: actor.UserID.UUID})
		if err != nil {
			return empty, err
		}
		issue, err := m.Queries.AssetsLockIssue(ctx, row.IssueID)
		if err != nil {
			return empty, err
		}
		if !row.InPanel {
			return command.Change[AssetView]{Result: assetView(row), HTTPStatus: 200}, nil
		}
		if command.Revision(issue.Revision) != in.ExpectedIssueRevision {
			return empty, &command.Failure{
				Code:        command.Conflict,
				Message:     "The issue changed. Reload its attachments before detaching.",
				FieldErrors: []command.FieldError{},
				NextAction:  command.ReloadCurrentState,
			}
		}
		if _, err = m.Queries.AssetsLock(ctx, row.ID); err != nil {
			return empty, err
		}
		if err = m.Queries.AssetsDetach(ctx, row.ID); err != nil {
			return empty, err
		}
		if err = m.Queries.AssetsAdvanceIssue(ctx, row.IssueID); err != nil {
			return empty, err
		}
		before, after := "true", "false"
		project, id := command.ProjectID{UUID: row.ProjectID}, command.IssueID{UUID: row.IssueID}
		event, err := activity.Append(ctx, m, activity.Draft{
			Action:       command.DetachAsset,
			ResourceKind: activity.AttachmentResource,
			ResourceID:   row.ID,
			ProjectID:    &project,
			IssueID:      &id,
			Changes: []activity.FieldChange{{
				Field:  "attachments." + in.AssetID.String() + ".inPanel",
				Before: &before,
				After:  &after,
			}},
		})
		if err != nil {
			return empty, err
		}
		if err = notifications.WatchIssueChange(ctx, m, event.ID, id, "Attachment removed from an issue you watch."); err != nil {
			return empty, err
		}
		row, err = m.Queries.AssetsGet(ctx, dbgen.AssetsGetParams{ID: row.ID, CallerID: actor.UserID.UUID})
		eventID := event.ID.String()
		return command.Change[AssetView]{Result: assetView(row), EventID: &eventID, HTTPStatus: 200}, err
	}, validateAssetView)
}
func assetInfo(row dbgen.AssetsGetRow, published bool) objectstore.Info {
	generation := row.StagingGeneration
	if published && row.PublishedGeneration != nil {
		generation = *row.PublishedGeneration
	}
	return objectstore.Info{Generation: generation, Size: row.ByteSize, ContentType: row.MimeType, SHA256: row.Checksum}
}
func (s *Service) DownloadAssetChunk(ctx context.Context, actor command.Actor, in AssetDownloadInput) (AssetChunk, error) {
	empty := AssetChunk{}
	if in.Offset < 0 || in.Count < 1 || in.Count > 1024*1024 {
		return empty, validation("count", "Read from 1 byte to 1 MiB at a time.")
	}
	row, err := command.ReadResolved(ctx, s.runner, actor, command.Access{}, assetScopes(in.AssetID, false), func(ctx context.Context, m *command.Mutation) (dbgen.AssetsGetRow, error) {
		r, err := m.Queries.AssetsGet(ctx, dbgen.AssetsGetParams{ID: in.AssetID.UUID, CallerID: actor.UserID.UUID})
		if errors.Is(err, pgx.ErrNoRows) {
			return r, unavailable()
		}
		return r, err
	})
	if err != nil {
		return empty, err
	}
	if int64(in.Offset) > row.ByteSize {
		return empty, validation("offset", "The offset is beyond the stored file.")
	}
	published := row.State == string(PublishedAsset)
	key := objectstore.Key(row.StagingKey)
	if published {
		if row.PublishedKey == nil {
			return empty, busy()
		}
		key = objectstore.Key(*row.PublishedKey)
	}
	remaining := row.ByteSize - int64(in.Offset)
	count := min(int64(in.Count), remaining)
	var reader io.ReadCloser
	if ranges, ok := s.store.(objectstore.RangeStore); ok {
		reader, err = ranges.OpenRange(ctx, key, assetInfo(row, published), published, int64(in.Offset), count)
	} else {
		reader, err = s.store.Open(ctx, key, assetInfo(row, published), published)
		if err == nil && in.Offset > 0 {
			_, err = io.CopyN(io.Discard, reader, int64(in.Offset))
		}
	}
	if err != nil {
		if reader != nil {
			reader.Close()
		}
		return empty, busy()
	}
	defer reader.Close()
	data, err := io.ReadAll(io.LimitReader(reader, count+1))
	if err != nil {
		return empty, busy()
	}
	if int64(len(data)) > count {
		data = data[:count]
	}
	if int64(len(data)) != count {
		return empty, busy()
	}
	// Recheck after object I/O so revocation/expiry cannot publish a stale buffer.
	current, err := s.GetAsset(ctx, actor, AssetGetInput{AssetID: in.AssetID})
	if err != nil {
		return empty, err
	}
	return AssetChunk{
		Asset:      current,
		Offset:     in.Offset,
		DataBase64: base64.StdEncoding.EncodeToString(data),
		Terminal:   int64(in.Offset)+count == row.ByteSize,
	}, nil
}
