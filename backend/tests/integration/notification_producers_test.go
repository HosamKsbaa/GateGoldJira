package integration

import (
	"context"
	"strings"
	"testing"

	"gategoldjira/backend/internal/features/comments"
	"gategoldjira/backend/internal/features/issues"
	"gategoldjira/backend/internal/features/notifications"
	"gategoldjira/backend/internal/features/pictures"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/objectstore"
	"gategoldjira/backend/tests/testenv"
	"github.com/google/uuid"
)

// Exercise the actual business commands: producer facts alone cannot prove
// blocked and last-child transitions or distinguish comment edits from creates.
func TestBusinessCommandsProduceExactNotificationTransitions(t *testing.T) {
	w := testenv.Work(t)
	ctx := context.Background()
	// This fixture inserts GG-1 directly, so reserve the next number as a real
	// create command would have done.
	if _, err := w.Pool.Exec(ctx, "UPDATE projects SET next_issue_number=2 WHERE id=$1", w.Project.UUID); err != nil {
		t.Fatal(err)
	}
	signer, _ := command.NewCursorSigner([]byte(strings.Repeat("n", 32)))
	runner := command.Runner{Pool: w.Pool}
	work := issues.New(runner, signer)
	store, err := objectstore.NewLocal(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	photos := pictures.New(runner, signer, store)
	discussion := comments.New(runner, signer, photos)
	count := func() int {
		t.Helper()
		var n int
		if err := w.Pool.QueryRow(ctx, "SELECT count(*) FROM notifications").Scan(&n); err != nil {
			t.Fatal(err)
		}
		return n
	}
	assertReasons := func(event *string, issue command.IssueID, wanted map[command.UserID][]string) {
		t.Helper()
		if event == nil {
			t.Fatal("missing notification event")
		}
		rows, err := w.Pool.Query(ctx, "SELECT recipient_id,reasons FROM notifications WHERE event_id=$1 AND issue_id=$2", *event, issue.UUID)
		if err != nil {
			t.Fatal(err)
		}
		defer rows.Close()
		got := map[command.UserID][]string{}
		for rows.Next() {
			var id uuid.UUID
			var reasons []string
			if err := rows.Scan(&id, &reasons); err != nil {
				t.Fatal(err)
			}
			got[command.UserID{UUID: id}] = reasons
		}
		if rows.Err() != nil || len(got) != len(wanted) {
			t.Fatalf("notification recipient set got=%v want=%v err=%v", got, wanted, rows.Err())
		}
		for id, reasons := range wanted {
			if len(got[id]) != len(reasons) {
				t.Fatalf("reason union got=%v want=%v", got, wanted)
			}
			for _, reason := range reasons {
				found := false
				for _, actual := range got[id] {
					found = found || actual == reason
				}
				if !found {
					t.Fatalf("missing reason %s: %v", reason, got)
				}
			}
		}
	}
	responsible := func(reason string) map[command.UserID][]string {
		return map[command.UserID][]string{w.Admin.UserID: {reason}, w.Other.UserID: {reason}}
	}
	get := func(id command.IssueID) issues.IssueView {
		t.Helper()
		v, err := work.Get(ctx, w.Author, id)
		if err != nil {
			t.Fatal(err)
		}
		return v
	}
	move := func(id command.IssueID, target command.Status) command.SaveOutcome[command.MoveResult] {
		t.Helper()
		v := get(id)
		var order command.Revision
		for _, o := range v.OrderRevisions {
			if o.Status == target {
				order = o.Revision
			}
		}
		saved, err := work.Move(ctx, w.Author, issues.MoveInput{
			IssueID:                     id,
			ExpectedRevision:            v.Summary.Revision,
			TargetStatus:                target,
			ExpectedSourceOrderRevision: v.SourceOrderRevision,
			ExpectedTargetOrderRevision: order,
			RetryReference:              uuid.NewString(),
		})
		if err != nil {
			t.Fatal(err)
		}
		return saved
	}
	editable := func(v issues.IssueView) issues.IssueEditable {
		return issues.IssueEditable{
			Title:       v.Summary.Title,
			Description: v.Description,
			Type:        v.Summary.Type,
			Priority:    v.Summary.Priority,
			AssigneeID:  &w.Other.UserID,
			LabelIDs:    []command.LabelID{},
		}
	}
	v := get(w.Issue)
	date, _ := command.ParseDate("2026-10-15")
	fields := editable(v)
	fields.DueDate = &date
	changed, err := work.Update(ctx, w.Author, issues.UpdateInput{
		IssueID:          w.Issue,
		ExpectedRevision: v.Summary.Revision,
		Editable:         fields,
		RetryReference:   uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	assertReasons(changed.Body.Receipt.EventID, w.Issue, responsible("due_date"))
	label, err := work.CreateLabel(ctx, w.Author, issues.CreateLabelInput{
		ProjectID:      w.Project,
		Name:           "عاجل",
		RetryReference: uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	before := count()
	fields.LabelIDs = []command.LabelID{label.Body.Result.ID}
	changed, err = work.Update(ctx, w.Author, issues.UpdateInput{
		IssueID:          w.Issue,
		ExpectedRevision: changed.Body.Result.Summary.Revision,
		Editable:         fields,
		RetryReference:   uuid.NewString(),
	})
	if err != nil || count() != before {
		t.Fatal("label-only change notified", err)
	}
	noop, err := work.Update(ctx, w.Author, issues.UpdateInput{
		IssueID:          w.Issue,
		ExpectedRevision: changed.Body.Result.Summary.Revision,
		Editable:         fields,
		RetryReference:   uuid.NewString(),
	})
	if err != nil || noop.Body.Receipt.EventID != nil || count() != before {
		t.Fatal("no-op notified", err)
	}
	_, err = work.Update(ctx, w.Author, issues.UpdateInput{
		IssueID:          w.Issue,
		ExpectedRevision: 1,
		Editable:         fields,
		RetryReference:   uuid.NewString(),
	})
	if err == nil || count() != before {
		t.Fatal("failed change notified")
	}
	photo, err := photos.Upload(ctx, w.Author, pictures.UploadInput{
		IssueID: w.Issue,
		Metadata: pictures.UploadMetadata{
			Filename:    "صورة.png",
			Description: "توضيح",
			MIMEType:    "image/png",
			Publication: pictures.Gallery,
		},
		Data:           testenv.PNG(t),
		RetryReference: uuid.NewString(),
	})
	if err != nil || photo.Body.Result.ID.UUID == uuid.Nil || count() != before {
		t.Fatal("picture upload notified", err)
	}
	body := comments.Body{
		HTML:           `<p>مرحبا <span data-user-id="` + w.Viewer.UserID.String() + `">forged</span> @ordinary</p>`,
		MentionUserIDs: []command.UserID{w.Viewer.UserID},
		PictureIDs:     []command.PictureID{},
	}
	comment, err := discussion.Create(ctx, w.Author, comments.CreateInput{
		IssueID:        w.Issue,
		Body:           body,
		RetryReference: uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	wanted := responsible("comment")
	wanted[w.Viewer.UserID] = []string{"mention"}
	assertReasons(comment.Body.Receipt.EventID, w.Issue, wanted)
	before = count()
	body.HTML += `<p>Edited</p>`
	updated, err := discussion.Update(ctx, w.Author, comments.UpdateInput{
		CommentID:        comment.Body.Result.ID,
		ExpectedRevision: 1,
		Body:             body,
		RetryReference:   uuid.NewString(),
	})
	if err != nil || count() != before {
		t.Fatal("existing mention renotified", err)
	}
	body.HTML += `<span data-user-id="` + w.Other.UserID.String() + `">forged</span>`
	body.MentionUserIDs = append(body.MentionUserIDs, w.Other.UserID)
	updated, err = discussion.Update(ctx, w.Author, comments.UpdateInput{
		CommentID:        comment.Body.Result.ID,
		ExpectedRevision: updated.Body.Result.Revision,
		Body:             body,
		RetryReference:   uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	assertReasons(updated.Body.Receipt.EventID, w.Issue, map[command.UserID][]string{w.Other.UserID: {"mention"}})
	blocker, err := work.Create(ctx, w.Author, issues.CreateInput{
		ProjectID:         w.Project,
		CreateIssueFields: issues.CreateIssueFields{Title: "Blocking work"},
		RetryReference:    uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	v = get(w.Issue)
	dependency, err := work.AddDependency(ctx, w.Author, issues.AddDependencyInput{
		IssueID:               w.Issue,
		BlockerID:             blocker.Body.Result.Summary.ID,
		ExpectedIssueRevision: v.Summary.Revision,
		ExpectedGraphRevision: v.GraphRevision,
		RetryReference:        uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	assertReasons(dependency.Body.Receipt.EventID, w.Issue, responsible("dependency_blocked"))
	completed := move(blocker.Body.Result.Summary.ID, command.Done)
	assertReasons(completed.Body.Receipt.EventID, w.Issue, responsible("dependency_resolved"))
	reopened := move(blocker.Body.Result.Summary.ID, command.Todo)
	assertReasons(reopened.Body.Receipt.EventID, w.Issue, responsible("dependency_blocked"))
	v = get(w.Issue)
	child, err := work.CreateSubtask(ctx, w.Author, issues.CreateSubtaskInput{
		ParentID: w.Issue,
		CreateSubtaskFields: issues.CreateSubtaskFields{
			Title:                  "Child",
			ExpectedParentRevision: v.Summary.Revision,
		},
		RetryReference: uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	assertReasons(child.Body.Receipt.EventID, w.Issue, responsible("subtask_created"))
	completed = move(child.Body.Result.Summary.ID, command.Done)
	assertReasons(completed.Body.Receipt.EventID, w.Issue, responsible("subtasks_completed"))
	reopened = move(child.Body.Result.Summary.ID, command.Todo)
	assertReasons(reopened.Body.Receipt.EventID, w.Issue, map[command.UserID][]string{})
	// Read-state writes create private audit only, never additional notifications.
	inbox := notifications.New(runner, signer)
	list, err := inbox.List(ctx, w.Viewer, notifications.ListInput{})
	if err != nil || len(list.Items) != 1 {
		t.Fatal(err)
	}
	before = count()
	_, err = inbox.SetRead(ctx, w.Viewer, notifications.SetReadInput{
		NotificationID: list.Items[0].ID,
		SetReadFields: notifications.SetReadFields{
			ExpectedRevision: list.Items[0].Revision,
			Read:             true,
		},
		RetryReference: uuid.NewString(),
	})
	if err != nil || count() != before {
		t.Fatal("notification loop", err)
	}
}
