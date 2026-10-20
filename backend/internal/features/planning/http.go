package planning

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
			Content:     map[string]*huma.MediaType{"application/json": {Schema: api.OpenAPI().Components.Schemas.Schema(reflect.TypeFor[PlanningFailureBody](), true, "")}},
		}
	}
	operation := huma.Operation{OperationID: string(name), Method: method, Path: "/api/v1" + path, Responses: responses}
	if name == command.CreatePlanningItem {
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
func RegisterHTTP(api huma.API, s *Service) {
	registerRead(api, operation(api, command.ListPlanningItems, "GET", "/projects/{projectId}/planning"), func(ctx context.Context, a command.Actor, in *struct {
		ProjectID command.ProjectID `path:"projectId"`
		Kind      string            `query:"kind" enum:"epic,release"`
		PageQuery
	}) (command.Page[PlanningItemView], error) {
		var kind *Kind
		if in.Kind != "" {
			value := Kind(in.Kind)
			kind = &value
		}
		return s.List(ctx, a, PlanningListInput{in.ProjectID, kind, in.page()})
	})
	registerRead(api, operation(api, command.ListPlanningIssues, "GET", "/projects/{projectId}/planning/{planningId}/issues"), func(ctx context.Context, a command.Actor, in *struct {
		ProjectID  command.ProjectID `path:"projectId"`
		PlanningID ID                `path:"planningId"`
		PageQuery
	}) (command.Page[PlanningIssueSummary], error) {
		return s.ListIssues(ctx, a, PlanningIssuesInput{in.ProjectID, in.PlanningID, in.page()})
	})
	registerSave(api, operation(api, command.CreatePlanningItem, "POST", "/projects/{projectId}/planning"), func(ctx context.Context, a command.Actor, in *struct {
		httpapi.MutationHeader
		ProjectID command.ProjectID `path:"projectId"`
		Body      PlanningCreateFields
	}) (command.SaveOutcome[PlanningItemView], error) {
		return s.Create(ctx, a, PlanningCreateInput{in.ProjectID, in.Body, in.RetryReference})
	})
	registerSave(api, operation(api, command.UpdatePlanningItem, "PUT", "/projects/{projectId}/planning/{planningId}"), func(ctx context.Context, a command.Actor, in *struct {
		httpapi.MutationHeader
		ProjectID  command.ProjectID `path:"projectId"`
		PlanningID ID                `path:"planningId"`
		Body       PlanningUpdateFields
	}) (command.SaveOutcome[PlanningItemView], error) {
		return s.Update(ctx, a, PlanningUpdateInput{in.ProjectID, in.PlanningID, in.Body, in.RetryReference})
	})
	registerRead(api, operation(api, command.GetIssuePlanning, "GET", "/issues/{issueId}/planning"), func(ctx context.Context, a command.Actor, in *struct {
		IssueID command.IssueID `path:"issueId"`
	}) (IssuePlanningView, error) {
		return s.GetIssue(ctx, a, GetIssueInput{in.IssueID})
	})
	registerSave(api, operation(api, command.SetIssuePlanning, "PUT", "/issues/{issueId}/planning"), func(ctx context.Context, a command.Actor, in *struct {
		httpapi.MutationHeader
		IssueID command.IssueID `path:"issueId"`
		Body    IssuePlanningFields
	}) (command.SaveOutcome[IssuePlanningView], error) {
		return s.SetIssue(ctx, a, IssuePlanningInput{in.IssueID, in.Body, in.RetryReference})
	})
	registerRead(api, operation(api, command.GetKanbanReport, "GET", "/projects/{projectId}/kanban-report"), func(ctx context.Context, a command.Actor, in *struct {
		ProjectID command.ProjectID `path:"projectId"`
		From      string            `query:"from" format:"date" required:"true"`
		Through   string            `query:"through" format:"date" required:"true"`
		PageQuery
	}) (KanbanReport, error) {
		from, err := command.ParseDate(in.From)
		if err != nil {
			return KanbanReport{}, validation("from", "Choose a valid start date.")
		}
		through, err := command.ParseDate(in.Through)
		if err != nil {
			return KanbanReport{}, validation("through", "Choose a valid end date.")
		}
		return s.Report(ctx, a, KanbanReportInput{in.ProjectID, from, through, in.page()})
	})
}
