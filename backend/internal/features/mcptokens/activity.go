package mcptokens

import (
	"context"
	"errors"
	"time"

	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"gategoldjira/backend/internal/platform/mcpapi"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type TokenActivityView struct {
	ID          uuid.UUID  `json:"id" format:"uuid"`
	ToolName    string     `json:"toolName"`
	Outcome     string     `json:"outcome" enum:"started,succeeded,failed"`
	ErrorCode   *string    `json:"errorCode"`
	ResourceURL *string    `json:"resourceUrl"`
	StartedAt   time.Time  `json:"startedAt"`
	CompletedAt *time.Time `json:"completedAt"`
	DurationMS  *int64     `json:"durationMs"`
}

type TokenActivityPage struct {
	Items      []TokenActivityView `json:"items" nullable:"false" maxItems:"25"`
	NextCursor *string             `json:"nextCursor" nullable:"true" format:"uuid"`
}

func (service *Service) Activity(ctx context.Context, actor command.Actor, tokenID uuid.UUID, before *uuid.UUID) (TokenActivityPage, error) {
	if err := requireBrowser(actor); err != nil {
		return TokenActivityPage{}, err
	}
	return command.Read(ctx, service.runner, actor, command.Access{}, func(ctx context.Context, mutation *command.Mutation) (TokenActivityPage, error) {
		if _, err := mutation.Queries.MCPTokenOwned(ctx, dbgen.MCPTokenOwnedParams{ID: tokenID, UserID: actor.UserID.UUID}); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return TokenActivityPage{}, failure(command.Unavailable, "The token is unavailable.")
			}
			return TokenActivityPage{}, err
		}
		rows, err := mutation.Queries.MCPTokenActivityPage(ctx, dbgen.MCPTokenActivityPageParams{TokenID: tokenID, BeforeID: before})
		if err != nil {
			return TokenActivityPage{}, err
		}
		page := TokenActivityPage{Items: []TokenActivityView{}}
		if len(rows) > 25 {
			cursor := rows[24].ID.String()
			page.NextCursor = &cursor
			rows = rows[:25]
		}
		for _, row := range rows {
			page.Items = append(page.Items, TokenActivityView{row.ID, row.ToolName, row.Outcome, row.ErrorCode, row.ResourceUrl, row.StartedAt.Time.UTC(), timestamp(row.CompletedAt), row.DurationMs})
		}
		return page, nil
	})
}

func (service *Service) StartMCPActivity(ctx context.Context, actor command.Actor, operation command.Operation) (uuid.UUID, error) {
	return dbgen.New(service.runner.Pool).MCPTokenActivityStart(ctx, dbgen.MCPTokenActivityStartParams{
		ID: uuid.New(), ToolName: string(operation), TokenID: actor.MCPTokenID, ActorUserID: actor.UserID.UUID,
	})
}

func (service *Service) FinishMCPActivity(ctx context.Context, id uuid.UUID, completion mcpapi.ActivityCompletion) error {
	count, err := dbgen.New(service.runner.Pool).MCPTokenActivityFinish(ctx, dbgen.MCPTokenActivityFinishParams{
		ID: id, Outcome: completion.Outcome, ErrorCode: completion.ErrorCode, ResourceUrl: completion.ResourceURL, DurationMs: &completion.DurationMS,
	})
	if err == nil && count != 1 {
		return errors.New("activity record unavailable")
	}
	return err
}
