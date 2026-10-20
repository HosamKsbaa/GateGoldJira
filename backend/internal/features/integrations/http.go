package integrations

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
			Content:     map[string]*huma.MediaType{"application/json": {Schema: api.OpenAPI().Components.Schemas.Schema(reflect.TypeFor[httpapi.FailureBody](), true, "")}},
		}
	}
	operation := huma.Operation{OperationID: string(name), Method: method, Path: "/api/v1" + path, Responses: responses}
	if name == command.SaveDevelopmentLink {
		operation.DefaultStatus = 201
	}
	return operation
}
func registerRead[In, Out any](api huma.API, operation huma.Operation, run func(context.Context, command.Actor, *In) (Out, error)) {
	huma.Register(api, operation, func(ctx context.Context, input *In) (*struct{ Body Out }, error) {
		actor, err := auth.Actor(ctx)
		if err != nil {
			return nil, httpapi.Error(err)
		}
		out, err := run(ctx, actor, input)
		if err != nil {
			return nil, httpapi.Error(err)
		}
		return &struct{ Body Out }{Body: out}, nil
	})
}
func registerSave[In, Out any](api huma.API, operation huma.Operation, run func(context.Context, command.Actor, *In) (command.SaveOutcome[Out], error)) {
	status := ""
	description := ""
	switch command.Operation(operation.OperationID) {
	case command.SaveDevelopmentLink:
		status, description = "200", "OK"
	case command.SaveAutomationRule:
		status, description = "201", "Created"
	}
	if status != "" {
		operation.Responses[status] = &huma.Response{
			Description: description,
			Content:     map[string]*huma.MediaType{"application/json": {Schema: api.OpenAPI().Components.Schemas.Schema(reflect.TypeFor[command.Saved[Out]](), true, "")}},
		}
	}
	huma.Register(api, operation, func(ctx context.Context, input *In) (*struct {
		Status int
		Body   command.Saved[Out]
	}, error) {
		actor, err := auth.Actor(ctx)
		if err != nil {
			return nil, httpapi.Error(err)
		}
		out, err := run(ctx, actor, input)
		if err != nil {
			return nil, httpapi.Error(err)
		}
		return &struct {
			Status int
			Body   command.Saved[Out]
		}{Status: out.HTTPStatus, Body: out.Body}, nil
	})
}
func RegisterHTTP(api huma.API, s *Service) {
	registerRead(api, operation(api, command.ListDevelopmentLinks, "GET", "/issues/{issueId}/development-links"), func(ctx context.Context, a command.Actor, in *struct {
		IssueID command.IssueID `path:"issueId"`
		PageQuery
	}) (command.Page[DevelopmentLinkView], error) {
		return s.ListLinks(ctx, a, DevelopmentListInput{in.IssueID, in.page()})
	})
	registerSave(api, operation(api, command.SaveDevelopmentLink, "PUT", "/issues/{issueId}/development-links/{linkId}"), func(ctx context.Context, a command.Actor, in *struct {
		httpapi.MutationHeader
		IssueID command.IssueID `path:"issueId"`
		LinkID  LinkID          `path:"linkId"`
		Body    DevelopmentLinkFields
	}) (command.SaveOutcome[DevelopmentLinkView], error) {
		return s.SaveLink(ctx, a, DevelopmentLinkInput{in.IssueID, in.LinkID, in.Body, in.RetryReference})
	})
	registerRead(api, operation(api, command.ListAutomationRules, "GET", "/projects/{projectId}/automation-rules"), func(ctx context.Context, a command.Actor, in *struct {
		ProjectID command.ProjectID `path:"projectId"`
		PageQuery
	}) (command.Page[AutomationRuleView], error) {
		return s.ListRules(ctx, a, AutomationListInput{in.ProjectID, in.page()})
	})
	registerSave(api, operation(api, command.SaveAutomationRule, "PUT", "/projects/{projectId}/automation-rules/{ruleId}"), func(ctx context.Context, a command.Actor, in *struct {
		httpapi.MutationHeader
		ProjectID command.ProjectID `path:"projectId"`
		RuleID    RuleID            `path:"ruleId"`
		Body      AutomationRuleFields
	}) (command.SaveOutcome[AutomationRuleView], error) {
		return s.SaveRule(ctx, a, AutomationRuleInput{in.ProjectID, in.RuleID, in.Body, in.RetryReference})
	})
}
