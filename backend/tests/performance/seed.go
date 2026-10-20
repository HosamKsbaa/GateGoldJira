package performance

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"html"
	"strings"
	"testing"
	"time"

	"gategoldjira/backend/internal/features/activity"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/objectstore"
	"gategoldjira/backend/tests/testapp"
	"gategoldjira/backend/tests/testenv"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type ScaleIssue struct {
	ID      command.IssueID
	Project command.ProjectID
	Number  int64
	Status  command.Status
	Parent  *uuid.UUID
}
type ScaleFixture struct {
	Users    []command.UserID
	Projects []command.ProjectID
	Issues   []ScaleIssue
	Boards   []command.BoardID
	Pictures []command.PictureID
}

func scaleID(kind string, index int) uuid.UUID {
	return uuid.NewSHA1(uuid.NameSpaceURL, []byte(fmt.Sprintf("gategoldjira-scale-v1/%s/%d", kind, index)))
}
func Seed(t *testing.T, r *testapp.Runtime) ScaleFixture {
	t.Helper()
	ctx := context.Background()
	if !strings.HasPrefix(r.Pool.Config().ConnConfig.Database, "gg_test_") {
		t.Fatal("Scale seeding requires a new isolated test database")
	}
	f := ScaleFixture{Users: []command.UserID{r.Admin, r.Member, r.Viewer}}
	tx, err := r.Pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	copyRows := func(table string, columns []string, rows [][]any) {
		t.Helper()
		if table == "issues" || table == "boards" || table == "project_status_order" {
			names, parameters := make([]string, len(columns)), make([]string, len(columns))
			for i, name := range columns {
				names[i] = pgx.Identifier{name}.Sanitize()
				parameters[i] = fmt.Sprintf("$%d", i+1)
			}
			query := "INSERT INTO " + pgx.Identifier{table}.Sanitize() + "(" + strings.Join(names, ",") + ") VALUES(" + strings.Join(parameters, ",") + ")"
			batch := &pgx.Batch{}
			for _, row := range rows {
				batch.Queue(query, row...)
			}
			results := tx.SendBatch(ctx, batch)
			for range rows {
				if _, err := results.Exec(); err != nil {
					_ = results.Close()
					t.Fatal("compatibility fixture", table, err)
				}
			}
			if err := results.Close(); err != nil {
				t.Fatal(err)
			}
			return
		}
		n, err := tx.CopyFrom(ctx, pgx.Identifier{table}, columns, pgx.CopyFromRows(rows))
		if err != nil || n != int64(len(rows)) {
			t.Fatal("scale fixture", table, n, err)
		}
	}
	now := time.Date(2026, 10, 12, 10, 0, 0, 0, time.UTC)
	rows := [][]any{}
	for i := 3; i < 50; i++ {
		id := command.UserID{UUID: scaleID("user", i)}
		f.Users = append(f.Users, id)
		name := fmt.Sprintf("Employee %d", i)
		if i%5 < 2 {
			name = fmt.Sprintf("موظف الفريق %d", i)
		}
		email := fmt.Sprintf("employee%d@scale.test", i)
		rows = append(rows, []any{id.UUID, email, email, name, now})
	}
	copyRows("users", []string{"id", "email", "email_key", "display_name", "approved_at"}, rows)
	rows = nil
	members := [][]any{}
	orders := [][]any{}
	labels := [][]any{}
	boardRows := [][]any{}
	global := 0
	for p := 0; p < 20; p++ {
		count := 375
		if p == 0 {
			count = 2000
		} else if p == 1 {
			count = 1200
		} else if p == 19 {
			count = 425
		}
		project := command.ProjectID{UUID: scaleID("project", p)}
		f.Projects = append(f.Projects, project)
		rows = append(rows, []any{
			project.UUID,
			fmt.Sprintf("S%02d", p),
			fmt.Sprintf("مشروع Scale %02d", p),
			r.Admin.UUID,
			int64(count + 1),
		})
		for i, u := range f.Users {
			if i == 0 {
				continue
			}
			role := "member"
			if u == r.Viewer {
				role = "viewer"
			}
			members = append(members, []any{project.UUID, u.UUID, role})
		}
		for _, status := range []command.Status{command.Todo, command.InProgress, command.Review, command.Done} {
			orders = append(orders, []any{project.UUID, string(status)})
		}
		for label := 0; label < 10; label++ {
			name := fmt.Sprintf("تصنيف %d", label)
			labels = append(labels, []any{scaleID("label", p*10+label), project.UUID, name, name, r.Admin.UUID})
		}
		for b := 0; b < 3; b++ {
			id := command.BoardID{UUID: scaleID("board", p*3+b)}
			f.Boards = append(f.Boards, id)
			name := fmt.Sprintf("لوحة %d", b)
			key := name
			filters := command.IssueFilter{}
			if b == 0 {
				name = "All Issues"
				key = "all issues"
			} else if b == 1 {
				filters.LabelIDs = []command.LabelID{{UUID: scaleID("label", p*10)}}
			} else {
				filters.Assignee = &command.AssigneeFilter{Mode: command.Unassigned}
			}
			raw, _ := json.Marshal(filters)
			boardRows = append(boardRows, []any{
				id.UUID,
				project.UUID,
				name,
				key,
				r.Admin.UUID,
				b == 0,
				raw,
				int32(40),
				int32(20),
			})
		}
		for n := 0; n < count; n++ {
			id := command.IssueID{UUID: scaleID("issue", global)}
			status := []command.Status{command.Todo, command.InProgress, command.Review, command.Done}[(n/5)%4]
			var parent *uuid.UUID
			if n%5 == 4 {
				parentID := f.Issues[global-4].ID.UUID
				parent = &parentID
			}
			f.Issues = append(f.Issues, ScaleIssue{id, project, int64(n + 1), status, parent})
			global++
		}
	}
	copyRows("projects", []string{"id", "key", "name", "created_by", "next_issue_number"}, rows)
	copyRows("project_memberships", []string{"project_id", "user_id", "role"}, members)
	copyRows("project_status_order", []string{"project_id", "status"}, orders)
	copyRows("labels", []string{"id", "project_id", "name", "name_key", "created_by"}, labels)
	copyRows("boards", []string{
		"id",
		"project_id",
		"name",
		"name_key",
		"created_by",
		"is_default",
		"saved_filters",
		"in_progress_limit",
		"review_limit",
	}, boardRows)
	rows = nil
	issueLabels := [][]any{}
	dependencies := [][]any{}
	for i, issue := range f.Issues {
		kind := "task"
		if issue.Parent != nil {
			kind = "subtask"
		} else if i%7 == 0 {
			kind = "bug"
		}
		title := fmt.Sprintf("Scale work %d", i)
		if i%5 < 2 {
			title = fmt.Sprintf("عمل عربي SCALE-%d", i)
		}
		var due any
		if i%2 == 0 {
			due = now.AddDate(0, 0, i%30-15)
		}
		var assignee any
		if i%3 != 0 {
			assignee = f.Users[3+i%47].UUID
		}
		rows = append(rows, []any{
			issue.ID.UUID,
			issue.Project.UUID,
			issue.Number,
			title,
			"Prepared scale fixture",
			kind,
			"medium",
			string(issue.Status),
			r.Member.UUID,
			assignee,
			due,
			issue.Parent,
			issue.Number * 1024,
			now,
			now.Add(time.Duration(i) * time.Microsecond),
		})
		projectIndex := 0
		for n, id := range f.Projects {
			if id == issue.Project {
				projectIndex = n
				break
			}
		}
		for _, l := range []int{i % 10, (i + 1) % 10} {
			issueLabels = append(issueLabels, []any{issue.Project.UUID, issue.ID.UUID, scaleID("label", projectIndex*10+l)})
		}
		if i%10 == 8 {
			dependencies = append(dependencies, []any{issue.Project.UUID, issue.ID.UUID, f.Issues[i-1].ID.UUID, r.Admin.UUID})
		}
	}
	copyRows("issues", []string{
		"id",
		"project_id",
		"number",
		"title",
		"description",
		"type",
		"priority",
		"status",
		"reporter_id",
		"assignee_id",
		"due_date",
		"parent_id",
		"rank",
		"created_at",
		"updated_at",
	}, rows)
	copyRows("issue_labels", []string{"project_id", "issue_id", "label_id"}, issueLabels)
	copyRows("issue_dependencies", []string{"project_id", "dependent_id", "blocker_id", "created_by"}, dependencies)
	rows = nil
	versions := [][]any{}
	for c := 0; c < 20000; c++ {
		issueIndex := 0
		if c >= 500 {
			issueIndex = 1 + (c-500)/2
		}
		issue := f.Issues[issueIndex]
		id := scaleID("comment", c)
		text := fmt.Sprintf("Scale comment %d", c)
		if c%5 < 2 {
			text = fmt.Sprintf("تعليق عربي %d GG-%d", c, issue.Number)
		}
		created := now.Add(time.Duration(c) * time.Microsecond)
		rows = append(rows, []any{id, issue.Project.UUID, issue.ID.UUID, r.Member.UUID, created})
		versions = append(versions, []any{
			id,
			int64(1),
			issue.ID.UUID,
			"<p dir=\"auto\">" + html.EscapeString(text) + "</p>",
			text,
			created,
		})
	}
	copyRows("comments", []string{"id", "project_id", "issue_id", "author_id", "created_at"}, rows)
	copyRows("comment_versions", []string{
		"comment_id",
		"revision",
		"issue_id",
		"safe_html",
		"plain_text",
		"created_at",
	}, versions)
	rows = nil
	inbox := [][]any{}
	before, after := "Before", "After"
	changes, err := json.Marshal(activity.Changes{
		Version: 1,
		Fields: []activity.FieldChange{{
			Field:  "title",
			Before: &before,
			After:  &after,
		}},
	})
	if err != nil {
		t.Fatal(err)
	}
	for n := 0; n < 50000; n++ {
		issue := f.Issues[n%len(f.Issues)]
		event := scaleID("event", n)
		created := now.Add(time.Duration(n) * time.Microsecond)
		rows = append(rows, []any{
			event,
			r.Admin.UUID,
			"mcp",
			"update_issue",
			"issue",
			issue.ID.UUID,
			issue.Project.UUID,
			issue.ID.UUID,
			changes,
			created,
		})
		var readAt any
		if n%3 == 0 {
			readAt = created
		}
		inbox = append(inbox, []any{
			scaleID("notification", n),
			r.Member.UUID,
			event,
			issue.Project.UUID,
			issue.ID.UUID,
			r.Admin.UUID,
			[]string{"comment", "mention"},
			fmt.Sprintf("تحديث GG-%d", issue.Number),
			created,
			readAt,
		})
	}
	copyRows("activity_events", []string{
		"id",
		"actor_id",
		"channel",
		"action",
		"resource_kind",
		"resource_id",
		"project_id",
		"issue_id",
		"changes",
		"created_at",
	}, rows)
	copyRows("notifications", []string{
		"id",
		"recipient_id",
		"event_id",
		"project_id",
		"issue_id",
		"actor_id",
		"reasons",
		"plain_text_summary",
		"created_at",
		"read_at",
	}, inbox)
	if err := tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	// Write1000 actual immutable1MiB objects (1GiB). Do not pretend small metadata
	// rows exercise the private object path or average-size workload.
	store := r.PictureStore(t)
	data := testenv.PNGSize(t, 1<<20)
	photoRows := [][]any{}
	for n := 0; n < 1000; n++ {
		issue := f.Issues[n]
		id := command.PictureID{UUID: scaleID("picture", n)}
		f.Pictures = append(f.Pictures, id)
		key := objectstore.Key("scale/staging/" + id.String())
		published := objectstore.Key("scale/published/" + id.String())
		staged, err := store.CreateStaging(ctx, key, bytes.NewReader(data), int64(len(data)), "image/png")
		if err != nil {
			t.Fatal(err)
		}
		saved, err := store.Publish(ctx, key, staged, published)
		if err != nil {
			t.Fatal(err)
		}
		if err := store.DeleteFailedStaging(ctx, key, staged.Generation); err != nil {
			t.Fatal(err)
		}
		photoRows = append(photoRows, []any{
			id.UUID,
			issue.Project.UUID,
			issue.ID.UUID,
			r.Member.UUID,
			"image",
			"scale.png",
			"صورة توضيحية",
			"image/png",
			saved.Size,
			saved.SHA256,
			string(key),
			staged.Generation,
			string(published),
			saved.Generation,
			"published",
			true,
			now,
			now.Add(24 * time.Hour),
			now,
		})
	}
	if n, err := r.Pool.CopyFrom(ctx, pgx.Identifier{"attachments"}, []string{
		"id",
		"project_id",
		"issue_id",
		"uploaded_by",
		"kind",
		"filename",
		"description",
		"mime_type",
		"byte_size",
		"checksum",
		"staging_key",
		"staging_generation",
		"published_key",
		"published_generation",
		"state",
		"in_panel",
		"uploaded_at",
		"expires_at",
		"published_at",
	}, pgx.CopyFromRows(photoRows)); err != nil || n != 1000 {
		t.Fatal("picture fixture", n, err)
	}
	if _, err := r.Pool.Exec(ctx, "ANALYZE"); err != nil {
		t.Fatal(err)
	}
	return f
}
