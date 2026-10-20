package boards

import (
	"context"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"time"
)

type filterBindings struct {
	TypeIds, PriorityIds, WorkflowIds, StageIds []uuid.UUID
	ProjectIds                                  []uuid.UUID
	Query                                       string
	Search                                      command.SearchQuery
	Statuses, Priorities, Types                 []string
	Unassigned                                  bool
	AssigneeID, ParentID, PrerequisiteFor       *uuid.UUID
	LabelIds                                    []uuid.UUID
	DueFrom, DueTo                              pgtype.Date
	Overdue, Blocked                            *bool
}

func stringsOf[T ~string](values []T) []string {
	result := []string{}
	for _, v := range values {
		result = append(result, string(v))
	}
	return result
}
func dateValue(value *command.CalendarDate) pgtype.Date {
	if value == nil {
		return pgtype.Date{}
	}
	date, _ := time.Parse("2006-01-02", value.String())
	return pgtype.Date{Time: date, Valid: true}
}
func bindings(filter command.IssueFilter, actor command.Actor) filterBindings {
	p := filterBindings{
		ProjectIds:  []uuid.UUID{},
		LabelIds:    []uuid.UUID{},
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
	}
	for _, id := range filter.ProjectIDs {
		p.ProjectIds = append(p.ProjectIds, id.UUID)
	}
	for _, id := range filter.LabelIDs {
		p.LabelIds = append(p.LabelIds, id.UUID)
	}
	if filter.Query != nil {
		p.Query = *filter.Query
	}
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
		case command.AssigneeMe:
			id := actor.UserID.UUID
			p.AssigneeID = &id
		case command.AssigneeUser:
			if filter.Assignee.UserID != nil {
				id := filter.Assignee.UserID.UUID
				p.AssigneeID = &id
			}
		case command.Unassigned:
			p.Unassigned = true
		}
	}
	p.Search = command.ClassifySearch(p.Query)
	p.Query = p.Search.Raw
	return p
}
func countsParams(project command.ProjectID, saved, temporary command.IssueFilter, actor command.Actor) dbgen.BoardsCountsParams {
	a, b := bindings(saved, actor), bindings(temporary, actor)
	return dbgen.BoardsCountsParams{ProjectID: project.UUID, Today: dateValue(&actor.Today),
		SavedProjectIds: a.ProjectIds, SavedQuery: a.Query, SavedQueryKind: string(a.Search.Kind), SavedQueryNumber: a.Search.Number, SavedQueryPattern: a.Search.Pattern, SavedQueryProjectKey: a.Search.ProjectKey, SavedQueryKeyNumber: a.Search.KeyNumber, SavedStatuses: a.Statuses, SavedPriorities: a.Priorities, SavedTypes: a.Types, SavedTypeIds: a.TypeIds, SavedPriorityIds: a.PriorityIds, SavedWorkflowIds: a.WorkflowIds, SavedStageIds: a.StageIds, SavedUnassigned: a.Unassigned, SavedAssigneeID: a.AssigneeID, SavedParentID: a.ParentID, SavedPrerequisiteFor: a.PrerequisiteFor, SavedLabelIds: a.LabelIds, SavedDueFrom: a.DueFrom, SavedDueTo: a.DueTo, SavedOverdue: a.Overdue, SavedBlocked: a.Blocked, TemporaryProjectIds: b.ProjectIds, TemporaryQuery: b.Query, TemporaryQueryKind: string(b.Search.Kind), TemporaryQueryNumber: b.Search.Number, TemporaryQueryPattern: b.Search.Pattern, TemporaryQueryProjectKey: b.Search.ProjectKey, TemporaryQueryKeyNumber: b.Search.KeyNumber, TemporaryStatuses: b.Statuses, TemporaryPriorities: b.Priorities, TemporaryTypes: b.Types, TemporaryTypeIds: b.TypeIds, TemporaryPriorityIds: b.PriorityIds, TemporaryWorkflowIds: b.WorkflowIds, TemporaryStageIds: b.StageIds, TemporaryUnassigned: b.Unassigned, TemporaryAssigneeID: b.AssigneeID, TemporaryParentID: b.ParentID, TemporaryPrerequisiteFor: b.PrerequisiteFor, TemporaryLabelIds: b.LabelIds, TemporaryDueFrom: b.DueFrom, TemporaryDueTo: b.DueTo, TemporaryOverdue: b.Overdue, TemporaryBlocked: b.Blocked}
}
func cardParams(p dbgen.BoardsCountsParams) dbgen.BoardsCardsParams {
	return dbgen.BoardsCardsParams{ProjectID: p.ProjectID, Today: p.Today,
		SavedProjectIds: p.SavedProjectIds, SavedQuery: p.SavedQuery, SavedQueryKind: p.SavedQueryKind, SavedQueryNumber: p.SavedQueryNumber, SavedQueryPattern: p.SavedQueryPattern, SavedQueryProjectKey: p.SavedQueryProjectKey, SavedQueryKeyNumber: p.SavedQueryKeyNumber, SavedStatuses: p.SavedStatuses, SavedPriorities: p.SavedPriorities, SavedTypes: p.SavedTypes, SavedTypeIds: p.SavedTypeIds, SavedPriorityIds: p.SavedPriorityIds, SavedWorkflowIds: p.SavedWorkflowIds, SavedStageIds: p.SavedStageIds, SavedUnassigned: p.SavedUnassigned, SavedAssigneeID: p.SavedAssigneeID, SavedParentID: p.SavedParentID, SavedPrerequisiteFor: p.SavedPrerequisiteFor, SavedLabelIds: p.SavedLabelIds, SavedDueFrom: p.SavedDueFrom, SavedDueTo: p.SavedDueTo, SavedOverdue: p.SavedOverdue, SavedBlocked: p.SavedBlocked, TemporaryProjectIds: p.TemporaryProjectIds, TemporaryQuery: p.TemporaryQuery, TemporaryQueryKind: p.TemporaryQueryKind, TemporaryQueryNumber: p.TemporaryQueryNumber, TemporaryQueryPattern: p.TemporaryQueryPattern, TemporaryQueryProjectKey: p.TemporaryQueryProjectKey, TemporaryQueryKeyNumber: p.TemporaryQueryKeyNumber, TemporaryStatuses: p.TemporaryStatuses, TemporaryPriorities: p.TemporaryPriorities, TemporaryTypes: p.TemporaryTypes, TemporaryTypeIds: p.TemporaryTypeIds, TemporaryPriorityIds: p.TemporaryPriorityIds, TemporaryWorkflowIds: p.TemporaryWorkflowIds, TemporaryStageIds: p.TemporaryStageIds, TemporaryUnassigned: p.TemporaryUnassigned, TemporaryAssigneeID: p.TemporaryAssigneeID, TemporaryParentID: p.TemporaryParentID, TemporaryPrerequisiteFor: p.TemporaryPrerequisiteFor, TemporaryLabelIds: p.TemporaryLabelIds, TemporaryDueFrom: p.TemporaryDueFrom, TemporaryDueTo: p.TemporaryDueTo, TemporaryOverdue: p.TemporaryOverdue, TemporaryBlocked: p.TemporaryBlocked}
}

