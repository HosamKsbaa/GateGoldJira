package boards

import (
	"context"
	"errors"
	"gategoldjira/backend/internal/features/activity"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"math"
)

type Placement string

const (
	PlaceBefore Placement = "before"
	PlaceAfter  Placement = "after"
	PlaceLast   Placement = "last"
)

type NativeMoveFields struct {
	IssueID                     command.IssueID     `json:"issueId"`
	ExpectedIssueRevision       command.Revision    `json:"expectedIssueRevision"`
	ExpectedBoardRevision       command.Revision    `json:"expectedBoardRevision"`
	SourceColumnID              *command.ColumnID   `json:"sourceColumnId" nullable:"true"`
	ExpectedSourceOrderRevision *command.Revision   `json:"expectedSourceOrderRevision" nullable:"true"`
	TargetColumnID              command.ColumnID    `json:"targetColumnId"`
	ExpectedTargetOrderRevision command.Revision    `json:"expectedTargetOrderRevision"`
	TargetStageID               *command.StageID    `json:"targetStageId" nullable:"true"`
	NeighborIssueID             *command.IssueID    `json:"neighborIssueId" nullable:"true"`
	Placement                   Placement           `json:"placement" enum:"before,after,last"`
	TemporaryFilters            command.IssueFilter `json:"temporaryFilters,omitempty"`
}
type NativeMoveInput struct {
	BoardID command.BoardID `json:"boardId"`
	NativeMoveFields
	RetryReference string `json:"retryReference" format:"uuid"`
}
type NativeMoveResult struct {
	Issue  command.ModernIssueView `json:"issue"`
	Layout LayoutView              `json:"layout"`
}
type NativeMover func(context.Context, *command.Mutation, command.IssueID, command.Revision, command.StageID) (command.Change[command.ModernIssueView], error)

func (s *Service) WithNativeMover(move NativeMover) { s.nativeMover = move }
func columnForStage(v LayoutView, id command.StageID) *LayoutColumn {
	for i := range v.Columns {
		for _, mapped := range v.Columns[i].Stages {
			if mapped.Stage.ID == id {
				return &v.Columns[i]
			}
		}
	}
	return nil
}
func columnByID(v LayoutView, id command.ColumnID) *LayoutColumn {
	for i := range v.Columns {
		if v.Columns[i].ID == id {
			return &v.Columns[i]
		}
	}
	return nil
}
func orderConflict() error {
	return &command.Failure{
		Code:        command.Conflict,
		Message:     "The board layout or card order changed. Reload before placing this card.",
		FieldErrors: []command.FieldError{},
		NextAction:  command.ReloadCurrentState,
	}
}

