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

func (f issueFixture) createModern(t *testing.T, title string) ModernIssueView {
	t.Helper()
	out, err := f.service.CreateModern(context.Background(), f.member, ModernCreateInput{
		ProjectID:          f.project,
		ModernCreateFields: ModernCreateFields{Title: title},
		RetryReference:     uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	return out.Body.Result
}
func TestCanonicalFieldPatchesMergeAndReplayButSameFieldConflicts(t *testing.T) {
	f := modernIssueFixture(t)
	ctx := context.Background()
	issue := f.createModern(t, "Concurrent fields")
	var highID uuid.UUID
	if err := f.pool.QueryRow(ctx, "SELECT id FROM priorities WHERE project_id=$1 AND key='high'", f.project.UUID).Scan(&highID); err != nil {
		t.Fatal(err)
	}
	high := command.PriorityID{UUID: highID}
	date, _ := command.ParseDate("2027-06-02")
	start := make(chan struct{})
	results := make(chan error, 2)
	priority := ModernPatchInput{
		IssueID: issue.Summary.ID,
		ModernPatchFields: ModernPatchFields{
			Field: PriorityIDField,
			Priority: &PriorityIDChange{
				Prior: issue.Summary.Priority.ID,
				Value: high,
			},
		},
		RetryReference: uuid.NewString(),
	}
	due := ModernPatchInput{
		IssueID: issue.Summary.ID,
		ModernPatchFields: ModernPatchFields{
			Field:   DueDateField,
			DueDate: &DateChange{Value: &date},
		},
		RetryReference: uuid.NewString(),
	}
	for _, input := range []ModernPatchInput{priority, due} {
		go func(input ModernPatchInput) {
			<-start
			_, err := f.service.PatchModernField(ctx, f.member, input)
			results <- err
		}(input)
	}
	close(start)
	for range 2 {
		if err := <-results; err != nil {
			t.Fatal("independent fields", err)
		}
	}
	current, err := f.service.GetModern(ctx, f.member, issue.Summary.ID)
	if err != nil || current.Summary.Priority.ID != high || current.Summary.DueDate == nil || current.Summary.DueDate.String() != date.String() || current.Summary.Revision != 3 {
		t.Fatal("lost fields", current, err)
	}
	replay, err := f.service.PatchModernField(ctx, f.member, priority)
	if err != nil || !replay.Body.Receipt.Replayed || replay.Body.Result.Summary.Priority.ID != high {
		t.Fatal("field replay", err)
	}
	priority.RetryReference = uuid.NewString()
	_, err = f.service.PatchModernField(ctx, f.member, priority)
	var conflict *ModernIssueConflict
	if !errors.As(err, &conflict) || conflict.Current.Summary.Priority.ID != high {
		t.Fatal("same-field conflict", err)
	}
	priority.Priority = &PriorityIDChange{Prior: high, Value: high}
	priority.RetryReference = uuid.NewString()
	noop, err := f.service.PatchModernField(ctx, f.member, priority)
	if err != nil || noop.Body.Receipt.EventID != nil || noop.Body.Result.Summary.Revision != 3 {
		t.Fatal("patch no-op", err)
	}
	if _, err = f.pool.Exec(ctx, "UPDATE project_memberships SET removed_at=now() WHERE project_id=$1 AND user_id=$2", f.project.UUID, f.member.UserID.UUID); err != nil {
		t.Fatal(err)
	}
	_, err = f.service.PatchModernField(ctx, f.member, due)
	var failure *command.Failure
	if !errors.As(err, &failure) || failure.Code != command.Unavailable {
		t.Fatal("revoked field replay", err)
	}
}
func TestCanonicalFieldOnDifferentIssueDoesNotWaitForHeldIssue(t *testing.T) {
	f := modernIssueFixture(t)
	ctx := context.Background()
	first, second := f.createModern(t, "Held"), f.createModern(t, "Independent")
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
	date, _ := command.ParseDate("2027-06-02")
	done := make(chan error, 1)
	go func() {
		_, err := f.service.PatchModernField(ctx, f.member, ModernPatchInput{
			IssueID: first.Summary.ID,
			ModernPatchFields: ModernPatchFields{
				Field:   DueDateField,
				DueDate: &DateChange{Value: &date},
			},
			RetryReference: uuid.NewString(),
		})
		done <- err
	}()
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
		t.Fatal("writer did not reach actual issue lock")
	}
	other, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	if _, err = f.service.PatchModernField(other, f.member, ModernPatchInput{
		IssueID: second.Summary.ID,
		ModernPatchFields: ModernPatchFields{
			Field:   DueDateField,
			DueDate: &DateChange{Value: &date},
		},
		RetryReference: uuid.NewString(),
	}); err != nil {
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
		t.Fatal("held writer did not resume")
	}
}
