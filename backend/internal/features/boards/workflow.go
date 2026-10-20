package boards

import (
	"context"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database"
	"sort"
	"strings"
)

func defaultWorkflow() command.BoardWorkflow {
	statuses := []command.Status{command.Todo, command.InProgress, command.Review, command.Done}
	names := []string{"To do", "In progress", "Review", "Done"}
	result := command.BoardWorkflow{Columns: []command.WorkflowColumn{}}
	for i, status := range statuses {
		targets := []command.Status{}
		for _, target := range statuses {
			if target != status {
				targets = append(targets, target)
			}
		}
		result.Columns = append(result.Columns, command.WorkflowColumn{
			Status:         status,
			Name:           names[i],
			AllowedTargets: targets,
		})
	}
	return result
}
func normalizeWorkflow(input command.BoardWorkflow) (command.BoardWorkflow, error) {
	if len(input.Columns) < 2 {
		return input, validation("workflow", "Keep at least one unstarted stage and one completed stage.")
	}
	statuses := map[command.Status]bool{}
	names := map[string]bool{}
	reverse := map[command.Status][]command.Status{}
	for index, column := range input.Columns {
		column.Name = strings.TrimSpace(column.Name)
		key := strings.ToLower(column.Name)
		if !column.Status.Valid() || statuses[column.Status] || command.ValidateText(column.Name, 1, 60) != nil || names[key] {
			return input, validation("workflow", "Use distinct stage identifiers and unique names of 1–60 characters.")
		}
		if column.AllowedTargets == nil {
			return input, validation("workflow", "Supply allowed moves for every stage.")
		}
		statuses[column.Status] = true
		names[key] = true
		input.Columns[index] = column
	}
	hasTodo, hasDone := false, false
	for _, column := range input.Columns {
		hasTodo = hasTodo || column.Status.Category() == command.Todo
		hasDone = hasDone || column.Status.Category() == command.Done
		if column.WarningLimit != nil && (*column.WarningLimit < 0 || *column.WarningLimit > 1000) {
			return input, validation("workflow", "Use a WIP limit of 0 (unlimited) through 1000.")
		}
	}
	if !hasTodo || !hasDone {
		return input, validation("workflow", "Keep an unstarted stage and a completed stage.")
	}
	for index, column := range input.Columns {
		seen := map[command.Status]bool{}
		for _, target := range column.AllowedTargets {
			if !statuses[target] || target == column.Status || seen[target] {
				return input, validation("workflow", "Allowed moves must be distinct stages in this workflow.")
			}
			seen[target] = true
			reverse[target] = append(reverse[target], column.Status)
		}
		column.AllowedTargets = append([]command.Status{}, column.AllowedTargets...)
		sort.Slice(column.AllowedTargets, func(i, j int) bool { return column.AllowedTargets[i] < column.AllowedTargets[j] })
		input.Columns[index] = column
	}
	// Walk the reversed graph once, with no recursion or fixed stage limit.
	reached := map[command.Status]bool{}
	queue := []command.Status{}
	for _, column := range input.Columns {
		if column.Status.Category() == command.Done {
			reached[column.Status] = true
			queue = append(queue, column.Status)
		}
	}
	for len(queue) > 0 {
		current := queue[0]
		queue = queue[1:]
		for _, source := range reverse[current] {
			if !reached[source] {
				reached[source] = true
				queue = append(queue, source)
			}
		}
	}
	for _, column := range input.Columns {
		if !reached[column.Status] {
			return input, validation("workflow", "Every unfinished stage needs a path to a completed stage. Add an allowed move before saving.")
		}
	}
	return input, nil
}
func boardWorkflow(board BoardSummary) command.BoardWorkflow {
	if board.Workflow == nil {
		return defaultWorkflow()
	}
	return *board.Workflow
}
func (s *Service) checkTransition(ctx context.Context, m *command.Mutation, project command.ProjectID, id *command.BoardID, source, target command.Status) error {
	if source == target {
		return nil
	}
	// Until the next shared workflow save, honor every existing active board's
	// restrictions. Choosing another board or transport cannot bypass a rule.
	rows, err := m.Queries.BoardsActiveWorkflows(ctx, project.UUID)
	if err != nil {
		return err
	}
	if len(rows) == 0 {
		return validation("workflow", "This project has no active workflow.")
	}
	for _, row := range rows {
		workflow, err := decodeWorkflow(row.Workflow)
		if err != nil {
			return err
		}
		allowed := false
		for _, column := range workflow.Columns {
			if column.Status != source {
				continue
			}
			for _, destination := range column.AllowedTargets {
				if destination == target {
					allowed = true
				}
			}
		}
		if !allowed {
			return validation("targetStatus", "The project workflow does not allow this move. Review the allowed destinations in board settings.")
		}
	}
	return nil
}
func decodeWorkflow(data []byte) (*command.BoardWorkflow, error) {
	workflow, err := database.DecodeJSON[command.BoardWorkflow](data)
	if err != nil {
		return nil, err
	}
	workflow, err = normalizeWorkflow(workflow)
	return &workflow, err
}
