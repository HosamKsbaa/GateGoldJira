package parity

import (
	"context"
	"encoding/json"
	"testing"

	"gategoldjira/backend/internal/features/boards"
	"gategoldjira/backend/internal/features/comments"
	"gategoldjira/backend/internal/features/issues"
	"gategoldjira/backend/internal/features/projects"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/httpapi"
	"gategoldjira/backend/internal/platform/mcpapi"
	"gategoldjira/backend/tests/testapp"
	"github.com/google/uuid"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func assertBrowserLink(t *testing.T, links []mcpapi.ResourceLink, expected string) {
	t.Helper()
	if len(links) != 1 || links[0].URL != expected || links[0].Title == "" {
		t.Fatal("missing or incorrect browser link", links, expected)
	}
}

type linkIssueInput struct {
	IssueID command.IssueID `json:"issueId"`
}

func TestMCPNewResourcesReturnBrowserLinksAndTextFallback(t *testing.T) {
	r := testapp.NewRuntime(t)
	session := reference(t, r, r.Admin)
	project := call[projects.CreateInput, command.Saved[projects.ProjectView], httpapi.FailureBody](t, session, command.CreateProject, projects.CreateInput{Key: "LINK", Name: "Linked project", RetryReference: uuid.NewString()})
	if !project.OK {
		t.Fatal("project setup failed")
	}
	assertBrowserLink(t, project.Links, r.URL+"/projects/"+project.Data.Result.ID.String())
	board := call[boards.CreateInput, command.Saved[boards.LayoutView], boards.BoardFailureBody](t, session, command.CreateModernBoard, boards.CreateInput{ProjectID: project.Data.Result.ID, Name: "Linked board", RetryReference: uuid.NewString()})
	if !board.OK {
		t.Fatal("board setup failed")
	}
	assertBrowserLink(t, board.Links, r.URL+"/boards/"+board.Data.Result.Board.ID.String())
	input := issues.ModernCreateInput{ProjectID: project.Data.Result.ID, ModernCreateFields: issues.ModernCreateFields{Title: "رابط المهمة"}, RetryReference: uuid.NewString()}
	issue := call[issues.ModernCreateInput, command.Saved[issues.ModernIssueView], issues.ModernIssueFailureBody](t, session, command.CreateModernIssue, input)
	if !issue.OK {
		t.Fatal("issue setup failed", issue.Error.Error.Code, issue.Error.Error.Message)
	}
	issueURL := r.URL + "/issues/" + issue.Data.Result.Summary.ID.String()
	assertBrowserLink(t, issue.Links, issueURL)
	// Retry keeps the same resource URL and exposes it to a text-only model.
	response, err := session.CallTool(context.Background(), &mcp.CallToolParams{Name: string(command.CreateModernIssue), Arguments: input})
	if err != nil || response.IsError {
		t.Fatal("issue retry failed", err)
	}
	if len(response.Content) != 1 {
		t.Fatal("missing model-visible result")
	}
	text, ok := response.Content[0].(*mcp.TextContent)
	if !ok {
		t.Fatal("model-visible result is not text")
	}
	var fallback mcpapi.Result[command.Saved[issues.ModernIssueView]]
	if json.Unmarshal([]byte(text.Text), &fallback) != nil || !fallback.OK || !fallback.Data.Receipt.Replayed {
		t.Fatal("text fallback does not contain the saved resource")
	}
	assertBrowserLink(t, fallback.Links, issueURL)
	comment := call[comments.CreateInput, command.Saved[comments.CommentView], comments.CommentFailureBody](t, session, command.CreateComment, comments.CreateInput{IssueID: issue.Data.Result.Summary.ID, Body: comments.Body{HTML: "<p>تعليق له رابط</p>", MentionUserIDs: []command.UserID{}, PictureIDs: []command.PictureID{}}, RetryReference: uuid.NewString()})
	if !comment.OK {
		t.Fatal("comment setup failed")
	}
	assertBrowserLink(t, comment.Links, issueURL+"#comment-"+comment.Data.Result.ID.String())
	// Failure envelopes must not advertise an unauthorized resource.
	missing := call[linkIssueInput, issues.IssueView, issues.IssueFailureBody](t, session, command.GetIssue, linkIssueInput{IssueID: command.NewID[command.IssueKind]()})
	if missing.OK || len(missing.Links) != 0 {
		t.Fatal("failure exposes a resource link")
	}
}
