package configuration

import (
	"context"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/httpapi"
	"github.com/danielgtaylor/huma/v2"
)

func registerWorkflowHTTP(api huma.API, s *Service) {
	registerRead(api, operation(api, command.ListWorkflows, "GET", "/projects/{projectId}/workflows"), func(ctx context.Context, a command.Actor, in *struct {
		ProjectID      command.ProjectID `path:"projectId"`
		IncludeRetired bool              `query:"includeRetired"`
		PageQuery
	}) (command.Page[WorkflowView], error) {
		return s.Workflows(ctx, a, ListInput{ProjectID: in.ProjectID, IncludeRetired: in.IncludeRetired, Page: in.page()})
	})
	registerRead(api, operation(api, command.ListWorkflowStages, "GET", "/projects/{projectId}/workflows/{workflowId}/stages"), func(ctx context.Context, a command.Actor, in *struct {
		ProjectID      command.ProjectID  `path:"projectId"`
		WorkflowID     command.WorkflowID `path:"workflowId"`
		IncludeRetired bool               `query:"includeRetired"`
		PageQuery
	}) (command.Page[StageView], error) {
		return s.Stages(ctx, a, StageListInput{
			ProjectID:      in.ProjectID,
			WorkflowID:     in.WorkflowID,
			IncludeRetired: in.IncludeRetired,
			Page:           in.page(),
		})
	})
	registerRead(api, operation(api, command.ListWorkflowTransitions, "GET", "/projects/{projectId}/workflows/{workflowId}/transitions"), func(ctx context.Context, a command.Actor, in *struct {
		ProjectID      command.ProjectID  `path:"projectId"`
		WorkflowID     command.WorkflowID `path:"workflowId"`
		IncludeRetired bool               `query:"includeRetired"`
		PageQuery
	}) (command.Page[TransitionView], error) {
		return s.Transitions(ctx, a, StageListInput{
			ProjectID:      in.ProjectID,
			WorkflowID:     in.WorkflowID,
			IncludeRetired: in.IncludeRetired,
			Page:           in.page(),
		})
	})
	registerRead(api, operation(api, command.ListTypeWorkflowBindings, "GET", "/projects/{projectId}/issue-types/{typeId}/workflows"), func(ctx context.Context, a command.Actor, in *struct {
		ProjectID command.ProjectID   `path:"projectId"`
		TypeID    command.IssueTypeID `path:"typeId"`
		PageQuery
	}) (command.Page[BindingView], error) {
		return s.Bindings(ctx, a, BindingListInput{ProjectID: in.ProjectID, TypeID: in.TypeID, Page: in.page()})
	})
	registerSave(api, operation(api, command.SaveWorkflow, "PUT", "/projects/{projectId}/workflows/{workflowId}"), func(ctx context.Context, a command.Actor, in *struct {
		httpapi.MutationHeader
		ProjectID  command.ProjectID  `path:"projectId"`
		WorkflowID command.WorkflowID `path:"workflowId"`
		Body       SaveWorkflowFields
	}) (command.SaveOutcome[WorkflowSaved], error) {
		return s.SaveWorkflow(ctx, a, SaveWorkflowInput{
			ProjectID:          in.ProjectID,
			WorkflowID:         in.WorkflowID,
			SaveWorkflowFields: in.Body,
			RetryReference:     in.RetryReference,
		})
	})
	registerSave(api, operation(api, command.SaveWorkflowStage, "PUT", "/projects/{projectId}/workflows/{workflowId}/stages/{stageId}"), func(ctx context.Context, a command.Actor, in *struct {
		httpapi.MutationHeader
		ProjectID  command.ProjectID  `path:"projectId"`
		WorkflowID command.WorkflowID `path:"workflowId"`
		StageID    command.StageID    `path:"stageId"`
		Body       SaveStageFields
	}) (command.SaveOutcome[StageSaved], error) {
		return s.SaveStage(ctx, a, SaveStageInput{
			ProjectID:       in.ProjectID,
			WorkflowID:      in.WorkflowID,
			StageID:         in.StageID,
			SaveStageFields: in.Body,
			RetryReference:  in.RetryReference,
		})
	})
	registerSave(api, operation(api, command.SaveWorkflowTransition, "PUT", "/projects/{projectId}/workflows/{workflowId}/transitions/{transitionId}"), func(ctx context.Context, a command.Actor, in *struct {
		httpapi.MutationHeader
		ProjectID    command.ProjectID    `path:"projectId"`
		WorkflowID   command.WorkflowID   `path:"workflowId"`
		TransitionID command.TransitionID `path:"transitionId"`
		Body         SaveTransitionFields
	}) (command.SaveOutcome[TransitionSaved], error) {
		return s.SaveTransition(ctx, a, SaveTransitionInput{
			ProjectID:            in.ProjectID,
			WorkflowID:           in.WorkflowID,
			TransitionID:         in.TransitionID,
			SaveTransitionFields: in.Body,
			RetryReference:       in.RetryReference,
		})
	})
	registerSave(api, operation(api, command.SetTypeWorkflowBinding, "PUT", "/projects/{projectId}/issue-types/{typeId}/workflows/{workflowId}"), func(ctx context.Context, a command.Actor, in *struct {
		httpapi.MutationHeader
		ProjectID  command.ProjectID   `path:"projectId"`
		TypeID     command.IssueTypeID `path:"typeId"`
		WorkflowID command.WorkflowID  `path:"workflowId"`
		Body       SetBindingFields
	}) (command.SaveOutcome[ConfigurationView], error) {
		return s.SetBinding(ctx, a, SetBindingInput{
			ProjectID:        in.ProjectID,
			TypeID:           in.TypeID,
			WorkflowID:       in.WorkflowID,
			SetBindingFields: in.Body,
			RetryReference:   in.RetryReference,
		})
	})
	registerSave(api, operation(api, command.MigrateWorkflowIssues, "POST", "/projects/{projectId}/workflow-migrations"), func(ctx context.Context, a command.Actor, in *struct {
		httpapi.MutationHeader
		ProjectID command.ProjectID `path:"projectId"`
		Body      MigrationFields
	}) (command.SaveOutcome[MigrationResult], error) {
		return s.Migrate(ctx, a, MigrationInput{
			ProjectID:       in.ProjectID,
			MigrationFields: in.Body,
			RetryReference:  in.RetryReference,
		})
	})
}
