package parity

import (
	"context"
	"encoding/json"
	"gategoldjira/backend/internal/features/configuration"
	"gategoldjira/backend/internal/features/issues"
	"gategoldjira/backend/internal/features/projects"
	"gategoldjira/backend/internal/platform/command"
	"github.com/google/uuid"
	"testing"
)

func matrixCanonicalWorkflows(t *testing.T, m *catalogMatrix) {
	t.Helper()
	admin := m.runtime.Admin
	ctx := context.Background()
	project := matrixSave[projects.CreateInput, projects.ProjectView, projects.ProjectFailureBody](t, m, admin, command.CreateProject, projects.CreateInput{
		Key:            "FLOWS",
		Name:           "Workflow transport",
		RetryReference: uuid.NewString(),
	})
	current := func() configuration.ConfigurationView {
		return matrixRead[configuration.GetInput, configuration.ConfigurationView, configuration.ConfigurationFailureBody](t, m, admin, command.GetProjectConfiguration, configuration.GetInput{ProjectID: project.ID})
	}
	work := matrixSave[issues.CreateInput, issues.IssueView, issues.IssueFailureBody](t, m, admin, command.CreateIssue, issues.CreateInput{
		ProjectID: project.ID,
		CreateIssueFields: issues.CreateIssueFields{
			Title:         "Workflow migration",
			InitialStatus: command.Review,
		},
		RetryReference: uuid.NewString(),
	})
	flow := matrixSave[configuration.SaveWorkflowInput, configuration.WorkflowSaved, configuration.ConfigurationFailureBody](t, m, admin, command.SaveWorkflow, configuration.SaveWorkflowInput{
		ProjectID:  project.ID,
		WorkflowID: command.NewID[command.WorkflowKind](),
		SaveWorkflowFields: configuration.SaveWorkflowFields{
			ExpectedRevision: current().Revision,
			Name:             "التسليم",
		},
		RetryReference: uuid.NewString(),
	}).Workflow
	todo, review, done := command.NewID[command.StageKind](), command.NewID[command.StageKind](), command.NewID[command.StageKind]()
	stages := []struct {
		id       command.StageID
		category command.Status
		name     string
	}{{todo, command.Todo, "Ready"}, {review, command.Review, "QA"}, {done, command.Done, "Released"}}
	for i, stage := range stages {
		matrixSave[configuration.SaveStageInput, configuration.StageSaved, configuration.ConfigurationFailureBody](t, m, admin, command.SaveWorkflowStage, configuration.SaveStageInput{
			ProjectID:  project.ID,
			WorkflowID: flow.ID,
			StageID:    stage.id,
			SaveStageFields: configuration.SaveStageFields{
				ExpectedRevision: current().Revision,
				Name:             stage.name,
				Category:         stage.category,
				Position:         command.Position(i + 1),
				Initial:          i == 0,
				AcceptsEntries:   true,
			},
			RetryReference: uuid.NewString(),
		})
	}
	for _, edge := range [][2]command.StageID{{todo, review}, {review, done}} {
		matrixSave[configuration.SaveTransitionInput, configuration.TransitionSaved, configuration.ConfigurationFailureBody](t, m, admin, command.SaveWorkflowTransition, configuration.SaveTransitionInput{
			ProjectID:    project.ID,
			WorkflowID:   flow.ID,
			TransitionID: command.NewID[command.TransitionKind](),
			SaveTransitionFields: configuration.SaveTransitionFields{
				ExpectedRevision: current().Revision,
				FromStageID:      edge[0],
				ToStageID:        edge[1],
			},
			RetryReference: uuid.NewString(),
		})
	}
	matrixRead[configuration.ListInput, command.Page[configuration.WorkflowView], configuration.ConfigurationFailureBody](t, m, admin, command.ListWorkflows, configuration.ListInput{ProjectID: project.ID})
	matrixRead[configuration.StageListInput, command.Page[configuration.StageView], configuration.ConfigurationFailureBody](t, m, admin, command.ListWorkflowStages, configuration.StageListInput{ProjectID: project.ID, WorkflowID: flow.ID})
	matrixRead[configuration.StageListInput, command.Page[configuration.TransitionView], configuration.ConfigurationFailureBody](t, m, admin, command.ListWorkflowTransitions, configuration.StageListInput{ProjectID: project.ID, WorkflowID: flow.ID})
	// Modern-mode activation is not public until the first-party issue/board
	// contracts are ready. This isolated fixture explicitly prepares that state.
	if _, err := m.runtime.Pool.Exec(ctx, "UPDATE projects SET core_mode='modern' WHERE id=$1", project.ID.UUID); err != nil {
		t.Fatal(err)
	}
	var raw []byte
	if err := m.runtime.Pool.QueryRow(ctx, "SELECT workflow FROM boards WHERE project_id=$1 AND is_default", project.ID.UUID).Scan(&raw); err != nil {
		t.Fatal(err)
	}
	var board command.BoardWorkflow
	if err := json.Unmarshal(raw, &board); err != nil {
		t.Fatal(err)
	}
	for _, stage := range stages {
		targets := []command.Status{}
		for _, other := range stages {
			if other.id != stage.id {
				targets = append(targets, command.Status(string(other.category)+":"+other.id.String()))
			}
		}
		board.Columns = append(board.Columns, command.WorkflowColumn{
			Status:         command.Status(string(stage.category) + ":" + stage.id.String()),
			Name:           stage.name,
			AllowedTargets: targets,
		})
	}
	raw, err := json.Marshal(board)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = m.runtime.Pool.Exec(ctx, "UPDATE boards SET workflow=$2 WHERE project_id=$1 AND is_default", project.ID.UUID, raw); err != nil {
		t.Fatal(err)
	}
	if _, err := m.runtime.Pool.Exec(ctx, "INSERT INTO board_column_stages(project_id,board_id,column_id,stage_id) SELECT s.project_id,b.id,c.id,s.id FROM workflow_stages s JOIN boards b ON b.project_id=s.project_id AND b.is_default JOIN board_columns c ON c.board_id=b.id AND c.legacy_status=s.category WHERE s.workflow_id=$1 ON CONFLICT(board_id,stage_id) DO NOTHING", flow.ID.UUID); err != nil {
		t.Fatal(err)
	}
	cfg := current()
	matrixSave[configuration.SetBindingInput, configuration.ConfigurationView, configuration.ConfigurationFailureBody](t, m, admin, command.SetTypeWorkflowBinding, configuration.SetBindingInput{
		ProjectID:        project.ID,
		TypeID:           cfg.Defaults.StandardTypeID,
		WorkflowID:       flow.ID,
		SetBindingFields: configuration.SetBindingFields{ExpectedRevision: cfg.Revision},
		RetryReference:   uuid.NewString(),
	})
	matrixRead[configuration.BindingListInput, command.Page[configuration.BindingView], configuration.ConfigurationFailureBody](t, m, admin, command.ListTypeWorkflowBindings, configuration.BindingListInput{
		ProjectID: project.ID,
		TypeID:    cfg.Defaults.StandardTypeID,
	})
	var source, sourceFlow uuid.UUID
	if err = m.runtime.Pool.QueryRow(ctx, "SELECT id,workflow_id FROM workflow_stages WHERE project_id=$1 AND legacy_status='review'", project.ID.UUID).Scan(&source, &sourceFlow); err != nil {
		t.Fatal(err)
	}
	matrixSave[configuration.SaveStageInput, configuration.StageSaved, configuration.ConfigurationFailureBody](t, m, admin, command.SaveWorkflowStage, configuration.SaveStageInput{
		ProjectID:  project.ID,
		WorkflowID: command.WorkflowID{UUID: sourceFlow},
		StageID:    command.StageID{UUID: source},
		SaveStageFields: configuration.SaveStageFields{
			ExpectedRevision: current().Revision,
			Name:             "Review",
			Category:         command.Review,
			Position:         3,
		},
		RetryReference: uuid.NewString(),
	})
	result := matrixSave[configuration.MigrationInput, configuration.MigrationResult, configuration.ConfigurationFailureBody](t, m, admin, command.MigrateWorkflowIssues, configuration.MigrationInput{
		ProjectID: project.ID,
		MigrationFields: configuration.MigrationFields{
			ExpectedRevision: current().Revision,
			SourceStageID:    command.StageID{UUID: source},
			TargetStageID:    review,
			Limit:            1,
		},
		RetryReference: uuid.NewString(),
	})

	modern := matrixRead[issues.ModernGetInput, issues.ModernIssueView, issues.ModernIssueFailureBody](t, m, admin, command.GetModernIssue, issues.ModernGetInput{IssueID: work.Summary.ID})
	matrixRead[issues.ModernSearchInput, command.Page[issues.ModernIssueSummary], issues.ModernIssueFailureBody](t, m, admin, command.SearchModernIssues, issues.ModernSearchInput{Filters: command.IssueFilter{
		ProjectIDs: []command.ProjectID{project.ID},
		TypeIDs:    []command.IssueTypeID{modern.Summary.Type.ID},
	}})
	matrixRead[issues.TransitionOptionsInput, command.Page[issues.IssueTransitionOption], issues.ModernIssueFailureBody](t, m, admin, command.ListIssueTransitions, issues.TransitionOptionsInput{IssueID: modern.Summary.ID})
	modern = matrixSave[issues.ModernUpdateInput, issues.ModernIssueView, issues.ModernIssueFailureBody](t, m, admin, command.UpdateModernIssue, issues.ModernUpdateInput{
		IssueID: modern.Summary.ID,
		ModernUpdateFields: issues.ModernUpdateFields{
			ExpectedRevision: modern.Summary.Revision,
			Editable: issues.ModernEditable{
				Title:             "Canonical title",
				Description:       modern.Description,
				DescriptionFormat: modern.DescriptionFormat,
				TypeID:            modern.Summary.Type.ID,
				PriorityID:        modern.Summary.Priority.ID,
				LabelIDs:          []command.LabelID{},
			},
		},
		RetryReference: uuid.NewString(),
	})
	date, _ := command.ParseDate("2027-06-02")
	modern = matrixSave[issues.ModernPatchInput, issues.ModernIssueView, issues.ModernIssueFailureBody](t, m, admin, command.PatchModernIssueField, issues.ModernPatchInput{
		IssueID: modern.Summary.ID,
		ModernPatchFields: issues.ModernPatchFields{
			Field:   issues.DueDateField,
			DueDate: &issues.DateChange{Value: &date},
		},
		RetryReference: uuid.NewString(),
	})
	matrixSave[issues.ModernMoveInput, issues.ModernIssueView, issues.ModernIssueFailureBody](t, m, admin, command.MoveModernIssue, issues.ModernMoveInput{
		IssueID: modern.Summary.ID,
		ModernMoveFields: issues.ModernMoveFields{
			ExpectedRevision: modern.Summary.Revision,
			TargetStageID:    done,
		},
		RetryReference: uuid.NewString(),
	})
	matrixSave[issues.ModernCreateInput, issues.ModernIssueView, issues.ModernIssueFailureBody](t, m, admin, command.CreateModernIssue, issues.ModernCreateInput{
		ProjectID:          project.ID,
		ModernCreateFields: issues.ModernCreateFields{Title: "Canonical creation"},
		RetryReference:     uuid.NewString(),
	})
	if result.Moved != 1 || result.Remaining != 0 {
		t.Fatal("migration transport result", result)
	}
	var actual uuid.UUID
	if err = m.runtime.Pool.QueryRow(ctx, "SELECT workflow_id FROM issues WHERE id=$1", work.Summary.ID.UUID).Scan(&actual); err != nil || actual != flow.ID.UUID {
		t.Fatal("transport migrated issue", err)
	}
}
