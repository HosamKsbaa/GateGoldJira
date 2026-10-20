package issues

import (
	"context"
	"encoding/json"
	"errors"
	"gategoldjira/backend/internal/features/configuration"
	"gategoldjira/backend/internal/platform/command"
	"github.com/google/uuid"
	"testing"
)

func modernIssueFixture(t *testing.T) issueFixture {
	t.Helper()
	f := issueDatabase(t)
	ctx := context.Background()
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
	if _, err = f.pool.Exec(ctx, "INSERT INTO boards(id,project_id,name,name_key,created_by,is_default,workflow) VALUES($1,$2,'All Issues','all issues',$3,true,$4)", uuid.New(), f.project.UUID, f.owner.UserID.UUID, raw); err != nil {
		t.Fatal(err)
	}
	if _, err = f.pool.Exec(ctx, "UPDATE projects SET core_mode='modern' WHERE id=$1", f.project.UUID); err != nil {
		t.Fatal(err)
	}
	return f
}
func TestCanonicalCreateResolvesCustomDefaultsOnceAndReplaysOriginalResult(t *testing.T) {
	f := modernIssueFixture(t)
	ctx := context.Background()
	cfg := configuration.New(f.service.runner, f.service.cursors)
	original, err := cfg.Get(ctx, f.owner, configuration.GetInput{ProjectID: f.project})
	if err != nil {
		t.Fatal(err)
	}
	typeID, priorityID := command.NewID[command.IssueTypeKind](), command.NewID[command.PriorityKind]()
	kind, err := cfg.SaveType(ctx, f.owner, configuration.SaveTypeInput{
		ProjectID: f.project,
		TypeID:    typeID,
		SaveTypeFields: configuration.SaveTypeFields{
			ExpectedRevision: original.Revision,
			Key:              "story",
			Name:             "قصة",
			Behavior:         configuration.Standard,
		},
		RetryReference: uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	priority, err := cfg.SavePriority(ctx, f.owner, configuration.SavePriorityInput{
		ProjectID:  f.project,
		PriorityID: priorityID,
		SavePriorityFields: configuration.SavePriorityFields{
			ExpectedRevision: kind.Body.Result.Configuration.Revision,
			Key:              "urgent",
			Name:             "عاجل",
			SortOrder:        4,
		},
		RetryReference: uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	defaults := original.Defaults
	defaults.StandardTypeID = typeID
	defaults.PriorityID = priorityID
	next, err := cfg.SetDefaults(ctx, f.owner, configuration.SetDefaultsInput{
		ProjectID: f.project,
		SetDefaultsFields: configuration.SetDefaultsFields{
			ExpectedRevision: priority.Body.Result.Configuration.Revision,
			Defaults:         defaults,
		},
		RetryReference: uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	input := ModernCreateInput{
		ProjectID: f.project,
		ModernCreateFields: ModernCreateFields{
			Title:             "قصة جديدة 😀",
			AssigneeID:        &f.owner.UserID,
			Description:       "<p dir=\"rtl\">شرح المشروع</p>",
			DescriptionFormat: command.HTMLDescription,
		},
		RetryReference: uuid.NewString(),
	}
	created, err := f.service.CreateModern(ctx, f.member, input)
	if err != nil || created.HTTPStatus != 201 || created.Body.Result.Summary.Type.ID != typeID || created.Body.Result.Summary.Priority.ID != priorityID || created.Body.Result.Summary.Stage.Category != command.Todo || created.Body.Result.Reporter.ID != f.member.UserID {
		t.Fatal("custom creation", created, err)
	}
	if _, err = cfg.SetDefaults(ctx, f.owner, configuration.SetDefaultsInput{
		ProjectID: f.project,
		SetDefaultsFields: configuration.SetDefaultsFields{
			ExpectedRevision: next.Body.Result.Revision,
			Defaults:         original.Defaults,
		},
		RetryReference: uuid.NewString(),
	}); err != nil {
		t.Fatal(err)
	}
	actor := f.member
	actor.Channel = command.MCP
	replay, err := f.service.CreateModern(ctx, actor, input)
	if err != nil || !replay.Body.Receipt.Replayed || replay.Body.Result.Summary.ID != created.Body.Result.Summary.ID || replay.Body.Result.Summary.Type.ID != typeID || replay.Body.Result.Summary.Priority.ID != priorityID {
		t.Fatal("default-change replay", replay, err)
	}
	var count int
	if err = f.pool.QueryRow(ctx, "SELECT count(*) FROM issues WHERE project_id=$1", f.project.UUID).Scan(&count); err != nil || count != 1 {
		t.Fatal("duplicate create", count, err)
	}
	child, err := f.service.CreateModern(ctx, f.member, ModernCreateInput{
		ProjectID: f.project,
		ModernCreateFields: ModernCreateFields{
			Title:                  "مهمة فرعية",
			ParentID:               &created.Body.Result.Summary.ID,
			ExpectedParentRevision: &created.Body.Result.Summary.Revision,
		},
		RetryReference: uuid.NewString(),
	})
	if err != nil || child.Body.Result.Summary.Type.Behavior != command.SubtaskBehavior || child.Body.Result.Summary.Parent.Value == nil || child.Body.Result.Summary.Parent.Value.ID != created.Body.Result.Summary.ID {
		t.Fatal("canonical child", child, err)
	}
}
func TestCanonicalCreateRejectsViewerClosedParentAndNonInitialStage(t *testing.T) {
	f := modernIssueFixture(t)
	ctx := context.Background()
	input := ModernCreateInput{
		ProjectID:          f.project,
		ModernCreateFields: ModernCreateFields{Title: "Work"},
		RetryReference:     uuid.NewString(),
	}
	_, err := f.service.CreateModern(ctx, f.viewer, input)
	var failure *command.Failure
	if !errors.As(err, &failure) || failure.Code != command.Forbidden {
		t.Fatal("viewer create", err)
	}
	parent, err := f.service.CreateModern(ctx, f.member, input)
	if err != nil {
		t.Fatal(err)
	}
	var done uuid.UUID
	if err = f.pool.QueryRow(ctx, "SELECT id FROM workflow_stages WHERE project_id=$1 AND legacy_status='done'", f.project.UUID).Scan(&done); err != nil {
		t.Fatal(err)
	}
	stage := command.StageID{UUID: done}
	input.StageID = &stage
	input.RetryReference = uuid.NewString()
	_, err = f.service.CreateModern(ctx, f.member, input)
	if !errors.As(err, &failure) || failure.Code != command.Validation {
		t.Fatal("initial-stage bypass", err)
	}
	if _, err = f.pool.Exec(ctx, "UPDATE issues SET stage_id=$2,revision=revision+1 WHERE id=$1", parent.Body.Result.Summary.ID.UUID, done); err != nil {
		t.Fatal(err)
	}
	revision := parent.Body.Result.Summary.Revision + 1
	_, err = f.service.CreateModern(ctx, f.member, ModernCreateInput{
		ProjectID: f.project,
		ModernCreateFields: ModernCreateFields{
			Title:                  "Child",
			ParentID:               &parent.Body.Result.Summary.ID,
			ExpectedParentRevision: &revision,
		},
		RetryReference: uuid.NewString(),
	})
	if !errors.As(err, &failure) || failure.Code != command.Prerequisite {
		t.Fatal("closed-parent bypass", err)
	}
	// Conflicting legacy projections are rejected at the storage boundary too.
	if _, err = f.pool.Exec(ctx, "UPDATE issues SET priority='high' WHERE id=$1", parent.Body.Result.Summary.ID.UUID); err == nil {
		t.Fatal("legacy priority silently changed modern semantics")
	}
}
