package issues

import (
	"context"
	"errors"
	"gategoldjira/backend/internal/platform/command"
	"github.com/google/uuid"
	"testing"
)

func TestFieldPatchesMergeUnrelatedChangesAndPreserveNoOpReplay(t *testing.T) {
	f := issueDatabase(t)
	ctx := context.Background()
	issue := f.create(t, "Two independent fields")
	priority := PatchFieldInput{
		IssueID: issue.Summary.ID,
		PatchFieldFields: PatchFieldFields{
			Field:    PriorityField,
			Priority: &PriorityChange{Prior: command.Medium, Value: command.High},
		},
		RetryReference: uuid.NewString(),
	}
	first, err := f.service.PatchField(ctx, f.member, priority)
	if err != nil {
		t.Fatal(err)
	}
	assignment := PatchFieldInput{
		IssueID: issue.Summary.ID,
		PatchFieldFields: PatchFieldFields{
			Field:    AssigneeField,
			Assignee: &AssigneeChange{Prior: nil, Value: &f.owner.UserID},
		},
		RetryReference: uuid.NewString(),
	}
	second, err := f.service.PatchField(ctx, f.member, assignment)
	if err != nil || second.Body.Result.Summary.Priority != command.High || second.Body.Result.Summary.Assignee.Value == nil || second.Body.Result.Summary.Assignee.Value.ID != f.owner.UserID {
		t.Fatal("unrelated field merge lost work", second, err)
	}
	actor := f.member
	actor.Channel = command.MCP
	replay, err := f.service.PatchField(ctx, actor, priority)
	if err != nil || !replay.Body.Receipt.Replayed || replay.Body.Result.Summary.Revision != first.Body.Result.Summary.Revision {
		t.Fatal("cross-channel replay", replay, err)
	}
	current := second.Body.Result
	var events, notices int
	if err := f.pool.QueryRow(ctx, "SELECT count(*) FROM activity_events WHERE issue_id=$1", issue.Summary.ID.UUID).Scan(&events); err != nil {
		t.Fatal(err)
	}
	if err := f.pool.QueryRow(ctx, "SELECT count(*) FROM notifications WHERE issue_id=$1", issue.Summary.ID.UUID).Scan(&notices); err != nil {
		t.Fatal(err)
	}
	unchanged, err := f.service.PatchField(ctx, f.member, PatchFieldInput{
		IssueID: issue.Summary.ID,
		PatchFieldFields: PatchFieldFields{
			Field:    PriorityField,
			Priority: &PriorityChange{Prior: command.High, Value: command.High},
		},
		RetryReference: uuid.NewString(),
	})
	if err != nil || unchanged.Body.Receipt.EventID != nil || unchanged.Body.Result.Summary.Revision != current.Summary.Revision || !unchanged.Body.Result.Summary.UpdatedAt.Equal(current.Summary.UpdatedAt) {
		t.Fatal("no-op mutated issue", unchanged, err)
	}
	var afterEvents, afterNotices int
	f.pool.QueryRow(ctx, "SELECT count(*) FROM activity_events WHERE issue_id=$1", issue.Summary.ID.UUID).Scan(&afterEvents)
	f.pool.QueryRow(ctx, "SELECT count(*) FROM notifications WHERE issue_id=$1", issue.Summary.ID.UUID).Scan(&afterNotices)
	if afterEvents != events || afterNotices != notices {
		t.Fatal("no-op emitted side effects")
	}
	priority.RetryReference = uuid.NewString()
	priority.Priority.Value = command.Low
	_, err = f.service.PatchField(ctx, f.member, priority)
	var conflict *IssueConflict
	if !errors.As(err, &conflict) || conflict.Current.Summary.Priority != command.High {
		t.Fatal("same-field stale value did not conflict", err)
	}
	if _, err := f.service.PatchField(ctx, f.viewer, assignment); err == nil {
		t.Fatal("viewer wrote or replayed a member command")
	}
	if _, err := f.pool.Exec(ctx, "UPDATE project_memberships SET removed_at=now() WHERE project_id=$1 AND user_id=$2", f.project.UUID, f.member.UserID.UUID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.service.PatchField(ctx, f.member, assignment); err == nil {
		t.Fatal("revoked actor replayed inaccessible work")
	}
}

func TestFieldPatchDateClearAndShapeValidation(t *testing.T) {
	f := issueDatabase(t)
	ctx := context.Background()
	issue := f.create(t, "Dates")
	date, _ := command.ParseDate("2027-04-16")
	in := PatchFieldInput{
		IssueID: issue.Summary.ID,
		PatchFieldFields: PatchFieldFields{
			Field:   DueDateField,
			DueDate: &DateChange{Value: &date},
		},
		RetryReference: uuid.NewString(),
	}
	saved, err := f.service.PatchField(ctx, f.member, in)
	if err != nil || saved.Body.Result.Summary.DueDate == nil || saved.Body.Result.Summary.DueDate.String() != date.String() {
		t.Fatal("date assignment", saved, err)
	}
	in.DueDate = &DateChange{Prior: &date}
	in.RetryReference = uuid.NewString()
	cleared, err := f.service.PatchField(ctx, f.member, in)
	if err != nil || cleared.Body.Result.Summary.DueDate != nil {
		t.Fatal("explicit date clear", cleared, err)
	}
	for _, fields := range []PatchFieldFields{
		{},
		{Field: PriorityField},
		{
			Field:    PriorityField,
			Priority: &PriorityChange{Prior: command.Medium, Value: command.High},
			DueDate:  &DateChange{},
		},
		{
			Field:    AssigneeField,
			Priority: &PriorityChange{Prior: command.Medium, Value: command.High},
		},
		{
			Field:    PriorityField,
			Priority: &PriorityChange{Prior: "urgent", Value: command.High},
		},
	} {
		if _, err := f.service.PatchField(ctx, f.member, PatchFieldInput{
			IssueID:          issue.Summary.ID,
			PatchFieldFields: fields,
			RetryReference:   uuid.NewString(),
		}); err == nil {
			t.Fatal("ambiguous or invalid patch accepted", fields)
		}
	}
}
