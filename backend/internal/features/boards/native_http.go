package boards

import (
	"context"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database"
	"gategoldjira/backend/internal/platform/httpapi"
	"github.com/danielgtaylor/huma/v2"
	"reflect"
	"strconv"
)

// The V2 endpoints have identifier-based layouts and never embed a legacy workflow.
func nativeBoardOperation(api huma.API, name command.Operation, method, path string) huma.Operation {
	op := boardOperation(api, name, method, path)
	op.Path = "/api/v2" + path
	for _, status := range []int{400, 401, 403, 404, 409, 413, 422, 503} {
		op.Responses[strconv.Itoa(status)] = &huma.Response{
			Description: "Safe typed failure",
			Content:     map[string]*huma.MediaType{"application/json": {Schema: api.OpenAPI().Components.Schemas.Schema(reflect.TypeFor[BoardFailureBody](), true, "")}},
		}
	}
	if name == command.CreateModernBoard {
		op.DefaultStatus = 201
	}
	return op
}
func registerNativeHTTP(api huma.API, s *Service) {
	registerRead(api, nativeBoardOperation(api, command.GetBoardLayout, "GET", "/boards/{boardId}"), func(ctx context.Context, a command.Actor, in *struct {
		BoardID          command.BoardID `path:"boardId"`
		TemporaryFilters string          `query:"temporaryFilters" maxLength:"16384"`
	}) (LayoutView, error) {
		filter := command.IssueFilter{}
		if in.TemporaryFilters != "" {
			var err error
			filter, err = database.DecodeJSON[command.IssueFilter]([]byte(in.TemporaryFilters))
			if err != nil {
				return LayoutView{}, validation("temporaryFilters", "Supply a valid IssueFilter JSON object.")
			}
		}
		return s.GetLayout(ctx, a, GetInput{BoardID: in.BoardID, TemporaryFilters: filter})
	})
	registerRead(api, nativeBoardOperation(api, command.ListNativeBoardCards, "POST", "/boards/{boardId}/columns/{columnId}/search"), func(ctx context.Context, a command.Actor, in *struct {
		BoardID  command.BoardID  `path:"boardId"`
		ColumnID command.ColumnID `path:"columnId"`
		Body     struct {
			TemporaryFilters command.IssueFilter `json:"temporaryFilters,omitempty"`
			Page             command.PageRequest `json:"page,omitempty"`
		}
	}) (NativeCardPage, error) {
		return s.NativeCards(ctx, a, NativeCardsInput{
			BoardID:          in.BoardID,
			ColumnID:         in.ColumnID,
			TemporaryFilters: in.Body.TemporaryFilters,
			Page:             in.Body.Page,
		})
	})
	registerSave(api, nativeBoardOperation(api, command.SaveBoardLayout, "PUT", "/boards/{boardId}/layout"), func(ctx context.Context, a command.Actor, in *struct {
		httpapi.MutationHeader
		BoardID command.BoardID `path:"boardId"`
		Body    SaveLayoutFields
	}) (command.SaveOutcome[LayoutView], error) {
		return s.SaveLayout(ctx, a, SaveLayoutInput{
			BoardID:          in.BoardID,
			SaveLayoutFields: in.Body,
			RetryReference:   in.RetryReference,
		})
	})
	registerSave(api, nativeBoardOperation(api, command.CreateModernBoard, "POST", "/projects/{projectId}/boards"), func(ctx context.Context, a command.Actor, in *struct {
		httpapi.MutationHeader
		ProjectID command.ProjectID `path:"projectId"`
		Body      CreateBoardFields
	}) (command.SaveOutcome[LayoutView], error) {
		return s.CreateModernBoard(ctx, a, CreateInput{
			ProjectID:      in.ProjectID,
			Name:           in.Body.Name,
			SavedFilters:   in.Body.SavedFilters,
			RetryReference: in.RetryReference,
		})
	})
	registerSave(api, nativeBoardOperation(api, command.MoveBoardCard, "POST", "/boards/{boardId}/cards/move"), func(ctx context.Context, a command.Actor, in *struct {
		httpapi.MutationHeader
		BoardID command.BoardID `path:"boardId"`
		Body    NativeMoveFields
	}) (command.SaveOutcome[NativeMoveResult], error) {
		return s.MoveCard(ctx, a, NativeMoveInput{
			BoardID:          in.BoardID,
			NativeMoveFields: in.Body,
			RetryReference:   in.RetryReference,
		})
	})
	registerSave(api, nativeBoardOperation(api, command.ReorderBoardCard, "POST", "/boards/{boardId}/cards/reorder"), func(ctx context.Context, a command.Actor, in *struct {
		httpapi.MutationHeader
		BoardID command.BoardID `path:"boardId"`
		Body    NativeMoveFields
	}) (command.SaveOutcome[NativeMoveResult], error) {
		return s.ReorderCard(ctx, a, NativeMoveInput{
			BoardID:          in.BoardID,
			NativeMoveFields: in.Body,
			RetryReference:   in.RetryReference,
		})
	})
}
