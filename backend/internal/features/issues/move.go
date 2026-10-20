package issues

import (
	"context"
	"errors"
	"strconv"

	"gategoldjira/backend/internal/features/activity"
	"gategoldjira/backend/internal/features/notifications"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"github.com/google/uuid"
)

func validateSourceBoard(id *command.BoardID, revision *command.Revision) error {
	if (id == nil) != (revision == nil) || (id != nil && (id.UUID == uuid.Nil || *revision < 1)) {
		return validation("sourceBoardId", "Supply a source board and its current revision together.")
	}
	return nil
}
func (s *Service) checkSourceBoard(ctx context.Context, m *command.Mutation, project command.ProjectID, id *command.BoardID, expected command.Revision) error {
	if id == nil {
		return nil
	}
	if s.boards.Check == nil {
		return errors.New("board collaborator is unavailable")
	}
	return s.boards.Check(ctx, m, project, *id, expected)
}
func (s *Service) authorizeMovement(id command.IssueID, board *command.BoardID) func(context.Context, *command.Mutation) error {
	return func(ctx context.Context, m *command.Mutation) error {
		i, err := m.Queries.ReadIssue(ctx, id.UUID)
		if err != nil {
			return err
		}
		return s.checkSourceBoard(ctx, m, command.ProjectID{UUID: i.ProjectID}, board, 0)
	}
}
func orderRevision(v IssueView, status command.Status) command.Revision {
	for _, order := range v.OrderRevisions {
		if order.Status == status {
			return order.Revision
		}
	}
	return 0
}
func validateMove(v command.MoveResult) error {
	if err := validateView(v.Issue); err != nil {
		return err
	}
	if v.SourceOrderRevision < 1 || v.TargetOrderRevision < 1 {
		return errors.New("invalid move order")
	}
	if v.BoardView.Value != nil && (v.BoardView.Value.Board.ProjectID != v.Issue.Summary.ProjectID || len(v.BoardView.Value.Columns) < 2) {
		return errors.New("invalid move board")
	}
	return nil
}
func (s *Service) moveResult(ctx context.Context, m *command.Mutation, id command.IssueID, source command.Status, board *command.BoardID) (command.MoveResult, error) {
	v, err := readView(ctx, m, id)
	if err != nil {
		return command.MoveResult{}, err
	}
	result := command.MoveResult{
		Issue:               v,
		SourceOrderRevision: orderRevision(v, source),
		TargetOrderRevision: v.SourceOrderRevision,
	}
	if board != nil {
		if s.boards.View == nil {
			return result, errors.New("board collaborator is unavailable")
		}
		view, err := s.boards.View(ctx, m, *board)
		if err != nil {
			return result, err
		}
		result.BoardView.Value = &view
	}
	return result, nil
}
func (s *Service) prerequisiteFailure(ctx context.Context, m *command.Mutation, current IssueView, err error) error {
	var guard *GuardError
	if !errors.As(err, &guard) {
		return err
	}
	if guard.ParentID != nil {
		parent, readErr := readView(ctx, m, *guard.ParentID)
		if readErr != nil {
			return readErr
		}
		return &PrerequisiteFailure{Failure: guard.Failure, Current: &parent}
	}
	if len(guard.Work) == 0 && !guard.More {
		return &PrerequisiteFailure{Failure: guard.Failure, Current: &current}
	}
	filter, normalizeErr := normalizeFilter(command.IssueFilter{
		ProjectIDs:      []command.ProjectID{current.Summary.ProjectID},
		PrerequisiteFor: &current.Summary.ID,
		Statuses: []command.Status{
			command.Todo,
			command.InProgress,
			command.Review,
		},
	})
	if normalizeErr != nil {
		return normalizeErr
	}
	scope, scopeErr := command.CursorScopeFor(command.SearchIssues, m.Actor.UserID, "updatedAt DESC,id DESC", searchScope{Filters: filter, Today: m.Actor.Today})
	if scopeErr != nil {
		return scopeErr
	}
	params := searchParams(filter, m.Actor, m.User.IsAdministrator)
	params.PageSize = 26
	rows, readErr := m.Queries.IssuesSearch(ctx, params)
	if readErr != nil {
		return readErr
	}
	count, readErr := m.Queries.IssuesSearchCount(ctx, countParams(params))
	if readErr != nil {
		return readErr
	}
	items := []IssueSummary{}
	for _, row := range rows {
		v, readErr := Summary(dbgen.IssuesGetRow(row), m.Actor.Today)
		if readErr != nil {
			return readErr
		}
		items = append(items, v)
	}
	page, pageErr := command.BuildPage(s.cursors, scope, items, 25, int(count), false, func(v IssueSummary) searchPosition {
		return searchPosition{Time: v.UpdatedAt, ID: v.ID.UUID, SortValue: v.UpdatedAt.UnixMicro()}
	})
	if pageErr != nil {
		return pageErr
	}
	return &PrerequisiteFailure{Failure: guard.Failure, Current: &current, Unfinished: &page}
}

