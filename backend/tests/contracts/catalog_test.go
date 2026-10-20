package contracts

import (
	"context"
	"encoding/json"
	"gategoldjira/backend/internal/features/activity"
	"gategoldjira/backend/internal/features/attachments"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	"os"
	"strconv"
	"strings"
	"testing"
	"time"

	"gategoldjira/backend/internal/app"
	"gategoldjira/backend/internal/features/identity"
	"gategoldjira/backend/internal/features/issues"
	"gategoldjira/backend/internal/features/projects"
	"gategoldjira/backend/internal/platform/command"
	"github.com/danielgtaylor/huma/v2"
	"github.com/google/jsonschema-go/jsonschema"
)

// Local sign-in is a development transport helper. It is explicitly public,
// never an MCP tool, and is excluded only by its exact identity and route from
// the fixed business operation catalog.
func assertLocalSignInContract(t *testing.T, api huma.API) {
	t.Helper()
	path := api.OpenAPI().Paths["/api/v1/auth/local-sign-in"]
	if path == nil || path.Post == nil || path.Post.OperationID != "localSignIn" {
		t.Fatal("typed local sign-in contract is missing")
	}
	if path.Get != nil || path.Put != nil || path.Delete != nil || path.Patch != nil || path.Head != nil || path.Options != nil || path.Trace != nil {
		t.Fatal("unexpected local sign-in method")
	}
	if path.Post.Security == nil || len(path.Post.Security) != 0 {
		t.Fatal("local sign-in must explicitly override the global bearer requirement")
	}
	hosted := api.OpenAPI().Paths["/api/v1/auth/password-sign-in"]
	if hosted == nil || hosted.Post == nil || hosted.Post.OperationID != "passwordSignIn" || hosted.Post.Security == nil || len(hosted.Post.Security) != 0 {
		t.Fatal("typed hosted password sign-in contract is missing")
	}
}

func isPasswordSignIn(id, path string) bool {
	return id == "localSignIn" && path == "/api/v1/auth/local-sign-in" ||
		id == "passwordSignIn" && path == "/api/v1/auth/password-sign-in"
}

// Account credentials are deliberately outside the assistant business catalog:
// authenticated users manage their own tokens through the website only.
func isAccountTokenOperation(id, path string) bool {
	if path == "/api/v1/me/mcp-authorizations/{request}" && (id == "getMcpBrowserAuthorization" || id == "decideMcpBrowserAuthorization") {
		return true
	}
	return (id == "listPersonalMcpTokens" || id == "createPersonalMcpToken") && path == "/api/v1/me/mcp-tokens" ||
		id == "revokePersonalMcpToken" && path == "/api/v1/me/mcp-tokens/{tokenId}/revoke" ||
		id == "listPersonalMcpTokenActivity" && path == "/api/v1/me/mcp-tokens/{tokenId}/activity"
}

func assertAccountTokenContract(t *testing.T, api huma.API) {
	t.Helper()
	for path, methods := range map[string]map[string]string{
		"/api/v1/me/mcp-authorizations/{request}":  {"GET": "getMcpBrowserAuthorization", "POST": "decideMcpBrowserAuthorization"},
		"/api/v1/me/mcp-tokens":                    {"GET": "listPersonalMcpTokens", "POST": "createPersonalMcpToken"},
		"/api/v1/me/mcp-tokens/{tokenId}/revoke":   {"POST": "revokePersonalMcpToken"},
		"/api/v1/me/mcp-tokens/{tokenId}/activity": {"GET": "listPersonalMcpTokenActivity"},
	} {
		item := api.OpenAPI().Paths[path]
		if item == nil {
			t.Fatal("missing account credential route", path)
		}
		for method, id := range methods {
			op := item.Post
			if method == "GET" {
				op = item.Get
			}
			if op == nil || op.OperationID != id || op.Security != nil && len(op.Security) == 0 {
				t.Fatal("credential route must require a browser bearer session", path, method)
			}
		}
	}
}

