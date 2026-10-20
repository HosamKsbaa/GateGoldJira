package configuration

import (
	"context"
	"errors"
	"gategoldjira/backend/internal/platform/command"
	"github.com/google/uuid"
	"sync"
	"testing"
)

func activationInput(v ActivationReadiness) ActivateInput {
	return ActivateInput{
		ProjectID: v.Configuration.ProjectID,
		ActivateFields: ActivateFields{
			ExpectedRevision:        v.Configuration.Revision,
			ExpectedProjectRevision: v.ProjectRevision,
			ExpectedBoardID:         v.DefaultBoardID,
			ExpectedBoardRevision:   v.DefaultBoardRevision,
			Confirm:                 true,
		},
		RetryReference: uuid.NewString(),
	}
}
func TestActivationPreservesWorkRejectsStaleReviewAndReplays(t *testing.T) {
	f := configurationFixture(t)
	ctx := context.Background()
	preview, err := f.service.ActivationReadiness(ctx, f.admin, GetInput{f.project})
	if err != nil || !preview.Ready {
		t.Fatal(preview, err)
	}
	stale := activationInput(preview)
	if _, err = f.pool.Exec(ctx, "UPDATE board_records SET revision=revision+1 WHERE project_id=$1", f.project.UUID); err != nil {
		t.Fatal(err)
	}
	if _, err = f.service.Activate(ctx, f.admin, stale); err == nil {
		t.Fatal("stale board review activated")
	}
	preview, err = f.service.ActivationReadiness(ctx, f.admin, GetInput{f.project})
	if err != nil {
		t.Fatal(err)
	}
	input := activationInput(preview)
	saved, err := f.service.Activate(ctx, f.admin, input)
	if err != nil || saved.Body.Result.Mode != Modern || saved.Body.Receipt.EventID == nil {
		t.Fatal(saved, err)
	}
	actor := f.admin
	actor.Channel = command.MCP
	replay, err := f.service.Activate(ctx, actor, input)
	if err != nil || !replay.Body.Receipt.Replayed || replay.Body.Result.Revision != saved.Body.Result.Revision {
		t.Fatal("accepted activation replay", replay, err)
	}
	modern, err := f.service.ActivationReadiness(ctx, f.admin, GetInput{f.project})
	if err != nil {
		t.Fatal(err)
	}
	noop, err := f.service.Activate(ctx, f.admin, activationInput(modern))
	if err != nil || noop.Body.Receipt.EventID != nil || noop.Body.Result.Revision != modern.Configuration.Revision {
		t.Fatal("already modern changed state", noop, err)
	}
	var events int
	if err = f.pool.QueryRow(ctx, "SELECT count(*) FROM activity_events WHERE action=$1", command.ActivateProjectCore).Scan(&events); err != nil || events != 1 {
		t.Fatal(events, err)
	}
}
func TestActivationCoverageConfirmationRolesAndRevocation(t *testing.T) {
	f := configurationFixture(t)
	ctx := context.Background()
	for _, a := range []command.Actor{f.member, f.viewer} {
		if _, err := f.service.ActivationReadiness(ctx, a, GetInput{f.project}); err == nil {
			t.Fatal("member read administrator activation review")
		}
	}
	if _, err := f.pool.Exec(ctx, "UPDATE project_memberships SET role='project_admin' WHERE project_id=$1 AND user_id=$2", f.project.UUID, f.member.UserID.UUID); err != nil {
		t.Fatal(err)
	}
	p, err := f.service.ActivationReadiness(ctx, f.member, GetInput{f.project})
	if err != nil || !p.Ready {
		t.Fatal(p, err)
	}
	input := activationInput(p)
	input.Confirm = false
	if _, err = f.service.Activate(ctx, f.member, input); err == nil {
		t.Fatal("unconfirmed activation accepted")
	}
	if _, err = f.service.ActivationReadiness(ctx, f.member, GetInput{f.other}); err == nil {
		t.Fatal("other project activation review exposed")
	}
	if _, err = f.pool.Exec(ctx, "DELETE FROM board_column_stages WHERE project_id=$1", f.project.UUID); err != nil {
		t.Fatal(err)
	}
	p, err = f.service.ActivationReadiness(ctx, f.member, GetInput{f.project})
	if err != nil || p.Ready {
		t.Fatal("missing coverage accepted", p, err)
	}
	if _, err = f.service.Activate(ctx, f.member, activationInput(p)); err == nil {
		t.Fatal("unsafe activation accepted")
	}
	var mode string
	if err = f.pool.QueryRow(ctx, "SELECT core_mode FROM projects WHERE id=$1", f.project.UUID).Scan(&mode); err != nil || mode != "legacy" {
		t.Fatal(mode, err)
	}
	if _, err = f.pool.Exec(ctx, "UPDATE project_memberships SET removed_at=now() WHERE project_id=$1 AND user_id=$2", f.project.UUID, f.member.UserID.UUID); err != nil {
		t.Fatal(err)
	}
	if _, err = f.service.Activate(ctx, f.member, activationInput(p)); err == nil {
		t.Fatal("revoked administrator activated")
	}
}
func TestConcurrentActivationHasOneCurrentReviewWinner(t *testing.T) {
	f := configurationFixture(t)
	ctx := context.Background()
	p, err := f.service.ActivationReadiness(ctx, f.admin, GetInput{f.project})
	if err != nil {
		t.Fatal(err)
	}
	start := make(chan struct{})
	out := make(chan error, 2)
	var wg sync.WaitGroup
	for range 2 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			_, err := f.service.Activate(ctx, f.admin, activationInput(p))
			out <- err
		}()
	}
	close(start)
	wg.Wait()
	close(out)
	wins := 0
	conflicts := 0
	for err := range out {
		if err == nil {
			wins++
		} else {
			var failure *Conflict
			if errors.As(err, &failure) {
				conflicts++
			} else {
				t.Fatal(err)
			}
		}
	}
	if wins != 1 || conflicts != 1 {
		t.Fatal(wins, conflicts)
	}
}

