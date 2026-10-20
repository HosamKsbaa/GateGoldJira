package issues

import (
	"context"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

type ModernSearchInput struct {
	Filters      command.IssueFilter    `json:"filters"`
	Page         command.PageRequest    `json:"page,omitempty"`
	TypeBehavior *command.IssueBehavior `json:"typeBehavior,omitempty" enum:"standard,subtask"`
}

func (s *Service) SearchModern(ctx context.Context, actor command.Actor, input ModernSearchInput) (command.Page[ModernIssueSummary], error) {
	empty := command.Page[ModernIssueSummary]{}
	if input.TypeBehavior != nil && !input.TypeBehavior.Valid() {
		return empty, validation("typeBehavior", "must be standard or subtask")
	}
	// Retained saved searches use the original category predicates. Native
	// results still expose exact canonical identities; new UI choices use IDs.
	filter, err := normalizeFilter(input.Filters)
	if err != nil {
		return empty, err
	}
	limit, err := input.Page.Size()
	if err != nil {
		return empty, err
	}
	scope, err := command.CursorScopeFor(command.SearchModernIssues, actor.UserID, "sort,updatedAt DESC,id DESC", searchScope{Filters: filter, Today: actor.Today, TypeBehavior: input.TypeBehavior})
	if err != nil {
		return empty, err
	}
	position := searchPosition{}
	if input.Page.Cursor != nil {
		position, err = command.ReadCursor[searchPosition](s.cursors, scope, *input.Page.Cursor)
		if err != nil {
			return empty, err
		}
	}
	// Page data, total and canonical names share one stable snapshot. Account
	// changes still participate in the company guard; SQL applies current access.
	return command.Read(ctx, s.runner, actor, command.Access{RepeatableRead: true}, func(ctx context.Context, m *command.Mutation) (command.Page[ModernIssueSummary], error) {
		params := searchParams(filter, actor, m.User.IsAdministrator)
		if input.TypeBehavior != nil {
			params.TypeBehavior = string(*input.TypeBehavior)
		}
		params.HasCursor = input.Page.Cursor != nil
		params.AfterTime = pgtype.Timestamptz{Time: position.Time, Valid: true}
		params.AfterID = position.ID
		params.AfterSort = position.SortValue
		params.PageSize = int32(limit + 1)
		rows, count, err := querySearch(ctx, m, params)
		if err != nil {
			return empty, err
		}
		ids := make([]uuid.UUID, 0, len(rows))
		for _, row := range rows {
			ids = append(ids, row.Issue.ID)
		}
		metadata, err := canonicalMetadata(ctx, m, ids)
		if err != nil {
			return empty, err
		}
		items := make([]ModernIssueSummary, 0, len(rows))
		positions := make(map[uuid.UUID]int64, len(rows))
		for _, row := range rows {
			base, err := Summary(dbgen.IssuesGetRow(row), actor.Today)
			if err != nil {
				return empty, err
			}
			meta := metadata[base.ID.UUID]
			item := modernSummary(base, meta)
			items = append(items, item)
			sortValue := issueSortValue(base, filter.Sort)
			if filter.Sort == command.SortPriority && meta.ProjectMode == "modern" {
				sortValue = meta.PriorityOrder
			}
			positions[base.ID.UUID] = sortValue
		}
		return command.BuildPage(s.cursors, scope, items, limit, int(count), false, func(v ModernIssueSummary) searchPosition {
			return searchPosition{Time: v.UpdatedAt, ID: v.ID.UUID, SortValue: positions[v.ID.UUID]}
		})
	})
}
