package comments

import (
	"context"
	"errors"
	"strings"
	"testing"

	"gategoldjira/backend/internal/features/pictures"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/objectstore"
	"gategoldjira/backend/tests/testenv"
	"github.com/google/uuid"
)

func textBody(value string) Body {
	return Body{HTML: value, MentionUserIDs: []command.UserID{}, PictureIDs: []command.PictureID{}}
}
func TestCanonicalArabicHTMLSafeFormattingAndReferenceSets(t *testing.T) {
	user, picture := command.NewID[command.UserKind](), command.NewID[command.PictureKind]()
	body := Body{
		HTML:           `<h2 dir="rtl">مرحبا Jira-12</h2><p onclick="evil()" style="color:red">نص <b>غامق</b><i>مائل</i><u>تحته</u><br><a href="https://example.test/work">رابط</a><a href="javascript:evil()">غير آمن</a><script>private evil()</script><span data-user-id="` + user.String() + `">forged label</span><img data-picture-id="` + picture.String() + `" src="https://remote.test/private" alt="forged"></p>`,
		MentionUserIDs: []command.UserID{user},
		PictureIDs:     []command.PictureID{picture},
	}
	clean, err := Canonicalize(body, map[command.UserID]string{user: "مطور <آخر>"}, map[command.PictureID]string{picture: "صورة شرح"})
	if err != nil {
		t.Fatal(err)
	}
	for _, unsafe := range []string{
		"onclick",
		"style=",
		"javascript:",
		"<script",
		"private evil",
		"remote.test",
		"src=",
		"forged",
	} {
		if strings.Contains(clean.SafeHTML, unsafe) {
			t.Fatal("unsafe HTML escaped", unsafe)
		}
	}
	for _, safe := range []string{
		`dir="rtl"`,
		"<strong>",
		"<em>",
		"<u>",
		user.String(),
		picture.String(),
		"مطور &lt;آخر&gt;",
	} {
		if !strings.Contains(clean.SafeHTML, safe) {
			t.Fatal("supported content lost", safe)
		}
	}
	if !strings.Contains(clean.PlainText, "مرحبا Jira-12") || !strings.Contains(clean.PlainText, "صورة شرح") || len(clean.SanitationNotices) == 0 {
		t.Fatal("missing equivalent or notices")
	}
	second, err := Canonicalize(Body{
		HTML:           clean.SafeHTML,
		MentionUserIDs: body.MentionUserIDs,
		PictureIDs:     body.PictureIDs,
	}, map[command.UserID]string{user: "مطور <آخر>"}, map[command.PictureID]string{picture: "صورة شرح"})
	if err != nil || second.SafeHTML != clean.SafeHTML || second.PlainText != clean.PlainText {
		t.Fatal("canonical form unstable", err)
	}
	for _, html := range []string{
		"<p> </p>",
		"<script>only script</script>",
		"<img src='data:image/png;base64,AAAA'>",
		strings.Repeat("ع", 5001),
		strings.Repeat("a", 65537),
	} {
		if _, err := Canonicalize(textBody(html), nil, nil); err == nil {
			t.Fatal("invalid empty/size body accepted")
		}
	}
	missing := body
	missing.PictureIDs = []command.PictureID{}
	if _, err := Canonicalize(missing, map[command.UserID]string{user: "اسم"}, map[command.PictureID]string{picture: "صورة"}); err == nil {
		t.Fatal("hidden reference accepted")
	}
	only := Body{
		HTML:           `<p><img data-picture-id="` + picture.String() + `"></p>`,
		MentionUserIDs: []command.UserID{},
		PictureIDs:     []command.PictureID{picture},
	}
	if _, err := Canonicalize(only, nil, map[command.PictureID]string{picture: "صورة فقط"}); err != nil {
		t.Fatal("picture-only body rejected", err)
	}
}
func TestCommentAuthorVersionsReplayAndHistoricalMentions(t *testing.T) {
	w := testenv.Work(t)
	ctx := context.Background()
	signer, _ := command.NewCursorSigner([]byte(strings.Repeat("c", 32)))
	store, err := objectstore.NewLocal(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	photoService := pictures.New(command.Runner{Pool: w.Pool}, signer, store)
	service := New(command.Runner{Pool: w.Pool}, signer, photoService)
	body := Body{
		HTML:           `<p dir="rtl">مرحبا <span data-user-id="` + w.Other.UserID.String() + `">fake</span></p>`,
		MentionUserIDs: []command.UserID{w.Other.UserID},
		PictureIDs:     []command.PictureID{},
	}
	input := CreateInput{IssueID: w.Issue, Body: body, RetryReference: uuid.NewString()}
	created, err := service.Create(ctx, w.Author, input)
	if err != nil {
		t.Fatal(err)
	}
	view := created.Body.Result
	if view.Author.ID != w.Author.UserID || view.Revision != 1 || !view.CanEdit || view.EditedAt != nil {
		t.Fatal("immutable authorship/defaults")
	}
	actor := w.Author
	actor.Channel = command.MCP
	replay, err := service.Create(ctx, actor, input)
	if err != nil || !replay.Body.Receipt.Replayed || *replay.Body.Receipt.EventID != *created.Body.Receipt.EventID {
		t.Fatal("comment retry changed event", err)
	}
	edit := UpdateInput{
		CommentID:        view.ID,
		ExpectedRevision: 1,
		Body:             textBody("<p>Second عربي</p>"),
		RetryReference:   uuid.NewString(),
	}
	for _, actor := range []command.Actor{w.Admin, w.Other, w.Viewer} {
		if _, err := service.Update(ctx, actor, edit); err == nil {
			t.Fatal("other user edited author content")
		}
	}
	if _, err := w.Pool.Exec(ctx, "UPDATE users SET disabled_at=now() WHERE id=$1", w.Other.UserID.UUID); err != nil {
		t.Fatal(err)
	}
	body.HTML = `<p dir="rtl">Updated <span data-user-id="` + w.Other.UserID.String() + `">forged</span></p>`
	edit.Body = body
	updated, err := service.Update(ctx, w.Author, edit)
	if err != nil || updated.Body.Result.Revision != 2 || updated.Body.Result.Mentions[0].DisplayLabel != "مطور آخر" {
		t.Fatal("historical mention removed or notified anew", err)
	}
	_, err = service.Update(ctx, w.Author, UpdateInput{
		CommentID:        view.ID,
		ExpectedRevision: 1,
		Body:             textBody("stale"),
		RetryReference:   uuid.NewString(),
	})
	var failure *command.Failure
	if !errors.As(err, &failure) || failure.Code != command.Conflict {
		t.Fatal("stale version accepted")
	}
	versions, err := service.Versions(ctx, w.Viewer, ListVersionsInput{CommentID: view.ID})
	if err != nil || len(versions.Items) != 2 || !strings.Contains(versions.Items[0].PlainText, "مرحبا") {
		t.Fatal("old version lost", err)
	}
	read, err := service.List(ctx, w.Viewer, ListInput{IssueID: w.Issue})
	if err != nil || len(read.Items) != 1 || read.Items[0].CanEdit {
		t.Fatal("Viewer projection", err)
	}
	if _, err := w.Pool.Exec(ctx, "UPDATE project_memberships SET removed_at=now() WHERE project_id=$1 AND user_id=$2", w.Project.UUID, w.Author.UserID.UUID); err != nil {
		t.Fatal(err)
	}
	if _, err := service.Create(ctx, w.Author, input); err == nil {
		t.Fatal("revoked replay exposed content")
	}
}

func TestOldCommentVersionRetainsPictureAfterCurrentBodyRemovesIt(t *testing.T) {
	w := testenv.Work(t)
	ctx := context.Background()
	signer, _ := command.NewCursorSigner([]byte(strings.Repeat("c", 32)))
	store, _ := objectstore.NewLocal(t.TempDir())
	photos := pictures.New(command.Runner{Pool: w.Pool}, signer, store)
	s := New(command.Runner{Pool: w.Pool}, signer, photos)
	photo, err := photos.Upload(ctx, w.Author, pictures.UploadInput{
		IssueID: w.Issue,
		Metadata: pictures.UploadMetadata{
			Filename:    "work.png",
			Description: "توضيح قديم",
			MIMEType:    "image/png",
			Publication: pictures.CommentDraft,
		},
		Data:           testenv.PNG(t),
		RetryReference: uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	body := Body{
		HTML:           `<p dir="auto"><img data-picture-id="` + photo.Body.Result.ID.String() + `"></p>`,
		MentionUserIDs: []command.UserID{},
		PictureIDs:     []command.PictureID{photo.Body.Result.ID},
	}
	created, err := s.Create(ctx, w.Author, CreateInput{IssueID: w.Issue, Body: body, RetryReference: uuid.NewString()})
	if err != nil {
		t.Fatal(err)
	}
	_, err = s.Update(ctx, w.Author, UpdateInput{
		CommentID:        created.Body.Result.ID,
		ExpectedRevision: 1,
		Body:             textBody("<p>New text</p>"),
		RetryReference:   uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	versions, err := s.Versions(ctx, w.Viewer, ListVersionsInput{CommentID: created.Body.Result.ID})
	if err != nil || len(versions.Items) != 2 || len(versions.Items[0].PictureIDs) != 1 || len(versions.Items[1].PictureIDs) != 0 {
		t.Fatal("retained picture references", err)
	}
	if _, err := photos.Content(ctx, w.Viewer, photo.Body.Result.ID); err != nil {
		t.Fatal("retained image unreadable", err)
	}
}
