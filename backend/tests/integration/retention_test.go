package integration

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"strings"
	"testing"

	"gategoldjira/backend/internal/features/comments"
	"gategoldjira/backend/internal/features/issues"
	"gategoldjira/backend/internal/features/pictures"
	"gategoldjira/backend/internal/features/projects"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/tests/testapp"
	"gategoldjira/backend/tests/testenv"
	"github.com/google/uuid"
)

func TestArchiveRevocationAndNewInstancePreserveHistoryGraphsAndPictures(t *testing.T) {
	r := testapp.NewRuntime(t)
	ctx := context.Background()
	admin := command.Actor{UserID: r.Admin, Channel: command.REST}
	member := command.Actor{UserID: r.Member, Channel: command.MCP}
	signer, _ := command.NewCursorSigner([]byte(strings.Repeat("p", 32)))
	runner := command.Runner{Pool: r.Pool}
	ps := projects.New(runner, signer)
	work := issues.New(runner, signer)
	photos := pictures.New(runner, signer, r.PictureStore(t))
	discussion := comments.New(runner, signer, photos)
	project, err := ps.Create(ctx, admin, projects.CreateInput{
		Key:            "RT",
		Name:           "Retention",
		RetryReference: uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = r.Pool.Exec(ctx, "INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,'member'),($1,$3,'viewer')", project.Body.Result.ID.UUID, r.Member.UUID, r.Viewer.UUID); err != nil {
		t.Fatal(err)
	}
	input := issues.CreateInput{
		ProjectID: project.Body.Result.ID,
		CreateIssueFields: issues.CreateIssueFields{
			Title:      "عمل محفوظ",
			AssigneeID: &r.Viewer,
		},
		RetryReference: uuid.NewString(),
	}
	// A Viewer cannot be assigned. Use the approved Member, preserving validation.
	input.AssigneeID = &r.Member
	parent, err := work.Create(ctx, member, input)
	if err != nil {
		t.Fatal(err)
	}
	child, err := work.CreateSubtask(ctx, member, issues.CreateSubtaskInput{
		ParentID: parent.Body.Result.Summary.ID,
		CreateSubtaskFields: issues.CreateSubtaskFields{
			Title:                  "طفل",
			ExpectedParentRevision: parent.Body.Result.Summary.Revision,
		},
		RetryReference: uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	blockerInput := input
	blockerInput.Title = "Blocker"
	blockerInput.RetryReference = uuid.NewString()
	blocker, err := work.Create(ctx, member, blockerInput)
	if err != nil {
		t.Fatal(err)
	}
	fresh, err := work.Get(ctx, member, parent.Body.Result.Summary.ID)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = work.AddDependency(ctx, member, issues.AddDependencyInput{
		IssueID:               fresh.Summary.ID,
		BlockerID:             blocker.Body.Result.Summary.ID,
		ExpectedIssueRevision: fresh.Summary.Revision,
		ExpectedGraphRevision: fresh.GraphRevision,
		RetryReference:        uuid.NewString(),
	}); err != nil {
		t.Fatal(err)
	}
	image := testenv.PNG(t)
	picture, err := photos.Upload(ctx, member, pictures.UploadInput{
		IssueID: fresh.Summary.ID,
		Metadata: pictures.UploadMetadata{
			Filename:    "retained.png",
			Description: "صورة",
			MIMEType:    "image/png",
			Publication: pictures.Gallery,
		},
		Data:           image,
		RetryReference: uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	body := comments.Body{
		HTML:           `<p>قديم <span data-user-id="` + r.Viewer.String() + `">Viewer</span><img data-picture-id="` + picture.Body.Result.ID.String() + `"></p>`,
		MentionUserIDs: []command.UserID{r.Viewer},
		PictureIDs:     []command.PictureID{picture.Body.Result.ID},
	}
	comment, err := discussion.Create(ctx, member, comments.CreateInput{
		IssueID:        fresh.Summary.ID,
		Body:           body,
		RetryReference: uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	body.HTML = "<p>جديد</p>"
	body.MentionUserIDs = []command.UserID{}
	body.PictureIDs = []command.PictureID{}
	if _, err = discussion.Update(ctx, member, comments.UpdateInput{
		CommentID:        comment.Body.Result.ID,
		ExpectedRevision: 1,
		Body:             body,
		RetryReference:   uuid.NewString(),
	}); err != nil {
		t.Fatal(err)
	}
	// Snapshot append-only rows, including references in the old version. Later
	// access changes may append events but must never rewrite this original set.
	var originalEvents []uuid.UUID
	rows, err := r.Pool.Query(ctx, "SELECT id FROM activity_events")
	if err != nil {
		t.Fatal(err)
	}
	for rows.Next() {
		var id uuid.UUID
		if err = rows.Scan(&id); err != nil {
			t.Fatal(err)
		}
		originalEvents = append(originalEvents, id)
	}
	rows.Close()
	if rows.Err() != nil {
		t.Fatal(rows.Err())
	}
	snapshot := func() string {
		t.Helper()
		var hash string
		if err := r.Pool.QueryRow(ctx, `SELECT md5(concat((SELECT string_agg(row_to_json(x)::text,'' ORDER BY id) FROM activity_events x WHERE id=ANY($1)),(SELECT string_agg(row_to_json(x)::text,'' ORDER BY comment_id,revision) FROM comment_versions x),(SELECT string_agg(row_to_json(x)::text,'' ORDER BY comment_id,version,picture_id) FROM comment_version_pictures x),(SELECT string_agg(row_to_json(x)::text,'' ORDER BY comment_id,version,user_id) FROM comment_version_mentions x),(SELECT string_agg(row_to_json(x)::text,'' ORDER BY id) FROM notifications x)))`, originalEvents).Scan(&hash); err != nil {
			t.Fatal(err)
		}
		return hash
	}
	before := snapshot()
	archived, err := ps.Archive(ctx, admin, projects.RevisionInput{
		ProjectID:        project.Body.Result.ID,
		ExpectedRevision: project.Body.Result.Revision,
		RetryReference:   uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = r.Pool.Exec(ctx, "UPDATE users SET disabled_at=now() WHERE id=$1", r.Member.UUID); err != nil {
		t.Fatal(err)
	}
	r.Restart(t)
	// Old browser/assistant tokens are valid signatures but current approval
	// denies them; sign-out is client-side and never removes durable work.
	q, _ := http.NewRequest("GET", r.URL+"/api/v1/issues/"+fresh.Summary.ID.String(), nil)
	q.Header.Set("Authorization", "Bearer "+r.Token(t, r.Member, command.REST))
	res, err := http.DefaultClient.Do(q)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode != 403 {
		t.Fatal("revoked identity read retained data", res.StatusCode)
	}
	if _, err = r.Pool.Exec(ctx, "UPDATE users SET disabled_at=NULL WHERE id=$1", r.Member.UUID); err != nil {
		t.Fatal(err)
	}
	if _, err = ps.Restore(ctx, admin, projects.RevisionInput{
		ProjectID:        project.Body.Result.ID,
		ExpectedRevision: archived.Body.Result.Revision,
		RetryReference:   uuid.NewString(),
	}); err != nil {
		t.Fatal(err)
	}
	r.Restart(t)
	if before != snapshot() {
		t.Fatal("archive/revoke/new instance rewrote immutable history or inbox")
	}
	graph, err := work.Dependencies(ctx, member, issues.ListDependenciesInput{
		IssueID:   fresh.Summary.ID,
		Direction: issues.BlockedBy,
	})
	if err != nil || len(graph.Items) != 1 {
		t.Fatal("dependency lost", err)
	}
	v, err := work.Get(ctx, member, child.Body.Result.Summary.ID)
	if err != nil || v.Summary.Parent.Value == nil || v.Summary.Parent.Value.ID != fresh.Summary.ID {
		t.Fatal("hierarchy lost", err)
	}
	q, _ = http.NewRequest("GET", r.URL+"/api/v1/pictures/"+picture.Body.Result.ID.String()+"/content", nil)
	q.Header.Set("Authorization", "Bearer "+r.Token(t, r.Member, command.REST))
	res, err = http.DefaultClient.Do(q)
	if err != nil {
		t.Fatal(err)
	}
	got, err := io.ReadAll(res.Body)
	res.Body.Close()
	if err != nil || res.StatusCode != 200 || !bytes.Equal(got, image) {
		t.Fatal("old version picture lost", err)
	}
}
