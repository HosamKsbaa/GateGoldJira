package identity

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"gategoldjira/backend/db/migrations"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/tests/testenv"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type identityFixture struct {
	service               *Service
	pool                  *pgxpool.Pool
	owner, member, viewer command.Actor
	project               command.ProjectID
	issue                 command.IssueID
}

func identityDatabase(t *testing.T) identityFixture {
	t.Helper()
	ctx := context.Background()
	pool := testenv.Database(t)
	if err := migrations.Apply(ctx, pool); err != nil {
		t.Fatal(err)
	}
	signer, _ := command.NewCursorSigner([]byte(strings.Repeat("s", 32)))
	location, _ := time.LoadLocation("Africa/Cairo")
	fixture := identityFixture{
		service: New(command.Runner{Pool: pool}, signer, location, "https://issuer.test/"),
		pool:    pool,
		project: command.NewID[command.ProjectKind](),
		issue:   command.NewID[command.IssueKind](),
	}
	actors := []*command.Actor{&fixture.owner, &fixture.member, &fixture.viewer}
	for i, actor := range actors {
		*actor = command.Actor{
			UserID:  command.NewID[command.UserKind](),
			Channel: command.REST,
			Today:   command.Today(time.Now(), location),
		}
		if _, err := pool.Exec(ctx, "INSERT INTO users(id,email,email_key,display_name,approved_at,is_administrator) VALUES($1,$2,$2,$3,now(),$4)", actor.UserID.UUID, []string{
			"owner@example.test",
			"member@example.test",
			"viewer@example.test",
		}[i], []string{"Owner", "عضو", "Viewer"}[i], i == 0); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := pool.Exec(ctx, "INSERT INTO projects(id,key,name,created_by) VALUES($1,'GG','Project',$2)", fixture.project.UUID, fixture.owner.UserID.UUID); err != nil {
		t.Fatal(err)
	}
	for i, role := range []string{"member", "viewer"} {
		if _, err := pool.Exec(ctx, "INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,$3)", fixture.project.UUID, actors[i+1].UserID.UUID, role); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := pool.Exec(ctx, "INSERT INTO issues(id,project_id,number,title,reporter_id,assignee_id,rank) VALUES($1,$2,1,'Work',$3,$3,1024)", fixture.issue.UUID, fixture.project.UUID, fixture.member.UserID.UUID); err != nil {
		t.Fatal(err)
	}
	return fixture
}
func TestApprovalOneTimeBindingAndCrossChannelReplay(t *testing.T) {
	f := identityDatabase(t)
	ctx := context.Background()
	input := ApproveInput{
		Email:          " New@Example.test ",
		DisplayName:    "مطور جديد",
		Administrator:  false,
		RetryReference: uuid.NewString(),
	}
	first, err := f.service.ApproveUser(ctx, f.owner, input)
	if err != nil {
		t.Fatal(err)
	}
	mcpActor := f.owner
	mcpActor.Channel = command.MCP
	replay, err := f.service.ApproveUser(ctx, mcpActor, input)
	if err != nil || replay.Body.Result.ID != first.Body.Result.ID || !replay.Body.Receipt.Replayed || first.Body.Receipt.Replayed || replay.Body.Receipt.EventID == nil || *replay.Body.Receipt.EventID != *first.Body.Receipt.EventID {
		t.Fatal("approval retry changed its outcome", err)
	}
	email := "new@example.test"
	identity := command.ProviderIdentity{Issuer: "https://issuer.test/", Subject: "human|new", VerifiedEmail: &email}
	id, err := f.service.Resolve(ctx, identity)
	if err != nil || id != first.Body.Result.ID {
		t.Fatal("approved binding failed", err)
	}
	identity.VerifiedEmail = nil
	if got, err := f.service.Resolve(ctx, identity); err != nil || got != id {
		t.Fatal("existing binding depended on email", err)
	}
	identity.Subject = "another|human"
	identity.VerifiedEmail = &email
	if _, err := f.service.Resolve(ctx, identity); err == nil {
		t.Fatal("account rebound to another subject")
	}
	unknown := "unknown@example.test"
	if _, err := f.service.Resolve(ctx, command.ProviderIdentity{
		Issuer:        identity.Issuer,
		Subject:       "unknown",
		VerifiedEmail: &unknown,
	}); err == nil {
		t.Fatal("public registration occurred")
	}
}
func TestDisableClearsAssignmentsButPreservesMembershipsAndAttribution(t *testing.T) {
	f := identityDatabase(t)
	ctx := context.Background()
	input := UpdateUserInput{
		UserID:           f.member.UserID,
		ExpectedRevision: 1,
		Email:            "member@example.test",
		DisplayName:      "عضو",
		Active:           false,
		Administrator:    false,
		RetryReference:   uuid.NewString(),
	}
	changed, err := f.service.UpdateUser(ctx, f.owner, input)
	if err != nil || changed.Body.Result.Active {
		t.Fatal(err)
	}
	var assignee *uuid.UUID
	var reporter uuid.UUID
	var revision int64
	if err := f.pool.QueryRow(ctx, "SELECT assignee_id,reporter_id,revision FROM issues WHERE id=$1", f.issue.UUID).Scan(&assignee, &reporter, &revision); err != nil || assignee != nil || reporter != f.member.UserID.UUID || revision != 2 {
		t.Fatal("assignment cleanup changed attribution or lost revision", err)
	}
	var count int
	if err := f.pool.QueryRow(ctx, "SELECT count(*) FROM project_memberships WHERE user_id=$1 AND removed_at IS NULL", f.member.UserID.UUID).Scan(&count); err != nil || count != 1 {
		t.Fatal("disable erased membership")
	}
	if _, err := f.service.GetMe(ctx, f.member); err == nil {
		t.Fatal("disabled caller read company state")
	}
	input.Active = true
	input.ExpectedRevision = 2
	input.RetryReference = uuid.NewString()
	if _, err := f.service.UpdateUser(ctx, f.owner, input); err != nil {
		t.Fatal(err)
	}
	if err := f.pool.QueryRow(ctx, "SELECT assignee_id FROM issues WHERE id=$1", f.issue.UUID).Scan(&assignee); err != nil || assignee != nil {
		t.Fatal("restore reassigned old work")
	}
	input.ExpectedRevision = 1
	input.RetryReference = uuid.NewString()
	if _, err := f.service.UpdateUser(ctx, f.owner, input); err == nil {
		t.Fatal("stale user update accepted")
	}
}
func TestLastAdministratorRaceCannotRemoveBoth(t *testing.T) {
	f := identityDatabase(t)
	ctx := context.Background()
	second, err := f.service.ApproveUser(ctx, f.owner, ApproveInput{
		Email:          "second@example.test",
		DisplayName:    "Second",
		Administrator:  true,
		RetryReference: uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	actors := []command.Actor{f.owner, {UserID: second.Body.Result.ID, Channel: command.MCP, Today: f.owner.Today}}
	var wait sync.WaitGroup
	outcomes := make(chan error, 2)
	for i, actor := range actors {
		wait.Add(1)
		go func(index int, actor command.Actor) {
			defer wait.Done()
			_, err := f.service.UpdateUser(ctx, actor, UpdateUserInput{
				UserID:           actor.UserID,
				ExpectedRevision: 1,
				Email:            []string{"owner@example.test", "second@example.test"}[index],
				DisplayName:      "Admin",
				Active:           false,
				Administrator:    false,
				RetryReference:   uuid.NewString(),
			})
			outcomes <- err
		}(i, actor)
	}
	wait.Wait()
	close(outcomes)
	success := 0
	for err := range outcomes {
		if err == nil {
			success++
		} else {
			var failure *command.Failure
			if !errors.As(err, &failure) {
				t.Fatal("unsafe failure", err)
			}
		}
	}
	if success != 1 {
		t.Fatalf("expected one guarded removal, got %d", success)
	}
	var count int
	if err := f.pool.QueryRow(ctx, "SELECT count(*) FROM users WHERE is_administrator AND approved_at IS NOT NULL AND disabled_at IS NULL").Scan(&count); err != nil || count != 1 {
		t.Fatal("last Administrator lost")
	}
}
func TestMembershipTombstoneAndCandidatePrivacy(t *testing.T) {
	f := identityDatabase(t)
	ctx := context.Background()
	removed, err := f.service.RemoveMembership(ctx, f.owner, RemoveMembershipInput{
		ProjectID:        f.project,
		UserID:           f.member.UserID,
		ExpectedRevision: 1,
		RetryReference:   uuid.NewString(),
	})
	if err != nil || !removed.Body.Result.Removed || removed.Body.Result.Revision != 2 {
		t.Fatal("membership removal", err)
	}
	if _, err := f.service.SetMembership(ctx, f.owner, SetMembershipInput{
		ProjectID:        f.project,
		UserID:           f.member.UserID,
		ExpectedRevision: 0,
		Role:             command.Member,
		RetryReference:   uuid.NewString(),
	}); err == nil {
		t.Fatal("tombstone lost optimistic protection")
	}
	if _, err := f.service.SetMembership(ctx, f.owner, SetMembershipInput{
		ProjectID:        f.project,
		UserID:           f.member.UserID,
		ExpectedRevision: 2,
		Role:             command.Member,
		RetryReference:   uuid.NewString(),
	}); err != nil {
		t.Fatal(err)
	}
	assignees, err := f.service.ListAssignees(ctx, f.viewer, CandidateInput{ProjectID: f.project})
	if err != nil || len(assignees.Items) != 2 {
		t.Fatal("assignee eligibility", err)
	}
	mentions, err := f.service.ListMentionCandidates(ctx, f.viewer, CandidateInput{ProjectID: f.project})
	if err != nil || len(mentions.Items) != 3 {
		t.Fatal("mention eligibility", err)
	}
	if _, err := f.service.ListUsers(ctx, f.viewer, command.PageRequest{}); err == nil {
		t.Fatal("Viewer listed private user records")
	}
}
