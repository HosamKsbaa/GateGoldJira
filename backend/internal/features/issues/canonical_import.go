package issues

import (
	"context"
	"errors"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"github.com/google/uuid"
	"strings"
)

type importChoices struct {
	types      []dbgen.IssueType
	priorities []dbgen.Priority
	stages     []dbgen.WorkflowStage
}

func readImportChoices(ctx context.Context, m *command.Mutation, project command.ProjectID) (importChoices, error) {
	var choices importChoices
	var err error
	if choices.types, err = m.Queries.ImportTypeChoices(ctx, project.UUID); err != nil {
		return choices, err
	}
	if choices.priorities, err = m.Queries.ImportPriorityChoices(ctx, project.UUID); err != nil {
		return choices, err
	}
	if choices.stages, err = m.Queries.ImportStageChoices(ctx, project.UUID); err != nil {
		return choices, err
	}
	if len(choices.types) > 1000 || len(choices.priorities) > 1000 || len(choices.stages) > 1000 {
		return choices, validation("choices", "This import exceeds the bounded project-choice lookup.")
	}
	return choices, nil
}
func uniqueImportChoice[T any](rows []T, matches func(T) bool, field string) (T, error) {
	var found T
	count := 0
	for _, row := range rows {
		if matches(row) {
			found = row
			count++
		}
	}
	if count != 1 {
		return found, validation(field, "Use one scoped choice key, identifier or unique name.")
	}
	return found, nil
}
func (choices importChoices) fields(ctx context.Context, m *command.Mutation, project command.ProjectID, row mappedImportRow, kind, priority, stage, flow string, existing bool) (ModernCreateFields, error) {
	fields := ModernCreateFields{
		Title:             row.Fields.Title,
		Description:       row.Fields.Description,
		DescriptionFormat: row.Fields.DescriptionFormat,
		AssigneeID:        row.Fields.AssigneeID,
		DueDate:           row.Fields.DueDate,
	}
	if existing {
		fields.Description = ""
		fields.DescriptionFormat = command.PlainDescription
	}
	if kind != "" {
		selected, err := uniqueImportChoice(choices.types, func(t dbgen.IssueType) bool {
			return (existing || !t.Retired) && (strings.EqualFold(kind, t.ID.String()) || strings.EqualFold(kind, t.Key) || strings.EqualFold(kind, t.Name))
		}, "type")
		if err != nil {
			return fields, err
		}
		if selected.Behavior != "standard" {
			return fields, validation("type", "Import standard issues first; add subtasks through their parent.")
		}
		id := command.IssueTypeID{UUID: selected.ID}
		fields.TypeID = &id
	}
	if priority != "" {
		selected, err := uniqueImportChoice(choices.priorities, func(p dbgen.Priority) bool {
			return (existing || !p.Retired) && (strings.EqualFold(priority, p.ID.String()) || strings.EqualFold(priority, p.Key) || strings.EqualFold(priority, p.Name))
		}, "priority")
		if err != nil {
			return fields, err
		}
		id := command.PriorityID{UUID: selected.ID}
		fields.PriorityID = &id
	}
	if flow != "" {
		id, err := uuid.Parse(flow)
		if err != nil || id == uuid.Nil {
			return fields, validation("workflowId", "Use a scoped workflow identifier.")
		}
		value := command.WorkflowID{UUID: id}
		fields.WorkflowID = &value
	}
	if stage != "" {
		selected, err := uniqueImportChoice(choices.stages, func(s dbgen.WorkflowStage) bool {
			return (existing || (!s.Retired && s.AcceptsEntries)) && (fields.WorkflowID == nil || s.WorkflowID == fields.WorkflowID.UUID) && (strings.EqualFold(stage, s.ID.String()) || strings.EqualFold(stage, s.LegacyStatus) || strings.EqualFold(stage, s.Name))
		}, "status")
		if err != nil {
			return fields, err
		}
		id, workflow := command.StageID{UUID: selected.ID}, command.WorkflowID{UUID: selected.WorkflowID}
		fields.StageID = &id
		fields.WorkflowID = &workflow
	}
	if !existing {
		resolved, err := resolveCreationChoices(ctx, m, project, fields)
		if err != nil {
			return fields, err
		}
		typeID, priorityID, flowID, stageID := command.IssueTypeID{UUID: resolved.kind.ID}, command.PriorityID{UUID: resolved.priority.ID}, command.WorkflowID{UUID: resolved.workflow.ID}, command.StageID{UUID: resolved.stage.ID}
		fields.TypeID = &typeID
		fields.PriorityID = &priorityID
		fields.WorkflowID = &flowID
		fields.StageID = &stageID
	}
	return fields, nil
}

type importedIssue struct {
	id     command.IssueID
	key    string
	status int
}

func (s *Service) saveImportedIssue(ctx context.Context, actor command.Actor, project command.ProjectID, row mappedImportRow, fields CreateIssueFields, reference string) (importedIssue, error) {
	if row.Modern != nil {
		native := *row.Modern
		native.Backlog = fields.Backlog
		native.ImportSourceKey = fields.ImportSourceKey
		native.LabelIDs = fields.LabelIDs
		saved, err := s.CreateModern(ctx, actor, ModernCreateInput{
			ProjectID:          project,
			ModernCreateFields: native,
			RetryReference:     reference,
		})
		if err != nil {
			return importedIssue{}, err
		}
		return importedIssue{saved.Body.Result.Summary.ID, saved.Body.Result.Summary.Key, saved.HTTPStatus}, nil
	}
	saved, err := s.Create(ctx, actor, CreateInput{
		ProjectID:         project,
		CreateIssueFields: fields,
		RetryReference:    reference,
	})
	if err != nil {
		return importedIssue{}, err
	}
	return importedIssue{saved.Body.Result.Summary.ID, saved.Body.Result.Summary.Key, saved.HTTPStatus}, nil
}
func importFieldErrors(err error) []command.FieldError {
	var failure *command.Failure
	if errors.As(err, &failure) && len(failure.FieldErrors) > 0 {
		return failure.FieldErrors
	}
	return []command.FieldError{{Field: "choices", Message: "Review the current project choices and creation defaults."}}
}
