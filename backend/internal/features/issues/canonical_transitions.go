package issues

import (
	"context"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"github.com/google/uuid"
)

type TransitionOptionsInput struct {
	IssueID command.IssueID     `json:"issueId"`
	Page    command.PageRequest `json:"page,omitempty"`
}
type IssueTransitionOption struct {
	TransitionID       command.TransitionID                           `json:"transitionId"`
	Stage              command.StageChoice                            `json:"stage"`
	RequiredPermission command.Nullable[command.TransitionPermission] `json:"requiredPermission"`
	ReviewSatisfied    bool                                           `json:"reviewSatisfied"`
	RequiresApproval   bool                                           `json:"requiresApproval"`
	CanRequest         bool                                           `json:"canRequest"`
}
type transitionOptionPosition struct {
	ID uuid.UUID `json:"id"`
}

func (s *Service) TransitionOptions(ctx context.Context, actor command.Actor, input TransitionOptionsInput) (command.Page[IssueTransitionOption], error) {
	empty := command.Page[IssueTransitionOption]{}
	limit, err := input.Page.Size()
	if err != nil {
		return empty, err
	}
	return command.ReadResolved(ctx, s.runner, actor, command.Access{RepeatableRead: true}, issueScopes(input.IssueID, false), func(ctx context.Context, m *command.Mutation) (command.Page[IssueTransitionOption], error) {
		current, err := readModernView(ctx, m, input.IssueID)
		if err != nil {
			return empty, err
		}
		reviews, err := m.Queries.IssuesAvailableReviewCounts(ctx, dbgen.IssuesAvailableReviewCountsParams{
			IssueID:       input.IssueID.UUID,
			IssueRevision: int64(current.Summary.Revision),
			ReporterID:    current.Reporter.ID.UUID,
			ProjectID:     current.Summary.ProjectID.UUID,
			WorkflowID:    current.Summary.Workflow.ID.UUID,
			StageID:       current.Summary.Stage.ID.UUID,
		})
		if err != nil {
			return empty, err
		}
		byTransition := map[uuid.UUID]dbgen.IssuesAvailableReviewCountsRow{}
		for _, review := range reviews {
			byTransition[review.TransitionID] = review
		}
		var workflowRevision, configurationRevision int64
		if len(reviews) > 0 {
			workflowRevision = reviews[0].WorkflowRevision
			configurationRevision = reviews[0].ConfigurationRevision
		}
		scope, err := command.CursorScopeFor(command.ListIssueTransitions, actor.UserID, "transitionId", struct {
			Issue                 command.IssueID
			Stage                 command.StageID
			IssueRevision         command.Revision
			WorkflowRevision      int64
			ConfigurationRevision int64
		}{input.IssueID, current.Summary.Stage.ID, current.Summary.Revision, workflowRevision, configurationRevision})
		if err != nil {
			return empty, err
		}
		position := transitionOptionPosition{}
		if input.Page.Cursor != nil {
			position, err = command.ReadCursor[transitionOptionPosition](s.cursors, scope, *input.Page.Cursor)
			if err != nil {
				return empty, err
			}
		}
		rows, err := m.Queries.IssuesCanonicalAvailableTransitions(ctx, dbgen.IssuesCanonicalAvailableTransitionsParams{
			ProjectID:  current.Summary.ProjectID.UUID,
			WorkflowID: current.Summary.Workflow.ID.UUID,
			StageID:    current.Summary.Stage.ID.UUID,
			HasCursor:  input.Page.Cursor != nil,
			AfterID:    position.ID,
			PageSize:   int32(limit + 1),
		})
		if err != nil {
			return empty, err
		}
		count, err := m.Queries.IssuesCanonicalAvailableTransitionCount(ctx, dbgen.IssuesCanonicalAvailableTransitionCountParams{
			ProjectID:   current.Summary.ProjectID.UUID,
			WorkflowID:  current.Summary.Workflow.ID.UUID,
			FromStageID: current.Summary.Stage.ID.UUID,
		})
		if err != nil {
			return empty, err
		}
		permissions, err := m.ProjectPermissions(current.Summary.ProjectID)
		if err != nil {
			return empty, err
		}
		items := make([]IssueTransitionOption, 0, len(rows))
		for _, row := range rows {
			stage := row.WorkflowStage
			var role *command.TransitionPermission
			canRequest := permissions.CanWrite
			if row.RequiredPermission != nil {
				value := command.TransitionPermission(*row.RequiredPermission)
				role = &value
				if value == command.TransitionProjectAdmin {
					canRequest = canRequest && permissions.CanConfigure
				}
			}
			items = append(items, IssueTransitionOption{
				TransitionID: command.TransitionID{UUID: row.ID},
				Stage: command.StageChoice{
					ID:             command.StageID{UUID: stage.ID},
					Name:           stage.Name,
					Category:       command.Status(stage.Category),
					Position:       command.Position(stage.Position),
					Initial:        stage.IsInitial,
					AcceptsEntries: stage.AcceptsEntries,
					Retired:        stage.Retired,
				},
				RequiredPermission: command.Nullable[command.TransitionPermission]{Value: role},
				RequiresApproval:   row.ApprovalsRequired > 0,
				ReviewSatisfied:    !byTransition[row.ID].Rejected && byTransition[row.ID].Approved >= int32(row.ApprovalsRequired),
				CanRequest:         canRequest,
			})
		}
		return command.BuildPage(s.cursors, scope, items, limit, int(count), false, func(v IssueTransitionOption) transitionOptionPosition {
			return transitionOptionPosition{v.TransitionID.UUID}
		})
	})
}
