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
	"strconv"
	"strings"
)

func normalizeModernCreate(input ModernCreateFields) (ModernCreateFields, error) {
	if command.ValidateText(input.ImportSourceKey, 0, 200) != nil || strings.TrimSpace(input.ImportSourceKey) != input.ImportSourceKey {
		return input, validation("importSourceKey", "Use a stable source key up to 200 characters without surrounding spaces.")
	}
	if (input.ParentID == nil) != (input.ExpectedParentRevision == nil) || (input.ExpectedParentRevision != nil && *input.ExpectedParentRevision < 1) {
		return input, validation("parentId", "Supply a parent and its current revision together when creating a subtask.")
	}
	if (input.TypeID != nil && input.TypeID.UUID == uuid.Nil) || (input.PriorityID != nil && input.PriorityID.UUID == uuid.Nil) || (input.WorkflowID != nil && input.WorkflowID.UUID == uuid.Nil) || (input.StageID != nil && input.StageID.UUID == uuid.Nil) || (input.ParentID != nil && input.ParentID.UUID == uuid.Nil) {
		return input, validation("choices", "Use valid choice identifiers or omit them to use creation defaults.")
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
	if err = validateNewDescription(common); err != nil {
		return input, err
	}
	input.Title, input.Description, input.DescriptionFormat, input.LabelIDs = common.Title, common.Description, common.DescriptionFormat, common.LabelIDs
	input.FieldValues, err = normalizeFieldAssignments(input.FieldValues)
	if err != nil {
		return input, err
	}
	return input, nil
}
func (s *Service) CreateModern(ctx context.Context, actor command.Actor, input ModernCreateInput) (command.SaveOutcome[ModernIssueView], error) {
	fields, err := normalizeModernCreate(input.ModernCreateFields)
	if err != nil {
		return command.SaveOutcome[ModernIssueView]{}, err
	}
	input.ModernCreateFields = fields
	request := command.MutationRequest{
		Actor:          actor,
		Operation:      command.CreateModernIssue,
		RetryReference: input.RetryReference,
		Access:         command.Access{Projects: []command.ProjectScope{{ProjectID: input.ProjectID, Write: true}}},
	}
	return command.Save(ctx, s.runner, request, input, func(ctx context.Context, m *command.Mutation) error {
		if input.ParentID != nil {
			_, err := readScopedIssue(ctx, m, input.ProjectID, *input.ParentID)
			return err
		}
		return nil
	}, func(ctx context.Context, m *command.Mutation, in ModernCreateInput) (command.Change[ModernIssueView], error) {
		if in.ImportSourceKey != "" {
			existing, err := m.Queries.ImportSourceGet(ctx, dbgen.ImportSourceGetParams{
				ProjectID: in.ProjectID.UUID,
				SourceKey: in.ImportSourceKey,
			})
			if err == nil {
				view, err := readModernView(ctx, m, command.IssueID{UUID: existing})
				return command.Change[ModernIssueView]{Result: view, HTTPStatus: 200}, err
			}
			if !errors.Is(err, pgx.ErrNoRows) {
				return command.Change[ModernIssueView]{}, err
			}
		}
		choices, err := resolveCreationChoices(ctx, m, in.ProjectID, in.ModernCreateFields)
		if err != nil {
			return command.Change[ModernIssueView]{}, err
		}
		var parent *ModernIssueView
		if in.ParentID != nil {
			value, err := readModernView(ctx, m, *in.ParentID)
			if err != nil {
				return command.Change[ModernIssueView]{}, err
			}
			parent = &value
			if parent.Summary.Revision != *in.ExpectedParentRevision {
				return command.Change[ModernIssueView]{}, modernConflict(*parent)
			}
			if err = CheckChildCreation(ctx, m, in.ProjectID, *in.ParentID); err != nil {
				return command.Change[ModernIssueView]{}, err
			}
		}
		common := IssueEditable{
			Title:             in.Title,
			Description:       in.Description,
			DescriptionFormat: in.DescriptionFormat,
			Type:              legacyTypeProjection(choices.kind),
			Priority:          legacyPriorityProjection(choices.priority),
			AssigneeID:        in.AssigneeID,
			DueDate:           in.DueDate,
			LabelIDs:          in.LabelIDs,
		}
		if err = checkReferences(ctx, m, in.ProjectID, common); err != nil {
			return command.Change[ModernIssueView]{}, err
		}
		status := command.Status(choices.stage.LegacyStatus)
		if err = m.Queries.IssuesRegisterMigrationStage(ctx, dbgen.IssuesRegisterMigrationStageParams{
			ProjectID: in.ProjectID.UUID,
			Status:    string(status),
			StageName: choices.stage.Name,
		}); err != nil {
			return command.Change[ModernIssueView]{}, err
		}
		rank, err := AppendRank(ctx, m, in.ProjectID, status)
		if err != nil {
			return command.Change[ModernIssueView]{}, err
		}
		number, err := m.Queries.IssuesAllocateNumber(ctx, in.ProjectID.UUID)
		if err != nil {
			return command.Change[ModernIssueView]{}, err
		}
		id := command.NewID[command.IssueKind]()
		var parentID *uuid.UUID
		if in.ParentID != nil {
			parentID = &in.ParentID.UUID
		}
		if _, err = m.Queries.IssuesCanonicalInsert(ctx, dbgen.IssuesCanonicalInsertParams{
			ID:                id.UUID,
			ProjectID:         in.ProjectID.UUID,
			Number:            number,
			Title:             common.Title,
			Description:       common.Description,
			DescriptionFormat: common.DescriptionFormat.Stored(),
			Type:              string(common.Type),
			Priority:          string(common.Priority),
			Status:            string(status),
			ReporterID:        m.User.ID,
			AssigneeID:        userUUID(common.AssigneeID),
			DueDate:           dateValue(common.DueDate),
			ParentID:          parentID,
			Rank:              rank,
			TypeID:            &choices.kind.ID,
			PriorityID:        &choices.priority.ID,
			WorkflowID:        &choices.workflow.ID,
			StageID:           &choices.stage.ID,
		}); err != nil {
			return command.Change[ModernIssueView]{}, err
		}
		if in.ImportSourceKey != "" {
			if err = m.Queries.ImportSourceSave(ctx, dbgen.ImportSourceSaveParams{
				ProjectID: in.ProjectID.UUID,
				SourceKey: in.ImportSourceKey,
				IssueID:   id.UUID,
			}); err != nil {
				return command.Change[ModernIssueView]{}, err
			}
		}
		if err = setLabels(ctx, m, in.ProjectID, id, common.LabelIDs); err != nil {
			return command.Change[ModernIssueView]{}, err
		}
		backlogRank, err := appendBacklogRank(ctx, m, in.ProjectID)
		if err != nil {
			return command.Change[ModernIssueView]{}, err
		}
		if err = m.Queries.BacklogSetOnCreate(ctx, dbgen.BacklogSetOnCreateParams{
			ID:          id.UUID,
			Backlog:     in.Backlog,
			BacklogRank: backlogRank,
		}); err != nil {
			return command.Change[ModernIssueView]{}, err
		}
		if in.Backlog {
			if _, err = m.Queries.BacklogAdvanceOrder(ctx, in.ProjectID.UUID); err != nil {
				return command.Change[ModernIssueView]{}, err
			}
		} else {
			if s.stageRule != nil {
				if err = s.stageRule(ctx, m, in.ProjectID, id, status); err != nil {
					return command.Change[ModernIssueView]{}, err
				}
			}
			if _, err = AdvanceOrder(ctx, m, in.ProjectID, status); err != nil {
				return command.Change[ModernIssueView]{}, err
			}
		}
		if parent != nil {
			if _, err = m.Queries.IssuesAdvanceGraph(ctx, in.ProjectID.UUID); err != nil {
				return command.Change[ModernIssueView]{}, err
			}
		}
		fieldChanges, err := applyCreationFieldValues(ctx, m, in.ProjectID, id, in.FieldValues)
		if err != nil {
			return command.Change[ModernIssueView]{}, err
		}
		view, err := readModernView(ctx, m, id)
		if err != nil {
			return command.Change[ModernIssueView]{}, err
		}
		changes := editableChanges(nil, &common)
		changes = append(changes, fieldChanges...)
		for i := range changes {
			if changes[i].Field == "type" {
				key := choices.kind.Key
				changes[i].After = &key
			}
			if changes[i].Field == "priority" {
				key := choices.priority.Key
				changes[i].After = &key
			}
		}
		key, typeID, priorityID, flowID, stageID := view.Summary.Key, choices.kind.ID.String(), choices.priority.ID.String(), choices.workflow.ID.String(), choices.stage.ID.String()
		token := string(status)
		changes = append(changes, activity.FieldChange{Field: "key", After: &key}, activity.FieldChange{Field: "status", After: &token}, activity.FieldChange{Field: "typeId", After: &typeID}, activity.FieldChange{Field: "priorityId", After: &priorityID}, activity.FieldChange{Field: "workflowId", After: &flowID}, activity.FieldChange{Field: "stageId", After: &stageID})
		facts := []notifications.Fact{}
		if common.AssigneeID != nil {
			facts = append(facts, modernFact(view, notifications.NewAssignment))
		}
		if parent != nil {
			parentKey := in.ParentID.String()
			before, after := strconv.Itoa(int(parent.Summary.SubtaskProgress.Total-parent.Summary.SubtaskProgress.Done)), strconv.Itoa(int(parent.Summary.SubtaskProgress.Total-parent.Summary.SubtaskProgress.Done+1))
			changes = append(changes, activity.FieldChange{Field: "parentId", After: &parentKey}, activity.FieldChange{
				Field:  "issues." + parentKey + ".unfinishedChildren",
				Before: &before,
				After:  &after,
			})
			facts = append(facts, modernFact(*parent, notifications.NewSubtask))
		}
		event, err := modernIssueEvent(ctx, m, command.CreateModernIssue, view, changes, facts)
		if err != nil {
			return command.Change[ModernIssueView]{}, err
		}
		return command.Change[ModernIssueView]{Result: view, EventID: event, HTTPStatus: 201}, nil
	}, validateModernView)
}
