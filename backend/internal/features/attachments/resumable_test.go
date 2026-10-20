package attachments

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/objectstore"
	"gategoldjira/backend/tests/testenv"
	"github.com/google/uuid"
	"testing"
)

func TestResumablePrivateDocumentRestartsRetriesAndPublishesOnce(t *testing.T) {
	w := testenv.Work(t)
	ctx := context.Background()
	s := attachmentService(t, w)
	s.WithMaximumBytes(MaximumAssetBytes)
	data := bytes.Repeat([]byte{0x41}, int(objectstore.ChunkSize+3))
	hash := sha256.Sum256(data)
	start := StartUploadInput{
		IssueID: w.Issue,
		StartUploadFields: StartUploadFields{
			Metadata: AssetMetadata{
				Kind:        FileAsset,
				Filename:    "مرفق.bin",
				MIMEType:    "application/octet-stream",
				Publication: DraftPublication,
			},
			ExpectedBytes: ByteCount(len(data)),
			Checksum:      hex.EncodeToString(hash[:]),
		},
		RetryReference: uuid.NewString(),
	}
	started, err := s.StartUpload(ctx, w.Author, start)
	if err != nil {
		t.Fatal(err)
	}
	id := started.Body.Result.SessionID
	replay, err := s.StartUpload(ctx, w.Author, start)
	if err != nil || !replay.Body.Receipt.Replayed || replay.Body.Result.AssetID != started.Body.Result.AssetID {
		t.Fatal("start replay", err)
	}
	if _, err = s.GetUpload(ctx, w.Other, GetUploadInput{SessionID: id}); err == nil {
		t.Fatal("other user's session disclosed")
	}
	if _, err = s.FinalizeUpload(ctx, w.Author, FinalizeUploadInput{
		SessionID:      id,
		RetryReference: uuid.NewString(),
	}); err == nil {
		t.Fatal("partial finalized")
	}
	chunk := AppendUploadInput{
		SessionID:          id,
		AppendUploadFields: AppendUploadFields{DataBase64: base64.StdEncoding.EncodeToString(data[:objectstore.ChunkSize])},
		RetryReference:     uuid.NewString(),
	}
	appended, err := s.AppendUpload(ctx, w.Author, chunk)
	if err != nil || appended.Body.Result.ReceivedBytes != ByteCount(objectstore.ChunkSize) {
		t.Fatal("chunk", err)
	}
	actor := w.Author
	actor.Channel = command.MCP
	again, err := s.AppendUpload(ctx, actor, chunk)
	if err != nil || !again.Body.Receipt.Replayed {
		t.Fatal("chunk replay", err)
	}
	restarted := New(s.runner, s.cursors, s.store).WithMaximumBytes(MaximumAssetBytes)
	chunk.Offset = ByteCount(objectstore.ChunkSize)
	chunk.DataBase64 = base64.StdEncoding.EncodeToString(data[objectstore.ChunkSize:])
	chunk.RetryReference = uuid.NewString()
	if _, err = restarted.AppendUpload(ctx, w.Author, chunk); err != nil {
		t.Fatal("restart append", err)
	}
	final := FinalizeUploadInput{SessionID: id, RetryReference: uuid.NewString()}
	saved, err := restarted.FinalizeUpload(ctx, w.Author, final)
	if err != nil {
		t.Fatal("finalize", err)
	}
	if saved.Body.Result.State != PrivateDraft || saved.Body.Result.IssueRevision != 1 {
		t.Fatal("draft published", saved.Body.Result)
	}
	finalReplay, err := restarted.FinalizeUpload(ctx, actor, final)
	if err != nil || !finalReplay.Body.Receipt.Replayed || finalReplay.Body.Result.ID != saved.Body.Result.ID {
		t.Fatal("final replay", err)
	}
	if _, err = restarted.GetAsset(ctx, w.Viewer, AssetGetInput{AssetID: saved.Body.Result.ID}); err == nil {
		t.Fatal("private document disclosed")
	}
	downloaded, err := restarted.DownloadAssetChunk(ctx, w.Author, AssetDownloadInput{
		AssetID: saved.Body.Result.ID,
		Offset:  ByteCount(objectstore.ChunkSize),
		Count:   3,
	})
	if err != nil || downloaded.DataBase64 != base64.StdEncoding.EncodeToString(data[objectstore.ChunkSize:]) || !downloaded.Terminal {
		t.Fatal("range", err)
	}
}
func TestResumableCancelAndDeclaredChecksum(t *testing.T) {
	w := testenv.Work(t)
	ctx := context.Background()
	s := attachmentService(t, w)
	data := []byte("private draft")
	hash := sha256.Sum256(data)
	start := StartUploadInput{
		IssueID: w.Issue,
		StartUploadFields: StartUploadFields{
			Metadata: AssetMetadata{
				Kind:        FileAsset,
				Filename:    "draft.txt",
				MIMEType:    "text/plain",
				Publication: DraftPublication,
			},
			ExpectedBytes: ByteCount(len(data)),
			Checksum:      hex.EncodeToString(hash[:]),
		},
		RetryReference: uuid.NewString(),
	}
	begun, err := s.StartUpload(ctx, w.Author, start)
	if err != nil {
		t.Fatal(err)
	}
	id := begun.Body.Result.SessionID
	canceled, err := s.CancelUpload(ctx, w.Author, CancelUploadInput{SessionID: id, RetryReference: uuid.NewString()})
	if err != nil || canceled.Body.Result.State != UploadCanceled {
		t.Fatal("cancel", err)
	}
	if _, err = s.AppendUpload(ctx, w.Author, AppendUploadInput{
		SessionID:          id,
		AppendUploadFields: AppendUploadFields{DataBase64: base64.StdEncoding.EncodeToString(data)},
		RetryReference:     uuid.NewString(),
	}); err == nil {
		t.Fatal("canceled session appended")
	}
	start.RetryReference = uuid.NewString()
	start.Checksum = hex.EncodeToString(make([]byte, 32))
	begun, err = s.StartUpload(ctx, w.Author, start)
	if err != nil {
		t.Fatal(err)
	}
	id = begun.Body.Result.SessionID
	if _, err = s.AppendUpload(ctx, w.Author, AppendUploadInput{
		SessionID:          id,
		AppendUploadFields: AppendUploadFields{DataBase64: base64.StdEncoding.EncodeToString(data)},
		RetryReference:     uuid.NewString(),
	}); err != nil {
		t.Fatal(err)
	}
	if _, err = s.FinalizeUpload(ctx, w.Author, FinalizeUploadInput{
		SessionID:      id,
		RetryReference: uuid.NewString(),
	}); err == nil {
		t.Fatal("wrong checksum published")
	}
	var count int
	if err = w.Pool.QueryRow(ctx, "SELECT count(*) FROM attachments").Scan(&count); err != nil || count != 0 {
		t.Fatal("invalid asset committed", count, err)
	}
}

