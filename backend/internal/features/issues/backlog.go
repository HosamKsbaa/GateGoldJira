package issues

import (
	"context"
	"errors"
	"gategoldjira/backend/internal/features/activity"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"github.com/google/uuid"
	"math"
	"strconv"
)

type BacklogInput struct {
	ProjectID command.ProjectID   `json:"projectId"`
	Page      command.PageRequest `json:"page,omitempty"`
}
type BacklogPage struct {
	ModernItems []ModernIssueSummary `json:"modernItems,omitempty"`
	command.Page[IssueSummary]
	OrderRevision command.Revision `json:"orderRevision"`
}
type backlogPosition struct {
	Rank int64     `json:"rank"`
	ID   uuid.UUID `json:"id"`
}
type backlogScope struct {
	ProjectID command.ProjectID `json:"projectId"`
	Revision  command.Revision  `json:"revision"`
}
type BacklogReorderFields struct {
	ExpectedRevision      command.Revision `json:"expectedRevision"`
	ExpectedOrderRevision command.Revision `json:"expectedOrderRevision"`
	NeighborID            command.IssueID  `json:"neighborId"`
	Before                bool             `json:"before"`
}
type BacklogReorderInput struct {
	IssueID command.IssueID `json:"issueId"`
	BacklogReorderFields
	RetryReference string `json:"retryReference" format:"uuid"`
}
type BacklogChange struct {
	Issue         IssueView        `json:"issue"`
	OrderRevision command.Revision `json:"orderRevision"`
}

func appendBacklogRank(ctx context.Context, m *command.Mutation, project command.ProjectID) (int64, error) {
	maximum, err := m.Queries.BacklogMaximumRank(ctx, project.UUID)
	if err != nil {
		return 0, err
	}
	if maximum > math.MaxInt64-RankGap {
		return 0, &command.Failure{
			Code:        command.Busy,
			Message:     "Planning order needs maintenance before another item can be appended.",
			FieldErrors: []command.FieldError{},
			NextAction:  command.None,
		}
	}
	return maximum + RankGap, nil
}

func (s *Service) Backlog(ctx context.Context, actor command.Actor, in BacklogInput) (BacklogPage, error) {
	limit, err := in.Page.Size()
	if err != nil {
		return BacklogPage{}, err
	}
	return command.Read(ctx, s.runner, actor, command.Access{
		Projects:       []command.ProjectScope{{ProjectID: in.ProjectID}},
		RepeatableRead: true,
	}, func(ctx context.Context, m *command.Mutation) (BacklogPage, error) {
		revision, err := m.Queries.BacklogOrder(ctx, in.ProjectID.UUID)
		if err != nil {
			return BacklogPage{}, err
		}
		scope, err := command.CursorScopeFor(command.ListBacklog, actor.UserID, "backlog_rank ASC,id ASC", backlogScope{in.ProjectID, command.Revision(revision)})
		if err != nil {
			return BacklogPage{}, err
		}
		var after backlogPosition
		if in.Page.Cursor != nil {
			after, err = command.ReadCursor[backlogPosition](s.cursors, scope, *in.Page.Cursor)
			if err != nil {
				return BacklogPage{}, err
			}
		}
		rows, err := m.Queries.BacklogList(ctx, dbgen.BacklogListParams{
			ProjectID: in.ProjectID.UUID,
			HasCursor: in.Page.Cursor != nil,
			AfterRank: after.Rank,
			AfterID:   after.ID,
			PageSize:  int32(limit + 1),
		})
		if err != nil {
			return BacklogPage{}, err
		}
		total, err := m.Queries.BacklogCount(ctx, in.ProjectID.UUID)
		if err != nil {
			return BacklogPage{}, err
		}
		items := []IssueSummary{}
		positions := map[command.IssueID]backlogPosition{}
		for _, row := range rows {
			item, err := Summary(dbgen.IssuesGetRow(row), actor.Today)
			if err != nil {
				return BacklogPage{}, err
			}
			items = append(items, item)
			positions[item.ID] = backlogPosition{row.Issue.BacklogRank, item.ID.UUID}
		}
		page, err := command.BuildPage(s.cursors, scope, items, limit, int(total), false, func(item IssueSummary) backlogPosition { return positions[item.ID] })
		result := BacklogPage{Page: page, OrderRevision: command.Revision(revision)}
		if err != nil {
			return result, err
		}
		selected := make([]dbgen.IssuesGetRow, 0, len(page.Items))
		for _, row := range rows[:len(page.Items)] {
			selected = append(selected, dbgen.IssuesGetRow(row))
		}
		result.ModernItems, err = ModernSummaries(ctx, m, selected, actor.Today)
		return result, err
	})
}

