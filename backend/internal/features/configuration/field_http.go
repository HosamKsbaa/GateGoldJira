package configuration

import (
	"context"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/httpapi"
	"github.com/danielgtaylor/huma/v2"
)

func registerFieldHTTP(api huma.API, s *Service) {
	registerRead(api, operation(api, command.ListFields, "GET", "/projects/{projectId}/fields"), func(ctx context.Context, a command.Actor, in *struct {
		ProjectID      command.ProjectID `path:"projectId"`
		IncludeRetired bool              `query:"includeRetired"`
		PageQuery
	}) (command.Page[FieldView], error) {
		return s.Fields(ctx, a, ListInput{ProjectID: in.ProjectID, IncludeRetired: in.IncludeRetired, Page: in.page()})
	})
	registerRead(api, operation(api, command.ListFieldOptions, "GET", "/projects/{projectId}/fields/{fieldId}/options"), func(ctx context.Context, a command.Actor, in *struct {
		ProjectID      command.ProjectID `path:"projectId"`
		FieldID        command.FieldID   `path:"fieldId"`
		IncludeRetired bool              `query:"includeRetired"`
		PageQuery
	}) (command.Page[FieldOptionView], error) {
		return s.FieldOptions(ctx, a, FieldOptionsInput{
			ProjectID:      in.ProjectID,
			FieldID:        in.FieldID,
			IncludeRetired: in.IncludeRetired,
			Page:           in.page(),
		})
	})
	registerSave(api, operation(api, command.SaveField, "PUT", "/projects/{projectId}/fields/{fieldId}"), func(ctx context.Context, a command.Actor, in *struct {
		httpapi.MutationHeader
		ProjectID command.ProjectID `path:"projectId"`
		FieldID   command.FieldID   `path:"fieldId"`
		Body      SaveFieldFields
	}) (command.SaveOutcome[FieldSaved], error) {
		return s.SaveField(ctx, a, SaveFieldInput{
			RetryReference:  in.RetryReference,
			ProjectID:       in.ProjectID,
			FieldID:         in.FieldID,
			SaveFieldFields: in.Body,
		})
	})
	registerSave(api, operation(api, command.SaveFieldOption, "PUT", "/projects/{projectId}/fields/{fieldId}/options/{optionId}"), func(ctx context.Context, a command.Actor, in *struct {
		httpapi.MutationHeader
		ProjectID command.ProjectID     `path:"projectId"`
		FieldID   command.FieldID       `path:"fieldId"`
		OptionID  command.FieldOptionID `path:"optionId"`
		Body      SaveFieldOptionFields
	}) (command.SaveOutcome[FieldOptionSaved], error) {
		return s.SaveFieldOption(ctx, a, SaveFieldOptionInput{
			RetryReference:        in.RetryReference,
			ProjectID:             in.ProjectID,
			FieldID:               in.FieldID,
			OptionID:              in.OptionID,
			SaveFieldOptionFields: in.Body,
		})
	})
	registerSave(api, operation(api, command.BackfillFieldDefaults, "POST", "/projects/{projectId}/fields/{fieldId}/backfill"), func(ctx context.Context, a command.Actor, in *struct {
		httpapi.MutationHeader
		ProjectID command.ProjectID `path:"projectId"`
		FieldID   command.FieldID   `path:"fieldId"`
		Body      BackfillFieldFields
	}) (command.SaveOutcome[BackfillFieldResult], error) {
		return s.BackfillField(ctx, a, BackfillFieldInput{
			RetryReference:      in.RetryReference,
			ProjectID:           in.ProjectID,
			FieldID:             in.FieldID,
			BackfillFieldFields: in.Body,
		})
	})
	registerRead(api, operation(api, command.GetTransitionPolicy, "GET", "/projects/{projectId}/workflows/{workflowId}/transitions/{transitionId}/policy"), func(ctx context.Context, a command.Actor, in *struct {
		ProjectID    command.ProjectID    `path:"projectId"`
		WorkflowID   command.WorkflowID   `path:"workflowId"`
		TransitionID command.TransitionID `path:"transitionId"`
	}) (TransitionPolicyView, error) {
		return s.GetTransitionPolicy(ctx, a, TransitionPolicyInput{
			ProjectID:    in.ProjectID,
			WorkflowID:   in.WorkflowID,
			TransitionID: in.TransitionID,
		})
	})
	registerSave(api, operation(api, command.SaveTransitionPolicy, "PUT", "/projects/{projectId}/workflows/{workflowId}/transitions/{transitionId}/policy"), func(ctx context.Context, a command.Actor, in *struct {
		httpapi.MutationHeader
		ProjectID    command.ProjectID    `path:"projectId"`
		WorkflowID   command.WorkflowID   `path:"workflowId"`
		TransitionID command.TransitionID `path:"transitionId"`
		Body         TransitionPolicyFields
	}) (command.SaveOutcome[TransitionPolicyView], error) {
		return s.SaveTransitionPolicy(ctx, a, SaveTransitionPolicyInput{
			RetryReference:         in.RetryReference,
			ProjectID:              in.ProjectID,
			WorkflowID:             in.WorkflowID,
			TransitionID:           in.TransitionID,
			TransitionPolicyFields: in.Body,
		})
	})
}
