package issues

import (
	"context"
	"gategoldjira/backend/internal/features/notifications"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"github.com/google/uuid"
)

type IssueField string

const (
	AssigneeField IssueField = "assigneeId"
	PriorityField IssueField = "priority"
	DueDateField  IssueField = "dueDate"
)

type AssigneeChange struct {
	Prior *command.UserID `json:"prior" nullable:"true"`
	Value *command.UserID `json:"value" nullable:"true"`
}
type PriorityChange struct {
	Prior command.Priority `json:"prior" enum:"low,medium,high"`
	Value command.Priority `json:"value" enum:"low,medium,high"`
}
type DateChange struct {
	Prior *command.CalendarDate `json:"prior" nullable:"true"`
	Value *command.CalendarDate `json:"value" nullable:"true"`
}
type PatchFieldFields struct {
	Field    IssueField      `json:"field" enum:"assigneeId,priority,dueDate"`
	Assignee *AssigneeChange `json:"assignee,omitempty"`
	Priority *PriorityChange `json:"priority,omitempty"`
	DueDate  *DateChange     `json:"dueDate,omitempty"`
}
type PatchFieldInput struct {
	IssueID command.IssueID `json:"issueId"`
	PatchFieldFields
	RetryReference string `json:"retryReference" format:"uuid"`
}

func validatePatch(fields PatchFieldFields) error {
	slots := 0
	if fields.Assignee != nil {
		slots++
	}
	if fields.Priority != nil {
		slots++
	}
	if fields.DueDate != nil {
		slots++
	}
	if slots != 1 {
		return validation("field", "Supply exactly one selected field's prior and value.")
	}
	switch fields.Field {
	case AssigneeField:
		if fields.Assignee == nil {
			return validation("assignee", "Supply the assignee change.")
		}
		for _, id := range []*command.UserID{fields.Assignee.Prior, fields.Assignee.Value} {
			if id != nil && id.UUID == uuid.Nil {
				return validation("assignee", "Use a current user identifier or null.")
			}
		}
	case PriorityField:
		if fields.Priority == nil || !fields.Priority.Prior.Valid() || !fields.Priority.Value.Valid() {
			return validation("priority", "Supply valid prior and new priorities.")
		}
	case DueDateField:
		if fields.DueDate == nil {
			return validation("dueDate", "Supply the date change.")
		}
		for _, date := range []*command.CalendarDate{fields.DueDate.Prior, fields.DueDate.Value} {
			if date != nil {
				if _, err := date.MarshalJSON(); err != nil {
					return validation("dueDate", "Use a calendar date or null.")
				}
			}
		}
	default:
		return validation("field", "Choose assignee, priority or due date.")
	}
	return nil
}

func (s *Service) PatchField(ctx context.Context, actor command.Actor, input PatchFieldInput) (command.SaveOutcome[IssueView], error) {
	if err := validatePatch(input.PatchFieldFields); err != nil {
		return command.SaveOutcome[IssueView]{}, err
	}
	request := command.MutationRequest{
		Actor:           actor,
		Operation:       command.PatchIssueField,
		RetryReference:  input.RetryReference,
		Access:          command.Access{SharedMetadata: true},
		ResolveProjects: issueScopes(input.IssueID, true),
	}
	return command.Save(ctx, s.runner, request, input, func(ctx context.Context, m *command.Mutation) error {
		_, err := m.Queries.IssuesLockFieldRow(ctx, input.IssueID.UUID)
		return err
	}, func(ctx context.Context, m *command.Mutation, in PatchFieldInput) (command.Change[IssueView], error) {
		if err := requireLegacyIssue(ctx, m, in.IssueID); err != nil {
			return command.Change[IssueView]{}, err
		}
		current, err := readView(ctx, m, in.IssueID)
		if err != nil {
			return command.Change[IssueView]{}, err
		}
		editable := editableFrom(current)
		switch in.Field {
		case AssigneeField:
			if pointerText(editable.AssigneeID) != pointerText(in.Assignee.Prior) {
				return command.Change[IssueView]{}, conflict(current)
			}
			editable.AssigneeID = in.Assignee.Value
		case PriorityField:
			if editable.Priority != in.Priority.Prior {
				return command.Change[IssueView]{}, conflict(current)
			}
			editable.Priority = in.Priority.Value
		case DueDateField:
			if pointerText(editable.DueDate) != pointerText(in.DueDate.Prior) {
				return command.Change[IssueView]{}, conflict(current)
			}
			editable.DueDate = in.DueDate.Value
		}
		before := editableFrom(current)
		changes := editableChanges(&before, &editable)
		if len(changes) == 0 {
			return command.Change[IssueView]{Result: current, HTTPStatus: 200}, nil
		}
		facts := []notifications.Fact{}
		switch in.Field {
		case AssigneeField:
			if in.Assignee.Value != nil {
				eligible, err := m.Queries.IssuesAssigneeEligible(ctx, dbgen.IssuesAssigneeEligibleParams{
					ID:        in.Assignee.Value.UUID,
					ProjectID: current.Summary.ProjectID.UUID,
				})
				if err != nil {
					return command.Change[IssueView]{}, err
				}
				if !eligible {
					return command.Change[IssueView]{}, validation("assignee.value", "Choose an active project member or administrator.")
				}
			}
			err = m.Queries.IssuesPatchAssignee(ctx, dbgen.IssuesPatchAssigneeParams{
				ID:         in.IssueID.UUID,
				AssigneeID: userUUID(in.Assignee.Value),
			})
		case PriorityField:
			err = m.Queries.IssuesPatchPriority(ctx, dbgen.IssuesPatchPriorityParams{
				ID:       in.IssueID.UUID,
				Priority: string(in.Priority.Value),
			})
		case DueDateField:
			err = m.Queries.IssuesPatchDueDate(ctx, dbgen.IssuesPatchDueDateParams{
				ID:      in.IssueID.UUID,
				DueDate: dateValue(in.DueDate.Value),
			})
		}
		if err != nil {
			return command.Change[IssueView]{}, err
		}
		view, err := readView(ctx, m, in.IssueID)
		if err != nil {
			return command.Change[IssueView]{}, err
		}
		if in.Field == AssigneeField && in.Assignee.Value != nil {
			facts = append(facts, fact(view, notifications.NewAssignment))
		}
		if in.Field == DueDateField {
			facts = append(facts, fact(view, notifications.ChangedDueDate))
		}
		event, err := issueEvent(ctx, m, command.PatchIssueField, view, changes, facts)
		return command.Change[IssueView]{Result: view, HTTPStatus: 200, EventID: event}, err
	}, validateView)
}
