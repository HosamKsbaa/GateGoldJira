package configuration

import (
	"context"
	"errors"
	"strconv"
	"strings"

	"gategoldjira/backend/internal/features/activity"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func workflowView(row dbgen.Workflow) WorkflowView {
	return WorkflowView{
		ID:           command.WorkflowID{UUID: row.ID},
		ProjectID:    command.ProjectID{UUID: row.ProjectID},
		Name:         row.Name,
		Revision:     command.Revision(row.Revision),
		Retired:      row.Retired,
		LegacyBridge: row.LegacyDefault,
	}
}
func stageView(row dbgen.WorkflowStage) StageView {
	return StageView{
		ID:             command.StageID{UUID: row.ID},
		ProjectID:      command.ProjectID{UUID: row.ProjectID},
		WorkflowID:     command.WorkflowID{UUID: row.WorkflowID},
		Name:           row.Name,
		Category:       command.Status(row.Category),
		Position:       command.Position(row.Position),
		Initial:        row.IsInitial,
		AcceptsEntries: row.AcceptsEntries,
		Retired:        row.Retired,
	}
}
func transitionView(row dbgen.WorkflowTransition) TransitionView {
	var role *command.TransitionPermission
	if row.RequiredPermission != nil {
		value := command.TransitionPermission(*row.RequiredPermission)
		role = &value
	}
	return TransitionView{
		ID:                 command.TransitionID{UUID: row.ID},
		ProjectID:          command.ProjectID{UUID: row.ProjectID},
		WorkflowID:         command.WorkflowID{UUID: row.WorkflowID},
		FromStageID:        command.StageID{UUID: row.FromStageID},
		ToStageID:          command.StageID{UUID: row.ToStageID},
		RequiredPermission: command.Nullable[command.TransitionPermission]{Value: role},
		Retired:            row.Retired,
	}
}
func readWorkflow(ctx context.Context, m *command.Mutation, project command.ProjectID, id command.WorkflowID) (dbgen.Workflow, error) {
	row, err := m.Queries.ConfigurationWorkflow(ctx, id.UUID)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && row.ProjectID != project.UUID) {
		return row, unavailable()
	}
	return row, err
}
func readStage(ctx context.Context, m *command.Mutation, project command.ProjectID, id command.StageID) (dbgen.WorkflowStage, error) {
	row, err := m.Queries.ConfigurationStage(ctx, id.UUID)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && row.ProjectID != project.UUID) {
		return row, unavailable()
	}
	return row, err
}
func editableWorkflow(ctx context.Context, m *command.Mutation, project command.ProjectID, id command.WorkflowID) (dbgen.Workflow, error) {
	row, err := readWorkflow(ctx, m, project, id)
	if err != nil {
		return row, err
	}
	current, err := readView(ctx, m, project)
	if err != nil {
		return row, err
	}
	if row.LegacyDefault && current.Mode == Legacy {
		return row, validation("workflow", "Use the existing board editor while legacy issue access is active. Canonical editing requires modern issue access.")
	}
	return row, nil
}
func validateWorkflowSaved(out WorkflowSaved) error {
	if err := validateView(out.Configuration); err != nil {
		return err
	}
	if out.Workflow.ID.UUID == uuid.Nil || out.Workflow.ProjectID != out.Configuration.ProjectID || out.Workflow.Revision < 1 {
		return errors.New("invalid workflow result")
	}
	return command.ValidateText(out.Workflow.Name, 1, 100)
}
func validateStageSaved(out StageSaved) error {
	if err := validateView(out.Configuration); err != nil {
		return err
	}
	if out.Stage.ID.UUID == uuid.Nil || out.Stage.WorkflowID.UUID == uuid.Nil || out.Stage.ProjectID != out.Configuration.ProjectID || out.Stage.Position < 1 || !out.Stage.Category.Valid() || out.Stage.Category.Category() != out.Stage.Category {
		return errors.New("invalid stage result")
	}
	return command.ValidateText(out.Stage.Name, 1, 60)
}
func validateTransitionSaved(out TransitionSaved) error {
	if err := validateView(out.Configuration); err != nil {
		return err
	}
	edge := out.Transition
	if edge.RequiredPermission.Value != nil && !edge.RequiredPermission.Value.Valid() {
		return errors.New("invalid transition permission")
	}
	if edge.ID.UUID == uuid.Nil || edge.WorkflowID.UUID == uuid.Nil || edge.ProjectID != out.Configuration.ProjectID || edge.FromStageID.UUID == uuid.Nil || edge.ToStageID.UUID == uuid.Nil || edge.FromStageID == edge.ToStageID {
		return errors.New("invalid transition result")
	}
	return nil
}

