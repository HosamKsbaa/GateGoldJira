package auth

import (
	"context"
	"strings"
	"time"

	"gategoldjira/backend/internal/platform/command"
	"github.com/google/uuid"
)

type TokenVerifier interface {
	Verify(context.Context, string, command.Channel) (command.ProviderIdentity, error)
}
type ResolveIdentity func(context.Context, command.ProviderIdentity) (command.UserID, error)
type Sessions struct {
	Verifier TokenVerifier
	Resolve  ResolveIdentity
	Location *time.Location
	// Personal MCP credentials resolve directly to an existing company user.
	// They are never accepted as browser/API sessions.
	MCPToken func(context.Context, string) (PersonalMCPIdentity, error)
	MCPOAuth func(context.Context, string) (PersonalMCPIdentity, error)
}

type PersonalMCPIdentity struct {
	UserID  command.UserID
	TokenID uuid.UUID
}

const PersonalMCPTokenPrefix = "gg_mcp_"

type actorKey struct{}

func (sessions Sessions) Authenticate(ctx context.Context, header string, channel command.Channel) (command.Actor, error) {
	ctx, cancel := command.OrdinaryContext(ctx)
	defer cancel()
	parts := strings.Fields(header)
	if len(parts) == 2 && strings.EqualFold(parts[0], "Bearer") && strings.HasPrefix(parts[1], "gg_oauth_") {
		if channel == command.MCP && sessions.MCPOAuth != nil {
			identity, err := sessions.MCPOAuth(ctx, parts[1])
			if err == nil {
				return command.Actor{UserID: identity.UserID, MCPTokenID: identity.TokenID, Channel: channel, Today: command.Today(time.Now(), sessions.Location)}, nil
			}
		}
		return command.Actor{}, &command.Failure{Code: command.Unauthenticated, Message: "The MCP connection has expired or was revoked. Reconnect using browser login.", FieldErrors: []command.FieldError{}, NextAction: command.SignIn}
	}
	if len(parts) == 2 && strings.EqualFold(parts[0], "Bearer") && strings.HasPrefix(parts[1], PersonalMCPTokenPrefix) {
		if channel == command.MCP && sessions.MCPToken != nil {
			identity, err := sessions.MCPToken(ctx, parts[1])
			if err == nil {
				return command.Actor{UserID: identity.UserID, MCPTokenID: identity.TokenID, Channel: channel, Today: command.Today(time.Now(), sessions.Location)}, nil
			}
		}
		return command.Actor{}, &command.Failure{
			Code: command.Unauthenticated, Message: "The MCP token is invalid, expired or revoked.",
			FieldErrors: []command.FieldError{}, NextAction: command.SignIn,
		}
	}
	identity, err := sessions.Verifier.Verify(ctx, header, channel)
	if err != nil {
		return command.Actor{}, &command.Failure{
			Code:        command.Unauthenticated,
			Message:     "Sign in with a valid human access token.",
			FieldErrors: []command.FieldError{},
			NextAction:  command.SignIn,
		}
	}
	id, err := sessions.Resolve(ctx, identity)
	if err != nil {
		return command.Actor{}, err
	}
	return command.Actor{UserID: id, Channel: channel, Today: command.Today(time.Now(), sessions.Location)}, nil
}
func WithActor(ctx context.Context, actor command.Actor) context.Context {
	return context.WithValue(ctx, actorKey{}, actor)
}
func Actor(ctx context.Context) (command.Actor, error) {
	actor, ok := ctx.Value(actorKey{}).(command.Actor)
	if !ok {
		return command.Actor{}, &command.Failure{
			Code:        command.Unauthenticated,
			Message:     "A verified company session is required.",
			FieldErrors: []command.FieldError{},
			NextAction:  command.SignIn,
		}
	}
	return actor, nil
}
