package planning

import (
	"context"
	"testing"
	"time"

	"gategoldjira/backend/internal/platform/command"
	"github.com/google/uuid"
)

func TestPlanningAndAgingRowsExposeCurrentStageNames(t *testing.T) {
	f := planningDatabase(t)
	ctx := context.Background()
	issue := f.issue(t, 1, "review")
	epic := f.item(t, Epic, "Stage display")
	_, err := f.s.SetIssue(ctx, f.member, IssuePlanningInput{
		IssueID:             issue,
		IssuePlanningFields: IssuePlanningFields{ExpectedRevision: 0, EpicID: &epic.ID},
		RetryReference:      uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"Quality gate · بوابة الجودة", "Renamed quality gate"} {
		if _, err := f.pool.Exec(ctx, "UPDATE workflow_stages SET name=$1 WHERE id=(SELECT stage_id FROM issues WHERE id=$2)", name, issue.UUID); err != nil {
			t.Fatal(err)
		}
		linked, err := f.s.ListIssues(ctx, f.member, PlanningIssuesInput{ProjectID: f.project, PlanningID: epic.ID})
		if err != nil || len(linked.Items) != 1 || linked.Items[0].ID != issue || linked.Items[0].StageName != name || linked.Items[0].Status != "review" {
			t.Fatalf("linked work lost exact current name or category: %#v %v", linked, err)
		}
		report, err := f.s.Report(ctx, f.member, KanbanReportInput{ProjectID: f.project, From: command.Today(time.Now().AddDate(0, 0, -30), time.UTC), Through: command.Today(time.Now(), time.UTC)})
		if err != nil || len(report.Work.Items) != 1 || report.Work.Items[0].ID != issue || report.Work.Items[0].StageName != name || report.Work.Items[0].Status != "review" {
			t.Fatalf("aging work lost exact current name or category: %#v %v", report, err)
		}
	}
}
