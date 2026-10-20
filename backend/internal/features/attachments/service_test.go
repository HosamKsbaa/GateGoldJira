package attachments

import (
	"bytes"
	"context"
	"errors"
	"io"
	"strings"
	"testing"
	"time"

	"gategoldjira/backend/internal/features/activity"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/objectstore"
	"gategoldjira/backend/tests/testenv"
	"github.com/google/uuid"
)

func attachmentService(t *testing.T, w testenv.Workspace) *Service {
	t.Helper()
	signer, err := command.NewCursorSigner([]byte(strings.Repeat("a", 32)))
	if err != nil {
		t.Fatal(err)
	}
	store, err := objectstore.NewLocal(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	return New(command.Runner{Pool: w.Pool}, signer, store)
}
func textUpload(issue command.IssueID) UploadInput {
	return UploadInput{
		IssueID: issue,
		Metadata: AttachmentUploadMetadata{
			Filename: "متطلبات.txt",
			MIMEType: "text/plain",
		},
		Data:           []byte("متطلبات المشروع\nBuild a board"),
		RetryReference: uuid.NewString(),
	}
}
func requireFailure(t *testing.T, err error, code command.FailureCode) {
	t.Helper()
	var failure *command.Failure
	if !errors.As(err, &failure) || failure.Code != code {
		t.Fatalf("expected %s, got %v", code, err)
	}
}
func TestPrivateAttachmentsRetryCASAuditRetentionAndRevocation(t *testing.T) {
	w := testenv.Work(t)
	ctx := context.Background()
	service := attachmentService(t, w)
	in := textUpload(w.Issue)
	if _, err := w.Pool.Exec(ctx, "INSERT INTO issue_watchers(issue_id,user_id) VALUES($1,$2)", w.Issue.UUID, w.Viewer.UserID.UUID); err != nil {
		t.Fatal(err)
	}
	if _, err := service.Upload(ctx, w.Viewer, in); err == nil {
		t.Fatal("viewer uploaded")
	}
	saved, err := service.Upload(ctx, w.Author, in)
	if err != nil {
		t.Fatal(err)
	}
	id := saved.Body.Result.ID
	actor := w.Author
	actor.Channel = command.MCP
	replay, err := service.Upload(ctx, actor, in)
	if err != nil || !replay.Body.Receipt.Replayed || replay.Body.Result.ID != id {
		t.Fatal("cross-channel replay", err)
	}
	changed := in
	changed.Data = []byte("Different content")
	_, err = service.Upload(ctx, actor, changed)
	requireFailure(t, err, command.RetryReferenceReused)
	content, err := service.Content(ctx, w.Viewer, id)
	if err != nil || !bytes.Equal(content.Data, in.Data) {
		t.Fatal("authorized private download", err)
	}
	page, err := service.List(ctx, w.Viewer, ListInput{IssueID: w.Issue})
	if err != nil || len(page.Items) != 1 || page.TotalMatching != 1 {
		t.Fatal("paginated list", err)
	}
	_, err = service.Detach(ctx, w.Author, DetachInput{id, 1, uuid.NewString()})
	requireFailure(t, err, command.Conflict)
	var revision int64
	if err = w.Pool.QueryRow(ctx, "SELECT revision FROM issues WHERE id=$1", w.Issue.UUID).Scan(&revision); err != nil {
		t.Fatal(err)
	}
	detach := DetachInput{id, command.Revision(revision), uuid.NewString()}
	detached, err := service.Detach(ctx, w.Author, detach)
	if err != nil || detached.Body.Result.Attached {
		t.Fatal("detach", err)
	}
	duplicate, err := service.Detach(ctx, actor, detach)
	if err != nil || !duplicate.Body.Receipt.Replayed {
		t.Fatal("detach replay", err)
	}
	page, err = service.List(ctx, w.Viewer, ListInput{IssueID: w.Issue})
	if err != nil || len(page.Items) != 0 || page.TotalMatching != 0 {
		t.Fatal("detached row remained listed", err)
	}
	if _, err = service.Content(ctx, w.Viewer, id); err != nil {
		t.Fatal("detached immutable content lost", err)
	}
	var notices int
	if err := w.Pool.QueryRow(ctx, "SELECT count(*) FROM notifications WHERE issue_id=$1 AND recipient_id=$2 AND 'watching'=ANY(reasons)", w.Issue.UUID, w.Viewer.UserID.UUID).Scan(&notices); err != nil || notices != 2 {
		t.Fatal("upload/detach watcher notifications must be idempotent", notices, err)
	}
	var events int
	if err = w.Pool.QueryRow(ctx, "SELECT count(*) FROM activity_events WHERE resource_kind='attachment'").Scan(&events); err != nil || events != 2 {
		t.Fatal("one event per actual mutation", err, events)
	}
	eventPage, eventErr := activity.New(service.runner, service.cursors).List(ctx, w.Admin, activity.ListInput{ProjectID: &w.Project})
	if eventErr != nil || len(eventPage.Items) != 2 {
		t.Fatal("attachment activity", eventErr)
	}
	for _, event := range eventPage.Items {
		attachedVisible := false
		for _, field := range event.Changes {
			attachedVisible = attachedVisible || field.Field == "attached"
		}
		if !attachedVisible {
			t.Fatal("public attachment reference change missing")
		}
	}
	if _, err = w.Pool.Exec(ctx, "UPDATE attachments SET filename='changed.txt' WHERE id=$1", id.UUID); err == nil {
		t.Fatal("immutable metadata changed")
	}
	if _, err = w.Pool.Exec(ctx, "DELETE FROM attachments WHERE id=$1", id.UUID); err == nil {
		t.Fatal("retained bytes record deleted")
	}
	if _, err = w.Pool.Exec(ctx, "UPDATE project_memberships SET removed_at=now() WHERE project_id=$1 AND user_id=$2", w.Project.UUID, w.Viewer.UserID.UUID); err != nil {
		t.Fatal(err)
	}
	if _, err = service.Content(ctx, w.Viewer, id); err == nil {
		t.Fatal("revoked reader accessed bytes")
	}
	if _, err = w.Pool.Exec(ctx, "UPDATE projects SET archived_at=now() WHERE id=$1", w.Project.UUID); err != nil {
		t.Fatal(err)
	}
	in.RetryReference = uuid.NewString()
	if _, err = service.Upload(ctx, w.Author, in); err == nil {
		t.Fatal("archived project uploaded")
	}
}

type blockedStore struct {
	objectstore.Store
	started chan struct{}
	release chan struct{}
}

func (s blockedStore) CreateStaging(ctx context.Context, key objectstore.Key, reader io.Reader, size int64, mime string) (objectstore.Info, error) {
	close(s.started)
	select {
	case <-s.release:
	case <-ctx.Done():
		return objectstore.Info{}, ctx.Err()
	}
	return s.Store.CreateStaging(ctx, key, reader, size, mime)
}
func TestUploadTransfersWithoutProjectLocksAndRechecksRevocation(t *testing.T) {
	w := testenv.Work(t)
	ctx := context.Background()
	service := attachmentService(t, w)
	blocked := blockedStore{service.store, make(chan struct{}), make(chan struct{})}
	service.store = blocked
	in := textUpload(w.Issue)
	done := make(chan error, 1)
	go func() { _, err := service.Upload(ctx, w.Author, in); done <- err }()
	select {
	case <-blocked.started:
	case <-time.After(5 * time.Second):
		t.Fatal("transfer never started")
	}
	if w.Pool.Stat().AcquiredConns() != 0 {
		close(blocked.release)
		t.Fatal("DB connection held during transfer")
	}
	_, err := service.Upload(ctx, w.Author, in)
	requireFailure(t, err, command.Busy)
	if _, err = w.Pool.Exec(ctx, "UPDATE project_memberships SET removed_at=now(),revision=revision+1 WHERE project_id=$1 AND user_id=$2", w.Project.UUID, w.Author.UserID.UUID); err != nil {
		close(blocked.release)
		t.Fatal(err)
	}
	close(blocked.release)
	select {
	case err = <-done:
		if err == nil {
			t.Fatal("revoked writer committed")
		}
	case <-time.After(5 * time.Second):
		t.Fatal("transfer never completed")
	}
	var count int
	if err = w.Pool.QueryRow(ctx, "SELECT count(*) FROM attachments").Scan(&count); err != nil || count != 0 {
		t.Fatal("partial upload exposed", err)
	}
}

type failedAcknowledgement struct {
	objectstore.Store
	fail bool
}

func (s *failedAcknowledgement) CreateStaging(ctx context.Context, key objectstore.Key, reader io.Reader, size int64, mime string) (objectstore.Info, error) {
	info, err := s.Store.CreateStaging(ctx, key, reader, size, mime)
	if err == nil && s.fail {
		s.fail = false
		return info, errors.New("lost acknowledgement")
	}
	return info, err
}
func TestLostStorageAcknowledgementAndMetadataFailureRecoverOneAttachment(t *testing.T) {
	w := testenv.Work(t)
	ctx := context.Background()
	service := attachmentService(t, w)
	service.store = &failedAcknowledgement{service.store, true}
	in := textUpload(w.Issue)
	if _, err := service.Upload(ctx, w.Author, in); err == nil {
		t.Fatal("lost response acknowledged")
	}
	saved, err := service.Upload(ctx, w.Author, in)
	if err != nil {
		t.Fatal("same-reference recovery", err)
	}
	replay, err := service.Upload(ctx, w.Author, in)
	if err != nil || !replay.Body.Receipt.Replayed || replay.Body.Result.ID != saved.Body.Result.ID {
		t.Fatal("recovery duplicated", err)
	}
	if _, err = w.Pool.Exec(ctx, "CREATE FUNCTION reject_attachment() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected commit failure'; END; $$; CREATE TRIGGER reject_attachment BEFORE INSERT ON attachments FOR EACH ROW EXECUTE FUNCTION reject_attachment()"); err != nil {
		t.Fatal(err)
	}
	in.RetryReference = uuid.NewString()
	if _, err = service.Upload(ctx, w.Author, in); err == nil {
		t.Fatal("metadata failure acknowledged")
	}
	if _, err = w.Pool.Exec(ctx, "DROP TRIGGER reject_attachment ON attachments; DROP FUNCTION reject_attachment()"); err != nil {
		t.Fatal(err)
	}
	if _, err = service.Upload(ctx, w.Author, in); err != nil {
		t.Fatal("ready reservation recovery", err)
	}
	var count int
	if err = w.Pool.QueryRow(ctx, "SELECT count(*) FROM attachments").Scan(&count); err != nil || count != 2 {
		t.Fatal("duplicate records", err)
	}
	if err = w.Pool.QueryRow(ctx, "SELECT count(*) FROM activity_events WHERE resource_kind='attachment'").Scan(&count); err != nil || count != 2 {
		t.Fatal("duplicate events", err)
	}
}

func TestAttachmentPaginationAndCleanupRespectPauseAndPublishedRetention(t *testing.T) {
	w := testenv.Work(t)
	ctx := context.Background()
	service := attachmentService(t, w)
	var retained command.AttachmentID
	for i := range 3 {
		in := textUpload(w.Issue)
		in.Metadata.Filename = []string{"first.txt", "second.txt", "third.txt"}[i]
		saved, err := service.Upload(ctx, w.Author, in)
		if err != nil {
			t.Fatal(err)
		}
		retained = saved.Body.Result.ID
	}
	limit := 2
	page, err := service.List(ctx, w.Viewer, ListInput{IssueID: w.Issue, Page: command.PageRequest{Limit: &limit}})
	if err != nil || len(page.Items) != 2 || page.TotalMatching != 3 || page.NextCursor == nil {
		t.Fatal("first cursor page", err)
	}
	next, err := service.List(ctx, w.Viewer, ListInput{
		IssueID: w.Issue,
		Page:    command.PageRequest{Limit: &limit, Cursor: page.NextCursor},
	})
	if err != nil || len(next.Items) != 1 || next.NextCursor != nil || next.Items[0].ID == page.Items[0].ID || next.Items[0].ID == page.Items[1].ID {
		t.Fatal("continued cursor page", err)
	}
	if _, err = service.List(ctx, w.Author, ListInput{
		IssueID: w.Issue,
		Page:    command.PageRequest{Cursor: page.NextCursor},
	}); err == nil {
		t.Fatal("caller-scoped cursor reused")
	}
	service.store = &failedAcknowledgement{service.store, true}
	in := textUpload(w.Issue)
	if _, err = service.Upload(ctx, w.Author, in); err == nil {
		t.Fatal("injected transfer did not fail")
	}
	var staging string
	if err = w.Pool.QueryRow(ctx, "UPDATE attachment_upload_reservations SET updated_at=now()-interval '25 hours' WHERE actor_id=$1 AND retry_reference=$2 RETURNING staging_key", w.Author.UserID.UUID, in.RetryReference).Scan(&staging); err != nil {
		t.Fatal(err)
	}
	if _, err = w.Pool.Exec(ctx, "UPDATE company_settings SET cleanup_paused=true"); err != nil {
		t.Fatal(err)
	}
	paused, err := service.Maintain(ctx)
	if err != nil || !paused.Paused || paused.RemovedStaging != 0 {
		t.Fatal("restore pause ignored", err)
	}
	if _, err = service.store.Inspect(ctx, objectstore.Key(staging), false); err != nil {
		t.Fatal("paused staging deleted", err)
	}
	if _, err = w.Pool.Exec(ctx, "UPDATE company_settings SET cleanup_paused=false"); err != nil {
		t.Fatal(err)
	}
	cleaned, err := service.Maintain(ctx)
	if err != nil || cleaned.RemovedStaging != 1 {
		t.Fatal("known failed staging not cleaned", err)
	}
	if _, err = service.store.Inspect(ctx, objectstore.Key(staging), false); !errors.Is(err, objectstore.ErrNotFound) {
		t.Fatal("failed staging remained")
	}
	if _, err = service.Content(ctx, w.Viewer, retained); err != nil {
		t.Fatal("maintenance removed published attachment", err)
	}
	if _, err = service.Upload(ctx, w.Author, in); err != nil {
		t.Fatal("original reference failed after staged cleanup", err)
	}
}

func TestArbitraryAttachmentsRemainPrivateOpaqueDownloads(t *testing.T) {
	w := testenv.Work(t)
	ctx := context.Background()
	s := attachmentService(t, w)
	data := []byte("<script>must never render</script>\x00opaque bytes")
	in := UploadInput{
		IssueID: w.Issue,
		Metadata: AttachmentUploadMetadata{
			Filename: "design.html",
			MIMEType: "application/octet-stream",
		},
		Data:           data,
		RetryReference: uuid.NewString(),
	}
	saved, err := s.Upload(ctx, w.Author, in)
	if err != nil {
		t.Fatal(err)
	}
	out, err := s.Content(ctx, w.Viewer, saved.Body.Result.ID)
	if err != nil || !bytes.Equal(data, out.Data) || out.Attachment.MIMEType != "application/octet-stream" {
		t.Fatal("opaque download changed", err)
	}
	actor := w.Author
	actor.Channel = command.MCP
	replay, err := s.Upload(ctx, actor, in)
	if err != nil || !replay.Body.Receipt.Replayed || replay.Body.Result.ID != saved.Body.Result.ID {
		t.Fatal("binary replay duplicated attachment", err)
	}
	if _, err := s.Upload(ctx, w.Viewer, in); err == nil {
		t.Fatal("viewer uploaded arbitrary bytes")
	}
}
