package projects

import (
	"context"
	"reflect"
	"strconv"

	"gategoldjira/backend/internal/platform/auth"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/httpapi"
	"github.com/danielgtaylor/huma/v2"
)

type PageQuery struct {
	Limit  int    `query:"limit" default:"25" minimum:"1" maximum:"100"`
	Cursor string `query:"cursor" minLength:"1" maxLength:"2048"`
}

func (query PageQuery) page() command.PageRequest {
	page := command.PageRequest{Limit: &query.Limit}
	if query.Cursor != "" {
		page.Cursor = &query.Cursor
	}
	return page
}
func projectOperation(api huma.API, name command.Operation, method, path string) huma.Operation {
	responses := map[string]*huma.Response{}
	for _, status := range []int{400, 401, 403, 404, 409, 413, 422, 503} {
		responses[strconv.Itoa(status)] = &huma.Response{
			Description: "Safe typed failure",
			Content:     map[string]*huma.MediaType{"application/json": {Schema: api.OpenAPI().Components.Schemas.Schema(reflect.TypeFor[ProjectFailureBody](), true, "")}},
		}
	}
	operation := huma.Operation{OperationID: string(name), Method: method, Path: "/api/v1" + path, Responses: responses}
	if name == command.CreateProject {
		operation.DefaultStatus = 201
	}
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
func RegisterHTTP(api huma.API, service *Service) {
	registerRead(api, projectOperation(api, command.ListProjects, "GET", "/projects"), func(ctx context.Context, actor command.Actor, input *struct {
		PageQuery
		IncludeArchived bool `query:"includeArchived"`
	}) (command.Page[ProjectView], error) {
		return service.List(ctx, actor, ListInput{Page: input.page(), IncludeArchived: input.IncludeArchived})
	})
	registerRead(api, projectOperation(api, command.GetProject, "GET", "/projects/{projectId}"), func(ctx context.Context, actor command.Actor, input *struct {
		ProjectID command.ProjectID `path:"projectId"`
	}) (ProjectView, error) {
		return service.Get(ctx, actor, input.ProjectID)
	})
	registerSave(api, projectOperation(api, command.CreateProject, "POST", "/projects"), func(ctx context.Context, actor command.Actor, input *struct {
		httpapi.MutationHeader
		Body CreateFields
	}) (command.SaveOutcome[ProjectView], error) {
		return service.Create(ctx, actor, CreateInput{
			Key:            input.Body.Key,
			Name:           input.Body.Name,
			Description:    input.Body.Description,
			RetryReference: input.RetryReference,
		})
	})
	registerSave(api, projectOperation(api, command.UpdateProject, "PUT", "/projects/{projectId}"), func(ctx context.Context, actor command.Actor, input *struct {
		httpapi.MutationHeader
		ProjectID command.ProjectID `path:"projectId"`
		Body      UpdateFields
	}) (command.SaveOutcome[ProjectView], error) {
		return service.Update(ctx, actor, UpdateInput{
			ProjectID:        input.ProjectID,
			ExpectedRevision: input.Body.ExpectedRevision,
			Name:             input.Body.Name,
			Description:      input.Body.Description,
			RetryReference:   input.RetryReference,
		})
	})
	type revisionRequest struct {
		httpapi.MutationHeader
		ProjectID command.ProjectID `path:"projectId"`
		Body      RevisionFields
	}
	registerSave(api, projectOperation(api, command.ArchiveProject, "POST", "/projects/{projectId}/archive"), func(ctx context.Context, actor command.Actor, input *revisionRequest) (command.SaveOutcome[ProjectView], error) {
		return service.Archive(ctx, actor, RevisionInput{
			ProjectID:        input.ProjectID,
			ExpectedRevision: input.Body.ExpectedRevision,
			RetryReference:   input.RetryReference,
		})
	})
	registerSave(api, projectOperation(api, command.RestoreProject, "POST", "/projects/{projectId}/restore"), func(ctx context.Context, actor command.Actor, input *revisionRequest) (command.SaveOutcome[ProjectView], error) {
		return service.Restore(ctx, actor, RevisionInput{
			ProjectID:        input.ProjectID,
			ExpectedRevision: input.Body.ExpectedRevision,
			RetryReference:   input.RetryReference,
		})
	})
}
