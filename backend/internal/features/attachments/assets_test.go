package attachments

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/objectstore"
	"gategoldjira/backend/tests/testenv"
	"github.com/google/uuid"
	"io"
	"regexp"
	"testing"
	"time"
)

func nativeAssetFixture(t *testing.T, state AssetState, inPanel bool) (testenv.Workspace, *Service, command.AssetID, []byte) {
	t.Helper()
	w := testenv.Work(t)
	s := attachmentService(t, w)
	ctx := context.Background()
	id := command.NewID[command.AssetKind]()
	data := []byte("ملف خاص محفوظ")
	stageKey := objectstore.Key("assets/" + id.String() + "/staging")
	publishedKey := objectstore.Key("assets/" + id.String() + "/published")
	info, err := s.store.CreateStaging(ctx, stageKey, bytes.NewReader(data), int64(len(data)), "text/plain")
	if err != nil {
		t.Fatal(err)
	}
	var key *string
	var generation *int64
	if state == PublishedAsset {
		published, err := s.store.Publish(ctx, stageKey, info, publishedKey)
		if err != nil {
			t.Fatal(err)
		}
		value := string(publishedKey)
		key = &value
		generation = &published.Generation
	}
	if _, err = w.Pool.Exec(ctx, `INSERT INTO attachments(id,project_id,issue_id,uploaded_by,kind,filename,mime_type,byte_size,checksum,staging_key,staging_generation,published_key,published_generation,state,in_panel,expires_at)
 VALUES($1,$2,$3,$4,'file','خاص.txt','text/plain',$5,$6,$7,$8,$9,$10,$11,$12,now()+interval '24 hours')`, id.UUID, w.Project.UUID, w.Issue.UUID, w.Author.UserID.UUID, len(data), info.SHA256, string(stageKey), info.Generation, key, generation, string(state), inPanel); err != nil {
		t.Fatal(err)
	}
	return w, s, id, data
}
func TestNativeDraftDocumentsStayPrivateAndExpiredDraftsDisappear(t *testing.T) {
	w, s, id, data := nativeAssetFixture(t, PrivateDraft, false)
	ctx := context.Background()
	if _, err := s.GetAsset(ctx, w.Viewer, AssetGetInput{AssetID: id}); err == nil {
		t.Fatal("viewer read another actor's document draft")
	}
	if _, err := s.DownloadAssetChunk(ctx, w.Viewer, AssetDownloadInput{AssetID: id, Count: 1024}); err == nil {
		t.Fatal("viewer downloaded a draft")
	}
	page, err := s.ListAssets(ctx, w.Author, AssetListInput{IssueID: w.Issue})
	if err != nil || len(page.Items) != 0 {
		t.Fatal("private draft appeared in issue panel", err)
	}
	own, err := s.ListAssets(ctx, w.Author, AssetListInput{IssueID: w.Issue, IncludeOwnDrafts: true})
	if err != nil || len(own.Items) != 1 || own.Items[0].State != PrivateDraft {
		t.Fatal("owner draft unavailable", err)
	}
	downloaded, err := s.DownloadAssetChunk(ctx, w.Author, AssetDownloadInput{AssetID: id, Count: 1024})
	if err != nil || !downloaded.Terminal || downloaded.DataBase64 != base64.StdEncoding.EncodeToString(data) {
		t.Fatal("owner draft bytes", err)
	}
	if _, err = w.Pool.Exec(ctx, "UPDATE attachments SET state='expired' WHERE id=$1", id.UUID); err != nil {
		t.Fatal(err)
	}
	if _, err = s.GetAsset(ctx, w.Author, AssetGetInput{AssetID: id}); err == nil {
		t.Fatal("expired draft readable")
	}
}
func TestNativeDetachRetainsPublishedBytesAndHasNoOpRevision(t *testing.T) {
	w, s, id, data := nativeAssetFixture(t, PublishedAsset, true)
	ctx := context.Background()
	view, err := s.GetAsset(ctx, w.Viewer, AssetGetInput{AssetID: id})
	if err != nil {
		t.Fatal(err)
	}
	request := AssetDetachInput{AssetID: id, ExpectedIssueRevision: view.IssueRevision, RetryReference: uuid.NewString()}
	saved, err := s.DetachAsset(ctx, w.Author, request)
	if err != nil || saved.Body.Result.InPanel || saved.Body.Result.IssueRevision != view.IssueRevision+1 {
		t.Fatal("detach", err)
	}
	replay, err := s.DetachAsset(ctx, w.Author, request)
	if err != nil || !replay.Body.Receipt.Replayed {
		t.Fatal("detach replay", err)
	}
	request.RetryReference = uuid.NewString()
	unchanged, err := s.DetachAsset(ctx, w.Author, request)
	if err != nil || unchanged.Body.Result.IssueRevision != saved.Body.Result.IssueRevision || unchanged.Body.Receipt.EventID != nil {
		t.Fatal("unchanged detach edited issue", err)
	}
	downloaded, err := s.DownloadAssetChunk(ctx, w.Viewer, AssetDownloadInput{AssetID: id, Count: 1024})
	if err != nil || downloaded.DataBase64 != base64.StdEncoding.EncodeToString(data) {
		t.Fatal("detach deleted retained bytes", err)
	}
}

