package performance

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"gategoldjira/backend/internal/features/comments"
	"gategoldjira/backend/internal/features/issues"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/tests/testapp"
	"github.com/google/uuid"
	"io"
	"net/http"
	"os"
	"runtime"
	"strconv"
	"sync"
	"testing"
	"time"
)

type mixedSample struct {
	Action   string
	Duration time.Duration
	Status   int
	Failure  bool
}

func mixedCall[In any](client *http.Client, origin, token, method, path string, in In, mcpOperation command.Operation) (mixedSample, []byte) {
	var body []byte
	var err error
	if mcpOperation != "" {
		body, err = json.Marshal(struct {
			JSONRPC string `json:"jsonrpc"`
			ID      int    `json:"id"`
			Method  string `json:"method"`
			Params  struct {
				Name      command.Operation `json:"name"`
				Arguments In                `json:"arguments"`
			} `json:"params"`
		}{JSONRPC: "2.0", ID: 1, Method: "tools/call", Params: struct {
			Name      command.Operation `json:"name"`
			Arguments In                `json:"arguments"`
		}{mcpOperation, in}})
		path = "/mcp"
		method = "POST"
	} else {
		body, err = json.Marshal(in)
	}
	if err != nil {
		return mixedSample{Failure: true}, nil
	}
	request, err := http.NewRequest(method, origin+path, bytes.NewReader(body))
	if err != nil {
		return mixedSample{Failure: true}, nil
	}
	request.Header.Set("Authorization", "Bearer "+token)
	request.Header.Set("Content-Type", "application/json")
	if mcpOperation != "" {
		request.Header.Set("MCP-Protocol-Version", "2025-11-25")
		request.Header.Set("Accept", "application/json, text/event-stream")
	}
	if mcpOperation == "" {
		var fields map[string]json.RawMessage
		if json.Unmarshal(body, &fields) != nil {
			return mixedSample{Failure: true}, nil
		}
		var reference string
		if encoded, ok := fields["retryReference"]; ok {
			_ = json.Unmarshal(encoded, &reference)
		}
		if reference != "" {
			request.Header.Set("Idempotency-Key", reference)
		}
		delete(fields, "retryReference")
		delete(fields, "issueId")
		body, err = json.Marshal(fields)
		if err != nil {
			return mixedSample{Failure: true}, nil
		}
		request.Body = io.NopCloser(bytes.NewReader(body))
		request.ContentLength = int64(len(body))
	}

	start := time.Now()
	response, err := client.Do(request)
	sample := mixedSample{Duration: time.Since(start)}
	if err != nil {
		sample.Failure = true
		return sample, nil
	}
	defer response.Body.Close()
	data, err := io.ReadAll(io.LimitReader(response.Body, 2<<20))
	sample.Duration = time.Since(start)
	sample.Status = response.StatusCode
	sample.Failure = err != nil || response.StatusCode < 200 || response.StatusCode >= 300
	if mcpOperation != "" {
		var envelope struct {
			Result struct {
				StructuredContent struct {
					OK bool `json:"ok"`
				} `json:"structuredContent"`
			} `json:"result"`
		}
		if json.Unmarshal(data, &envelope) != nil || !envelope.Result.StructuredContent.OK {
			sample.Failure = true
		}
	}
	return sample, data
}
func TestMixedCanonicalHotProjectWith100ActiveUsers(t *testing.T) {
	if os.Getenv("RUN_MIXED_SCALE_TESTS") != "1" {
		t.Skip("Opt-in 100k issue/100 active user mixed canonical workload")
	}
	datasetSize := 100000
	if value := os.Getenv("GATEGOLD_SCALE_ISSUES"); value != "" {
		parsed, err := strconv.Atoi(value)
		if err != nil || parsed < 100000 || parsed > 1000000 {
			t.Fatal("GATEGOLD_SCALE_ISSUES must be 100000-1000000")
		}
		datasetSize = parsed
	}
	r := testapp.NewRuntime(t)
	ctx := context.Background()
	project, board := uuid.New(), uuid.New()
	for _, setup := range []struct {
		SQL  string
		Args []any
	}{
		{
			"INSERT INTO projects(id,key,name,created_by) VALUES($1,'MIXED','Mixed hot project',$2)",
			[]any{project, r.Admin.UUID},
		},
		{
			"INSERT INTO project_status_order(project_id,status) SELECT $1,unnest(ARRAY['todo','in_progress','review','done'])",
			[]any{project},
		},
		{
			"INSERT INTO boards(id,project_id,name,name_key,created_by,is_default) VALUES($1,$2,'All Issues','all issues',$3,true)",
			[]any{board, project, r.Admin.UUID},
		},
		{"UPDATE projects SET core_mode='modern' WHERE id=$1", []any{project}},
		{"ALTER TABLE issue_records DISABLE TRIGGER issues_native_board_stage_order", nil},
		{`INSERT INTO issue_records(id,project_id,number,title,reporter_id,type_id,priority_id,workflow_id,stage_id)
   SELECT gen_random_uuid(),$1,n,CASE WHEN n%1000=0 THEN 'بحث عربي unique-'||n ELSE 'Work item '||n END,$2,t.id,p.id,s.workflow_id,s.id
   FROM generate_series(1,$3) n JOIN issue_types t ON t.project_id=$1 AND t.key='task' JOIN priorities p ON p.project_id=$1 AND p.key='medium' JOIN workflow_stages s ON s.project_id=$1 AND s.legacy_status='todo'`, []any{project, r.Admin.UUID, datasetSize}},
		{"ALTER TABLE issue_records ENABLE TRIGGER issues_native_board_stage_order", nil},
		{"ANALYZE issue_records; ANALYZE board_columns; ANALYZE board_issue_ranks", nil},
	} {
		if _, err := r.Pool.Exec(ctx, setup.SQL, setup.Args...); err != nil {
			t.Fatal(err)
		}
	}
	// Establish the visibility map after owner-only bulk loading, as normal
	// vacuum does for a warmed production dataset. Concurrent edits below remain live.
	if _, err := r.Pool.Exec(ctx, "VACUUM (ANALYZE) issue_records"); err != nil {
		t.Fatal(err)
	}
	users := make([]command.UserID, 100)
	tokens := make([]string, 100)
	mcpTokens := make([]string, 100)
	for i := range users {
		users[i] = command.NewID[command.UserKind]()
		email := fmt.Sprintf("load-%d@fixture.dev", i)
		if _, err := r.Pool.Exec(ctx, "INSERT INTO users(id,email,email_key,display_name,approved_at) VALUES($1,$2,$2,$3,now())", users[i].UUID, email, fmt.Sprintf("Load user %d", i)); err != nil {
			t.Fatal(err)
		}
		if _, err := r.Pool.Exec(ctx, "INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,'member')", project, users[i].UUID); err != nil {
			t.Fatal(err)
		}
		tokens[i] = r.Token(t, users[i], command.REST)
		mcpTokens[i] = r.Token(t, users[i], command.MCP)
	}
	ids := []command.IssueID{}
	rows, err := r.Pool.Query(ctx, "SELECT id FROM issues WHERE project_id=$1 AND number<=100 ORDER BY number", project)
	if err != nil {
		t.Fatal(err)
	}
	for rows.Next() {
		var id command.IssueID
		if err = rows.Scan(&id.UUID); err != nil {
			t.Fatal(err)
		}
		ids = append(ids, id)
	}
	rows.Close()
	if len(ids) != 100 {
		t.Fatal("fixture issue count")
	}
	var medium, high command.PriorityID
	if err = r.Pool.QueryRow(ctx, "SELECT m.id,h.id FROM priorities m JOIN priorities h ON h.project_id=m.project_id AND h.key='high' WHERE m.project_id=$1 AND m.key='medium'", project).Scan(&medium.UUID, &high.UUID); err != nil {
		t.Fatal(err)
	}
	var column command.ColumnID
	if err = r.Pool.QueryRow(ctx, "SELECT id FROM board_columns WHERE board_id=$1 AND legacy_status='todo'", board).Scan(&column.UUID); err != nil {
		t.Fatal(err)
	}
	captureBoardPlans(t, r.Pool, project, board, column.UUID)
	report := Report{
		Environment: fmt.Sprintf("isolated authenticated REST + MCP, %d canonical issues in one hot project, 100 simultaneous users; no cloud acceptance", datasetSize),
		GeneratedAt: time.Now().UTC(),
		GoVersion:   runtime.Version(),
		Workload: map[string]int{
			"issues":           datasetSize,
			"hotProjectIssues": datasetSize,
			"activeUsers":      100,
		},
		Measurements: []Measurement{},
	}
	client := &http.Client{
		Timeout: 30 * time.Second,
		Transport: &http.Transport{
			MaxIdleConns:        120,
			MaxIdleConnsPerHost: 100,
			MaxConnsPerHost:     100,
		},
	}
	defer client.CloseIdleConnections()
	// This report measures warm daily traffic. Initialize signed identities and
	// prepared broad/read paths separately from the synchronized load barrier.
	for i := range users {
		query := fmt.Sprint(i + 1)
		input := issues.SearchInput{
			Filters: command.IssueFilter{
				ProjectIDs: []command.ProjectID{{UUID: project}},
				Query:      &query,
			},
			Page: command.PageRequest{Limit: new(25)},
		}
		operation := command.Operation("")
		authorization := tokens[i]
		if i%2 == 1 {
			operation = command.SearchModernIssues
			authorization = mcpTokens[i]
		}
		sample, _ := mixedCall(client, r.URL, authorization, "POST", "/api/v2/issues/search", input, operation)
		if sample.Failure {
			t.Fatal("warm identity/read failed")
		}
	}
	for range 12 {
		sample, _ := mixedCall(client, r.URL, tokens[0], "POST", "/api/v2/boards/"+board.String()+"/columns/"+column.String()+"/search", struct {
			TemporaryFilters command.IssueFilter `json:"temporaryFilters"`
			Page             command.PageRequest `json:"page"`
		}{command.IssueFilter{}, command.PageRequest{Limit: new(25)}}, "")
		if sample.Failure {
			t.Fatal("warm broad board failed")
		}
	}
	samples := make(chan mixedSample, 1600)
	start := make(chan struct{})
	var workers sync.WaitGroup
	stopMemory := make(chan struct{})
	memoryDone := make(chan struct{})
	var peak uint64
	go func() {
		defer close(memoryDone)
		ticker := time.NewTicker(10 * time.Millisecond)
		defer ticker.Stop()
		for {
			select {
			case <-stopMemory:
				return
			case <-ticker.C:
				var m runtime.MemStats
				runtime.ReadMemStats(&m)
				peak = max(peak, m.HeapAlloc)
			}
		}
	}()
	statsBefore := r.ApplicationPoolStats()
	for i := range users {
		workers.Add(1)
		go func(i int) {
			defer workers.Done()
			<-start
			for step := 0; step < 10; step++ {
				query := fmt.Sprint(i + 1)
				if step == 4 {
					query = "unique-94000"
				}
				input := issues.SearchInput{
					Filters: command.IssueFilter{
						ProjectIDs: []command.ProjectID{{UUID: project}},
						Query:      &query,
					},
					Page: command.PageRequest{Limit: new(25)},
				}
				op := command.Operation("")
				auth := tokens[i]
				if i%2 == 1 {
					op = command.SearchModernIssues
					auth = mcpTokens[i]
				}
				sample, _ := mixedCall(client, r.URL, auth, "POST", "/api/v2/issues/search", input, op)
				sample.Action = "mixed/read-search"
				samples <- sample
			}
			if i%10 == 0 {
				body := struct {
					TemporaryFilters command.IssueFilter `json:"temporaryFilters"`
					Page             command.PageRequest `json:"page"`
				}{command.IssueFilter{}, command.PageRequest{Limit: new(25)}}
				sample, _ := mixedCall(client, r.URL, tokens[i], "POST", "/api/v2/boards/"+board.String()+"/columns/"+column.String()+"/search", body, "")
				sample.Action = "mixed/read-broad-board"
				samples <- sample
			}
			prior, value := medium, high
			for step := 0; step < 2; step++ {
				input := issues.ModernPatchInput{
					IssueID: ids[i],
					ModernPatchFields: issues.ModernPatchFields{
						Field:    issues.PriorityIDField,
						Priority: &issues.PriorityIDChange{Prior: prior, Value: value},
					},
					RetryReference: uuid.NewString(),
				}
				op := command.Operation("")
				auth := tokens[i]
				if i%2 == 1 {
					op = command.PatchModernIssueField
					auth = mcpTokens[i]
				}
				sample, _ := mixedCall(client, r.URL, auth, "PATCH", "/api/v2/issues/"+ids[i].String()+"/fields", input, op)
				sample.Action = "mixed/write-priority"
				samples <- sample
				prior, value = value, prior
			}
			input := comments.CreateInput{
				IssueID: ids[i],
				Body: comments.Body{
					HTML:           "<p dir=\"rtl\">مراجعة تحت حمل متزامن</p>",
					MentionUserIDs: []command.UserID{},
					PictureIDs:     []command.PictureID{},
				},
				RetryReference: uuid.NewString(),
			}
			op := command.Operation("")
			auth := tokens[i]
			if i%2 == 1 {
				op = command.CreateComment
				auth = mcpTokens[i]
			}
			sample, _ := mixedCall(client, r.URL, auth, "POST", "/api/v1/issues/"+ids[i].String()+"/comments", input, op)
			sample.Action = "mixed/write-comment"
			samples <- sample
		}(i)
	}
	close(start)
	workers.Wait()
	close(samples)
	close(stopMemory)
	<-memoryDone
	durations := map[string][]time.Duration{}
	errorsByAction := map[string]int{}
	for sample := range samples {
		durations[sample.Action] = append(durations[sample.Action], sample.Duration)
		if sample.Failure {
			errorsByAction[sample.Action]++
		}
	}
	for _, name := range []string{
		"mixed/read-search",
		"mixed/read-broad-board",
		"mixed/write-priority",
		"mixed/write-comment",
	} {
		budget := 500 * time.Millisecond
		if name == "mixed/write-priority" || name == "mixed/write-comment" {
			budget = 750 * time.Millisecond
		}
		recordDurations(t, &report, name, durations[name], budget)
	}
	stats := r.ApplicationPoolStats()
	report.HeapPeakBytes = peak
	report.PoolMax = stats.MaxConns()
	report.PoolAcquireCount = stats.AcquireCount() - statsBefore.AcquireCount()
	report.PoolAcquireMS = float64((stats.AcquireDuration() - statsBefore.AcquireDuration()).Microseconds()) / 1000
	report.PoolEmptyAcquireCount = stats.EmptyAcquireCount() - statsBefore.EmptyAcquireCount()
	if err = r.Pool.QueryRow(ctx, "SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'").Scan(&report.LocksWaiting); err != nil {
		t.Fatal(err)
	}
	report.Errors = errorsByAction
	writeReport(t, report)
	for action, count := range errorsByAction {
		if count != 0 {
			t.Errorf("%s had %d failed operations", action, count)
		}
	}
	var commentsCount int
	if err = r.Pool.QueryRow(ctx, "SELECT count(*) FROM comments WHERE project_id=$1", project).Scan(&commentsCount); err != nil || commentsCount != 100 {
		t.Fatal("comment outcomes", commentsCount, err)
	}
	var changed int
	if err = r.Pool.QueryRow(ctx, "SELECT count(*) FROM issues WHERE project_id=$1 AND number<=100 AND revision=3 AND priority_id=$2", project, medium.UUID).Scan(&changed); err != nil || changed != 100 {
		t.Fatal("priority edits lost or duplicated", changed, err)
	}
}
