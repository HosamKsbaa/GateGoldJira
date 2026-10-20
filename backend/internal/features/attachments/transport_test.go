package attachments

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"mime"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"

	"gategoldjira/backend/internal/platform/auth"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/httpapi"
	"gategoldjira/backend/internal/platform/mcpapi"
	"gategoldjira/backend/internal/platform/objectstore"
	"gategoldjira/backend/tests/testenv"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func uploadHTTP(t *testing.T, handler http.Handler, in UploadInput) *httptest.ResponseRecorder {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	metadata, err := json.Marshal(in.Metadata)
	if err != nil {
		t.Fatal(err)
	}
	field, err := writer.CreateFormField("metadata")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = field.Write(metadata); err != nil {
		t.Fatal(err)
	}
	file, err := writer.CreateFormFile("file", in.Metadata.Filename)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = file.Write(in.Data); err != nil {
		t.Fatal(err)
	}
	if err = writer.Close(); err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest("POST", "/api/v1/issues/"+in.IssueID.String()+"/attachments", &body)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	request.Header.Set("Idempotency-Key", in.RetryReference)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	return response
}
func TestHTTPAndMCPShareUploadReceiptAndPrivateDownloadRules(t *testing.T) {
	w := testenv.Work(t)
	service := attachmentService(t, w)
	mux := http.NewServeMux()
	RegisterHTTP(httpapi.New(mux), service)
	actor := w.Author
	limited := httpapi.FeatureLimits(objectstore.NewTransferGate(), mux)
	handler := http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		limited.ServeHTTP(response, request.WithContext(auth.WithActor(request.Context(), actor)))
	})
	in := textUpload(w.Issue)
	response := uploadHTTP(t, handler, in)
	if response.Code != 201 {
		t.Fatal("HTTP upload", response.Code, response.Body.String())
	}
	var rest command.Saved[AttachmentView]
	if err := json.Unmarshal(response.Body.Bytes(), &rest); err != nil {
		t.Fatal(err)
	}
	server := mcpapi.New()
	if err := RegisterMCP(server, service); err != nil {
		t.Fatal(err)
	}
	left, right := mcp.NewInMemoryTransports()
	mcpActor := w.Author
	mcpActor.Channel = command.MCP
	server.AddReceivingMiddleware(func(next mcp.MethodHandler) mcp.MethodHandler {
		return func(ctx context.Context, method string, request mcp.Request) (mcp.Result, error) {
			ctx = auth.WithActor(ctx, mcpActor)
			ctx, lease := objectstore.WithTransfer(ctx, objectstore.NewTransferGate())
			defer lease.Close()
			return next(ctx, method, request)
		}
	})
	ctx := context.Background()
	ss, err := server.Connect(ctx, left, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer ss.Close()
	cs, err := mcp.NewClient(&mcp.Implementation{Name: "attachment parity", Version: "1"}, nil).Connect(context.Background(), right, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer cs.Close()
	result, err := cs.CallTool(context.Background(), &mcp.CallToolParams{
		Name: string(command.UploadAttachment),
		Arguments: UploadToolInput{
			in.IssueID,
			Base64Upload{
				in.Metadata,
				base64.StdEncoding.EncodeToString(in.Data),
			},
			in.RetryReference,
		},
	})
	if err != nil || result.IsError {
		t.Fatal("MCP replay", err, result)
	}
	encoded, err := json.Marshal(result.StructuredContent)
	if err != nil {
		t.Fatal(err)
	}
	var replay mcpapi.Result[command.Saved[AttachmentView]]
	if err = json.Unmarshal(encoded, &replay); err != nil || !replay.OK || replay.Data == nil || !replay.Data.Receipt.Replayed || replay.Data.Result.ID != rest.Result.ID {
		t.Fatal("REST/MCP result mismatch", err)
	}
	actor = w.Viewer
	request := httptest.NewRequest("GET", "/api/v1/attachments/"+rest.Result.ID.String()+"/content", nil)
	download := httptest.NewRecorder()
	handler.ServeHTTP(download, request)
	disposition, _, err := mime.ParseMediaType(download.Header().Get("Content-Disposition"))
	if err != nil || disposition != "attachment" || download.Header().Get("Cache-Control") != "private, no-store" || download.Header().Get("X-Content-Type-Options") != "nosniff" || !bytes.Equal(download.Body.Bytes(), in.Data) {
		t.Fatal("download headers/body", err)
	}
	if _, err = w.Pool.Exec(context.Background(), "UPDATE project_memberships SET removed_at=now() WHERE project_id=$1 AND user_id=$2", w.Project.UUID, w.Viewer.UserID.UUID); err != nil {
		t.Fatal(err)
	}
	denied := httptest.NewRecorder()
	handler.ServeHTTP(denied, request)
	if denied.Code == 200 || bytes.Equal(denied.Body.Bytes(), in.Data) {
		t.Fatal("revoked download leaked")
	}
	actor = w.Author
	in.Data = []byte("different content")
	mismatch := uploadHTTP(t, handler, in)
	if mismatch.Code != 409 {
		t.Fatal("same reference different data", mismatch.Code, mismatch.Body.String())
	}
}