func TestConfiguredMaximumFileUsesBoundedChunksAndVerifiedRange(t *testing.T) {
	w := testenv.Work(t)
	ctx := context.Background()
	s := attachmentService(t, w).WithMaximumBytes(MaximumAssetBytes)
	data := bytes.Repeat([]byte{0x5a}, int(MaximumAssetBytes))
	hash := sha256.Sum256(data)
	start := StartUploadInput{
		IssueID: w.Issue,
		StartUploadFields: StartUploadFields{
			Metadata: AssetMetadata{
				Kind:        FileAsset,
				Filename:    "maximum.bin",
				MIMEType:    "application/octet-stream",
				Publication: DraftPublication,
			},
			ExpectedBytes: ByteCount(len(data)),
			Checksum:      hex.EncodeToString(hash[:]),
		},
		RetryReference: uuid.NewString(),
	}
	started, err := s.StartUpload(ctx, w.Author, start)
	if err != nil {
		t.Fatal(err)
	}
	for offset := int64(0); offset < int64(len(data)); offset += objectstore.ChunkSize {
		chunk := AppendUploadInput{
			SessionID: started.Body.Result.SessionID,
			AppendUploadFields: AppendUploadFields{
				Offset:     ByteCount(offset),
				DataBase64: base64.StdEncoding.EncodeToString(data[offset : offset+objectstore.ChunkSize]),
			},
			RetryReference: uuid.NewString(),
		}
		if _, err = s.AppendUpload(ctx, w.Author, chunk); err != nil {
			t.Fatal("bounded maximum chunk", offset, err)
		}
	}
	finalized, err := s.FinalizeUpload(ctx, w.Author, FinalizeUploadInput{
		SessionID:      started.Body.Result.SessionID,
		RetryReference: uuid.NewString(),
	})
	if err != nil || finalized.Body.Result.ByteSize != ByteCount(MaximumAssetBytes) {
		t.Fatal("maximum finalization", err)
	}
	downloaded, err := s.DownloadAssetChunk(ctx, w.Author, AssetDownloadInput{
		AssetID: finalized.Body.Result.ID,
		Offset:  ByteCount(MaximumAssetBytes - 1),
		Count:   1,
	})
	if err != nil || downloaded.DataBase64 != "Wg==" || !downloaded.Terminal {
		t.Fatal("maximum tail range", err)
	}
	start.ExpectedBytes = ByteCount(MaximumAssetBytes + 1)
	start.RetryReference = uuid.NewString()
	if _, err = s.StartUpload(ctx, w.Author, start); err == nil {
		t.Fatal("over-limit reservation accepted")
	}
}

