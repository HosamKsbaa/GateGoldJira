package issues

import (
	"context"
	"errors"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"github.com/google/uuid"
	"testing"
	"time"
)

func TestFieldPatchOnAnotherIssueDoesNotWaitForLockedIssue(t *testing.T) {
	f := issueDatabase(t)
	ctx := context.Background()
	first, second := f.create(t, "Locked issue"), f.create(t, "Independent issue")
	tx, err := f.pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	q := dbgen.New(tx)
	if _, err = q.CompanySharedGuard(ctx); err != nil {
		t.Fatal(err)
	}
	if _, err = q.ProjectSharedLifecycle(ctx, f.project.UUID); err != nil {
		t.Fatal(err)
	}
	if _, err = q.IssuesLockFieldRow(ctx, first.Summary.ID.UUID); err != nil {
		t.Fatal(err)
	}
	done := make(chan error, 1)
	go func() {
		_, err := f.service.PatchField(ctx, f.member, PatchFieldInput{
			IssueID: first.Summary.ID,
			PatchFieldFields: PatchFieldFields{
				Field:    PriorityField,
				Priority: &PriorityChange{Prior: command.Medium, Value: command.High},
			},
			RetryReference: uuid.NewString(),
		})
		done <- err
	}()
	// Observe the actual first writer's row wait before testing the second. This
	// proves overlap rather than depending on a goroutine scheduling delay.
	waiting := false
	deadline := time.Now().Add(3 * time.Second)
	for !waiting && time.Now().Before(deadline) {
		if err = f.pool.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%IssuesLockFieldRow%')").Scan(&waiting); err != nil {
			t.Fatal(err)
		}
		if !waiting {
			time.Sleep(10 * time.Millisecond)
		}
	}
	if !waiting {
		t.Fatal("first field writer did not reach the issue row lock")
	}
	otherCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	saved, err := f.service.PatchField(otherCtx, f.member, PatchFieldInput{
		IssueID: second.Summary.ID,
		PatchFieldFields: PatchFieldFields{
			Field:    PriorityField,
			Priority: &PriorityChange{Prior: command.Medium, Value: command.High},
		},
		RetryReference: uuid.NewString(),
	})
	if err != nil || saved.Body.Result.Summary.Priority != command.High {
		t.Fatal("independent issue blocked", err)
	}
	if err = tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	select {
	case err := <-done:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("first field writer did not resume")
	}
}
func TestConcurrentSameIssueFieldsMergeButSameFieldConflicts(t *testing.T) {
	f := issueDatabase(t)
	ctx := context.Background()
	issue := f.create(t, "Concurrent fields")
	date, _ := command.ParseDate("2027-06-02")
	start := make(chan struct{})
	done := make(chan error, 2)
	inputs := []PatchFieldInput{
		{
			IssueID: issue.Summary.ID,
			PatchFieldFields: PatchFieldFields{
				Field:    PriorityField,
				Priority: &PriorityChange{Prior: command.Medium, Value: command.High},
			},
			RetryReference: uuid.NewString(),
		},
		{
			IssueID: issue.Summary.ID,
			PatchFieldFields: PatchFieldFields{
				Field:   DueDateField,
				DueDate: &DateChange{Value: &date},
			},
			RetryReference: uuid.NewString(),
		},
	}
	for _, input := range inputs {
		go func(in PatchFieldInput) { <-start; _, err := f.service.PatchField(ctx, f.member, in); done <- err }(input)
	}
	close(start)
	for range inputs {
		if err := <-done; err != nil {
			t.Fatal("unrelated concurrent merge", err)
		}
	}
	current, err := f.service.Get(ctx, f.member, issue.Summary.ID)
	if err != nil || current.Summary.Priority != command.High || current.Summary.DueDate == nil || current.Summary.DueDate.String() != date.String() || current.Summary.Revision != 3 {
		t.Fatal("lost fields", current, err)
	}
	start = make(chan struct{})
	done = make(chan error, 2)
	for _, target := range []command.Priority{command.Low, command.Medium} {
		go func(value command.Priority) {
			<-start
			_, err := f.service.PatchField(ctx, f.member, PatchFieldInput{
				IssueID: issue.Summary.ID,
				PatchFieldFields: PatchFieldFields{
					Field:    PriorityField,
					Priority: &PriorityChange{Prior: command.High, Value: value},
				},
				RetryReference: uuid.NewString(),
			})
			done <- err
		}(target)
	}
	close(start)
	accepted, conflicts := 0, 0
	for range 2 {
		err := <-done
		if err == nil {
			accepted++
			continue
		}
		var stale *IssueConflict
		if errors.As(err, &stale) {
			conflicts++
			continue
		}
		t.Fatal(err)
	}
	if accepted != 1 || conflicts != 1 {
		t.Fatal("same-field race", accepted, conflicts)
	}
}

func TestFieldPatchAndLegacyPutCannotLoseAcceptedChanges(t *testing.T) {
	f := issueDatabase(t)
	ctx := context.Background()
	issue := f.create(t, "Original title")
	start := make(chan struct{})
	putDone, patchDone := make(chan error, 1), make(chan error, 1)
	old := editable(issue)
	old.Title = "Legacy updated title"
	go func() {
		<-start
		_, err := f.service.Update(ctx, f.member, UpdateInput{
			IssueID:          issue.Summary.ID,
			ExpectedRevision: issue.Summary.Revision,
			Editable:         old,
			RetryReference:   uuid.NewString(),
		})
		putDone <- err
	}()
	go func() {
		<-start
		_, err := f.service.PatchField(ctx, f.member, PatchFieldInput{
			IssueID: issue.Summary.ID,
			PatchFieldFields: PatchFieldFields{
				Field:    PriorityField,
				Priority: &PriorityChange{Prior: command.Medium, Value: command.High},
			},
			RetryReference: uuid.NewString(),
		})
		patchDone <- err
	}()
	close(start)
	putErr, patchErr := <-putDone, <-patchDone
	if patchErr != nil {
		t.Fatal("patch lost to unrelated legacy title", patchErr)
	}
	if putErr != nil {
		var stale *IssueConflict
		if !errors.As(putErr, &stale) {
			t.Fatal(putErr)
		}
	}
	current, err := f.service.Get(ctx, f.member, issue.Summary.ID)
	if err != nil || current.Summary.Priority != command.High {
		t.Fatal("accepted patch was overwritten", current, err)
	}
	if putErr == nil && current.Summary.Title != "Legacy updated title" {
		t.Fatal("accepted title lost")
	}
	if putErr != nil && current.Summary.Title != "Original title" {
		t.Fatal("rejected legacy PUT changed title")
	}
}

func TestSharedMetadataCannotBypassLegacyProjectWriteGuard(t *testing.T) {
	f := issueDatabase(t)
	_, err := command.Execute(context.Background(), command.Runner{Pool: f.pool}, command.MutationRequest{
		Actor:          f.member,
		Operation:      command.UpdateIssue,
		RetryReference: uuid.NewString(),
		Access: command.Access{
			SharedMetadata: true,
			Projects:       []command.ProjectScope{{ProjectID: f.project, Write: true}},
		},
	}, struct{}{}, func(context.Context, *command.Mutation) error { return nil }, func(context.Context, *command.Mutation, struct{}) (bool, error) {
		t.Fatal("legacy mutation entered a shared guard")
		return false, nil
	}, func(bool) error { return nil })
	var failure *command.Failure
	if !errors.As(err, &failure) || failure.Code != command.Validation {
		t.Fatal("legacy guard bypass", err)
	}
}