type moveCommand struct {
	IssueID command.IssueID `json:"issueId"`
	Fields  MoveIssueFields `json:"fields"`
}

func (s *Service) Move(ctx context.Context, actor command.Actor, input MoveInput) (command.SaveOutcome[command.MoveResult], error) {
	if input.ExpectedRevision < 1 || input.ExpectedSourceOrderRevision < 1 || input.ExpectedTargetOrderRevision < 1 {
		return command.SaveOutcome[command.MoveResult]{}, validation("expectedRevision", "Read current issue and column revisions before moving.")
	}
	if !input.TargetStatus.Valid() {
		return command.SaveOutcome[command.MoveResult]{}, validation("targetStatus", "Choose a valid status.")
	}
	if err := validateSourceBoard(input.SourceBoardID, input.ExpectedBoardRevision); err != nil {
		return command.SaveOutcome[command.MoveResult]{}, err
	}
	args := moveCommand{
		IssueID: input.IssueID,
		Fields: MoveIssueFields{
			input.ExpectedRevision,
			input.TargetStatus,
			input.ExpectedSourceOrderRevision,
			input.ExpectedTargetOrderRevision,
			input.SourceBoardID,
			input.ExpectedBoardRevision,
		},
	}
	request := command.MutationRequest{
		Actor:           actor,
		Operation:       command.MoveIssue,
		RetryReference:  input.RetryReference,
		ResolveProjects: issueScopes(input.IssueID, true),
	}
	return command.Save(ctx, s.runner, request, args, s.authorizeMovement(input.IssueID, input.SourceBoardID), func(ctx context.Context, m *command.Mutation, args moveCommand) (command.Change[command.MoveResult], error) {
		if err := requireLegacyIssue(ctx, m, args.IssueID); err != nil {
			return command.Change[command.MoveResult]{}, err
		}
		return s.applyMove(ctx, m, args, true)
	}, validateMove)
}