func TestRegisteredAPIAndPayloadsMatchDesignCatalog(t *testing.T) {
	api, err := app.Contracts()
	if err != nil {
		t.Fatal(err)
	}
	catalogBytes, err := os.ReadFile("../../../specs/001-gategoldjira-mvp/contracts/operations.json")
	if err != nil {
		t.Fatal(err)
	}
	var catalog struct {
		Operations []struct {
			ID       string `json:"id"`
			Mutation bool   `json:"mutation"`
			MCPTool  string `json:"mcpTool"`
			REST     struct {
				Method, Path string
				APIVersion   int
			} `json:"rest"`
		} `json:"operations"`
	}
	if err := json.Unmarshal(catalogBytes, &catalog); err != nil {
		t.Fatal(err)
	}
	var extension = catalog
	extension.Operations = nil
	extensionBytes, err := os.ReadFile("../../../specs/002-scalable-core/contracts/operations.json")
	if err != nil || json.Unmarshal(extensionBytes, &extension) != nil {
		t.Fatal("scalable-core catalog missing or invalid", err)
	}
	if len(catalog.Operations) != 78 {
		t.Fatal("legacy operation catalog changed")
	}
	catalog.Operations = append(catalog.Operations, extension.Operations...)
	assertLocalSignInContract(t, api)
	assertAccountTokenContract(t, api)
	registered := map[string]string{}
	for path, item := range api.OpenAPI().Paths {
		if item.Get != nil {
			if !isAccountTokenOperation(item.Get.OperationID, path) {
				registered[item.Get.OperationID] = "GET " + path
			}
		}
		if item.Post != nil {
			if isAccountTokenOperation(item.Post.OperationID, path) {
				continue
			}
			if isPasswordSignIn(item.Post.OperationID, path) {
				continue
			}
			registered[item.Post.OperationID] = "POST " + path
		}
		if item.Put != nil {
			registered[item.Put.OperationID] = "PUT " + path
		}
		if item.Patch != nil {
			registered[item.Patch.OperationID] = "PATCH " + path
		}
	}
	if len(registered) != len(catalog.Operations) {
		t.Fatalf("documented implemented operations differ: %d", len(registered))
	}
	if len(catalog.Operations) != 133 {
		t.Fatalf("combined design requires exactly133 operations: %d", len(catalog.Operations))
	}
	seen := map[string]bool{}
	mutations := 0
	for _, operation := range catalog.Operations {
		if seen[operation.ID] {
			t.Fatal("duplicate design operation", operation.ID)
		}
		seen[operation.ID] = true
		if operation.Mutation != command.Operation(operation.ID).IsMutation() || operation.MCPTool != operation.ID {
			t.Fatal("operation mutation/tool mismatch", operation.ID)
		}
		if command.Operation(operation.ID).IsMutation() {
			mutations++
		}
		version := operation.REST.APIVersion
		if version == 0 {
			version = 1
		}
		if route, exists := registered[operation.ID]; !exists || route != operation.REST.Method+" /api/v"+strconv.Itoa(version)+operation.REST.Path {
			t.Fatalf("catalog route mismatch %s", operation.ID)
		}
	}
	if mutations != 71 {
		t.Fatalf("exactly71 retriable mutations required: %d", mutations)
	}
	for id := range registered {
		if !seen[id] {
			t.Fatal("undocumented registered operation", id)
		}
	}
	if _, exists := registered["contract_fixture"]; exists {
		t.Fatal("test fixture escaped into business API")
	}
	for _, name := range []string{
		"PageUserView",
		"PageMembershipView",
		"PageUserSummary",
		"PageProjectView",
		"PageBoardSummary",
		"PageNotificationView",
		"PageCommentView",
		"PageIssueSummary",
		"PagePictureView",
		"PageAttachmentView",
		"PagePlanningItemView",
		"PagePlanningIssueSummary",
		"PageDevelopmentLinkView",
		"PageAutomationRuleView",
	} {
		schema := api.OpenAPI().Components.Schemas.Map()[name]
		encoded, err := json.Marshal(schema)
		if err != nil {
			t.Fatal(err)
		}
		var shape struct {
			Properties map[string]struct {
				Type json.RawMessage `json:"type"`
			} `json:"properties"`
		}
		if json.Unmarshal(encoded, &shape) != nil || string(shape.Properties["items"].Type) != `"array"` {
			t.Fatal("collection schema admitted null", name)
		}
	}
	domainBytes, err := os.ReadFile("../../../specs/001-gategoldjira-mvp/contracts/domain.schema.json")
	if err != nil {
		t.Fatal(err)
	}
	var domain jsonschema.Schema
	if err := json.Unmarshal(domainBytes, &domain); err != nil {
		t.Fatal(err)
	}
	user := identity.UserView{
		ID:          command.NewID[command.UserKind](),
		Email:       "member@example.test",
		DisplayName: "مطور",
		Approved:    true,
		Active:      true,
		Revision:    9007199254740993,
		CreatedAt:   time.Now().UTC(),
		UpdatedAt:   time.Now().UTC(),
	}
	membership := identity.MembershipView{
		ProjectID: command.NewID[command.ProjectKind](),
		User:      identity.UserSummary{ID: user.ID, DisplayName: user.DisplayName},
		Role:      command.Member,
		Revision:  1,
	}
	check := func(name string, value any) {
		t.Helper()
		schema := jsonschema.Schema{Ref: "#/$defs/" + name, Defs: domain.Defs}
		resolved, err := schema.Resolve(nil)
		if err != nil {
			t.Fatal(err)
		}
		encoded, err := json.Marshal(value)
		if err != nil {
			t.Fatal(err)
		}
		var external any
		if json.Unmarshal(encoded, &external) != nil {
			t.Fatal("invalid wire JSON")
		}
		if err := resolved.Validate(external); err != nil {
			t.Fatalf("catalog %s: %v", name, err)
		}
	}
	check("PageActivity", command.Page[activity.ActivityView]{Items: []activity.ActivityView{}, TotalMatching: 0})
	check("Activity", activity.ActivityView{
		ID:           command.NewID[command.EventKind](),
		Actor:        command.IssueUserSummary{ID: user.ID, DisplayName: user.DisplayName},
		Action:       "update_issue",
		Channel:      command.MCP,
		ResourceKind: activity.IssueResource,
		ResourceID:   activity.ResourceID{UUID: user.ID.UUID},
		CreatedAt:    time.Now().UTC(),
		Changes:      []activity.FieldChange{},
	})
	check("Me", identity.Me{
		UserID:          user.ID,
		Email:           user.Email,
		DisplayName:     user.DisplayName,
		CompanyTimeZone: "Africa/Cairo",
	})
	check("ApproveUserResult", command.Saved[identity.UserView]{Result: user})
	check("UpdateUserResult", command.Saved[identity.UserView]{Result: user})
	check("SetMembershipResult", command.Saved[identity.MembershipView]{Result: membership})
	check("RemoveMembershipResult", command.Saved[identity.MembershipView]{Result: membership})
	check("PageUser", command.Page[identity.UserView]{Items: []identity.UserView{user}, TotalMatching: 1})
	check("PageUserSummary", command.Page[identity.UserSummary]{Items: []identity.UserSummary{}, TotalMatching: 0})
	check("PageMembership", command.Page[identity.MembershipView]{
		Items:         []identity.MembershipView{membership},
		TotalMatching: 1,
	})
	check("Failure", identity.IdentityFailureBody{
		Error: command.Failure{
			Code:        command.Conflict,
			Message:     "Review current values.",
			FieldErrors: []command.FieldError{},
			NextAction:  command.ReloadCurrentState,
		},
		Current: identity.Current{User: &user},
	})
	project := projects.ProjectView{
		ID:            command.NewID[command.ProjectKind](),
		Key:           "GG",
		Name:          "بوابة",
		Description:   "Plain <b>text</b>",
		Revision:      9007199254740993,
		CreatedAt:     time.Now().UTC(),
		UpdatedAt:     time.Now().UTC(),
		EffectiveRole: projects.Administrator,
	}
	check("Project", project)
	for _, name := range []string{
		"CreateProjectResult",
		"UpdateProjectResult",
		"ArchiveProjectResult",
		"RestoreProjectResult",
	} {
		check(name, command.Saved[projects.ProjectView]{Result: project})
	}
	check("PageProject", command.Page[projects.ProjectView]{Items: []projects.ProjectView{}, TotalMatching: 0})
	check("Failure", projects.ProjectFailureBody{
		Error: command.Failure{
			Code:        command.Conflict,
			Message:     "Review current values.",
			FieldErrors: []command.FieldError{},
			NextAction:  command.ReloadCurrentState,
		},
		Current: projects.ProjectCurrent{Value: &project},
	})

	issue := issues.IssueView{
		Summary: issues.IssueSummary{
			ID:        command.NewID[command.IssueKind](),
			ProjectID: project.ID,
			Key:       "GG-1",
			Number:    1,
			Title:     "عمل",
			Type:      command.Task,
			Priority:  command.Medium,
			Status:    command.Todo,
			Labels:    []issues.LabelView{},
			Revision:  1,
			CreatedAt: time.Now().UTC(),
			UpdatedAt: time.Now().UTC(),
		},
		Description:         "",
		Reporter:            issues.IssueUserSummary{ID: user.ID, DisplayName: user.DisplayName},
		GraphRevision:       1,
		SourceOrderRevision: 1,
		Capabilities:        []issues.Capability{issues.Read},
		OrderRevisions: []issues.ColumnOrder{
			{Status: command.Todo, Revision: 1},
			{Status: command.InProgress, Revision: 1},
			{Status: command.Review, Revision: 1},
			{Status: command.Done, Revision: 1},
		},
	}
	attachment := attachments.AttachmentView{
		ID:         command.NewID[command.AttachmentKind](),
		IssueID:    issue.Summary.ID,
		Filename:   "عمل.txt",
		MIMEType:   "text/plain",
		ByteSize:   8,
		Uploader:   command.IssueUserSummary{ID: user.ID, DisplayName: user.DisplayName},
		UploadedAt: time.Now().UTC(),
		Attached:   true,
	}
	check("Attachment", attachment)
	check("PageAttachment", command.Page[attachments.AttachmentView]{
		Items:         []attachments.AttachmentView{attachment},
		TotalMatching: 1,
	})
	check("UploadAttachmentResult", command.Saved[attachments.AttachmentView]{Result: attachment})
	check("DetachAttachmentResult", command.Saved[attachments.AttachmentView]{Result: attachment})
	check("AttachmentDownload", attachments.AttachmentDownload{Attachment: attachment, DataBase64: "d29yaw=="})
	check("Issue", issue)
	check("IssueSummary", issue.Summary)
	check("CreateIssueResult", command.Saved[issues.IssueView]{Result: issue})
	check("UpdateIssueResult", command.Saved[issues.IssueView]{Result: issue})
	check("PageIssueSummary", command.Page[issues.IssueSummary]{
		Items:         []issues.IssueSummary{issue.Summary},
		TotalMatching: 1,
	})
	check("IssueFilter", command.IssueFilter{Assignee: &command.AssigneeFilter{Mode: command.AssigneeMe}})
	otherIssue := issue.Summary
	otherIssue.ID = command.NewID[command.IssueKind]()
	otherIssue.Number = 2
	otherIssue.Key = "GG-2"
	dependency := issues.DependencyView{Dependent: issue.Summary, Blocker: otherIssue, Revision: 1, GraphRevision: 1}
	check("AddDependencyResult", command.Saved[issues.DependencyView]{Result: dependency})
	check("RemoveDependencyResult", command.Saved[issues.DependencyView]{Result: dependency})
	check("PageDependency", command.Page[issues.DependencyView]{
		Items:         []issues.DependencyView{dependency},
		TotalMatching: 1,
	})
	check("Failure", issues.IssueFailureBody{
		Error: command.Failure{
			Code:        command.Conflict,
			Message:     "Dependency changed.",
			FieldErrors: []command.FieldError{},
			NextAction:  command.ReloadCurrentState,
		},
		Current: issues.IssueCurrent{Dependency: &dependency},
	})
	board := command.BoardSummary{
		ID:           command.NewID[command.BoardKind](),
		ProjectID:    project.ID,
		Name:         "لوحة",
		Creator:      command.IssueUserSummary{ID: user.ID, DisplayName: user.DisplayName},
		SavedFilters: command.IssueFilter{},
		Revision:     1,
		CanManage:    true,
	}
	for _, name := range []string{"CreateBoardResult", "UpdateBoardResult", "ArchiveBoardResult", "RestoreBoardResult"} {
		check(name, command.Saved[command.BoardSummary]{Result: board})
	}
	columns := []command.ColumnSummary{}
	for _, status := range []command.Status{command.Todo, command.InProgress, command.Review, command.Done} {
		columns = append(columns, command.ColumnSummary{Status: status, OrderRevision: 1})
	}
	today, _ := command.ParseDate("2026-10-12")
	boardView := command.BoardView{Board: board, Columns: columns, CompanyToday: today}
	check("BoardView", boardView)
	check("PageBoard", command.Page[command.BoardSummary]{Items: []command.BoardSummary{board}, TotalMatching: 1})
	move := command.MoveResult{
		Issue:               issue,
		SourceOrderRevision: 1,
		TargetOrderRevision: 1,
		BoardView:           command.Nullable[command.BoardView]{Value: &boardView},
	}
	check("MoveIssueResult", command.Saved[command.MoveResult]{Result: move})
	check("ReorderIssueResult", command.Saved[command.MoveResult]{Result: move})
	check("Failure", issues.IssueFailureBody{
		Error: command.Failure{
			Code:        command.Conflict,
			Message:     "Board changed.",
			FieldErrors: []command.FieldError{},
			NextAction:  command.ReloadCurrentState,
		},
		Current: issues.IssueCurrent{Board: &board},
	})
	check("Failure", issues.IssueFailureBody{
		Error: command.Failure{
			Code:        command.Prerequisite,
			Message:     "Finish prerequisites.",
			FieldErrors: []command.FieldError{},
			NextAction:  command.FinishPrerequisites,
		},
		Current: issues.IssueCurrent{Issue: &issue},
		Unfinished: command.Nullable[command.Page[issues.IssueSummary]]{Value: &command.Page[issues.IssueSummary]{
			Items:         []issues.IssueSummary{issue.Summary},
			TotalMatching: 1,
		}},
	})
	encoded, _ := json.Marshal(api.OpenAPI())
	if strings.Contains(string(encoded), "signing-key") {
		t.Fatal("private settings in exported API")
	}
}

