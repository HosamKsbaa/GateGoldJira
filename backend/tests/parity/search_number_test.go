package parity

import (
	"net/http"
	"strings"
	"testing"

	"gategoldjira/backend/internal/features/identity"
	"gategoldjira/backend/internal/features/issues"
	"gategoldjira/backend/internal/features/projects"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/httpapi"
	"gategoldjira/backend/tests/testapp"
	"github.com/google/uuid"
)

func TestBareIssueNumberSearchKeepsExactMatchesPaginationAndCurrentAccessAcrossRESTAndMCP(t *testing.T) {
	r := testapp.NewRuntime(t)
	admin := reference(t, r, r.Admin)
	member := reference(t, r, r.Member)
	viewer := reference(t, r, r.Viewer)
	projectIDs := make([]command.ProjectID, 0, 3)
	wanted := map[command.IssueID]bool{}
	for index, key := range []string{"NUMA", "NUMB", "PRIVATE"} {
		created := call[projects.CreateInput, command.Saved[projects.ProjectView], httpapi.FailureBody](t, admin, command.CreateProject, projects.CreateInput{
			Key:            key,
			Name:           key + " numeric search",
			RetryReference: uuid.NewString(),
		})
		if !created.OK {
			t.Fatal("create project", created.Error)
		}
		projectID := created.Data.Result.ID
		projectIDs = append(projectIDs, projectID)
		if index < 2 {
			membership := call[identity.SetMembershipInput, command.Saved[identity.MembershipView], httpapi.FailureBody](t, admin, command.SetMembership, identity.SetMembershipInput{
				ProjectID:      projectID,
				UserID:         r.Member,
				Role:           command.Member,
				RetryReference: uuid.NewString(),
			})
			if !membership.OK {
				t.Fatal("grant project", membership.Error)
			}
		}
		count := 2
		if index == 0 {
			count = 12
		}
		for number := 1; number <= count; number++ {
			title := "Exact issue"
			if number == 3 {
				title = "Version 2 عربي ٢ build"
			}
			issue, status := rest[issues.CreateIssueFields, command.Saved[issues.IssueView]](t, r, r.Admin, http.MethodPost, "/projects/"+projectID.String()+"/issues", uuid.NewString(), issues.CreateIssueFields{Title: title})
			if status != 201 || issue.Result.Summary.Number != command.Revision(number) {
				t.Fatal("create numbered issue", status, number)
			}
			if index < 2 && number == 2 {
				wanted[issue.Result.Summary.ID] = true
			}
		}
	}

	for _, query := range []string{"2", "  2  ", "0002"} {
		t.Run(query, func(t *testing.T) {
			limit := 1
			input := issues.SearchInput{Filters: command.IssueFilter{Query: &query}, Page: command.PageRequest{Limit: &limit}}
			seen := map[command.IssueID]bool{}
			pages := 0
			for {
				page, status := rest[issues.SearchInput, command.Page[issues.IssueSummary]](t, r, r.Member, http.MethodPost, "/issues/search", "", input)
				mcp := call[issues.SearchInput, command.Page[issues.IssueSummary], issues.IssueFailureBody](t, member, command.SearchIssues, input)
				if status != 200 || page.TotalMatching != 2 || len(page.Items) != 1 || !mcp.OK || mcp.Data.TotalMatching != page.TotalMatching || len(mcp.Data.Items) != 1 || mcp.Data.Items[0].ID != page.Items[0].ID {
					t.Fatal("numeric search count or transport mismatch", status, page.TotalMatching, mcp.Error)
				}
				item := page.Items[0]
				if !wanted[item.ID] || item.Number != 2 || seen[item.ID] {
					t.Fatal("numeric search returned prefix, title match, private issue or duplicate", item.Key)
				}
				seen[item.ID] = true
				pages++
				if page.NextCursor == nil {
					if mcp.Data.NextCursor != nil {
						t.Fatal("cursor transport mismatch")
					}
					break
				}
				if mcp.Data.NextCursor == nil || pages >= 2 {
					t.Fatal("numeric search did not finish in two pages")
				}
				input.Page.Cursor = page.NextCursor
			}
			if pages != 2 || len(seen) != 2 {
				t.Fatal("missing issue number from another accessible project")
			}
		})
	}

	for _, entry := range []struct {
		query string
		count int32
	}{{"0", 0}, {"0000", 0}, {strings.Repeat("9", 200), 0}, {"numa-2", 1}, {"Version 2", 1}, {"٢", 1}} {
		input := issues.SearchInput{Filters: command.IssueFilter{Query: &entry.query}}
		page, status := rest[issues.SearchInput, command.Page[issues.IssueSummary]](t, r, r.Member, http.MethodPost, "/issues/search", "", input)
		mcp := call[issues.SearchInput, command.Page[issues.IssueSummary], issues.IssueFailureBody](t, member, command.SearchIssues, input)
		if status != 200 || page.TotalMatching != entry.count || len(page.Items) != int(entry.count) || !mcp.OK || mcp.Data.TotalMatching != entry.count || len(mcp.Data.Items) != len(page.Items) {
			t.Fatal("numeric overflow or ordinary literal/key search", entry.query, status, page.TotalMatching, mcp.Error)
		}
	}
	query := "2"
	for index, projectID := range projectIDs {
		input := issues.SearchInput{Filters: command.IssueFilter{Query: &query, ProjectIDs: []command.ProjectID{projectID}}}
		page, status := rest[issues.SearchInput, command.Page[issues.IssueSummary]](t, r, r.Member, http.MethodPost, "/issues/search", "", input)
		mcp := call[issues.SearchInput, command.Page[issues.IssueSummary], issues.IssueFailureBody](t, member, command.SearchIssues, input)
		count := int32(1)
		if index == 2 {
			count = 0
		}
		if status != 200 || page.TotalMatching != count || len(page.Items) != int(count) || !mcp.OK || mcp.Data.TotalMatching != count || len(mcp.Data.Items) != len(page.Items) {
			t.Fatal("current project scope or membership leak", status, page.TotalMatching, mcp.Error)
		}
		for _, item := range page.Items {
			if item.ProjectID != projectID || item.Number != 2 {
				t.Fatal("number search escaped selected project")
			}
		}
	}
	input := issues.SearchInput{Filters: command.IssueFilter{Query: &query}}
	denied, status := rest[issues.SearchInput, command.Page[issues.IssueSummary]](t, r, r.Viewer, http.MethodPost, "/issues/search", "", input)
	mcpDenied := call[issues.SearchInput, command.Page[issues.IssueSummary], issues.IssueFailureBody](t, viewer, command.SearchIssues, input)
	if status != 200 || denied.TotalMatching != 0 || len(denied.Items) != 0 || !mcpDenied.OK || mcpDenied.Data.TotalMatching != 0 || len(mcpDenied.Data.Items) != 0 {
		t.Fatal("bare number leaked an inaccessible project")
	}
	removed := call[identity.RemoveMembershipInput, command.Saved[identity.MembershipView], httpapi.FailureBody](t, admin, command.RemoveMembership, identity.RemoveMembershipInput{
		ProjectID:        projectIDs[1],
		UserID:           r.Member,
		ExpectedRevision: 1,
		RetryReference:   uuid.NewString(),
	})
	if !removed.OK {
		t.Fatal("remove current access", removed.Error)
	}
	after, status := rest[issues.SearchInput, command.Page[issues.IssueSummary]](t, r, r.Member, http.MethodPost, "/issues/search", "", input)
	mcpAfter := call[issues.SearchInput, command.Page[issues.IssueSummary], issues.IssueFailureBody](t, member, command.SearchIssues, input)
	if status != 200 || after.TotalMatching != 1 || len(after.Items) != 1 || after.Items[0].ProjectID != projectIDs[0] || !mcpAfter.OK || mcpAfter.Data.TotalMatching != 1 || len(mcpAfter.Data.Items) != 1 || mcpAfter.Data.Items[0].ID != after.Items[0].ID {
		t.Fatal("numeric search retained revoked project access", status, mcpAfter.Error)
	}
}
