package activity

import (
	"context"
	"encoding/json"
	"errors"

	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"github.com/google/uuid"
)

type Draft struct {
	Action       command.Operation
	ResourceKind ResourceKind
	ResourceID   uuid.UUID
	ProjectID    *command.ProjectID
	IssueID      *command.IssueID
	Changes      []FieldChange
}

// Append derives attribution from the authenticated transaction. Producers
// supply changed values only and never call this function for a no-op.
func Append(ctx context.Context, mutation *command.Mutation, draft Draft) (Event, error) {
	if !draft.Action.IsMutation() || draft.ResourceID == uuid.Nil || len(draft.Changes) == 0 || len(draft.Changes) > 20000 {
		return Event{}, errors.New("invalid activity draft")
	}
	changed := false
	if mutation.Actor.UserID.UUID != mutation.User.ID || mutation.User.ID == uuid.Nil || (mutation.Actor.Channel != command.REST && mutation.Actor.Channel != command.MCP) {
		return Event{}, errors.New("invalid event attribution")
	}
	for _, field := range draft.Changes {
		if err := command.ValidateText(field.Field, 1, 200); err != nil {
			return Event{}, err
		}
		for _, value := range []*string{field.Before, field.After} {
			if value != nil && len(*value) > 128*1024 {
				return Event{}, errors.New("activity value exceeds its text budget")
			}
			if value != nil {
				if err := command.ValidateText(*value, 0, 128*1024); err != nil {
					return Event{}, err
				}
			}
		}
		if (field.Before == nil) != (field.After == nil) || (field.Before != nil && field.After != nil && *field.Before != *field.After) {
			changed = true
		}
	}
	if !changed {
		return Event{}, errors.New("unchanged command must not create activity")
	}
	changes := Changes{Version: 1, Fields: draft.Changes}
	encoded, err := json.Marshal(changes)
	if err != nil {
		return Event{}, err
	}
	if len(encoded) > 16*1024*1024 {
		return Event{}, errors.New("activity exceeds its persistence budget")
	}
	params := dbgen.AppendActivityEventParams{
		ID:           uuid.New(),
		ActorID:      mutation.User.ID,
		Channel:      string(mutation.Actor.Channel),
		Action:       string(draft.Action),
		ResourceKind: string(draft.ResourceKind),
		ResourceID:   draft.ResourceID,
		Changes:      encoded,
	}
	if draft.ProjectID != nil {
		params.ProjectID = &draft.ProjectID.UUID
	}
	if draft.IssueID != nil {
		params.IssueID = &draft.IssueID.UUID
	}
	row, err := mutation.Queries.AppendActivityEvent(ctx, params)
	if err != nil {
		return Event{}, err
	}
	return Event{
		ID:           command.EventID{UUID: row.ID},
		ActorID:      mutation.Actor.UserID,
		Channel:      mutation.Actor.Channel,
		Action:       string(draft.Action),
		ResourceKind: draft.ResourceKind,
		ResourceID:   draft.ResourceID.String(),
		ProjectID:    draft.ProjectID,
		IssueID:      draft.IssueID,
		Changes:      changes,
		CreatedAt:    row.CreatedAt.Time,
	}, nil
}
