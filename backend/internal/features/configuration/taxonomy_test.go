package configuration

import (
	"context"
	"encoding/json"
	"errors"
	"gategoldjira/backend/db/migrations"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/tests/testenv"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"strings"
	"testing"
	"time"
)

type fixture struct {
	service               *Service
	pool                  *pgxpool.Pool
	project, other        command.ProjectID
	admin, member, viewer command.Actor
}

func configurationFixture(t *testing.T) fixture {
	t.Helper()
	ctx := context.Background()
	pool := testenv.Database(t)
	if err := migrations.Apply(ctx, pool); err != nil {
		t.Fatal(err)
	}
	signer, err := command.NewCursorSigner([]byte(strings.Repeat("c", 32)))
	if err != nil {
		t.Fatal(err)
	}
	f := fixture{
		service: New(command.Runner{Pool: pool}, signer),
		pool:    pool,
		project: command.NewID[command.ProjectKind](),
		other:   command.NewID[command.ProjectKind](),
	}
	for i, actor := range []*command.Actor{&f.admin, &f.member, &f.viewer} {
		*actor = command.Actor{
			UserID:  command.NewID[command.UserKind](),
			Channel: command.REST,
			Today:   command.Today(time.Now(), time.UTC),
		}
		if _, err := pool.Exec(ctx, "INSERT INTO users(id,email,email_key,display_name,approved_at,is_administrator) VALUES($1,$2,$2,'Config user',now(),$3)", actor.UserID.UUID, []string{
			"cadmin@test.dev",
			"cmember@test.dev",
			"cviewer@test.dev",
		}[i], i == 0); err != nil {
			t.Fatal(err)
		}
	}
	for i, id := range []command.ProjectID{f.project, f.other} {
		if _, err := pool.Exec(ctx, "INSERT INTO projects(id,key,name,created_by) VALUES($1,$2,'Configuration fixture',$3)", id.UUID, []string{"CONFIG", "OTHER"}[i], f.admin.UserID.UUID); err != nil {
			t.Fatal(err)
		}
	}
	for _, id := range []command.ProjectID{f.project, f.other} {
		if _, err := pool.Exec(ctx, "INSERT INTO project_status_order(project_id,status) SELECT $1,unnest(ARRAY['todo','in_progress','review','done'])", id.UUID); err != nil {
			t.Fatal(err)
		}
	}
	board := command.BoardWorkflow{Columns: []command.WorkflowColumn{}}
	for _, status := range []command.Status{command.Todo, command.InProgress, command.Review, command.Done} {
		targets := []command.Status{}
		for _, target := range []command.Status{command.Todo, command.InProgress, command.Review, command.Done} {
			if target != status {
				targets = append(targets, target)
			}
		}
		board.Columns = append(board.Columns, command.WorkflowColumn{
			Status:         status,
			Name:           string(status),
			AllowedTargets: targets,
		})
	}
	raw, err := json.Marshal(board)
	if err != nil {
		t.Fatal(err)
	}
	for _, id := range []command.ProjectID{f.project, f.other} {
		if _, err = pool.Exec(ctx, "INSERT INTO boards(id,project_id,name,name_key,created_by,is_default,workflow) VALUES($1,$2,'All Issues','all issues',$3,true,$4)", uuid.New(), id.UUID, f.admin.UserID.UUID, raw); err != nil {
			t.Fatal(err)
		}
	}
	for i, actor := range []command.Actor{f.member, f.viewer} {
		if _, err := pool.Exec(ctx, "INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,$3)", f.project.UUID, actor.UserID.UUID, []string{"member", "viewer"}[i]); err != nil {
			t.Fatal(err)
		}
	}
	return f
}
func (f fixture) view(t *testing.T) ConfigurationView {
	t.Helper()
	v, err := f.service.Get(context.Background(), f.admin, GetInput{f.project})
	if err != nil {
		t.Fatal(err)
	}
	return v
}
func expectCode(t *testing.T, err error, code command.FailureCode) {
	t.Helper()
	var failure *command.Failure
	if !errors.As(err, &failure) || failure.Code != code {
		t.Fatal("unexpected failure", code, err)
	}
}
func TestTaxonomyChoicesDefaultsNoOpsAndRetainedReferences(t *testing.T) {
	f := configurationFixture(t)
	ctx := context.Background()
	current := f.view(t)
	if current.Mode != Legacy || !current.CanManage || current.Revision != 1 {
		t.Fatal("seeded config", current)
	}
	for _, actor := range []command.Actor{f.member, f.viewer} {
		v, err := f.service.Get(ctx, actor, GetInput{f.project})
		if err != nil || v.CanManage {
			t.Fatal("read permission", v, err)
		}
	}
	types, err := f.service.Types(ctx, f.viewer, ListInput{ProjectID: f.project})
	if err != nil || types.TotalMatching != 3 {
		t.Fatal("seed types", types, err)
	}
	typeID := command.NewID[command.IssueTypeKind]()
	in := SaveTypeInput{
		ProjectID: f.project,
		TypeID:    typeID,
		SaveTypeFields: SaveTypeFields{
			ExpectedRevision: current.Revision,
			Key:              "story",
			Name:             "قصة",
			Behavior:         Standard,
		},
		RetryReference: uuid.NewString(),
	}
	saved, err := f.service.SaveType(ctx, f.admin, in)
	if err != nil || saved.Body.Result.Type.Key != "story" || saved.Body.Result.Configuration.Revision != 2 {
		t.Fatal("create type", saved, err)
	}
	// Same-name saves keep revision and activity unchanged.
	in.ExpectedRevision = 2
	in.RetryReference = uuid.NewString()
	noop, err := f.service.SaveType(ctx, f.admin, in)
	if err != nil || noop.Body.Result.Configuration.Revision != 2 || noop.Body.Receipt.EventID != nil {
		t.Fatal("type no-op", noop, err)
	}
	p := SavePriorityInput{
		ProjectID:  f.project,
		PriorityID: command.NewID[command.PriorityKind](),
		SavePriorityFields: SavePriorityFields{
			ExpectedRevision: 2,
			Key:              "urgent",
			Name:             "عاجل",
			SortOrder:        4,
		},
		RetryReference: uuid.NewString(),
	}
	priority, err := f.service.SavePriority(ctx, f.admin, p)
	if err != nil || priority.Body.Result.Configuration.Revision != 3 {
		t.Fatal("create priority", priority, err)
	}
	defaults := current.Defaults
	defaults.StandardTypeID = typeID
	defaults.PriorityID = p.PriorityID
	_, err = f.service.SetDefaults(ctx, f.admin, SetDefaultsInput{
		ProjectID:         f.project,
		SetDefaultsFields: SetDefaultsFields{ExpectedRevision: 3, Defaults: defaults},
		RetryReference:    uuid.NewString(),
	})
	expectCode(t, err, command.Validation)
	// An explicit modern client transition is required before old fixed-choice
	// creation defaults can change; it is never silently approximated.
	if _, err = f.pool.Exec(ctx, "UPDATE projects SET core_mode='modern' WHERE id=$1", f.project.UUID); err != nil {
		t.Fatal(err)
	}
	def, err := f.service.SetDefaults(ctx, f.admin, SetDefaultsInput{
		ProjectID:         f.project,
		SetDefaultsFields: SetDefaultsFields{ExpectedRevision: 3, Defaults: defaults},
		RetryReference:    uuid.NewString(),
	})
	if err != nil || def.Body.Result.Defaults != defaults || def.Body.Result.Revision != 4 {
		t.Fatal("atomic defaults", def, err)
	}
	in.ExpectedRevision = 4
	in.Retired = true
	in.RetryReference = uuid.NewString()
	_, err = f.service.SaveType(ctx, f.admin, in)
	expectCode(t, err, command.Validation)
	replacement := current.Defaults.StandardTypeID
	in.ReplacementDefaultID = &replacement
	in.RetryReference = uuid.NewString()
	retired, err := f.service.SaveType(ctx, f.admin, in)
	if err != nil || !retired.Body.Result.Type.Retired || retired.Body.Result.Type.Default || retired.Body.Result.Configuration.Defaults.StandardTypeID != replacement {
		t.Fatal("retire default replacement", retired, err)
	}
	types, err = f.service.Types(ctx, f.viewer, ListInput{ProjectID: f.project, IncludeRetired: true})
	if err != nil || types.TotalMatching != 4 {
		t.Fatal("retained choice", types, err)
	}
	var events int
	if err = f.pool.QueryRow(ctx, "SELECT count(*) FROM activity_events WHERE project_id=$1", f.project.UUID).Scan(&events); err != nil || events != 4 {
		t.Fatal("config audit/noops", events, err)
	}
}
func TestTaxonomyRejectsScopeRoleAndRevisionAndRechecksReplay(t *testing.T) {
	f := configurationFixture(t)
	ctx := context.Background()
	in := SaveTypeInput{
		ProjectID: f.project,
		TypeID:    command.NewID[command.IssueTypeKind](),
		SaveTypeFields: SaveTypeFields{
			ExpectedRevision: 1,
			Key:              "feature",
			Name:             "Feature",
			Behavior:         Standard,
		},
		RetryReference: uuid.NewString(),
	}
	_, err := f.service.SaveType(ctx, f.member, in)
	expectCode(t, err, command.Forbidden)
	first, err := f.service.SaveType(ctx, f.admin, in)
	if err != nil {
		t.Fatal(err)
	}
	replay, err := f.service.SaveType(ctx, f.admin, in)
	if err != nil || !replay.Body.Receipt.Replayed || replay.Body.Result.Type.ID != first.Body.Result.Type.ID {
		t.Fatal("replay", replay, err)
	}
	stale := in
	stale.Name = "Changed"
	stale.RetryReference = uuid.NewString()
	_, err = f.service.SaveType(ctx, f.admin, stale)
	expectCode(t, err, command.Conflict)
	cross := in
	cross.ProjectID = f.other
	cross.RetryReference = uuid.NewString()
	_, err = f.service.SaveType(ctx, f.admin, cross)
	expectCode(t, err, command.Unavailable)
	if _, err = f.pool.Exec(ctx, "UPDATE users SET is_administrator=false WHERE id=$1", f.admin.UserID.UUID); err != nil {
		t.Fatal(err)
	}
	_, err = f.service.SaveType(ctx, f.admin, in)
	expectCode(t, err, command.Unavailable)
}
