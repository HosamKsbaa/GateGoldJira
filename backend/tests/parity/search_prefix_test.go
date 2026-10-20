package parity

import (
	"net/http"
	"testing"

	"gategoldjira/backend/internal/features/identity"
	"gategoldjira/backend/internal/features/issues"
	"gategoldjira/backend/internal/features/projects"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/httpapi"
	"gategoldjira/backend/tests/testapp"
	"github.com/google/uuid"
)

func TestIssueKeyPrefixesKeepExactKeysPaginationAndAccessAcrossRESTAndMCP(t *testing.T) {
	r := testapp.NewRuntime(t)
	admin := reference(t, r, r.Admin)
	project := call[projects.CreateInput, command.Saved[projects.ProjectView], httpapi.FailureBody](t, admin, command.CreateProject, projects.CreateInput{
		Key:            "DEMO",
		Name:           "Search audit",
		RetryReference: uuid.NewString(),
	})
	if !project.OK {
		t.Fatal("create project")
	}
	id := project.Data.Result.ID
	membership := call[identity.SetMembershipInput, command.Saved[identity.MembershipView], httpapi.FailureBody](t, admin, command.SetMembership, identity.SetMembershipInput{
		ProjectID:      id,
		UserID:         r.Member,
		Role:           command.Member,
		RetryReference: uuid.NewString(),
	})
	if !membership.OK {
		t.Fatal("create membership")
	}
	for range 12 {
		created, status := rest[issues.CreateIssueFields, command.Saved[issues.IssueView]](t, r, r.Member, http.MethodPost, "/projects/"+id.String()+"/issues", uuid.NewString(), issues.CreateIssueFields{Title: "API contract عربي"})
		if status != 201 || created.Result.Summary.ProjectID != id {
			t.Fatal("create fixture", status)
		}
	}
	member := reference(t, r, r.Member)
	for _, query := range []string{"de", "DEMO", "demo-", "  de  ", "عربي"} {
		t.Run(query, func(t *testing.T) {
			limit := 5
			input := issues.SearchInput{Filters: command.IssueFilter{Query: &query}, Page: command.PageRequest{Limit: &limit}}
			seen := map[command.IssueID]bool{}
			for {
				page, status := rest[issues.SearchInput, command.Page[issues.IssueSummary]](t, r, r.Member, http.MethodPost, "/issues/search", "", input)
				if status != 200 || page.TotalMatching != 12 {
					t.Fatal("search count", status, page.TotalMatching)
				}
				mcp := call[issues.SearchInput, command.Page[issues.IssueSummary], issues.IssueFailureBody](t, member, command.SearchIssues, input)
				if !mcp.OK || mcp.Data.TotalMatching != page.TotalMatching || len(mcp.Data.Items) != len(page.Items) {
					t.Fatal("transport search mismatch")
				}
				for index, issue := range page.Items {
					if seen[issue.ID] || mcp.Data.Items[index].ID != issue.ID {
						t.Fatal("duplicate or mismatched page")
					}
					seen[issue.ID] = true
				}
				if page.NextCursor == nil {
					break
				}
				input.Page.Cursor = page.NextCursor
			}
			if len(seen) != 12 {
				t.Fatal("missing results")
			}
		})
	}
	for _, entry := range []struct {
		query string
		count int32
	}{{"demo-1", 1}, {"de%", 0}, {"de_", 0}, {"not-found", 0}} {
		page, status := rest[issues.SearchInput, command.Page[issues.IssueSummary]](t, r, r.Member, http.MethodPost, "/issues/search", "", issues.SearchInput{Filters: command.IssueFilter{Query: &entry.query}})
		if status != 200 || page.TotalMatching != entry.count {
			t.Fatal("exact/literal search", entry.query, status, page.TotalMatching)
		}
	}
	query := "de"
	denied, status := rest[issues.SearchInput, command.Page[issues.IssueSummary]](t, r, r.Viewer, http.MethodPost, "/issues/search", "", issues.SearchInput{Filters: command.IssueFilter{Query: &query}})
	if status != 200 || denied.TotalMatching != 0 || len(denied.Items) != 0 {
		t.Fatal("prefix leaked project without membership")
	}
}