type revokingAssetStore struct {
	objectstore.Store
	revoke func()
	opened bool
}

func (s *revokingAssetStore) Open(ctx context.Context, key objectstore.Key, info objectstore.Info, published bool) (io.ReadCloser, error) {
	reader, err := s.Store.Open(ctx, key, info, published)
	if err == nil && !s.opened {
		s.opened = true
		s.revoke()
	}
	return reader, err
}
func TestNativeAssetBytesRecheckAccountAfterObjectIO(t *testing.T) {
	w, s, id, _ := nativeAssetFixture(t, PublishedAsset, true)
	ctx := context.Background()
	s.store = &revokingAssetStore{Store: s.store, revoke: func() {
		if _, err := w.Pool.Exec(ctx, "UPDATE users SET disabled_at=now() WHERE id=$1", w.Viewer.UserID.UUID); err != nil {
			t.Fatal(err)
		}
	}}
	result, err := s.DownloadAssetChunk(ctx, w.Viewer, AssetDownloadInput{AssetID: id, Count: 1024})
	if err == nil || result.DataBase64 != "" {
		t.Fatal("revoked reader received buffered bytes")
	}
}
func TestAssetByteCountSchemaMatchesItsExactStringBoundary(t *testing.T) {
	pattern := regexp.MustCompile(byteCountPattern)
	for _, text := range []string{"0", "1", "10485759", "104857600", "100000000", "104857599"} {
		var value ByteCount
		if err := json.Unmarshal([]byte(`"`+text+`"`), &value); err != nil || !pattern.MatchString(text) {
			t.Fatal("valid exact byte count", text, err)
		}
	}
	for _, text := range []string{"104857601", "999999999", "01", "-1", "1e3", ""} {
		var value ByteCount
		if json.Unmarshal([]byte(`"`+text+`"`), &value) == nil || pattern.MatchString(text) {
			t.Fatal("invalid byte count accepted", text)
		}
	}
	var value ByteCount
	if json.Unmarshal([]byte("1024"), &value) == nil {
		t.Fatal("JSON number accepted")
	}
}

