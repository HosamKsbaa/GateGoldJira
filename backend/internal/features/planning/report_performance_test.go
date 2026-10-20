package planning

import (
	"context"
	_ "embed"
	"encoding/json"
	"math"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"

	"gategoldjira/backend/internal/features/projects"
	"gategoldjira/backend/internal/platform/command"
	"github.com/google/uuid"
)

//go:embed queries.sql
var performanceQueries string

type reportPlanNode struct {
	NodeType    string           `json:"Node Type"`
	IndexName   string           `json:"Index Name"`
	TotalCost   float64          `json:"Total Cost"`
	PlanRows    int64            `json:"Plan Rows"`
	ActualRows  float64          `json:"Actual Rows"`
	ActualLoops float64          `json:"Actual Loops"`
	Plans       []reportPlanNode `json:"Plans"`
}
type reportExplain struct {
	Plan          reportPlanNode `json:"Plan"`
	PlanningTime  float64        `json:"Planning Time"`
	ExecutionTime float64        `json:"Execution Time"`
}
type reportPerformanceEvidence struct {
	Environment      string        `json:"environment"`
	CloudAcceptance  bool          `json:"cloudAcceptance"`
	GeneratedAt      time.Time     `json:"generatedAt"`
	Projects         int           `json:"projects"`
	Issues           int           `json:"issues"`
	TransitionEvents int           `json:"transitionEvents"`
	WindowDays       int           `json:"windowDays"`
	CurrentWorkLimit int           `json:"currentWorkLimit"`
	Trials           int           `json:"trials"`
	P50MS            float64       `json:"p50Ms"`
	P95MS            float64       `json:"p95Ms"`
	SummaryPlan      reportExplain `json:"summaryPlan"`
	CurrentWorkPlan  reportExplain `json:"currentWorkPlan"`
	IndexesUsed      []string      `json:"indexesUsed"`
}

func reportQuery(t *testing.T, name string, parameters ...string) string {
	t.Helper()
	marker := "-- name: " + name + " :"
	start := strings.Index(performanceQueries, marker)
	if start < 0 {
		t.Fatal("missing report query", name)
	}
	query := performanceQueries[start:]
	query = query[strings.IndexByte(query, '\n')+1:]
	if end := strings.Index(query, "-- name:"); end >= 0 {
		query = query[:end]
	}
	return strings.NewReplacer(parameters...).Replace(strings.TrimSpace(query))
}

