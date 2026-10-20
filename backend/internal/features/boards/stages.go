package boards

import (
	"context"
	"encoding/json"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"strings"
)

// Workflow saves reconcile names, transitions and stage limits across the project.
// A retirement preserves the stage identity and moves its work transactionally.
func (s *Service) expandStages(ctx context.Context, m *command.Mutation, board BoardSummary, workflow command.BoardWorkflow, retirements []command.StageRetirement) error {
	records, err := m.Queries.BoardsStageRecords(ctx, board.ProjectID.UUID)
	if err != nil {
		return err
	}
	known := map[command.Status]bool{}
	retired := map[command.Status]bool{}
	for _, r := range records {
		known[command.Status(r.Status)] = true
		retired[command.Status(r.Status)] = r.Retired
	}
	retained := map[command.Status]bool{}
	for _, column := range workflow.Columns {
		if retired[column.Status] {
			return validation("workflow", "A retired stage cannot be reused. Add a new stage instead.")
		}
		retained[column.Status] = true
		if !known[column.Status] {
			if err := m.Queries.BoardsRegisterStage(ctx, dbgen.BoardsRegisterStageParams{
				ProjectID: board.ProjectID.UUID,
				Status:    string(column.Status),
				StageName: column.Name,
			}); err != nil {
				return err
			}
		}
		if err := m.Queries.BoardsUpdateStageName(ctx, dbgen.BoardsUpdateStageNameParams{
			ProjectID: board.ProjectID.UUID,
			Status:    string(column.Status),
			StageName: column.Name,
		}); err != nil {
			return err
		}
	}
	replacements := map[command.Status]command.Status{}
	for _, r := range retirements {
		if !known[r.Status] || retired[r.Status] || retained[r.Status] || !retained[r.Replacement] || r.Status == r.Replacement || replacements[r.Status] != "" {
			return validation("retireStages", "Choose one active replacement for each stage being removed.")
		}
		replacements[r.Status] = r.Replacement
	}
	for _, column := range boardWorkflow(board).Columns {
		if !retained[column.Status] && replacements[column.Status] == "" {
			return validation("retireStages", "Choose a replacement before removing a stage. Its issues and history will be preserved.")
		}
	}
	for _, r := range retirements {
		if s.stageMover == nil {
			return validation("retireStages", "Stage migration is unavailable.")
		}
		if err := s.stageMover(ctx, m, board.ProjectID, r.Status, r.Replacement); err != nil {
			return err
		}
		if err := m.Queries.BoardsRetireStage(ctx, dbgen.BoardsRetireStageParams{
			ProjectID: board.ProjectID.UUID,
			Status:    string(r.Status),
		}); err != nil {
			return err
		}
	}
	data, err := json.Marshal(workflow)
	if err != nil {
		return err
	}
	rows, err := m.Queries.BoardsProjectWorkflows(ctx, board.ProjectID.UUID)
	if err != nil {
		return err
	}
	for _, row := range rows {
		if row.ID == board.ID.UUID {
			continue
		}
		filter, err := database.DecodeJSON[command.IssueFilter](row.SavedFilters)
		if err != nil {
			return err
		}
		oldFilters, err := json.Marshal(filter)
		if err != nil {
			return err
		}
		filter = remapStageFilters(filter, retirements)
		filters, err := json.Marshal(filter)
		if err != nil {
			return err
		}
		existing, err := decodeWorkflow(row.Workflow)
		if err != nil {
			return err
		}
		oldWorkflow, err := json.Marshal(existing)
		if err != nil {
			return err
		}
		if string(oldWorkflow) == string(data) && string(oldFilters) == string(filters) {
			continue
		}
		if err := m.Queries.BoardsSaveExpandedWorkflow(ctx, dbgen.BoardsSaveExpandedWorkflowParams{ID: row.ID, Column2: data, Column3: filters}); err != nil {
			return err
		}
	}
	return nil
}

// Bare category filters continue to include all active stages in that category.
func remapStageFilters(filter command.IssueFilter, retirements []command.StageRetirement) command.IssueFilter {
	for i, status := range filter.Statuses {
		if !strings.Contains(string(status), ":") {
			continue
		}
		for _, retirement := range retirements {
			if status == retirement.Status {
				filter.Statuses[i] = retirement.Replacement
			}
		}
	}
	normalized, err := command.NormalizeIssueFilter(filter)
	if err == nil {
		return normalized
	}
	return filter
}
