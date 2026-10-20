package comments

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

func (p PageQuery) page() command.PageRequest {
	r := command.PageRequest{Limit: &p.Limit}
	if p.Cursor != "" {
		r.Cursor = &p.Cursor
	}
	return r
}
func operation(api huma.API, name command.Operation, method, path string) huma.Operation {
	responses := map[string]*huma.Response{}
	for _, status := range []int{400, 401, 403, 404, 409, 413, 422, 503} {
		responses[strconv.Itoa(status)] = &huma.Response{
			Description: "Safe typed failure",
			Content:     map[string]*huma.MediaType{"application/json": {Schema: api.OpenAPI().Components.Schemas.Schema(reflect.TypeFor[CommentFailureBody](), true, "")}},
		}
	}
	op := huma.Operation{OperationID: string(name), Method: method, Path: "/api/v1" + path, Responses: responses}
	if name == command.CreateComment {
		op.DefaultStatus = 201
	}
	return op
}
func registerRead[In, Out any](api huma.API, op huma.Operation, run func(context.Context, command.Actor, *In) (Out, error)) {
	huma.Register(api, op, func(ctx context.Context, in *In) (*struct{ Body Out }, error) {
		actor, err := auth.Actor(ctx)
		if err != nil {
			return nil, transportError(err)
		}
		out, err := run(ctx, actor, in)
		if err != nil {
			return nil, transportError(err)
		}
		return &struct{ Body Out }{out}, nil
	})
}
func registerSave[In, Out any](api huma.API, op huma.Operation, run func(context.Context, command.Actor, *In) (command.SaveOutcome[Out], error)) {
	huma.Register(api, op, func(ctx context.Context, in *In) (*struct {
		Status int
		Body   command.Saved[Out]
	}, error) {
		actor, err := auth.Actor(ctx)
		if err != nil {
			return nil, transportError(err)
		}
		out, err := run(ctx, actor, in)
		if err != nil {
			return nil, transportError(err)
		}
		return &struct {
			Status int
			Body   command.Saved[Out]
		}{out.HTTPStatus, out.Body}, nil
	})
}
func RegisterHTTP(api huma.API, s *Service) {
	registerRead(api, operation(api, command.ListComments, "GET", "/issues/{issueId}/comments"), func(ctx context.Context, a command.Actor, in *struct {
		IssueID command.IssueID `path:"issueId"`
		PageQuery
	}) (command.Page[CommentView], error) {
		return s.List(ctx, a, ListInput{in.IssueID, in.page()})
	})
	registerRead(api, operation(api, command.ListCommentVersions, "GET", "/comments/{commentId}/versions"), func(ctx context.Context, a command.Actor, in *struct {
		CommentID command.CommentID `path:"commentId"`
		PageQuery
	}) (command.Page[VersionView], error) {
		return s.Versions(ctx, a, ListVersionsInput{in.CommentID, in.page()})
	})
	registerSave(api, operation(api, command.CreateComment, "POST", "/issues/{issueId}/comments"), func(ctx context.Context, a command.Actor, in *struct {
		httpapi.MutationHeader
		IssueID command.IssueID `path:"issueId"`
		Body    CreateFields
	}) (command.SaveOutcome[CommentView], error) {
		return s.Create(ctx, a, CreateInput{in.IssueID, in.Body.Body, in.RetryReference})
	})
	registerSave(api, operation(api, command.UpdateComment, "PUT", "/comments/{commentId}"), func(ctx context.Context, a command.Actor, in *struct {
		httpapi.MutationHeader
		CommentID command.CommentID `path:"commentId"`
		Body      UpdateFields
	}) (command.SaveOutcome[CommentView], error) {
		return s.Update(ctx, a, UpdateInput{in.CommentID, in.Body.ExpectedRevision, in.Body.Body, in.RetryReference})
	})
}
