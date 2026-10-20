package issues

import (
	"context"
	"errors"
	"gategoldjira/backend/internal/features/activity"
	"gategoldjira/backend/internal/features/notifications"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func normalizeModernEditable(input ModernEditable) (ModernEditable, error) {
	if input.TypeID.UUID == uuid.Nil || input.PriorityID.UUID == uuid.Nil {
		return input, validation("choices", "Supply the selected type and priority identifiers.")
	}
	common, err := normalizeEditable(IssueEditable{
		Title:             input.Title,
		Description:       input.Description,
		DescriptionFormat: input.DescriptionFormat,
		Type:              command.Task,
		Priority:          command.Medium,
		AssigneeID:        input.AssigneeID,
		DueDate:           input.DueDate,
		LabelIDs:          input.LabelIDs,
	})
	if err != nil {
		return input, err
	}
	input.Title, input.Description, input.DescriptionFormat, input.LabelIDs = common.Title, common.Description, common.DescriptionFormat, common.LabelIDs
	return input, nil
}
func (s *Service) UpdateModern(ctx context.Context, actor command.Actor, input ModernUpdateInput) (command.SaveOutcome[ModernIssueView], error) {
	editable, err := normalizeModernEditable(input.Editable)
	if err != nil {
		return command.SaveOutcome[ModernIssueView]{}, err
	}
	input.Editable = editable
	if input.ExpectedRevision < 1 {
		return command.SaveOutcome[ModernIssueView]{}, validation("expectedRevision", "Read the current issue revision before saving.")
	}
	prepared, err := s.prepareDescriptionAssets(ctx, actor, input.IssueID, IssueEditable{
		Description:       editable.Description,
		DescriptionFormat: editable.DescriptionFormat,
	})
	if err != nil {
		return command.SaveOutcome[ModernIssueView]{}, err
	}
	request := command.MutationRequest{
		Actor:           actor,
		Operation:       command.UpdateModernIssue,
		RetryReference:  input.RetryReference,
		ResolveProjects: issueScopes(input.IssueID, true),
	}
	return command.Save(ctx, s.runner, request, input, func(ctx context.Context, m *command.Mutation) error {
		_, err := m.Queries.ReadIssue(ctx, input.IssueID.UUID)
		return err
	}, func(ctx context.Context, m *command.Mutation, in ModernUpdateInput) (command.Change[ModernIssueView], error) {
		current, err := readModernView(ctx, m, in.IssueID)
		if err != nil {
			return command.Change[ModernIssueView]{}, err
		}
		project := current.Summary.ProjectID
		if err = requireModernProject(ctx, m, project); err != nil {
			return command.Change[ModernIssueView]{}, err
		}
		if current.Summary.Revision != in.ExpectedRevision {
			return command.Change[ModernIssueView]{}, modernConflict(current)
		}
		kind, err := canonicalType(ctx, m, project, in.Editable.TypeID)
		if err != nil {
			return command.Change[ModernIssueView]{}, err
		}
		priority, err := canonicalPriority(ctx, m, project, in.Editable.PriorityID)
		if err != nil {
			return command.Change[ModernIssueView]{}, err
		}
		typeChanged := in.Editable.TypeID != current.Summary.Type.ID
		if kind.Behavior != string(current.Summary.Type.Behavior) {
			return command.Change[ModernIssueView]{}, validation("typeId", "Keep standard or subtask behavior; parent relationships are immutable.")
		}
		if typeChanged {
			if kind.Retired || current.Summary.Workflow.Retired {
				return command.Change[ModernIssueView]{}, validation("typeId", "New type assignments require an active type and workflow.")
			}
			binding, err := m.Queries.IssuesCanonicalBinding(ctx, dbgen.IssuesCanonicalBindingParams{
				ProjectID:  project.UUID,
				TypeID:     kind.ID,
				WorkflowID: current.Summary.Workflow.ID.UUID,
			})
			if errors.Is(err, pgx.ErrNoRows) || (err == nil && !binding.AcceptsNew) {
				return command.Change[ModernIssueView]{}, validation("typeId", "Choose a type allowed for new assignment in this issue's existing workflow.")
			}
			if err != nil {
				return command.Change[ModernIssueView]{}, err
			}
		}
		priorityChanged := in.Editable.PriorityID != current.Summary.Priority.ID
		if priorityChanged && priority.Retired {
			return command.Change[ModernIssueView]{}, validation("priorityId", "Choose an active priority; unchanged retired values may be retained.")
		}
		common := IssueEditable{
			Title:             in.Editable.Title,
			Description:       in.Editable.Description,
			DescriptionFormat: in.Editable.DescriptionFormat,
			Type:              legacyTypeProjection(kind),
			Priority:          legacyPriorityProjection(priority),
			AssigneeID:        in.Editable.AssigneeID,
			DueDate:           in.Editable.DueDate,
			LabelIDs:          in.Editable.LabelIDs,
		}
		if err = checkReferences(ctx, m, project, common); err != nil {
			return command.Change[ModernIssueView]{}, err
		}
		publication, err := s.commitDescriptionAssets(ctx, m, in.IssueID, prepared)
		if err != nil {
			return command.Change[ModernIssueView]{}, err
		}
		if err = validateDescriptionPictures(ctx, m, in.IssueID, common); err != nil {
			return command.Change[ModernIssueView]{}, err
		}
		before := editableFromModern(current)
		all := editableChanges(&before, &common)
		changes := append([]activity.FieldChange{}, publication...)
		for _, change := range all {
			if change.Field != "type" && change.Field != "priority" {
				changes = append(changes, change)
			}
		}
		if typeChanged {
			oldID, newID, oldKey, newKey := current.Summary.Type.ID.String(), kind.ID.String(), current.Summary.Type.Key, kind.Key
			changes = append(changes, activity.FieldChange{
				Field:  "typeId",
				Before: &oldID,
				After:  &newID,
			}, activity.FieldChange{
				Field:  "type",
				Before: &oldKey,
				After:  &newKey,
			})
		}
		if priorityChanged {
			oldID, newID, oldKey, newKey := current.Summary.Priority.ID.String(), priority.ID.String(), current.Summary.Priority.Key, priority.Key
			changes = append(changes, activity.FieldChange{
				Field:  "priorityId",
				Before: &oldID,
				After:  &newID,
			}, activity.FieldChange{
				Field:  "priority",
				Before: &oldKey,
				After:  &newKey,
			})
		}
		if len(changes) == 0 {
			return command.Change[ModernIssueView]{Result: current, HTTPStatus: 200}, nil
		}
		if _, err = m.Queries.IssuesCanonicalUpdate(ctx, dbgen.IssuesCanonicalUpdateParams{
			ID:                in.IssueID.UUID,
			Title:             common.Title,
			Description:       common.Description,
			DescriptionFormat: common.DescriptionFormat.Stored(),
			TypeID:            &kind.ID,
			PriorityID:        &priority.ID,
			AssigneeID:        userUUID(common.AssigneeID),
			DueDate:           dateValue(common.DueDate),
		}); err != nil {
			return command.Change[ModernIssueView]{}, err
		}
		if err = setLabels(ctx, m, project, in.IssueID, common.LabelIDs); err != nil {
			return command.Change[ModernIssueView]{}, err
		}
		view, err := readModernView(ctx, m, in.IssueID)
		if err != nil {
			return command.Change[ModernIssueView]{}, err
		}
		facts := []notifications.Fact{}
		if pointerText(before.AssigneeID) != pointerText(common.AssigneeID) && common.AssigneeID != nil {
			facts = append(facts, modernFact(view, notifications.NewAssignment))
		}
		if pointerText(before.DueDate) != pointerText(common.DueDate) {
			facts = append(facts, modernFact(view, notifications.ChangedDueDate))
		}
		event, err := modernIssueEvent(ctx, m, command.UpdateModernIssue, view, changes, facts)
		if err != nil {
			return command.Change[ModernIssueView]{}, err
		}
		return command.Change[ModernIssueView]{Result: view, EventID: event, HTTPStatus: 200}, nil
	}, validateModernView)
}