func (s *Service) applyMove(ctx context.Context, m *command.Mutation, args moveCommand, checkWorkflow bool) (command.Change[command.MoveResult], error) {
	v, err := readView(ctx, m, args.IssueID)
	if err != nil {
		return command.Change[command.MoveResult]{}, err
	}
	f := args.Fields
	source := v.Summary.Status
	project := v.Summary.ProjectID
	if v.Summary.Revision != f.ExpectedRevision || v.SourceOrderRevision != f.ExpectedSourceOrderRevision || orderRevision(v, f.TargetStatus) != f.ExpectedTargetOrderRevision {
		return command.Change[command.MoveResult]{}, conflict(v)
	}
	if f.SourceBoardID != nil {
		if err = s.checkSourceBoard(ctx, m, project, f.SourceBoardID, *f.ExpectedBoardRevision); err != nil {
			return command.Change[command.MoveResult]{}, err
		}
	}
	if source == f.TargetStatus {
		result, err := s.moveResult(ctx, m, args.IssueID, source, f.SourceBoardID)
		return command.Change[command.MoveResult]{Result: result, HTTPStatus: 200}, err
	}
	if checkWorkflow && s.boards.Transition != nil {
		if err = s.boards.Transition(ctx, m, project, f.SourceBoardID, source, f.TargetStatus); err != nil {
			return command.Change[command.MoveResult]{}, err
		}
	}
	if f.TargetStatus.Category() == command.Done {
		if err = CheckCompletion(ctx, m, project, args.IssueID); err != nil {
			return command.Change[command.MoveResult]{}, s.prerequisiteFailure(ctx, m, v, err)
		}
	}
	if source.Category() == command.Done && f.TargetStatus.Category() != command.Done {
		if err = CheckReopen(ctx, m, project, args.IssueID); err != nil {
			return command.Change[command.MoveResult]{}, s.prerequisiteFailure(ctx, m, v, err)
		}
	}
	completionChanged := (source.Category() == command.Done) != (f.TargetStatus.Category() == command.Done)
	affected := []dbgen.IssuesAffectedCompletionRow{}
	if completionChanged {
		affected, err = m.Queries.IssuesAffectedCompletion(ctx, dbgen.IssuesAffectedCompletionParams{
			ProjectID: project.UUID,
			BlockerID: args.IssueID.UUID,
		})
		if err != nil {
			return command.Change[command.MoveResult]{}, err
		}
	}
	rank, err := AppendRank(ctx, m, project, f.TargetStatus)
	if err != nil {
		return command.Change[command.MoveResult]{}, err
	}
	if _, err = m.Queries.IssuesMove(ctx, dbgen.IssuesMoveParams{
		ID:     args.IssueID.UUID,
		Status: string(f.TargetStatus),
		Rank:   rank,
	}); err != nil {
		return command.Change[command.MoveResult]{}, err
	}
	if v.Summary.Backlog {
		if _, err = m.Queries.BacklogAdvanceOrder(ctx, project.UUID); err != nil {
			return command.Change[command.MoveResult]{}, err
		}
	}
	if s.stageRule != nil {
		if err = s.stageRule(ctx, m, project, args.IssueID, f.TargetStatus); err != nil {
			return command.Change[command.MoveResult]{}, err
		}
	}
	if _, err = AdvanceOrder(ctx, m, project, source); err != nil {
		return command.Change[command.MoveResult]{}, err
	}
	if _, err = AdvanceOrder(ctx, m, project, f.TargetStatus); err != nil {
		return command.Change[command.MoveResult]{}, err
	}
	if completionChanged {
		if _, err = m.Queries.IssuesAdvanceGraph(ctx, project.UUID); err != nil {
			return command.Change[command.MoveResult]{}, err
		}
	}
	result, err := s.moveResult(ctx, m, args.IssueID, source, f.SourceBoardID)
	if err != nil {
		return command.Change[command.MoveResult]{}, err
	}
	before, after := string(source), string(f.TargetStatus)
	changes := []activity.FieldChange{{Field: "status", Before: &before, After: &after}}
	facts := []notifications.Fact{fact(result.Issue, notifications.ChangedStatus)}
	for _, row := range affected {
		var assignee *command.UserID
		if row.AssigneeID != nil {
			assignee = &command.UserID{UUID: *row.AssigneeID}
		}
		base := notifications.Fact{
			ProjectID:  project,
			IssueID:    command.IssueID{UUID: row.ID},
			ReporterID: command.UserID{UUID: row.ReporterID},
			AssigneeID: assignee,
			Summary:    result.Issue.Summary.Key[:len(result.Issue.Summary.Key)-len(result.Issue.Summary.Number.String())] + strconv.FormatInt(row.Number, 10) + ": " + row.Title,
		}
		add := func(effect notifications.Effect) { f := base; f.Effect = effect; facts = append(facts, f) }
		if row.IsBlocker {
			oldCount, newCount := row.UnfinishedBlockers, row.UnfinishedBlockers+1
			if f.TargetStatus.Category() == command.Done {
				newCount = oldCount - 1
			}
			old, new := strconv.FormatInt(int64(oldCount), 10), strconv.FormatInt(int64(newCount), 10)
			changes = append(changes, activity.FieldChange{
				Field:  "issues." + row.ID.String() + ".unfinishedBlockerCount",
				Before: &old,
				After:  &new,
			})
			if oldCount == 1 && newCount == 0 {
				add(notifications.LastBlockerCompleted)
			}
			if oldCount == 0 && newCount == 1 {
				add(notifications.BecameBlocked)
			}
		}
		if row.IsParent {
			oldCount, newCount := row.UnfinishedChildren, row.UnfinishedChildren+1
			if f.TargetStatus.Category() == command.Done {
				newCount = oldCount - 1
			}
			old, new := strconv.FormatInt(int64(oldCount), 10), strconv.FormatInt(int64(newCount), 10)
			changes = append(changes, activity.FieldChange{
				Field:  "issues." + row.ID.String() + ".unfinishedChildren",
				Before: &old,
				After:  &new,
			})
			if oldCount == 1 && newCount == 0 {
				add(notifications.LastSubtaskCompleted)
			}
		}
	}
	event, err := issueEvent(ctx, m, command.MoveIssue, result.Issue, changes, facts)
	return command.Change[command.MoveResult]{Result: result, EventID: event, HTTPStatus: 200}, err
}

