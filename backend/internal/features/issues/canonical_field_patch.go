package issues

import (
	"context"
	"gategoldjira/backend/internal/features/activity"
	"gategoldjira/backend/internal/features/notifications"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"github.com/google/uuid"
)

const PriorityIDField IssueField = "priorityId"

type PriorityIDChange struct {
	Prior command.PriorityID `json:"prior"`
	Value command.PriorityID `json:"value"`
}
type ModernPatchFields struct {
	Field    IssueField        `json:"field" enum:"assigneeId,priorityId,dueDate"`
	Assignee *AssigneeChange   `json:"assignee,omitempty"`
	Priority *PriorityIDChange `json:"priority,omitempty"`
	DueDate  *DateChange       `json:"dueDate,omitempty"`
}
type ModernPatchInput struct {
	IssueID command.IssueID `json:"issueId"`
	ModernPatchFields
	RetryReference string `json:"retryReference" format:"uuid"`
}

func validateModernPatch(input ModernPatchFields) error {
	legacy := PatchFieldFields{Field: input.Field, Assignee: input.Assignee, DueDate: input.DueDate}
	if input.Priority != nil {
		if input.Priority.Prior.UUID == uuid.Nil || input.Priority.Value.UUID == uuid.Nil {
			return validation("priority", "Supply nonzero prior and value priority identifiers.")
		}
		legacy.Priority = &PriorityChange{Prior: command.Medium, Value: command.Medium}
	}
	if input.Field == PriorityIDField {
		legacy.Field = PriorityField
	} else if input.Field != AssigneeField && input.Field != DueDateField {
		return validation("field", "Choose assigneeId, priorityId or dueDate.")
	}
	return validatePatch(legacy)
}
func (s *Service) PatchModernField(ctx context.Context, actor command.Actor, input ModernPatchInput) (command.SaveOutcome[ModernIssueView], error) {
	if err := validateModernPatch(input.ModernPatchFields); err != nil {
		return command.SaveOutcome[ModernIssueView]{}, err
	}
	request := command.MutationRequest{
		Actor:          actor,
		Operation:      command.PatchModernIssueField,
		RetryReference: input.RetryReference,
		Access: command.Access{
			SharedMetadata:  true,
			CapacityIssueID: &input.IssueID,
		},
		ResolveProjects: issueScopes(input.IssueID, true),
	}
	return command.Save(ctx, s.runner, request, input, func(ctx context.Context, m *command.Mutation) error {
		_, err := m.Queries.IssuesLockFieldRow(ctx, input.IssueID.UUID)
		return err
	}, func(ctx context.Context, m *command.Mutation, in ModernPatchInput) (command.Change[ModernIssueView], error) {
		current, err := readModernView(ctx, m, in.IssueID)
		if err != nil {
			return command.Change[ModernIssueView]{}, err
		}
		if err = requireModernProject(ctx, m, current.Summary.ProjectID); err != nil {
			return command.Change[ModernIssueView]{}, err
		}
		changed := false
		changes := []activity.FieldChange{}
		switch in.Field {
		case AssigneeField:
			var old *command.UserID
			if current.Summary.Assignee.Value != nil {
				old = &current.Summary.Assignee.Value.ID
			}
			if pointerText(old) != pointerText(in.Assignee.Prior) {
				return command.Change[ModernIssueView]{}, modernConflict(current)
			}
			before, after := pointerText(old), pointerText(in.Assignee.Value)
			changed = before != after
			if changed {
				if in.Assignee.Value != nil {
					eligible, err := m.Queries.IssuesAssigneeEligible(ctx, dbgen.IssuesAssigneeEligibleParams{
						ID:        in.Assignee.Value.UUID,
						ProjectID: current.Summary.ProjectID.UUID,
					})
					if err != nil {
						return command.Change[ModernIssueView]{}, err
					}
					if !eligible {
						return command.Change[ModernIssueView]{}, validation("assignee.value", "Choose an active project member or administrator.")
					}
				}
				err = m.Queries.IssuesPatchAssignee(ctx, dbgen.IssuesPatchAssigneeParams{
					ID:         in.IssueID.UUID,
					AssigneeID: userUUID(in.Assignee.Value),
				})
				changes = append(changes, activity.FieldChange{Field: "assigneeId", Before: &before, After: &after})
			}
		case PriorityIDField:
			if current.Summary.Priority.ID != in.Priority.Prior {
				return command.Change[ModernIssueView]{}, modernConflict(current)
			}
			changed = in.Priority.Prior != in.Priority.Value
			if changed {
				priority, readErr := canonicalPriority(ctx, m, current.Summary.ProjectID, in.Priority.Value)
				if readErr != nil {
					return command.Change[ModernIssueView]{}, readErr
				}
				if priority.Retired {
					return command.Change[ModernIssueView]{}, validation("priority.value", "Choose an active priority.")
				}
				err = m.Queries.IssuesPatchCanonicalPriority(ctx, dbgen.IssuesPatchCanonicalPriorityParams{
					ID:         in.IssueID.UUID,
					PriorityID: &priority.ID,
				})
				before, after, oldKey, newKey := in.Priority.Prior.String(), in.Priority.Value.String(), current.Summary.Priority.Key, priority.Key
				changes = append(changes, activity.FieldChange{
					Field:  "priorityId",
					Before: &before,
					After:  &after,
				}, activity.FieldChange{
					Field:  "priority",
					Before: &oldKey,
					After:  &newKey,
				})
			}
		case DueDateField:
			if pointerText(current.Summary.DueDate) != pointerText(in.DueDate.Prior) {
				return command.Change[ModernIssueView]{}, modernConflict(current)
			}
			before, after := pointerText(in.DueDate.Prior), pointerText(in.DueDate.Value)
			changed = before != after
			if changed {
				err = m.Queries.IssuesPatchDueDate(ctx, dbgen.IssuesPatchDueDateParams{
					ID:      in.IssueID.UUID,
					DueDate: dateValue(in.DueDate.Value),
				})
				changes = append(changes, activity.FieldChange{Field: "dueDate", Before: &before, After: &after})
			}
		}
		if err != nil {
			return command.Change[ModernIssueView]{}, err
		}
		if !changed {
			return command.Change[ModernIssueView]{Result: current, HTTPStatus: 200}, nil
		}
		view, err := readModernView(ctx, m, in.IssueID)
		if err != nil {
			return command.Change[ModernIssueView]{}, err
		}
		facts := []notifications.Fact{}
		if in.Field == AssigneeField && in.Assignee.Value != nil {
			facts = append(facts, modernFact(view, notifications.NewAssignment))
		}
		if in.Field == DueDateField {
			facts = append(facts, modernFact(view, notifications.ChangedDueDate))
		}
		event, err := modernIssueEvent(ctx, m, command.PatchModernIssueField, view, changes, facts)
		if err != nil {
			return command.Change[ModernIssueView]{}, err
		}
		return command.Change[ModernIssueView]{Result: view, EventID: event, HTTPStatus: 200}, nil
	}, validateModernView)
}
