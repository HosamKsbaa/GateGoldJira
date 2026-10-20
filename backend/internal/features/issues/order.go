package issues

import (
	"context"
	"math"

	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database/dbgen"
)

const RankGap int64 = 1024
const MaximumRebalance int64 = 2000

func rebalance(ctx context.Context, mutation *command.Mutation, project command.ProjectID, status command.Status) error {
	count, err := mutation.Queries.CountColumnForRebalance(ctx, dbgen.CountColumnForRebalanceParams{
		ProjectID: project.UUID,
		Status:    string(status),
	})
	if err != nil {
		return err
	}
	if count > MaximumRebalance {
		return &command.Failure{
			Code:        command.Busy,
			Message:     "This column exceeds the bounded rebalance size.",
			FieldErrors: []command.FieldError{},
			NextAction:  command.None,
		}
	}
	return mutation.Queries.RebalanceColumnRanks(ctx, dbgen.RebalanceColumnRanksParams{
		ProjectID: project.UUID,
		Status:    string(status),
	})
}

// AppendRank changes no content/order revision. The successful owning command
// advances each affected column exactly once after its actual insertion/move.
func AppendRank(ctx context.Context, mutation *command.Mutation, project command.ProjectID, status command.Status) (int64, error) {
	if err := mutation.RequireProjectWrite(project); err != nil {
		return 0, err
	}
	if !status.Valid() {
		return 0, unavailableIssue()
	}
	maximum, err := mutation.Queries.MaximumColumnRank(ctx, dbgen.MaximumColumnRankParams{
		ProjectID: project.UUID,
		Status:    string(status),
	})
	if err != nil {
		return 0, err
	}
	if maximum > math.MaxInt64-RankGap {
		if err := rebalance(ctx, mutation, project, status); err != nil {
			return 0, err
		}
		maximum, err = mutation.Queries.MaximumColumnRank(ctx, dbgen.MaximumColumnRankParams{
			ProjectID: project.UUID,
			Status:    string(status),
		})
		if err != nil {
			return 0, err
		}
	}
	return maximum + RankGap, nil
}

// NeighborRank computes against actual project order, including hidden cards.
// It excludes the moving card and retains its rank when it is already placed.
func NeighborRank(ctx context.Context, mutation *command.Mutation, project command.ProjectID, moving, neighbor command.IssueID, before bool) (int64, error) {
	if moving == neighbor {
		return 0, &command.Failure{
			Code:        command.Validation,
			Message:     "An issue cannot be its own ordering neighbor.",
			FieldErrors: []command.FieldError{},
			NextAction:  command.ReviewFields,
		}
	}
	current, err := readScopedIssue(ctx, mutation, project, moving)
	if err != nil {
		return 0, err
	}
	for attempt := 0; attempt < 2; attempt++ {
		target, err := readScopedIssue(ctx, mutation, project, neighbor)
		if err != nil {
			return 0, err
		}
		if target.Status != current.Status {
			return 0, &command.Failure{
				Code:        command.Validation,
				Message:     "Reordering requires a neighbor in the same status column.",
				FieldErrors: []command.FieldError{},
				NextAction:  command.ReviewFields,
			}
		}
		var left, right int64
		if before {
			right = target.Rank
			left, err = mutation.Queries.RankBefore(ctx, dbgen.RankBeforeParams{
				ProjectID: project.UUID,
				Status:    target.Status,
				Rank:      target.Rank,
				ID:        moving.UUID,
			})
		} else {
			left = target.Rank
			right, err = mutation.Queries.RankAfter(ctx, dbgen.RankAfterParams{
				ProjectID: project.UUID,
				Status:    target.Status,
				Rank:      target.Rank,
				ID:        moving.UUID,
			})
		}
		if err != nil {
			return 0, err
		}
		if current.Rank > left && (right == 0 || current.Rank < right) {
			return current.Rank, nil
		}
		if right == 0 && left <= math.MaxInt64-RankGap {
			return left + RankGap, nil
		}
		if right > left && right-left > 1 {
			return left + (right-left)/2, nil
		}
		if err := rebalance(ctx, mutation, project, command.Status(target.Status)); err != nil {
			return 0, err
		}
		current, err = readScopedIssue(ctx, mutation, project, moving)
		if err != nil {
			return 0, err
		}
	}
	return 0, &command.Failure{
		Code:        command.Busy,
		Message:     "A stable ordering position is temporarily unavailable.",
		FieldErrors: []command.FieldError{},
		NextAction:  command.RetrySameReference,
		Retryable:   true,
	}
}

func AdvanceOrder(ctx context.Context, mutation *command.Mutation, project command.ProjectID, status command.Status) (command.Revision, error) {
	if err := mutation.RequireProjectWrite(project); err != nil {
		return 0, err
	}
	if !status.Valid() {
		return 0, unavailableIssue()
	}
	revision, err := mutation.Queries.AdvanceColumnOrder(ctx, dbgen.AdvanceColumnOrderParams{
		ProjectID: project.UUID,
		Status:    string(status),
	})
	return command.Revision(revision), err
}
