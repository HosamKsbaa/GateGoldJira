package performance

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"runtime"
	"testing"
	"time"

	"gategoldjira/backend/internal/features/issues"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/tests/testapp"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// Exercises the application's generated SQL through its authenticated HTTP
// endpoint. Plans are forced on newly opened application connections, rather
// than assuming a literal EXPLAIN predicts the pgx prepared execution path.
func TestPreparedSearchHotProject(t *testing.T) {
	if os.Getenv("RUN_SEARCH_SCALE_TESTS") != "1" {
		t.Skip("Opt-in isolated 100k-issue prepared search workload")
	}
	r := testapp.NewRuntime(t)
	ctx := context.Background()
	hot, other := uuid.New(), uuid.New()
	for i, project := range []uuid.UUID{hot, other} {
		if _, err := r.Pool.Exec(ctx, "INSERT INTO projects(id,key,name,created_by) VALUES($1,$2,'Search fixture',$3)", project, []string{"HOT", "COLD"}[i], r.Admin.UUID); err != nil {
			t.Fatal(err)
		}
		if _, err := r.Pool.Exec(ctx, "INSERT INTO project_status_order(project_id,status) SELECT $1,unnest(ARRAY['todo','in_progress','review','done'])", project); err != nil {
			t.Fatal(err)
		}
		if _, err := r.Pool.Exec(ctx, "INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,'member')", project, r.Member.UUID); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := r.Pool.Exec(ctx, `INSERT INTO issue_records(id,project_id,number,title,reporter_id,updated_at,type_id,priority_id,workflow_id,stage_id)
 SELECT gen_random_uuid(),CASE WHEN n<=95000 THEN $1::uuid ELSE $2::uuid END,
 CASE WHEN n<=95000 THEN n ELSE n-95000 END,
 CASE WHEN n%1000=0 THEN 'بحث عربي unique-'||n ELSE 'Work item '||n END,
 $3,now()-n*interval '1 second',t.id,p.id,s.workflow_id,s.id FROM generate_series(1,100000) n
 JOIN issue_types t ON t.project_id=CASE WHEN n<=95000 THEN $1::uuid ELSE $2::uuid END AND t.key='task'
 JOIN priorities p ON p.project_id=t.project_id AND p.key='medium'
 JOIN workflow_stages s ON s.project_id=t.project_id AND s.legacy_status='todo'`, hot, other, r.Admin.UUID); err != nil {
		t.Fatal(err)
	}
	if _, err := r.Pool.Exec(ctx, "ANALYZE"); err != nil {
		t.Fatal(err)
	}
	report := Report{
		Environment:  "isolated loopback HTTP + real PostgreSQL + pgx prepared SQL; text/default/alternate-sort search request-local custom planning; no cloud target",
		GeneratedAt:  time.Now().UTC(),
		GoVersion:    runtime.Version(),
		Workload:     map[string]int{"issues": 100000, "hotProjectIssues": 95000},
		Measurements: []Measurement{},
	}
	defer func() { writeReport(t, report) }()
	token := r.Token(t, r.Member, command.REST)
	client := &http.Client{Timeout: 10 * time.Second}
	defer client.CloseIdleConnections()
	cases := []struct {
		name, query string
		total       int
	}{
		{"number-global", "94000", 1}, {"complete-key", "HOT-94000", 1},
		{"title-literal", "unique-94000", 1}, {"key-prefix", "ho", 95000},
		{"short-Arabic-no-match", "ز", 0}, {"empty-query", "", 100000},
	}
	for _, mode := range []string{"force_generic_plan", "force_custom_plan"} {
		database := pgx.Identifier{r.Pool.Config().ConnConfig.Database}.Sanitize()
		if _, err := r.Pool.Exec(ctx, "ALTER DATABASE "+database+" SET plan_cache_mode = '"+mode+"'"); err != nil {
			t.Fatal(err)
		}
		r.Restart(t)
		for _, tc := range cases {
			body, err := json.Marshal(issues.SearchInput{
				Filters: command.IssueFilter{Query: &tc.query},
				Page:    command.PageRequest{Limit: new(25)},
			})
			if err != nil {
				t.Fatal(err)
			}
			measure(t, &report, fmt.Sprintf("%s/%s", mode, tc.name), 20, 500*time.Millisecond, func(_ int) {
				q, err := http.NewRequest("POST", r.URL+"/api/v1/issues/search", bytes.NewReader(body))
				if err != nil {
					t.Fatal(err)
				}
				q.Header.Set("Authorization", "Bearer "+token)
				q.Header.Set("Content-Type", "application/json")
				response, err := client.Do(q)
				if err != nil {
					t.Fatal(err)
				}
				defer response.Body.Close()
				data, err := io.ReadAll(io.LimitReader(response.Body, 1<<20))
				if err != nil {
					t.Fatal(err)
				}
				if response.StatusCode != 200 {
					t.Fatalf("search %s: HTTP %d", tc.name, response.StatusCode)
				}
				var page command.Page[issues.IssueSummary]
				if err = json.Unmarshal(data, &page); err != nil {
					t.Fatal(err)
				}
				if int(page.TotalMatching) != tc.total || len(page.Items) > 25 {
					t.Fatalf("%s count/page mismatch: %d/%d", tc.name, page.TotalMatching, len(page.Items))
				}
			})
		}
	}
	// Recheck the identifier contract through the same prepared paths after
	// canonical expansion, including a broad choice filter and priority sorting.
	if _, err := r.Pool.Exec(ctx, "UPDATE projects SET core_mode='modern' WHERE id=ANY($1::uuid[])", []uuid.UUID{hot, other}); err != nil {
		t.Fatal(err)
	}
	var typeID, priorityID uuid.UUID
	if err := r.Pool.QueryRow(ctx, "SELECT t.id,p.id FROM issue_types t JOIN priorities p ON p.project_id=t.project_id AND p.is_default WHERE t.project_id=$1 AND t.is_default AND t.behavior='standard'", hot).Scan(&typeID, &priorityID); err != nil {
		t.Fatal(err)
	}
	modernCases := []struct {
		name    string
		filters command.IssueFilter
		total   int
	}{
		{"number-global", command.IssueFilter{Query: new("94000")}, 1},
		{"complete-key", command.IssueFilter{Query: new("HOT-94000")}, 1},
		{"key-prefix", command.IssueFilter{Query: new("ho")}, 95000},
		{"short-Arabic-no-match", command.IssueFilter{Query: new("ز")}, 0},
		{"empty-query", command.IssueFilter{}, 100000},
		{"type-ID-filter", command.IssueFilter{TypeIDs: []command.IssueTypeID{{UUID: typeID}}}, 95000},
		{
			"priority-ID-sort",
			command.IssueFilter{
				PriorityIDs: []command.PriorityID{{UUID: priorityID}},
				Sort:        command.SortPriority,
			},
			95000,
		},
	}
	for _, mode := range []string{"force_generic_plan", "force_custom_plan"} {
		database := pgx.Identifier{r.Pool.Config().ConnConfig.Database}.Sanitize()
		if _, err := r.Pool.Exec(ctx, "ALTER DATABASE "+database+" SET plan_cache_mode = '"+mode+"'"); err != nil {
			t.Fatal(err)
		}
		r.Restart(t)
		for _, tc := range modernCases {
			body, err := json.Marshal(issues.ModernSearchInput{Filters: tc.filters, Page: command.PageRequest{Limit: new(25)}})
			if err != nil {
				t.Fatal(err)
			}
			measure(t, &report, fmt.Sprintf("modern/%s/%s", mode, tc.name), 20, 500*time.Millisecond, func(_ int) {
				q, err := http.NewRequest("POST", r.URL+"/api/v2/issues/search", bytes.NewReader(body))
				if err != nil {
					t.Fatal(err)
				}
				q.Header.Set("Authorization", "Bearer "+token)
				q.Header.Set("Content-Type", "application/json")
				response, err := client.Do(q)
				if err != nil {
					t.Fatal(err)
				}
				defer response.Body.Close()
				data, err := io.ReadAll(io.LimitReader(response.Body, 1<<20))
				if err != nil {
					t.Fatal(err)
				}
				if response.StatusCode != 200 {
					t.Fatalf("modern %s: HTTP %d", tc.name, response.StatusCode)
				}
				var page command.Page[issues.ModernIssueSummary]
				if err = json.Unmarshal(data, &page); err != nil {
					t.Fatal(err)
				}
				if int(page.TotalMatching) != tc.total || len(page.Items) > 25 {
					t.Fatalf("modern %s count/page mismatch", tc.name)
				}
				for _, item := range page.Items {
					if item.Type.ID.UUID == uuid.Nil || item.Priority.ID.UUID == uuid.Nil || item.Workflow.ID.UUID == uuid.Nil || item.Stage.ID.UUID == uuid.Nil {
						t.Fatal("missing canonical choices")
					}
				}
			})
		}
	}

	stats := r.ApplicationPoolStats()
	report.PoolMax = stats.MaxConns()
	report.PoolAcquireCount = stats.AcquireCount()
	report.PoolAcquireMS = float64(stats.AcquireDuration().Microseconds()) / 1000
}
