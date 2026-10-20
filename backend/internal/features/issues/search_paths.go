package issues

import (
	"context"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database/dbgen"
)

// Separate generated query shapes avoid a generic CASE plan that scans every
// issue for a numeric lookup. All variants retain the same permission/filter
// predicates and bounded projection, including the legacy exact total.
func querySearch(ctx context.Context, m *command.Mutation, p dbgen.IssuesSearchParams) ([]dbgen.IssuesSearchRow, int64, error) {
	switch {
	case p.QueryKind == string(command.SearchImpossible):
		return []dbgen.IssuesSearchRow{}, 0, nil
	case p.QueryKind == string(command.SearchNumber):
		found, err := m.Queries.IssuesSearchNumber(ctx, dbgen.IssuesSearchNumberParams{
			Archived:        p.Archived,
			Backlog:         p.Backlog,
			IsAdmin:         p.IsAdmin,
			CallerID:        p.CallerID,
			ProjectIds:      p.ProjectIds,
			QueryNumber:     p.QueryNumber,
			Statuses:        p.Statuses,
			Priorities:      p.Priorities,
			Types:           p.Types,
			TypeIds:         p.TypeIds,
			TypeBehavior:    p.TypeBehavior,
			PriorityIds:     p.PriorityIds,
			WorkflowIds:     p.WorkflowIds,
			StageIds:        p.StageIds,
			Unassigned:      p.Unassigned,
			AssigneeID:      p.AssigneeID,
			ParentID:        p.ParentID,
			PrerequisiteFor: p.PrerequisiteFor,
			LabelIds:        p.LabelIds,
			DueFrom:         p.DueFrom,
			DueTo:           p.DueTo,
			Overdue:         p.Overdue,
			Today:           p.Today,
			Blocked:         p.Blocked,
			HasCursor:       p.HasCursor,
			SortBy:          p.SortBy,
			AfterSort:       p.AfterSort,
			AfterTime:       p.AfterTime,
			AfterID:         p.AfterID,
			PageSize:        p.PageSize,
		})
		if err != nil {
			return nil, 0, err
		}
		total, err := m.Queries.IssuesSearchNumberCount(ctx, dbgen.IssuesSearchNumberCountParams{
			Archived:        p.Archived,
			Backlog:         p.Backlog,
			IsAdmin:         p.IsAdmin,
			CallerID:        p.CallerID,
			ProjectIds:      p.ProjectIds,
			QueryNumber:     p.QueryNumber,
			Statuses:        p.Statuses,
			Priorities:      p.Priorities,
			Types:           p.Types,
			TypeIds:         p.TypeIds,
			TypeBehavior:    p.TypeBehavior,
			PriorityIds:     p.PriorityIds,
			WorkflowIds:     p.WorkflowIds,
			StageIds:        p.StageIds,
			Unassigned:      p.Unassigned,
			AssigneeID:      p.AssigneeID,
			ParentID:        p.ParentID,
			PrerequisiteFor: p.PrerequisiteFor,
			LabelIds:        p.LabelIds,
			DueFrom:         p.DueFrom,
			DueTo:           p.DueTo,
			Overdue:         p.Overdue,
			Today:           p.Today,
			Blocked:         p.Blocked,
		})
		if err != nil {
			return nil, 0, err
		}
		result := make([]dbgen.IssuesSearchRow, len(found))
		for i, row := range found {
			result[i] = dbgen.IssuesSearchRow(row)
		}
		return result, total, nil
	case p.QueryKind == string(command.SearchLiteral):
		if _, err := m.Queries.IssuesSearchCustomPlan(ctx); err != nil {
			return nil, 0, err
		}
		hasPrefix, err := m.Queries.IssuesSearchHasPrefix(ctx, dbgen.IssuesSearchHasPrefixParams{
			Query:    p.Query,
			IsAdmin:  p.IsAdmin,
			CallerID: p.CallerID,
		})
		if err != nil {
			return nil, 0, err
		}
		if hasPrefix && (p.SortBy == "" || p.SortBy == string(command.SortUpdated)) {
			found, err := m.Queries.IssuesSearchPrefixUpdated(ctx, dbgen.IssuesSearchPrefixUpdatedParams{
				Archived:        p.Archived,
				Backlog:         p.Backlog,
				IsAdmin:         p.IsAdmin,
				CallerID:        p.CallerID,
				ProjectIds:      p.ProjectIds,
				QueryProjectKey: p.QueryProjectKey,
				QueryKeyNumber:  p.QueryKeyNumber,
				Query:           p.Query,
				QueryPattern:    p.QueryPattern,
				Statuses:        p.Statuses,
				Priorities:      p.Priorities,
				Types:           p.Types,
				TypeIds:         p.TypeIds,
				TypeBehavior:    p.TypeBehavior,
				PriorityIds:     p.PriorityIds,
				WorkflowIds:     p.WorkflowIds,
				StageIds:        p.StageIds,
				Unassigned:      p.Unassigned,
				AssigneeID:      p.AssigneeID,
				ParentID:        p.ParentID,
				PrerequisiteFor: p.PrerequisiteFor,
				LabelIds:        p.LabelIds,
				DueFrom:         p.DueFrom,
				DueTo:           p.DueTo,
				Overdue:         p.Overdue,
				Today:           p.Today,
				Blocked:         p.Blocked,
				HasCursor:       p.HasCursor,
				AfterTime:       p.AfterTime,
				AfterID:         p.AfterID,
				PageSize:        p.PageSize,
			})
			if err != nil {
				return nil, 0, err
			}
			total, err := m.Queries.IssuesSearchPrefixCount(ctx, dbgen.IssuesSearchPrefixCountParams{
				Archived:        p.Archived,
				Backlog:         p.Backlog,
				IsAdmin:         p.IsAdmin,
				CallerID:        p.CallerID,
				ProjectIds:      p.ProjectIds,
				QueryProjectKey: p.QueryProjectKey,
				QueryKeyNumber:  p.QueryKeyNumber,
				Query:           p.Query,
				QueryPattern:    p.QueryPattern,
				Statuses:        p.Statuses,
				Priorities:      p.Priorities,
				Types:           p.Types,
				TypeIds:         p.TypeIds,
				TypeBehavior:    p.TypeBehavior,
				PriorityIds:     p.PriorityIds,
				WorkflowIds:     p.WorkflowIds,
				StageIds:        p.StageIds,
				Unassigned:      p.Unassigned,
				AssigneeID:      p.AssigneeID,
				ParentID:        p.ParentID,
				PrerequisiteFor: p.PrerequisiteFor,
				LabelIds:        p.LabelIds,
				DueFrom:         p.DueFrom,
				DueTo:           p.DueTo,
				Overdue:         p.Overdue,
				Today:           p.Today,
				Blocked:         p.Blocked,
			})
			if err != nil {
				return nil, 0, err
			}
			rows := make([]dbgen.IssuesSearchRow, len(found))
			for i, row := range found {
				rows[i] = dbgen.IssuesSearchRow(row)
			}
			return rows, total, nil
		}
		found, err := m.Queries.IssuesSearchText(ctx, dbgen.IssuesSearchTextParams{
			Archived:        p.Archived,
			Backlog:         p.Backlog,
			IsAdmin:         p.IsAdmin,
			CallerID:        p.CallerID,
			ProjectIds:      p.ProjectIds,
			QueryProjectKey: p.QueryProjectKey,
			QueryKeyNumber:  p.QueryKeyNumber,
			Query:           p.Query,
			QueryPattern:    p.QueryPattern,
			Statuses:        p.Statuses,
			Priorities:      p.Priorities,
			Types:           p.Types,
			TypeIds:         p.TypeIds,
			TypeBehavior:    p.TypeBehavior,
			PriorityIds:     p.PriorityIds,
			WorkflowIds:     p.WorkflowIds,
			StageIds:        p.StageIds,
			Unassigned:      p.Unassigned,
			AssigneeID:      p.AssigneeID,
			ParentID:        p.ParentID,
			PrerequisiteFor: p.PrerequisiteFor,
			LabelIds:        p.LabelIds,
			DueFrom:         p.DueFrom,
			DueTo:           p.DueTo,
			Overdue:         p.Overdue,
			Today:           p.Today,
			Blocked:         p.Blocked,
			HasCursor:       p.HasCursor,
			SortBy:          p.SortBy,
			AfterSort:       p.AfterSort,
			AfterTime:       p.AfterTime,
			AfterID:         p.AfterID,
			PageSize:        p.PageSize,
		})
		if err != nil {
			return nil, 0, err
		}
		total, err := m.Queries.IssuesSearchTextCount(ctx, dbgen.IssuesSearchTextCountParams{
			Archived:        p.Archived,
			Backlog:         p.Backlog,
			IsAdmin:         p.IsAdmin,
			CallerID:        p.CallerID,
			ProjectIds:      p.ProjectIds,
			QueryProjectKey: p.QueryProjectKey,
			QueryKeyNumber:  p.QueryKeyNumber,
			Query:           p.Query,
			QueryPattern:    p.QueryPattern,
			Statuses:        p.Statuses,
			Priorities:      p.Priorities,
			Types:           p.Types,
			TypeIds:         p.TypeIds,
			TypeBehavior:    p.TypeBehavior,
			PriorityIds:     p.PriorityIds,
			WorkflowIds:     p.WorkflowIds,
			StageIds:        p.StageIds,
			Unassigned:      p.Unassigned,
			AssigneeID:      p.AssigneeID,
			ParentID:        p.ParentID,
			PrerequisiteFor: p.PrerequisiteFor,
			LabelIds:        p.LabelIds,
			DueFrom:         p.DueFrom,
			DueTo:           p.DueTo,
			Overdue:         p.Overdue,
			Today:           p.Today,
			Blocked:         p.Blocked,
		})
		if err != nil {
			return nil, 0, err
		}
		result := make([]dbgen.IssuesSearchRow, len(found))
		for i, row := range found {
			result[i] = dbgen.IssuesSearchRow(row)
		}
		return result, total, nil
	case p.QueryKind == string(command.SearchEmpty) && (p.SortBy == "" || p.SortBy == "updated"):
		if _, err := m.Queries.IssuesSearchCustomPlan(ctx); err != nil {
			return nil, 0, err
		}
		found, err := m.Queries.IssuesSearchUpdated(ctx, dbgen.IssuesSearchUpdatedParams{
			Archived:        p.Archived,
			Backlog:         p.Backlog,
			IsAdmin:         p.IsAdmin,
			CallerID:        p.CallerID,
			ProjectIds:      p.ProjectIds,
			Statuses:        p.Statuses,
			Priorities:      p.Priorities,
			Types:           p.Types,
			TypeIds:         p.TypeIds,
			TypeBehavior:    p.TypeBehavior,
			PriorityIds:     p.PriorityIds,
			WorkflowIds:     p.WorkflowIds,
			StageIds:        p.StageIds,
			Unassigned:      p.Unassigned,
			AssigneeID:      p.AssigneeID,
			ParentID:        p.ParentID,
			PrerequisiteFor: p.PrerequisiteFor,
			LabelIds:        p.LabelIds,
			DueFrom:         p.DueFrom,
			DueTo:           p.DueTo,
			Overdue:         p.Overdue,
			Today:           p.Today,
			Blocked:         p.Blocked,
			HasCursor:       p.HasCursor,
			AfterTime:       p.AfterTime,
			AfterID:         p.AfterID,
			PageSize:        p.PageSize,
		})
		if err != nil {
			return nil, 0, err
		}
		total, err := m.Queries.IssuesSearchEmptyCount(ctx, dbgen.IssuesSearchEmptyCountParams{
			Archived:        p.Archived,
			Backlog:         p.Backlog,
			IsAdmin:         p.IsAdmin,
			CallerID:        p.CallerID,
			ProjectIds:      p.ProjectIds,
			Statuses:        p.Statuses,
			Priorities:      p.Priorities,
			Types:           p.Types,
			TypeIds:         p.TypeIds,
			TypeBehavior:    p.TypeBehavior,
			PriorityIds:     p.PriorityIds,
			WorkflowIds:     p.WorkflowIds,
			StageIds:        p.StageIds,
			Unassigned:      p.Unassigned,
			AssigneeID:      p.AssigneeID,
			ParentID:        p.ParentID,
			PrerequisiteFor: p.PrerequisiteFor,
			LabelIds:        p.LabelIds,
			DueFrom:         p.DueFrom,
			DueTo:           p.DueTo,
			Overdue:         p.Overdue,
			Today:           p.Today,
			Blocked:         p.Blocked,
		})
		if err != nil {
			return nil, 0, err
		}
		result := make([]dbgen.IssuesSearchRow, len(found))
		for i, row := range found {
			result[i] = dbgen.IssuesSearchRow(row)
		}
		return result, total, nil
	default:
		// Alternative sorts need the concrete filter selectivity too. A generic
		// optional-filter plan can misestimate a 95k-row priority selection.
		if _, err := m.Queries.IssuesSearchCustomPlan(ctx); err != nil {
			return nil, 0, err
		}
		rows, err := m.Queries.IssuesSearch(ctx, p)
		if err != nil {
			return nil, 0, err
		}
		total, err := m.Queries.IssuesSearchCount(ctx, countParams(p))
		return rows, total, err
	}
}
