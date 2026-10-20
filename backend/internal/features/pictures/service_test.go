package pictures

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"image"
	"image/jpeg"
	"io"
	"strings"
	"testing"
	"time"

	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/objectstore"
	"gategoldjira/backend/tests/testenv"
	"github.com/google/uuid"
)

func TestDraftPrivacyPublicationExactExpiryAndRetainedGallery(t *testing.T) {
	w := testenv.Work(t)
	ctx := context.Background()
	signer, _ := command.NewCursorSigner([]byte(strings.Repeat("p", 32)))
	store, err := objectstore.NewLocal(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	service := New(command.Runner{Pool: w.Pool}, signer, store)
	input := UploadInput{
		IssueID: w.Issue,
		Metadata: UploadMetadata{
			Filename:    "شرح.png",
			Description: "صورة توضيح",
			MIMEType:    "image/png",
			Publication: CommentDraft,
		},
		Data:           testenv.PNG(t),
		RetryReference: uuid.NewString(),
	}
	draft, err := service.Upload(ctx, w.Author, input)
	if err != nil {
		t.Fatal(err)
	}
	id := draft.Body.Result.ID
	if draft.Body.Result.State != Draft || draft.Body.Result.ExpiresAt == nil {
		t.Fatal("draft lifecycle")
	}
	for _, actor := range []command.Actor{w.Admin, w.Other, w.Viewer} {
		_, err := service.Get(ctx, actor, id)
		var failure *command.Failure
		if !errors.As(err, &failure) || failure.Code != command.Unavailable {
			t.Fatal("private draft leaked")
		}
	}
	actor := w.Author
	actor.Channel = command.MCP
	replay, err := service.Upload(ctx, actor, input)
	if err != nil || !replay.Body.Receipt.Replayed || replay.Body.Result.ID != id {
		t.Fatal("upload replay changed object", err)
	}
	// The owner fixture ages the canonical expiry, whose identity is immutable to runtime writers.
	if _, err := w.Pool.Exec(ctx, "ALTER TABLE attachments DISABLE TRIGGER assets_immutable"); err != nil {
		t.Fatal(err)
	}
	if _, err := w.Pool.Exec(ctx, "UPDATE attachments SET uploaded_at=now()-interval '24 hours',expires_at=now() WHERE id=$1", id.UUID); err != nil {
		t.Fatal(err)
	}
	if _, err := w.Pool.Exec(ctx, "ALTER TABLE attachments ENABLE TRIGGER assets_immutable"); err != nil {
		t.Fatal(err)
	}
	if _, err := w.Pool.Exec(ctx, "ALTER TABLE attachments DISABLE TRIGGER assets_immutable"); err != nil {
		t.Fatal(err)
	}
	if _, err := w.Pool.Exec(ctx, "UPDATE pictures SET uploaded_at=now()-interval '24 hours',expires_at=now() WHERE id=$1", id.UUID); err != nil {
		t.Fatal(err)
	}
	if _, err := w.Pool.Exec(ctx, "ALTER TABLE attachments ENABLE TRIGGER assets_immutable"); err != nil {
		t.Fatal(err)
	}
	if _, err := service.Get(ctx, w.Author, id); err == nil {
		t.Fatal("expired draft accessed")
	}
	input.Metadata.Publication = Gallery
	input.RetryReference = uuid.NewString()
	gallery, err := service.Upload(ctx, w.Author, input)
	if err != nil {
		t.Fatal(err)
	}
	if gallery.Body.Result.State != Published || !gallery.Body.Result.InGallery || gallery.Body.Result.ExpiresAt != nil {
		t.Fatal("gallery not published")
	}
	if _, err := service.Get(ctx, w.Viewer, gallery.Body.Result.ID); err != nil {
		t.Fatal("published picture denied", err)
	}
	var currentRevision int64
	if err := w.Pool.QueryRow(ctx, "SELECT revision FROM issues WHERE id=$1", w.Issue.UUID).Scan(&currentRevision); err != nil {
		t.Fatal(err)
	}
	detached, err := service.Detach(ctx, w.Author, DetachInput{
		PictureID:             gallery.Body.Result.ID,
		ExpectedIssueRevision: command.Revision(currentRevision),
		RetryReference:        uuid.NewString(),
	})
	if err != nil || detached.Body.Result.InGallery {
		t.Fatal("gallery detach", err)
	}
	if _, err := service.Get(ctx, w.Viewer, gallery.Body.Result.ID); err != nil {
		t.Fatal("detached published bytes lost", err)
	}
	if _, err := w.Pool.Exec(ctx, "UPDATE project_memberships SET removed_at=now() WHERE project_id=$1 AND user_id=$2", w.Project.UUID, w.Viewer.UserID.UUID); err != nil {
		t.Fatal(err)
	}
	if _, err := service.Get(ctx, w.Viewer, gallery.Body.Result.ID); err == nil {
		t.Fatal("revoked image access")
	}
}
func TestPictureValidationRejectsMisidentifiedTruncatedAndOversizedFiles(t *testing.T) {
	png := testenv.PNG(t)
	if err := validateImage(png, "image/png"); err != nil {
		t.Fatal(err)
	}
	for _, sample := range []struct {
		data []byte
		mime string
	}{
		{png, "image/jpeg"},
		{png[:20], "image/png"},
		{
			[]byte("<svg onload='evil()'></svg>"),
			"image/png",
		},
		{
			make([]byte, objectstore.MaximumSize+1),
			"image/png",
		},
	} {
		if err := validateImage(sample.data, sample.mime); err == nil {
			t.Fatal("invalid bytes accepted")
		}
	}
}

type blockedStorage struct {
	objectstore.Store
	started chan struct{}
	release chan struct{}
}

func (s blockedStorage) CreateStaging(ctx context.Context, key objectstore.Key, reader io.Reader, size int64, mime string) (objectstore.Info, error) {
	close(s.started)
	select {
	case <-s.release:
	case <-ctx.Done():
		return objectstore.Info{}, ctx.Err()
	}
	return s.Store.CreateStaging(ctx, key, reader, size, mime)
}
func TestTransferHasNoDatabaseConnectionOrProjectLockAndRechecksRevocation(t *testing.T) {
	w := testenv.Work(t)
	ctx := context.Background()
	signer, _ := command.NewCursorSigner([]byte(strings.Repeat("p", 32)))
	store, err := objectstore.NewLocal(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	blocked := blockedStorage{Store: store, started: make(chan struct{}), release: make(chan struct{})}
	service := New(command.Runner{Pool: w.Pool}, signer, blocked)
	in := UploadInput{
		IssueID: w.Issue,
		Metadata: UploadMetadata{
			Filename:    "work.png",
			Description: "Picture",
			MIMEType:    "image/png",
			Publication: Gallery,
		},
		Data:           testenv.PNG(t),
		RetryReference: uuid.NewString(),
	}
	done := make(chan error, 1)
	go func() { _, err := service.Upload(ctx, w.Author, in); done <- err }()
	select {
	case <-blocked.started:
	case <-time.After(5 * time.Second):
		t.Fatal("transfer never started")
	}
	if w.Pool.Stat().AcquiredConns() != 0 {
		close(blocked.release)
		t.Fatal("connection held during transfer")
	}
	lockCtx, cancel := context.WithTimeout(ctx, time.Second)
	defer cancel()
	tx, err := w.Pool.Begin(lockCtx)
	if err != nil {
		close(blocked.release)
		t.Fatal(err)
	}
	if _, err := tx.Exec(lockCtx, "SELECT singleton FROM company_settings FOR UPDATE"); err != nil {
		close(blocked.release)
		t.Fatal("company lock held during transfer", err)
	}
	if _, err := tx.Exec(lockCtx, "SELECT id FROM projects WHERE id=$1 FOR UPDATE", w.Project.UUID); err != nil {
		close(blocked.release)
		t.Fatal("project lock held during transfer", err)
	}
	if _, err := tx.Exec(lockCtx, "UPDATE project_memberships SET removed_at=now(),revision=revision+1 WHERE project_id=$1 AND user_id=$2", w.Project.UUID, w.Author.UserID.UUID); err != nil {
		close(blocked.release)
		t.Fatal(err)
	}
	if err := tx.Commit(lockCtx); err != nil {
		close(blocked.release)
		t.Fatal(err)
	}
	close(blocked.release)
	select {
	case err := <-done:
		if err == nil {
			t.Fatal("revoked upload committed")
		}
	case <-time.After(5 * time.Second):
		t.Fatal("transfer did not finish")
	}
	var count int
	if err := w.Pool.QueryRow(ctx, "SELECT count(*) FROM pictures").Scan(&count); err != nil || count != 0 {
		t.Fatal("revocation left accessible picture")
	}
	if err := w.Pool.QueryRow(ctx, "SELECT count(*) FROM activity_events").Scan(&count); err != nil || count != 0 {
		t.Fatal("failed upload created audit")
	}
}
func TestIdenticalConcurrentUploadWaitsForLeaseThenReplaysOnce(t *testing.T) {
	w := testenv.Work(t)
	ctx := context.Background()
	signer, _ := command.NewCursorSigner([]byte(strings.Repeat("p", 32)))
	store, _ := objectstore.NewLocal(t.TempDir())
	blocked := blockedStorage{Store: store, started: make(chan struct{}), release: make(chan struct{})}
	service := New(command.Runner{Pool: w.Pool}, signer, blocked)
	in := UploadInput{
		IssueID: w.Issue,
		Metadata: UploadMetadata{
			Filename:    "work.png",
			Description: "Picture",
			MIMEType:    "image/png",
			Publication: CommentDraft,
		},
		Data:           testenv.PNG(t),
		RetryReference: uuid.NewString(),
	}
	done := make(chan command.SaveOutcome[PictureView], 1)
	failures := make(chan error, 1)
	go func() {
		out, err := service.Upload(ctx, w.Author, in)
		if err != nil {
			failures <- err
			return
		}
		done <- out
	}()
	select {
	case <-blocked.started:
	case <-time.After(5 * time.Second):
		t.Fatal("transfer never started")
	}
	_, err := service.Upload(ctx, w.Author, in)
	var failure *command.Failure
	if !errors.As(err, &failure) || failure.Code != command.Busy || failure.NextAction != command.RetrySameReference {
		close(blocked.release)
		t.Fatal("active reservation duplicated")
	}
	close(blocked.release)
	var first command.SaveOutcome[PictureView]
	select {
	case first = <-done:
	case err := <-failures:
		t.Fatal(err)
	case <-time.After(5 * time.Second):
		t.Fatal("upload never completed")
	}
	replay, err := service.Upload(ctx, w.Author, in)
	if err != nil || !replay.Body.Receipt.Replayed || first.Body.Result.ID != replay.Body.Result.ID || *first.Body.Receipt.EventID != *replay.Body.Receipt.EventID {
		t.Fatal("retry duplicated picture", err)
	}
}

func TestInterruptedTransferCanRetryOriginalReferenceWithoutPartialPicture(t *testing.T) {
	w := testenv.Work(t)
	ctx, cancel := context.WithCancel(context.Background())
	signer, _ := command.NewCursorSigner([]byte(strings.Repeat("p", 32)))
	store, _ := objectstore.NewLocal(t.TempDir())
	blocked := blockedStorage{Store: store, started: make(chan struct{}), release: make(chan struct{})}
	service := New(command.Runner{Pool: w.Pool}, signer, blocked)
	in := UploadInput{
		IssueID: w.Issue,
		Metadata: UploadMetadata{
			Filename:    "work.png",
			Description: "Picture",
			MIMEType:    "image/png",
			Publication: CommentDraft,
		},
		Data:           testenv.PNG(t),
		RetryReference: uuid.NewString(),
	}
	done := make(chan error, 1)
	go func() { _, err := service.Upload(ctx, w.Author, in); done <- err }()
	select {
	case <-blocked.started:
	case <-time.After(5 * time.Second):
		cancel()
		t.Fatal("transfer never started")
	}
	cancel()
	select {
	case err := <-done:
		var failure *command.Failure
		if !errors.As(err, &failure) || failure.Code != command.Busy || failure.NextAction != command.RetrySameReference {
			t.Fatal("interruption had no safe original retry", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("cancel did not end transfer")
	}
	var count int
	if err := w.Pool.QueryRow(context.Background(), "SELECT count(*) FROM pictures").Scan(&count); err != nil || count != 0 {
		t.Fatal("partial picture became accessible")
	}
	restored := New(command.Runner{Pool: w.Pool}, signer, store)
	out, err := restored.Upload(context.Background(), w.Author, in)
	if err != nil || out.Body.Result.State != Draft {
		t.Fatal("original retry could not recover", err)
	}
	if err := w.Pool.QueryRow(context.Background(), "SELECT count(*) FROM pictures").Scan(&count); err != nil || count != 1 {
		t.Fatal("recovery duplicated metadata")
	}
}

func TestPreparedPublicationRechecksExpiryAndRetainsPublishedBytes(t *testing.T) {
	w := testenv.Work(t)
	ctx := context.Background()
	signer, _ := command.NewCursorSigner([]byte(strings.Repeat("p", 32)))
	store, _ := objectstore.NewLocal(t.TempDir())
	s := New(command.Runner{Pool: w.Pool}, signer, store)
	in := UploadInput{
		IssueID: w.Issue,
		Metadata: UploadMetadata{
			Filename:    "work.png",
			Description: "صورة",
			MIMEType:    "image/png",
			Publication: CommentDraft,
		},
		Data:           testenv.PNG(t),
		RetryReference: uuid.NewString(),
	}
	out, err := s.Upload(ctx, w.Author, in)
	if err != nil {
		t.Fatal(err)
	}
	id := out.Body.Result.ID
	prepared, err := s.Prepare(ctx, w.Author, w.Issue, []command.PictureID{id})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.Prepare(ctx, w.Other, w.Issue, []command.PictureID{id}); err == nil {
		t.Fatal("other uploader published private draft")
	}
	// The owner fixture ages the canonical expiry, whose identity is immutable to runtime writers.
	if _, err := w.Pool.Exec(ctx, "ALTER TABLE attachments DISABLE TRIGGER assets_immutable"); err != nil {
		t.Fatal(err)
	}
	if _, err := w.Pool.Exec(ctx, "UPDATE attachments SET uploaded_at=now()-interval '24 hours',expires_at=now() WHERE id=$1", id.UUID); err != nil {
		t.Fatal(err)
	}
	if _, err := w.Pool.Exec(ctx, "ALTER TABLE attachments ENABLE TRIGGER assets_immutable"); err != nil {
		t.Fatal(err)
	}
	_, err = command.Execute(ctx, s.runner, command.MutationRequest{
		Actor:           w.Author,
		Operation:       command.CreateComment,
		RetryReference:  uuid.NewString(),
		ResolveProjects: issueScopes(w.Issue, true),
	}, "publication-test", func(context.Context, *command.Mutation) error { return nil }, func(ctx context.Context, m *command.Mutation, _ string) (bool, error) {
		_, err := s.Commit(ctx, m, w.Issue, prepared)
		return true, err
	}, func(bool) error { return nil })
	if err == nil {
		t.Fatal("expired prepared reference committed")
	}
	var state string
	_ = w.Pool.QueryRow(ctx, "SELECT state FROM pictures WHERE id=$1", id.UUID).Scan(&state)
	if state != "draft" {
		t.Fatal("partial reference published")
	}
	in.RetryReference = uuid.NewString()
	out, err = s.Upload(ctx, w.Author, in)
	if err != nil {
		t.Fatal(err)
	}
	id = out.Body.Result.ID
	prepared, err = s.Prepare(ctx, w.Author, w.Issue, []command.PictureID{id})
	if err != nil {
		t.Fatal(err)
	}
	_, err = command.Execute(ctx, s.runner, command.MutationRequest{
		Actor:           w.Author,
		Operation:       command.CreateComment,
		RetryReference:  uuid.NewString(),
		ResolveProjects: issueScopes(w.Issue, true),
	}, "publication-test", func(context.Context, *command.Mutation) error { return nil }, func(ctx context.Context, m *command.Mutation, _ string) (bool, error) {
		_, err := s.Commit(ctx, m, w.Issue, prepared)
		return true, err
	}, func(bool) error { return nil })
	if err != nil {
		t.Fatal(err)
	}
	download, err := s.Content(ctx, w.Viewer, id)
	if err != nil || !bytes.Equal(download.Data, in.Data) {
		t.Fatal("published read", err)
	}
	if _, err := w.Pool.Exec(ctx, "UPDATE company_settings SET cleanup_paused=true"); err != nil {
		t.Fatal(err)
	}
	result, err := s.Maintain(ctx)
	if err != nil || !result.Paused {
		t.Fatal("restore pause ignored", err)
	}
	if _, err := w.Pool.Exec(ctx, "UPDATE company_settings SET cleanup_paused=false"); err != nil {
		t.Fatal(err)
	}
	result, err = s.Maintain(ctx)
	if err != nil || result.ExpiredDrafts != 1 {
		t.Fatal("exact expiry not maintained", err)
	}
	if _, err := s.Content(ctx, w.Viewer, id); err != nil {
		t.Fatal("cleanup removed published bytes", err)
	}
}

type failAfterWrite struct {
	objectstore.Store
	fail bool
}

func (s *failAfterWrite) CreateStaging(ctx context.Context, key objectstore.Key, r io.Reader, size int64, mime string) (objectstore.Info, error) {
	info, err := s.Store.CreateStaging(ctx, key, r, size, mime)
	if err == nil && s.fail {
		s.fail = false
		return info, errors.New("lost acknowledgement")
	}
	return info, err
}
func TestConfirmedStagingSurvivesFailedAcknowledgementAndGenerationMismatch(t *testing.T) {
	w := testenv.Work(t)
	ctx := context.Background()
	signer, _ := command.NewCursorSigner([]byte(strings.Repeat("p", 32)))
	store, _ := objectstore.NewLocal(t.TempDir())
	failed := &failAfterWrite{Store: store, fail: true}
	s := New(command.Runner{Pool: w.Pool}, signer, failed)
	in := UploadInput{
		IssueID: w.Issue,
		Metadata: UploadMetadata{
			Filename:    "work.png",
			Description: "Picture",
			MIMEType:    "image/png",
			Publication: Gallery,
		},
		Data:           testenv.PNG(t),
		RetryReference: uuid.NewString(),
	}
	if _, err := s.Upload(ctx, w.Author, in); err == nil {
		t.Fatal("lost acknowledgement accepted")
	}
	var count int
	_ = w.Pool.QueryRow(ctx, "SELECT count(*) FROM pictures").Scan(&count)
	if count != 0 {
		t.Fatal("partial object exposed")
	}
	out, err := s.Upload(ctx, w.Author, in)
	if err != nil || out.Body.Result.State != Published {
		t.Fatal("known stage did not recover", err)
	}
	var key string
	var gen int64
	_ = w.Pool.QueryRow(ctx, "SELECT staging_key,staging_generation FROM pictures WHERE id=$1", out.Body.Result.ID.UUID).Scan(&key, &gen)
	if err := store.DeleteFailedStaging(ctx, objectstore.Key(key), gen+1); !errors.Is(err, objectstore.ErrGeneration) {
		t.Fatal("generation precondition ignored", err)
	}
	if _, err := s.Content(ctx, w.Viewer, out.Body.Result.ID); err != nil {
		t.Fatal("uncertain cleanup deleted object", err)
	}
}

func TestSupportedJPEGWebPAndInvalidContainers(t *testing.T) {
	var jpegData bytes.Buffer
	if err := jpeg.Encode(&jpegData, image.NewRGBA(image.Rect(0, 0, 2, 2)), nil); err != nil {
		t.Fatal(err)
	}
	webp, err := base64.StdEncoding.DecodeString("UklGRjoAAABXRUJQVlA4IC4AAADQAQCdASoCAAIAAUAmJaACdLoB+AADsAD+62Rf/WV/Mr+ZX++R/8Qz0epjAAAA")
	if err != nil {
		t.Fatal(err)
	}
	for _, sample := range []struct {
		data []byte
		mime string
	}{{jpegData.Bytes(), "image/jpeg"}, {webp, "image/webp"}} {
		if err := validateImage(sample.data, sample.mime); err != nil {
			t.Fatal("supported format", err)
		}
		if err := validateImage(sample.data[:len(sample.data)-2], sample.mime); err == nil {
			t.Fatal("truncated container accepted")
		}
	}
	corrupt := append([]byte{}, webp...)
	corrupt[4]++
	if err := validateImage(corrupt, "image/webp"); err == nil {
		t.Fatal("RIFF length mismatch")
	}
	corrupt = append([]byte{}, testenv.PNG(t)...)
	corrupt[len(corrupt)-1] ^= 1
	if err := validateImage(corrupt, "image/png"); err == nil {
		t.Fatal("PNG CRC mismatch")
	}
}
func TestFailedMetadataCommitRecoversReadyReservationWithoutDuplicateEvent(t *testing.T) {
	w := testenv.Work(t)
	ctx := context.Background()
	signer, _ := command.NewCursorSigner([]byte(strings.Repeat("p", 32)))
	store, _ := objectstore.NewLocal(t.TempDir())
	s := New(command.Runner{Pool: w.Pool}, signer, store)
	if _, err := w.Pool.Exec(ctx, "CREATE FUNCTION test_reject_picture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected commit failure'; END; $$; CREATE TRIGGER test_reject_picture BEFORE INSERT ON attachments FOR EACH ROW EXECUTE FUNCTION test_reject_picture()"); err != nil {
		t.Fatal(err)
	}
	in := UploadInput{
		IssueID: w.Issue,
		Metadata: UploadMetadata{
			Filename:    "work.png",
			Description: "Picture",
			MIMEType:    "image/png",
			Publication: Gallery,
		},
		Data:           testenv.PNG(t),
		RetryReference: uuid.NewString(),
	}
	if _, err := s.Upload(ctx, w.Author, in); err == nil {
		t.Fatal("failed commit was acknowledged")
	}
	var count int
	_ = w.Pool.QueryRow(ctx, "SELECT count(*) FROM pictures").Scan(&count)
	if count != 0 {
		t.Fatal("failed commit exposed record")
	}
	if _, err := w.Pool.Exec(ctx, "DROP TRIGGER test_reject_picture ON attachments; DROP FUNCTION test_reject_picture()"); err != nil {
		t.Fatal(err)
	}
	out, err := s.Upload(ctx, w.Author, in)
	if err != nil {
		t.Fatal("ready recovery", err)
	}
	replayed, err := s.Upload(ctx, w.Author, in)
	if err != nil || !replayed.Body.Receipt.Replayed || out.Body.Result.ID != replayed.Body.Result.ID {
		t.Fatal("duplicate ready recovery", err)
	}
	_ = w.Pool.QueryRow(ctx, "SELECT count(*) FROM activity_events").Scan(&count)
	if count != 1 {
		t.Fatal("extra event after retry")
	}
}
