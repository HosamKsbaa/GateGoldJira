package issues

import (
	"context"
	"gategoldjira/backend/internal/platform/auth"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/httpapi"
	"github.com/danielgtaylor/huma/v2"
	"reflect"
	"strconv"
)

func canonicalOperation(api huma.API, op command.Operation, method, path string) huma.Operation {
	responses := map[string]*huma.Response{}
	for _, status := range []int{400, 401, 403, 404, 409, 413, 422, 503} {
		responses[strconv.Itoa(status)] = &huma.Response{
			Description: "Safe typed failure",
			Content:     map[string]*huma.MediaType{"application/json": {Schema: api.OpenAPI().Components.Schemas.Schema(reflect.TypeFor[ModernIssueFailureBody](), true, "")}},
		}
	}
	result := huma.Operation{OperationID: string(op), Method: method, Path: "/api/v2" + path, Responses: responses}
	if op == command.CreateModernIssue {
		result.DefaultStatus = 201
	}
	return result
}
func registerCanonicalRead[In, Out any](api huma.API, op huma.Operation, run func(context.Context, command.Actor, *In) (Out, error)) {
	huma.Register(api, op, func(ctx context.Context, in *In) (*struct{ Body Out }, error) {
		actor, err := auth.Actor(ctx)
		if err != nil {
			return nil, modernTransportError(err)
		}
		out, err := run(ctx, actor, in)
		if err != nil {
			return nil, modernTransportError(err)
		}
		return &struct{ Body Out }{Body: out}, nil
	})
}
func registerCanonicalSave[In, Out any](api huma.API, op huma.Operation, run func(context.Context, command.Actor, *In) (command.SaveOutcome[Out], error)) {
	if command.Operation(op.OperationID) == command.CreateModernIssue {
		op.Responses["200"] = &huma.Response{
			Description: "Existing import source reused",
			Content:     map[string]*huma.MediaType{"application/json": {Schema: api.OpenAPI().Components.Schemas.Schema(reflect.TypeFor[command.Saved[Out]](), true, "")}},
		}
	}
	huma.Register(api, op, func(ctx context.Context, in *In) (*struct {
		Status int
		Body   command.Saved[Out]
	}, error) {
		actor, err := auth.Actor(ctx)
		if err != nil {
			return nil, modernTransportError(err)
		}
		out, err := run(ctx, actor, in)
		if err != nil {
			return nil, modernTransportError(err)
		}
		return &struct {
			Status int
			Body   command.Saved[Out]
		}{Status: out.HTTPStatus, Body: out.Body}, nil
	})
}
func registerCanonicalHTTP(api huma.API, s *Service) {
	registerFieldHTTP(api, s)
	registerCanonicalRead(api, canonicalOperation(api, command.ListIssueTransitions, "GET", "/issues/{issueId}/transitions"), func(ctx context.Context, a command.Actor, in *struct {
		IssueID command.IssueID `path:"issueId"`
		PageQuery
	}) (command.Page[IssueTransitionOption], error) {
		return s.TransitionOptions(ctx, a, TransitionOptionsInput{IssueID: in.IssueID, Page: in.page()})
	})
	registerCanonicalRead(api, canonicalOperation(api, command.GetModernIssue, "GET", "/issues/{issueId}"), func(ctx context.Context, a command.Actor, in *struct {
		IssueID command.IssueID `path:"issueId"`
	}) (ModernIssueView, error) {
		return s.GetModern(ctx, a, in.IssueID)
	})
	registerCanonicalRead(api, canonicalOperation(api, command.SearchModernIssues, "POST", "/issues/search"), func(ctx context.Context, a command.Actor, in *struct{ Body ModernSearchInput }) (command.Page[ModernIssueSummary], error) {
		return s.SearchModern(ctx, a, in.Body)
	})
	registerCanonicalSave(api, canonicalOperation(api, command.CreateModernIssue, "POST", "/projects/{projectId}/issues"), func(ctx context.Context, a command.Actor, in *struct {
		httpapi.MutationHeader
		ProjectID command.ProjectID `path:"projectId"`
		Body      ModernCreateFields
	}) (command.SaveOutcome[ModernIssueView], error) {
		return s.CreateModern(ctx, a, ModernCreateInput{
			ProjectID:          in.ProjectID,
			ModernCreateFields: in.Body,
			RetryReference:     in.RetryReference,
		})
	})
	registerCanonicalSave(api, canonicalOperation(api, command.UpdateModernIssue, "PUT", "/issues/{issueId}"), func(ctx context.Context, a command.Actor, in *struct {
		httpapi.MutationHeader
		IssueID command.IssueID `path:"issueId"`
		Body    ModernUpdateFields
	}) (command.SaveOutcome[ModernIssueView], error) {
		return s.UpdateModern(ctx, a, ModernUpdateInput{
			IssueID:            in.IssueID,
			ModernUpdateFields: in.Body,
			RetryReference:     in.RetryReference,
		})
	})
	registerCanonicalSave(api, canonicalOperation(api, command.PatchModernIssueField, "PATCH", "/issues/{issueId}/fields"), func(ctx context.Context, a command.Actor, in *struct {
		httpapi.MutationHeader
		IssueID command.IssueID `path:"issueId"`
		Body    ModernPatchFields
	}) (command.SaveOutcome[ModernIssueView], error) {
		return s.PatchModernField(ctx, a, ModernPatchInput{
			IssueID:           in.IssueID,
			ModernPatchFields: in.Body,
			RetryReference:    in.RetryReference,
		})
	})
	registerCanonicalSave(api, canonicalOperation(api, command.MoveModernIssue, "POST", "/issues/{issueId}/move"), func(ctx context.Context, a command.Actor, in *struct {
		httpapi.MutationHeader
		IssueID command.IssueID `path:"issueId"`
		Body    ModernMoveFields
	}) (command.SaveOutcome[ModernIssueView], error) {
		return s.MoveModern(ctx, a, ModernMoveInput{
			IssueID:          in.IssueID,
			ModernMoveFields: in.Body,
			RetryReference:   in.RetryReference,
		})
	})
}
