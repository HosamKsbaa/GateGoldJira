package mcptokens

import (
	"context"
	"net/http"
	"reflect"
	"strconv"

	"gategoldjira/backend/internal/platform/auth"
	"gategoldjira/backend/internal/platform/httpapi"
	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
)

// Credential management is REST-only; assistants cannot mint more credentials.
func operation(api huma.API, id, method, path string) huma.Operation {
	responses := map[string]*huma.Response{}
	for _, status := range []int{400, 401, 403, 404, 422, 503} {
		responses[strconv.Itoa(status)] = &huma.Response{Description: "Safe credential management failure", Content: map[string]*huma.MediaType{"application/json": {Schema: api.OpenAPI().Components.Schemas.Schema(reflect.TypeFor[httpapi.FailureBody](), true, "")}}}
	}
	return huma.Operation{OperationID: id, Method: method, Path: "/api/v1/me/mcp-tokens" + path, Tags: []string{"Account MCP tokens"}, Responses: responses}
}

type response[T any] struct {
	CacheControl string `header:"Cache-Control"`
	Body         T
}

func RegisterHTTP(api huma.API, service *Service) {
	consent := operation(api, "getMcpBrowserAuthorization", http.MethodGet, "")
	consent.Path = "/api/v1/me/mcp-authorizations/{request}"
	huma.Register(api, consent, func(ctx context.Context, input *struct {
		Request string `path:"request" minLength:"43" maxLength:"43" pattern:"^[A-Za-z0-9_-]+$"`
	}) (*response[OAuthConsent], error) {
		actor, err := auth.Actor(ctx)
		if err != nil {
			return nil, httpapi.Error(err)
		}
		out, err := service.Consent(ctx, actor, input.Request)
		if err != nil {
			return nil, httpapi.Error(err)
		}
		return &response[OAuthConsent]{CacheControl: "no-store", Body: out}, nil
	})
	decision := operation(api, "decideMcpBrowserAuthorization", http.MethodPost, "")
	decision.Path = consent.Path
	huma.Register(api, decision, func(ctx context.Context, input *struct {
		Request string `path:"request" minLength:"43" maxLength:"43" pattern:"^[A-Za-z0-9_-]+$"`
		Body    OAuthDecision
	}) (*response[OAuthRedirect], error) {
		actor, err := auth.Actor(ctx)
		if err != nil {
			return nil, httpapi.Error(err)
		}
		out, err := service.Decide(ctx, actor, input.Request, input.Body.Allow)
		if err != nil {
			return nil, httpapi.Error(err)
		}
		return &response[OAuthRedirect]{CacheControl: "no-store", Body: out}, nil
	})
	huma.Register(api, operation(api, "listPersonalMcpTokenActivity", http.MethodGet, "/{tokenId}/activity"), func(ctx context.Context, input *struct {
		TokenID uuid.UUID `path:"tokenId" format:"uuid"`
		Before  uuid.UUID `query:"before" format:"uuid"`
	}) (*response[TokenActivityPage], error) {
		actor, err := auth.Actor(ctx)
		if err != nil {
			return nil, httpapi.Error(err)
		}
		var before *uuid.UUID
		if input.Before != uuid.Nil {
			before = &input.Before
		}
		out, err := service.Activity(ctx, actor, input.TokenID, before)
		if err != nil {
			return nil, httpapi.Error(err)
		}
		return &response[TokenActivityPage]{CacheControl: "no-store", Body: out}, nil
	})
	huma.Register(api, operation(api, "listPersonalMcpTokens", http.MethodGet, ""), func(ctx context.Context, _ *struct{}) (*response[TokenList], error) {
		actor, err := auth.Actor(ctx)
		if err != nil {
			return nil, httpapi.Error(err)
		}
		out, err := service.List(ctx, actor)
		if err != nil {
			return nil, httpapi.Error(err)
		}
		return &response[TokenList]{CacheControl: "no-store", Body: out}, nil
	})
	create := operation(api, "createPersonalMcpToken", http.MethodPost, "")
	create.DefaultStatus = http.StatusCreated
	huma.Register(api, create, func(ctx context.Context, input *struct{ Body CreateInput }) (*response[CreatedToken], error) {
		actor, err := auth.Actor(ctx)
		if err != nil {
			return nil, httpapi.Error(err)
		}
		out, err := service.Create(ctx, actor, input.Body)
		if err != nil {
			return nil, httpapi.Error(err)
		}
		return &response[CreatedToken]{CacheControl: "no-store", Body: out}, nil
	})
	huma.Register(api, operation(api, "revokePersonalMcpToken", http.MethodPost, "/{tokenId}/revoke"), func(ctx context.Context, input *struct {
		TokenID uuid.UUID `path:"tokenId" format:"uuid"`
	}) (*response[TokenView], error) {
		actor, err := auth.Actor(ctx)
		if err != nil {
			return nil, httpapi.Error(err)
		}
		out, err := service.Revoke(ctx, actor, input.TokenID)
		if err != nil {
			return nil, httpapi.Error(err)
		}
		return &response[TokenView]{CacheControl: "no-store", Body: out}, nil
	})
}
