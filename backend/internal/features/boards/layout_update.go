package boards

import (
	"context"
	"encoding/json"
	"gategoldjira/backend/internal/features/activity"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"github.com/google/uuid"
	"strings"
)

type ColumnDraft struct {
	ID       command.ColumnID  `json:"id"`
	Name     string            `json:"name" minLength:"1" maxLength:"60"`
	StageIDs []command.StageID `json:"stageIds" nullable:"false"`
	WipLimit *int32            `json:"wipLimit" nullable:"true" minimum:"1" maximum:"1000"`
	WipMode  WipMode           `json:"wipMode" enum:"warn,block"`
}
type SaveLayoutFields struct {
	ExpectedRevision command.Revision    `json:"expectedRevision"`
	Name             string              `json:"name" minLength:"1" maxLength:"100"`
	SavedFilters     command.IssueFilter `json:"savedFilters"`
	Columns          []ColumnDraft       `json:"columns" nullable:"false" minItems:"1"`
}
type SaveLayoutInput struct {
	BoardID command.BoardID `json:"boardId"`
	SaveLayoutFields
	RetryReference string `json:"retryReference" format:"uuid"`
}

func layoutDraft(v LayoutView) SaveLayoutFields {
	out := SaveLayoutFields{
		ExpectedRevision: v.Board.Revision,
		Name:             v.Board.Name,
		SavedFilters:     v.Board.SavedFilters,
		Columns:          []ColumnDraft{},
	}
	for _, c := range v.Columns {
		ids := []command.StageID{}
		for _, mapped := range c.Stages {
			ids = append(ids, mapped.Stage.ID)
		}
		out.Columns = append(out.Columns, ColumnDraft{
			ID:       c.ID,
			Name:     c.Name,
			StageIDs: ids,
			WipLimit: c.WipLimit,
			WipMode:  c.WipMode,
		})
	}
	return out
}
func normalizeLayout(fields SaveLayoutFields) (SaveLayoutFields, error) {
	name, err := normalizeName(fields.Name)
	if err != nil {
		return fields, err
	}
	fields.Name = name
	if fields.ExpectedRevision < 1 || len(fields.Columns) == 0 {
		return fields, validation("columns", "Keep at least one column and supply the current layout revision.")
	}
	ids := map[command.ColumnID]bool{}
	names := map[string]bool{}
	stages := map[command.StageID]bool{}
	for index, c := range fields.Columns {
		c.Name = strings.TrimSpace(c.Name)
		nameKey := strings.ToLower(c.Name)
		if c.ID.UUID == uuid.Nil || ids[c.ID] || names[nameKey] || command.ValidateText(c.Name, 1, 60) != nil || c.StageIDs == nil || (c.WipMode != WipWarn && c.WipMode != WipBlock) || (c.WipLimit != nil && (*c.WipLimit < 1 || *c.WipLimit > 1000)) || (c.WipMode == WipBlock && c.WipLimit == nil) {
			return fields, validation("columns", "Use distinct column IDs and names, valid limits, and an explicit stage list.")
		}
		ids[c.ID] = true
		names[nameKey] = true
		for _, stage := range c.StageIDs {
			if stage.UUID == uuid.Nil || stages[stage] {
				return fields, validation("stageIds", "Map each stage to at most one column on this board.")
			}
			stages[stage] = true
		}
		if c.WipMode == WipBlock {
			if err = validateHardFilter(fields.SavedFilters); err != nil {
				return fields, err
			}
		}
		fields.Columns[index] = c
	}
	return fields, nil
}
func (s *Service) SaveLayout(ctx context.Context, actor command.Actor, input SaveLayoutInput) (command.SaveOutcome[LayoutView], error) {
	fields, err := normalizeLayout(input.SaveLayoutFields)
	if err != nil {
		return command.SaveOutcome[LayoutView]{}, err
	}
	input.SaveLayoutFields = fields
	request := command.MutationRequest{
		Actor:           actor,
		Operation:       command.SaveBoardLayout,
		RetryReference:  input.RetryReference,
		ResolveProjects: boardScopes(input.BoardID, true),
	}
	return command.Save(ctx, s.runner, request, input, func(ctx context.Context, m *command.Mutation) error {
		b, err := readLayoutBoard(ctx, m, input.BoardID)
		if err != nil {
			return err
		}
		if !b.CanManage {
			return forbidden("Only the eligible board creator or a project administrator can edit this layout.")
		}
		if b.Archived {
			return forbidden("Restore the board before editing its layout.")
		}
		return nil
	}, func(ctx context.Context, m *command.Mutation, in SaveLayoutInput) (command.Change[LayoutView], error) {
		empty := command.Change[LayoutView]{}
		current, err := s.layout(ctx, m, in.BoardID, command.IssueFilter{})
		if err != nil {
			return empty, err
		}
		permission, err := m.ProjectPermissions(current.Board.ProjectID)
		if err != nil {
			return empty, err
		}
		if !permission.ModernCore {
			if _, err := m.Tx.Exec(ctx, "UPDATE projects SET core_mode='modern' WHERE id=$1 AND core_mode<>'modern'", current.Board.ProjectID.UUID); err != nil {
				return empty, err
			}
		}
		if current.Board.Revision != in.ExpectedRevision {
			return empty, orderConflict()
		}
		in.SavedFilters, err = normalizeFilter(current.Board.ProjectID, in.SavedFilters)
		if err != nil {
			return empty, err
		}
		filter, err := json.Marshal(in.SavedFilters)
		if err != nil {
			return empty, err
		}
		if current.Board.Default && (in.Name != "All Issues" || string(filter) != "{}") {
			return empty, validation("savedFilters", "The default All Issues board keeps its name and unrestricted saved view.")
		}
		covered := map[uuid.UUID]bool{}
		for _, c := range in.Columns {
			for _, stage := range c.StageIDs {
				valid, err := m.Queries.BoardsScopedStage(ctx, dbgen.BoardsScopedStageParams{
					ProjectID: current.Board.ProjectID.UUID,
					ID:        stage.UUID,
				})
				if err != nil {
					return empty, err
				}
				if !valid {
					return empty, validation("stageIds", "Every mapped stage must belong to this project.")
				}
				covered[stage.UUID] = true
			}
		}
		if current.Board.Default {
			required, err := m.Queries.BoardsRequiredDefaultStages(ctx, current.Board.ProjectID.UUID)
			if err != nil {
				return empty, err
			}
			for _, stage := range required {
				if !covered[stage] {
					return empty, validation("stageIds", "The default board must cover every intake and occupied stage.")
				}
			}
		}
		old := layoutDraft(current)
		old.ExpectedRevision = in.ExpectedRevision
		before, _ := json.Marshal(old)
		after, _ := json.Marshal(in.SaveLayoutFields)
		if string(before) == string(after) {
			return command.Change[LayoutView]{Result: current, HTTPStatus: 200}, nil
		}
		if err = m.Queries.BoardsDeleteMappings(ctx, in.BoardID.UUID); err != nil {
			return empty, err
		}
		ids := []uuid.UUID{}
		for index, c := range in.Columns {
			ids = append(ids, c.ID.UUID)
			if _, err = m.Queries.BoardsSaveColumn(ctx, dbgen.BoardsSaveColumnParams{
				ID:        c.ID.UUID,
				ProjectID: current.Board.ProjectID.UUID,
				BoardID:   in.BoardID.UUID,
				Name:      c.Name,
				Position:  int64(index + 1),
				WipLimit:  c.WipLimit,
				WipMode:   string(c.WipMode),
			}); err != nil {
				return empty, err
			}
			for _, stage := range c.StageIDs {
				if err = m.Queries.BoardsSaveMapping(ctx, dbgen.BoardsSaveMappingParams{
					ProjectID: current.Board.ProjectID.UUID,
					BoardID:   in.BoardID.UUID,
					ColumnID:  c.ID.UUID,
					StageID:   stage.UUID,
				}); err != nil {
					return empty, err
				}
			}
		}
		if err = m.Queries.BoardsDeleteUnusedColumns(ctx, dbgen.BoardsDeleteUnusedColumnsParams{BoardID: in.BoardID.UUID, ColumnIds: ids}); err != nil {
			return empty, err
		}
		if err = m.Queries.BoardsSaveLayoutSettings(ctx, dbgen.BoardsSaveLayoutSettingsParams{
			ID:           in.BoardID.UUID,
			Name:         in.Name,
			NameKey:      strings.ToLower(in.Name),
			SavedFilters: filter,
		}); err != nil {
			return empty, databaseWriteError(err)
		}
		view, err := s.layout(ctx, m, in.BoardID, command.IssueFilter{})
		if err != nil {
			return empty, err
		}
		for _, c := range view.Columns {
			if c.WipMode == WipBlock && c.LimitExceeded {
				return empty, validation("wipLimit", "A hard limit cannot be below this column's full saved-view count.")
			}
		}
		event, err := boardEvent(ctx, m, command.SaveBoardLayout, BoardSummary{
			ID:        current.Board.ID,
			ProjectID: current.Board.ProjectID,
		}, []activity.FieldChange{{
			Field:  "layout",
			Before: stringPointer(string(before)),
			After:  stringPointer(string(after)),
		}})
		return command.Change[LayoutView]{Result: view, EventID: event, HTTPStatus: 200}, err
	}, validateLayout)
}

