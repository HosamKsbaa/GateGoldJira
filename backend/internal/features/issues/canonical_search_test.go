package issues

import (
	"context"
	"gategoldjira/backend/internal/features/configuration"
	"gategoldjira/backend/internal/platform/command"
	"github.com/google/uuid"
	"testing"
)

func TestCanonicalSearchMatchesChoiceIDsNumberArabicAndPrecisePriorityPages(t *testing.T) {
	f := modernIssueFixture(t)
	ctx := context.Background()
	cfg := configuration.New(f.service.runner, f.service.cursors)
	root, err := cfg.Get(ctx, f.owner, configuration.GetInput{ProjectID: f.project})
	if err != nil {
		t.Fatal(err)
	}
	id := command.NewID[command.PriorityKind]()
	if _, err = cfg.SavePriority(ctx, f.owner, configuration.SavePriorityInput{
		ProjectID:  f.project,
		PriorityID: id,
		SavePriorityFields: configuration.SavePriorityFields{
			ExpectedRevision: root.Revision,
			Key:              "urgent",
			Name:             "عاجل",
			SortOrder:        9007199254740993,
		},
		RetryReference: uuid.NewString(),
	}); err != nil {
		t.Fatal(err)
	}
	plain := f.createModern(t, "Ordinary work")
	urgent, err := f.service.CreateModern(ctx, f.member, ModernCreateInput{
		ProjectID: f.project,
		ModernCreateFields: ModernCreateFields{
			Title:      "مراجعة عاجلة",
			PriorityID: &id,
		},
		RetryReference: uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	query := urgent.Body.Result.Summary.Number.String()
	page, err := f.service.SearchModern(ctx, f.viewer, ModernSearchInput{Filters: command.IssueFilter{
		ProjectIDs:  []command.ProjectID{f.project},
		Query:       &query,
		PriorityIDs: []command.PriorityID{id},
		TypeIDs:     []command.IssueTypeID{urgent.Body.Result.Summary.Type.ID},
		WorkflowIDs: []command.WorkflowID{urgent.Body.Result.Summary.Workflow.ID},
		StageIDs:    []command.StageID{urgent.Body.Result.Summary.Stage.ID},
	}})
	if err != nil || page.TotalMatching != 1 || len(page.Items) != 1 || page.Items[0].ID != urgent.Body.Result.Summary.ID || page.Items[0].Priority.Key != "urgent" {
		t.Fatal("canonical numeric/choice search", page, err)
	}
	query = "مراجعة"
	page, err = f.service.SearchModern(ctx, f.member, ModernSearchInput{Filters: command.IssueFilter{
		ProjectIDs: []command.ProjectID{f.project},
		Query:      &query,
	}})
	if err != nil || page.TotalMatching != 1 || page.Items[0].Priority.ID != id {
		t.Fatal("Arabic canonical search", err)
	}
	limit := 1
	filter := command.IssueFilter{ProjectIDs: []command.ProjectID{f.project}, Sort: command.SortPriority}
	first, err := f.service.SearchModern(ctx, f.member, ModernSearchInput{
		Filters: filter,
		Page:    command.PageRequest{Limit: &limit},
	})
	if err != nil || first.TotalMatching != 2 || first.Items[0].ID != urgent.Body.Result.Summary.ID || first.NextCursor == nil {
		t.Fatal("precise priority first page", first, err)
	}
	next, err := f.service.SearchModern(ctx, f.member, ModernSearchInput{
		Filters: filter,
		Page:    command.PageRequest{Limit: &limit, Cursor: first.NextCursor},
	})
	if err != nil || len(next.Items) != 1 || next.Items[0].ID != plain.Summary.ID || next.NextCursor != nil {
		t.Fatal("priority continuation", next, err)
	}
}
