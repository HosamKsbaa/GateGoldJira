package integrations_test

import (
	"context"
	"encoding/json"
	"errors"
	"gategoldjira/backend/db/migrations"
	"gategoldjira/backend/internal/features/activity"
	"gategoldjira/backend/internal/features/integrations"
	"gategoldjira/backend/internal/features/issues"
	"gategoldjira/backend/internal/features/projects"
	"gategoldjira/backend/internal/platform/auth"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/httpapi"
	"gategoldjira/backend/internal/platform/mcpapi"
	"gategoldjira/backend/tests/testenv"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

type fixture struct {
	s                               *integrations.Service
	issues                          *issues.Service
	pool                            *pgxpool.Pool
	project                         command.ProjectID
	owner, member, viewer, outsider command.Actor
}

func integrationDatabase(t *testing.T) fixture {
	t.Helper()
	ctx := context.Background()
	pool := testenv.Database(t)
	if err := migrations.Apply(ctx, pool); err != nil {
		t.Fatal(err)
	}
	signer, _ := command.NewCursorSigner([]byte(strings.Repeat("t", 32)))
	runner := command.Runner{Pool: pool}
	f := fixture{s: integrations.New(runner, signer), issues: issues.New(runner, signer), pool: pool}
	f.issues.WithStageRule(integrations.ApplyStageRule)
	for i, actor := range []*command.Actor{&f.owner, &f.member, &f.viewer, &f.outsider} {
		*actor = command.Actor{
			UserID:  command.NewID[command.UserKind](),
			Channel: command.REST,
			Today:   command.Today(time.Now(), time.UTC),
		}
		if _, err := pool.Exec(ctx, "INSERT INTO users(id,email,email_key,display_name,approved_at,is_administrator)VALUES($1,$2,$2,$3,now(),$4)", actor.UserID.UUID, []string{
			"admin@tests.example",
			"member@tests.example",
			"viewer@tests.example",
			"stranger@tests.example",
		}[i], []string{"Owner", "مطور", "Viewer", "Stranger"}[i], i == 0); err != nil {
			t.Fatal(err)
		}
	}
	created, err := projects.New(runner, signer).Create(ctx, f.owner, projects.CreateInput{
		Key:            "INT",
		Name:           "Integrations",
		RetryReference: uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	f.project = created.Body.Result.ID
	for _, membership := range []struct {
		actor command.Actor
		role  string
	}{{f.member, "member"}, {f.viewer, "viewer"}} {
		if _, err := pool.Exec(ctx, "INSERT INTO project_memberships(project_id,user_id,role)VALUES($1,$2,$3)", f.project.UUID, membership.actor.UserID.UUID, membership.role); err != nil {
			t.Fatal(err)
		}
	}
	return f
}
func (f fixture) issue(t *testing.T) command.IssueID {
	t.Helper()
	out, err := f.issues.Create(context.Background(), f.owner, issues.CreateInput{
		ProjectID: f.project,
		CreateIssueFields: issues.CreateIssueFields{
			Title:    "Review API",
			Type:     command.Task,
			Priority: command.Medium,
			LabelIDs: []command.LabelID{},
		},
		RetryReference: uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	return out.Body.Result.Summary.ID
}
func code(err error) command.FailureCode {
	var failure *command.Failure
	if errors.As(err, &failure) {
		return failure.Code
	}
	return ""
}
func TestDevelopmentLinkValidationPermissionsRetryAndPagination(t *testing.T) {
	f := integrationDatabase(t)
	ctx := context.Background()
	issue := f.issue(t)
	input := integrations.DevelopmentLinkInput{
		IssueID: issue,
		LinkID:  command.NewID[integrations.LinkMarker](),
		DevelopmentLinkFields: integrations.DevelopmentLinkFields{
			Title: "مراجعة",
			URL:   "https://github.com/company/project/pull/123",
			Kind:  integrations.PullRequest,
		},
		RetryReference: uuid.NewString(),
	}
	first, err := f.s.SaveLink(ctx, f.member, input)
	if err != nil || first.HTTPStatus != 201 || first.Body.Receipt.EventID == nil {
		t.Fatal("link creation", err)
	}
	actor := f.member
	actor.Channel = command.MCP
	replay, err := f.s.SaveLink(ctx, actor, input)
	if err != nil || !replay.Body.Receipt.Replayed || replay.Body.Result.ID != first.Body.Result.ID {
		t.Fatal("link replay", err)
	}
	for _, bad := range []string{
		"javascript:alert(1)",
		"file:///tmp/file",
		"https://password:secret@example.com/",
		"https://example.com/\nsecret",
		"/relative",
	} {
		input.URL = bad
		input.RetryReference = uuid.NewString()
		if _, err := f.s.SaveLink(ctx, f.member, input); code(err) != command.Validation {
			t.Fatal("unsafe url accepted", bad, err)
		}
	}
	input.URL = first.Body.Result.URL
	input.RetryReference = uuid.NewString()
	if _, err := f.s.SaveLink(ctx, f.viewer, input); code(err) != command.Forbidden {
		t.Fatal("viewer mutated", err)
	}
	if _, err := f.s.ListLinks(ctx, f.outsider, integrations.DevelopmentListInput{IssueID: issue}); code(err) != command.Unavailable {
		t.Fatal("outsider read", err)
	}
	for i := 0; i < 4; i++ {
		input.LinkID = command.NewID[integrations.LinkMarker]()
		input.RetryReference = uuid.NewString()
		if _, err := f.s.SaveLink(ctx, f.member, input); err != nil {
			t.Fatal(err)
		}
	}
	limit := 2
	search := integrations.DevelopmentListInput{IssueID: issue, Page: command.PageRequest{Limit: &limit}}
	seen := map[integrations.LinkID]bool{}
	for {
		page, err := f.s.ListLinks(ctx, f.viewer, search)
		if err != nil || page.TotalMatching != 5 {
			t.Fatal("page", err)
		}
		for _, view := range page.Items {
			if seen[view.ID] {
				t.Fatal("duplicate")
			}
			seen[view.ID] = true
		}
		if page.NextCursor == nil {
			break
		}
		search.Page.Cursor = page.NextCursor
	}
	if len(seen) != 5 {
		t.Fatal("missing links")
	}
	input.LinkID = first.Body.Result.ID
	input.ExpectedRevision = 1
	input.Removed = true
	input.RetryReference = uuid.NewString()
	removed, err := f.s.SaveLink(ctx, f.member, input)
	if err != nil || !removed.Body.Result.Removed || removed.Body.Result.Revision != 2 {
		t.Fatal("remove", err)
	}
	input.RetryReference = uuid.NewString()
	if _, err = f.s.SaveLink(ctx, f.member, input); code(err) != command.Conflict {
		t.Fatal("stale link accepted", err)
	}
	if _, err := f.pool.Exec(ctx, "UPDATE project_memberships SET removed_at=now() WHERE project_id=$1 AND user_id=$2", f.project.UUID, f.member.UserID.UUID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.s.SaveLink(ctx, actor, input); code(err) != command.Unavailable {
		t.Fatal("revoked replay", err)
	}
}
func TestStageRulesApplyAtomicallyNotifyAndSkipRevokedAssignee(t *testing.T) {
	f := integrationDatabase(t)
	ctx := context.Background()
	issue := f.issue(t)
	rule := integrations.AutomationRuleInput{
		ProjectID: f.project,
		RuleID:    command.NewID[integrations.RuleMarker](),
		AutomationRuleFields: integrations.AutomationRuleFields{
			Name:       "Review owner",
			Stage:      command.Review,
			AssigneeID: f.member.UserID,
			Enabled:    true,
		},
		RetryReference: uuid.NewString(),
	}
	if _, err := f.s.SaveRule(ctx, f.member, rule); code(err) != command.Forbidden {
		t.Fatal("member managed rule", err)
	}
	first, err := f.s.SaveRule(ctx, f.owner, rule)
	if err != nil || first.Body.Result.Assignee.ID != f.member.UserID {
		t.Fatal("create rule", err)
	}
	duplicate := rule
	duplicate.RuleID = command.NewID[integrations.RuleMarker]()
	duplicate.RetryReference = uuid.NewString()
	if _, err := f.s.SaveRule(ctx, f.owner, duplicate); code(err) != command.Validation {
		t.Fatal("two rules same stage", err)
	}
	duplicate.Stage = command.Status("review:" + uuid.NewString())
	if _, err := f.s.SaveRule(ctx, f.owner, duplicate); code(err) != command.Validation {
		t.Fatal("unregistered stage accepted", err)
	}
	current, err := f.issues.Get(ctx, f.owner, issue)
	if err != nil {
		t.Fatal(err)
	}
	input := issues.MoveInput{
		IssueID:                     issue,
		ExpectedRevision:            current.Summary.Revision,
		TargetStatus:                command.Review,
		ExpectedSourceOrderRevision: current.SourceOrderRevision,
		ExpectedTargetOrderRevision: current.OrderRevisions[2].Revision,
		RetryReference:              uuid.NewString(),
	}
	moved, err := f.issues.Move(ctx, f.owner, input)
	if err != nil || moved.Body.Result.Issue.Summary.Assignee.Value == nil || moved.Body.Result.Issue.Summary.Assignee.Value.ID != f.member.UserID {
		t.Fatal("stage hook did not assign", err)
	}
	var notifications int
	if err := f.pool.QueryRow(ctx, "SELECT count(*) FROM notifications WHERE issue_id=$1 AND recipient_id=$2 AND 'assignment'=ANY(reasons)", issue.UUID, f.member.UserID.UUID).Scan(&notifications); err != nil || notifications != 1 {
		t.Fatal("assignment notification", notifications, err)
	}
	replay, err := f.issues.Move(ctx, f.owner, input)
	if err != nil || !replay.Body.Receipt.Replayed {
		t.Fatal("move retry", err)
	}
	var events int
	if err := f.pool.QueryRow(ctx, "SELECT count(*) FROM activity_events WHERE issue_id=$1 AND action='save_automation_rule'", issue.UUID).Scan(&events); err != nil || events != 1 {
		t.Fatal("rule event duplicated", events, err)
	}
	signer, _ := command.NewCursorSigner([]byte(strings.Repeat("h", 32)))
	kind := activity.IssueResource
	resource := activity.ResourceID{UUID: issue.UUID}
	history, err := activity.New(command.Runner{Pool: f.pool}, signer).List(ctx, f.owner, activity.ListInput{ResourceKind: &kind, ResourceID: &resource})
	if err != nil {
		t.Fatal("assignment history unavailable", err)
	}
	matched := false
	for _, event := range history.Items {
		if event.Action != string(command.SaveAutomationRule) {
			continue
		}
		if event.ActionSummary != "assigned the issue using an assignment rule" {
			t.Fatal("automatic assignment was described as a rule edit")
		}
		for _, change := range event.Changes {
			if change.Field == "automationRule" && change.After != nil && *change.After == rule.RuleID.String()+" | "+rule.Name {
				matched = true
			}
		}
	}
	if !matched {
		t.Fatal("automatic assignment omitted the matched rule from history")
	}
	if _, err := f.pool.Exec(ctx, "UPDATE users SET disabled_at=now() WHERE id=$1", f.member.UserID.UUID); err != nil {
		t.Fatal(err)
	}
	issue2 := f.issue(t)
	second, err := f.issues.Get(ctx, f.owner, issue2)
	if err != nil {
		t.Fatal(err)
	}
	input = issues.MoveInput{
		IssueID:                     issue2,
		ExpectedRevision:            second.Summary.Revision,
		TargetStatus:                command.Review,
		ExpectedSourceOrderRevision: second.SourceOrderRevision,
		ExpectedTargetOrderRevision: second.OrderRevisions[2].Revision,
		RetryReference:              uuid.NewString(),
	}
	moved, err = f.issues.Move(ctx, f.owner, input)
	if err != nil || moved.Body.Result.Issue.Summary.Assignee.Value != nil {
		t.Fatal("disabled person assigned", err)
	}
	rule.ExpectedRevision = 1
	rule.Enabled = false
	rule.RetryReference = uuid.NewString()
	if _, err := f.s.SaveRule(ctx, f.owner, rule); err != nil {
		t.Fatal("could not disable orphaned rule", err)
	}
}
func TestIntegrationRESTMCPShareSchemasAndSavedOutcome(t *testing.T) {
	f := integrationDatabase(t)
	ctx := context.Background()
	issue := f.issue(t)
	mux := http.NewServeMux()
	api := httpapi.New(mux)
	integrations.RegisterHTTP(api, f.s)
	server := mcpapi.New()
	if err := integrations.RegisterMCP(server, f.s); err != nil {
		t.Fatal(err)
	}
	st, ct := mcp.NewInMemoryTransports()
	actor := f.member
	actor.Channel = command.MCP
	ss, err := server.Connect(auth.WithActor(ctx, actor), st, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer ss.Close()
	client, err := mcp.NewClient(&mcp.Implementation{Name: "integration-test", Version: "1"}, nil).Connect(ctx, ct, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()
	tools, err := client.ListTools(ctx, nil)
	if err != nil || len(tools.Tools) != 4 {
		t.Fatal("tool catalog", err)
	}
	input := integrations.DevelopmentLinkInput{
		IssueID: issue,
		LinkID:  command.NewID[integrations.LinkMarker](),
		DevelopmentLinkFields: integrations.DevelopmentLinkFields{
			Title: "Commit",
			URL:   "https://example.org/commit/abc",
			Kind:  integrations.Commit,
		},
		RetryReference: uuid.NewString(),
	}
	out, err := client.CallTool(ctx, &mcp.CallToolParams{Name: "save_development_link", Arguments: input})
	if err != nil || out.IsError {
		t.Fatal("MCP link", err)
	}
	body, _ := json.Marshal(input.DevelopmentLinkFields)
	request := httptest.NewRequest("PUT", "/api/v1/issues/"+issue.String()+"/development-links/"+input.LinkID.String(), strings.NewReader(string(body)))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Idempotency-Key", input.RetryReference)
	request = request.WithContext(auth.WithActor(ctx, f.member))
	recorder := httptest.NewRecorder()
	mux.ServeHTTP(recorder, request)
	var result command.Saved[integrations.DevelopmentLinkView]
	if recorder.Code != 201 || json.Unmarshal(recorder.Body.Bytes(), &result) != nil || !result.Receipt.Replayed || result.Result.ID != input.LinkID {
		t.Fatal("REST MCP replay mismatch", recorder.Code, recorder.Body.String())
	}
}

func TestDevelopmentLinkKindChangesRemainInAudit(t *testing.T) {
	f := integrationDatabase(t)
	ctx := context.Background()
	input := integrations.DevelopmentLinkInput{
		IssueID: f.issue(t),
		LinkID:  command.NewID[integrations.LinkMarker](),
		DevelopmentLinkFields: integrations.DevelopmentLinkFields{
			Title: "Related development",
			URL:   "https://example.com/development/123",
			Kind:  integrations.PullRequest,
		},
		RetryReference: uuid.NewString(),
	}
	first, err := f.s.SaveLink(ctx, f.member, input)
	if err != nil {
		t.Fatal(err)
	}
	input.ExpectedRevision = command.InitialRevision(first.Body.Result.Revision)
	input.Kind = integrations.Commit
	input.RetryReference = uuid.NewString()
	changed, err := f.s.SaveLink(ctx, f.member, input)
	if err != nil || changed.Body.Receipt.EventID == nil || changed.Body.Result.Kind != integrations.Commit {
		t.Fatal("link kind did not change", err)
	}
	var before, after string
	if err := f.pool.QueryRow(ctx, "SELECT changes->'fields'->0->>'before',changes->'fields'->0->>'after' FROM activity_events WHERE id=$1", *changed.Body.Receipt.EventID).Scan(&before, &after); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(before, "pull_request") || !strings.Contains(after, "commit") || before == after {
		t.Fatal("link classification change disappeared from retained history", before, after)
	}
}
