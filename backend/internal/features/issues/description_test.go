package issues

import (
	"context"
	"encoding/json"
	"gategoldjira/backend/internal/features/pictures"
	"gategoldjira/backend/internal/platform/auth"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/httpapi"
	"gategoldjira/backend/internal/platform/mcpapi"
	"gategoldjira/backend/internal/platform/objectstore"
	"gategoldjira/backend/tests/testenv"
	"github.com/google/uuid"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestDescriptionHTMLSafetyAndLegacyPlainText(t *testing.T) {
	source := `<h2 dir="rtl" onclick="alert(1)">خطة العمل</h2><p>مرحبا <b>الفريق</b> <i>مائل</i><a href="javascript:alert(1)">رابط</a><a href="https://example.test/help">Help</a><img src="https://remote.invalid/x"><script>alert(1)</script><svg><script>bad()</script></svg></p><ul><li>مهمة</li></ul>`
	clean, err := cleanDescription(source)
	if err != nil {
		t.Fatal(err)
	}
	for _, bad := range []string{"onclick", "javascript:", "remote.invalid", "<script", "<svg", "alert(1)"} {
		if strings.Contains(clean, bad) {
			t.Fatalf("unsafe description retained %s", bad)
		}
	}
	for _, expected := range []string{
		`<h2 dir="rtl">خطة العمل</h2>`,
		`<strong>الفريق</strong>`,
		`<em>مائل</em>`,
		`href="https://example.test/help"`,
		`<ul><li>مهمة</li></ul>`,
	} {
		if !strings.Contains(clean, expected) {
			t.Fatalf("lost formatting %s", expected)
		}
	}
	again, err := cleanDescription(clean)
	if err != nil || again != clean {
		t.Fatal("HTML canonicalization is not stable", err)
	}
	raw := IssueEditable{Title: "Legacy", Description: source, Type: command.Task, Priority: command.Medium}
	plain, err := normalizeEditable(raw)
	if err != nil || plain.Description != source || plain.DescriptionFormat != "" {
		t.Fatal("legacy plaintext was reinterpreted", err)
	}
	raw.DescriptionFormat = command.HTMLDescription
	rich, err := normalizeEditable(raw)
	if err != nil || rich.Description != clean {
		t.Fatal("rich description not canonical", err)
	}
	raw.DescriptionFormat = "unexpected"
	if _, err := normalizeEditable(raw); err == nil {
		t.Fatal("unknown description format accepted")
	}
	if _, err := cleanDescription(strings.Repeat("&", 10000)); err == nil {
		t.Fatal("expanded description exceeded its stored limit")
	}
}

func TestRichDescriptionMCPRESTReplayAndCurrentRead(t *testing.T) {
	f := issueDatabase(t)
	ctx := context.Background()
	mux := http.NewServeMux()
	api := httpapi.New(mux)
	RegisterHTTP(api, f.service)
	server := mcpapi.New()
	if err := RegisterMCP(server, f.service); err != nil {
		t.Fatal(err)
	}
	actor := f.member
	actor.Channel = command.MCP
	left, right := mcp.NewInMemoryTransports()
	serverSession, err := server.Connect(auth.WithActor(ctx, actor), left, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer serverSession.Close()
	client, err := mcp.NewClient(&mcp.Implementation{Name: "rich-description", Version: "1"}, nil).Connect(ctx, right, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()
	fields := CreateIssueFields{
		Title:             "Rich HTML عربي",
		Description:       `<h2 dir="rtl">تفاصيل</h2><p><b>المتطلبات</b><script>alert(1)</script></p>`,
		DescriptionFormat: command.HTMLDescription,
	}
	ref := uuid.NewString()
	result, err := client.CallTool(ctx, &mcp.CallToolParams{
		Name: "create_issue",
		Arguments: CreateInput{
			ProjectID:         f.project,
			CreateIssueFields: fields,
			RetryReference:    ref,
		},
	})
	if err != nil || result.IsError {
		t.Fatal("MCP rich description rejected", err)
	}
	data, _ := json.Marshal(result.StructuredContent)
	var saved mcpapi.Envelope[command.Saved[IssueView], IssueFailureBody]
	if json.Unmarshal(data, &saved) != nil || saved.Data == nil {
		t.Fatal("missing typed MCP issue")
	}
	encoded, _ := json.Marshal(fields)
	request := httptest.NewRequest("POST", "/api/v1/projects/"+f.project.String()+"/issues", strings.NewReader(string(encoded)))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Idempotency-Key", ref)
	request = request.WithContext(auth.WithActor(ctx, f.member))
	response := httptest.NewRecorder()
	mux.ServeHTTP(response, request)
	var replay command.Saved[IssueView]
	if response.Code != 201 || json.Unmarshal(response.Body.Bytes(), &replay) != nil || !replay.Receipt.Replayed || replay.Result.Summary.ID != saved.Data.Result.Summary.ID {
		t.Fatal("rich description replay differs", response.Code)
	}
	view, err := f.service.Get(ctx, f.viewer, saved.Data.Result.Summary.ID)
	if err != nil || view.DescriptionFormat != command.HTMLDescription || !strings.Contains(view.Description, "<strong>المتطلبات</strong>") || strings.Contains(view.Description, "script") {
		t.Fatal("saved rich description unavailable or unsafe", err)
	}
	input := editable(view)
	input.DescriptionFormat = command.HTMLDescription
	input.Description = `<p dir="rtl"><u>تم التحديث</u></p>`
	update := UpdateInput{
		IssueID:          view.Summary.ID,
		ExpectedRevision: view.Summary.Revision,
		Editable:         input,
		RetryReference:   uuid.NewString(),
	}
	if _, err := f.service.Update(ctx, f.viewer, update); err == nil {
		t.Fatal("Viewer changed description")
	}
	updated, err := f.service.Update(ctx, f.member, update)
	if err != nil || updated.Body.Result.Description != input.Description {
		t.Fatal("rich description update failed", err)
	}
	stale := update
	stale.RetryReference = uuid.NewString()
	if _, err := f.service.Update(ctx, f.member, stale); err == nil {
		t.Fatal("stale description overwrote current text")
	}
}

func TestDescriptionPicturesRequirePublishedSameIssueAndRetainAfterDetach(t *testing.T) {
	f := issueDatabase(t)
	ctx := context.Background()
	issue := f.create(t, "Private description")
	other := f.create(t, "Other issue")
	store, err := objectstore.NewLocal(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	cursor, _ := command.NewCursorSigner([]byte(strings.Repeat("d", 32)))
	images := pictures.New(command.Runner{Pool: f.pool}, cursor, store)
	upload := pictures.UploadInput{
		IssueID: issue.Summary.ID,
		Metadata: pictures.UploadMetadata{
			Filename:    "شرح.png",
			Description: "شرح عربي",
			MIMEType:    "image/png",
			Publication: pictures.Gallery,
		},
		Data:           testenv.PNG(t),
		RetryReference: uuid.NewString(),
	}
	saved, err := images.Upload(ctx, f.member, upload)
	if err != nil {
		t.Fatal(err)
	}
	if saved.Body.Result.IssueRevision == nil || *saved.Body.Result.IssueRevision != issue.Summary.Revision+1 {
		t.Fatal("own upload revision missing")
	}
	html := `<p dir="rtl">صورة <img data-picture-id="` + saved.Body.Result.ID.String() + `" alt="شرح عربي" src="https://remote.invalid/x" onerror="alert(1)"></p>`
	fields := editableFrom(other)
	fields.DescriptionFormat = command.HTMLDescription
	fields.Description = html
	if _, err := f.service.Update(ctx, f.member, UpdateInput{
		IssueID:          other.Summary.ID,
		ExpectedRevision: other.Summary.Revision,
		Editable:         fields,
		RetryReference:   uuid.NewString(),
	}); err == nil {
		t.Fatal("cross-issue picture reference accepted")
	}
	current, err := f.service.Get(ctx, f.member, issue.Summary.ID)
	if err != nil {
		t.Fatal(err)
	}
	fields = editableFrom(current)
	fields.DescriptionFormat = command.HTMLDescription
	fields.Description = html
	updated, err := f.service.Update(ctx, f.member, UpdateInput{
		IssueID:          issue.Summary.ID,
		ExpectedRevision: current.Summary.Revision,
		Editable:         fields,
		RetryReference:   uuid.NewString(),
	})
	if err != nil || !strings.Contains(updated.Body.Result.Description, "data-picture-id") || strings.Contains(updated.Body.Result.Description, "src=") {
		t.Fatal("private image reference failed", err)
	}
	_, err = images.Detach(ctx, f.member, pictures.DetachInput{
		PictureID:             saved.Body.Result.ID,
		ExpectedIssueRevision: updated.Body.Result.Summary.Revision,
		RetryReference:        uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := images.Content(ctx, f.viewer, saved.Body.Result.ID); err != nil {
		t.Fatal("retained description image unavailable", err)
	}
	upload.Metadata.Publication = pictures.CommentDraft
	upload.RetryReference = uuid.NewString()
	draft, err := images.Upload(ctx, f.member, upload)
	if err != nil {
		t.Fatal(err)
	}
	current, _ = f.service.Get(ctx, f.member, issue.Summary.ID)
	fields = editableFrom(current)
	fields.Description = `<p><img data-picture-id="` + draft.Body.Result.ID.String() + `" alt="Draft"></p>`
	if _, err := f.service.Update(ctx, f.member, UpdateInput{
		IssueID:          issue.Summary.ID,
		ExpectedRevision: current.Summary.Revision,
		Editable:         fields,
		RetryReference:   uuid.NewString(),
	}); err == nil {
		t.Fatal("expiring draft used in description")
	}
}
