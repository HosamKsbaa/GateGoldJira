package boards

import (
	"context"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"github.com/google/uuid"
)

// Capacity cannot depend on time, the reader, or another issue's completion.
func validateHardFilter(filter command.IssueFilter) error {
	if filter.Overdue != nil || filter.Blocked != nil || filter.PrerequisiteFor != nil || (filter.Assignee != nil && filter.Assignee.Mode == command.AssigneeMe) {
		return validation("wipMode", "Hard limits require deterministic issue-owned filters. Use warning mode for relative, blocked or prerequisite filters.")
	}
	return nil
}
func changesOccupancy(op command.Operation) bool {
	switch op {
	case command.CreateIssue, command.CreateSubtask, command.UpdateIssue, command.PatchIssueField, command.MoveIssue,
		command.CreateModernIssue, command.UpdateModernIssue, command.PatchModernIssueField, command.MoveModernIssue,
		command.MoveBoardCard, command.OrganizeIssue, command.ImportIssues, command.MigrateWorkflowIssues,
		command.UpdateBoard, command.ArchiveBoard, command.RestoreBoard, command.SaveBoardLayout:
		return true
	default:
		return false
	}
}

// GuardWIP is installed on the single application runner. Transfers and reads
// never enter this guard. The final check includes automation-derived changes.
// Metadata narrows locks to its current stage, protected by shared lifecycle.
func GuardWIP(ctx context.Context, m *command.Mutation, op command.Operation, scopes []command.ProjectScope, focus *command.IssueID) (func(context.Context) error, error) {
	if !changesOccupancy(op) {
		return nil, nil
	}
	projects := []uuid.UUID{}
	for _, scope := range scopes {
		if !scope.Write {
			continue
		}
		permission, err := m.ProjectPermissions(scope.ProjectID)
		if err != nil {
			return nil, err
		}
		if permission.ModernCore {
			projects = append(projects, scope.ProjectID.UUID)
		}
	}
	if len(projects) == 0 {
		return nil, nil
	}
	var stage *uuid.UUID
	if focus != nil {
		issue, err := m.Queries.ReadIssue(ctx, focus.UUID)
		if err != nil {
			return nil, err
		}
		stage = issue.StageID
	}
	columns, err := m.Queries.BoardsHardCapacityColumns(ctx, dbgen.BoardsHardCapacityColumnsParams{ProjectIds: projects, StageID: stage})
	if err != nil {
		return nil, err
	}
	if len(columns) == 0 && op != command.SaveBoardLayout && op != command.RestoreBoard {
		return nil, nil
	}
	before, err := hardCounts(ctx, m, columns)
	if err != nil {
		return nil, err
	}
	return func(ctx context.Context) error {
		current, err := m.Queries.BoardsHardCapacityColumns(ctx, dbgen.BoardsHardCapacityColumnsParams{ProjectIds: projects, StageID: stage})
		if err != nil {
			return err
		}
		after, err := hardCounts(ctx, m, current)
		if err != nil {
			return err
		}
		for _, column := range current {
			if after[column.ID] > *column.WipLimit && after[column.ID] > before[column.ID] {
				return &command.Failure{
					Code:    command.Validation,
					Message: "This change would exceed the hard work-in-progress limit for " + column.Name + ". Finish or move existing work first.",
					FieldErrors: []command.FieldError{{
						Field:   "wipLimit",
						Message: "The full saved board view is at capacity.",
					}},
					NextAction: command.ReviewFields,
				}
			}
		}
		return nil
	}, nil
}
func hardCounts(ctx context.Context, m *command.Mutation, columns []dbgen.BoardColumn) (map[uuid.UUID]int32, error) {
	totals := map[uuid.UUID]int32{}
	seen := map[uuid.UUID]bool{}
	for _, column := range columns {
		if seen[column.BoardID] {
			continue
		}
		seen[column.BoardID] = true
		b, err := m.Queries.ReadBoard(ctx, column.BoardID)
		if err != nil {
			return nil, err
		}
		filter, err := database.DecodeBoardFilters(b.SavedFilters, b.FiltersVersion)
		if err != nil {
			return nil, err
		}
		if err = validateHardFilter(filter); err != nil {
			return nil, err
		}
		if err = m.Queries.BoardsCustomReadPlan(ctx); err != nil {
			return nil, err
		}
		rows, err := layoutCounts(ctx, m, command.BoardID{UUID: b.ID}, command.ProjectID{UUID: b.ProjectID}, filter, command.IssueFilter{}, nil)
		if err != nil {
			return nil, err
		}
		for _, row := range rows {
			totals[row.ID] = row.SavedCount
		}
	}
	return totals, nil
}
