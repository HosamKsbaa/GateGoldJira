package boards

import (
	"context"
	"reflect"
	"strconv"

	"gategoldjira/backend/internal/platform/auth"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database"
	"gategoldjira/backend/internal/platform/httpapi"
	"github.com/danielgtaylor/huma/v2"
)

type PageQuery struct {
	Limit  int    `query:"limit" default:"25" minimum:"1" maximum:"100"`
	Cursor string `query:"cursor" minLength:"1" maxLength:"2048"`
}

func RegisterHTTP(api huma.API, service *Service) {
	registerNativeHTTP(api, service)
	registerRead(api, boardOperation(api, command.ListBoards, "GET", "/projects/{projectId}/boards"), func(ctx context.Context, actor command.Actor, input *struct {
		ProjectID command.ProjectID `path:"projectId"`
		PageQuery
		IncludeArchived bool `query:"includeArchived"`
	}) (command.Page[BoardSummary], error) {
		return service.List(ctx, actor, ListInput{input.ProjectID, input.page(), input.IncludeArchived})
	})
	registerRead(api, boardOperation(api, command.GetBoard, "GET", "/boards/{boardId}"), func(ctx context.Context, actor command.Actor, input *struct {
		BoardID          command.BoardID `path:"boardId"`
		TemporaryFilters string          `query:"temporaryFilters" maxLength:"16384" doc:"IssueFilter encoded as JSON. All supplied criteria are combined with the saved view."`
	}) (BoardView, error) {
		var filter command.IssueFilter
		if input.TemporaryFilters != "" {
			var err error
			filter, err = database.DecodeJSON[command.IssueFilter]([]byte(input.TemporaryFilters))
			if err != nil {
				return BoardView{}, validation("temporaryFilters", "Supply a valid IssueFilter JSON object.")
			}
		}
		return service.Get(ctx, actor, GetInput{input.BoardID, filter})
	})
	registerRead(api, boardOperation(api, command.ListBoardCards, "POST", "/boards/{boardId}/columns/{status}/search"), func(ctx context.Context, actor command.Actor, input *struct {
		BoardID command.BoardID `path:"boardId"`
		Status  command.Status  `path:"status"`
		Body    struct {
			TemporaryFilters command.IssueFilter `json:"temporaryFilters,omitempty"`
			Page             command.PageRequest `json:"page,omitempty"`
		}
	}) (CardPage, error) {
		return service.Cards(ctx, actor, CardsInput{
			input.BoardID,
			input.Status,
			input.Body.TemporaryFilters,
			input.Body.Page,
		})
	})
	registerSave(api, boardOperation(api, command.CreateBoard, "POST", "/projects/{projectId}/boards"), func(ctx context.Context, actor command.Actor, input *struct {
		httpapi.MutationHeader
		ProjectID command.ProjectID `path:"projectId"`
		Body      CreateBoardFields
	}) (command.SaveOutcome[BoardSummary], error) {
		return service.Create(ctx, actor, CreateInput{
			input.ProjectID,
			input.Body.Name,
			input.Body.SavedFilters,
			input.RetryReference,
		})
	})
	registerSave(api, boardOperation(api, command.UpdateBoard, "PUT", "/boards/{boardId}"), func(ctx context.Context, actor command.Actor, input *struct {
		httpapi.MutationHeader
		BoardID command.BoardID `path:"boardId"`
		Body    UpdateBoardFields
	}) (command.SaveOutcome[BoardSummary], error) {
		b := input.Body
		return service.Update(ctx, actor, UpdateInput{
			BoardID:          input.BoardID,
			ExpectedRevision: b.ExpectedRevision,
			Name:             b.Name,
			SavedFilters:     b.SavedFilters,
			WipLimits:        b.WipLimits,
			RetryReference:   input.RetryReference,
			Workflow:         b.Workflow,
			RetireStages:     b.RetireStages,
		})
	})
	registerSave(api, boardOperation(api, command.ArchiveBoard, "POST", "/boards/{boardId}/archive"), func(ctx context.Context, actor command.Actor, input *struct {
		httpapi.MutationHeader
		BoardID command.BoardID `path:"boardId"`
		Body    RevisionBoardFields
	}) (command.SaveOutcome[BoardSummary], error) {
		return service.Archive(ctx, actor, RevisionInput{input.BoardID, input.Body.ExpectedRevision, input.RetryReference})
	})
	registerSave(api, boardOperation(api, command.RestoreBoard, "POST", "/boards/{boardId}/restore"), func(ctx context.Context, actor command.Actor, input *struct {
		httpapi.MutationHeader
		BoardID command.BoardID `path:"boardId"`
		Body    RevisionBoardFields
	}) (command.SaveOutcome[BoardSummary], error) {
		return service.Restore(ctx, actor, RevisionInput{input.BoardID, input.Body.ExpectedRevision, input.RetryReference})
	})
}

func (query PageQuery) page() command.PageRequest {
	page := command.PageRequest{Limit: &query.Limit}
	if query.Cursor != "" {
		page.Cursor = &query.Cursor
	}
	return page
}
func boardOperation(api huma.API, name command.Operation, method, path string) huma.Operation {
	responses := map[string]*huma.Response{}
	for _, status := range []int{400, 401, 403, 404, 409, 413, 422, 503} {
		responses[strconv.Itoa(status)] = &huma.Response{
			Description: "Safe typed failure",
			Content:     map[string]*huma.MediaType{"application/json": {Schema: api.OpenAPI().Components.Schemas.Schema(reflect.TypeFor[BoardFailureBody](), true, "")}},
		}
	}
	operation := huma.Operation{OperationID: string(name), Method: method, Path: "/api/v1" + path, Responses: responses}
	if name == command.CreateBoard {
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