func TestResumableReadySessionRecoversFailedMetadataCommit(t *testing.T) {
	w := testenv.Work(t)
	ctx := context.Background()
	s := attachmentService(t, w)
	data := []byte("metadata recovery")
	hash := sha256.Sum256(data)
	start := StartUploadInput{
		IssueID: w.Issue,
		StartUploadFields: StartUploadFields{
			Metadata: AssetMetadata{
				Kind:        FileAsset,
				Filename:    "recover.txt",
				MIMEType:    "text/plain",
				Publication: IssuePublication,
			},
			ExpectedBytes: ByteCount(len(data)),
			Checksum:      hex.EncodeToString(hash[:]),
		},
		RetryReference: uuid.NewString(),
	}
	begun, err := s.StartUpload(ctx, w.Author, start)
	if err != nil {
		t.Fatal(err)
	}
	id := begun.Body.Result.SessionID
	if _, err = s.AppendUpload(ctx, w.Author, AppendUploadInput{
		SessionID:          id,
		AppendUploadFields: AppendUploadFields{DataBase64: base64.StdEncoding.EncodeToString(data)},
		RetryReference:     uuid.NewString(),
	}); err != nil {
		t.Fatal(err)
	}
	if _, err = w.Pool.Exec(ctx, "CREATE FUNCTION reject_asset_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture metadata interruption'; END $$; CREATE TRIGGER reject_asset_fixture BEFORE INSERT ON attachments FOR EACH ROW EXECUTE FUNCTION reject_asset_fixture()"); err != nil {
		t.Fatal(err)
	}
	final := FinalizeUploadInput{SessionID: id, RetryReference: uuid.NewString()}
	if _, err = s.FinalizeUpload(ctx, w.Author, final); err == nil {
		t.Fatal("fixture interruption missing")
	}
	if _, err = w.Pool.Exec(ctx, "DROP TRIGGER reject_asset_fixture ON attachments; DROP FUNCTION reject_asset_fixture()"); err != nil {
		t.Fatal(err)
	}
	saved, err := s.FinalizeUpload(ctx, w.Author, final)
	if err != nil || saved.Body.Result.State != PublishedAsset || saved.Body.Result.IssueRevision != 2 {
		t.Fatal("ready recovery", err)
	}
	replay, err := s.FinalizeUpload(ctx, w.Author, final)
	if err != nil || !replay.Body.Receipt.Replayed {
		t.Fatal("recovery replay", err)
	}
}