func (s *Service) MoveCard(ctx context.Context, actor command.Actor, input NativeMoveInput) (command.SaveOutcome[NativeMoveResult], error) {
	return s.saveCard(ctx, actor, input, command.MoveBoardCard)
}
func (s *Service) ReorderCard(ctx context.Context, actor command.Actor, input NativeMoveInput) (command.SaveOutcome[NativeMoveResult], error) {
	if input.SourceColumnID == nil || *input.SourceColumnID != input.TargetColumnID || input.TargetStageID != nil {
		return command.SaveOutcome[NativeMoveResult]{}, validation("targetColumnId", "Reordering stays in the current column and retains the issue's current stage.")
	}
	return s.saveCard(ctx, actor, input, command.ReorderBoardCard)
}
func (s *Service) saveCard(ctx context.Context, actor command.Actor, input NativeMoveInput, operation command.Operation) (command.SaveOutcome[NativeMoveResult], error) {
	empty := command.SaveOutcome[NativeMoveResult]{}
	if input.ExpectedIssueRevision < 1 || input.ExpectedBoardRevision < 1 || input.ExpectedTargetOrderRevision < 1 || input.TargetColumnID.UUID == uuid.Nil || (input.Placement != PlaceBefore && input.Placement != PlaceAfter && input.Placement != PlaceLast) || (input.Placement == PlaceLast) != (input.NeighborIssueID == nil) || (input.SourceColumnID == nil) != (input.ExpectedSourceOrderRevision == nil) {
		return empty, validation("placement", "Supply current board, issue and column revisions, and an anchor for before/after placement.")
	}
	if input.NeighborIssueID != nil && *input.NeighborIssueID == input.IssueID {
		return empty, validation("neighborIssueId", "An issue cannot be its own anchor.")
	}
	request := command.MutationRequest{
		Actor:           actor,
		Operation:       operation,
		RetryReference:  input.RetryReference,
		ResolveProjects: boardScopes(input.BoardID, true),
		Access:          command.Access{SharedMetadata: operation == command.ReorderBoardCard},
	}
	return command.Save(ctx, s.runner, request, input, func(ctx context.Context, m *command.Mutation) error {
		b, err := readLayoutBoard(ctx, m, input.BoardID)
		if err != nil {
			return err
		}
		i, err := m.Queries.ReadIssue(ctx, input.IssueID.UUID)
		if err != nil || i.ProjectID != b.ProjectID.UUID {
			return unavailable()
		}
		if b.Archived {
			return forbidden("Restore the board before moving cards.")
		}
		return nil
	}, func(ctx context.Context, m *command.Mutation, in NativeMoveInput) (command.Change[NativeMoveResult], error) {
		empty := command.Change[NativeMoveResult]{}
		view, err := s.layout(ctx, m, in.BoardID, in.TemporaryFilters)
		if err != nil {
			return empty, err
		}
		project, err := m.Queries.ReadProject(ctx, view.Board.ProjectID.UUID)
		if err != nil {
			return empty, err
		}
		if project.CoreMode != "modern" {
			if _, err := m.Tx.Exec(ctx, "UPDATE projects SET core_mode='modern' WHERE id=$1 AND core_mode<>'modern'", project.ID); err != nil {
				return empty, err
			}
			project.CoreMode = "modern"
		}
		if view.Board.Revision != in.ExpectedBoardRevision {
			return empty, orderConflict()
		}
		issue, err := m.Queries.ReadIssue(ctx, in.IssueID.UUID)
		if err != nil {
			return empty, err
		}
		if issue.Archived || issue.Backlog {
			return empty, validation("issueId", "Only active board cards can be reordered.")
		}
		if command.Revision(issue.Revision) != in.ExpectedIssueRevision {
			return empty, orderConflict()
		}
		source := columnForStage(view, command.StageID{UUID: *issue.StageID})
		target := columnByID(view, in.TargetColumnID)
		if target == nil || target.OrderRevision != in.ExpectedTargetOrderRevision {
			return empty, orderConflict()
		}
		if source != nil {
			if in.SourceColumnID == nil || *in.SourceColumnID != source.ID || *in.ExpectedSourceOrderRevision != source.OrderRevision {
				return empty, orderConflict()
			}
		} else if in.SourceColumnID != nil {
			return empty, orderConflict()
		}
		columns := []uuid.UUID{target.ID.UUID}
		if source != nil && source.ID != target.ID {
			columns = append(columns, source.ID.UUID)
		}
		locked, err := m.Queries.BoardsLockColumns(ctx, dbgen.BoardsLockColumnsParams{
			BoardID:   in.BoardID.UUID,
			ColumnIds: columns,
		})
		if err != nil {
			return empty, err
		}
		for _, column := range locked {
			expected := in.ExpectedTargetOrderRevision
			if source != nil && column.ID == source.ID.UUID {
				expected = *in.ExpectedSourceOrderRevision
			}
			if command.Revision(column.OrderRevision) != expected {
				return empty, orderConflict()
			}
		}
		orderIssues := []uuid.UUID{in.IssueID.UUID}
		if in.NeighborIssueID != nil {
			orderIssues = append(orderIssues, in.NeighborIssueID.UUID)
		}
		if _, err = m.Queries.BoardsLockOrderIssues(ctx, dbgen.BoardsLockOrderIssuesParams{
			ProjectID: view.Board.ProjectID.UUID,
			IssueIds:  orderIssues,
		}); err != nil {
			return empty, err
		}
		stage := command.StageID{UUID: *issue.StageID}
		if in.TargetStageID != nil {
			stage = *in.TargetStageID
		} else if source == nil || source.ID != target.ID {
			p, err := m.ProjectPermissions(view.Board.ProjectID)
			if err != nil {
				return empty, err
			}
			choices, err := m.Queries.BoardsEligibleDropStages(ctx, dbgen.BoardsEligibleDropStagesParams{
				BoardID:      in.BoardID.UUID,
				ColumnID:     target.ID.UUID,
				WorkflowID:   *issue.WorkflowID,
				FromStageID:  *issue.StageID,
				CanConfigure: p.CanConfigure,
			})
			if err != nil {
				return empty, err
			}
			if len(choices) != 1 {
				return empty, validation("targetStageId", "Choose the destination stage explicitly when a column has multiple eligible stages.")
			}
			stage = command.StageID{UUID: choices[0]}
		}
		mapped := columnForStage(view, stage)
		if mapped == nil || mapped.ID != target.ID {
			return empty, validation("targetStageId", "The destination stage must be mapped to this board column.")
		}
		parameters := countsParams(view.Board.ProjectID, view.Board.SavedFilters, in.TemporaryFilters, actor)
		if in.NeighborIssueID != nil {
			visible, err := m.Queries.BoardsVisibleIssue(ctx, visibleIssueParams(in.BoardID, target.ID, *in.NeighborIssueID, parameters, project.Key))
			if err != nil {
				return empty, err
			}
			if !visible {
				return empty, validation("neighborIssueId", "The anchor must still be visible in this column and its current filters.")
			}
		}
		if s.nativeMover == nil {
			return empty, validation("workflow", "Native movement is not configured.")
		}
		// A rank-only operation reuses the shared mover's no-op result. A stage
		// change uses its complete workflow, graph, completion and notification rules.
		moved, err := s.nativeMover(ctx, m, in.IssueID, in.ExpectedIssueRevision, stage)
		if err != nil {
			return empty, err
		}
		oldRank, rankErr := m.Queries.BoardsRankForIssue(ctx, dbgen.BoardsRankForIssueParams{
			BoardID: in.BoardID.UUID,
			IssueID: in.IssueID.UUID,
		})
		if rankErr != nil && !errors.Is(rankErr, pgx.ErrNoRows) {
			return empty, rankErr
		}
		rank, err := boardPlacementRank(ctx, m, view.Board.ProjectID, in.BoardID, target.ID, in.IssueID, in.NeighborIssueID, in.Placement)
		if err != nil {
			return empty, err
		}
		unchanged := rankErr == nil && oldRank.ColumnID == target.ID.UUID && oldRank.Rank == rank && moved.EventID == nil
		event := moved.EventID
		if !unchanged {
			if err = m.Queries.BoardsPutRank(ctx, dbgen.BoardsPutRankParams{
				ProjectID: view.Board.ProjectID.UUID,
				BoardID:   in.BoardID.UUID,
				ColumnID:  target.ID.UUID,
				IssueID:   in.IssueID.UUID,
				Rank:      rank,
			}); err != nil {
				return empty, err
			}
			if moved.EventID == nil {
				if _, err = m.Queries.BoardsAdvanceColumn(ctx, target.ID.UUID); err != nil {
					return empty, err
				}
				if source != nil && source.ID != target.ID {
					if _, err = m.Queries.BoardsAdvanceColumn(ctx, source.ID.UUID); err != nil {
						return empty, err
					}
				}
			}
			if event == nil {
				name := target.Name
				record, err := activity.Append(ctx, m, activity.Draft{
					Action:       operation,
					ResourceKind: activity.BoardResource,
					ResourceID:   in.BoardID.UUID,
					ProjectID:    &view.Board.ProjectID,
					IssueID:      &in.IssueID,
					Changes:      []activity.FieldChange{{Field: "cardOrder", After: &name}},
				})
				if err != nil {
					return empty, err
				}
				id := record.ID.String()
				event = &id
			}
		}
		final, err := s.layout(ctx, m, in.BoardID, in.TemporaryFilters)
		return command.Change[NativeMoveResult]{
			Result:     NativeMoveResult{Issue: moved.Result, Layout: final},
			EventID:    event,
			HTTPStatus: 200,
		}, err
	}, func(v NativeMoveResult) error { return validateLayout(v.Layout) })
}