func TestUnifiedAssetUploadRetriesFilesAndPicturesWithoutPublishingDrafts(t *testing.T) {
	w := testenv.Work(t)
	s := attachmentService(t, w)
	ctx := context.Background()
	cases := []struct {
		metadata AssetMetadata
		data     []byte
	}{
		{
			AssetMetadata{
				Kind:        FileAsset,
				Filename:    "خاص.txt",
				MIMEType:    "text/plain",
				Publication: DraftPublication,
			},
			[]byte("Private file"),
		},
		{
			AssetMetadata{
				Kind:        ImageAsset,
				Filename:    "draft.png",
				Description: "صورة",
				MIMEType:    "image/png",
				Publication: DraftPublication,
			},
			testenv.PNG(t),
		},
	}
	for _, example := range cases {
		in := AssetUploadInput{
			IssueID:        w.Issue,
			Metadata:       example.metadata,
			Data:           example.data,
			RetryReference: uuid.NewString(),
		}
		saved, err := s.UploadAsset(ctx, w.Author, in)
		if err != nil || saved.Body.Result.State != PrivateDraft || saved.Body.Result.InPanel || saved.Body.Result.IssueRevision != 1 {
			t.Fatal("draft upload", err)
		}
		actor := w.Author
		actor.Channel = command.MCP
		replayed, err := s.UploadAsset(ctx, actor, in)
		if err != nil || !replayed.Body.Receipt.Replayed || replayed.Body.Result.ID != saved.Body.Result.ID {
			t.Fatal("shared replay", err)
		}
		if _, err = s.GetAsset(ctx, w.Viewer, AssetGetInput{AssetID: saved.Body.Result.ID}); err == nil {
			t.Fatal("another member saw an unpublished file")
		}
		in.Metadata.Publication = IssuePublication
		if _, err = s.UploadAsset(ctx, w.Author, in); err == nil {
			t.Fatal("same upload reference changed publication intent")
		}
	}
	page, err := s.ListAssets(ctx, w.Viewer, AssetListInput{IssueID: w.Issue})
	if err != nil || len(page.Items) != 0 {
		t.Fatal("drafts leaked into panel", err)
	}
}

func TestSharedDraftPublicationIsAtomicForImagesFilesAndIssueRevision(t *testing.T) {
	w := testenv.Work(t)
	s := attachmentService(t, w)
	ctx := context.Background()
	ids := []command.AssetID{}
	for _, example := range []struct {
		metadata AssetMetadata
		data     []byte
	}{
		{
			AssetMetadata{
				Kind:        FileAsset,
				Filename:    "spec.txt",
				MIMEType:    "text/plain",
				Publication: DraftPublication,
			},
			[]byte("Private draft"),
		},
		{
			AssetMetadata{
				Kind:        ImageAsset,
				Filename:    "picture.png",
				Description: "Picture",
				MIMEType:    "image/png",
				Publication: DraftPublication,
			},
			testenv.PNG(t),
		},
	} {
		saved, err := s.UploadAsset(ctx, w.Author, AssetUploadInput{
			IssueID:        w.Issue,
			Metadata:       example.metadata,
			Data:           example.data,
			RetryReference: uuid.NewString(),
		})
		if err != nil {
			t.Fatal(err)
		}
		ids = append(ids, saved.Body.Result.ID)
	}
	prepared, err := s.PrepareAssets(ctx, w.Author, w.Issue, ids)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.GetAsset(ctx, w.Viewer, AssetGetInput{AssetID: ids[0]}); err == nil {
		t.Fatal("preparation exposed copied bytes")
	}
	type input struct{ IDs []command.AssetID }
	_, err = command.Save(ctx, s.runner, command.MutationRequest{
		Actor:          w.Author,
		Operation:      command.CreateComment,
		RetryReference: uuid.NewString(),
		Access:         command.Access{Projects: []command.ProjectScope{{ProjectID: w.Project, Write: true}}},
	}, input{ids}, func(context.Context, *command.Mutation) error { return nil }, func(ctx context.Context, m *command.Mutation, _ input) (command.Change[bool], error) {
		changes, err := s.CommitAssets(ctx, m, w.Issue, prepared)
		if err != nil {
			return command.Change[bool]{}, err
		}
		if len(changes) != 2 {
			t.Fatal("shared publications missing", len(changes))
		}
		return command.Change[bool]{Result: true, HTTPStatus: 200}, nil
	}, func(bool) error { return nil })
	if err != nil {
		t.Fatal(err)
	}
	for _, id := range ids {
		view, err := s.GetAsset(ctx, w.Viewer, AssetGetInput{AssetID: id})
		if err != nil || view.State != PublishedAsset || !view.InPanel || view.IssueRevision != 2 {
			t.Fatal("shared publication changed content more than once", view, err)
		}
	}
}