func TestConcreteMCPSubsetSchemasAndAnnotationsMatchCatalog(t *testing.T) {
	server, err := app.MCPContracts()
	if err != nil {
		t.Fatal(err)
	}
	left, right := mcp.NewInMemoryTransports()
	ctx := context.Background()
	ss, err := server.Connect(ctx, left, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer ss.Close()
	cs, err := mcp.NewClient(&mcp.Implementation{Name: "catalog", Version: "1"}, nil).Connect(ctx, right, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer cs.Close()
	var tools mcp.ListToolsResult
	var cursor string
	for {
		page, err := cs.ListTools(ctx, &mcp.ListToolsParams{Cursor: cursor})
		if err != nil {
			t.Fatal(err)
		}
		tools.Tools = append(tools.Tools, page.Tools...)
		if page.NextCursor == "" {
			break
		}
		cursor = page.NextCursor
	}
	api, err := app.Contracts()
	if err != nil {
		t.Fatal(err)
	}
	assertLocalSignInContract(t, api)
	names := map[string]bool{}
	for route, path := range api.OpenAPI().Paths {
		for _, op := range []*huma.Operation{path.Get, path.Post, path.Put, path.Patch} {
			if op != nil {
				if isAccountTokenOperation(op.OperationID, route) || op == path.Post && isPasswordSignIn(op.OperationID, route) {
					continue
				}
				names[op.OperationID] = true
			}
		}
	}
	if len(tools.Tools) != len(names) {
		t.Fatal("REST/MCP provider mismatch")
	}
	for _, tool := range tools.Tools {
		if !names[tool.Name] || tool.Name == "act_as" || tool.Name == "send_notification" || strings.Contains(tool.Name, "sql") {
			t.Fatal("unapproved tool", tool.Name)
		}
		delete(names, tool.Name)
		mutation := command.Operation(tool.Name).IsMutation()
		if tool.Annotations == nil || tool.Annotations.ReadOnlyHint == mutation || tool.Annotations.IdempotentHint != mutation || tool.Annotations.OpenWorldHint == nil || *tool.Annotations.OpenWorldHint || tool.Annotations.DestructiveHint == nil {
			t.Fatal("dishonest annotation", tool.Name)
		}
		for _, raw := range []any{tool.InputSchema, tool.OutputSchema} {
			encoded, err := json.Marshal(raw)
			if err != nil {
				t.Fatal(err)
			}
			var schema jsonschema.Schema
			if json.Unmarshal(encoded, &schema) != nil {
				t.Fatal("nonconcrete schema")
			}
			if _, err := schema.Resolve(nil); err != nil {
				t.Fatal("non-self-contained schema", tool.Name, err)
			}
		}
		encoded, _ := json.Marshal(tool.InputSchema)
		var input struct {
			Additional json.RawMessage            `json:"additionalProperties"`
			Properties map[string]json.RawMessage `json:"properties"`
			Required   []string                   `json:"required"`
		}
		if json.Unmarshal(encoded, &input) != nil || string(input.Additional) != "false" {
			t.Fatal("unknown fields permitted", tool.Name)
		}
		_, retry := input.Properties["retryReference"]
		if retry != mutation {
			t.Fatal("retry contract mismatch", tool.Name)
		}
		for _, authority := range []string{"callerId", "actorId", "administrator", "actAs", "accessToken", "sql"} {
			if _, exists := input.Properties[authority]; exists && !(authority == "administrator" && (tool.Name == "approve_user" || tool.Name == "update_user")) {
				t.Fatal("caller authority in tool", tool.Name, authority)
			}
		}
		if mutation {
			found := false
			for _, name := range input.Required {
				found = found || name == "retryReference"
			}
			if !found {
				t.Fatal("optional mutation retry", tool.Name)
			}
		}
	}
	if len(names) != 0 {
		t.Fatal("missing tools")
	}
}
