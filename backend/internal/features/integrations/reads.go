package integrations

import (
	"context"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"time"
)

type linkPosition struct {
	Time time.Time `json:"time"`
	ID   uuid.UUID `json:"id"`
}
type rulePosition struct {
	Name string    `json:"name"`
	ID   uuid.UUID `json:"id"`
}

func (s *Service) ListLinks(ctx context.Context, actor command.Actor, in DevelopmentListInput) (command.Page[DevelopmentLinkView], error) {
	empty := command.Page[DevelopmentLinkView]{}
	size, err := in.Page.Size()
	if err != nil {
		return empty, err
	}
	scope, err := command.CursorScopeFor(command.ListDevelopmentLinks, actor.UserID, "createdAt,id", in.IssueID)
	if err != nil {
		return empty, err
	}
	after := linkPosition{}
	if in.Page.Cursor != nil {
		after, err = command.ReadCursor[linkPosition](s.cursors, scope, *in.Page.Cursor)
		if err != nil {
			return empty, err
		}
	}
	return command.ReadResolved(ctx, s.runner, actor, command.Access{}, scopes(in.IssueID, false), func(ctx context.Context, m *command.Mutation) (command.Page[DevelopmentLinkView], error) {
		rows, err := m.Queries.IntegrationLinkList(ctx, dbgen.IntegrationLinkListParams{
			IssueID:   in.IssueID.UUID,
			HasCursor: in.Page.Cursor != nil,
			AfterTime: pgtype.Timestamptz{Time: after.Time, Valid: true},
			AfterID:   after.ID,
			PageSize:  int32(size + 1),
		})
		if err != nil {
			return empty, err
		}
		count, err := m.Queries.IntegrationLinkCount(ctx, in.IssueID.UUID)
		if err != nil {
			return empty, err
		}
		items := []DevelopmentLinkView{}
		for _, row := range rows {
			items = append(items, linkView(row))
		}
		return command.BuildPage(s.cursors, scope, items, size, int(count), false, func(view DevelopmentLinkView) linkPosition { return linkPosition{view.CreatedAt, view.ID.UUID} })
	})
}
func (s *Service) ListRules(ctx context.Context, actor command.Actor, in AutomationListInput) (command.Page[AutomationRuleView], error) {
	empty := command.Page[AutomationRuleView]{}
	size, err := in.Page.Size()
	if err != nil {
		return empty, err
	}
	scope, err := command.CursorScopeFor(command.ListAutomationRules, actor.UserID, "name,id", in.ProjectID)
	if err != nil {
		return empty, err
	}
	after := rulePosition{}
	if in.Page.Cursor != nil {
		after, err = command.ReadCursor[rulePosition](s.cursors, scope, *in.Page.Cursor)
		if err != nil {
			return empty, err
		}
	}
	return command.Read(ctx, s.runner, actor, command.Access{Projects: []command.ProjectScope{{ProjectID: in.ProjectID}}}, func(ctx context.Context, m *command.Mutation) (command.Page[AutomationRuleView], error) {
		rows, err := m.Queries.IntegrationRuleList(ctx, dbgen.IntegrationRuleListParams{
			ProjectID: in.ProjectID.UUID,
			HasCursor: in.Page.Cursor != nil,
			AfterName: after.Name,
			AfterID:   after.ID,
			PageSize:  int32(size + 1),
		})
		if err != nil {
			return empty, err
		}
		count, err := m.Queries.IntegrationRuleCount(ctx, in.ProjectID.UUID)
		if err != nil {
			return empty, err
		}
		items := []AutomationRuleView{}
		for _, row := range rows {
			items = append(items, ruleView(dbgen.IntegrationRuleGetRow(row)))
		}
		return command.BuildPage(s.cursors, scope, items, size, int(count), false, func(view AutomationRuleView) rulePosition { return rulePosition{view.Name, view.ID.UUID} })
	})
}