func rebalanceBoard(ctx context.Context, m *command.Mutation, project command.ProjectID, board command.BoardID, column command.ColumnID) error {
	rows, err := m.Queries.BoardsOrderPrefix(ctx, dbgen.BoardsOrderPrefixParams{BoardID: board.UUID, ColumnID: column.UUID})
	if err != nil {
		return err
	}
	if len(rows) > 2000 {
		return &command.Failure{
			Code:        command.Busy,
			Message:     "This order requires more than the bounded 2,000-card rebalance. Retry after the column is reduced.",
			FieldErrors: []command.FieldError{},
			NextAction:  command.ReloadCurrentState,
		}
	}
	ids := make([]uuid.UUID, 0, len(rows))
	for _, row := range rows {
		ids = append(ids, row.ID)
	}
	if len(ids) > 0 {
		return m.Queries.BoardsPutRanks(ctx, dbgen.BoardsPutRanksParams{
			ProjectID: project.UUID,
			BoardID:   board.UUID,
			ColumnID:  column.UUID,
			IssueIds:  ids,
		})
	}
	return nil
}
func boardPlacementRank(ctx context.Context, m *command.Mutation, project command.ProjectID, board command.BoardID, column command.ColumnID, moving command.IssueID, neighbor *command.IssueID, placement Placement) (int64, error) {
	for attempt := 0; attempt < 2; attempt++ {
		var left, right int64
		if neighbor == nil {
			last, err := m.Queries.BoardsLastUnranked(ctx, dbgen.BoardsLastUnrankedParams{
				ProjectID: project.UUID,
				BoardID:   board.UUID,
				ColumnID:  column.UUID,
				MovingID:  moving.UUID,
			})
			if err == nil {
				if err = materializeBoardPrefix(ctx, m, project, board, column, moving, command.IssueID{UUID: last}); err != nil {
					return 0, err
				}
			} else if !errors.Is(err, pgx.ErrNoRows) {
				return 0, err
			}
			value, err := m.Queries.BoardsRankMaximum(ctx, dbgen.BoardsRankMaximumParams{
				BoardID:  board.UUID,
				ColumnID: column.UUID,
				IssueID:  moving.UUID,
			})
			if err != nil {
				return 0, err
			}
			left = value
		} else {
			anchor, err := m.Queries.BoardsRankForIssue(ctx, dbgen.BoardsRankForIssueParams{BoardID: board.UUID, IssueID: neighbor.UUID})
			if errors.Is(err, pgx.ErrNoRows) {
				if err = materializeBoardPrefix(ctx, m, project, board, column, moving, *neighbor); err != nil {
					return 0, err
				}
				continue
			}
			if err != nil {
				return 0, err
			}
			tied, err := m.Queries.BoardsRankHasTie(ctx, dbgen.BoardsRankHasTieParams{
				BoardID:  board.UUID,
				ColumnID: column.UUID,
				Rank:     anchor.Rank,
			})
			if err != nil {
				return 0, err
			}
			if tied {
				if err = rebalanceBoard(ctx, m, project, board, column); err != nil {
					return 0, err
				}
				continue
			}
			if placement == PlaceBefore {
				right = anchor.Rank
				left, err = m.Queries.BoardsRankBefore(ctx, dbgen.BoardsRankBeforeParams{
					BoardID:  board.UUID,
					ColumnID: column.UUID,
					IssueID:  moving.UUID,
					Rank:     right,
				})
			} else {
				left = anchor.Rank
				right, err = m.Queries.BoardsRankAfter(ctx, dbgen.BoardsRankAfterParams{
					BoardID:  board.UUID,
					ColumnID: column.UUID,
					IssueID:  moving.UUID,
					Rank:     left,
				})
			}
			if err != nil {
				return 0, err
			}
		}
		current, err := m.Queries.BoardsRankForIssue(ctx, dbgen.BoardsRankForIssueParams{BoardID: board.UUID, IssueID: moving.UUID})
		if err == nil && current.ColumnID == column.UUID && current.Rank > left && (right == 0 || current.Rank < right) {
			return current.Rank, nil
		}
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return 0, err
		}
		if right == 0 && left <= math.MaxInt64-1024 {
			return left + 1024, nil
		}
		if right-left > 1 {
			return left + (right-left)/2, nil
		}
		if err = rebalanceBoard(ctx, m, project, board, column); err != nil {
			return 0, err
		}
	}
	return 0, &command.Failure{
		Code:        command.Busy,
		Message:     "A stable card position is unavailable. Retry with the same reference.",
		FieldErrors: []command.FieldError{},
		NextAction:  command.RetrySameReference,
		Retryable:   true,
	}
}

