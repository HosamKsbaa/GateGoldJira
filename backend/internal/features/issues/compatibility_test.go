package issues

import (
	"context"
	"errors"
	"gategoldjira/backend/internal/platform/command"
	"github.com/google/uuid"
	"testing"
)

func TestLegacyIssueEditorsRequireUpgradeButOriginalAcceptedRetrySurvives(t *testing.T) {
	f := issueDatabase(t)
	ctx := context.Background()
	input := CreateInput{
		ProjectID:         f.project,
		CreateIssueFields: CreateIssueFields{Title: "Accepted before migration"},
		RetryReference:    uuid.NewString(),
	}
	old, err := f.service.Create(ctx, f.member, input)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = f.pool.Exec(ctx, "UPDATE projects SET core_mode='modern' WHERE id=$1", f.project.UUID); err != nil {
		t.Fatal(err)
	}
	replay, err := f.service.Create(ctx, f.member, input)
	if err != nil || !replay.Body.Receipt.Replayed || replay.Body.Result.Summary.ID != old.Body.Result.Summary.ID {
		t.Fatal("original legacy retry changed", err)
	}
	input.RetryReference = uuid.NewString()
	_, err = f.service.Create(ctx, f.member, input)
	var failure *command.Failure
	if !errors.As(err, &failure) || failure.Code != command.Validation || len(failure.FieldErrors) != 1 || failure.FieldErrors[0].Field != "clientVersion" {
		t.Fatal("legacy creation upgrade guidance", err)
	}
	_, err = f.service.Get(ctx, f.member, old.Body.Result.Summary.ID)
	if !errors.As(err, &failure) || failure.Code != command.Validation {
		t.Fatal("lossy legacy read", err)
	}
	_, err = f.service.Update(ctx, f.member, UpdateInput{
		IssueID:          old.Body.Result.Summary.ID,
		ExpectedRevision: old.Body.Result.Summary.Revision,
		Editable:         editable(old.Body.Result),
		RetryReference:   uuid.NewString(),
	})
	if !errors.As(err, &failure) || failure.Code != command.Validation {
		t.Fatal("legacy update bypass", err)
	}
	_, err = f.service.Search(ctx, f.member, SearchInput{Filters: command.IssueFilter{ProjectIDs: []command.ProjectID{f.project}}})
	if !errors.As(err, &failure) || failure.Code != command.Validation {
		t.Fatal("lossy legacy search", err)
	}
	if _, err = f.service.GetModern(ctx, f.member, old.Body.Result.Summary.ID); err != nil {
		t.Fatal("canonical access lost", err)
	}
}
