package comments

import (
	"context"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"github.com/google/uuid"
)

// Newly selected users require current project access. Retained IDs keep their
// saved display labels and never create another mention notification.
func mentionLabels(ctx context.Context, m *command.Mutation, project command.ProjectID, body Body, previous []MentionView) (map[command.UserID]string, []command.UserID, error) {
	labels := map[command.UserID]string{}
	for _, mention := range previous {
		labels[mention.UserID] = mention.DisplayLabel
	}
	added := []command.UserID{}
	query := []uuid.UUID{}
	for _, id := range body.MentionUserIDs {
		if _, ok := labels[id]; !ok {
			added = append(added, id)
			query = append(query, id.UUID)
		}
	}
	rows, err := m.Queries.CommentsEligibleMentions(ctx, dbgen.CommentsEligibleMentionsParams{UserIds: query, ProjectID: project.UUID})
	if err != nil {
		return nil, nil, err
	}
	for _, row := range rows {
		labels[command.UserID{UUID: row.ID}] = row.DisplayName
	}
	for _, id := range added {
		if _, ok := labels[id]; !ok {
			return nil, nil, invalidBody("body.mentionUserIds", "A newly selected mention no longer has access to this project.")
		}
	}
	return labels, added, nil
}