type boardPosition struct {
	Name string    `json:"name"`
	ID   uuid.UUID `json:"id"`
}

func (s *Service) List(ctx context.Context, actor command.Actor, input ListInput) (command.Page[BoardSummary], error) {
	limit, err := input.Page.Size()
	if err != nil {
		return command.Page[BoardSummary]{}, err
	}
	scope, err := command.CursorScopeFor(command.ListBoards, actor.UserID, "nameKey,id", struct {
		Project  command.ProjectID `json:"projectId"`
		Archived bool              `json:"archived"`
	}{input.ProjectID, input.IncludeArchived})
	if err != nil {
		return command.Page[BoardSummary]{}, err
	}
	position := boardPosition{}
	if input.Page.Cursor != nil {
		position, err = command.ReadCursor[boardPosition](s.cursors, scope, *input.Page.Cursor)
		if err != nil {
			return command.Page[BoardSummary]{}, err
		}
	}
	return command.Read(ctx, s.runner, actor, command.Access{
		RepeatableRead: true,
		Projects:       []command.ProjectScope{{ProjectID: input.ProjectID}},
	}, func(ctx context.Context, m *command.Mutation) (command.Page[BoardSummary], error) {
		rows, err := m.Queries.BoardsList(ctx, dbgen.BoardsListParams{
			ProjectID:       input.ProjectID.UUID,
			IncludeArchived: input.IncludeArchived,
			HasCursor:       input.Page.Cursor != nil,
			AfterName:       position.Name,
			AfterID:         position.ID,
			PageSize:        int32(limit + 1),
		})
		if err != nil {
			return command.Page[BoardSummary]{}, err
		}
		count, err := m.Queries.BoardsListCount(ctx, dbgen.BoardsListCountParams{
			ProjectID:       input.ProjectID.UUID,
			IncludeArchived: input.IncludeArchived,
		})
		if err != nil {
			return command.Page[BoardSummary]{}, err
		}
		items := []BoardSummary{}
		positions := map[command.BoardID]boardPosition{}
		for _, row := range rows {
			view, err := describe(ctx, m, dbgen.BoardsGetRow(row))
			if err != nil {
				return command.Page[BoardSummary]{}, err
			}
			items = append(items, view)
			positions[view.ID] = boardPosition{row.Board.NameKey, row.Board.ID}
		}
		return command.BuildPage(s.cursors, scope, items, limit, int(count), false, func(b BoardSummary) boardPosition { return positions[b.ID] })
	})
}

