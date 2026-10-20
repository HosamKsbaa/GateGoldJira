package boards

import (
	"context"
	"encoding/json"
	"errors"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"github.com/google/uuid"
)

type WipMode string

const (
	WipWarn  WipMode = "warn"
	WipBlock WipMode = "block"
)

type LayoutStage struct {
	Stage    command.StageChoice    `json:"stage"`
	Workflow command.WorkflowChoice `json:"workflow"`
}
type LayoutColumn struct {
	ID                command.ColumnID `json:"id"`
	Name              string           `json:"name" minLength:"1" maxLength:"60"`
	Position          command.Position `json:"position"`
	Stages            []LayoutStage    `json:"stages" nullable:"false"`
	WipLimit          *int32           `json:"wipLimit" nullable:"true" minimum:"1" maximum:"1000"`
	WipMode           WipMode          `json:"wipMode" enum:"warn,block"`
	SavedMatchCount   int32            `json:"savedMatchCount" minimum:"0"`
	VisibleMatchCount int32            `json:"visibleMatchCount" minimum:"0"`
	LimitExceeded     bool             `json:"limitExceeded"`
	OrderRevision     command.Revision `json:"orderRevision"`
}
type LayoutBoard struct {
	ID           command.BoardID          `json:"id"`
	ProjectID    command.ProjectID        `json:"projectId"`
	Name         string                   `json:"name" minLength:"1" maxLength:"100"`
	Creator      command.IssueUserSummary `json:"creator"`
	Default      bool                     `json:"default"`
	SavedFilters command.IssueFilter      `json:"savedFilters"`
	Archived     bool                     `json:"archived"`
	Revision     command.Revision         `json:"revision"`
	CanManage    bool                     `json:"canManage"`
}
type LayoutView struct {
	Board        LayoutBoard          `json:"board"`
	Columns      []LayoutColumn       `json:"columns" nullable:"false"`
	CompanyToday command.CalendarDate `json:"companyToday"`
}
type ModernSummaryReader func(context.Context, *command.Mutation, []dbgen.IssuesGetRow, command.CalendarDate) ([]command.ModernIssueSummary, error)

func (s *Service) WithModernSummaries(read ModernSummaryReader) { s.modernSummaries = read }

