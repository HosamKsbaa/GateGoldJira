package planning

import (
	"context"
	"encoding/json"
	"errors"
	"gategoldjira/backend/db/migrations"
	"gategoldjira/backend/internal/features/boards"
	"gategoldjira/backend/internal/features/issues"
	"gategoldjira/backend/internal/features/projects"
	"gategoldjira/backend/internal/platform/auth"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/httpapi"
	"gategoldjira/backend/tests/testenv"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"math"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

type fixture struct {
	s                               *Service
	pool                            *pgxpool.Pool
	project                         command.ProjectID
	owner, member, viewer, outsider command.Actor
}

func planningDatabase(t *testing.T) fixture {
	t.Helper()
	ctx := context.Background()
	pool := testenv.Database(t)
	if err := migrations.Apply(ctx, pool); err != nil {
		t.Fatal(err)
	}
	cursors, _ := command.NewCursorSigner([]byte(strings.Repeat("q", 32)))
	f := fixture{s: New(command.Runner{Pool: pool}, cursors), pool: pool}
	for i, actor := range []*command.Actor{&f.owner, &f.member, &f.viewer, &f.outsider} {
		*actor = command.Actor{
			UserID:  command.NewID[command.UserKind](),
			Channel: command.REST,
			Today:   command.Today(time.Now(), time.UTC),
		}
		if _, err := pool.Exec(ctx, "INSERT INTO users(id,email,email_key,display_name,approved_at,is_administrator) VALUES($1,$2,$2,$3,now(),$4)", actor.UserID.UUID, []string{
			"owner@test.example",
			"member@test.example",
			"viewer@test.example",
			"outsider@test.example",
		}[i], []string{"Owner", "مطور", "Viewer", "Outsider"}[i], i == 0); err != nil {
			t.Fatal(err)
		}
	}
	p, err := projects.New(command.Runner{Pool: pool}, cursors).Create(ctx, f.owner, projects.CreateInput{
		Key:            "PLAN",
		Name:           "Planning project",
		RetryReference: uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	f.project = p.Body.Result.ID
	for _, membership := range []struct {
		actor command.Actor
		role  string
	}{{f.member, "member"}, {f.viewer, "viewer"}} {
		if _, err := pool.Exec(ctx, "INSERT INTO project_memberships(project_id,user_id,role)VALUES($1,$2,$3)", f.project.UUID, membership.actor.UserID.UUID, membership.role); err != nil {
			t.Fatal(err)
		}
	}
	return f
}
func (f fixture) item(t *testing.T, kind Kind, name string) PlanningItemView {
	t.Helper()
	out, err := f.s.Create(context.Background(), f.member, PlanningCreateInput{
		ProjectID:            f.project,
		PlanningCreateFields: PlanningCreateFields{Kind: kind, Name: name, Status: Planned},
		RetryReference:       uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	return out.Body.Result
}
func (f fixture) issue(t *testing.T, number int64, status string) command.IssueID {
	t.Helper()
	id := command.NewID[command.IssueKind]()
	if _, err := f.pool.Exec(context.Background(), "INSERT INTO issues(id,project_id,number,title,status,reporter_id,rank,created_at)VALUES($1,$2,$3,'Work item',$4,$5,$6,now()-interval '20 days')", id.UUID, f.project.UUID, number, status, f.member.UserID.UUID, number*1024); err != nil {
		t.Fatal(err)
	}
	return id
}
func failureCode(err error) command.FailureCode {
	var failure *command.Failure
	if errors.As(err, &failure) {
		return failure.Code
	}
	return ""
}
func TestPlanningPermissionsRevisionsRetryAndProgress(t *testing.T) {
	f := planningDatabase(t)
	ctx := context.Background()
	input := PlanningCreateInput{
		ProjectID: f.project,
		PlanningCreateFields: PlanningCreateFields{
			Kind:        Epic,
			Name:        "بوابة 😀",
			Description: "Larger goal",
			Status:      Planned,
		},
		RetryReference: uuid.NewString(),
	}
	first, err := f.s.Create(ctx, f.member, input)
	if err != nil || first.HTTPStatus != 201 || first.Body.Receipt.EventID == nil {
		t.Fatal("create", err)
	}
	var descriptionAudit string
	if err := f.pool.QueryRow(ctx, "SELECT f->>'after' FROM activity_events e CROSS JOIN LATERAL jsonb_array_elements(e.changes->'fields') f WHERE e.id=$1 AND f->>'field'='description'", *first.Body.Receipt.EventID).Scan(&descriptionAudit); err != nil || descriptionAudit != input.Description {
		t.Fatal("initial planning description missing from retained audit", err)
	}
	mcp := f.member
	mcp.Channel = command.MCP
	replay, err := f.s.Create(ctx, mcp, input)
	if err != nil || !replay.Body.Receipt.Replayed || replay.Body.Result.ID != first.Body.Result.ID {
		t.Fatal("cross channel replay", err)
	}
	input.Name = "Different"
	if _, err = f.s.Create(ctx, f.member, input); failureCode(err) != command.RetryReferenceReused {
		t.Fatal("retry ref accepted new input", err)
	}
	input.RetryReference = uuid.NewString()
	if _, err = f.s.Create(ctx, f.viewer, input); failureCode(err) != command.Forbidden {
		t.Fatal("viewer write", err)
	}
	if _, err = f.s.List(ctx, f.outsider, PlanningListInput{ProjectID: f.project}); failureCode(err) != command.Unavailable {
		t.Fatal("outsider read", err)
	}
	epic := first.Body.Result
	release := f.item(t, Release, "October release")
	issue := f.issue(t, 1, "done")
	current, err := f.s.GetIssue(ctx, f.member, GetIssueInput{issue})
	if err != nil || current.Revision != 0 {
		t.Fatal("initial assignment", err)
	}
	assign := IssuePlanningInput{
		IssueID: issue,
		IssuePlanningFields: IssuePlanningFields{
			ExpectedRevision: 0,
			EpicID:           &epic.ID,
			ReleaseID:        &release.ID,
		},
		RetryReference: uuid.NewString(),
	}
	saved, err := f.s.SetIssue(ctx, f.member, assign)
	if err != nil || saved.Body.Result.Revision != 1 || saved.Body.Result.EpicName == nil || *saved.Body.Result.EpicName != epic.Name {
		t.Fatal("assign", err)
	}
	again, err := f.s.SetIssue(ctx, mcp, assign)
	if err != nil || !again.Body.Receipt.Replayed {
		t.Fatal("assignment replay", err)
	}
	assign.RetryReference = uuid.NewString()
	if _, err = f.s.SetIssue(ctx, f.member, assign); failureCode(err) != command.Conflict {
		t.Fatal("stale assignment accepted", err)
	}
	assign.ExpectedRevision = 1
	assign.EpicID = &release.ID
	if _, err = f.s.SetIssue(ctx, f.member, assign); failureCode(err) != command.Validation {
		t.Fatal("release accepted as epic", err)
	}
	list, err := f.s.List(ctx, f.viewer, PlanningListInput{ProjectID: f.project})
	if err != nil || len(list.Items) != 2 {
		t.Fatal("read", err)
	}
	for _, item := range list.Items {
		if item.IssueCount != 1 || item.CompletedCount != 1 {
			t.Fatal("progress", item)
		}
	}
	issues, err := f.s.ListIssues(ctx, f.viewer, PlanningIssuesInput{ProjectID: f.project, PlanningID: epic.ID})
	if err != nil || len(issues.Items) != 1 || issues.Items[0].ID != issue {
		t.Fatal("linked work", err)
	}
	update := PlanningUpdateInput{
		ProjectID:  f.project,
		PlanningID: epic.ID,
		PlanningUpdateFields: PlanningUpdateFields{
			ExpectedRevision: 1,
			Name:             epic.Name,
			Description:      epic.Description,
			Status:           Active,
		},
		RetryReference: uuid.NewString(),
	}
	updated, err := f.s.Update(ctx, f.member, update)
	if err != nil || updated.Body.Result.Revision != 2 {
		t.Fatal("update", err)
	}
	update.RetryReference = uuid.NewString()
	_, err = f.s.Update(ctx, f.member, update)
	var conflict *ConflictError
	if !errors.As(err, &conflict) || conflict.Current == nil || conflict.Current.Revision != 2 {
		t.Fatal("typed authorized conflict", err)
	}
	if _, err = f.pool.Exec(ctx, "UPDATE project_memberships SET removed_at=now() WHERE project_id=$1 AND user_id=$2", f.project.UUID, f.member.UserID.UUID); err != nil {
		t.Fatal(err)
	}
	if _, err = f.s.Create(ctx, mcp, PlanningCreateInput{
		ProjectID: f.project,
		PlanningCreateFields: PlanningCreateFields{
			Kind:   Epic,
			Name:   "No access",
			Status: Planned,
		},
		RetryReference: uuid.NewString(),
	}); failureCode(err) != command.Unavailable {
		t.Fatal("removed access", err)
	}
}
func TestPlanningPaginationAndCompetingWrites(t *testing.T) {
	f := planningDatabase(t)
	ctx := context.Background()
	for _, name := range []string{"Z", "A", "😀", "مرحلة", "B"} {
		f.item(t, Epic, name)
	}
	limit := 2
	in := PlanningListInput{ProjectID: f.project, Page: command.PageRequest{Limit: &limit}}
	seen := map[ID]bool{}
	for {
		page, err := f.s.List(ctx, f.member, in)
		if err != nil || page.TotalMatching != 5 || len(page.Items) > 2 {
			t.Fatal("page", err)
		}
		for _, item := range page.Items {
			if seen[item.ID] {
				t.Fatal("duplicate")
			}
			seen[item.ID] = true
		}
		if page.NextCursor == nil {
			break
		}
		in.Page.Cursor = page.NextCursor
	}
	if len(seen) != 5 {
		t.Fatal("missing items")
	}
	if _, err := f.s.List(ctx, f.viewer, in); failureCode(err) != command.Validation {
		t.Fatal("cursor rebound across caller", err)
	}
	item := f.item(t, Release, "Release")
	start := make(chan struct{})
	results := make(chan error, 2)
	var wg sync.WaitGroup
	for _, name := range []string{"One", "Two"} {
		wg.Add(1)
		go func(name string) {
			defer wg.Done()
			<-start
			_, err := f.s.Update(ctx, f.member, PlanningUpdateInput{
				ProjectID:  f.project,
				PlanningID: item.ID,
				PlanningUpdateFields: PlanningUpdateFields{
					ExpectedRevision: 1,
					Name:             name,
					Status:           Active,
				},
				RetryReference: uuid.NewString(),
			})
			results <- err
		}(name)
	}
	close(start)
	wg.Wait()
	close(results)
	success, conflicts := 0, 0
	for err := range results {
		if err == nil {
			success++
		} else if failureCode(err) == command.Conflict {
			conflicts++
		} else {
			t.Fatal(err)
		}
	}
	if success != 1 || conflicts != 1 {
		t.Fatal("concurrent edit not serialized")
	}
}
func (f fixture) transition(t *testing.T, issue command.IssueID, before, after string, at time.Time) {
	t.Helper()
	fields, err := json.Marshal(struct {
		Version int `json:"version"`
		Fields  []struct {
			Field  string `json:"field"`
			Before string `json:"before"`
			After  string `json:"after"`
		} `json:"fields"`
	}{1, []struct {
		Field  string `json:"field"`
		Before string `json:"before"`
		After  string `json:"after"`
	}{{"status", before, after}}})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = f.pool.Exec(context.Background(), "INSERT INTO activity_events(id,actor_id,channel,action,resource_kind,resource_id,project_id,issue_id,changes,created_at)VALUES($1,$2,'web','move_issue','issue',$3,$4,$3,$5,$6)", uuid.New(), f.member.UserID.UUID, issue.UUID, f.project.UUID, fields, at); err != nil {
		t.Fatal(err)
	}
}
func TestKanbanHistoryCyclesReopenAndCurrentAge(t *testing.T) {
	f := planningDatabase(t)
	ctx := context.Background()
	issue := f.issue(t, 1, "done")
	base := time.Date(2026, 10, 1, 10, 0, 0, 0, time.UTC)
	f.transition(t, issue, "todo", "in_progress", base)
	f.transition(t, issue, "in_progress", "review", base.Add(24*time.Hour))
	f.transition(t, issue, "review", "done", base.Add(48*time.Hour))
	f.transition(t, issue, "done", "todo", base.Add(72*time.Hour))
	f.transition(t, issue, "todo", "done", base.Add(96*time.Hour))
	unmeasured := f.issue(t, 2, "done")
	f.transition(t, unmeasured, "todo", "done", base.Add(96*time.Hour))
	active := f.issue(t, 3, "in_progress")
	f.transition(t, active, "todo", "in_progress", base.Add(24*time.Hour))
	blocker := f.issue(t, 4, "todo")
	if _, err := f.pool.Exec(ctx, "INSERT INTO issue_dependencies(project_id,dependent_id,blocker_id,created_by)VALUES($1,$2,$3,$4)", f.project.UUID, active.UUID, blocker.UUID, f.member.UserID.UUID); err != nil {
		t.Fatal(err)
	}
	from, _ := command.ParseDate("2026-10-01")
	through, _ := command.ParseDate("2026-10-05")
	limit := 1
	in := KanbanReportInput{ProjectID: f.project, From: from, Through: through, Page: command.PageRequest{Limit: &limit}}
	report, err := f.s.Report(ctx, f.viewer, in)
	if err != nil {
		t.Fatal(err)
	}
	if report.CompletedCycles != 3 || report.MeasuredCycles != 2 || report.AverageCycleDays == nil || math.Abs(*report.AverageCycleDays-1.5) > 0.00001 {
		t.Fatal("timing not from history", report)
	}
	if report.ActiveCount != 2 || report.BlockedCount != 1 || report.Work.TotalMatching != 2 || len(report.Work.Items) != 1 || report.Work.Items[0].StartedAt == nil || report.Work.Items[0].UnfinishedBlockers != 1 || report.Work.NextCursor == nil {
		t.Fatal("active work", report)
	}
	in.Page.Cursor = report.Work.NextCursor
	second, err := f.s.Report(ctx, f.viewer, in)
	if err != nil || len(second.Work.Items) != 1 || second.Work.Items[0].ID != blocker || second.Work.Items[0].CycleAgeDays != nil {
		t.Fatal("work page", err)
	}
	if _, err := f.s.Report(ctx, f.outsider, KanbanReportInput{
		ProjectID: f.project,
		From:      from,
		Through:   through,
	}); failureCode(err) != command.Unavailable {
		t.Fatal("report permission", err)
	}
	old, _ := command.ParseDate("2020-01-01")
	if _, err := f.s.Report(ctx, f.member, KanbanReportInput{
		ProjectID: f.project,
		From:      old,
		Through:   through,
	}); failureCode(err) != command.Validation {
		t.Fatal("unbounded window", err)
	}
	if _, err := f.pool.Exec(ctx, "UPDATE issues SET updated_at=now()+interval '10 years' WHERE id=$1", issue.UUID); err != nil {
		t.Fatal(err)
	}
	again, err := f.s.Report(ctx, f.member, KanbanReportInput{ProjectID: f.project, From: from, Through: through})
	if err != nil || again.AverageCycleDays == nil || *again.AverageCycleDays != 1.5 {
		t.Fatal("updatedAt changed cycle time", err)
	}
}

func TestInitialActiveCreationStartsMeasuredCycle(t *testing.T) {
	f := planningDatabase(t)
	ctx := context.Background()
	signer, _ := command.NewCursorSigner([]byte(strings.Repeat("a", 32)))
	service := issues.New(command.Runner{Pool: f.pool}, signer)
	service.WithBoards(boards.New(command.Runner{Pool: f.pool}, signer, issues.Summary).Access())
	for _, initial := range []command.Status{command.Review, command.Todo} {
		created, err := service.Create(ctx, f.member, issues.CreateInput{
			ProjectID: f.project,
			CreateIssueFields: issues.CreateIssueFields{
				Title:         "Creation timing",
				InitialStatus: initial,
			},
			RetryReference: uuid.NewString(),
		})
		if err != nil {
			t.Fatal(err)
		}
		issue := created.Body.Result
		var target command.Revision
		for _, order := range issue.OrderRevisions {
			if order.Status == command.Done {
				target = order.Revision
			}
		}
		_, err = service.Move(ctx, f.member, issues.MoveInput{
			IssueID:                     issue.Summary.ID,
			ExpectedRevision:            issue.Summary.Revision,
			TargetStatus:                command.Done,
			ExpectedSourceOrderRevision: issue.SourceOrderRevision,
			ExpectedTargetOrderRevision: target,
			RetryReference:              uuid.NewString(),
		})
		if err != nil {
			t.Fatal(err)
		}
	}
	today := command.Today(time.Now(), time.UTC)
	report, err := f.s.Report(ctx, f.member, KanbanReportInput{ProjectID: f.project, From: today, Through: today})
	if err != nil {
		t.Fatal(err)
	}
	if report.CompletedCycles != 2 || report.MeasuredCycles != 1 || report.AverageCycleDays == nil {
		t.Fatal("creation category missing from timing history", report)
	}
}

func TestReportHTTPQueryUsesCalendarDates(t *testing.T) {
	f := planningDatabase(t)
	mux := http.NewServeMux()
	api := httpapi.New(mux)
	RegisterHTTP(api, f.s)
	request := httptest.NewRequest("GET", "/api/v1/projects/"+f.project.String()+"/kanban-report?from=2026-10-01&through=2026-10-31", nil)
	request = request.WithContext(auth.WithActor(request.Context(), f.member))
	recorder := httptest.NewRecorder()
	mux.ServeHTTP(recorder, request)
	var report KanbanReport
	if recorder.Code != 200 || json.Unmarshal(recorder.Body.Bytes(), &report) != nil || report.From.String() != "2026-10-01" {
		t.Fatal("typed report date query rejected", recorder.Code, recorder.Body.String())
	}
}
