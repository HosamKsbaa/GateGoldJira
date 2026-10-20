package issues

import (
	"context"
	"errors"

	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"github.com/jackc/pgx/v5"
)

type UnfinishedWork struct {
	ID         command.IssueID
	Number     int64
	Title      string
	Status     command.Status
	AssigneeID *command.UserID
	Blocker    bool
	Child      bool
}
type GuardError struct {
	Failure  *command.Failure
	Work     []UnfinishedWork
	More     bool
	ParentID *command.IssueID
}

func (guard *GuardError) Error() string { return guard.Failure.Message }
func (guard *GuardError) Unwrap() error { return guard.Failure }

func unavailableIssue() error {
	return &command.Failure{
		Code:        command.Unavailable,
		Message:     "The issue is unavailable.",
		FieldErrors: []command.FieldError{},
		NextAction:  command.None,
	}
}
func readScopedIssue(ctx context.Context, mutation *command.Mutation, project command.ProjectID, id command.IssueID) (dbgen.Issue, error) {
	if err := mutation.RequireProjectWrite(project); err != nil {
		return dbgen.Issue{}, err
	}
	issue, err := mutation.Queries.ReadIssue(ctx, id.UUID)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && issue.ProjectID != project.UUID) {
		return dbgen.Issue{}, unavailableIssue()
	}
	return issue, err
}

func CheckCompletion(ctx context.Context, mutation *command.Mutation, project command.ProjectID, id command.IssueID) error {
	if _, err := readScopedIssue(ctx, mutation, project, id); err != nil {
		return err
	}
	rows, err := mutation.Queries.UnfinishedPrerequisites(ctx, dbgen.UnfinishedPrerequisitesParams{
		ProjectID:   project.UUID,
		DependentID: id.UUID,
	})
	if err != nil || len(rows) == 0 {
		return err
	}
	more := len(rows) > 100
	if more {
		rows = rows[:100]
	}
	work := make([]UnfinishedWork, 0, len(rows))
	for _, row := range rows {
		value := UnfinishedWork{
			ID:      command.IssueID{UUID: row.ID},
			Number:  row.Number,
			Title:   row.Title,
			Status:  command.Status(row.Status),
			Blocker: row.IsBlocker,
			Child:   row.IsChild,
		}
		if row.AssigneeID != nil {
			value.AssigneeID = &command.UserID{UUID: *row.AssigneeID}
		}
		work = append(work, value)
	}
	return &GuardError{
		Failure: &command.Failure{
			Code:        command.Prerequisite,
			Message:     "Finish every direct blocker and subtask before moving this issue to Done.",
			FieldErrors: []command.FieldError{},
			NextAction:  command.FinishPrerequisites,
		},
		Work: work,
		More: more,
	}
}

func CheckChildCreation(ctx context.Context, mutation *command.Mutation, project command.ProjectID, parent command.IssueID) error {
	row, err := readScopedIssue(ctx, mutation, project, parent)
	if err != nil {
		return err
	}
	if row.Type == string(command.Subtask) || row.ParentID != nil {
		return &command.Failure{
			Code:        command.Validation,
			Message:     "Subtasks cannot contain further subtasks.",
			FieldErrors: []command.FieldError{},
			NextAction:  command.ReviewFields,
		}
	}
	if command.Status(row.Status).Category() == command.Done {
		return parentDone(parent)
	}
	return nil
}

func CheckReopen(ctx context.Context, mutation *command.Mutation, project command.ProjectID, id command.IssueID) error {
	row, err := readScopedIssue(ctx, mutation, project, id)
	if err != nil {
		return err
	}
	if row.ParentID == nil {
		return nil
	}
	parent := command.IssueID{UUID: *row.ParentID}
	parentRow, err := readScopedIssue(ctx, mutation, project, parent)
	if err != nil {
		return err
	}
	if command.Status(parentRow.Status).Category() == command.Done {
		return parentDone(parent)
	}
	return nil
}

func parentDone(parent command.IssueID) error {
	return &GuardError{
		Failure: &command.Failure{
			Code:        command.Prerequisite,
			Message:     "Reopen the parent issue before adding or reopening a subtask.",
			FieldErrors: []command.FieldError{},
			NextAction:  command.ReloadCurrentState,
		},
		ParentID: &parent,
	}
}

func CheckDependency(ctx context.Context, mutation *command.Mutation, project command.ProjectID, dependent, blocker command.IssueID) error {
	left, err := readScopedIssue(ctx, mutation, project, dependent)
	if err != nil {
		return err
	}
	right, err := readScopedIssue(ctx, mutation, project, blocker)
	if err != nil {
		return err
	}
	cycle, err := mutation.Queries.PrerequisiteCycleWouldForm(ctx, dbgen.PrerequisiteCycleWouldFormParams{
		ProjectID:   project.UUID,
		BlockerID:   blocker.UUID,
		DependentID: dependent.UUID,
	})
	if err != nil {
		return err
	}
	if cycle {
		return &command.Failure{
			Code:        command.Validation,
			Message:     "This dependency would create a cycle, including parent and subtask relationships.",
			FieldErrors: []command.FieldError{},
			NextAction:  command.ReviewFields,
		}
	}
	if command.Status(left.Status).Category() == command.Done && command.Status(right.Status).Category() != command.Done {
		return &GuardError{Failure: &command.Failure{
			Code:        command.Prerequisite,
			Message:     "Reopen the completed issue before adding an unfinished blocker.",
			FieldErrors: []command.FieldError{},
			NextAction:  command.ReloadCurrentState,
		}}
	}
	return nil
}