func readLayoutBoard(ctx context.Context, m *command.Mutation, id command.BoardID) (LayoutBoard, error) {
	row, err := m.Queries.BoardsNativeMetadata(ctx, id.UUID)
	if err != nil {
		return LayoutBoard{}, err
	}
	b := row
	filters, err := database.DecodeBoardFilters(b.SavedFilters, b.FiltersVersion)
	if err != nil {
		return LayoutBoard{}, err
	}
	permission, err := m.ProjectPermissions(command.ProjectID{UUID: b.ProjectID})
	if err != nil {
		return LayoutBoard{}, err
	}
	return LayoutBoard{
		ID:        id,
		ProjectID: command.ProjectID{UUID: b.ProjectID},
		Name:      b.Name,
		Creator: command.IssueUserSummary{
			ID:          command.UserID{UUID: b.CreatedBy},
			DisplayName: row.CreatorName,
		},
		Default:      b.IsDefault,
		SavedFilters: filters,
		Archived:     b.ArchivedAt.Valid,
		Revision:     command.Revision(b.Revision),
		CanManage:    permission.CanWrite && (permission.CanConfigure || (!b.IsDefault && b.CreatedBy == m.User.ID)),
	}, nil
}
func (s *Service) layout(ctx context.Context, m *command.Mutation, id command.BoardID, temp command.IssueFilter) (LayoutView, error) {
	return s.layoutForColumn(ctx, m, id, temp, nil)
}
func (s *Service) layoutForColumn(ctx context.Context, m *command.Mutation, id command.BoardID, temp command.IssueFilter, columnID *uuid.UUID) (LayoutView, error) {
	b, err := readLayoutBoard(ctx, m, id)
	if err != nil {
		return LayoutView{}, err
	}
	temp, err = normalizeFilter(b.ProjectID, temp)
	if err != nil {
		return LayoutView{}, err
	}
	// Optional-filter estimates must reflect this request rather than the sixth
	// cached execution's generic plan. This setting is scoped to the transaction.
	if err = m.Queries.BoardsCustomReadPlan(ctx); err != nil {
		return LayoutView{}, err
	}
	columns, err := m.Queries.BoardsLayoutColumns(ctx, id.UUID)
	if err != nil {
		return LayoutView{}, err
	}
	stages, err := m.Queries.BoardsLayoutStages(ctx, id.UUID)
	if err != nil {
		return LayoutView{}, err
	}
	counts, err := layoutCounts(ctx, m, id, b.ProjectID, b.SavedFilters, temp, columnID)
	if err != nil {
		return LayoutView{}, err
	}
	byColumn := map[uuid.UUID][]LayoutStage{}
	for _, v := range stages {
		byColumn[v.ColumnID] = append(byColumn[v.ColumnID], LayoutStage{
			Stage: command.StageChoice{
				ID:             command.StageID{UUID: v.ID},
				Name:           v.Name,
				Category:       command.Status(v.Category),
				Position:       command.Position(v.Position),
				Initial:        v.IsInitial,
				AcceptsEntries: v.AcceptsEntries,
				Retired:        v.Retired,
			},
			Workflow: command.WorkflowChoice{
				ID:       command.WorkflowID{UUID: v.WorkflowID},
				Name:     v.WorkflowName,
				Revision: command.Revision(v.WorkflowRevision),
				Retired:  v.WorkflowRetired,
			},
		})
	}
	totals := map[uuid.UUID]dbgen.BoardsLayoutCountsRow{}
	for _, v := range counts {
		totals[v.ID] = v
	}
	view := LayoutView{Board: b, Columns: []LayoutColumn{}, CompanyToday: m.Actor.Today}
	for _, c := range columns {
		mapped := byColumn[c.ID]
		if mapped == nil {
			mapped = []LayoutStage{}
		}
		n := totals[c.ID]
		view.Columns = append(view.Columns, LayoutColumn{
			ID:                command.ColumnID{UUID: c.ID},
			Name:              c.Name,
			Position:          command.Position(c.Position),
			Stages:            mapped,
			WipLimit:          c.WipLimit,
			WipMode:           WipMode(c.WipMode),
			SavedMatchCount:   n.SavedCount,
			VisibleMatchCount: n.VisibleCount,
			LimitExceeded:     c.WipLimit != nil && n.SavedCount > *c.WipLimit,
			OrderRevision:     command.Revision(c.OrderRevision),
		})
	}
	return view, validateLayout(view)
}
func validateLayout(v LayoutView) error {
	if v.Board.ID.UUID == uuid.Nil || v.Board.ProjectID.UUID == uuid.Nil || v.Board.Revision < 1 || v.Columns == nil {
		return errors.New("invalid layout result")
	}
	for _, c := range v.Columns {
		if c.ID.UUID == uuid.Nil || c.OrderRevision < 1 || c.Position < 1 || c.Stages == nil || command.ValidateText(c.Name, 1, 60) != nil || (c.WipMode != WipWarn && c.WipMode != WipBlock) {
			return errors.New("invalid layout column")
		}
	}
	return nil
}
func (s *Service) GetLayout(ctx context.Context, actor command.Actor, input GetInput) (LayoutView, error) {
	return command.ReadResolved(ctx, s.runner, actor, command.Access{RepeatableRead: true}, boardScopes(input.BoardID, false), func(ctx context.Context, m *command.Mutation) (LayoutView, error) {
		return s.layout(ctx, m, input.BoardID, input.TemporaryFilters)
	})
}

func layoutCounts(ctx context.Context, m *command.Mutation, board command.BoardID, project command.ProjectID, saved, temp command.IssueFilter, columnID *uuid.UUID) ([]dbgen.BoardsLayoutCountsRow, error) {
	permission, err := m.ProjectPermissions(project)
	if err != nil {
		return nil, err
	}
	savedJSON, _ := json.Marshal(saved)
	temporaryJSON, _ := json.Marshal(temp)
	if string(savedJSON) == "{}" && string(temporaryJSON) == "{}" {
		rows, err := m.Queries.BoardsUnfilteredLayoutCounts(ctx, dbgen.BoardsUnfilteredLayoutCountsParams{BoardID: board.UUID, ColumnID: columnID})
		if err != nil {
			return nil, err
		}
		result := make([]dbgen.BoardsLayoutCountsRow, 0, len(rows))
		for _, row := range rows {
			result = append(result, dbgen.BoardsLayoutCountsRow{
				ID:            row.ID,
				OrderRevision: row.OrderRevision,
				SavedCount:    row.SavedCount,
				VisibleCount:  row.SavedCount,
			})
		}
		return result, nil
	}
	parameters := countsParams(project, saved, temp, m.Actor)
	normalized, _ := json.Marshal(temp)
	if string(normalized) == "{}" {
		p := savedLayoutCountParams(board, parameters, permission.ProjectKey)
		p.ColumnID = columnID
		rows, err := m.Queries.BoardsSavedLayoutCounts(ctx, p)
		if err != nil {
			return nil, err
		}
		out := make([]dbgen.BoardsLayoutCountsRow, 0, len(rows))
		for _, row := range rows {
			out = append(out, dbgen.BoardsLayoutCountsRow{
				ID:            row.ID,
				OrderRevision: row.OrderRevision,
				SavedCount:    row.SavedCount,
				VisibleCount:  row.SavedCount,
			})
		}
		return out, nil
	}
	p := layoutCountParams(board, parameters, permission.ProjectKey)
	p.ColumnID = columnID
	return m.Queries.BoardsLayoutCounts(ctx, p)
}