func TestAssetCleanupIsGenerationCheckedIdempotentAndPaused(t *testing.T) {
	w := testenv.Work(t)
	s := attachmentService(t, w)
	ctx := context.Background()
	in := AssetUploadInput{
		IssueID: w.Issue,
		Metadata: AssetMetadata{
			Kind:        FileAsset,
			Filename:    "cleanup.txt",
			MIMEType:    "text/plain",
			Publication: DraftPublication,
		},
		Data:           []byte("Abandoned draft"),
		RetryReference: uuid.NewString(),
	}
	saved, err := s.UploadAsset(ctx, w.Author, in)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = w.Pool.Exec(ctx, "UPDATE attachments SET state='expired' WHERE id=$1", saved.Body.Result.ID.UUID); err != nil {
		t.Fatal(err)
	}
	if _, err = w.Pool.Exec(ctx, "UPDATE upload_reservations SET lease_until=now()-interval '1 second' WHERE actor_id=$1 AND retry_reference=$2", w.Author.UserID.UUID, in.RetryReference); err != nil {
		t.Fatal(err)
	}
	maintained, err := s.MaintainAssets(ctx)
	if err != nil || maintained.RemovedStaging != 1 {
		t.Fatal("bounded cleanup", maintained, err)
	}
	again, err := s.MaintainAssets(ctx)
	if err != nil || again.RemovedStaging != 0 {
		t.Fatal("cleanup repeated generation", again, err)
	}
	if _, err = w.Pool.Exec(ctx, "UPDATE company_settings SET cleanup_paused=true WHERE singleton"); err != nil {
		t.Fatal(err)
	}
	paused, err := s.MaintainAssets(ctx)
	if err != nil || !paused.Paused {
		t.Fatal("cleanup pause ignored", paused, err)
	}
}

type cleanupBarrierStore struct {
	objectstore.Store
	started chan struct{}
	release chan struct{}
}

func (s *cleanupBarrierStore) DeleteFailedStaging(ctx context.Context, key objectstore.Key, generation int64) error {
	close(s.started)
	select {
	case <-s.release:
	case <-ctx.Done():
		return ctx.Err()
	}
	return s.Store.DeleteFailedStaging(ctx, key, generation)
}
func TestAssetCleanupHasDurableExclusiveLeaseAndNoBusinessLocksDuringIO(t *testing.T) {
	w := testenv.Work(t)
	ctx := context.Background()
	s := attachmentService(t, w)
	saved, err := s.UploadAsset(ctx, w.Author, AssetUploadInput{
		IssueID: w.Issue,
		Metadata: AssetMetadata{
			Kind:        FileAsset,
			Filename:    "abandoned.txt",
			MIMEType:    "text/plain",
			Publication: DraftPublication,
		},
		Data:           []byte("Abandoned"),
		RetryReference: uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = w.Pool.Exec(ctx, "UPDATE attachments SET state='expired' WHERE id=$1", saved.Body.Result.ID.UUID); err != nil {
		t.Fatal(err)
	}
	if _, err = w.Pool.Exec(ctx, "UPDATE upload_reservations SET lease_until=now()-interval '1 second'"); err != nil {
		t.Fatal(err)
	}
	barrier := &cleanupBarrierStore{Store: s.store, started: make(chan struct{}), release: make(chan struct{})}
	s.store = barrier
	done := make(chan error, 1)
	go func() {
		out, err := s.MaintainAssets(ctx)
		if err == nil && out.RemovedStaging != 1 {
			err = errors.New("cleanup did not finish one generation")
		}
		done <- err
	}()
	select {
	case <-barrier.started:
	case <-time.After(3 * time.Second):
		t.Fatal("cleanup I/O did not start")
	}
	tx, err := w.Pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, "SET LOCAL lock_timeout='250ms'"); err != nil {
		t.Fatal(err)
	}
	if _, err = tx.Exec(ctx, "SELECT singleton FROM company_settings FOR UPDATE"); err != nil {
		t.Fatal("cleanup held company guard during I/O", err)
	}
	if _, err = tx.Exec(ctx, "SELECT id FROM projects WHERE id=$1 FOR UPDATE", w.Project.UUID); err != nil {
		t.Fatal("cleanup held project during I/O", err)
	}
	tx.Rollback(ctx)
	second, err := s.MaintainAssets(ctx)
	if err != nil || second.RemovedStaging != 0 {
		t.Fatal("duplicate cleanup lease", err)
	}
	close(barrier.release)
	if err = <-done; err != nil {
		t.Fatal(err)
	}
}
