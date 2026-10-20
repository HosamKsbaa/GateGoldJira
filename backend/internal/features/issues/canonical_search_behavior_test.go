package issues

import (
	"context"
	"errors"
	"testing"

	"gategoldjira/backend/internal/features/configuration"
	"gategoldjira/backend/internal/platform/command"
	"github.com/google/uuid"
)

func TestCanonicalSearchBehaviorFiltersBeforePaginationAcrossQueryPaths(t *testing.T) {
	f := modernIssueFixture(t)
	ctx := context.Background()
	cfg := configuration.New(f.service.runner, f.service.cursors)
	current, err := cfg.Get(ctx, f.owner, configuration.GetInput{ProjectID: f.project})
	if err != nil {
		t.Fatal(err)
	}
	customType := command.NewID[command.IssueTypeKind]()
	_, err = cfg.SaveType(ctx, f.owner, configuration.SaveTypeInput{
		ProjectID: f.project, TypeID: customType,
		SaveTypeFields: configuration.SaveTypeFields{ExpectedRevision: current.Revision, Key: "story", Name: "قصة", Behavior: configuration.Standard},
		RetryReference: uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	created, err := f.service.CreateModern(ctx, f.member, ModernCreateInput{
		ProjectID: f.project, ModernCreateFields: ModernCreateFields{Title: "Candidate parent", TypeID: &customType}, RetryReference: uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	parent := created.Body.Result.Summary
	other := f.createModern(t, "Candidate second parent").Summary
	for range 3 {
		_, err = f.service.CreateModern(ctx, f.member, ModernCreateInput{
			ProjectID: f.project, ModernCreateFields: ModernCreateFields{Title: "Candidate newer subtask", ParentID: &parent.ID, ExpectedParentRevision: &parent.Revision}, RetryReference: uuid.NewString(),
		})
		if err != nil {
			t.Fatal(err)
		}
	}
	standard, subtask := command.StandardBehavior, command.SubtaskBehavior
	limit := 1
	for _, sample := range []struct {
		name, query string
		sort        command.IssueSort
		total       int
	}{
		{"updated", "", command.SortUpdated, 2},
		{"alternative sort", "", command.SortCreated, 2},
		{"title", "Candidate", command.SortUpdated, 2},
		{"title alternative sort", "Candidate", command.SortPriority, 2},
		{"project prefix", parent.Key[:len(parent.Key)-len(parent.Number.String())], command.SortUpdated, 2},
		{"number", parent.Number.String(), command.SortUpdated, 1},
		{"exact key", parent.Key, command.SortUpdated, 1},
	} {
		t.Run(sample.name, func(t *testing.T) {
			filter := command.IssueFilter{ProjectIDs: []command.ProjectID{f.project}, Query: &sample.query, Sort: sample.sort}
			input := ModernSearchInput{Filters: filter, TypeBehavior: &standard, Page: command.PageRequest{Limit: &limit}}
			seen := map[command.IssueID]bool{}
			for {
				page, searchErr := f.service.SearchModern(ctx, f.member, input)
				if searchErr != nil || int(page.TotalMatching) != sample.total || len(page.Items) != 1 {
					t.Fatalf("bounded standard results: count=%d rows=%d error=%v", page.TotalMatching, len(page.Items), searchErr)
				}
				item := page.Items[0]
				if item.Type.Behavior != standard || seen[item.ID] {
					t.Fatal("wrong behavior or repeated page", item.ID)
				}
				seen[item.ID] = true
				if page.NextCursor == nil {
					break
				}
				if input.Page.Cursor == nil {
					changed := input
					changed.TypeBehavior = &subtask
					changed.Page.Cursor = page.NextCursor
					if _, changedErr := f.service.SearchModern(ctx, f.member, changed); changedErr == nil {
						t.Fatal("cursor accepted a changed behavior filter")
					}
				}
				input.Page.Cursor = page.NextCursor
			}
			if len(seen) != sample.total {
				t.Fatal("incomplete pages", len(seen))
			}
			if sample.total == 2 && (!seen[parent.ID] || !seen[other.ID]) {
				t.Fatal("custom standard parent was hidden")
			}
		})
	}
	children, err := f.service.SearchModern(ctx, f.member, ModernSearchInput{Filters: command.IssueFilter{ProjectIDs: []command.ProjectID{f.project}}, TypeBehavior: &subtask, Page: command.PageRequest{Limit: &limit}})
	if err != nil || children.TotalMatching != 3 || len(children.Items) != 1 || children.Items[0].Type.Behavior != subtask {
		t.Fatal("subtask filtering", children, err)
	}
	unfiltered, err := f.service.SearchModern(ctx, f.member, ModernSearchInput{Filters: command.IssueFilter{ProjectIDs: []command.ProjectID{f.project}}})
	if err != nil || unfiltered.TotalMatching != 5 {
		t.Fatal("omitted behavior changed existing search", unfiltered, err)
	}
}

func TestCanonicalSearchRejectsInvalidBehaviorBeforeDatabaseAccess(t *testing.T) {
	invalid := command.IssueBehavior("bug")
	_, err := (&Service{}).SearchModern(context.Background(), command.Actor{}, ModernSearchInput{TypeBehavior: &invalid})
	var failure *command.Failure
	if !errors.As(err, &failure) || failure.Code != command.Validation || len(failure.FieldErrors) != 1 || failure.FieldErrors[0].Field != "typeBehavior" {
		t.Fatal("expected typed behavior validation", err)
	}
}