func (s *Service) ReorderBacklog(ctx context.Context, actor command.Actor, in BacklogReorderInput) (command.SaveOutcome[BacklogChange], error) {
	if in.IssueID == in.NeighborID || in.ExpectedRevision < 1 || in.ExpectedOrderRevision < 1 {
		return command.SaveOutcome[BacklogChange]{}, validation("neighborId", "Choose another planned issue and read the current planning order.")
	}
	request := command.MutationRequest{
		Actor:           actor,
		Operation:       command.ReorderBacklog,
		RetryReference:  in.RetryReference,
		ResolveProjects: issueScopes(in.IssueID, true),
	}
	return command.Save(ctx, s.runner, request, in, noExtraAuthorization, func(ctx context.Context, m *command.Mutation, in BacklogReorderInput) (command.Change[BacklogChange], error) {
		current, err := readView(ctx, m, in.IssueID)
		if err != nil {
			return command.Change[BacklogChange]{}, err
		}
		if current.Summary.Revision != in.ExpectedRevision {
			return command.Change[BacklogChange]{}, conflict(current)
		}
		if !current.Summary.Backlog || current.Summary.Archived {
			return command.Change[BacklogChange]{}, validation("issueId", "Only current backlog items can be ranked.")
		}
		project := current.Summary.ProjectID
		revision, err := m.Queries.BacklogOrder(ctx, project.UUID)
		if err != nil {
			return command.Change[BacklogChange]{}, err
		}
		if command.Revision(revision) != in.ExpectedOrderRevision {
			return command.Change[BacklogChange]{}, &command.Failure{
				Code:        command.Conflict,
				Message:     "The backlog order changed. Reload it before ranking this item.",
				FieldErrors: []command.FieldError{},
				NextAction:  command.ReloadCurrentState,
			}
		}
		neighbor, err := readScopedIssue(ctx, m, project, in.NeighborID)
		if err != nil {
			return command.Change[BacklogChange]{}, err
		}
		if !neighbor.Backlog || neighbor.Archived {
			return command.Change[BacklogChange]{}, validation("neighborId", "Choose a current backlog item in this project.")
		}
		var rank int64
		for attempt := 0; attempt < 2; attempt++ {
			neighbor, err = m.Queries.ReadIssue(ctx, in.NeighborID.UUID)
			if err != nil {
				return command.Change[BacklogChange]{}, err
			}
			adjacent, err := m.Queries.BacklogNeighbors(ctx, dbgen.BacklogNeighborsParams{
				ProjectID: project.UUID,
				Rank:      neighbor.BacklogRank,
				MovingID:  in.IssueID.UUID,
			})
			if err != nil {
				return command.Change[BacklogChange]{}, err
			}
			left, right := neighbor.BacklogRank, adjacent.AfterRank
			if in.Before {
				left, right = adjacent.BeforeRank, neighbor.BacklogRank
			}
			if right == 0 && left <= math.MaxInt64-RankGap {
				rank = left + RankGap
				break
			}
			if right > left && right-left > 1 {
				rank = left + (right-left)/2
				break
			}
			count, err := m.Queries.BacklogCount(ctx, project.UUID)
			if err != nil {
				return command.Change[BacklogChange]{}, err
			}
			if int64(count) > MaximumRebalance {
				return command.Change[BacklogChange]{}, validation("neighborId", "This planning order exceeds the bounded rebalance size.")
			}
			if err := m.Queries.BacklogRebalance(ctx, project.UUID); err != nil {
				return command.Change[BacklogChange]{}, err
			}
		}
		if rank == 0 {
			return command.Change[BacklogChange]{}, errors.New("planning rank unavailable after bounded rebalance")
		}
		if err := m.Queries.BacklogSetRank(ctx, dbgen.BacklogSetRankParams{ID: in.IssueID.UUID, BacklogRank: rank}); err != nil {
			return command.Change[BacklogChange]{}, err
		}
		revision, err = m.Queries.BacklogAdvanceOrder(ctx, project.UUID)
		if err != nil {
			return command.Change[BacklogChange]{}, err
		}
		saved, err := readView(ctx, m, in.IssueID)
		if err != nil {
			return command.Change[BacklogChange]{}, err
		}
		after := strconv.FormatInt(rank, 10)
		event, err := activity.Append(ctx, m, activity.Draft{
			Action:       command.ReorderBacklog,
			ResourceKind: activity.IssueResource,
			ResourceID:   in.IssueID.UUID,
			ProjectID:    &project,
			IssueID:      &in.IssueID,
			Changes:      []activity.FieldChange{{Field: "backlogRank", After: &after}},
		})
		if err != nil {
			return command.Change[BacklogChange]{}, err
		}
		eventID := event.ID.String()
		return command.Change[BacklogChange]{
			Result: BacklogChange{
				Issue:         saved,
				OrderRevision: command.Revision(revision),
			},
			EventID:    &eventID,
			HTTPStatus: 200,
		}, nil
	}, func(v BacklogChange) error { return validateView(v.Issue) })
}