func (s *Service) SaveWorkflow(ctx context.Context, actor command.Actor, input SaveWorkflowInput) (command.SaveOutcome[WorkflowSaved], error) {
	input.Name = strings.TrimSpace(input.Name)
	if input.WorkflowID.UUID == uuid.Nil || input.ExpectedRevision < 1 || command.ValidateText(input.Name, 1, 100) != nil {
		return command.SaveOutcome[WorkflowSaved]{}, validation("workflow", "Use an identifier, current configuration revision and a name of 1–100 characters.")
	}
	return command.Save(ctx, s.runner, request(actor, command.SaveWorkflow, input.ProjectID, input.RetryReference), input, func(ctx context.Context, m *command.Mutation) error {
		row, err := m.Queries.ConfigurationWorkflow(ctx, input.WorkflowID.UUID)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil
		}
		if err == nil && row.ProjectID != input.ProjectID.UUID {
			return unavailable()
		}
		return err
	}, func(ctx context.Context, m *command.Mutation, in SaveWorkflowInput) (command.Change[WorkflowSaved], error) {
		current, err := ensureRevision(ctx, m, in.ProjectID, in.ExpectedRevision)
		if err != nil {
			return command.Change[WorkflowSaved]{}, err
		}
		row, err := m.Queries.ConfigurationWorkflow(ctx, in.WorkflowID.UUID)
		created := errors.Is(err, pgx.ErrNoRows)
		before := ""
		if !created {
			if err != nil {
				return command.Change[WorkflowSaved]{}, err
			}
			if _, err = editableWorkflow(ctx, m, in.ProjectID, in.WorkflowID); err != nil {
				return command.Change[WorkflowSaved]{}, err
			}
			if row.Name == in.Name && row.Retired == in.Retired {
				return command.Change[WorkflowSaved]{Result: WorkflowSaved{current, workflowView(row)}, HTTPStatus: 200}, nil
			}
			before = row.Name + ";retired=" + strconv.FormatBool(row.Retired)
			if in.Retired {
				used, err := m.Queries.ConfigurationWorkflowDefaultUse(ctx, row.ID)
				if err != nil {
					return command.Change[WorkflowSaved]{}, err
				}
				if used {
					return command.Change[WorkflowSaved]{}, validation("retired", "Replace every creation-default binding before retiring this workflow.")
				}
				if err = m.Queries.ConfigurationCloseWorkflowBindings(ctx, row.ID); err != nil {
					return command.Change[WorkflowSaved]{}, err
				}
			}
			row, err = m.Queries.ConfigurationWorkflowUpdate(ctx, dbgen.ConfigurationWorkflowUpdateParams{
				ID:      row.ID,
				Name:    in.Name,
				Retired: in.Retired,
			})
		} else {
			if in.Retired {
				return command.Change[WorkflowSaved]{}, validation("retired", "Create an active workflow first.")
			}
			row, err = m.Queries.ConfigurationWorkflowInsert(ctx, dbgen.ConfigurationWorkflowInsertParams{
				ID:        in.WorkflowID.UUID,
				ProjectID: in.ProjectID.UUID,
				Name:      in.Name,
			})
		}
		if err != nil {
			return command.Change[WorkflowSaved]{}, uniqueError(err)
		}
		if err = validateFlowSafety(ctx, m, in.ProjectID, in.WorkflowID); err != nil {
			return command.Change[WorkflowSaved]{}, err
		}
		event, err := configurationEvent(ctx, m, command.SaveWorkflow, in.ProjectID, []activity.FieldChange{change("workflows."+row.ID.String(), before, row.Name+";retired="+strconv.FormatBool(row.Retired))})
		if err != nil {
			return command.Change[WorkflowSaved]{}, err
		}
		next, err := readView(ctx, m, in.ProjectID)
		return command.Change[WorkflowSaved]{
			Result:     WorkflowSaved{next, workflowView(row)},
			EventID:    event,
			HTTPStatus: 200,
		}, err
	}, validateWorkflowSaved)
}

// A workflow may be assembled before it is bound. Once it accepts new work or
// contains issues, edits must preserve an entry and a path to completion. Reverse
// traversal is O(stages + transitions), even for large custom workflows.
func validateFlowSafety(ctx context.Context, m *command.Mutation, project command.ProjectID, flow command.WorkflowID) error {
	return checkFlowSafety(ctx, m, project, flow, false)
}

