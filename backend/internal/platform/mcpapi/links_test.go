package mcpapi

import (
	"context"
	"testing"

	"gategoldjira/backend/internal/platform/command"
)

func TestBrowserLinksUseConfiguredApplicationOrigin(t *testing.T) {
	issue := command.IssueSummary{ID: command.NewID[command.IssueKind](), Key: "GG-1", Title: "مرحبا"}
	ctx := context.WithValue(context.Background(), applicationURLKey{}, "https://work.example.test")
	links := resultLinks(ctx, command.Saved[command.IssueView]{Result: command.IssueView{Summary: issue}})
	if len(links) != 1 || links[0].URL != "https://work.example.test/issues/"+issue.ID.String() || links[0].Title != "GG-1: مرحبا" {
		t.Fatal("wrong application link", links)
	}
	for _, base := range []string{"", "javascript:alert(1)", "https://user:password@example.test"} {
		ctx := context.WithValue(context.Background(), applicationURLKey{}, base)
		if len(resultLinks(ctx, issue)) != 0 {
			t.Fatal("unsafe application URL accepted")
		}
	}
}
