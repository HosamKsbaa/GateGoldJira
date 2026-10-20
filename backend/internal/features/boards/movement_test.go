package boards

import (
	"context"
	"errors"
	"math"
	"testing"
	"time"

	"gategoldjira/backend/internal/features/issues"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"github.com/google/uuid"
)

func (f boardFixture) movement(t *testing.T, id command.IssueID, target command.Status) issues.MoveInput {
	t.Helper()
	v, err := f.issues.Get(context.Background(), f.owner, id)
	if err != nil {
		t.Fatal(err)
	}
	var revision command.Revision
	for _, o := range v.OrderRevisions {
		if o.Status == target {
			revision = o.Revision
		}
	}
	return issues.MoveInput{
		IssueID:                     id,
		ExpectedRevision:            v.Summary.Revision,
		TargetStatus:                target,
		ExpectedSourceOrderRevision: v.SourceOrderRevision,
		ExpectedTargetOrderRevision: revision,
		RetryReference:              uuid.NewString(),
	}
}
func TestSharedHiddenOrderRebalanceAndNoop(t *testing.T) {
	f := boardDatabase(t)
	ctx := context.Background()
	a := f.issue(t, "High A", command.High)
	hidden := f.issue(t, "Hidden", command.Medium)
	b := f.issue(t, "High B", command.High)
	board := f.create(t, "High only", command.IssueFilter{Priorities: []command.Priority{command.High}})
	fresh, err := f.issues.Get(ctx, f.member, b.Summary.ID)
	if err != nil {
		t.Fatal(err)
	}
	in := issues.ReorderInput{
		IssueID:               b.Summary.ID,
		ExpectedRevision:      fresh.Summary.Revision,
		ExpectedOrderRevision: fresh.SourceOrderRevision,
		NeighborIssueID:       a.Summary.ID,
		Placement:             issues.After,
		SourceBoardID:         &board.Board.ID,
		ExpectedBoardRevision: &board.Board.Revision,
		RetryReference:        uuid.NewString(),
	}
	out, err := f.issues.Reorder(ctx, f.member, in)
	if err != nil {
		t.Fatal(err)
	}
	rows, err := f.pool.Query(ctx, "SELECT id FROM issues WHERE project_id=$1 ORDER BY rank,number", f.project.UUID)
	if err != nil {
		t.Fatal(err)
	}
	order := []uuid.UUID{}
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			t.Fatal(err)
		}
		order = append(order, id)
	}
	rows.Close()
	if len(order) != 3 || order[0] != a.Summary.ID.UUID || order[1] != b.Summary.ID.UUID || order[2] != hidden.Summary.ID.UUID {
		t.Fatal("hidden card's order was overwritten")
	}
	in.ExpectedRevision = out.Body.Result.Issue.Summary.Revision
	in.ExpectedOrderRevision = out.Body.Result.TargetOrderRevision
	in.RetryReference = uuid.NewString()
	noOp, err := f.issues.Reorder(ctx, f.member, in)
	if err != nil || noOp.Body.Receipt.EventID != nil || noOp.Body.Result.Issue.Summary.Revision != out.Body.Result.Issue.Summary.Revision {
		t.Fatal("repeat placement was not a no-op", err)
	}
	// Exhaust a real gap. Rebalance changes no other issue content revisions.
	if _, err := f.pool.Exec(ctx, "UPDATE issues SET rank=CASE WHEN id=$1 THEN 1 WHEN id=$2 THEN 2 ELSE 3 END WHERE project_id=$3", a.Summary.ID.UUID, hidden.Summary.ID.UUID, f.project.UUID); err != nil {
		t.Fatal(err)
	}
	in.ExpectedRevision = noOp.Body.Result.Issue.Summary.Revision
	in.ExpectedOrderRevision = noOp.Body.Result.TargetOrderRevision
	in.RetryReference = uuid.NewString()
	if _, err := f.issues.Reorder(ctx, f.member, in); err != nil {
		t.Fatal(err)
	}
	var revision int64
	if err := f.pool.QueryRow(ctx, "SELECT revision FROM issues WHERE id=$1", hidden.Summary.ID.UUID).Scan(&revision); err != nil || revision != 1 {
		t.Fatal("rebalance changed hidden content revision", err)
	}
	if _, err := f.pool.Exec(ctx, "UPDATE issues SET rank=$2 WHERE id=$1", hidden.Summary.ID.UUID, int64(math.MaxInt64-1)); err != nil {
		t.Fatal(err)
	}
	if _, err := f.issues.Move(ctx, f.owner, f.movement(t, b.Summary.ID, command.Review)); err != nil {
		t.Fatal(err)
	}
	if _, err := f.issues.Move(ctx, f.owner, f.movement(t, b.Summary.ID, command.Todo)); err != nil {
		t.Fatal("append overflow did not rebalance", err)
	}
}
func TestBoundedCompletionContinuationAndAtomicDerivedNotifications(t *testing.T) {
	f := boardDatabase(t)
	ctx := context.Background()
	parent := f.issue(t, "Parent", command.High)
	blocker := f.issue(t, "Other developer's work", command.High)
	if _, err := f.pool.Exec(ctx, "INSERT INTO issue_dependencies(project_id,dependent_id,blocker_id,created_by) VALUES($1,$2,$3,$4)", f.project.UUID, parent.Summary.ID.UUID, blocker.Summary.ID.UUID, f.member.UserID.UUID); err != nil {
		t.Fatal(err)
	}
	children := []command.IssueID{}
	for i := 0; i < 30; i++ {
		id := command.NewID[command.IssueKind]()
		children = append(children, id)
		if _, err := f.pool.Exec(ctx, "INSERT INTO issues(id,project_id,number,title,type,parent_id,reporter_id,rank) VALUES($1,$2,$3,'Child','subtask',$4,$5,$6)", id.UUID, f.project.UUID, int64(100+i), parent.Summary.ID.UUID, f.member.UserID.UUID, int64(100000+i*1024)); err != nil {
			t.Fatal(err)
		}
	}
	_, err := f.issues.Move(ctx, f.owner, f.movement(t, parent.Summary.ID, command.Done))
	var failure *issues.PrerequisiteFailure
	if !errors.As(err, &failure) || failure.Current == nil || failure.Unfinished == nil || len(failure.Unfinished.Items) != 25 || failure.Unfinished.TotalMatching != 31 || failure.Unfinished.NextCursor == nil {
		t.Fatal("completion failure not bounded/continuable", err)
	}
	page, err := f.issues.Search(ctx, f.owner, issues.SearchInput{
		Filters: command.IssueFilter{
			ProjectIDs:      []command.ProjectID{f.project},
			PrerequisiteFor: &parent.Summary.ID,
			Statuses: []command.Status{
				command.Todo,
				command.InProgress,
				command.Review,
			},
		},
		Page: command.PageRequest{Cursor: failure.Unfinished.NextCursor},
	})
	if err != nil || len(page.Items) != 6 || page.NextCursor != nil {
		t.Fatal("completion continuation mismatched search scope", err)
	}
	completed, err := f.issues.Move(ctx, f.owner, f.movement(t, blocker.Summary.ID, command.Done))
	if err != nil {
		t.Fatal(err)
	}
	var count int
	if err := f.pool.QueryRow(ctx, "SELECT count(*) FROM notifications WHERE event_id=$1 AND issue_id=$2 AND reasons=ARRAY['dependency_resolved']", *completed.Body.Receipt.EventID, parent.Summary.ID.UUID).Scan(&count); err != nil || count != 1 {
		t.Fatal("last blocker notification missing", err, count)
	}
	replayInput := f.movement(t, blocker.Summary.ID, command.Done)
	noop, err := f.issues.Move(ctx, f.owner, replayInput)
	if err != nil || noop.Body.Receipt.EventID != nil {
		t.Fatal("same-status move emitted an event", err)
	}
	for _, id := range children {
		if _, err := f.issues.Move(ctx, f.owner, f.movement(t, id, command.Done)); err != nil {
			t.Fatal(err)
		}
	}
	parentDone, err := f.issues.Move(ctx, f.owner, f.movement(t, parent.Summary.ID, command.Done))
	if err != nil || parentDone.Body.Result.Issue.Summary.SubtaskProgress.Done != 30 {
		t.Fatal("completed parent rejected", err)
	}
	_, err = f.issues.Move(ctx, f.owner, f.movement(t, children[0], command.Review))
	if !errors.As(err, &failure) || failure.Current.Summary.ID != parent.Summary.ID || failure.Unfinished != nil {
		t.Fatal("Done parent permitted reopened child", err)
	}
	// Existing dependent status stays Done when its blocker reopens.
	reopened, err := f.issues.Move(ctx, f.owner, f.movement(t, blocker.Summary.ID, command.Review))
	if err != nil {
		t.Fatal(err)
	}
	current, err := f.issues.Get(ctx, f.owner, parent.Summary.ID)
	if err != nil || !current.Summary.Blocked || current.Summary.Status != command.Done {
		t.Fatal("reopen changed dependent status", err)
	}
	if err := f.pool.QueryRow(ctx, "SELECT count(*) FROM notifications WHERE event_id=$1 AND issue_id=$2 AND reasons=ARRAY['dependency_blocked']", *reopened.Body.Receipt.EventID, parent.Summary.ID.UUID).Scan(&count); err != nil || count != 1 {
		t.Fatal("reopen blocked notification", err)
	}
}
func TestRepeatableBoardReadCannotAuthorizeStaleMembershipOrUser(t *testing.T) {
	for _, kind := range []string{"membership", "user"} {
		t.Run(kind, func(t *testing.T) {
			f := boardDatabase(t)
			board := f.create(t, "Private", command.IssueFilter{})
			ctx := context.Background()
			tx, err := f.pool.Begin(ctx)
			if err != nil {
				t.Fatal(err)
			}
			defer tx.Rollback(ctx)
			if _, err := dbgen.New(tx).CompanyExclusiveGuard(ctx); err != nil {
				t.Fatal(err)
			}
			if kind == "membership" {
				_, err = tx.Exec(ctx, "UPDATE project_memberships SET removed_at=now() WHERE project_id=$1 AND user_id=$2", f.project.UUID, f.member.UserID.UUID)
			} else {
				_, err = tx.Exec(ctx, "UPDATE users SET disabled_at=now() WHERE id=$1", f.member.UserID.UUID)
			}
			if err != nil {
				t.Fatal(err)
			}
			result := make(chan error, 1)
			go func() { _, err := f.service.Get(ctx, f.member, GetInput{BoardID: board.Board.ID}); result <- err }()
			deadline := time.Now().Add(2 * time.Second)
			waiting := false
			for time.Now().Before(deadline) {
				if err := f.pool.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%company_settings%')").Scan(&waiting); err != nil {
					t.Fatal(err)
				}
				if waiting {
					break
				}
				time.Sleep(10 * time.Millisecond)
			}
			if !waiting {
				t.Fatal("read never reached the company lock")
			}
			if err := tx.Commit(ctx); err != nil {
				t.Fatal(err)
			}
			select {
			case err := <-result:
				var denied *command.Failure
				if !errors.As(err, &denied) || (denied.Code != command.Busy && denied.Code != command.Unavailable && denied.Code != command.AccountInactive) {
					t.Fatal("stale repeatable snapshot authorized", err)
				}
				if denied.Code == command.Busy && denied.NextAction != command.ReloadCurrentState {
					t.Fatal("read denial requested an absent mutation reference")
				}
			case <-time.After(2 * time.Second):
				t.Fatal("read did not finish")
			}
		})
	}
}
