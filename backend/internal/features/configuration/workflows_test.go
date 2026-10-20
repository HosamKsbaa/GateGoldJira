package configuration

import (
	"context"
	"encoding/json"
	"errors"
	"gategoldjira/backend/internal/features/issues"
	"gategoldjira/backend/internal/platform/command"
	"github.com/google/uuid"
	"testing"
)

func (f fixture) flow(t *testing.T, name string) (command.WorkflowID, command.StageID, command.StageID) {
	t.Helper()
	ctx := context.Background()
	id := command.NewID[command.WorkflowKind]()
	out, err := f.service.SaveWorkflow(ctx, f.admin, SaveWorkflowInput{
		ProjectID:  f.project,
		WorkflowID: id,
		SaveWorkflowFields: SaveWorkflowFields{
			ExpectedRevision: f.view(t).Revision,
			Name:             name,
		},
		RetryReference: uuid.NewString(),
	})
	if err != nil || out.Body.Result.Workflow.ID != id {
		t.Fatal("create flow", err)
	}
	todo, done := command.NewID[command.StageKind](), command.NewID[command.StageKind]()
	for i, stage := range []struct {
		id       command.StageID
		name     string
		category command.Status
		initial  bool
	}{{todo, "جاهز", command.Todo, true}, {done, "Done", command.Done, false}} {
		_, err = f.service.SaveStage(ctx, f.admin, SaveStageInput{
			ProjectID:  f.project,
			WorkflowID: id,
			StageID:    stage.id,
			SaveStageFields: SaveStageFields{
				ExpectedRevision: f.view(t).Revision,
				Name:             stage.name,
				Category:         stage.category,
				Position:         command.Position(i + 1),
				Initial:          stage.initial,
				AcceptsEntries:   true,
			},
			RetryReference: uuid.NewString(),
		})
		if err != nil {
			t.Fatal("create stage", err)
		}
	}
	f.edge(t, id, todo, done)
	return id, todo, done
}
func (f fixture) edge(t *testing.T, flow command.WorkflowID, from, to command.StageID) command.TransitionID {
	t.Helper()
	id := command.NewID[command.TransitionKind]()
	_, err := f.service.SaveTransition(context.Background(), f.admin, SaveTransitionInput{
		ProjectID:    f.project,
		WorkflowID:   flow,
		TransitionID: id,
		SaveTransitionFields: SaveTransitionFields{
			ExpectedRevision: f.view(t).Revision,
			FromStageID:      from,
			ToStageID:        to,
		},
		RetryReference: uuid.NewString(),
	})
	if err != nil {
		t.Fatal("create edge", err)
	}
	return id
}
func (f fixture) bind(t *testing.T, flow command.WorkflowID, def, intake bool) {
	t.Helper()
	v := f.view(t)
	_, err := f.service.SetBinding(context.Background(), f.admin, SetBindingInput{
		ProjectID:  f.project,
		TypeID:     v.Defaults.StandardTypeID,
		WorkflowID: flow,
		SetBindingFields: SetBindingFields{
			ExpectedRevision: v.Revision,
			Default:          def,
			AcceptsNew:       intake,
		},
		RetryReference: uuid.NewString(),
	})
	if err != nil {
		t.Fatal("bind workflow", err)
	}
}
func TestWorkflowPreparationPagesNoopScopeAndReplay(t *testing.T) {
	f := configurationFixture(t)
	ctx := context.Background()
	flow, todo, _ := f.flow(t, "تطوير المنتج")
	limit := 1
	page, err := f.service.Stages(ctx, f.viewer, StageListInput{
		ProjectID:  f.project,
		WorkflowID: flow,
		Page:       command.PageRequest{Limit: &limit},
	})
	if err != nil || len(page.Items) != 1 || page.Items[0].ID != todo || page.NextCursor == nil {
		t.Fatal("stage page", page, err)
	}
	next, err := f.service.Stages(ctx, f.viewer, StageListInput{
		ProjectID:  f.project,
		WorkflowID: flow,
		Page:       command.PageRequest{Limit: &limit, Cursor: page.NextCursor},
	})
	if err != nil || len(next.Items) != 1 || next.NextCursor != nil {
		t.Fatal("next stage", next, err)
	}
	_, err = f.service.Stages(ctx, f.admin, StageListInput{ProjectID: f.other, WorkflowID: flow})
	expectCode(t, err, command.Unavailable)
	in := SaveWorkflowInput{
		ProjectID:  f.project,
		WorkflowID: flow,
		SaveWorkflowFields: SaveWorkflowFields{
			ExpectedRevision: f.view(t).Revision,
			Name:             "تطوير المنتج",
		},
		RetryReference: uuid.NewString(),
	}
	_, err = f.service.SaveWorkflow(ctx, f.member, in)
	expectCode(t, err, command.Forbidden)
	out, err := f.service.SaveWorkflow(ctx, f.admin, in)
	if err != nil || out.Body.Receipt.EventID != nil || out.Body.Result.Configuration.Revision != in.ExpectedRevision {
		t.Fatal("flow no-op", err)
	}
	replay, err := f.service.SaveWorkflow(ctx, f.admin, in)
	if err != nil || !replay.Body.Receipt.Replayed {
		t.Fatal("flow replay", err)
	}
	if _, err = f.pool.Exec(ctx, "UPDATE users SET disabled_at=now() WHERE id=$1", f.admin.UserID.UUID); err != nil {
		t.Fatal(err)
	}
	_, err = f.service.SaveWorkflow(ctx, f.admin, in)
	expectCode(t, err, command.AccountInactive)
}
func TestWorkflowDefaultKeepsExistingIssuesAndCompletionPath(t *testing.T) {
	f := configurationFixture(t)
	ctx := context.Background()
	is := issues.New(command.Runner{Pool: f.pool}, f.service.cursors)
	old, err := is.Create(ctx, f.member, issues.CreateInput{
		ProjectID:         f.project,
		CreateIssueFields: issues.CreateIssueFields{Title: "Existing work"},
		RetryReference:    uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	var oldFlow uuid.UUID
	if err = f.pool.QueryRow(ctx, "SELECT workflow_id FROM issues WHERE id=$1", old.Body.Result.Summary.ID.UUID).Scan(&oldFlow); err != nil {
		t.Fatal(err)
	}
	flow, todo, done := f.flow(t, "New delivery flow")
	if _, err = f.pool.Exec(ctx, "UPDATE projects SET core_mode='modern' WHERE id=$1", f.project.UUID); err != nil {
		t.Fatal(err)
	}
	f.cover(t, flow)
	f.bind(t, flow, true, true)
	var actual uuid.UUID
	if err = f.pool.QueryRow(ctx, "SELECT workflow_id FROM issues WHERE id=$1", old.Body.Result.Summary.ID.UUID).Scan(&actual); err != nil || actual != oldFlow {
		t.Fatal("default migrated existing issue", err)
	}
	var edge uuid.UUID
	if err = f.pool.QueryRow(ctx, "SELECT id FROM workflow_transitions WHERE workflow_id=$1 AND from_stage_id=$2 AND to_stage_id=$3", flow.UUID, todo.UUID, done.UUID).Scan(&edge); err != nil {
		t.Fatal(err)
	}
	_, err = f.service.SaveTransition(ctx, f.admin, SaveTransitionInput{
		ProjectID:    f.project,
		WorkflowID:   flow,
		TransitionID: command.TransitionID{UUID: edge},
		SaveTransitionFields: SaveTransitionFields{
			ExpectedRevision: f.view(t).Revision,
			FromStageID:      todo,
			ToStageID:        done,
			Retired:          true,
		},
		RetryReference: uuid.NewString(),
	})
	expectCode(t, err, command.Validation)
	var retired bool
	if err = f.pool.QueryRow(ctx, "SELECT retired FROM workflow_transitions WHERE id=$1", edge).Scan(&retired); err != nil || retired {
		t.Fatal("stranded flow committed", err)
	}
	// Prepare closed stages incrementally without stranding an active workflow.
	qa := command.NewID[command.StageKind]()
	_, err = f.service.SaveStage(ctx, f.admin, SaveStageInput{
		ProjectID:  f.project,
		WorkflowID: flow,
		StageID:    qa,
		SaveStageFields: SaveStageFields{
			ExpectedRevision: f.view(t).Revision,
			Name:             "QA",
			Category:         command.Review,
			Position:         2,
		},
		RetryReference: uuid.NewString(),
	})
	if err != nil {
		t.Fatal("closed draft stage", err)
	}
	f.edge(t, flow, todo, qa)
	f.edge(t, flow, qa, done)
	f.cover(t, flow)
	_, err = f.service.SaveStage(ctx, f.admin, SaveStageInput{
		ProjectID:  f.project,
		WorkflowID: flow,
		StageID:    qa,
		SaveStageFields: SaveStageFields{
			ExpectedRevision: f.view(t).Revision,
			Name:             "QA",
			Category:         command.Review,
			Position:         2,
			AcceptsEntries:   true,
		},
		RetryReference: uuid.NewString(),
	})
	if err != nil {
		t.Fatal("open connected stage", err)
	}
	_, err = f.service.SaveWorkflow(ctx, f.admin, SaveWorkflowInput{
		ProjectID:  f.project,
		WorkflowID: flow,
		SaveWorkflowFields: SaveWorkflowFields{
			ExpectedRevision: f.view(t).Revision,
			Name:             "New delivery flow",
			Retired:          true,
		},
		RetryReference: uuid.NewString(),
	})
	expectCode(t, err, command.Validation)
}
func TestWorkflowBindingChecksDefaultBoardCoverage(t *testing.T) {
	f := configurationFixture(t)
	ctx := context.Background()
	flow, _, _ := f.flow(t, "Unmapped flow")
	board := command.BoardWorkflow{Columns: []command.WorkflowColumn{
		{
			Status:         command.Todo,
			Name:           "To do",
			AllowedTargets: []command.Status{command.Done},
		},
		{
			Status:         command.Done,
			Name:           "Done",
			AllowedTargets: []command.Status{command.Todo},
		},
	}}
	raw, err := json.Marshal(board)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = f.pool.Exec(ctx, "UPDATE boards SET workflow=$2 WHERE project_id=$1 AND is_default", f.project.UUID, raw); err != nil {
		t.Fatal(err)
	}
	if _, err = f.pool.Exec(ctx, "UPDATE projects SET core_mode='modern' WHERE id=$1", f.project.UUID); err != nil {
		t.Fatal(err)
	}
	current := f.view(t)
	_, err = f.service.SetBinding(ctx, f.admin, SetBindingInput{
		ProjectID:  f.project,
		TypeID:     current.Defaults.StandardTypeID,
		WorkflowID: flow,
		SetBindingFields: SetBindingFields{
			ExpectedRevision: current.Revision,
			Default:          true,
			AcceptsNew:       true,
		},
		RetryReference: uuid.NewString(),
	})
	expectCode(t, err, command.Validation)
	var defaults int
	if err = f.pool.QueryRow(ctx, "SELECT count(*) FROM issue_type_workflows WHERE project_id=$1 AND type_id=$2 AND is_default", f.project.UUID, current.Defaults.StandardTypeID.UUID).Scan(&defaults); err != nil || defaults != 1 || f.view(t).Revision != current.Revision {
		t.Fatal("coverage rollback", err)
	}
}
func TestWorkflowBoundedMigrationAndClosedStageRetirement(t *testing.T) {
	f := configurationFixture(t)
	ctx := context.Background()
	is := issues.New(command.Runner{Pool: f.pool}, f.service.cursors)
	f.service.WithStageMigrator(is.MigrateWorkflowStage)
	for range 3 {
		if _, err := is.Create(ctx, f.member, issues.CreateInput{
			ProjectID:         f.project,
			CreateIssueFields: issues.CreateIssueFields{Title: "Review work"},
			RetryReference:    uuid.NewString(),
		}); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := f.pool.Exec(ctx, "UPDATE issues SET status='review' WHERE project_id=$1", f.project.UUID); err != nil {
		t.Fatal(err)
	}
	var sourceID, sourceFlow uuid.UUID
	if err := f.pool.QueryRow(ctx, "SELECT id,workflow_id FROM workflow_stages WHERE project_id=$1 AND legacy_status='review'", f.project.UUID).Scan(&sourceID, &sourceFlow); err != nil {
		t.Fatal(err)
	}
	flow, todo, done := f.flow(t, "Delivery")
	qa := command.NewID[command.StageKind]()
	_, err := f.service.SaveStage(ctx, f.admin, SaveStageInput{
		ProjectID:  f.project,
		WorkflowID: flow,
		StageID:    qa,
		SaveStageFields: SaveStageFields{
			ExpectedRevision: f.view(t).Revision,
			Name:             "QA",
			Category:         command.Review,
			Position:         2,
			AcceptsEntries:   true,
		},
		RetryReference: uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	f.edge(t, flow, todo, qa)
	f.edge(t, flow, qa, done)
	if _, err = f.pool.Exec(ctx, "UPDATE projects SET core_mode='modern' WHERE id=$1", f.project.UUID); err != nil {
		t.Fatal(err)
	}
	f.cover(t, flow)
	f.bind(t, flow, false, false)
	source := SaveStageInput{
		ProjectID:  f.project,
		WorkflowID: command.WorkflowID{UUID: sourceFlow},
		StageID:    command.StageID{UUID: sourceID},
		SaveStageFields: SaveStageFields{
			ExpectedRevision: f.view(t).Revision,
			Name:             "Review",
			Category:         command.Review,
			Position:         3,
		},
		RetryReference: uuid.NewString(),
	}
	if _, err = f.service.SaveStage(ctx, f.admin, source); err != nil {
		t.Fatal("close intake", err)
	}
	source.ExpectedRevision = f.view(t).Revision
	source.Retired = true
	source.RetryReference = uuid.NewString()
	_, err = f.service.SaveStage(ctx, f.admin, source)
	expectCode(t, err, command.Validation)
	input := MigrationInput{
		ProjectID: f.project,
		MigrationFields: MigrationFields{
			ExpectedRevision: f.view(t).Revision,
			SourceStageID:    source.StageID,
			TargetStageID:    qa,
			Limit:            2,
		},
		RetryReference: uuid.NewString(),
	}
	calls := 0
	f.service.WithStageMigrator(func(ctx context.Context, m *command.Mutation, p command.ProjectID, id command.IssueID, target command.StageMigrationTarget) error {
		calls++
		if calls == 2 {
			return validation("migration", "Fixture rejected the second move.")
		}
		return is.MigrateWorkflowStage(ctx, m, p, id, target)
	})
	_, err = f.service.Migrate(ctx, f.admin, input)
	expectCode(t, err, command.Validation)
	var unchanged int
	if err = f.pool.QueryRow(ctx, "SELECT count(*) FROM issues WHERE project_id=$1 AND stage_id=$2 AND revision=1", f.project.UUID, sourceID).Scan(&unchanged); err != nil || unchanged != 3 || f.view(t).Revision != input.ExpectedRevision {
		t.Fatal("batch rollback", unchanged, err)
	}
	var moves int
	if err = f.pool.QueryRow(ctx, "SELECT count(*) FROM activity_events WHERE project_id=$1 AND action='move_issue'", f.project.UUID).Scan(&moves); err != nil || moves != 0 {
		t.Fatal("rolled back movement event", moves, err)
	}
	f.service.WithStageMigrator(is.MigrateWorkflowStage)
	out, err := f.service.Migrate(ctx, f.admin, input)
	if err != nil || out.Body.Result.Moved != 2 || out.Body.Result.Remaining != 1 {
		t.Fatal("first batch", out, err)
	}
	replay, err := f.service.Migrate(ctx, f.admin, input)
	if err != nil || !replay.Body.Receipt.Replayed || replay.Body.Result.Remaining != 1 {
		t.Fatal("migration replay", err)
	}
	input.ExpectedRevision = f.view(t).Revision
	input.RetryReference = uuid.NewString()
	out, err = f.service.Migrate(ctx, f.admin, input)
	if err != nil || out.Body.Result.Moved != 1 || out.Body.Result.Remaining != 0 {
		t.Fatal("final batch", out, err)
	}
	source.ExpectedRevision = f.view(t).Revision
	source.RetryReference = uuid.NewString()
	if _, err = f.service.SaveStage(ctx, f.admin, source); err != nil {
		t.Fatal("retire empty source", err)
	}
	var moved int
	if err = f.pool.QueryRow(ctx, "SELECT count(*) FROM issues WHERE project_id=$1 AND workflow_id=$2 AND stage_id=$3 AND revision=2", f.project.UUID, flow.UUID, qa.UUID).Scan(&moved); err != nil || moved != 3 {
		t.Fatal("canonical refs/revisions", moved, err)
	}
	// Reject mismatched scopes before invoking any issue mutation.
	input.SourceStageID = qa
	input.TargetStageID = done
	input.ExpectedRevision = f.view(t).Revision
	input.RetryReference = uuid.NewString()
	_, err = f.service.Migrate(ctx, f.admin, input)
	var failure *command.Failure
	if !errors.As(err, &failure) || failure.Code != command.Validation {
		t.Fatal("cross-category bypass", err)
	}
}

func (f fixture) cover(t *testing.T, flow command.WorkflowID) {
	t.Helper()
	ctx := context.Background()
	if _, err := f.pool.Exec(ctx, "INSERT INTO board_column_stages(project_id,board_id,column_id,stage_id) SELECT s.project_id,b.id,c.id,s.id FROM workflow_stages s JOIN boards b ON b.project_id=s.project_id AND b.is_default JOIN board_columns c ON c.board_id=b.id AND c.legacy_status=s.category WHERE s.workflow_id=$1 ON CONFLICT(board_id,stage_id) DO NOTHING", flow.UUID); err != nil {
		t.Fatal(err)
	}
	var raw []byte
	if err := f.pool.QueryRow(ctx, "SELECT workflow FROM boards WHERE project_id=$1 AND is_default", f.project.UUID).Scan(&raw); err != nil {
		t.Fatal(err)
	}
	var board command.BoardWorkflow
	if err := json.Unmarshal(raw, &board); err != nil {
		t.Fatal(err)
	}
	rows, err := f.pool.Query(ctx, "SELECT legacy_status,name FROM workflow_stages WHERE workflow_id=$1 AND NOT retired ORDER BY position,id", flow.UUID)
	if err != nil {
		t.Fatal(err)
	}
	type entry struct {
		status command.Status
		name   string
	}
	entries := []entry{}
	for rows.Next() {
		var e entry
		if err = rows.Scan(&e.status, &e.name); err != nil {
			t.Fatal(err)
		}
		entries = append(entries, e)
	}
	rows.Close()
	if err = rows.Err(); err != nil {
		t.Fatal(err)
	}
	present := map[command.Status]bool{}
	for _, column := range board.Columns {
		present[column.Status] = true
	}
	for _, e := range entries {
		if present[e.status] {
			continue
		}
		targets := []command.Status{}
		for _, other := range entries {
			if other.status != e.status {
				targets = append(targets, other.status)
			}
		}
		board.Columns = append(board.Columns, command.WorkflowColumn{
			Status:         e.status,
			Name:           e.name + " " + string(e.status[len(e.status)-8:]),
			AllowedTargets: targets,
		})
	}
	raw, err = json.Marshal(board)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = f.pool.Exec(ctx, "UPDATE boards SET workflow=$2 WHERE project_id=$1 AND is_default", f.project.UUID, raw); err != nil {
		t.Fatal(err)
	}
}

func TestWorkflowMigrationRejectsUnfinishedDraftAndConcurrentConfiguration(t *testing.T) {
	f := configurationFixture(t)
	ctx := context.Background()
	is := issues.New(command.Runner{Pool: f.pool}, f.service.cursors)
	created, err := is.Create(ctx, f.member, issues.CreateInput{
		ProjectID:         f.project,
		CreateIssueFields: issues.CreateIssueFields{Title: "Review"},
		RetryReference:    uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = f.pool.Exec(ctx, "UPDATE issues SET status='review' WHERE id=$1", created.Body.Result.Summary.ID.UUID); err != nil {
		t.Fatal(err)
	}
	flow, _, _ := f.flow(t, "Incomplete draft")
	qa := command.NewID[command.StageKind]()
	_, err = f.service.SaveStage(ctx, f.admin, SaveStageInput{
		ProjectID:  f.project,
		WorkflowID: flow,
		StageID:    qa,
		SaveStageFields: SaveStageFields{
			ExpectedRevision: f.view(t).Revision,
			Name:             "Unconnected QA",
			Category:         command.Review,
			Position:         2,
			AcceptsEntries:   true,
		},
		RetryReference: uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = f.pool.Exec(ctx, "UPDATE projects SET core_mode='modern' WHERE id=$1", f.project.UUID); err != nil {
		t.Fatal(err)
	}
	f.cover(t, flow)
	f.bind(t, flow, false, false)
	var source, sourceFlow uuid.UUID
	if err = f.pool.QueryRow(ctx, "SELECT id,workflow_id FROM workflow_stages WHERE project_id=$1 AND legacy_status='review'", f.project.UUID).Scan(&source, &sourceFlow); err != nil {
		t.Fatal(err)
	}
	_, err = f.service.SaveStage(ctx, f.admin, SaveStageInput{
		ProjectID:  f.project,
		WorkflowID: command.WorkflowID{UUID: sourceFlow},
		StageID:    command.StageID{UUID: source},
		SaveStageFields: SaveStageFields{
			ExpectedRevision: f.view(t).Revision,
			Name:             "Review",
			Category:         command.Review,
			Position:         3,
		},
		RetryReference: uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	called := false
	f.service.WithStageMigrator(func(context.Context, *command.Mutation, command.ProjectID, command.IssueID, command.StageMigrationTarget) error {
		called = true
		return nil
	})
	_, err = f.service.Migrate(ctx, f.admin, MigrationInput{
		ProjectID: f.project,
		MigrationFields: MigrationFields{
			ExpectedRevision: f.view(t).Revision,
			SourceStageID:    command.StageID{UUID: source},
			TargetStageID:    qa,
			Limit:            1,
		},
		RetryReference: uuid.NewString(),
	})
	expectCode(t, err, command.Validation)
	if called {
		t.Fatal("migration entered an unfinished workflow")
	}
	revision := f.view(t).Revision
	start := make(chan struct{})
	results := make(chan error, 2)
	for _, name := range []string{"One", "Two"} {
		go func(name string) {
			<-start
			_, err := f.service.SaveWorkflow(ctx, f.admin, SaveWorkflowInput{
				ProjectID:          f.project,
				WorkflowID:         command.NewID[command.WorkflowKind](),
				SaveWorkflowFields: SaveWorkflowFields{ExpectedRevision: revision, Name: name},
				RetryReference:     uuid.NewString(),
			})
			results <- err
		}(name)
	}
	close(start)
	accepted, conflicts := 0, 0
	for range 2 {
		err := <-results
		if err == nil {
			accepted++
			continue
		}
		var stale *Conflict
		if errors.As(err, &stale) {
			conflicts++
			continue
		}
		t.Fatal(err)
	}
	if accepted != 1 || conflicts != 1 || f.view(t).Revision != revision+1 {
		t.Fatal("configuration race", accepted, conflicts)
	}
}
