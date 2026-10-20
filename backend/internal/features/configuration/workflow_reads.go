package configuration

import (
	"context"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"github.com/google/uuid"
)

type workflowPosition struct {
	ID uuid.UUID `json:"id"`
}
type stagePosition struct {
	Position command.Position `json:"position"`
	ID       uuid.UUID        `json:"id"`
}

func (s *Service) Workflows(ctx context.Context, actor command.Actor, input ListInput) (command.Page[WorkflowView], error) {
	limit, err := input.Page.Size()
	if err != nil {
		return command.Page[WorkflowView]{}, err
	}
	scope, err := command.CursorScopeFor(command.ListWorkflows, actor.UserID, "id", listScope{input.ProjectID, input.IncludeRetired})
	if err != nil {
		return command.Page[WorkflowView]{}, err
	}
	position := workflowPosition{}
	if input.Page.Cursor != nil {
		position, err = command.ReadCursor[workflowPosition](s.cursors, scope, *input.Page.Cursor)
		if err != nil {
			return command.Page[WorkflowView]{}, err
		}
	}
	return command.Read(ctx, s.runner, actor, command.Access{Projects: []command.ProjectScope{{ProjectID: input.ProjectID}}}, func(ctx context.Context, m *command.Mutation) (command.Page[WorkflowView], error) {
		rows, err := m.Queries.ConfigurationWorkflows(ctx, dbgen.ConfigurationWorkflowsParams{
			ProjectID:      input.ProjectID.UUID,
			IncludeRetired: input.IncludeRetired,
			HasCursor:      input.Page.Cursor != nil,
			AfterID:        position.ID,
			PageSize:       int32(limit + 1),
		})
		if err != nil {
			return command.Page[WorkflowView]{}, err
		}
		total, err := m.Queries.ConfigurationWorkflowCount(ctx, dbgen.ConfigurationWorkflowCountParams{
			ProjectID:      input.ProjectID.UUID,
			IncludeRetired: input.IncludeRetired,
		})
		if err != nil {
			return command.Page[WorkflowView]{}, err
		}
		items := make([]WorkflowView, 0, len(rows))
		for _, row := range rows {
			items = append(items, workflowView(row))
		}
		return command.BuildPage(s.cursors, scope, items, limit, int(total), false, func(v WorkflowView) workflowPosition { return workflowPosition{v.ID.UUID} })
	})
}
func (s *Service) Stages(ctx context.Context, actor command.Actor, input StageListInput) (command.Page[StageView], error) {
	limit, err := input.Page.Size()
	if err != nil {
		return command.Page[StageView]{}, err
	}
	scope, err := command.CursorScopeFor(command.ListWorkflowStages, actor.UserID, "position,id", struct {
		Project  command.ProjectID
		Workflow command.WorkflowID
		Retired  bool
	}{input.ProjectID, input.WorkflowID, input.IncludeRetired})
	if err != nil {
		return command.Page[StageView]{}, err
	}
	position := stagePosition{}
	if input.Page.Cursor != nil {
		position, err = command.ReadCursor[stagePosition](s.cursors, scope, *input.Page.Cursor)
		if err != nil {
			return command.Page[StageView]{}, err
		}
	}
	return command.Read(ctx, s.runner, actor, command.Access{Projects: []command.ProjectScope{{ProjectID: input.ProjectID}}}, func(ctx context.Context, m *command.Mutation) (command.Page[StageView], error) {
		if _, err := readWorkflow(ctx, m, input.ProjectID, input.WorkflowID); err != nil {
			return command.Page[StageView]{}, err
		}
		rows, err := m.Queries.ConfigurationStages(ctx, dbgen.ConfigurationStagesParams{
			WorkflowID:     input.WorkflowID.UUID,
			IncludeRetired: input.IncludeRetired,
			HasCursor:      input.Page.Cursor != nil,
			AfterPosition:  int64(position.Position),
			AfterID:        position.ID,
			PageSize:       int32(limit + 1),
		})
		if err != nil {
			return command.Page[StageView]{}, err
		}
		total, err := m.Queries.ConfigurationStageCount(ctx, dbgen.ConfigurationStageCountParams{
			WorkflowID:     input.WorkflowID.UUID,
			IncludeRetired: input.IncludeRetired,
		})
		if err != nil {
			return command.Page[StageView]{}, err
		}
		items := make([]StageView, 0, len(rows))
		for _, row := range rows {
			items = append(items, stageView(row))
		}
		return command.BuildPage(s.cursors, scope, items, limit, int(total), false, func(v StageView) stagePosition { return stagePosition{v.Position, v.ID.UUID} })
	})
}

