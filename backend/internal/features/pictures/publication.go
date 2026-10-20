package pictures

import (
	"context"
	"gategoldjira/backend/internal/features/activity"
	"gategoldjira/backend/internal/features/attachments"
	"gategoldjira/backend/internal/platform/command"
)

// This legacy adapter retains its typed shape while the shared asset owner
// confirms objects and checks publication in the parent's transaction.
type Prepared struct{ assets attachments.PreparedAssets }

func (p Prepared) Descriptions() map[command.PictureID]string { return p.assets.Pictures() }
func (s *Service) Prepare(ctx context.Context, actor command.Actor, issue command.IssueID, ids []command.PictureID) (Prepared, error) {
	if len(ids) > 5 {
		return Prepared{}, validation("body.pictureIds", "Use at most five distinct pictures.")
	}
	assetIDs := make([]command.AssetID, 0, len(ids))
	for _, id := range ids {
		assetIDs = append(assetIDs, command.AssetID{UUID: id.UUID})
	}
	prepared, err := s.assetStorage.PrepareAssets(ctx, actor, issue, assetIDs)
	if err != nil {
		return Prepared{}, err
	}
	if len(prepared.Pictures()) != len(ids) {
		return Prepared{}, unavailable()
	}
	return Prepared{prepared}, nil
}
func (s *Service) Commit(ctx context.Context, m *command.Mutation, issue command.IssueID, prepared Prepared) ([]activity.FieldChange, error) {
	return s.assetStorage.CommitAssets(ctx, m, issue, prepared.assets)
}
func ptr[T any](v T) *T { return &v }
