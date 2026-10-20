package boards

import (
	"context"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"strings"
	"time"
)

type NativeCardsInput struct {
	BoardID          command.BoardID     `json:"boardId"`
	ColumnID         command.ColumnID    `json:"columnId"`
	TemporaryFilters command.IssueFilter `json:"temporaryFilters,omitempty"`
	Page             command.PageRequest `json:"page,omitempty"`
}
type NativeCardPage struct {
	Epics        []BoardCardEpic              `json:"epics,omitempty" nullable:"false" maxItems:"100"`
	Column       LayoutColumn                 `json:"column"`
	Items        []command.ModernIssueSummary `json:"items" nullable:"false" maxItems:"100"`
	NextCursor   *string                      `json:"nextCursor" nullable:"true" maxLength:"2048"`
	Terminal     bool                         `json:"terminal"`
	CompanyToday command.CalendarDate         `json:"companyToday"`
}
type nativeCardPosition struct {
	Phase   string    `json:"phase"`
	Rank    int64     `json:"rank"`
	Created time.Time `json:"created"`
	ID      uuid.UUID `json:"id"`
}
type nativeCardScope struct {
	GraphRevision command.Revision     `json:"graphRevision"`
	BoardID       command.BoardID      `json:"boardId"`
	BoardRevision command.Revision     `json:"boardRevision"`
	OrderRevision command.Revision     `json:"orderRevision"`
	ColumnID      command.ColumnID     `json:"columnId"`
	Temporary     command.IssueFilter  `json:"temporaryFilters"`
	Today         command.CalendarDate `json:"today"`
}

func (s *Service) NativeCards(ctx context.Context, actor command.Actor, input NativeCardsInput) (NativeCardPage, error) {
	empty := NativeCardPage{}
	if input.ColumnID.UUID == uuid.Nil {
		return empty, validation("columnId", "Choose a board column.")
	}
	limit, err := input.Page.Size()
	if err != nil {
		return empty, err
	}
	return command.ReadResolved(ctx, s.runner, actor, command.Access{RepeatableRead: true}, boardScopes(input.BoardID, false), func(ctx context.Context, m *command.Mutation) (NativeCardPage, error) {
		view, err := s.layoutForColumn(ctx, m, input.BoardID, input.TemporaryFilters, &input.ColumnID.UUID)
		if err != nil {
			return empty, err
		}
		var column LayoutColumn
		for _, c := range view.Columns {
			if c.ID == input.ColumnID {
				column = c
				break
			}
		}
		if column.ID.UUID == uuid.Nil {
			return empty, validation("columnId", "This column is unavailable. Reload the board.")
		}
		temporary, err := normalizeFilter(view.Board.ProjectID, input.TemporaryFilters)
		if err != nil {
			return empty, err
		}
		permission, err := m.ProjectPermissions(view.Board.ProjectID)
		if err != nil {
			return empty, err
		}
		scope, err := command.CursorScopeFor(command.ListNativeBoardCards, actor.UserID, "phase,rank|createdAt,id", nativeCardScope{
			permission.GraphRevision,
			view.Board.ID,
			view.Board.Revision,
			column.OrderRevision,
			column.ID,
			temporary,
			actor.Today,
		})
		if err != nil {
			return empty, err
		}
		position := nativeCardPosition{Phase: "ranked"}
		if input.Page.Cursor != nil {
			position, err = command.ReadCursor[nativeCardPosition](s.cursors, scope, *input.Page.Cursor)
			if err != nil || (position.Phase != "ranked" && position.Phase != "unranked") {
				return empty, &command.Failure{
					Code:        command.Conflict,
					Message:     "The board view or column order changed. Reload this column.",
					FieldErrors: []command.FieldError{},
					NextAction:  command.ReloadCurrentState,
				}
			}
		}
		predicates := countsParams(view.Board.ProjectID, view.Board.SavedFilters, temporary, actor)
		base := make([]dbgen.IssuesGetRow, 0, limit+1)
		positions := map[uuid.UUID]nativeCardPosition{}
		if position.Phase == "ranked" {
			params := rankedCardParams(input, predicates, permission.ProjectKey)
			params.HasCursor = input.Page.Cursor != nil
			params.AfterRank = position.Rank
			params.AfterID = position.ID
			params.PageSize = int32(limit + 1)
			rows, err := nativeRankedCards(ctx, m, params, selectiveText(view.Board.SavedFilters, temporary, permission.ProjectKey))
			if err != nil {
				return empty, err
			}
			for _, row := range rows {
				base = append(base, rankedBase(row))
				positions[row.Issue.ID] = nativeCardPosition{Phase: "ranked", Rank: row.BoardRank, ID: row.Issue.ID}
			}
		}
		// Do not inspect or sort the unranked tail until a ranked page is exhausted.
		if len(base) < limit+1 {
			params := unrankedCardParams(input, predicates, permission.ProjectKey)
			params.HasCursor = position.Phase == "unranked"
			params.AfterCreated = pgtype.Timestamptz{Time: position.Created, Valid: true}
			params.AfterID = position.ID
			params.PageSize = int32(limit + 1 - len(base))
			rows, err := nativeUnrankedCards(ctx, m, params, selectiveText(view.Board.SavedFilters, temporary, permission.ProjectKey))
			if err != nil {
				return empty, err
			}
			for _, row := range rows {
				base = append(base, unrankedBase(row))
				positions[row.Issue.ID] = nativeCardPosition{Phase: "unranked", Created: row.Issue.CreatedAt.Time, ID: row.Issue.ID}
			}
		}
		if s.modernSummaries == nil {
			return empty, &command.Failure{
				Code:        command.Busy,
				Message:     "Native card reading is not configured.",
				FieldErrors: []command.FieldError{},
				NextAction:  command.ReloadCurrentState,
			}
		}
		items, err := s.modernSummaries(ctx, m, base, actor.Today)
		if err != nil {
			return empty, err
		}
		page, err := command.BuildPage(s.cursors, scope, items, limit, int(column.VisibleMatchCount), false, func(v command.ModernIssueSummary) nativeCardPosition { return positions[v.ID.UUID] })
		if err != nil {
			return empty, err
		}
		epics, err := cardEpics(ctx, m, view.Board.ProjectID, page.Items)
		if err != nil {
			return empty, err
		}
		return NativeCardPage{
			Epics:        epics,
			Column:       column,
			Items:        page.Items,
			NextCursor:   page.NextCursor,
			Terminal:     page.NextCursor == nil,
			CompanyToday: actor.Today,
		}, nil
	})
}

