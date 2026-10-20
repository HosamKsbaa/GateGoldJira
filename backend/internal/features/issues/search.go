package issues

import (
	"context"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"time"
)

type searchPosition struct {
	SortValue int64     `json:"sortValue"`
	Time      time.Time `json:"time"`
	ID        uuid.UUID `json:"id"`
}
type searchScope struct {
	Filters      command.IssueFilter    `json:"filters"`
	Today        command.CalendarDate   `json:"today"`
	TypeBehavior *command.IssueBehavior `json:"typeBehavior,omitempty"`
}

func normalizeFilter(filter command.IssueFilter) (command.IssueFilter, error) {
	normalized, err := command.NormalizeIssueFilter(filter)
	if err != nil {
		return normalized, validation("filters", err.Error())
	}
	return normalized, nil
}
func stringsOf[T ~string](values []T) []string {
	result := []string{}
	for _, v := range values {
		result = append(result, string(v))
	}
	return result
}
func searchParams(filter command.IssueFilter, actor command.Actor, isAdmin bool) dbgen.IssuesSearchParams {
	p := dbgen.IssuesSearchParams{
		SortBy:      string(filter.Sort),
		Archived:    filter.Archived,
		Backlog:     filter.Backlog,
		IsAdmin:     isAdmin,
		CallerID:    actor.UserID.UUID,
		ProjectIds:  []uuid.UUID{},
		LabelIds:    labelUUIDs(filter.LabelIDs),
		Statuses:    stringsOf(filter.Statuses),
		Priorities:  stringsOf(filter.Priorities),
		Types:       stringsOf(filter.Types),
		TypeIds:     canonicalFilterUUIDs(filter.TypeIDs),
		PriorityIds: canonicalFilterUUIDs(filter.PriorityIDs),
		WorkflowIds: canonicalFilterUUIDs(filter.WorkflowIDs),
		StageIds:    canonicalFilterUUIDs(filter.StageIDs),
		DueFrom:     dateValue(filter.DueFrom),
		DueTo:       dateValue(filter.DueTo),
		Overdue:     filter.Overdue,
		Blocked:     filter.Blocked,
		Today:       dateValue(&actor.Today),
	}
	for _, id := range filter.ProjectIDs {
		p.ProjectIds = append(p.ProjectIds, id.UUID)
	}
	if filter.Query != nil {
		p.Query = *filter.Query
	}
	query := command.ClassifySearch(p.Query)
	p.Query, p.QueryKind, p.QueryNumber = query.Raw, string(query.Kind), query.Number
	p.QueryPattern, p.QueryProjectKey, p.QueryKeyNumber = query.Pattern, query.ProjectKey, query.KeyNumber
	if filter.ParentID != nil {
		id := filter.ParentID.UUID
		p.ParentID = &id
	}
	if filter.PrerequisiteFor != nil {
		id := filter.PrerequisiteFor.UUID
		p.PrerequisiteFor = &id
	}
	if filter.Assignee != nil {
		switch filter.Assignee.Mode {
		case command.AssigneeUser:
			p.AssigneeID = userUUID(filter.Assignee.UserID)
		case command.AssigneeMe:
			id := actor.UserID.UUID
			p.AssigneeID = &id
		case command.Unassigned:
			p.Unassigned = true
		}
	}
	return p
}
func countParams(p dbgen.IssuesSearchParams) dbgen.IssuesSearchCountParams {
	return dbgen.IssuesSearchCountParams{
		Archived:        p.Archived,
		Backlog:         p.Backlog,
		IsAdmin:         p.IsAdmin,
		CallerID:        p.CallerID,
		ProjectIds:      p.ProjectIds,
		Query:           p.Query,
		QueryKind:       p.QueryKind,
		QueryNumber:     p.QueryNumber,
		QueryPattern:    p.QueryPattern,
		QueryProjectKey: p.QueryProjectKey,
		QueryKeyNumber:  p.QueryKeyNumber,
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
	}
}
func (s *Service) Search(ctx context.Context, actor command.Actor, input SearchInput) (command.Page[IssueSummary], error) {
	filter, err := normalizeFilter(input.Filters)
	if err != nil {
		return command.Page[IssueSummary]{}, err
	}
	limit, err := input.Page.Size()
	if err != nil {
		return command.Page[IssueSummary]{}, err
	}
	scope, err := command.CursorScopeFor(command.SearchIssues, actor.UserID, "updatedAt DESC,id DESC", searchScope{Filters: filter, Today: actor.Today})
	if err != nil {
		return command.Page[IssueSummary]{}, err
	}
	position := searchPosition{}
	if input.Page.Cursor != nil {
		position, err = command.ReadCursor[searchPosition](s.cursors, scope, *input.Page.Cursor)
		if err != nil {
			return command.Page[IssueSummary]{}, err
		}
	}
	return command.Read(ctx, s.runner, actor, command.Access{}, func(ctx context.Context, m *command.Mutation) (command.Page[IssueSummary], error) {
		params := searchParams(filter, actor, m.User.IsAdministrator)
		requiresUpgrade, err := m.Queries.IssuesLegacySearchRequiresUpgrade(ctx, dbgen.IssuesLegacySearchRequiresUpgradeParams{
			ProjectIds: params.ProjectIds,
			IsAdmin:    m.User.IsAdministrator,
			CallerID:   actor.UserID.UUID,
		})
		if err != nil {
			return command.Page[IssueSummary]{}, err
		}
		if requiresUpgrade {
			return command.Page[IssueSummary]{}, legacyUpgrade()
		}
		params.HasCursor = input.Page.Cursor != nil
		params.AfterTime = pgtype.Timestamptz{Time: position.Time, Valid: true}
		params.AfterID = position.ID
		params.AfterSort = position.SortValue
		if params.AfterSort == 0 && (filter.Sort == "" || filter.Sort == command.SortUpdated) {
			params.AfterSort = position.Time.UnixMicro()
		}
		params.PageSize = int32(limit + 1)
		rows, count, err := querySearch(ctx, m, params)
		if err != nil {
			return command.Page[IssueSummary]{}, err
		}
		items := []IssueSummary{}
		for _, row := range rows {
			item, err := Summary(dbgen.IssuesGetRow(row), actor.Today)
			if err != nil {
				return command.Page[IssueSummary]{}, err
			}
			items = append(items, item)
		}
		return command.BuildPage(s.cursors, scope, items, limit, int(count), false, func(v IssueSummary) searchPosition {
			return searchPosition{Time: v.UpdatedAt, ID: v.ID.UUID, SortValue: issueSortValue(v, filter.Sort)}
		})
	})
}

func issueSortValue(v IssueSummary, order command.IssueSort) int64 {
	switch order {
	case command.SortCreated:
		return v.CreatedAt.UnixMicro()
	case command.SortDue:
		if v.DueDate == nil {
			return -253402214400
		}
		day, _ := time.Parse("2006-01-02", v.DueDate.String())
		return -day.Unix()
	case command.SortPriority:
		if v.Priority == command.High {
			return 3
		}
		if v.Priority == command.Medium {
			return 2
		}
		return 1
	default:
		return v.UpdatedAt.UnixMicro()
	}
}

func canonicalFilterUUIDs[K comparable](ids []command.ID[K]) []uuid.UUID {
	out := make([]uuid.UUID, 0, len(ids))
	for _, id := range ids {
		out = append(out, id.UUID)
	}
	return out
}
