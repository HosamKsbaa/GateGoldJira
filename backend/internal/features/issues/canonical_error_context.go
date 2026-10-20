package issues

import (
	"context"
	"errors"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database/dbgen"
)

func (s *Service) modernPrerequisiteFailure(ctx context.Context, m *command.Mutation, current ModernIssueView, err error) error {
	var guard *GuardError
	if !errors.As(err, &guard) {
		return err
	}
	if guard.ParentID != nil {
		parent, readErr := readModernView(ctx, m, *guard.ParentID)
		if readErr != nil {
			return readErr
		}
		return &ModernPrerequisiteFailure{Failure: guard.Failure, Current: parent}
	}
	if len(guard.Work) == 0 && !guard.More {
		return &ModernPrerequisiteFailure{Failure: guard.Failure, Current: current}
	}
	filter, normalizeErr := normalizeFilter(command.IssueFilter{
		ProjectIDs:      []command.ProjectID{current.Summary.ProjectID},
		PrerequisiteFor: &current.Summary.ID,
		Statuses:        []command.Status{command.Todo, command.InProgress, command.Review},
	})
	if normalizeErr != nil {
		return normalizeErr
	}
	scope, scopeErr := command.CursorScopeFor(command.SearchModernIssues, m.Actor.UserID, "sort,updatedAt DESC,id DESC", searchScope{Filters: filter, Today: m.Actor.Today})
	if scopeErr != nil {
		return scopeErr
	}
	params := searchParams(filter, m.Actor, m.User.IsAdministrator)
	params.PageSize = 26
	rows, readErr := m.Queries.IssuesSearch(ctx, params)
	if readErr != nil {
		return readErr
	}
	count, readErr := m.Queries.IssuesSearchCount(ctx, countParams(params))
	if readErr != nil {
		return readErr
	}
	getRows := make([]dbgen.IssuesGetRow, 0, len(rows))
	for _, row := range rows {
		getRows = append(getRows, dbgen.IssuesGetRow(row))
	}
	items, readErr := ModernSummaries(ctx, m, getRows, m.Actor.Today)
	if readErr != nil {
		return readErr
	}
	page, pageErr := command.BuildPage(s.cursors, scope, items, 25, int(count), false, func(v ModernIssueSummary) searchPosition {
		return searchPosition{Time: v.UpdatedAt, ID: v.ID.UUID, SortValue: v.UpdatedAt.UnixMicro()}
	})
	if pageErr != nil {
		return pageErr
	}
	return &ModernPrerequisiteFailure{
		Failure:    guard.Failure,
		Current:    current,
		Unfinished: command.Nullable[command.Page[ModernIssueSummary]]{Value: &page},
	}
}
