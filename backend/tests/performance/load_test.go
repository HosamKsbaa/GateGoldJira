package performance

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"runtime"
	"sync"
	"testing"
	"time"

	"gategoldjira/backend/internal/features/boards"
	"gategoldjira/backend/internal/features/comments"
	"gategoldjira/backend/internal/features/issues"
	"gategoldjira/backend/internal/features/notifications"
	"gategoldjira/backend/internal/features/pictures"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/tests/testapp"
	"gategoldjira/backend/tests/testenv"
	"github.com/google/uuid"
)

func TestFullScaleLocalWorkload(t *testing.T) {
	if os.Getenv("RUN_SCALE_TESTS") != "1" {
		t.Skip("Opt in with make test-performance; seeds an isolated database and1GiB of fixture pictures")
	}
	r := testapp.NewRuntime(t)
	f := Seed(t, r)
	ctx := context.Background()
	report := Report{
		Environment:  "local-loopback PostgreSQL; no Cloud target",
		GeneratedAt:  time.Now().UTC(),
		GoVersion:    runtime.Version(),
		Measurements: []Measurement{},
		Workload:     map[string]int{},
	}
	expected := map[string]int{
		"users":              51,
		"projects":           20,
		"issues":             10000,
		"comments":           20000,
		"boards":             60,
		"issue_dependencies": 1000,
		"pictures":           1000,
		"labels":             200,
		"notifications":      50000,
		"activity_events":    50000,
	}
	for table, want := range expected {
		var n int
		if err := r.Pool.QueryRow(ctx, "SELECT count(*) FROM "+table).Scan(&n); err != nil || n != want {
			t.Fatalf("%s got=%d want=%d err=%v", table, n, want, err)
		}
		report.Workload[table] = n
	}
	var children, dated, arabic, maxProject, maxComments int
	if err := r.Pool.QueryRow(ctx, `SELECT count(*) FILTER(WHERE parent_id IS NOT NULL),count(*) FILTER(WHERE due_date IS NOT NULL),count(*) FILTER(WHERE title ~ '[ء-ي]') FROM issues`).Scan(&children, &dated, &arabic); err != nil {
		t.Fatal(err)
	}
	if err := r.Pool.QueryRow(ctx, `SELECT max(n) FROM (SELECT count(*) n FROM issues GROUP BY project_id) x`).Scan(&maxProject); err != nil {
		t.Fatal(err)
	}
	if err := r.Pool.QueryRow(ctx, `SELECT max(n) FROM (SELECT count(*) n FROM comments GROUP BY issue_id) x`).Scan(&maxComments); err != nil {
		t.Fatal(err)
	}
	if children != 2000 || dated != 5000 || arabic < 2000 || maxProject != 2000 || maxComments != 500 {
		t.Fatal("full-scale distribution is incomplete", children, dated, arabic, maxProject, maxComments)
	}
	report.Workload["subtasks"] = children
	report.Workload["datedIssues"] = dated
	report.Workload["arabicIssues"] = arabic
	tokens := make([]string, 50)
	for i, u := range f.Users {
		tokens[i] = r.Token(t, u, command.REST)
	}
	client := &http.Client{
		Timeout: 35 * time.Second,
		Transport: &http.Transport{
			MaxIdleConns:        100,
			MaxIdleConnsPerHost: 60,
			MaxConnsPerHost:     60,
		},
	}
	defer client.CloseIdleConnections()
	request := func(method, path, token, retry string, data []byte, contentType string) []byte {
		t.Helper()
		q, err := http.NewRequest(method, r.URL+"/api/v1"+path, bytes.NewReader(data))
		if err != nil {
			t.Fatal(err)
		}
		q.Header.Set("Authorization", "Bearer "+token)
		if retry != "" {
			q.Header.Set("Idempotency-Key", retry)
		}
		if contentType != "" {
			q.Header.Set("Content-Type", contentType)
		}
		res, err := client.Do(q)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		body, err := io.ReadAll(io.LimitReader(res.Body, 16<<20))
		if err != nil {
			t.Fatal(err)
		}
		if res.StatusCode < 200 || res.StatusCode >= 300 {
			t.Fatalf("%s %s status=%d", method, path, res.StatusCode)
		}
		return body
	}
	traverse(t, f, tokens, request)
	project := f.Projects[0]
	issue := f.Issues[1].ID
	board := f.Boards[0]
	readCases := []struct {
		name, path, method string
		body               []byte
		admin              bool
	}{
		{"project-list", "/projects?limit=25", "GET", nil, false},
		{"issue-detail", "/issues/" + issue.String(), "GET", nil, false},
		{
			"issue-search-Arabic-labels",
			"/issues/search",
			"POST",
			[]byte(`{"filters":{"projectIds":["` + project.String() + `"],"query":"عربي","labelIds":["` + scaleID("label", 0).String() + `"]},"page":{"limit":25}}`),
			false,
		},
		{"board-counts-2000-issues", "/boards/" + board.String(), "GET", nil, false},
		{
			"board-page-bounded",
			"/boards/" + board.String() + "/columns/todo/search",
			"POST",
			[]byte(`{"page":{"limit":25}}`),
			false,
		},
		{"comments-page-500-comments", "/issues/" + f.Issues[0].ID.String() + "/comments?limit=25", "GET", nil, false},
		{"inbox-summary-50000", "/notifications/summary", "GET", nil, false},
		{"inbox-page-50000", "/notifications?limit=25", "GET", nil, false},
		{"activity-page-50000", "/admin/activity?limit=25", "GET", nil, true},
		{"labels-page", "/projects/" + project.String() + "/labels?limit=25", "GET", nil, false},
	}
	for _, tc := range readCases {
		func() {
			token := tokens[1]
			if tc.admin {
				token = tokens[0]
			}
			measure(t, &report, tc.name, 100, 500*time.Millisecond, func(_ int) {
				data := request(tc.method, tc.path, token, "", tc.body, "application/json")
				if !json.Valid(data) {
					t.Fatal("invalid JSON")
				}
				if tc.name == "board-page-bounded" {
					var v boards.CardPage
					if json.Unmarshal(data, &v) != nil || len(v.Items) > 25 {
						t.Fatal("unbounded cards")
					}
				}
			})
		}()
	}
	// Measure real authenticated writes with current revisions. Preparation reads
	// are outside write timings and every save has a new retry reference.
	getIssue := func() issues.IssueView {
		var v issues.IssueView
		if err := json.Unmarshal(request("GET", "/issues/"+issue.String(), tokens[1], "", nil, ""), &v); err != nil {
			t.Fatal(err)
		}
		return v
	}
	writeDurations := []time.Duration{}
	for i := 0; i < 100; i++ {
		v := getIssue()
		input := issues.UpdateIssueFields{
			ExpectedRevision: v.Summary.Revision,
			Editable: issues.IssueEditable{
				Title:       fmt.Sprintf("عربي updated %d", i),
				Description: v.Description,
				Type:        v.Summary.Type,
				Priority:    v.Summary.Priority,
				AssigneeID:  nil,
				DueDate:     nil,
				LabelIDs:    []command.LabelID{},
			},
		}
		data, _ := json.Marshal(input)
		start := time.Now()
		out := request("PUT", "/issues/"+issue.String(), tokens[1], uuid.NewString(), data, "application/json")
		var saved command.Saved[issues.IssueView]
		if json.Unmarshal(out, &saved) != nil || saved.Result.Summary.Revision <= v.Summary.Revision {
			t.Fatal("write did not commit")
		}
		writeDurations = append(writeDurations, time.Since(start))
	}
	recordDurations(t, &report, "issue-update", writeDurations, 750*time.Millisecond)
	writeDurations = nil
	measure(t, &report, "issue-create", 100, 750*time.Millisecond, func(i int) {
		data, _ := json.Marshal(issues.CreateIssueFields{Title: fmt.Sprintf("Created عربي %d", i)})
		out := request("POST", "/projects/"+project.String()+"/issues", tokens[1], uuid.NewString(), data, "application/json")
		var value command.Saved[issues.IssueView]
		if json.Unmarshal(out, &value) != nil || value.Result.Summary.ID.UUID == uuid.Nil {
			t.Fatal("create failed")
		}
	})
	measure(t, &report, "comment-and-next-inbox", 100, 5*time.Second, func(i int) {
		body := comments.CreateFields{Body: comments.Body{
			HTML:           fmt.Sprintf(`<p>تعليق %d <span data-user-id="%s">Viewer</span></p>`, i, r.Viewer.String()),
			MentionUserIDs: []command.UserID{r.Viewer},
			PictureIDs:     []command.PictureID{},
		}}
		data, _ := json.Marshal(body)
		request("POST", "/issues/"+issue.String()+"/comments", tokens[1], uuid.NewString(), data, "application/json")
		var summary notifications.InboxSummary
		if json.Unmarshal(request("GET", "/notifications/summary", tokens[2], "", nil, ""), &summary) != nil || summary.UnreadCount < 1 {
			t.Fatal("next inbox read missing")
		}
	})
	// Every trial transfers the maximum accepted image, through the actual
	// multipart handler and streaming storage path, with fresh object identities.
	image := testenv.PNGSize(t, 10<<20)
	var multipartBody bytes.Buffer
	writer := multipart.NewWriter(&multipartBody)
	metadata, _ := json.Marshal(pictures.UploadMetadata{
		Filename:    "scale.png",
		Description: "صورة كبيرة",
		MIMEType:    "image/png",
		Publication: pictures.Gallery,
	})
	writer.WriteField("metadata", string(metadata))
	part, err := writer.CreateFormFile("file", "scale.png")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = part.Write(image); err != nil {
		t.Fatal(err)
	}
	if err = writer.Close(); err != nil {
		t.Fatal(err)
	}
	measure(t, &report, "picture-upload-10MiB", 100, 30*time.Second, func(_ int) {
		var saved command.Saved[pictures.PictureView]
		body := request("POST", "/issues/"+issue.String()+"/pictures", tokens[1], uuid.NewString(), multipartBody.Bytes(), writer.FormDataContentType())
		if json.Unmarshal(body, &saved) != nil || saved.Result.ByteSize != 10<<20 {
			t.Fatal("max picture not saved")
		}
	})
	measure(t, &report, "picture-download-1MiB", 100, 500*time.Millisecond, func(_ int) {
		body := request("GET", "/pictures/"+f.Pictures[0].String()+"/content", tokens[1], "", nil, "")
		if len(body) != 1<<20 {
			t.Fatal("download incomplete")
		}
	})
	// Warm all50 real identities, then issue100 rounds of simultaneous requests.
	for _, token := range tokens {
		request("GET", "/me", token, "", nil, "")
	}
	measure(t, &report, "50-concurrent-users-round", 100, 5*time.Second, func(_ int) {
		var wg sync.WaitGroup
		for _, token := range tokens {
			wg.Add(1)
			go func(token string) { defer wg.Done(); request("GET", "/boards/"+board.String(), token, "", nil, "") }(token)
		}
		wg.Wait()
	})
	stat := r.ApplicationPoolStats()
	report.PoolMax = stat.MaxConns()
	report.PoolAcquireCount = stat.AcquireCount()
	report.PoolAcquireMS = float64(stat.AcquireDuration().Microseconds()) / 1000
	report.PoolEmptyAcquireCount = stat.EmptyAcquireCount()
	if err := r.Pool.QueryRow(ctx, `SELECT count(*) FROM pg_locks WHERE NOT granted AND pid IN(SELECT pid FROM pg_stat_activity WHERE datname=current_database())`).Scan(&report.LocksWaiting); err != nil {
		t.Fatal(err)
	}
	writeReport(t, report)

}
