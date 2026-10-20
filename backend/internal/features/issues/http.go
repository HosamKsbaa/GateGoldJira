package issues

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
func issueOperation(api huma.API, name command.Operation, method, path string) huma.Operation {
	responses := map[string]*huma.Response{}
	for _, status := range []int{400, 401, 403, 404, 409, 413, 422, 503} {
		responses[strconv.Itoa(status)] = &huma.Response{
			Description: "Safe typed failure",
			Content:     map[string]*huma.MediaType{"application/json": {Schema: api.OpenAPI().Components.Schemas.Schema(reflect.TypeFor[IssueFailureBody](), true, "")}},
		}
	}
	operation := huma.Operation{OperationID: string(name), Method: method, Path: "/api/v1" + path, Responses: responses}
	if name == command.CreateIssue || name == command.CreateLabel || name == command.CreateSubtask {
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
	if command.Operation(operation.OperationID) == command.CreateIssue || command.Operation(operation.OperationID) == command.CreateLabel {
		operation.Responses["200"] = &huma.Response{
			Description: "Existing record reused",
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
func RegisterHTTP(api huma.API, service *Service) {
	registerCanonicalHTTP(api, service)
	registerSave(api, issueOperation(api, command.PatchIssueField, "PATCH", "/issues/{issueId}/fields"), func(ctx context.Context, actor command.Actor, input *struct {
		httpapi.MutationHeader
		IssueID command.IssueID `path:"issueId"`
		Body    PatchFieldFields
	}) (command.SaveOutcome[IssueView], error) {
		return service.PatchField(ctx, actor, PatchFieldInput{
			IssueID:          input.IssueID,
			PatchFieldFields: input.Body,
			RetryReference:   input.RetryReference,
		})
	})
	registerBacklogHTTP(api, service)
	registerImportExportHTTP(api, service)
	registerOrganizationHTTP(api, service)
	registerRead(api, issueOperation(api, command.ListSubtasks, "GET", "/issues/{parentId}/subtasks"), func(ctx context.Context, a command.Actor, in *struct {
		ParentID command.IssueID `path:"parentId"`
		PageQuery
	}) (command.Page[IssueSummary], error) {
		return service.Subtasks(ctx, a, ListSubtasksInput{in.ParentID, in.page()})
	})
	registerSave(api, issueOperation(api, command.CreateSubtask, "POST", "/issues/{parentId}/subtasks"), func(ctx context.Context, a command.Actor, in *struct {
		httpapi.MutationHeader
		ParentID command.IssueID `path:"parentId"`
		Body     CreateSubtaskFields
	}) (command.SaveOutcome[IssueView], error) {
		return service.CreateSubtask(ctx, a, CreateSubtaskInput{in.ParentID, in.Body, in.RetryReference})
	})
	registerRead(api, issueOperation(api, command.ListLabels, "GET", "/projects/{projectId}/labels"), func(ctx context.Context, a command.Actor, in *struct {
		ProjectID command.ProjectID `path:"projectId"`
		Query     string            `query:"query" maxLength:"40"`
		PageQuery
	}) (command.Page[LabelView], error) {
		return service.Labels(ctx, a, ListLabelsInput{ProjectID: in.ProjectID, Query: in.Query, Page: in.page()})
	})
	registerSave(api, issueOperation(api, command.CreateLabel, "POST", "/projects/{projectId}/labels"), func(ctx context.Context, a command.Actor, in *struct {
		httpapi.MutationHeader
		ProjectID command.ProjectID `path:"projectId"`
		Body      CreateLabelFields
	}) (command.SaveOutcome[LabelView], error) {
		return service.CreateLabel(ctx, a, CreateLabelInput{
			ProjectID:         in.ProjectID,
			CreateLabelFields: in.Body,
			RetryReference:    in.RetryReference,
		})
	})
	registerRead(api, issueOperation(api, command.ListDependencies, "GET", "/issues/{issueId}/dependencies"), func(ctx context.Context, a command.Actor, in *struct {
		IssueID   command.IssueID     `path:"issueId"`
		Direction DependencyDirection `query:"direction" required:"true" enum:"blocked_by,blocks"`
		PageQuery
	}) (command.Page[DependencyView], error) {
		return service.Dependencies(ctx, a, ListDependenciesInput{
			IssueID:   in.IssueID,
			Direction: in.Direction,
			Page:      in.page(),
		})
	})
	registerSave(api, issueOperation(api, command.AddDependency, "POST", "/issues/{issueId}/dependencies"), func(ctx context.Context, a command.Actor, in *struct {
		httpapi.MutationHeader
		IssueID command.IssueID `path:"issueId"`
		Body    AddDependencyFields
	}) (command.SaveOutcome[DependencyView], error) {
		b := in.Body
		return service.AddDependency(ctx, a, AddDependencyInput{
			in.IssueID,
			b.BlockerID,
			b.ExpectedIssueRevision,
			b.ExpectedGraphRevision,
			in.RetryReference,
		})
	})
	registerSave(api, issueOperation(api, command.RemoveDependency, "POST", "/issues/{issueId}/dependencies/{blockerId}/remove"), func(ctx context.Context, a command.Actor, in *struct {
		httpapi.MutationHeader
		IssueID   command.IssueID `path:"issueId"`
		BlockerID command.IssueID `path:"blockerId"`
		Body      RemoveDependencyFields
	}) (command.SaveOutcome[DependencyView], error) {
		b := in.Body
		return service.RemoveDependency(ctx, a, RemoveDependencyInput{
			in.IssueID,
			in.BlockerID,
			b.ExpectedIssueRevision,
			b.ExpectedDependencyRevision,
			b.ExpectedGraphRevision,
			in.RetryReference,
		})
	})
	registerSave(api, issueOperation(api, command.MoveIssue, "POST", "/issues/{issueId}/move"), func(ctx context.Context, actor command.Actor, input *struct {
		httpapi.MutationHeader
		IssueID command.IssueID `path:"issueId"`
		Body    MoveIssueFields
	}) (command.SaveOutcome[command.MoveResult], error) {
		b := input.Body
		return service.Move(ctx, actor, MoveInput{
			input.IssueID,
			b.ExpectedRevision,
			b.TargetStatus,
			b.ExpectedSourceOrderRevision,
			b.ExpectedTargetOrderRevision,
			b.SourceBoardID,
			b.ExpectedBoardRevision,
			input.RetryReference,
		})
	})
	registerSave(api, issueOperation(api, command.ReorderIssue, "POST", "/issues/{issueId}/reorder"), func(ctx context.Context, actor command.Actor, input *struct {
		httpapi.MutationHeader
		IssueID command.IssueID `path:"issueId"`
		Body    ReorderIssueFields
	}) (command.SaveOutcome[command.MoveResult], error) {
		b := input.Body
		return service.Reorder(ctx, actor, ReorderInput{
			input.IssueID,
			b.ExpectedRevision,
			b.ExpectedOrderRevision,
			b.NeighborIssueID,
			b.Placement,
			b.SourceBoardID,
			b.ExpectedBoardRevision,
			input.RetryReference,
		})
	})
	registerRead(api, issueOperation(api, command.SearchIssues, "POST", "/issues/search"), func(ctx context.Context, actor command.Actor, input *struct{ Body SearchInput }) (command.Page[IssueSummary], error) {
		return service.Search(ctx, actor, input.Body)
	})
	registerRead(api, issueOperation(api, command.GetIssue, "GET", "/issues/{issueId}"), func(ctx context.Context, actor command.Actor, input *struct {
		IssueID command.IssueID `path:"issueId"`
	}) (IssueView, error) {
		return service.Get(ctx, actor, input.IssueID)
	})
	registerSave(api, issueOperation(api, command.CreateIssue, "POST", "/projects/{projectId}/issues"), func(ctx context.Context, actor command.Actor, input *struct {
		httpapi.MutationHeader
		ProjectID command.ProjectID `path:"projectId"`
		Body      CreateIssueFields
	}) (command.SaveOutcome[IssueView], error) {
		return service.Create(ctx, actor, CreateInput{
			ProjectID:         input.ProjectID,
			CreateIssueFields: input.Body,
			RetryReference:    input.RetryReference,
		})
	})
	registerSave(api, issueOperation(api, command.UpdateIssue, "PUT", "/issues/{issueId}"), func(ctx context.Context, actor command.Actor, input *struct {
		httpapi.MutationHeader
		IssueID command.IssueID `path:"issueId"`
		Body    UpdateIssueFields
	}) (command.SaveOutcome[IssueView], error) {
		return service.Update(ctx, actor, UpdateInput{
			IssueID:          input.IssueID,
			ExpectedRevision: input.Body.ExpectedRevision,
			Editable:         input.Body.Editable,
			RetryReference:   input.RetryReference,
		})
	})
}
