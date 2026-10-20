package parity

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"testing"
	"time"

	"gategoldjira/backend/internal/features/identity"
	"gategoldjira/backend/internal/features/issues"
	"gategoldjira/backend/internal/features/pictures"
	"gategoldjira/backend/internal/features/projects"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/httpapi"
	"gategoldjira/backend/internal/platform/mcpapi"
	"gategoldjira/backend/tests/testapp"
	"gategoldjira/backend/tests/testenv"
	"github.com/google/uuid"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func TestOfficialMCPClientMaximumPictureHasOneBoundedBase64Field(t *testing.T) {
	r := testapp.NewRuntime(t)
	admin := reference(t, r, r.Admin)
	project := call[projects.CreateInput, command.Saved[projects.ProjectView], httpapi.FailureBody](t, admin, command.CreateProject, projects.CreateInput{
		Key:            "MAX",
		Name:           "Maximum picture",
		RetryReference: uuid.NewString(),
	})
	if !project.OK {
		t.Fatal("project setup failed")
	}
	member := call[identity.SetMembershipInput, command.Saved[identity.MembershipView], httpapi.FailureBody](t, admin, command.SetMembership, identity.SetMembershipInput{
		ProjectID:      project.Data.Result.ID,
		UserID:         r.Member,
		Role:           command.Member,
		RetryReference: uuid.NewString(),
	})
	if !member.OK {
		t.Fatal("membership setup failed")
	}
	session := reference(t, r, r.Member)
	issue := call[issues.CreateInput, command.Saved[issues.IssueView], issues.IssueFailureBody](t, session, command.CreateIssue, issues.CreateInput{
		ProjectID:         project.Data.Result.ID,
		CreateIssueFields: issues.CreateIssueFields{Title: "Maximum صورة"},
		RetryReference:    uuid.NewString(),
	})
	if !issue.OK {
		t.Fatal("issue setup failed")
	}
	image := testenv.PNGSize(t, 10<<20)
	input := pictures.UploadToolInput{
		IssueID: issue.Data.Result.Summary.ID,
		Upload: pictures.Base64Upload{
			UploadMetadata: pictures.UploadMetadata{
				Filename:    "maximum.png",
				Description: "صورة كبيرة",
				MIMEType:    "image/png",
				Publication: pictures.Gallery,
			},
			DataBase64: base64.StdEncoding.EncodeToString(image),
		},
		RetryReference: uuid.NewString(),
	}
	requestJSON, err := json.Marshal(input)
	if err != nil || len(requestJSON) > httpapi.MaximumTransportBytes || bytes.Count(requestJSON, []byte(`"dataBase64"`)) != 1 {
		t.Fatal("max upload JSON is not bounded")
	}
	start := time.Now()
	uploaded := call[pictures.UploadToolInput, command.Saved[pictures.PictureView], httpapi.FailureBody](t, session, command.UploadPicture, input)
	if !uploaded.OK || uploaded.Data.Result.ByteSize != 10<<20 {
		t.Fatal("maximum MCP upload failed")
	}
	response, err := session.CallTool(context.Background(), &mcp.CallToolParams{
		Name:      string(command.DownloadPicture),
		Arguments: pictures.GetInput{PictureID: uploaded.Data.Result.ID},
	})
	if err != nil || response.IsError {
		t.Fatal("maximum MCP download failed")
	}
	encoded, err := json.Marshal(response)
	if err != nil || len(encoded) > httpapi.MaximumTransportBytes || bytes.Count(encoded, []byte(`"dataBase64"`)) != 1 {
		t.Fatal("maximum download repeats bytes or exceeds transport budget")
	}
	data, err := json.Marshal(response.StructuredContent)
	if err != nil {
		t.Fatal(err)
	}
	var envelope mcpapi.Envelope[pictures.PictureDownload, httpapi.FailureBody]
	if json.Unmarshal(data, &envelope) != nil || !envelope.OK {
		t.Fatal("maximum download contract failed")
	}
	decoded, err := base64.StdEncoding.Strict().DecodeString(envelope.Data.DataBase64)
	if err != nil || !bytes.Equal(decoded, image) {
		t.Fatal("maximum bytes changed")
	}
	t.Logf("Official SDK maximum10MiB upload+download=%s; input JSON=%d bytes; entire download JSON=%d bytes; one base64 field", time.Since(start), len(requestJSON), len(encoded))
}