type reorderCommand struct {
	IssueID command.IssueID    `json:"issueId"`
	Fields  ReorderIssueFields `json:"fields"`
}

func (s *Service) Reorder(ctx context.Context, actor command.Actor, input ReorderInput) (command.SaveOutcome[command.MoveResult], error) {
	if input.ExpectedRevision < 1 || input.ExpectedOrderRevision < 1 {
		return command.SaveOutcome[command.MoveResult]{}, validation("expectedRevision", "Read current issue and column revisions before reordering.")
	}
	if input.Placement != Before && input.Placement != After {
		return command.SaveOutcome[command.MoveResult]{}, validation("placement", "Choose before or after.")
	}
	if err := validateSourceBoard(input.SourceBoardID, input.ExpectedBoardRevision); err != nil {
		return command.SaveOutcome[command.MoveResult]{}, err
	}
	args := reorderCommand{
		input.IssueID,
		ReorderIssueFields{
			input.ExpectedRevision,
			input.ExpectedOrderRevision,
			input.NeighborIssueID,
			input.Placement,
			input.SourceBoardID,
			input.ExpectedBoardRevision,
		},
	}
	request := command.MutationRequest{
		Actor:           actor,
		Operation:       command.ReorderIssue,
		RetryReference:  input.RetryReference,
		ResolveProjects: issueScopes(input.IssueID, true),
	}
	return command.Save(ctx, s.runner, request, args, s.authorizeMovement(input.IssueID, input.SourceBoardID), func(ctx context.Context, m *command.Mutation, args reorderCommand) (command.Change[command.MoveResult], error) {
		if err := requireLegacyIssue(ctx, m, args.IssueID); err != nil {
			return command.Change[command.MoveResult]{}, err
		}
		v, err := readView(ctx, m, args.IssueID)
		if err != nil {
			return command.Change[command.MoveResult]{}, err
		}
		f := args.Fields
		if v.Summary.Revision != f.ExpectedRevision || v.SourceOrderRevision != f.ExpectedOrderRevision {
			return command.Change[command.MoveResult]{}, conflict(v)
		}
		if f.SourceBoardID != nil {
			if err = s.checkSourceBoard(ctx, m, v.Summary.ProjectID, f.SourceBoardID, *f.ExpectedBoardRevision); err != nil {
				return command.Change[command.MoveResult]{}, err
			}
		}
		_, err = readScopedIssue(ctx, m, v.Summary.ProjectID, args.IssueID)
		if err != nil {
			return command.Change[command.MoveResult]{}, err
		}
		rank, err := NeighborRank(ctx, m, v.Summary.ProjectID, args.IssueID, f.NeighborIssueID, f.Placement == Before)
		if err != nil {
			return command.Change[command.MoveResult]{}, err
		}
		// A rebalance preserves content revisions. Compare against its current
		// rank rather than the rank read before calculating the neighbor gap.
		current, err := readScopedIssue(ctx, m, v.Summary.ProjectID, args.IssueID)
		if err != nil {
			return command.Change[command.MoveResult]{}, err
		}
		if rank == current.Rank {
			result, err := s.moveResult(ctx, m, args.IssueID, v.Summary.Status, f.SourceBoardID)
			return command.Change[command.MoveResult]{Result: result, HTTPStatus: 200}, err
		}
		if _, err = m.Queries.IssuesReorder(ctx, dbgen.IssuesReorderParams{ID: args.IssueID.UUID, Rank: rank}); err != nil {
			return command.Change[command.MoveResult]{}, err
		}
		if _, err = AdvanceOrder(ctx, m, v.Summary.ProjectID, v.Summary.Status); err != nil {
			return command.Change[command.MoveResult]{}, err
		}
		result, err := s.moveResult(ctx, m, args.IssueID, v.Summary.Status, f.SourceBoardID)
		if err != nil {
			return command.Change[command.MoveResult]{}, err
		}
		before, after := strconv.FormatInt(current.Rank, 10), strconv.FormatInt(rank, 10)
		event, err := issueEvent(ctx, m, command.ReorderIssue, result.Issue, []activity.FieldChange{{
			Field:  "rank",
			Before: &before,
			After:  &after,
		}}, nil)
		return command.Change[command.MoveResult]{Result: result, EventID: event, HTTPStatus: 200}, err
	}, validateMove)
}