func TestActivationRejectsBrokenCreationProgressionAndArchivedProjects(t *testing.T) {
	for _, scenario := range []struct{ name, sql, problem string }{
		{
			"closed initial",
			"UPDATE workflow_stages SET is_initial=false,accepts_entries=false WHERE project_id=$1 AND is_initial",
			"creation_defaults",
		},
		{"no completion path", "UPDATE workflow_transitions SET retired=true WHERE project_id=$1", "workflow_progression"},
	} {
		t.Run(scenario.name, func(t *testing.T) {
			f := configurationFixture(t)
			ctx := context.Background()
			if _, err := f.pool.Exec(ctx, scenario.sql, f.project.UUID); err != nil {
				t.Fatal(err)
			}
			review, err := f.service.ActivationReadiness(ctx, f.admin, GetInput{f.project})
			if err != nil || review.Ready {
				t.Fatal(review, err)
			}
			found := false
			for _, p := range review.Problems {
				found = found || p.Code == scenario.problem
			}
			if !found {
				t.Fatal("missing activation diagnosis", review)
			}
			if _, err = f.service.Activate(ctx, f.admin, activationInput(review)); err == nil {
				t.Fatal("unsafe activation accepted")
			}
		})
	}
	t.Run("archived", func(t *testing.T) {
		f := configurationFixture(t)
		ctx := context.Background()
		review, err := f.service.ActivationReadiness(ctx, f.admin, GetInput{f.project})
		if err != nil {
			t.Fatal(err)
		}
		if _, err = f.pool.Exec(ctx, "UPDATE projects SET archived_at=now() WHERE id=$1", f.project.UUID); err != nil {
			t.Fatal(err)
		}
		if _, err = f.service.ActivationReadiness(ctx, f.admin, GetInput{f.project}); err == nil {
			t.Fatal("archived project preview accepted")
		}
		if _, err = f.service.Activate(ctx, f.admin, activationInput(review)); err == nil {
			t.Fatal("archived project activated")
		}
	})
}
