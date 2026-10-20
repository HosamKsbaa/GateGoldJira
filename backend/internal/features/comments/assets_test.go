package comments

import (
	"context"
	"gategoldjira/backend/internal/features/attachments"
	"gategoldjira/backend/internal/features/pictures"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/objectstore"
	"gategoldjira/backend/tests/testenv"
	"github.com/google/uuid"
	"strings"
	"testing"
)

func TestCommentPublishesPrivateFilesAndRetainsOlderVersionReferences(t *testing.T) {
	w := testenv.Work(t)
	ctx := context.Background()
	signer, _ := command.NewCursorSigner([]byte(strings.Repeat("f", 32)))
	store, err := objectstore.NewLocal(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	photos := pictures.New(command.Runner{Pool: w.Pool}, signer, store)
	assets := photos.Assets()
	service := New(command.Runner{Pool: w.Pool}, signer, photos)
	saved, err := assets.UploadAsset(ctx, w.Author, attachments.AssetUploadInput{
		IssueID: w.Issue,
		Metadata: attachments.AssetMetadata{
			Kind:        attachments.FileAsset,
			Filename:    "متطلبات.txt",
			MIMEType:    "text/plain",
			Publication: attachments.DraftPublication,
		},
		Data:           []byte("Private requirements"),
		RetryReference: uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	id := saved.Body.Result.ID
	if _, err = assets.GetAsset(ctx, w.Viewer, attachments.AssetGetInput{AssetID: id}); err == nil {
		t.Fatal("draft was public before posting")
	}
	body := textBody(`<p>راجع <a data-attachment-id="` + id.String() + `" href="https://untrusted.example/">forged name</a></p>`)
	body.AttachmentIDs = []command.AssetID{id}
	created, err := service.Create(ctx, w.Author, CreateInput{
		IssueID:        w.Issue,
		Body:           body,
		RetryReference: uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(created.Body.Result.AttachmentIDs) != 1 || !strings.Contains(created.Body.Result.SafeHTML, "متطلبات.txt") || strings.Contains(created.Body.Result.SafeHTML, "untrusted.example") {
		t.Fatal("scoped file reference not canonical", created.Body.Result.SafeHTML)
	}
	visible, err := assets.GetAsset(ctx, w.Viewer, attachments.AssetGetInput{AssetID: id})
	if err != nil || visible.State != attachments.PublishedAsset || visible.IssueRevision != 2 {
		t.Fatal("comment publication", err)
	}
	updated, err := service.Update(ctx, w.Author, UpdateInput{
		CommentID:        created.Body.Result.ID,
		ExpectedRevision: created.Body.Result.Revision,
		Body:             textBody("<p>بدون ملف الآن</p>"),
		RetryReference:   uuid.NewString(),
	})
	if err != nil || len(updated.Body.Result.AttachmentIDs) != 0 {
		t.Fatal("comment edit", err)
	}
	history, err := service.Versions(ctx, w.Viewer, ListVersionsInput{CommentID: created.Body.Result.ID})
	if err != nil || len(history.Items) != 2 || len(history.Items[0].AttachmentIDs) != 1 {
		t.Fatal("older version lost file", err)
	}
	if _, err = assets.DetachAsset(ctx, w.Author, attachments.AssetDetachInput{
		AssetID:               id,
		ExpectedIssueRevision: visible.IssueRevision,
		RetryReference:        uuid.NewString(),
	}); err != nil {
		t.Fatal(err)
	}
	if _, err = assets.DownloadAssetChunk(ctx, w.Viewer, attachments.AssetDownloadInput{AssetID: id, Count: 1024}); err != nil {
		t.Fatal("historical file bytes unavailable after detach", err)
	}
}