type cardPosition struct {
	Rank   int64 `json:"rank"`
	Number int64 `json:"number"`
}
type cardScope struct {
	GraphRevision command.Revision     `json:"graphRevision"`
	BoardID       command.BoardID      `json:"boardId"`
	BoardRevision command.Revision     `json:"boardRevision"`
	OrderRevision command.Revision     `json:"orderRevision"`
	Status        command.Status       `json:"status"`
	Temporary     command.IssueFilter  `json:"temporaryFilters"`
	Today         command.CalendarDate `json:"today"`
}

func (s *Service) Cards(ctx context.Context, actor command.Actor, input CardsInput) (CardPage, error) {
	if !input.Status.Valid() {
		return CardPage{}, validation("status", "Choose a workflow column.")
	}
	limit, err := input.Page.Size()
	if err != nil {
		return CardPage{}, err
	}
	return command.ReadResolved(ctx, s.runner, actor, command.Access{RepeatableRead: true}, boardScopes(input.BoardID, false), func(ctx context.Context, m *command.Mutation) (CardPage, error) {
		if err := requireLegacyBoard(ctx, m, input.BoardID); err != nil {
			return CardPage{}, err
		}
		view, err := s.view(ctx, m, input.BoardID, input.TemporaryFilters)
		if err != nil {
			return CardPage{}, err
		}
		board := view.Board
		temporary, err := normalizeFilter(board.ProjectID, input.TemporaryFilters)
		if err != nil {
			return CardPage{}, err
		}
		var column ColumnSummary
		for _, c := range view.Columns {
			if c.Status == input.Status {
				column = c
			}
		}
		if column.OrderRevision < 1 {
			return CardPage{}, validation("status", "This stage is unavailable on the board. Reload its workflow.")
		}
		permissions, err := m.ProjectPermissions(board.ProjectID)
		if err != nil {
			return CardPage{}, err
		}
		scope, err := command.CursorScopeFor(command.ListBoardCards, actor.UserID, "rank,number", cardScope{
			permissions.GraphRevision,
			board.ID,
			board.Revision,
			column.OrderRevision,
			input.Status,
			temporary,
			actor.Today,
		})
		if err != nil {
			return CardPage{}, err
		}
		position := cardPosition{}
		if input.Page.Cursor != nil {
			position, err = command.ReadCursor[cardPosition](s.cursors, scope, *input.Page.Cursor)
			if err != nil {
				return CardPage{}, &command.Failure{
					Code:        command.Conflict,
					Message:     "The board view or column order changed. Reload the column before continuing.",
					FieldErrors: []command.FieldError{},
					NextAction:  command.ReloadCurrentState,
				}
			}
		}
		params := cardParams(countsParams(board.ProjectID, board.SavedFilters, temporary, actor))
		params.Status = string(input.Status)
		params.HasCursor = input.Page.Cursor != nil
		params.AfterRank = position.Rank
		params.AfterNumber = position.Number
		params.PageSize = int32(limit + 1)
		rows, err := m.Queries.BoardsCards(ctx, params)
		if err != nil {
			return CardPage{}, err
		}
		items := []command.IssueSummary{}
		positions := map[command.IssueID]cardPosition{}
		for _, row := range rows {
			item, err := s.summary(dbgen.IssuesGetRow(row), actor.Today)
			if err != nil {
				return CardPage{}, err
			}
			items = append(items, item)
			positions[item.ID] = cardPosition{row.Issue.Rank, row.Issue.Number}
		}
		page, err := command.BuildPage(s.cursors, scope, items, limit, int(column.VisibleMatchCount), false, func(i command.IssueSummary) cardPosition { return positions[i.ID] })
		if err != nil {
			return CardPage{}, err
		}
		cardIDs := make([]uuid.UUID, 0, len(page.Items))
		for _, item := range page.Items {
			cardIDs = append(cardIDs, item.ID.UUID)
		}
		var epics []BoardCardEpic
		if len(cardIDs) > 0 {
			// Enrich only the returned, already authorized card page in this read transaction.
			rows, err := m.Queries.BoardsCardEpics(ctx, dbgen.BoardsCardEpicsParams{
				ProjectID: board.ProjectID.UUID,
				IssueIds:  cardIDs,
			})
			if err != nil {
				return CardPage{}, err
			}
			for _, row := range rows {
				epics = append(epics, BoardCardEpic{
					IssueID:  command.IssueID{UUID: row.IssueID},
					EpicID:   command.ID[CardEpicKind]{UUID: row.EpicID},
					EpicName: row.EpicName,
				})
			}
		}
		return CardPage{
			Column:       column,
			Items:        page.Items,
			Epics:        epics,
			NextCursor:   page.NextCursor,
			CompanyToday: actor.Today,
		}, nil
	})
}

func canonicalFilterUUIDs[K comparable](ids []command.ID[K]) []uuid.UUID {
	out := make([]uuid.UUID, 0, len(ids))
	for _, id := range ids {
		out = append(out, id.UUID)
	}
	return out
}