func checkFlowSafety(ctx context.Context, m *command.Mutation, project command.ProjectID, flow command.WorkflowID, required bool) error {
	needed, err := m.Queries.ConfigurationFlowNeedsProgression(ctx, flow.UUID)
	if err != nil || (!needed && !required) {
		return err
	}
	stages, err := m.Queries.ConfigurationFlowStages(ctx, flow.UUID)
	if err != nil {
		return err
	}
	edges, err := m.Queries.ConfigurationFlowTransitions(ctx, flow.UUID)
	if err != nil {
		return err
	}
	reached := make(map[uuid.UUID]bool, len(stages))
	active := make(map[uuid.UUID]dbgen.WorkflowStage, len(stages))
	queue := []uuid.UUID{}
	initial := false
	for _, stage := range stages {
		if stage.Retired {
			continue
		}
		active[stage.ID] = stage
		if stage.IsInitial && stage.AcceptsEntries && stage.Category == "todo" {
			initial = true
		}
		if stage.Category == "done" {
			reached[stage.ID] = true
			queue = append(queue, stage.ID)
		}
	}
	if !initial {
		return validation("initial", "A workflow in use needs an open To do initial stage.")
	}
	reverse := map[uuid.UUID][]uuid.UUID{}
	for _, edge := range edges {
		target, ok := active[edge.ToStageID]
		if ok && target.AcceptsEntries {
			reverse[edge.ToStageID] = append(reverse[edge.ToStageID], edge.FromStageID)
		}
	}
	for len(queue) > 0 {
		target := queue[0]
		queue = queue[1:]
		for _, source := range reverse[target] {
			if !reached[source] {
				reached[source] = true
				queue = append(queue, source)
			}
		}
	}
	occupiedIDs, err := m.Queries.ConfigurationOccupiedStageIDs(ctx, flow.UUID)
	if err != nil {
		return err
	}
	occupied := map[uuid.UUID]bool{}
	for _, id := range occupiedIDs {
		occupied[id] = true
	}
	for _, stage := range active {
		if (stage.AcceptsEntries || stage.IsInitial || occupied[stage.ID]) && !reached[stage.ID] {
			return validation("transitions", "Keep a path from every retained stage to Done before removing this stage or move.")
		}
	}
	coverage, err := m.Queries.ConfigurationFlowNeedsCoverage(ctx, flow.UUID)
	if err != nil || (!coverage && !required) {
		return err
	}
	return validateStageCoverage(ctx, m, project, stages)
}

func validateStageCoverage(ctx context.Context, m *command.Mutation, project command.ProjectID, stages []dbgen.WorkflowStage) error {
	permission, err := m.ProjectPermissions(project)
	if err != nil {
		return err
	}
	if permission.ModernCore {
		mapped, err := m.Queries.ConfigurationDefaultBoardStageIDs(ctx, project.UUID)
		if err != nil {
			return err
		}
		if len(mapped) == 0 {
			return validation("workflow", "Map the default board before enabling new work.")
		}
		visible := map[uuid.UUID]bool{}
		for _, id := range mapped {
			visible[id] = true
		}
		occupied := map[uuid.UUID]bool{}
		if len(stages) > 0 {
			ids, err := m.Queries.ConfigurationOccupiedStageIDs(ctx, stages[0].WorkflowID)
			if err != nil {
				return err
			}
			for _, id := range ids {
				occupied[id] = true
			}
		}
		for _, stage := range stages {
			if !stage.Retired && (stage.AcceptsEntries || occupied[stage.ID]) && !visible[stage.ID] {
				return validation("workflow", "Map every open and occupied stage to the default board before enabling this workflow.")
			}
		}
		return nil
	}

	raw, err := m.Queries.ConfigurationDefaultBoardWorkflow(ctx, project.UUID)
	if errors.Is(err, pgx.ErrNoRows) {
		return validation("workflow", "Restore the default board and its stage mappings before enabling new work.")
	}
	if err != nil {
		return err
	}
	board, err := database.DecodeJSON[command.BoardWorkflow](raw)
	if err != nil {
		return err
	}
	occupied := map[uuid.UUID]bool{}
	if len(stages) > 0 {
		ids, err := m.Queries.ConfigurationOccupiedStageIDs(ctx, stages[0].WorkflowID)
		if err != nil {
			return err
		}
		for _, id := range ids {
			occupied[id] = true
		}
	}
	visible := map[string]bool{}
	for _, column := range board.Columns {
		visible[string(column.Status)] = true
	}
	for _, stage := range stages {
		if !stage.Retired && (stage.AcceptsEntries || occupied[stage.ID]) && !visible[stage.LegacyStatus] {
			return validation("workflow", "Map every open stage to the default board before enabling this workflow for new issues.")
		}
	}
	return nil
}
