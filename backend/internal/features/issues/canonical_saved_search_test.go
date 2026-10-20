package issues

import (
	"context"
	"gategoldjira/backend/internal/platform/command"
	"github.com/google/uuid"
	"testing"
)

func TestNativeSearchRetainsPrivateLegacySavedCategoryFilters(t *testing.T) {
	f := issueDatabase(t)
	ctx := context.Background()
	work := f.create(t, "Saved category work")
	saved, err := f.service.SaveSearch(ctx, f.member, SaveSearchInput{
		SearchID: SavedSearchID{UUID: uuid.New()},
		Name:     "Original task filter",
		Filters: command.IssueFilter{
			ProjectIDs: []command.ProjectID{f.project},
			Types:      []command.IssueType{command.Task},
			Priorities: []command.Priority{command.Medium},
		},
		RetryReference: uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = f.pool.Exec(ctx, "UPDATE projects SET core_mode='modern' WHERE id=$1", f.project.UUID); err != nil {
		t.Fatal(err)
	}
	result, err := f.service.SearchModern(ctx, f.member, ModernSearchInput{Filters: saved.Body.Result.Filters})
	if err != nil || len(result.Items) != 1 || result.Items[0].ID != work.Summary.ID {
		t.Fatal(result, err)
	}
	private, err := f.service.SavedSearches(ctx, f.viewer)
	if err != nil || len(private.Items) != 0 {
		t.Fatal("saved search crossed identity", private, err)
	}
}
