package performance

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"gategoldjira/backend/internal/features/boards"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/tests/testapp"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"io"
	"net/http"
	"os"
	"runtime"
	"testing"
	"time"
)

func TestPreparedIndependentBoardRankTails(t *testing.T) {
	if os.Getenv("RUN_BOARD_SCALE_TESTS") != "1" {
		t.Skip("Opt-in isolated 100k-card prepared board workload")
	}
	r := testapp.NewRuntime(t)
	ctx := context.Background()
	project, board := uuid.New(), uuid.New()
	if _, err := r.Pool.Exec(ctx, "INSERT INTO projects(id,key,name,created_by) VALUES($1,'HOTBOARD','Board workload',$2)", project, r.Admin.UUID); err != nil {
		t.Fatal(err)
	}
	if _, err := r.Pool.Exec(ctx, "INSERT INTO boards(id,project_id,name,name_key,created_by,is_default) VALUES($1,$2,'All Issues','all issues',$3,true)", board, project, r.Admin.UUID); err != nil {
		t.Fatal(err)
	}
	if _, err := r.Pool.Exec(ctx, "INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,'member')", project, r.Member.UUID); err != nil {
		t.Fatal(err)
	}
	if _, err := r.Pool.Exec(ctx, "UPDATE projects SET core_mode='modern' WHERE id=$1", project); err != nil {
		t.Fatal(err)
	}
	var column uuid.UUID
	if err := r.Pool.QueryRow(ctx, "SELECT id FROM board_columns WHERE board_id=$1 AND legacy_status='todo'", board).Scan(&column); err != nil {
		t.Fatal(err)
	}
	// Owner-only bulk fixture setup skips per-row cursor invalidation. The measured
	// path below is the real authenticated application and generated prepared SQL.
	if _, err := r.Pool.Exec(ctx, "ALTER TABLE issue_records DISABLE TRIGGER issues_native_board_stage_order"); err != nil {
		t.Fatal(err)
	}
	if _, err := r.Pool.Exec(ctx, `INSERT INTO issue_records(id,project_id,number,title,reporter_id,type_id,priority_id,workflow_id,stage_id,created_at)
 SELECT gen_random_uuid(),$1,n,CASE WHEN n%1000=0 THEN 'بحث عربي unique-'||n ELSE 'Work item '||n END,$2,t.id,p.id,s.workflow_id,s.id,now()+n*interval '1 microsecond'
 FROM generate_series(1,100000) n JOIN issue_types t ON t.project_id=$1 AND t.key='task'
 JOIN priorities p ON p.project_id=$1 AND p.key='medium'
 JOIN workflow_stages s ON s.project_id=$1 AND s.legacy_status='todo'`, project, r.Admin.UUID); err != nil {
		t.Fatal(err)
	}
	if _, err := r.Pool.Exec(ctx, "ALTER TABLE issue_records ENABLE TRIGGER issues_native_board_stage_order"); err != nil {
		t.Fatal(err)
	}
	report := Report{
		Environment: "isolated authenticated HTTP + PostgreSQL + generated pgx prepared board SQL; transaction-local custom planning; no cloud target",
		GeneratedAt: time.Now().UTC(),
		GoVersion:   runtime.Version(),
		Workload: map[string]int{
			"issues":           100000,
			"hotProjectIssues": 100000,
		},
		Measurements: []Measurement{},
	}
	defer func() { writeReport(t, report) }()
	client := &http.Client{Timeout: 10 * time.Second}
	defer client.CloseIdleConnections()
	token := r.Token(t, r.Member, command.REST)
	request := func(input boards.NativeCardsInput) boards.NativeCardPage {
		t.Helper()
		body, err := json.Marshal(struct {
			TemporaryFilters command.IssueFilter `json:"temporaryFilters"`
			Page             command.PageRequest `json:"page"`
		}{input.TemporaryFilters, input.Page})
		if err != nil {
			t.Fatal(err)
		}
		q, err := http.NewRequest("POST", r.URL+"/api/v2/boards/"+board.String()+"/columns/"+column.String()+"/search", bytes.NewReader(body))
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
		var out boards.NativeCardPage
		if response.StatusCode != 200 || json.Unmarshal(data, &out) != nil {
			t.Fatalf("board read failed: %d", response.StatusCode)
		}
		return out
	}
	base := boards.NativeCardsInput{
		BoardID:  command.BoardID{UUID: board},
		ColumnID: command.ColumnID{UUID: column},
		Page:     command.PageRequest{Limit: new(25)},
	}
	for _, plan := range []string{"force_generic_plan", "force_custom_plan"} {
		if _, err := r.Pool.Exec(ctx, "ALTER DATABASE "+pgx.Identifier{r.Pool.Config().ConnConfig.Database}.Sanitize()+" SET plan_cache_mode='"+plan+"'"); err != nil {
			t.Fatal(err)
		}
		r.Restart(t)
		for _, shape := range []string{"full", "sparse", "stale", "unranked"} {
			if _, err := r.Pool.Exec(ctx, "DELETE FROM board_issue_ranks WHERE board_id=$1", board); err != nil {
				t.Fatal(err)
			}
			if shape != "unranked" {
				destination := column
				if shape == "stale" {
					if err := r.Pool.QueryRow(ctx, "SELECT id FROM board_columns WHERE board_id=$1 AND legacy_status='review'", board).Scan(&destination); err != nil {
						t.Fatal(err)
					}
				}
				maximum := 100000
				if shape == "sparse" {
					maximum = 40
				}
				if _, err := r.Pool.Exec(ctx, "INSERT INTO board_issue_ranks(project_id,board_id,column_id,issue_id,rank) SELECT project_id,$2,$3,id,number*1024 FROM issues WHERE project_id=$1 AND number<=$4", project, board, destination, maximum); err != nil {
					t.Fatal(err)
				}
			}
			if _, err := r.Pool.Exec(ctx, "ANALYZE issue_records; ANALYZE board_issue_ranks; ANALYZE board_column_stages"); err != nil {
				t.Fatal(err)
			}
			for _, query := range []string{"", "94000", "unique-94000", "ز"} {
				input := base
				input.TemporaryFilters = command.IssueFilter{Query: &query}
				measure(t, &report, fmt.Sprintf("%s/%s/query-%q", plan, shape, query), 20, 500*time.Millisecond, func(_ int) {
					page := request(input)
					expected := 25
					if query != "" {
						expected = 1
					}
					if query == "ز" {
						expected = 0
					}
					if len(page.Items) != expected || page.Column.SavedMatchCount != 100000 {
						t.Fatal("board filter/rank/count mismatch")
					}
				})
			}
			first := request(base)
			if first.NextCursor == nil {
				t.Fatal("missing rank-tail cursor")
			}
			secondInput := base
			secondInput.Page.Cursor = first.NextCursor
			measure(t, &report, plan+"/"+shape+"/next-page", 20, 500*time.Millisecond, func(_ int) {
				page := request(secondInput)
				if len(page.Items) != 25 {
					t.Fatal("missing continuation")
				}
				seen := map[command.IssueID]bool{}
				for _, i := range first.Items {
					seen[i.ID] = true
				}
				for _, i := range page.Items {
					if seen[i.ID] {
						t.Fatal("duplicate across rank phase")
					}
				}
			})
		}
	}
	stats := r.Pool.Stat()
	report.PoolMax = stats.MaxConns()
	report.PoolAcquireCount = stats.AcquireCount()
	report.PoolAcquireMS = float64(stats.AcquireDuration().Microseconds()) / 1000
	report.PoolEmptyAcquireCount = stats.EmptyAcquireCount()
}
