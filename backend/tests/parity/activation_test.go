package parity

import (
	"encoding/json"
	"gategoldjira/backend/internal/features/configuration"
	"gategoldjira/backend/internal/features/issues"
	"gategoldjira/backend/internal/features/projects"
	"gategoldjira/backend/internal/platform/command"
	"github.com/google/uuid"
	"testing"
)

func matrixActivation(t *testing.T, m *catalogMatrix) {
	a := m.runtime.Admin
	project := matrixSave[projects.CreateInput, projects.ProjectView, projects.ProjectFailureBody](t, m, a, command.CreateProject, projects.CreateInput{
		Key:            "ACTIVATE",
		Name:           "Activation fixture",
		RetryReference: uuid.NewString(),
	})
	legacyInput := issues.CreateInput{
		ProjectID:      project.ID,
		Title:          "Retained legacy creation",
		RetryReference: uuid.NewString(),
	}
	legacy := matrixSave[issues.CreateInput, issues.IssueView, issues.IssueFailureBody](t, m, a, command.CreateIssue, legacyInput)
	review := matrixRead[configuration.GetInput, configuration.ActivationReadiness, configuration.ConfigurationFailureBody](t, m, a, command.GetProjectActivation, configuration.GetInput{ProjectID: project.ID})
	if !review.Ready {
		t.Fatal("new project's activation review", review)
	}
	saved := matrixSave[configuration.ActivateInput, configuration.ConfigurationView, configuration.ConfigurationFailureBody](t, m, a, command.ActivateProjectCore, configuration.ActivateInput{
		ProjectID: project.ID,
		ActivateFields: configuration.ActivateFields{
			ExpectedRevision:        review.Configuration.Revision,
			ExpectedProjectRevision: review.ProjectRevision,
			ExpectedBoardID:         review.DefaultBoardID,
			ExpectedBoardRevision:   review.DefaultBoardRevision,
			Confirm:                 true,
		},
		RetryReference: uuid.NewString(),
	})
	if saved.Mode != configuration.Modern {
		t.Fatal("activation did not enable native clients")
	}
	raw, status := matrixREST(t, m, a, command.CreateIssue, legacyInput, true)
	var replay command.Saved[issues.IssueView]
	if status != 200 && status != 201 || json.Unmarshal(raw, &replay) != nil || !replay.Receipt.Replayed || replay.Result.Summary.ID != legacy.Summary.ID {
		t.Fatal("accepted legacy receipt failed after activation", status)
	}
}

func TestActivationTransportReplayPreservesAcceptedLegacyCreation(t *testing.T) {
	matrixActivation(t, newCatalogMatrix(t))
}