func (s *Service) Transitions(ctx context.Context, actor command.Actor, input StageListInput) (command.Page[TransitionView], error) {
	limit, err := input.Page.Size()
	if err != nil {
		return command.Page[TransitionView]{}, err
	}
	scope, err := command.CursorScopeFor(command.ListWorkflowTransitions, actor.UserID, "id", struct {
		Project  command.ProjectID
		Workflow command.WorkflowID
		Retired  bool
	}{input.ProjectID, input.WorkflowID, input.IncludeRetired})
	if err != nil {
		return command.Page[TransitionView]{}, err
	}
	position := workflowPosition{}
	if input.Page.Cursor != nil {
		position, err = command.ReadCursor[workflowPosition](s.cursors, scope, *input.Page.Cursor)
		if err != nil {
			return command.Page[TransitionView]{}, err
		}
	}
	return command.Read(ctx, s.runner, actor, command.Access{Projects: []command.ProjectScope{{ProjectID: input.ProjectID}}}, func(ctx context.Context, m *command.Mutation) (command.Page[TransitionView], error) {
		if _, err := readWorkflow(ctx, m, input.ProjectID, input.WorkflowID); err != nil {
			return command.Page[TransitionView]{}, err
		}
		rows, err := m.Queries.ConfigurationTransitions(ctx, dbgen.ConfigurationTransitionsParams{
			WorkflowID:     input.WorkflowID.UUID,
			IncludeRetired: input.IncludeRetired,
			HasCursor:      input.Page.Cursor != nil,
			AfterID:        position.ID,
			PageSize:       int32(limit + 1),
		})
		if err != nil {
			return command.Page[TransitionView]{}, err
		}
		total, err := m.Queries.ConfigurationTransitionCount(ctx, dbgen.ConfigurationTransitionCountParams{
			WorkflowID: input.WorkflowID.UUID,
			Column2:    input.IncludeRetired,
		})
		if err != nil {
			return command.Page[TransitionView]{}, err
		}
		items := make([]TransitionView, 0, len(rows))
		for _, row := range rows {
			items = append(items, transitionView(row))
		}
		return command.BuildPage(s.cursors, scope, items, limit, int(total), false, func(v TransitionView) workflowPosition { return workflowPosition{v.ID.UUID} })
	})
}
func (s *Service) Bindings(ctx context.Context, actor command.Actor, input BindingListInput) (command.Page[BindingView], error) {
	limit, err := input.Page.Size()
	if err != nil {
		return command.Page[BindingView]{}, err
	}
	scope, err := command.CursorScopeFor(command.ListTypeWorkflowBindings, actor.UserID, "workflowId", struct {
		Project command.ProjectID
		Type    command.IssueTypeID
	}{input.ProjectID, input.TypeID})
	if err != nil {
		return command.Page[BindingView]{}, err
	}
	position := workflowPosition{}
	if input.Page.Cursor != nil {
		position, err = command.ReadCursor[workflowPosition](s.cursors, scope, *input.Page.Cursor)
		if err != nil {
			return command.Page[BindingView]{}, err
		}
	}
	return command.Read(ctx, s.runner, actor, command.Access{Projects: []command.ProjectScope{{ProjectID: input.ProjectID}}}, func(ctx context.Context, m *command.Mutation) (command.Page[BindingView], error) {
		if _, err := readType(ctx, m, input.ProjectID, input.TypeID); err != nil {
			return command.Page[BindingView]{}, err
		}
		rows, err := m.Queries.ConfigurationBindings(ctx, dbgen.ConfigurationBindingsParams{
			ProjectID: input.ProjectID.UUID,
			TypeID:    input.TypeID.UUID,
			HasCursor: input.Page.Cursor != nil,
			AfterID:   position.ID,
			PageSize:  int32(limit + 1),
		})
		if err != nil {
			return command.Page[BindingView]{}, err
		}
		total, err := m.Queries.ConfigurationBindingCount(ctx, dbgen.ConfigurationBindingCountParams{
			ProjectID: input.ProjectID.UUID,
			TypeID:    input.TypeID.UUID,
		})
		if err != nil {
			return command.Page[BindingView]{}, err
		}
		items := make([]BindingView, 0, len(rows))
		for _, row := range rows {
			items = append(items, BindingView{
				ProjectID:  command.ProjectID{UUID: row.ProjectID},
				TypeID:     command.IssueTypeID{UUID: row.TypeID},
				WorkflowID: command.WorkflowID{UUID: row.WorkflowID},
				Default:    row.IsDefault,
				AcceptsNew: row.AcceptsNew,
			})
		}
		return command.BuildPage(s.cursors, scope, items, limit, int(total), false, func(v BindingView) workflowPosition { return workflowPosition{v.WorkflowID.UUID} })
	})
}