func cardEpics(ctx context.Context, m *command.Mutation, project command.ProjectID, items []command.ModernIssueSummary) ([]BoardCardEpic, error) {
	ids := make([]uuid.UUID, 0, len(items))
	for _, item := range items {
		ids = append(ids, item.ID.UUID)
	}
	if len(ids) == 0 {
		return []BoardCardEpic{}, nil
	}
	rows, err := m.Queries.BoardsCardEpics(ctx, dbgen.BoardsCardEpicsParams{ProjectID: project.UUID, IssueIds: ids})
	if err != nil {
		return nil, err
	}
	out := make([]BoardCardEpic, 0, len(rows))
	for _, row := range rows {
		out = append(out, BoardCardEpic{
			IssueID:  command.IssueID{UUID: row.IssueID},
			EpicID:   command.ID[CardEpicKind]{UUID: row.EpicID},
			EpicName: row.EpicName,
		})
	}
	return out, nil
}

func selectiveText(saved, temp command.IssueFilter, projectKey string) bool {
	for _, filter := range []command.IssueFilter{saved, temp} {
		if filter.Query == nil {
			continue
		}
		query := command.ClassifySearch(*filter.Query)
		if query.Kind == command.SearchLiteral && !strings.HasPrefix(strings.ToLower(projectKey+"-"), strings.ToLower(query.Raw)) {
			return true
		}
	}
	return false
}
func nativeRankedCards(ctx context.Context, m *command.Mutation, p dbgen.BoardsRankedCardsParams, selective bool) ([]dbgen.BoardsRankedCardsRow, error) {
	if !selective {
		return m.Queries.BoardsRankedCards(ctx, p)
	}
	rows, err := m.Queries.BoardsSelectiveRankedCards(ctx, selectiveRankedParams(p))
	if err != nil {
		return nil, err
	}
	out := make([]dbgen.BoardsRankedCardsRow, 0, len(rows))
	for _, row := range rows {
		out = append(out, dbgen.BoardsRankedCardsRow(row))
	}
	return out, nil
}
func nativeUnrankedCards(ctx context.Context, m *command.Mutation, p dbgen.BoardsUnrankedCardsParams, selective bool) ([]dbgen.BoardsUnrankedCardsRow, error) {
	if !selective {
		return m.Queries.BoardsUnrankedCards(ctx, p)
	}
	rows, err := m.Queries.BoardsSelectiveUnrankedCards(ctx, selectiveUnrankedParams(p))
	if err != nil {
		return nil, err
	}
	out := make([]dbgen.BoardsUnrankedCardsRow, 0, len(rows))
	for _, row := range rows {
		out = append(out, dbgen.BoardsUnrankedCardsRow(row))
	}
	return out, nil
}
