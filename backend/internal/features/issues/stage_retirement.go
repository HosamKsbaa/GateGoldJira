package issues

import (
	"context"
	"errors"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"github.com/jackc/pgx/v5"
)

// Called only by a board manager's revision-checked workflow transaction.
// Movement retains ordinary issue completion/reopen checks, history and notices.
func (s *Service) RetireStage(ctx context.Context, m *command.Mutation, project command.ProjectID, source, target command.Status) error {
	rows, err := m.Queries.BoardsRetirementIssues(ctx, dbgen.BoardsRetirementIssuesParams{
		ProjectID: project.UUID,
		Status:    string(source),
	})
	if err != nil {
		return err
	}
	if len(rows) > 100 {
		return validation("retireStages", "Move issues in batches first; retire a stage when it has at most 100 issues.")
	}
	for _, id := range rows {
		current, err := readView(ctx, m, command.IssueID{UUID: id})
		if err != nil {
			return err
		}
		args := moveCommand{
			IssueID: current.Summary.ID,
			Fields: MoveIssueFields{
				ExpectedRevision:            current.Summary.Revision,
				TargetStatus:                target,
				ExpectedSourceOrderRevision: current.SourceOrderRevision,
				ExpectedTargetOrderRevision: orderRevision(current, target),
			},
		}
		if _, err := s.applyMove(ctx, m, args, false); err != nil {
			return err
		}
	}
	return nil
}

func initialStage(ctx context.Context, m *command.Mutation, project command.ProjectID) (command.Status, error) {
	board, err := m.Queries.BoardsDefault(ctx, project.UUID)
	if errors.Is(err, pgx.ErrNoRows) {
		return command.Todo, nil
	}
	if err != nil {
		return "", err
	}
	workflow, err := database.DecodeJSON[command.BoardWorkflow](board.Board.Workflow)
	if err != nil {
		return "", err
	}
	for _, column := range workflow.Columns {
		if column.Status.Category() == command.Todo {
			return column.Status, nil
		}
	}
	return "", validation("workflow", "The project needs an unstarted stage before creating issues.")
}
