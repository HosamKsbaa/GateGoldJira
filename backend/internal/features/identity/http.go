package identity

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
func identityOperation(api huma.API, name command.Operation, method, path string) huma.Operation {
	responses := map[string]*huma.Response{}
	for _, status := range []int{400, 401, 403, 404, 409, 413, 422, 503} {
		responses[strconv.Itoa(status)] = &huma.Response{
			Description: "Safe typed failure",
			Content:     map[string]*huma.MediaType{"application/json": {Schema: api.OpenAPI().Components.Schemas.Schema(reflect.TypeFor[IdentityFailureBody](), true, "")}},
		}
	}
	operation := huma.Operation{OperationID: string(name), Method: method, Path: "/api/v1" + path, Responses: responses}
	if name == command.ApproveUser {
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
	registerRead(api, identityOperation(api, command.ListMembershipCandidates, "GET", "/projects/{projectId}/membership-candidates"), func(ctx context.Context, a command.Actor, in *struct {
		ProjectID command.ProjectID `path:"projectId"`
		Query     string            `query:"query" maxLength:"100"`
		PageQuery
	}) (command.Page[MembershipCandidateView], error) {
		return service.ListMembershipCandidates(ctx, a, CandidateInput{
			ProjectID: in.ProjectID,
			Query:     in.Query,
			Page:      in.page(),
		})
	})
	registerRead(api, identityOperation(api, command.GetMe, "GET", "/me"), func(ctx context.Context, actor command.Actor, _ *struct{}) (Me, error) {
		return service.GetMe(ctx, actor)
	})
	registerRead(api, identityOperation(api, command.ListUsers, "GET", "/admin/users"), func(ctx context.Context, actor command.Actor, input *PageQuery) (command.Page[UserView], error) {
		return service.ListUsers(ctx, actor, input.page())
	})
	registerSave(api, identityOperation(api, command.ApproveUser, "POST", "/admin/users"), func(ctx context.Context, actor command.Actor, input *struct {
		httpapi.MutationHeader
		Body ApproveFields
	}) (command.SaveOutcome[UserView], error) {
		return service.ApproveUser(ctx, actor, ApproveInput{
			Email:          input.Body.Email,
			DisplayName:    input.Body.DisplayName,
			Administrator:  input.Body.Administrator,
			RetryReference: input.RetryReference,
		})
	})
	registerSave(api, identityOperation(api, command.UpdateUser, "PUT", "/admin/users/{userId}"), func(ctx context.Context, actor command.Actor, input *struct {
		httpapi.MutationHeader
		UserID command.UserID `path:"userId"`
		Body   UpdateUserFields
	}) (command.SaveOutcome[UserView], error) {
		return service.UpdateUser(ctx, actor, UpdateUserInput{
			UserID:           input.UserID,
			ExpectedRevision: input.Body.ExpectedRevision,
			Email:            input.Body.Email,
			DisplayName:      input.Body.DisplayName,
			Active:           input.Body.Active,
			Administrator:    input.Body.Administrator,
			RetryReference:   input.RetryReference,
		})
	})
	registerRead(api, identityOperation(api, command.ListMemberships, "GET", "/projects/{projectId}/memberships"), func(ctx context.Context, actor command.Actor, input *struct {
		PageQuery
		ProjectID      command.ProjectID `path:"projectId"`
		IncludeRemoved bool              `query:"includeRemoved"`
	}) (command.Page[MembershipView], error) {
		return service.ListMemberships(ctx, actor, MembershipListInput{
			ProjectID:      input.ProjectID,
			Page:           input.page(),
			IncludeRemoved: input.IncludeRemoved,
		})
	})
	type setFields struct {
		ExpectedRevision command.InitialRevision `json:"expectedRevision"`
		Role             command.Role            `json:"role" enum:"project_admin,member,viewer"`
	}
	registerSave(api, identityOperation(api, command.SetMembership, "PUT", "/projects/{projectId}/memberships/{userId}"), func(ctx context.Context, actor command.Actor, input *struct {
		httpapi.MutationHeader
		ProjectID command.ProjectID `path:"projectId"`
		UserID    command.UserID    `path:"userId"`
		Body      setFields
	}) (command.SaveOutcome[MembershipView], error) {
		return service.SetMembership(ctx, actor, SetMembershipInput{
			ProjectID:        input.ProjectID,
			UserID:           input.UserID,
			ExpectedRevision: input.Body.ExpectedRevision,
			Role:             input.Body.Role,
			RetryReference:   input.RetryReference,
		})
	})
	type removeFields struct {
		ExpectedRevision command.Revision `json:"expectedRevision"`
	}
	registerSave(api, identityOperation(api, command.RemoveMembership, "POST", "/projects/{projectId}/memberships/{userId}/remove"), func(ctx context.Context, actor command.Actor, input *struct {
		httpapi.MutationHeader
		ProjectID command.ProjectID `path:"projectId"`
		UserID    command.UserID    `path:"userId"`
		Body      removeFields
	}) (command.SaveOutcome[MembershipView], error) {
		return service.RemoveMembership(ctx, actor, RemoveMembershipInput{
			ProjectID:        input.ProjectID,
			UserID:           input.UserID,
			ExpectedRevision: input.Body.ExpectedRevision,
			RetryReference:   input.RetryReference,
		})
	})
	type candidateQuery struct {
		PageQuery
		ProjectID command.ProjectID `path:"projectId"`
		Query     string            `query:"query" maxLength:"100"`
	}
	registerRead(api, identityOperation(api, command.ListAssignees, "GET", "/projects/{projectId}/assignees"), func(ctx context.Context, actor command.Actor, input *candidateQuery) (command.Page[UserSummary], error) {
		return service.ListAssignees(ctx, actor, CandidateInput{
			ProjectID: input.ProjectID,
			Page:      input.page(),
			Query:     input.Query,
		})
	})
	registerRead(api, identityOperation(api, command.ListMentionCandidates, "GET", "/projects/{projectId}/mention-candidates"), func(ctx context.Context, actor command.Actor, input *candidateQuery) (command.Page[UserSummary], error) {
		return service.ListMentionCandidates(ctx, actor, CandidateInput{
			ProjectID: input.ProjectID,
			Page:      input.page(),
			Query:     input.Query,
		})
	})
}
