package issues

import (
	"context"
	"errors"
	"gategoldjira/backend/internal/features/configuration"
	"gategoldjira/backend/internal/platform/command"
	"github.com/google/uuid"
	"testing"
)

func modernEditable(view ModernIssueView) ModernEditable {
	labels := []command.LabelID{}
	for _, label := range view.Summary.Labels {
		labels = append(labels, label.ID)
	}
	var assignee *command.UserID
	if view.Summary.Assignee.Value != nil {
		assignee = &view.Summary.Assignee.Value.ID
	}
	return ModernEditable{
		Title:             view.Summary.Title,
		Description:       view.Description,
		DescriptionFormat: view.DescriptionFormat,
		TypeID:            view.Summary.Type.ID,
		PriorityID:        view.Summary.Priority.ID,
		AssigneeID:        assignee,
		DueDate:           view.Summary.DueDate,
		LabelIDs:          labels,
	}
}
func TestCanonicalUpdateNoopCustomChoicesRetirementAndConflict(t *testing.T) {
	f := modernIssueFixture(t)
	ctx := context.Background()
	cfg := configuration.New(f.service.runner, f.service.cursors)
	created, err := f.service.CreateModern(ctx, f.member, ModernCreateInput{
		ProjectID:          f.project,
		ModernCreateFields: ModernCreateFields{Title: "Work"},
		RetryReference:     uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	current := created.Body.Result
	input := ModernUpdateInput{
		IssueID: current.Summary.ID,
		ModernUpdateFields: ModernUpdateFields{
			ExpectedRevision: current.Summary.Revision,
			Editable:         modernEditable(current),
		},
		RetryReference: uuid.NewString(),
	}
	noop, err := f.service.UpdateModern(ctx, f.member, input)
	if err != nil || noop.Body.Receipt.EventID != nil || noop.Body.Result.Summary.Revision != current.Summary.Revision {
		t.Fatal("modern no-op", err)
	}
	root, err := cfg.Get(ctx, f.owner, configuration.GetInput{ProjectID: f.project})
	if err != nil {
		t.Fatal(err)
	}
	typeID, priorityID := command.NewID[command.IssueTypeKind](), command.NewID[command.PriorityKind]()
	kind, err := cfg.SaveType(ctx, f.owner, configuration.SaveTypeInput{
		ProjectID: f.project,
		TypeID:    typeID,
		SaveTypeFields: configuration.SaveTypeFields{
			ExpectedRevision: root.Revision,
			Key:              "story",
			Name:             "Story",
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
			Name:             "Urgent",
			SortOrder:        4,
		},
		RetryReference: uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	input.Editable.TypeID = typeID
	input.Editable.PriorityID = priorityID
	input.RetryReference = uuid.NewString()
	changed, err := f.service.UpdateModern(ctx, f.member, input)
	if err != nil || changed.Body.Result.Summary.Type.ID != typeID || changed.Body.Result.Summary.Priority.ID != priorityID || changed.Body.Result.Summary.Revision != 2 {
		t.Fatal("typed update", changed, err)
	}
	_, err = f.service.UpdateModern(ctx, f.member, ModernUpdateInput{
		IssueID: input.IssueID,
		ModernUpdateFields: ModernUpdateFields{
			ExpectedRevision: 1,
			Editable:         input.Editable,
		},
		RetryReference: uuid.NewString(),
	})
	var stale *ModernIssueConflict
	if !errors.As(err, &stale) || stale.Current.Summary.Priority.ID != priorityID {
		t.Fatal("typed conflict current", err)
	}
	retired, err := cfg.SaveType(ctx, f.owner, configuration.SaveTypeInput{
		ProjectID: f.project,
		TypeID:    typeID,
		SaveTypeFields: configuration.SaveTypeFields{
			ExpectedRevision: priority.Body.Result.Configuration.Revision,
			Key:              "story",
			Name:             "Story",
			Behavior:         configuration.Standard,
			Retired:          true,
		},
		RetryReference: uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = cfg.SavePriority(ctx, f.owner, configuration.SavePriorityInput{
		ProjectID:  f.project,
		PriorityID: priorityID,
		SavePriorityFields: configuration.SavePriorityFields{
			ExpectedRevision: retired.Body.Result.Configuration.Revision,
			Key:              "urgent",
			Name:             "Urgent",
			SortOrder:        4,
			Retired:          true,
		},
		RetryReference: uuid.NewString(),
	}); err != nil {
		t.Fatal(err)
	}
	input.ExpectedRevision = 2
	input.Editable.Title = "Retained retired choices"
	input.RetryReference = uuid.NewString()
	retained, err := f.service.UpdateModern(ctx, f.member, input)
	if err != nil || !retained.Body.Result.Summary.Type.Retired || !retained.Body.Result.Summary.Priority.Retired {
		t.Fatal("retained retired IDs", err)
	}
	input.ExpectedRevision = 3
	input.Editable.TypeID = root.Defaults.StandardTypeID
	input.Editable.PriorityID = root.Defaults.PriorityID
	input.RetryReference = uuid.NewString()
	active, err := f.service.UpdateModern(ctx, f.member, input)
	if err != nil {
		t.Fatal(err)
	}
	input.ExpectedRevision = active.Body.Result.Summary.Revision
	input.Editable.TypeID = typeID
	input.RetryReference = uuid.NewString()
	_, err = f.service.UpdateModern(ctx, f.member, input)
	var failure *command.Failure
	if !errors.As(err, &failure) || failure.Code != command.Validation {
		t.Fatal("reselected retired type", err)
	}
}
func TestCanonicalMoveUsesWorkflowPermissionAndCompletionGuards(t *testing.T) {
	f := modernIssueFixture(t)
	ctx := context.Background()
	created, err := f.service.CreateModern(ctx, f.member, ModernCreateInput{
		ProjectID:          f.project,
		ModernCreateFields: ModernCreateFields{Title: "Parent"},
		RetryReference:     uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	parent := created.Body.Result
	child, err := f.service.CreateModern(ctx, f.member, ModernCreateInput{
		ProjectID: f.project,
		ModernCreateFields: ModernCreateFields{
			Title:                  "Child",
			ParentID:               &parent.Summary.ID,
			ExpectedParentRevision: &parent.Summary.Revision,
		},
		RetryReference: uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	var doneID uuid.UUID
	if err = f.pool.QueryRow(ctx, "SELECT id FROM workflow_stages WHERE project_id=$1 AND legacy_status='done'", f.project.UUID).Scan(&doneID); err != nil {
		t.Fatal(err)
	}
	done := command.StageID{UUID: doneID}
	move := ModernMoveInput{
		IssueID: parent.Summary.ID,
		ModernMoveFields: ModernMoveFields{
			ExpectedRevision: parent.Summary.Revision,
			TargetStageID:    done,
		},
		RetryReference: uuid.NewString(),
	}
	_, err = f.service.MoveModern(ctx, f.member, move)
	var failure *command.Failure
	if !errors.As(err, &failure) || failure.Code != command.Prerequisite {
		t.Fatal("unfinished child bypass", err)
	}
	if _, err = f.pool.Exec(ctx, "UPDATE workflow_transitions SET required_permission='project_admin' WHERE workflow_id=$1 AND to_stage_id=$2", parent.Summary.Workflow.ID.UUID, doneID); err != nil {
		t.Fatal(err)
	}
	childMove := ModernMoveInput{
		IssueID: child.Body.Result.Summary.ID,
		ModernMoveFields: ModernMoveFields{
			ExpectedRevision: child.Body.Result.Summary.Revision,
			TargetStageID:    done,
		},
		RetryReference: uuid.NewString(),
	}
	_, err = f.service.MoveModern(ctx, f.member, childMove)
	if !errors.As(err, &failure) || failure.Code != command.Forbidden {
		t.Fatal("transition permission bypass", err)
	}
	childDone, err := f.service.MoveModern(ctx, f.owner, childMove)
	if err != nil || childDone.Body.Result.Summary.Stage.ID != done {
		t.Fatal("child completion", err)
	}
	parentDone, err := f.service.MoveModern(ctx, f.owner, move)
	if err != nil || parentDone.Body.Result.Summary.Stage.ID != done {
		t.Fatal("parent completion", err)
	}
	reopen := ModernMoveInput{
		IssueID: child.Body.Result.Summary.ID,
		ModernMoveFields: ModernMoveFields{
			ExpectedRevision: childDone.Body.Result.Summary.Revision,
			TargetStageID:    child.Body.Result.Summary.Stage.ID,
		},
		RetryReference: uuid.NewString(),
	}
	_, err = f.service.MoveModern(ctx, f.member, reopen)
	if !errors.As(err, &failure) || failure.Code != command.Prerequisite {
		t.Fatal("child reopen under done parent", err)
	}
	same := ModernMoveInput{
		IssueID: parent.Summary.ID,
		ModernMoveFields: ModernMoveFields{
			ExpectedRevision: parentDone.Body.Result.Summary.Revision,
			TargetStageID:    done,
		},
		RetryReference: uuid.NewString(),
	}
	noop, err := f.service.MoveModern(ctx, f.member, same)
	if err != nil || noop.Body.Receipt.EventID != nil || noop.Body.Result.Summary.Revision != parentDone.Body.Result.Summary.Revision {
		t.Fatal("same-stage no-op", err)
	}
}