func TestKanbanReportRepresentativeQueryPlans(t *testing.T) {
	if os.Getenv("RUN_SCALE_TESTS") != "1" {
		t.Skip("set RUN_SCALE_TESTS=1 for the isolated report performance fixture")
	}
	f := planningDatabase(t)
	ctx := context.Background()
	signer, _ := command.NewCursorSigner([]byte(strings.Repeat("r", 32)))
	other, err := projects.New(command.Runner{Pool: f.pool}, signer).Create(ctx, f.owner, projects.CreateInput{
		Key:            "OTHER",
		Name:           "Unrelated transition history",
		RetryReference: uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	for _, project := range []command.ProjectID{f.project, other.Body.Result.ID} {
		_, err = f.pool.Exec(ctx, `
INSERT INTO issues(id,project_id,number,title,status,reporter_id,rank,created_at)
SELECT gen_random_uuid(),$1,n,'Representative report work',CASE WHEN n%2=0 THEN 'done' ELSE 'review' END,$2,n*1024,now()-interval '20 days'
FROM generate_series(1,1000) n`, project.UUID, f.member.UserID.UUID)
		if err != nil {
			t.Fatal(err)
		}
		_, err = f.pool.Exec(ctx, `
WITH states AS (
 SELECT i.id,i.project_id,i.number,step,
 CASE WHEN step=10 AND i.number%2=0 THEN 'done' ELSE (ARRAY['in_progress','review','done','todo','in_progress','review','done','todo','in_progress','review'])[step] END AS after_status,
 CASE WHEN step=1 THEN 'todo' ELSE (ARRAY['in_progress','review','done','todo','in_progress','review','done','todo','in_progress','review'])[step-1] END AS before_status,
 i.created_at+step*interval '1 day' AS transition_at
 FROM issues i CROSS JOIN generate_series(1,10) step WHERE i.project_id=$1
)
INSERT INTO activity_events(id,actor_id,channel,action,resource_kind,resource_id,project_id,issue_id,changes,created_at)
SELECT gen_random_uuid(),$2,'web','move_issue','issue',id,project_id,id,
jsonb_build_object('version',1,'fields',jsonb_build_array(jsonb_build_object('field','status','before',before_status,'after',after_status))),transition_at
FROM states`, project.UUID, f.member.UserID.UUID)
		if err != nil {
			t.Fatal(err)
		}
	}
	if _, err = f.pool.Exec(ctx, "ANALYZE activity_events; ANALYZE issues"); err != nil {
		t.Fatal(err)
	}
	from := command.Today(time.Now().Add(-30*24*time.Hour), time.UTC)
	through := command.Today(time.Now(), time.UTC)
	limit := 25
	input := KanbanReportInput{
		ProjectID: f.project,
		From:      from,
		Through:   through,
		Page:      command.PageRequest{Limit: &limit},
	}
	var durations []float64
	for trial := 0; trial < 13; trial++ {
		start := time.Now()
		report, err := f.s.Report(ctx, f.member, input)
		if err != nil {
			t.Fatal(err)
		}
		if report.CompletedCycles != 2500 || report.MeasuredCycles != 2500 || report.AverageCycleDays == nil || math.Abs(*report.AverageCycleDays-2.4) > 0.00001 || report.ActiveCount != 500 || len(report.Work.Items) != limit || report.Work.NextCursor == nil {
			t.Fatal("representative history produced incorrect or unbounded results", report)
		}
		if trial > 0 {
			durations = append(durations, float64(time.Since(start).Microseconds())/1000)
		}
	}
	explain := func(query string, args ...any) reportExplain {
		t.Helper()
		var data []byte
		if err := f.pool.QueryRow(ctx, "EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) "+query, args...).Scan(&data); err != nil {
			t.Fatal(err)
		}
		var plans []reportExplain
		if err := json.Unmarshal(data, &plans); err != nil || len(plans) != 1 {
			t.Fatal("invalid query-plan evidence", err)
		}
		return plans[0]
	}
	start, _ := time.Parse("2006-01-02", from.String())
	end, _ := time.Parse("2006-01-02", through.String())
	summary := explain(reportQuery(t, "PlanningReportSummary", "sqlc.arg(project_id)", "$1", "sqlc.arg(window_start)", "$2", "sqlc.arg(window_end)", "$3"), f.project.UUID, start, end.Add(24*time.Hour))
	work := explain(reportQuery(t, "PlanningReportWork", "sqlc.arg(project_id)", "$1", "sqlc.arg(after_number)", "$2", "sqlc.arg(page_size)", "$3"), f.project.UUID, int64(0), int32(26))
	indexes := []string{}
	var inspect func(reportPlanNode)
	inspect = func(node reportPlanNode) {
		if node.IndexName != "" && !slices.Contains(indexes, node.IndexName) {
			indexes = append(indexes, node.IndexName)
		}
		for _, child := range node.Plans {
			inspect(child)
		}
	}
	inspect(summary.Plan)
	inspect(work.Plan)
	if !slices.Contains(indexes, "activity_events_issue_page_idx") && !slices.Contains(indexes, "activity_issue_transitions") {
		t.Fatal("current issue history lost its indexed lookup", indexes)
	}
	slices.Sort(durations)
	evidence := reportPerformanceEvidence{
		Environment:      "local PostgreSQL; isolated fixture",
		GeneratedAt:      time.Now().UTC(),
		Projects:         2,
		Issues:           2000,
		TransitionEvents: 20000,
		WindowDays:       31,
		CurrentWorkLimit: limit,
		Trials:           len(durations),
		P50MS:            durations[(len(durations)-1)/2],
		P95MS:            durations[len(durations)-1],
		SummaryPlan:      summary,
		CurrentWorkPlan:  work,
		IndexesUsed:      indexes,
	}
	t.Logf("20,000 transitions: report p50=%.2fms p95=%.2fms; summary EXPLAIN=%.2fms, current-work EXPLAIN=%.2fms; indexes=%v", evidence.P50MS, evidence.P95MS, summary.ExecutionTime, work.ExecutionTime, indexes)
	if evidence.P95MS > 1500 {
		t.Error("report exceeds the local 1500ms regression budget")
	}
	if destination := os.Getenv("GATEGOLD_PLANNING_REPORT"); destination != "" {
		if !filepath.IsAbs(destination) {
			t.Fatal("report evidence destination must be absolute")
		}
		data, err := json.MarshalIndent(evidence, "", "  ")
		if err != nil {
			t.Fatal(err)
		}
		if err = os.WriteFile(destination, append(data, '\n'), 0600); err != nil {
			t.Fatal(err)
		}
	}
}
