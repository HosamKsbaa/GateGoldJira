// Package mcptokens owns self-service, MCP-only account credentials.
package mcptokens

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"strings"
	"time"

	"gategoldjira/backend/internal/platform/auth"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

const ActiveLimit = 10

type Service struct {
	runner   command.Runner
	endpoint string
	oauth    *BrowserOAuth
}

func New(runner command.Runner, endpoint string) *Service {
	return &Service{runner: runner, endpoint: endpoint}
}

type TokenView struct {
	ID         uuid.UUID  `json:"id" format:"uuid"`
	Name       string     `json:"name" minLength:"1" maxLength:"80"`
	Prefix     string     `json:"prefix"`
	CreatedAt  time.Time  `json:"createdAt"`
	ExpiresAt  *time.Time `json:"expiresAt"`
	LastUsedAt *time.Time `json:"lastUsedAt"`
	RevokedAt  *time.Time `json:"revokedAt"`
	Kind       string     `json:"kind" enum:"personal,oauth"`
}

type TokenList struct {
	Items         []TokenView `json:"items" nullable:"false" maxItems:"100"`
	Endpoint      string      `json:"endpoint"`
	ActiveLimit   int         `json:"activeLimit"`
	OAuthClientID *string     `json:"oauthClientId" nullable:"true"`
}

type CreateInput struct {
	Name string `json:"name" minLength:"1" maxLength:"80"`
}

type CreatedToken struct {
	Details TokenView `json:"details"`
	Token   string    `json:"token"`
}

func failure(code command.FailureCode, message string) error {
	return &command.Failure{Code: code, Message: message, FieldErrors: []command.FieldError{}, NextAction: command.None}
}

func requireBrowser(actor command.Actor) error {
	if actor.Channel != command.REST {
		return failure(command.Forbidden, "Manage MCP tokens from your signed-in account settings.")
	}
	return nil
}

func timestamp(value pgtype.Timestamptz) *time.Time {
	if !value.Valid {
		return nil
	}
	result := value.Time.UTC()
	return &result
}

func view(row dbgen.MCPTokenListRow) TokenView {
	return TokenView{row.ID, row.Name, row.TokenPrefix, row.CreatedAt.Time.UTC(), timestamp(row.ExpiresAt), timestamp(row.LastUsedAt), timestamp(row.RevokedAt), row.Kind}
}

func (service *Service) List(ctx context.Context, actor command.Actor) (TokenList, error) {
	if err := requireBrowser(actor); err != nil {
		return TokenList{}, err
	}
	return command.Read(ctx, service.runner, actor, command.Access{}, func(ctx context.Context, mutation *command.Mutation) (TokenList, error) {
		rows, err := mutation.Queries.MCPTokenList(ctx, actor.UserID.UUID)
		if err != nil {
			return TokenList{}, err
		}
		result := TokenList{Items: []TokenView{}, Endpoint: service.endpoint, ActiveLimit: ActiveLimit}
		if service.oauth != nil {
			id := OAuthClientID
			result.OAuthClientID = &id
		}
		for _, row := range rows {
			result.Items = append(result.Items, view(row))
		}
		return result, nil
	})
}

func (service *Service) Create(ctx context.Context, actor command.Actor, input CreateInput) (CreatedToken, error) {
	if err := requireBrowser(actor); err != nil {
		return CreatedToken{}, err
	}
	input.Name = strings.TrimSpace(input.Name)
	if command.ValidateText(input.Name, 1, 80) != nil {
		return CreatedToken{}, failure(command.Validation, "Enter a name of 1 to 80 characters.")
	}
	secret := make([]byte, 32)
	if _, err := rand.Read(secret); err != nil {
		return CreatedToken{}, err
	}
	token := auth.PersonalMCPTokenPrefix + base64.RawURLEncoding.EncodeToString(secret)
	hash := sha256.Sum256([]byte(token))
	return command.AccountChange(ctx, service.runner, actor, func(ctx context.Context, mutation *command.Mutation) (CreatedToken, error) {
		if _, err := mutation.Queries.MCPTokenOwnerGuard(ctx, actor.UserID.UUID); err != nil {
			return CreatedToken{}, err
		}
		count, err := mutation.Queries.MCPTokenActiveCount(ctx, actor.UserID.UUID)
		if err != nil {
			return CreatedToken{}, err
		}
		if count >= ActiveLimit {
			return CreatedToken{}, failure(command.Validation, "You already have 10 active MCP tokens. Revoke one before creating another.")
		}
		now := time.Now().UTC()
		row, err := mutation.Queries.MCPTokenCreate(ctx, dbgen.MCPTokenCreateParams{
			ID: uuid.New(), UserID: actor.UserID.UUID, Name: input.Name, TokenHash: hash[:], TokenPrefix: token[:15],
			CreatedAt: pgtype.Timestamptz{Time: now, Valid: true},
		})
		if err != nil {
			return CreatedToken{}, err
		}
		return CreatedToken{Details: view(dbgen.MCPTokenListRow(row)), Token: token}, nil
	})
}

func (service *Service) Revoke(ctx context.Context, actor command.Actor, id uuid.UUID) (TokenView, error) {
	if err := requireBrowser(actor); err != nil {
		return TokenView{}, err
	}
	return command.AccountChange(ctx, service.runner, actor, func(ctx context.Context, mutation *command.Mutation) (TokenView, error) {
		row, err := mutation.Queries.MCPTokenRevoke(ctx, dbgen.MCPTokenRevokeParams{ID: id, UserID: actor.UserID.UUID})
		if errors.Is(err, pgx.ErrNoRows) {
			return TokenView{}, failure(command.Unavailable, "The token is unavailable.")
		}
		if err != nil {
			return TokenView{}, err
		}
		return view(dbgen.MCPTokenListRow(row)), nil
	})
}

func (service *Service) Authenticate(ctx context.Context, token string) (auth.PersonalMCPIdentity, error) {
	invalid := errors.New("invalid MCP credential")
	if !strings.HasPrefix(token, auth.PersonalMCPTokenPrefix) || len(token) != len(auth.PersonalMCPTokenPrefix)+43 {
		return auth.PersonalMCPIdentity{}, invalid
	}
	secret, err := base64.RawURLEncoding.Strict().DecodeString(strings.TrimPrefix(token, auth.PersonalMCPTokenPrefix))
	if err != nil || len(secret) != 32 {
		return auth.PersonalMCPIdentity{}, invalid
	}
	hash := sha256.Sum256([]byte(token))
	identity, err := dbgen.New(service.runner.Pool).MCPTokenAuthenticate(ctx, hash[:])
	if err != nil {
		return auth.PersonalMCPIdentity{}, invalid
	}
	return auth.PersonalMCPIdentity{UserID: command.UserID{UUID: identity.UserID}, TokenID: identity.ID}, nil
}
