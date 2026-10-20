package boards

import (
	"context"
	"gategoldjira/backend/internal/platform/command"
	"github.com/google/uuid"
	"testing"
)

// These are persistence fixtures for the native layout service. Grouping does
// not duplicate an issue or change its workflow; ranks remain board-owned.
func TestBoardLayoutGroupingIsScopedAndRankChangesDoNotEditIssueContent(t *testing.T) {
	f := boardDatabase(t)
	ctx := context.Background()
	first := f.create(t, "Team view", command.IssueFilter{})
	second := f.create(t, "Personal view", command.IssueFilter{Assignee: &command.AssigneeFilter{Mode: command.AssigneeMe}})
	issue := f.issue(t, "مراجعة الفريق", command.Medium)
	var review, doing, column uuid.UUID
	if err := f.pool.QueryRow(ctx, "SELECT id FROM workflow_stages WHERE project_id=$1 AND legacy_status='review'", f.project.UUID).Scan(&review); err != nil {
		t.Fatal(err)
	}
	if err := f.pool.QueryRow(ctx, "SELECT id FROM workflow_stages WHERE project_id=$1 AND legacy_status='in_progress'", f.project.UUID).Scan(&doing); err != nil {
		t.Fatal(err)
	}
	if err := f.pool.QueryRow(ctx, "SELECT column_id FROM board_column_stages WHERE board_id=$1 AND stage_id=$2", first.Board.ID.UUID, doing).Scan(&column); err != nil {
		t.Fatal(err)
	}
	if _, err := f.pool.Exec(ctx, "UPDATE board_column_stages SET column_id=$3 WHERE board_id=$1 AND stage_id=$2", first.Board.ID.UUID, review, column); err != nil {
		t.Fatal("group stages", err)
	}
	var count int
	if err := f.pool.QueryRow(ctx, "SELECT count(*) FROM board_column_stages WHERE column_id=$1", column).Scan(&count); err != nil || count != 2 {
		t.Fatal("group lost a stage", count, err)
	}
	// A stage cannot appear in a second column on this board.
	if _, err := f.pool.Exec(ctx, "INSERT INTO board_column_stages(project_id,board_id,column_id,stage_id) VALUES($1,$2,$3,$4)", f.project.UUID, first.Board.ID.UUID, column, review); err == nil {
		t.Fatal("duplicate stage placement accepted")
	}
	if _, err := f.pool.Exec(ctx, "UPDATE board_issue_ranks SET rank=512 WHERE board_id=$1 AND issue_id=$2", first.Board.ID.UUID, issue.Summary.ID.UUID); err != nil {
		t.Fatal(err)
	}
	var rank, revision int64
	if err := f.pool.QueryRow(ctx, "SELECT rank FROM board_issue_ranks WHERE board_id=$1 AND issue_id=$2", second.Board.ID.UUID, issue.Summary.ID.UUID).Scan(&rank); err != nil || rank == 512 {
		t.Fatal("rank coupled to another board", rank, err)
	}
	if err := f.pool.QueryRow(ctx, "SELECT revision FROM issues WHERE id=$1", issue.Summary.ID.UUID).Scan(&revision); err != nil || revision != int64(issue.Summary.Revision) {
		t.Fatal("rank changed content revision", revision, err)
	}
	var otherColumn uuid.UUID
	if err := f.pool.QueryRow(ctx, "SELECT id FROM board_columns WHERE board_id=$1 LIMIT 1", second.Board.ID.UUID).Scan(&otherColumn); err != nil {
		t.Fatal(err)
	}
	if _, err := f.pool.Exec(ctx, "UPDATE board_issue_ranks SET column_id=$3 WHERE board_id=$1 AND issue_id=$2", first.Board.ID.UUID, issue.Summary.ID.UUID, otherColumn); err == nil {
		t.Fatal("cross-board rank destination accepted")
	}
}

