package configuration

import (
	"context"
	"gategoldjira/backend/internal/platform/auth"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/httpapi"
	"github.com/danielgtaylor/huma/v2"
	"reflect"
	"strconv"
)

type PageQuery struct {
	Limit  int    `query:"limit" default:"25" minimum:"1" maximum:"100"`
	Cursor string `query:"cursor" minLength:"1" maxLength:"2048"`
}

func (q PageQuery) page() command.PageRequest {
	p := command.PageRequest{Limit: &q.Limit}
	if q.Cursor != "" {
		p.Cursor = &q.Cursor
	}
	return p
}
func operation(api huma.API, name command.Operation, method, path string) huma.Operation {
	responses := map[string]*huma.Response{}
	for _, status := range []int{400, 401, 403, 404, 409, 413, 422, 503} {
		responses[strconv.Itoa(status)] = &huma.Response{
			Description: "Safe typed failure",
			Content:     map[string]*huma.MediaType{"application/json": {Schema: api.OpenAPI().Components.Schemas.Schema(reflect.TypeFor[ConfigurationFailureBody](), true, "")}},
		}
	}
	operation := huma.Operation{OperationID: string(name), Method: method, Path: "/api/v2" + path, Responses: responses}
	return operation
}
func registerRead[In, Out any](api huma.API, operation huma.Operation, run func(context.Context, command.Actor, *In) (Out, error)) {
	huma.Register(api, operation, func(ctx context.Context, input *In) (*struct{ Body Out }, error) {
		actor, err := auth.Actor(ctx)
		if err != nil {
			return nil, transportError(err)
		}
		out, err := run(ctx, actor, input)
		if err != nil {
			return nil, transportError(err)
		}
		return &struct{ Body Out }{Body: out}, nil
	})
}
func registerSave[In, Out any](api huma.API, operation huma.Operation, run func(context.Context, command.Actor, *In) (command.SaveOutcome[Out], error)) {
	switch command.Operation(operation.OperationID) {
	case command.SaveIssueType, command.SavePriority, command.SaveField, command.SaveFieldOption:
		operation.Responses["201"] = &huma.Response{
			Description: "Created",
			Content:     map[string]*huma.MediaType{"application/json": {Schema: api.OpenAPI().Components.Schemas.Schema(reflect.TypeFor[command.Saved[Out]](), true, "")}},
		}
	}
	huma.Register(api, operation, func(ctx context.Context, input *In) (*struct {
		Status int
		Body   command.Saved[Out]
	}, error) {
		actor, err := auth.Actor(ctx)
		if err != nil {
			return nil, transportError(err)
		}
		out, err := run(ctx, actor, input)
		if err != nil {
			return nil, transportError(err)
		}
		return &struct {
			Status int
			Body   command.Saved[Out]
		}{Status: out.HTTPStatus, Body: out.Body}, nil
	})
}
func RegisterHTTP(api huma.API, s *Service) {
	registerRead(api, operation(api, command.GetProjectActivation, "GET", "/projects/{projectId}/configuration/activation"), func(ctx context.Context, a command.Actor, in *struct {
		ProjectID command.ProjectID `path:"projectId"`
	}) (ActivationReadiness, error) {
		return s.ActivationReadiness(ctx, a, GetInput{in.ProjectID})
	})
	registerSave(api, operation(api, command.ActivateProjectCore, "POST", "/projects/{projectId}/configuration/activation"), func(ctx context.Context, a command.Actor, in *struct {
		httpapi.MutationHeader
		ProjectID command.ProjectID `path:"projectId"`
		Body      ActivateFields
	}) (command.SaveOutcome[ConfigurationView], error) {
		return s.Activate(ctx, a, ActivateInput{
			ProjectID:      in.ProjectID,
			ActivateFields: in.Body,
			RetryReference: in.RetryReference,
		})
	})
	registerFieldHTTP(api, s)
	registerWorkflowHTTP(api, s)
	registerRead(api, operation(api, command.GetProjectConfiguration, "GET", "/projects/{projectId}/configuration"), func(ctx context.Context, a command.Actor, in *struct {
		ProjectID command.ProjectID `path:"projectId"`
	}) (ConfigurationView, error) {
		return s.Get(ctx, a, GetInput{in.ProjectID})
	})
	registerRead(api, operation(api, command.ListIssueTypes, "GET", "/projects/{projectId}/issue-types"), func(ctx context.Context, a command.Actor, in *struct {
		ProjectID      command.ProjectID `path:"projectId"`
		IncludeRetired bool              `query:"includeRetired"`
		PageQuery
	}) (command.Page[TypeView], error) {
		return s.Types(ctx, a, ListInput{ProjectID: in.ProjectID, IncludeRetired: in.IncludeRetired, Page: in.page()})
	})
	registerRead(api, operation(api, command.ListPriorities, "GET", "/projects/{projectId}/priorities"), func(ctx context.Context, a command.Actor, in *struct {
		ProjectID      command.ProjectID `path:"projectId"`
		IncludeRetired bool              `query:"includeRetired"`
		PageQuery
	}) (command.Page[PriorityView], error) {
		return s.Priorities(ctx, a, ListInput{ProjectID: in.ProjectID, IncludeRetired: in.IncludeRetired, Page: in.page()})
	})
	registerSave(api, operation(api, command.SaveIssueType, "PUT", "/projects/{projectId}/issue-types/{typeId}"), func(ctx context.Context, a command.Actor, in *struct {
		httpapi.MutationHeader
		ProjectID command.ProjectID   `path:"projectId"`
		TypeID    command.IssueTypeID `path:"typeId"`
		Body      SaveTypeFields
	}) (command.SaveOutcome[TypeSaved], error) {
		return s.SaveType(ctx, a, SaveTypeInput{
			ProjectID:      in.ProjectID,
			TypeID:         in.TypeID,
			SaveTypeFields: in.Body,
			RetryReference: in.RetryReference,
		})
	})
	registerSave(api, operation(api, command.SavePriority, "PUT", "/projects/{projectId}/priorities/{priorityId}"), func(ctx context.Context, a command.Actor, in *struct {
		httpapi.MutationHeader
		ProjectID  command.ProjectID  `path:"projectId"`
		PriorityID command.PriorityID `path:"priorityId"`
		Body       SavePriorityFields
	}) (command.SaveOutcome[PrioritySaved], error) {
		return s.SavePriority(ctx, a, SavePriorityInput{
			ProjectID:          in.ProjectID,
			PriorityID:         in.PriorityID,
			SavePriorityFields: in.Body,
			RetryReference:     in.RetryReference,
		})
	})
	registerSave(api, operation(api, command.SetProjectDefaults, "PUT", "/projects/{projectId}/configuration/defaults"), func(ctx context.Context, a command.Actor, in *struct {
		httpapi.MutationHeader
		ProjectID command.ProjectID `path:"projectId"`
		Body      SetDefaultsFields
	}) (command.SaveOutcome[ConfigurationView], error) {
		return s.SetDefaults(ctx, a, SetDefaultsInput{
			ProjectID:         in.ProjectID,
			SetDefaultsFields: in.Body,
			RetryReference:    in.RetryReference,
		})
	})
}
