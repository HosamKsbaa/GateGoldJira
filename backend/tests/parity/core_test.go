package parity

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"testing"
	"time"

	"gategoldjira/backend/internal/features/activity"
	"gategoldjira/backend/internal/features/identity"
	"gategoldjira/backend/internal/features/issues"
	"gategoldjira/backend/internal/features/projects"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database"
	"gategoldjira/backend/internal/platform/httpapi"
	"gategoldjira/backend/internal/platform/mcpapi"
	mcpclient "gategoldjira/backend/tests/mcp"
	"gategoldjira/backend/tests/testapp"
	"github.com/google/uuid"
	"github.com/modelcontextprotocol/go-sdk/auth"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	"golang.org/x/oauth2"
)

func reference(t *testing.T, r *testapp.Runtime, user command.UserID) *mcp.ClientSession {
	t.Helper()
	client, err := mcpclient.NewReferenceClient(mcpclient.ReferenceConfig{Endpoint: r.URL + "/mcp", Issuer: r.Issuer, ClientID: "local-fixture-public", RedirectURL: "http://127.0.0.1:39177/oauth/callback", ProtocolVersion: "2026-07-28", HTTPClient: &http.Client{Timeout: 10 * time.Second}, InitialTokenSource: oauth2.StaticTokenSource(&oauth2.Token{
		AccessToken: r.Token(t, user, command.MCP),
		TokenType:   "Bearer",
	}), FetchCode: func(context.Context, *auth.AuthorizationArgs) (*auth.AuthorizationResult, error) {
		return nil, errors.New("local signed identity only")
	}})
	if err != nil {
		t.Fatal(err)
	}
	session, err := client.Connect(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { session.Close() })
	return session
}
func call[Input, Output, Failure any](t *testing.T, session *mcp.ClientSession, name command.Operation, input Input) mcpapi.Envelope[Output, Failure] {
	t.Helper()
	result, err := session.CallTool(context.Background(), &mcp.CallToolParams{Name: string(name), Arguments: input})
	if err != nil {
		t.Fatal(err)
	}
	data, err := json.Marshal(result.StructuredContent)
	if err != nil {
		t.Fatal(err)
	}
	out, err := database.DecodeJSON[mcpapi.Envelope[Output, Failure]](data)
	if err != nil || out.OK == result.IsError || (out.OK != (out.Data != nil)) || (out.OK == (out.Error != nil)) {
		t.Fatal("invalid published envelope", name, err)
	}
	return out
}
func rest[Input, Output any](t *testing.T, r *testapp.Runtime, user command.UserID, method, path, reference string, input Input) (Output, int) {
	t.Helper()
	data, err := json.Marshal(input)
	if err != nil {
		t.Fatal(err)
	}
	request, err := http.NewRequest(method, r.URL+"/api/v1"+path, bytes.NewReader(data))
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Authorization", "Bearer "+r.Token(t, user, command.REST))
	request.Header.Set("Content-Type", "application/json")
	if reference != "" {
		request.Header.Set("Idempotency-Key", reference)
	}
	response, err := (&http.Client{Timeout: 10 * time.Second}).Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	var out Output
	if err := json.NewDecoder(response.Body).Decode(&out); err != nil {
		t.Fatal("untyped REST", response.StatusCode, err)
	}
	return out, response.StatusCode
}
func TestCoreReferenceClientAndRESTShareActorHistoryRetryAndRevocation(t *testing.T) {
	r := testapp.NewRuntime(t)
	admin := reference(t, r, r.Admin)
	me := call[struct{}, identity.Me, httpapi.FailureBody](t, admin, command.GetMe, struct{}{})
	if !me.OK || me.Data.UserID != r.Admin {
		t.Fatal("incorrect human")
	}
	project := call[projects.CreateInput, command.Saved[projects.ProjectView], httpapi.FailureBody](t, admin, command.CreateProject, projects.CreateInput{
		Key:            "CORE",
		Name:           "Parity مشروع",
		RetryReference: uuid.NewString(),
	})
	if !project.OK {
		t.Fatal("project creation")
	}
	id := project.Data.Result.ID
	for i, user := range []command.UserID{r.Member, r.Viewer} {
		role := command.Member
		if i == 1 {
			role = command.Viewer
		}
		out := call[identity.SetMembershipInput, command.Saved[identity.MembershipView], httpapi.FailureBody](t, admin, command.SetMembership, identity.SetMembershipInput{
			ProjectID:        id,
			UserID:           user,
			ExpectedRevision: 0,
			Role:             role,
			RetryReference:   uuid.NewString(),
		})
		if !out.OK {
			t.Fatal("membership")
		}
	}
	member, viewer := reference(t, r, r.Member), reference(t, r, r.Viewer)
	input := issues.CreateInput{
		ProjectID: id,
		CreateIssueFields: issues.CreateIssueFields{
			Title:      "From MCP عربي",
			AssigneeID: &r.Admin,
		},
		RetryReference: uuid.NewString(),
	}
	created := call[issues.CreateInput, command.Saved[issues.IssueView], issues.IssueFailureBody](t, member, command.CreateIssue, input)
	if !created.OK {
		t.Fatal("issue")
	}
	issue := created.Data.Result
	if issue.Reporter.ID != r.Member {
		t.Fatal("untrusted attribution")
	}
	r.Restart(t)
	replay, status := rest[issues.CreateIssueFields, command.Saved[issues.IssueView]](t, r, r.Member, "POST", "/projects/"+id.String()+"/issues", input.RetryReference, input.CreateIssueFields)
	if status != 201 || !replay.Receipt.Replayed || *replay.Receipt.EventID != *created.Data.Receipt.EventID || replay.Result.Summary.ID != issue.Summary.ID {
		t.Fatal("cross-channel replay changed outcome")
	}
	read, status := rest[struct{}, issues.IssueView](t, r, r.Viewer, "GET", "/issues/"+issue.Summary.ID.String(), "", struct{}{})
	if status != 200 || read.Summary.Title != input.Title || read.Reporter.ID != r.Member {
		t.Fatal("next web read")
	}
	lists := call[struct {
		ProjectID command.ProjectID `json:"projectId"`
	}, command.Page[command.BoardSummary], httpapi.FailureBody](t, member, command.ListBoards, struct {
		ProjectID command.ProjectID `json:"projectId"`
	}{id})
	if !lists.OK || len(lists.Data.Items) != 1 {
		t.Fatal("board discovery")
	}
	board := call[struct {
		BoardID command.BoardID `json:"boardId"`
	}, command.BoardView, httpapi.FailureBody](t, member, command.GetBoard, struct {
		BoardID command.BoardID `json:"boardId"`
	}{lists.Data.Items[0].ID})
	if !board.OK || board.Data.Columns[0].SavedMatchCount != 1 {
		t.Fatal("board projection")
	}
	blocker := call[issues.CreateInput, command.Saved[issues.IssueView], issues.IssueFailureBody](t, member, command.CreateIssue, issues.CreateInput{
		ProjectID: id,
		CreateIssueFields: issues.CreateIssueFields{
			Title:      "Other developer",
			AssigneeID: &r.Admin,
		},
		RetryReference: uuid.NewString(),
	})
	if !blocker.OK {
		t.Fatal("blocker")
	}
	dependency := call[issues.AddDependencyInput, command.Saved[issues.DependencyView], issues.IssueFailureBody](t, member, command.AddDependency, issues.AddDependencyInput{
		IssueID:               issue.Summary.ID,
		BlockerID:             blocker.Data.Result.Summary.ID,
		ExpectedIssueRevision: issue.Summary.Revision,
		ExpectedGraphRevision: 1,
		RetryReference:        uuid.NewString(),
	})
	if !dependency.OK {
		t.Fatal("dependency")
	}
	history := call[activity.ListInput, command.Page[activity.ActivityView], httpapi.FailureBody](t, admin, command.ListActivity, activity.ListInput{
		ResourceKind: resourceKind(activity.IssueResource),
		ResourceID:   &activity.ResourceID{UUID: issue.Summary.ID.UUID},
	})
	if !history.OK || history.Data.TotalMatching != 2 {
		t.Fatal("issue history")
	}
	for _, event := range history.Data.Items {
		if event.Actor.ID != r.Member || event.Channel != command.MCP {
			t.Fatal("history attribution changed")
		}
	}
	denied := call[issues.CreateInput, command.Saved[issues.IssueView], issues.IssueFailureBody](t, viewer, command.CreateIssue, issues.CreateInput{
		ProjectID:         id,
		CreateIssueFields: issues.CreateIssueFields{Title: "Denied"},
		RetryReference:    uuid.NewString(),
	})
	if denied.OK || denied.Error.Error.Code != command.Forbidden {
		t.Fatal("Viewer wrote")
	}
	private := call[activity.ListInput, command.Page[activity.ActivityView], httpapi.FailureBody](t, viewer, command.ListActivity, activity.ListInput{})
	if private.OK || private.Error.Error.Code != command.Forbidden {
		t.Fatal("Viewer history")
	}
	removed := call[identity.RemoveMembershipInput, command.Saved[identity.MembershipView], httpapi.FailureBody](t, admin, command.RemoveMembership, identity.RemoveMembershipInput{
		ProjectID:        id,
		UserID:           r.Member,
		ExpectedRevision: 1,
		RetryReference:   uuid.NewString(),
	})
	if !removed.OK {
		t.Fatal("remove access")
	}
	revoked := call[issues.CreateInput, command.Saved[issues.IssueView], issues.IssueFailureBody](t, member, command.CreateIssue, input)
	if revoked.OK || revoked.Error.Error.Code != command.Unavailable {
		t.Fatal("revoked replay exposed result")
	}
}
func resourceKind(v activity.ResourceKind) *activity.ResourceKind { return &v }
