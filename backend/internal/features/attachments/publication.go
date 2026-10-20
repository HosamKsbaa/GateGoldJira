package attachments

import (
	"context"
	"errors"
	"gategoldjira/backend/internal/features/activity"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"gategoldjira/backend/internal/platform/objectstore"
	"github.com/jackc/pgx/v5"
	"sort"
	"strings"
)

type PreparedAssets struct{ items []preparedAsset }
type preparedAsset struct {
	row  dbgen.AssetsGetRow
	key  objectstore.Key
	info objectstore.Info
}

func (p PreparedAssets) Pictures() map[command.PictureID]string {
	result := map[command.PictureID]string{}
	for _, item := range p.items {
		if item.row.Kind == string(ImageAsset) {
			result[command.PictureID{UUID: item.row.ID}] = item.row.Description
		}
	}
	return result
}
func (p PreparedAssets) Files() map[command.AssetID]string {
	result := map[command.AssetID]string{}
	for _, item := range p.items {
		if item.row.Kind == string(FileAsset) {
			result[command.AssetID{UUID: item.row.ID}] = item.row.Filename
		}
	}
	return result
}
func (p PreparedAssets) IDs() []command.AssetID {
	result := make([]command.AssetID, 0, len(p.items))
	for _, item := range p.items {
		result = append(result, command.AssetID{UUID: item.row.ID})
	}
	return result
}
func (s *Service) PrepareAssets(ctx context.Context, actor command.Actor, issue command.IssueID, ids []command.AssetID) (PreparedAssets, error) {
	empty := PreparedAssets{}
	if len(ids) > 25 {
		return empty, validation("attachments", "Use at most 25 selected assets.")
	}
	ids = append([]command.AssetID(nil), ids...)
	sort.Slice(ids, func(i, j int) bool { return ids[i].String() < ids[j].String() })
	for i, id := range ids {
		if id.UUID == ([16]byte{}) || (i > 0 && ids[i-1] == id) {
			return empty, validation("attachments", "Select distinct nonzero asset IDs.")
		}
	}
	rows, err := command.ReadResolved(ctx, s.runner, actor, command.Access{}, issueScopes(issue, true), func(ctx context.Context, m *command.Mutation) ([]dbgen.AssetsGetRow, error) {
		rows := make([]dbgen.AssetsGetRow, 0, len(ids))
		for _, id := range ids {
			row, err := m.Queries.AssetsGet(ctx, dbgen.AssetsGetParams{ID: id.UUID, CallerID: actor.UserID.UUID})
			if errors.Is(err, pgx.ErrNoRows) || (err == nil && row.IssueID != issue.UUID) {
				return nil, unavailable()
			}
			if err != nil {
				return nil, err
			}
			rows = append(rows, row)
		}
		return rows, nil
	})
	if err != nil {
		return empty, err
	}
	result := PreparedAssets{items: make([]preparedAsset, 0, len(rows))}
	for _, row := range rows {
		key := objectstore.Key(strings.TrimSuffix(row.StagingKey, "/staging") + "/published")
		info := assetInfo(row, row.State == string(PublishedAsset))
		if row.State == string(PublishedAsset) {
			if row.PublishedKey == nil {
				return empty, busy()
			}
			key = objectstore.Key(*row.PublishedKey)
		} else {
			published, err := s.store.Inspect(ctx, key, true)
			if errors.Is(err, objectstore.ErrNotFound) {
				published, err = s.store.Publish(ctx, objectstore.Key(row.StagingKey), info, key)
			}
			if err != nil || published.Size != info.Size || published.SHA256 != info.SHA256 || published.ContentType != info.ContentType {
				return empty, busy()
			}
			info = published
		}
		result.items = append(result.items, preparedAsset{row: row, key: key, info: info})
	}
	return result, nil
}

// The parent owns the existing transaction. Recheck current authorization,
// associations, bytes and exact SQL expiry before making any draft visible.
func (s *Service) CommitAssets(ctx context.Context, m *command.Mutation, issue command.IssueID, prepared PreparedAssets) ([]activity.FieldChange, error) {
	return s.commitAssets(ctx, m, issue, prepared, true)
}

// An issue edit already advances its content revision exactly once.
func (s *Service) CommitDescriptionAssets(ctx context.Context, m *command.Mutation, issue command.IssueID, prepared PreparedAssets) ([]activity.FieldChange, error) {
	return s.commitAssets(ctx, m, issue, prepared, false)
}
func (s *Service) commitAssets(ctx context.Context, m *command.Mutation, issue command.IssueID, prepared PreparedAssets, advance bool) ([]activity.FieldChange, error) {
	changes := []activity.FieldChange{}
	if len(prepared.items) == 0 {
		return changes, nil
	}
	if _, err := m.Queries.AssetsLockIssue(ctx, issue.UUID); err != nil {
		return nil, err
	}
	for _, item := range prepared.items {
		row, err := m.Queries.AssetsLock(ctx, item.row.ID)
		if err != nil || row.IssueID != issue.UUID {
			return nil, unavailable()
		}
		if err = m.RequireProjectWrite(command.ProjectID{UUID: row.ProjectID}); err != nil {
			return nil, err
		}
		if row.State == string(PublishedAsset) {
			if row.PublishedKey == nil || *row.PublishedKey != string(item.key) || row.PublishedGeneration == nil || *row.PublishedGeneration != item.info.Generation {
				return nil, busy()
			}
			continue
		}
		if row.State != string(PrivateDraft) || row.UploadedBy != m.Actor.UserID.UUID || row.StagingGeneration != item.row.StagingGeneration || row.Checksum != item.info.SHA256 {
			return nil, unavailable()
		}
		key := string(item.key)
		count, err := m.Queries.AssetsPublish(ctx, dbgen.AssetsPublishParams{
			ID:                  row.ID,
			PublishedKey:        &key,
			PublishedGeneration: &item.info.Generation,
		})
		if err != nil {
			return nil, err
		}
		if count != 1 {
			return nil, unavailable()
		}
		before, after := "draft", "published"
		changes = append(changes, activity.FieldChange{
			Field:  "attachments." + row.ID.String() + ".state",
			Before: &before,
			After:  &after,
		})
	}
	if advance && len(changes) > 0 {
		if err := m.Queries.AssetsAdvanceIssue(ctx, issue.UUID); err != nil {
			return nil, err
		}
	}
	return changes, nil
}