func stringPointer(value string) *string { return &value }

func (s *Service) CreateModernBoard(ctx context.Context, actor command.Actor, in CreateInput) (command.SaveOutcome[LayoutView], error) {
	empty := command.SaveOutcome[LayoutView]{}
	name, err := normalizeName(in.Name)
	if err != nil {
		return empty, err
	}
	in.Name = name
	in.SavedFilters, err = normalizeFilter(in.ProjectID, in.SavedFilters)
	if err != nil {
		return empty, err
	}
	request := command.MutationRequest{
		Actor:          actor,
		Operation:      command.CreateModernBoard,
		RetryReference: in.RetryReference,
		Access:         command.Access{Projects: []command.ProjectScope{{ProjectID: in.ProjectID, Write: true}}},
	}
	return command.Save(ctx, s.runner, request, in, func(context.Context, *command.Mutation) error { return nil }, func(ctx context.Context, m *command.Mutation, in CreateInput) (command.Change[LayoutView], error) {
		empty := command.Change[LayoutView]{}
		permissions, err := m.ProjectPermissions(in.ProjectID)
		if err != nil {
			return empty, err
		}
		if !permissions.ModernCore {
			if _, err := m.Tx.Exec(ctx, "UPDATE projects SET core_mode='modern' WHERE id=$1 AND core_mode<>'modern'", in.ProjectID.UUID); err != nil {
				return empty, err
			}
		}
		defaultRow, err := m.Queries.BoardsDefault(ctx, in.ProjectID.UUID)
		if err != nil {
			return empty, err
		}
		template, err := s.layout(ctx, m, command.BoardID{UUID: defaultRow.Board.ID}, command.IssueFilter{})
		if err != nil {
			return empty, err
		}
		id := command.NewID[command.BoardKind]()
		filters, err := json.Marshal(in.SavedFilters)
		if err != nil {
			return empty, err
		}
		if _, err = m.Queries.BoardsInsert(ctx, dbgen.BoardsInsertParams{
			ID:           id.UUID,
			ProjectID:    in.ProjectID.UUID,
			Name:         in.Name,
			NameKey:      strings.ToLower(in.Name),
			CreatedBy:    m.User.ID,
			SavedFilters: filters,
		}); err != nil {
			return empty, databaseWriteError(err)
		}
		for _, column := range template.Columns {
			cid := command.NewID[command.ColumnKind]()
			if _, err = m.Queries.BoardsSaveColumn(ctx, dbgen.BoardsSaveColumnParams{
				ID:        cid.UUID,
				ProjectID: in.ProjectID.UUID,
				BoardID:   id.UUID,
				Name:      column.Name,
				Position:  int64(column.Position),
				WipMode:   string(WipWarn),
			}); err != nil {
				return empty, err
			}
			for _, mapped := range column.Stages {
				if err = m.Queries.BoardsSaveMapping(ctx, dbgen.BoardsSaveMappingParams{
					ProjectID: in.ProjectID.UUID,
					BoardID:   id.UUID,
					ColumnID:  cid.UUID,
					StageID:   mapped.Stage.ID.UUID,
				}); err != nil {
					return empty, err
				}
			}
		}
		view, err := s.layout(ctx, m, id, command.IssueFilter{})
		if err != nil {
			return empty, err
		}
		event, err := boardEvent(ctx, m, command.CreateModernBoard, BoardSummary{ID: id, ProjectID: in.ProjectID}, []activity.FieldChange{{Field: "name", After: &in.Name}})
		return command.Change[LayoutView]{Result: view, EventID: event, HTTPStatus: 201}, err
	}, validateLayout)
}