func TestLegacyLayoutAndOrderBridgeStopsWhenProjectBecomesModern(t *testing.T) {
	f := boardDatabase(t)
	ctx := context.Background()
	board := f.create(t, "Bridged view", command.IssueFilter{})
	issue := f.issue(t, "Legacy rank", command.Medium)
	if _, err := f.pool.Exec(ctx, "UPDATE issues SET rank=4096 WHERE id=$1", issue.Summary.ID.UUID); err != nil {
		t.Fatal(err)
	}
	var rank int64
	if err := f.pool.QueryRow(ctx, "SELECT rank FROM board_issue_ranks WHERE board_id=$1 AND issue_id=$2", board.Board.ID.UUID, issue.Summary.ID.UUID).Scan(&rank); err != nil || rank != 4096 {
		t.Fatal("legacy rank not bridged", rank, err)
	}
	if _, err := f.pool.Exec(ctx, "UPDATE project_status_order SET revision=revision+1 WHERE project_id=$1 AND status='todo'", f.project.UUID); err != nil {
		t.Fatal(err)
	}
	var column uuid.UUID
	var revision int64
	if err := f.pool.QueryRow(ctx, "SELECT id,order_revision FROM board_columns WHERE board_id=$1 AND legacy_status='todo'", board.Board.ID.UUID).Scan(&column, &revision); err != nil || revision < 2 {
		t.Fatal("order revision not bridged", revision, err)
	}
	if _, err := f.pool.Exec(ctx, "UPDATE projects SET core_mode='modern' WHERE id=$1", f.project.UUID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.pool.Exec(ctx, "UPDATE issues SET rank=8192 WHERE id=$1", issue.Summary.ID.UUID); err != nil {
		t.Fatal(err)
	}
	if err := f.pool.QueryRow(ctx, "SELECT rank FROM board_issue_ranks WHERE board_id=$1 AND issue_id=$2", board.Board.ID.UUID, issue.Summary.ID.UUID).Scan(&rank); err != nil || rank != 4096 {
		t.Fatal("modern content rewrote board ranks", rank, err)
	}
	if _, err := f.pool.Exec(ctx, "UPDATE project_status_order SET revision=revision+1 WHERE project_id=$1 AND status='todo'", f.project.UUID); err != nil {
		t.Fatal(err)
	}
	var retained int64
	if err := f.pool.QueryRow(ctx, "SELECT order_revision FROM board_columns WHERE id=$1", column).Scan(&retained); err != nil || retained != revision {
		t.Fatal("modern ordering remained coupled", retained, err)
	}
}

func TestBoardLayoutForeignKeysAndCheckedValuesRejectInvalidScope(t *testing.T) {
	f := boardDatabase(t)
	ctx := context.Background()
	board := f.create(t, "Scoped layout", command.IssueFilter{Statuses: []command.Status{command.InProgress, command.Review}})
	issue := f.issue(t, "Scoped issue", command.Medium)
	var column uuid.UUID
	if err := f.pool.QueryRow(ctx, "SELECT id FROM board_columns WHERE board_id=$1 LIMIT 1", board.Board.ID.UUID).Scan(&column); err != nil {
		t.Fatal(err)
	}
	other := uuid.New()
	if _, err := f.pool.Exec(ctx, "INSERT INTO projects(id,key,name,created_by) VALUES($1,'OTHER','Other',$2)", other, f.owner.UserID.UUID); err != nil {
		t.Fatal(err)
	}
	var stage uuid.UUID
	if err := f.pool.QueryRow(ctx, "SELECT id FROM workflow_stages WHERE project_id=$1 AND legacy_status='todo'", other).Scan(&stage); err != nil {
		t.Fatal(err)
	}
	reject := func(name string, run func() error) {
		t.Run(name, func(t *testing.T) {
			if run() == nil {
				t.Fatal("invalid layout accepted")
			}
		})
	}
	reject("foreign stage", func() error {
		_, err := f.pool.Exec(ctx, "INSERT INTO board_column_stages(project_id,board_id,column_id,stage_id) VALUES($1,$2,$3,$4)", f.project.UUID, board.Board.ID.UUID, column, stage)
		return err
	})
	reject("foreign project column", func() error {
		_, err := f.pool.Exec(ctx, "UPDATE board_columns SET project_id=$2 WHERE id=$1", column, other)
		return err
	})
	reject("zero position", func() error {
		_, err := f.pool.Exec(ctx, "UPDATE board_columns SET position=0 WHERE id=$1", column)
		return err
	})
	reject("zero limit", func() error {
		_, err := f.pool.Exec(ctx, "UPDATE board_columns SET wip_limit=0 WHERE id=$1", column)
		return err
	})
	reject("unknown limit mode", func() error {
		_, err := f.pool.Exec(ctx, "UPDATE board_columns SET wip_mode='ignored' WHERE id=$1", column)
		return err
	})
	reject("negative rank", func() error {
		_, err := f.pool.Exec(ctx, "UPDATE board_issue_ranks SET rank=-1 WHERE board_id=$1 AND issue_id=$2", board.Board.ID.UUID, issue.Summary.ID.UUID)
		return err
	})
	if _, err := f.pool.Exec(ctx, "UPDATE issues SET status='in_progress' WHERE id=$1", issue.Summary.ID.UUID); err != nil {
		t.Fatal(err)
	}
	var matched int
	if err := f.pool.QueryRow(ctx, `SELECT count(*) FROM issues i JOIN board_column_stages m ON m.project_id=i.project_id AND m.stage_id=i.stage_id WHERE m.board_id=$1 AND split_part(i.status,':',1)=ANY(ARRAY['in_progress','review'])`, board.Board.ID.UUID).Scan(&matched); err != nil || matched != 1 {
		t.Fatal("category fixture mismatch", matched, err)
	}
	// Saved category filters retain their original JSON during expansion.
	var filters string
	if err := f.pool.QueryRow(ctx, "SELECT saved_filters->'statuses' FROM boards WHERE id=$1", board.Board.ID.UUID).Scan(&filters); err != nil || filters != `["in_progress", "review"]` {
		t.Fatal("saved category filter changed", filters, err)
	}
}
