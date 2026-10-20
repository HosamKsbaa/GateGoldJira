package configuration

import (
	"context"
	"errors"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database"
)

type Service struct {
	fieldBackfiller FieldBackfiller
	runner          command.Runner
	cursors         *command.CursorSigner
	stageMigrator   func(context.Context, *command.Mutation, command.ProjectID, command.IssueID, command.StageMigrationTarget) error
}

func New(runner command.Runner, cursors *command.CursorSigner) *Service {
	return &Service{runner: runner, cursors: cursors}
}

func (s *Service) WithStageMigrator(move func(context.Context, *command.Mutation, command.ProjectID, command.IssueID, command.StageMigrationTarget) error) *Service {
	s.stageMigrator = move
	return s
}

// sameMoves ignores board-specific layout, names and WIP settings. A migration
// cannot silently select broader moves from a divergent active workflow copy.
func sameMoves(left, right command.BoardWorkflow) bool {
	if len(left.Columns) != len(right.Columns) {
		return false
	}
	moves := make(map[command.Status]map[command.Status]bool, len(left.Columns))
	for _, source := range left.Columns {
		if _, duplicate := moves[source.Status]; duplicate {
			return false
		}
		targets := make(map[command.Status]bool, len(source.AllowedTargets))
		for _, target := range source.AllowedTargets {
			if targets[target] {
				return false
			}
			targets[target] = true
		}
		moves[source.Status] = targets
	}
	seen := make(map[command.Status]bool, len(right.Columns))
	for _, source := range right.Columns {
		targets, exists := moves[source.Status]
		if !exists || seen[source.Status] || len(targets) != len(source.AllowedTargets) {
			return false
		}
		seen[source.Status] = true
		checked := make(map[command.Status]bool, len(source.AllowedTargets))
		for _, target := range source.AllowedTargets {
			if !targets[target] || checked[target] {
				return false
			}
			checked[target] = true
		}
	}
	return true
}

// Inspect is read-only. Only current company administrators can inspect the
// cross-table migration preflight until project configuration roles are enabled.
func (s *Service) Inspect(ctx context.Context, actor command.Actor, project command.ProjectID) (PreflightResult, error) {
	return command.Read(ctx, s.runner, actor, command.Access{
		AdministratorOnly: true,
		Projects:          []command.ProjectScope{{ProjectID: project}},
	}, func(ctx context.Context, m *command.Mutation) (PreflightResult, error) {
		result := PreflightResult{ProjectID: project, Problems: []PreflightProblem{}}
		boards, err := m.Queries.ConfigurationLegacyBoards(ctx, project.UUID)
		if err != nil {
			return result, err
		}
		result.LegacyBoards = int32(len(boards))
		var current *command.BoardWorkflow
		for _, board := range boards {
			workflow, err := database.DecodeJSON[command.BoardWorkflow](board.Workflow)
			if err != nil {
				return result, errors.New("legacy workflow cannot be decoded; repair its configuration before migration")
			}
			if board.ArchivedAt.Valid {
				continue
			}
			if current == nil {
				current = &workflow
				continue
			}
			if !sameMoves(*current, workflow) {
				result.Problems = append(result.Problems, PreflightProblem{
					Code:      DifferentWorkflow,
					Reference: board.ID.String(),
					Message:   "Active board workflow copies disagree. Reconcile allowed moves before selecting a canonical workflow.",
				})
			}
		}
		collisions, err := m.Queries.ConfigurationAssetCollisions(ctx, project.UUID)
		if err != nil {
			return result, err
		}
		for _, collision := range collisions {
			result.Problems = append(result.Problems, PreflightProblem{
				Code:      ProblemCode(collision.Code),
				Reference: collision.Reference,
				Message:   "Legacy image and file identities collide. A documented compatibility mapping is required before consolidation.",
			})
		}
		if len(result.Problems) > 100 {
			result.Problems = result.Problems[:100]
			result.MoreProblems = true
		}
		result.Ready = len(result.Problems) == 0 && !result.MoreProblems
		return result, nil
	})
}
