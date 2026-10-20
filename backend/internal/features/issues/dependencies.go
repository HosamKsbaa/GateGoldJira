package issues

import (
	"context"
	"errors"
	"gategoldjira/backend/internal/features/activity"
	"gategoldjira/backend/internal/features/notifications"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type DependencyView struct {
	Dependent     IssueSummary     `json:"dependent"`
	Blocker       IssueSummary     `json:"blocker"`
	Revision      command.Revision `json:"revision"`
	GraphRevision command.Revision `json:"graphRevision"`
	Removed       bool             `json:"removed"`
}
type DependencyDirection string

const (
	BlockedBy DependencyDirection = "blocked_by"
	Blocks    DependencyDirection = "blocks"
)

type ListDependenciesInput struct {
	IssueID   command.IssueID     `json:"issueId"`
	Direction DependencyDirection `json:"direction" enum:"blocked_by,blocks"`
	Page      command.PageRequest `json:"page,omitempty"`
}
type AddDependencyFields struct {
	BlockerID             command.IssueID  `json:"blockerId"`
	ExpectedIssueRevision command.Revision `json:"expectedIssueRevision"`
	ExpectedGraphRevision command.Revision `json:"expectedGraphRevision"`
}
type RemoveDependencyFields struct {
	ExpectedIssueRevision      command.Revision `json:"expectedIssueRevision"`
	ExpectedDependencyRevision command.Revision `json:"expectedDependencyRevision"`
	ExpectedGraphRevision      command.Revision `json:"expectedGraphRevision"`
}
type AddDependencyInput struct {
	IssueID               command.IssueID  `json:"issueId"`
	BlockerID             command.IssueID  `json:"blockerId"`
	ExpectedIssueRevision command.Revision `json:"expectedIssueRevision"`
	ExpectedGraphRevision command.Revision `json:"expectedGraphRevision"`
	RetryReference        string           `json:"retryReference" format:"uuid"`
}
type RemoveDependencyInput struct {
	IssueID                    command.IssueID  `json:"issueId"`
	BlockerID                  command.IssueID  `json:"blockerId"`
	ExpectedIssueRevision      command.Revision `json:"expectedIssueRevision"`
	ExpectedDependencyRevision command.Revision `json:"expectedDependencyRevision"`
	ExpectedGraphRevision      command.Revision `json:"expectedGraphRevision"`
	RetryReference             string           `json:"retryReference" format:"uuid"`
}

func validateDependency(v DependencyView) error {
	if v.Dependent.ID.UUID == uuid.Nil || v.Blocker.ID.UUID == uuid.Nil || v.Dependent.ID == v.Blocker.ID || v.Dependent.ProjectID != v.Blocker.ProjectID || v.Revision < 1 || v.GraphRevision < 1 {
		return errors.New("invalid dependency result")
	}
	for _, summary := range []IssueSummary{v.Dependent, v.Blocker} {
		if summary.Revision < 1 || summary.Number < 1 || !summary.Type.Valid() || !summary.Status.Valid() || !summary.Priority.Valid() || summary.Labels == nil {
			return errors.New("invalid dependency issue summary")
		}
	}
	return nil
}
func dependencySummaries(ctx context.Context, m *command.Mutation, project command.ProjectID, ids []uuid.UUID) (map[command.IssueID]IssueSummary, error) {
	rows, err := m.Queries.DependenciesSummaries(ctx, dbgen.DependenciesSummariesParams{ProjectID: project.UUID, Column2: ids})
	if err != nil {
		return nil, err
	}
	result := map[command.IssueID]IssueSummary{}
	for _, row := range rows {
		value, err := Summary(dbgen.IssuesGetRow(row), m.Actor.Today)
		if err != nil {
			return nil, err
		}
		result[value.ID] = value
	}
	return result, nil
}
func dependencyView(row dbgen.IssueDependency, graph command.Revision, summaries map[command.IssueID]IssueSummary) (DependencyView, error) {
	v := DependencyView{
		Dependent:     summaries[command.IssueID{UUID: row.DependentID}],
		Blocker:       summaries[command.IssueID{UUID: row.BlockerID}],
		Revision:      command.Revision(row.Revision),
		GraphRevision: graph,
		Removed:       row.RemovedAt.Valid,
	}
	return v, validateDependency(v)
}
func readDependencyView(ctx context.Context, m *command.Mutation, row dbgen.IssueDependency) (DependencyView, error) {
	project, err := m.Queries.ReadProject(ctx, row.ProjectID)
	if err != nil {
		return DependencyView{}, err
	}
	values, err := dependencySummaries(ctx, m, command.ProjectID{UUID: row.ProjectID}, []uuid.UUID{row.DependentID, row.BlockerID})
	if err != nil {
		return DependencyView{}, err
	}
	return dependencyView(row, command.Revision(project.GraphRevision), values)
}
func (s *Service) Dependencies(ctx context.Context, actor command.Actor, input ListDependenciesInput) (command.Page[DependencyView], error) {
	if input.Direction != BlockedBy && input.Direction != Blocks {
		return command.Page[DependencyView]{}, validation("direction", "Choose blocked_by or blocks.")
	}
	limit, err := input.Page.Size()
	if err != nil {
		return command.Page[DependencyView]{}, err
	}
	return command.ReadResolved(ctx, s.runner, actor, command.Access{RepeatableRead: true}, issueScopes(input.IssueID, false), func(ctx context.Context, m *command.Mutation) (command.Page[DependencyView], error) {
		root, err := m.Queries.ReadIssue(ctx, input.IssueID.UUID)
		if err != nil {
			return command.Page[DependencyView]{}, err
		}
		project := command.ProjectID{UUID: root.ProjectID}
		permissions, err := m.ProjectPermissions(project)
		if err != nil {
			return command.Page[DependencyView]{}, err
		}
		scope, err := command.CursorScopeFor(command.ListDependencies, actor.UserID, "other issue number ASC", struct {
			IssueID   command.IssueID     `json:"issueId"`
			Direction DependencyDirection `json:"direction"`
			Graph     command.Revision    `json:"graphRevision"`
		}{input.IssueID, input.Direction, permissions.GraphRevision})
		if err != nil {
			return command.Page[DependencyView]{}, err
		}
		var number int64
		if input.Page.Cursor != nil {
			number, err = command.ReadCursor[int64](s.cursors, scope, *input.Page.Cursor)
			if err != nil {
				return command.Page[DependencyView]{}, &command.Failure{
					Code:        command.Conflict,
					Message:     "The dependency graph changed. Reload its first page.",
					FieldErrors: []command.FieldError{},
					NextAction:  command.ReloadCurrentState,
				}
			}
		}
		rows, err := m.Queries.DependenciesList(ctx, dbgen.DependenciesListParams{
			BlockedBy:   input.Direction == BlockedBy,
			ProjectID:   root.ProjectID,
			IssueID:     root.ID,
			HasCursor:   input.Page.Cursor != nil,
			AfterNumber: number,
			PageSize:    int32(limit + 1),
		})
		if err != nil {
			return command.Page[DependencyView]{}, err
		}
		count, err := m.Queries.DependenciesCount(ctx, dbgen.DependenciesCountParams{
			ProjectID: root.ProjectID,
			IssueID:   root.ID,
			BlockedBy: input.Direction == BlockedBy,
		})
		if err != nil {
			return command.Page[DependencyView]{}, err
		}
		ids := []uuid.UUID{root.ID}
		for _, row := range rows {
			if input.Direction == BlockedBy {
				ids = append(ids, row.IssueDependency.BlockerID)
			} else {
				ids = append(ids, row.IssueDependency.DependentID)
			}
		}
		summaries, err := dependencySummaries(ctx, m, project, ids)
		if err != nil {
			return command.Page[DependencyView]{}, err
		}
		items := []DependencyView{}
		for _, row := range rows {
			view, err := dependencyView(row.IssueDependency, permissions.GraphRevision, summaries)
			if err != nil {
				return command.Page[DependencyView]{}, err
			}
			items = append(items, view)
		}
		return command.BuildPage(s.cursors, scope, items, limit, int(count), false, func(v DependencyView) int64 {
			if input.Direction == BlockedBy {
				return int64(v.Blocker.Number)
			}
			return int64(v.Dependent.Number)
		})
	})
}

type dependencyCommand struct {
	IssueID            command.IssueID   `json:"issueId"`
	BlockerID          command.IssueID   `json:"blockerId"`
	IssueRevision      command.Revision  `json:"issueRevision"`
	GraphRevision      command.Revision  `json:"graphRevision"`
	DependencyRevision *command.Revision `json:"dependencyRevision,omitempty"`
	Remove             bool              `json:"remove"`
}

func (s *Service) AddDependency(ctx context.Context, actor command.Actor, input AddDependencyInput) (command.SaveOutcome[DependencyView], error) {
	return s.changeDependency(ctx, actor, input.RetryReference, dependencyCommand{
		IssueID:       input.IssueID,
		BlockerID:     input.BlockerID,
		IssueRevision: input.ExpectedIssueRevision,
		GraphRevision: input.ExpectedGraphRevision,
	})
}
func (s *Service) RemoveDependency(ctx context.Context, actor command.Actor, input RemoveDependencyInput) (command.SaveOutcome[DependencyView], error) {
	return s.changeDependency(ctx, actor, input.RetryReference, dependencyCommand{
		IssueID:            input.IssueID,
		BlockerID:          input.BlockerID,
		IssueRevision:      input.ExpectedIssueRevision,
		GraphRevision:      input.ExpectedGraphRevision,
		DependencyRevision: &input.ExpectedDependencyRevision,
		Remove:             true,
	})
}
func (s *Service) changeDependency(ctx context.Context, actor command.Actor, reference string, args dependencyCommand) (command.SaveOutcome[DependencyView], error) {
	if args.IssueRevision < 1 || args.GraphRevision < 1 || (args.Remove && (args.DependencyRevision == nil || *args.DependencyRevision < 1)) {
		return command.SaveOutcome[DependencyView]{}, validation("expectedRevision", "Read the current issue, graph and relationship revisions before saving.")
	}
	op := command.AddDependency
	if args.Remove {
		op = command.RemoveDependency
	}
	request := command.MutationRequest{
		Actor:           actor,
		Operation:       op,
		RetryReference:  reference,
		ResolveProjects: issueScopes(args.IssueID, true),
	}
	return command.Save(ctx, s.runner, request, args, func(ctx context.Context, m *command.Mutation) error {
		root, err := m.Queries.ReadIssue(ctx, args.IssueID.UUID)
		if err != nil {
			return err
		}
		_, err = readScopedIssue(ctx, m, command.ProjectID{UUID: root.ProjectID}, args.BlockerID)
		return err
	}, func(ctx context.Context, m *command.Mutation, args dependencyCommand) (command.Change[DependencyView], error) {
		current, err := readView(ctx, m, args.IssueID)
		if err != nil {
			return command.Change[DependencyView]{}, err
		}
		if current.Summary.Revision != args.IssueRevision || current.GraphRevision != args.GraphRevision {
			return command.Change[DependencyView]{}, conflict(current)
		}
		project := current.Summary.ProjectID
		row, err := m.Queries.DependenciesRead(ctx, dbgen.DependenciesReadParams{
			DependentID: args.IssueID.UUID,
			BlockerID:   args.BlockerID.UUID,
		})
		exists := !errors.Is(err, pgx.ErrNoRows)
		if err != nil && exists {
			return command.Change[DependencyView]{}, err
		}
		if args.Remove && !exists {
			return command.Change[DependencyView]{}, unavailableIssue()
		}
		if args.Remove && command.Revision(row.Revision) != *args.DependencyRevision {
			value, err := readDependencyView(ctx, m, row)
			if err != nil {
				return command.Change[DependencyView]{}, err
			}
			return command.Change[DependencyView]{}, &DependencyConflict{
				Failure: &command.Failure{
					Code:        command.Conflict,
					Message:     "This dependency changed. Review its current relationship before saving.",
					FieldErrors: []command.FieldError{},
					NextAction:  command.ReloadCurrentState,
				},
				Current: &value,
			}
		}
		if exists && row.RemovedAt.Valid == args.Remove {
			view, err := readDependencyView(ctx, m, row)
			return command.Change[DependencyView]{Result: view, HTTPStatus: 200}, err
		}
		if !args.Remove {
			if err := CheckDependency(ctx, m, project, args.IssueID, args.BlockerID); err != nil {
				return command.Change[DependencyView]{}, s.prerequisiteFailure(ctx, m, current, err)
			}
		}
		if args.Remove {
			row, err = m.Queries.DependenciesRemove(ctx, dbgen.DependenciesRemoveParams{
				DependentID: args.IssueID.UUID,
				BlockerID:   args.BlockerID.UUID,
				RemovedBy:   &m.User.ID,
			})
		} else if exists {
			row, err = m.Queries.DependenciesRestore(ctx, dbgen.DependenciesRestoreParams{
				DependentID: args.IssueID.UUID,
				BlockerID:   args.BlockerID.UUID,
			})
		} else {
			row, err = m.Queries.DependenciesInsert(ctx, dbgen.DependenciesInsertParams{
				ProjectID:   project.UUID,
				DependentID: args.IssueID.UUID,
				BlockerID:   args.BlockerID.UUID,
				CreatedBy:   m.User.ID,
			})
		}
		if err != nil {
			return command.Change[DependencyView]{}, err
		}
		if _, err = m.Queries.IssuesAdvanceGraph(ctx, project.UUID); err != nil {
			return command.Change[DependencyView]{}, err
		}
		view, err := readDependencyView(ctx, m, row)
		if err != nil {
			return command.Change[DependencyView]{}, err
		}
		fresh, err := readView(ctx, m, args.IssueID)
		if err != nil {
			return command.Change[DependencyView]{}, err
		}
		facts := []notifications.Fact{}
		if !current.Summary.Blocked && view.Dependent.Blocked {
			facts = append(facts, fact(fresh, notifications.BecameBlocked))
		}
		if current.Summary.Blocked && !view.Dependent.Blocked {
			facts = append(facts, fact(fresh, notifications.LastBlockerCompleted))
		}
		before, after := "absent", "active"
		if args.Remove {
			before, after = after, before
		}
		changes := []activity.FieldChange{
			{
				Field:  "blockedBy." + args.BlockerID.String(),
				Before: &before,
				After:  &after,
			},
			{
				Field:  "issues." + args.BlockerID.String() + ".blocks." + args.IssueID.String(),
				Before: &before,
				After:  &after,
			},
		}
		event, err := issueEvent(ctx, m, op, fresh, changes, facts)
		return command.Change[DependencyView]{Result: view, EventID: event, HTTPStatus: 200}, err
	}, validateDependency)
}