func TestResumableInvalidOffsetsAndStatesAreValidationNotStorageFailures(t *testing.T) {
	w := testenv.Work(t)
	ctx := context.Background()
	s := attachmentService(t, w)
	data := bytes.Repeat([]byte("a"), 256*1024+3)
	hash := sha256.Sum256(data)
	begun, err := s.StartUpload(ctx, w.Author, StartUploadInput{IssueID: w.Issue, StartUploadFields: StartUploadFields{
		Metadata:      AssetMetadata{Kind: FileAsset, Filename: "bounds.bin", MIMEType: "application/octet-stream", Publication: DraftPublication},
		ExpectedBytes: ByteCount(len(data)), Checksum: hex.EncodeToString(hash[:]),
	}, RetryReference: uuid.NewString()})
	if err != nil {
		t.Fatal(err)
	}
	id := begun.Body.Result.SessionID
	_, err = s.FinalizeUpload(ctx, w.Author, FinalizeUploadInput{SessionID: id, RetryReference: uuid.NewString()})
	requireFailure(t, err, command.Validation)
	for _, chunk := range []AppendUploadFields{
		{Offset: 1, DataBase64: base64.StdEncoding.EncodeToString(data[:256*1024])},
		{DataBase64: base64.StdEncoding.EncodeToString(data[:2])},
		{DataBase64: base64.StdEncoding.EncodeToString(append(append([]byte{}, data...), 1))},
	} {
		_, err = s.AppendUpload(ctx, w.Author, AppendUploadInput{SessionID: id, AppendUploadFields: chunk, RetryReference: uuid.NewString()})
		requireFailure(t, err, command.Validation)
		current, readErr := s.GetUpload(ctx, w.Author, GetUploadInput{SessionID: id})
		if readErr != nil || current.ReceivedBytes != 0 || current.State != Uploading {
			t.Fatalf("invalid request changed session: %+v %v", current, readErr)
		}
	}
	chunk := AppendUploadInput{SessionID: id, AppendUploadFields: AppendUploadFields{DataBase64: base64.StdEncoding.EncodeToString(data)}, RetryReference: uuid.NewString()}
	if _, err = s.AppendUpload(ctx, w.Author, chunk); err != nil {
		t.Fatal(err)
	}
	final := FinalizeUploadInput{SessionID: id, RetryReference: uuid.NewString()}
	if _, err = s.FinalizeUpload(ctx, w.Author, final); err != nil {
		t.Fatal(err)
	}
	replay, err := s.AppendUpload(ctx, w.Author, chunk)
	if err != nil || !replay.Body.Receipt.Replayed {
		t.Fatal("accepted chunk must replay after completion", err)
	}
	_, err = s.AppendUpload(ctx, w.Author, AppendUploadInput{SessionID: id, AppendUploadFields: chunk.AppendUploadFields, RetryReference: uuid.NewString()})
	requireFailure(t, err, command.Validation)
	_, err = s.CancelUpload(ctx, w.Author, CancelUploadInput{SessionID: id, RetryReference: uuid.NewString()})
	requireFailure(t, err, command.Validation)
	replayFinal, err := s.FinalizeUpload(ctx, w.Author, final)
	if err != nil || !replayFinal.Body.Receipt.Replayed {
		t.Fatal("accepted finalize must replay", err)
	}
	var revision int64
	if err = w.Pool.QueryRow(ctx, "SELECT revision FROM issues WHERE id=$1", w.Issue.UUID).Scan(&revision); err != nil || revision != 1 {
		t.Fatal("draft/invalid calls changed issue", revision, err)
	}
}
