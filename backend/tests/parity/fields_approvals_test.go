package parity

import (
	"context"
	"gategoldjira/backend/internal/features/configuration"
	"gategoldjira/backend/internal/features/issues"
	"gategoldjira/backend/internal/features/projects"
	"gategoldjira/backend/internal/platform/command"
	"github.com/google/uuid"
	"testing"
)

func matrixFieldsApprovals(t *testing.T, m *catalogMatrix) {
	t.Helper()
	a := m.runtime.Admin
	project := matrixSave[projects.CreateInput, projects.ProjectView, projects.ProjectFailureBody](t, m, a, command.CreateProject, projects.CreateInput{
		Key:            "FIELDSV2",
		Name:           "Fields and approvals",
		RetryReference: uuid.NewString(),
	})
	if _, err := m.runtime.Pool.Exec(context.Background(), "UPDATE projects SET core_mode='modern' WHERE id=$1", project.ID.UUID); err != nil {
		t.Fatal(err)
	}
	current := func() configuration.ConfigurationView {
		return matrixRead[configuration.GetInput, configuration.ConfigurationView, configuration.ConfigurationFailureBody](t, m, a, command.GetProjectConfiguration, configuration.GetInput{ProjectID: project.ID})
	}
	work := matrixSave[issues.ModernCreateInput, issues.ModernIssueView, issues.ModernIssueFailureBody](t, m, a, command.CreateModernIssue, issues.ModernCreateInput{
		ProjectID:          project.ID,
		ModernCreateFields: issues.ModernCreateFields{Title: "Review target"},
		RetryReference:     uuid.NewString(),
	})
	id := command.NewID[command.FieldKind]()
	text := "معيار القبول"
	field := matrixSave[configuration.SaveFieldInput, configuration.FieldSaved, configuration.ConfigurationFailureBody](t, m, a, command.SaveField, configuration.SaveFieldInput{
		ProjectID: project.ID,
		FieldID:   id,
		SaveFieldFields: configuration.SaveFieldFields{
			ExpectedRevision: current().Revision,
			Key:              "acceptance",
			Name:             "Acceptance",
			Kind:             command.TextValue,
			DefaultValue:     &command.FieldValue{Kind: command.TextValue, Text: &text},
		},
		RetryReference: uuid.NewString(),
	})
	matrixSave[configuration.BackfillFieldInput, configuration.BackfillFieldResult, configuration.ConfigurationFailureBody](t, m, a, command.BackfillFieldDefaults, configuration.BackfillFieldInput{
		ProjectID: project.ID,
		FieldID:   id,
		BackfillFieldFields: configuration.BackfillFieldFields{
			ExpectedRevision: field.Configuration.Revision,
			Limit:            100,
		},
		RetryReference: uuid.NewString(),
	})
	choice := command.NewID[command.FieldKind]()
	matrixSave[configuration.SaveFieldInput, configuration.FieldSaved, configuration.ConfigurationFailureBody](t, m, a, command.SaveField, configuration.SaveFieldInput{
		ProjectID: project.ID,
		FieldID:   choice,
		SaveFieldFields: configuration.SaveFieldFields{
			ExpectedRevision: current().Revision,
			Key:              "team",
			Name:             "Team",
			Kind:             command.ChoiceValue,
		},
		RetryReference: uuid.NewString(),
	})
	matrixSave[configuration.SaveFieldOptionInput, configuration.FieldOptionSaved, configuration.ConfigurationFailureBody](t, m, a, command.SaveFieldOption, configuration.SaveFieldOptionInput{
		ProjectID: project.ID,
		FieldID:   choice,
		OptionID:  command.NewID[command.FieldOptionKind](),
		SaveFieldOptionFields: configuration.SaveFieldOptionFields{
			ExpectedRevision: current().Revision,
			Name:             "Web",
			Position:         9007199254740993,
		},
		RetryReference: uuid.NewString(),
	})
	matrixRead[configuration.ListInput, command.Page[configuration.FieldView], configuration.ConfigurationFailureBody](t, m, a, command.ListFields, configuration.ListInput{ProjectID: project.ID})
	matrixRead[configuration.FieldOptionsInput, command.Page[configuration.FieldOptionView], configuration.ConfigurationFailureBody](t, m, a, command.ListFieldOptions, configuration.FieldOptionsInput{ProjectID: project.ID, FieldID: choice})
	values := matrixRead[issues.CustomFieldsInput, issues.CustomFieldsView, issues.ModernIssueFailureBody](t, m, a, command.GetCustomFields, issues.CustomFieldsInput{IssueID: work.Summary.ID})
	text = "Reviewed acceptance"
	values = matrixSave[issues.SaveCustomFieldsInput, issues.CustomFieldsView, issues.ModernIssueFailureBody](t, m, a, command.SaveCustomFields, issues.SaveCustomFieldsInput{
		IssueID:          work.Summary.ID,
		ExpectedRevision: values.Revision,
		Values: []command.FieldAssignment{{
			FieldID: id,
			Value:   &command.FieldValue{Kind: command.TextValue, Text: &text},
		}},
		RetryReference: uuid.NewString(),
	})
	options := matrixRead[issues.TransitionOptionsInput, command.Page[issues.IssueTransitionOption], issues.ModernIssueFailureBody](t, m, a, command.ListIssueTransitions, issues.TransitionOptionsInput{IssueID: work.Summary.ID})
	edge := options.Items[0]
	role := command.TransitionMember
	matrixSave[configuration.SaveTransitionPolicyInput, configuration.TransitionPolicyView, configuration.ConfigurationFailureBody](t, m, a, command.SaveTransitionPolicy, configuration.SaveTransitionPolicyInput{
		ProjectID:    project.ID,
		WorkflowID:   work.Summary.Workflow.ID,
		TransitionID: edge.TransitionID,
		TransitionPolicyFields: configuration.TransitionPolicyFields{
			ExpectedRevision: current().Revision,
			Policy: configuration.TransitionPolicy{
				RequiredSystemFields: []configuration.SystemField{},
				RequiredFieldIDs:     []command.FieldID{id},
				ApprovalsRequired:    1,
				ApproverRole:         command.Nullable[command.TransitionPermission]{Value: &role},
			},
		},
		RetryReference: uuid.NewString(),
	})
	matrixRead[configuration.TransitionPolicyInput, configuration.TransitionPolicyView, configuration.ConfigurationFailureBody](t, m, a, command.GetTransitionPolicy, configuration.TransitionPolicyInput{
		ProjectID:    project.ID,
		WorkflowID:   work.Summary.Workflow.ID,
		TransitionID: edge.TransitionID,
	})
	review := matrixRead[issues.ApprovalContextInput, issues.ApprovalContextView, issues.ModernIssueFailureBody](t, m, a, command.GetApprovalContext, issues.ApprovalContextInput{
		IssueID:      work.Summary.ID,
		TransitionID: edge.TransitionID,
	})
	context := func() issues.ApprovalContextFields {
		return issues.ApprovalContextFields{
			ExpectedRevision:              review.IssueRevision,
			ExpectedWorkflowRevision:      review.WorkflowRevision,
			ExpectedConfigurationRevision: review.ConfigurationRevision,
		}
	}
	review = matrixSave[issues.ApprovalVoteInput, issues.ApprovalContextView, issues.ModernIssueFailureBody](t, m, a, command.VoteApproval, issues.ApprovalVoteInput{
		IssueID:               work.Summary.ID,
		TransitionID:          edge.TransitionID,
		ApprovalContextFields: context(),
		Decision:              issues.Reject,
		RetryReference:        uuid.NewString(),
	})
	review = matrixSave[issues.ApprovalResubmitInput, issues.ApprovalContextView, issues.ModernIssueFailureBody](t, m, a, command.ResubmitApproval, issues.ApprovalResubmitInput{
		IssueID:               work.Summary.ID,
		TransitionID:          edge.TransitionID,
		ApprovalContextFields: context(),
		RetryReference:        uuid.NewString(),
	})
	review = matrixSave[issues.ApprovalVoteInput, issues.ApprovalContextView, issues.ModernIssueFailureBody](t, m, a, command.VoteApproval, issues.ApprovalVoteInput{
		IssueID:               work.Summary.ID,
		TransitionID:          edge.TransitionID,
		ApprovalContextFields: context(),
		Decision:              issues.Approve,
		RetryReference:        uuid.NewString(),
	})
	if !review.ReviewSatisfied || len(review.Votes) != 2 {
		t.Fatal("review history and current context differ")
	}
}

func TestFieldsAndApprovalsUseConcreteTransportsAndReplay(t *testing.T) {
	matrixFieldsApprovals(t, newCatalogMatrix(t))
}
