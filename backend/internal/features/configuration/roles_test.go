package configuration

import (
	"context"
	"gategoldjira/backend/internal/features/identity"
	"gategoldjira/backend/internal/features/issues"
	"gategoldjira/backend/internal/platform/command"
	"github.com/google/uuid"
	"testing"
	"time"
)

func TestProjectAdminConfiguresOnlyItsProjectAndRetainsWorkEligibility(t *testing.T) {
	f := configurationFixture(t)
	ctx := context.Background()
	signer, _ := command.NewCursorSigner([]byte("project-admin-fixture-cursor-key!!"))
	access := identity.New(command.Runner{Pool: f.pool}, signer, time.UTC, "fixture")
	promoted, err := access.SetMembership(ctx, f.admin, identity.SetMembershipInput{
		ProjectID:        f.project,
		UserID:           f.member.UserID,
		ExpectedRevision: 1,
		Role:             command.Role("project_admin"),
		RetryReference:   uuid.NewString(),
	})
	if err != nil {
		t.Fatal("promote", err)
	}
	view, err := f.service.Get(ctx, f.member, GetInput{f.project})
	if err != nil || !view.CanManage {
		t.Fatal("own project config", view, err)
	}
	in := SaveTypeInput{
		ProjectID: f.project,
		TypeID:    command.NewID[command.IssueTypeKind](),
		SaveTypeFields: SaveTypeFields{
			ExpectedRevision: 1,
			Key:              "story",
			Name:             "Story",
			Behavior:         Standard,
		},
		RetryReference: uuid.NewString(),
	}
	reference := in.RetryReference
	_, err = f.service.SaveType(ctx, f.member, in)
	if err != nil {
		t.Fatal("project admin taxonomy", err)
	}
	in.ProjectID = f.other
	in.RetryReference = uuid.NewString()
	_, err = f.service.SaveType(ctx, f.member, in)
	expectCode(t, err, command.Unavailable)
	_, err = access.ApproveUser(ctx, f.member, identity.ApproveInput{
		Email:          "new@test.dev",
		DisplayName:    "New",
		RetryReference: uuid.NewString(),
	})
	expectCode(t, err, command.Forbidden)
	directory, err := access.ListMembershipCandidates(ctx, f.member, identity.CandidateInput{ProjectID: f.project})
	if err != nil || directory.TotalMatching != 3 {
		t.Fatal("scoped directory", directory, err)
	}
	_, err = access.ListUsers(ctx, f.member, command.PageRequest{})
	expectCode(t, err, command.Forbidden)
	_, err = access.SetMembership(ctx, f.member, identity.SetMembershipInput{
		ProjectID:      f.other,
		UserID:         f.viewer.UserID,
		Role:           command.Member,
		RetryReference: uuid.NewString(),
	})
	expectCode(t, err, command.Unavailable)
	// Assignment and mentioning use the same checked write-role matrix.
	work := issues.New(command.Runner{Pool: f.pool}, signer)
	saved, err := work.Create(ctx, f.member, issues.CreateInput{
		ProjectID: f.project,
		CreateIssueFields: issues.CreateIssueFields{
			Title:      "Project admin assigned work",
			AssigneeID: &f.member.UserID,
		},
		RetryReference: uuid.NewString(),
	})
	if err != nil {
		t.Fatal("write/assignee eligibility", err)
	}
	candidates, err := access.ListAssignees(ctx, f.viewer, identity.CandidateInput{ProjectID: f.project})
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, person := range candidates.Items {
		found = found || person.ID == f.member.UserID
	}
	if !found {
		t.Fatal("project admin absent from candidates")
	}
	// Promotion between write roles keeps an assignment; downgrade to viewer
	// clears it and immediately revokes configuration and accepted replay access.
	_, err = access.SetMembership(ctx, f.admin, identity.SetMembershipInput{
		ProjectID:        f.project,
		UserID:           f.member.UserID,
		ExpectedRevision: command.InitialRevision(promoted.Body.Result.Revision),
		Role:             command.Viewer,
		RetryReference:   uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	current, err := work.Get(ctx, f.viewer, saved.Body.Result.Summary.ID)
	if err != nil || current.Summary.Assignee.Value != nil {
		t.Fatal("downgrade assignment cleanup", current, err)
	}
	in.ProjectID = f.project
	in.RetryReference = reference
	_, err = f.service.SaveType(ctx, f.member, in)
	expectCode(t, err, command.Forbidden)
}