func materializeBoardPrefix(ctx context.Context, m *command.Mutation, project command.ProjectID, board command.BoardID, column command.ColumnID, moving, anchor command.IssueID) error {
	rows, err := m.Queries.BoardsUnrankedPrefix(ctx, dbgen.BoardsUnrankedPrefixParams{
		ProjectID: project.UUID,
		BoardID:   board.UUID,
		ColumnID:  column.UUID,
		MovingID:  moving.UUID,
		AnchorID:  anchor.UUID,
	})
	if err != nil {
		return err
	}
	if len(rows) > 2000 {
		return &command.Failure{
			Code:        command.Busy,
			Message:     "This unranked anchor exceeds the bounded 2,000-card prefix. Choose a nearer anchor.",
			FieldErrors: []command.FieldError{},
			NextAction:  command.ReloadCurrentState,
		}
	}
	maximum, err := m.Queries.BoardsRankMaximum(ctx, dbgen.BoardsRankMaximumParams{
		BoardID:  board.UUID,
		ColumnID: column.UUID,
		IssueID:  moving.UUID,
	})
	if err != nil {
		return err
	}
	if maximum > math.MaxInt64-int64(len(rows)+1)*1024 {
		return rebalanceBoard(ctx, m, project, board, column)
	}
	if len(rows) > 0 {
		return m.Queries.BoardsPutRanks(ctx, dbgen.BoardsPutRanksParams{
			ProjectID: project.UUID,
			BoardID:   board.UUID,
			ColumnID:  column.UUID,
			IssueIds:  rows,
			BaseRank:  maximum,
		})
	}
	return nil
}
