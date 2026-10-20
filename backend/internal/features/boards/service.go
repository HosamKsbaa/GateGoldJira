package boards

import (
	"context"
	"encoding/json"
	"errors"
	"gategoldjira/backend/internal/features/activity"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"strings"
)

type SummaryReader func(dbgen.IssuesGetRow, command.CalendarDate) (command.IssueSummary, error)
type StageMover func(context.Context, *command.Mutation, command.ProjectID, command.Status, command.Status) error
type Service struct {
	modernSummaries ModernSummaryReader
	nativeMover     NativeMover
	stageMover      StageMover
	runner          command.Runner
	cursors         *command.CursorSigner
	summary         SummaryReader
}

func New(runner command.Runner, cursors *command.CursorSigner, summary SummaryReader) *Service {
	return &Service{runner: runner, cursors: cursors, summary: summary}
}
func (s *Service) WithStageMover(move StageMover) { s.stageMover = move }
func validation(field, message string) error {
	return &command.Failure{
		Code:        command.Validation,
		Message:     message,
		FieldErrors: []command.FieldError{{Field: field, Message: message}},
		NextAction:  command.ReviewFields,
	}
}
func unavailable() error {
	return &command.Failure{
		Code:        command.Unavailable,
		Message:     "The board is unavailable.",
		FieldErrors: []command.FieldError{},
		NextAction:  command.None,
	}
}
func forbidden(message string) error {
	return &command.Failure{
		Code:        command.Forbidden,
		Message:     message,
		FieldErrors: []command.FieldError{},
		NextAction:  command.None,
	}
}
func normalizeName(name string) (string, error) {
	name = strings.TrimSpace(name)
	if command.ValidateText(name, 1, 100) != nil {
		return "", validation("name", "Board names must contain 1–100 characters.")
	}
	return name, nil
}
func normalizeFilter(project command.ProjectID, filter command.IssueFilter) (command.IssueFilter, error) {
	filter, err := command.NormalizeIssueFilter(filter)
	if err != nil {
		return filter, validation("filters", err.Error())
	}
	if filter.ProjectIDs != nil && (len(filter.ProjectIDs) != 1 || filter.ProjectIDs[0] != project) {
		return filter, validation("projectIds", "A board can filter only its own project.")
	}
	filter.ProjectIDs = nil
	if filter.Assignee != nil && filter.Assignee.Mode == command.AssigneeAny {
		filter.Assignee = nil
	}
	return filter, nil
}
func validateLimits(limits Limits) error {
	for _, limit := range []*int32{limits.InProgress, limits.Review} {
		if limit != nil && (*limit < 1 || *limit > 1000) {
			return validation("wipLimits", "Leave limits unset or use 1–1000.")
		}
	}
	return nil
}
func boardScopes(id command.BoardID, write bool) func(context.Context, *command.Mutation) ([]command.ProjectScope, error) {
	return func(ctx context.Context, m *command.Mutation) ([]command.ProjectScope, error) {
		row, err := m.Queries.ReadBoard(ctx, id.UUID)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, unavailable()
		}
		if err != nil {
			return nil, err
		}
		return []command.ProjectScope{{ProjectID: command.ProjectID{UUID: row.ProjectID}, Write: write}}, nil
	}
}
func describe(ctx context.Context, m *command.Mutation, row dbgen.BoardsGetRow) (BoardSummary, error) {
	b := row.Board
	filters, err := database.DecodeBoardFilters(b.SavedFilters, b.FiltersVersion)
	if err != nil {
		return BoardSummary{}, err
	}
	permissions, err := m.ProjectPermissions(command.ProjectID{UUID: b.ProjectID})
	if err != nil {
		return BoardSummary{}, err
	}
	var workflow *command.BoardWorkflow
	if !permissions.ModernCore {
		workflow, err = decodeWorkflow(b.Workflow)
		if err != nil {
			return BoardSummary{}, err
		}
	}
	manage := permissions.CanWrite && (permissions.CanConfigure || (!b.IsDefault && b.CreatedBy == m.User.ID))
	return BoardSummary{
		ID:        command.BoardID{UUID: b.ID},
		ProjectID: command.ProjectID{UUID: b.ProjectID},
		Name:      b.Name,
		Creator: command.IssueUserSummary{
			ID:          command.UserID{UUID: b.CreatedBy},
			DisplayName: row.CreatorName,
		},
		Default:      b.IsDefault,
		SavedFilters: filters,
		WipLimits: Limits{
			InProgress: b.InProgressLimit,
			Review:     b.ReviewLimit,
		},
		Archived:  b.ArchivedAt.Valid,
		Revision:  command.Revision(b.Revision),
		CanManage: manage,
		Workflow:  workflow,
	}, nil
}
func readBoard(ctx context.Context, m *command.Mutation, id command.BoardID) (BoardSummary, error) {
	row, err := m.Queries.BoardsGet(ctx, id.UUID)
	if errors.Is(err, pgx.ErrNoRows) {
		return BoardSummary{}, unavailable()
	}
	if err != nil {
		return BoardSummary{}, err
	}
	return describe(ctx, m, row)
}
func validateBoard(v BoardSummary) error {
	if v.ID.UUID == uuid.Nil || v.ProjectID.UUID == uuid.Nil || v.Creator.ID.UUID == uuid.Nil || v.Revision < 1 || command.ValidateText(v.Name, 1, 100) != nil {
		return errors.New("invalid board result")
	}
	if err := v.SavedFilters.Validate(); err != nil {
		return err
	}
	if _, err := normalizeWorkflow(boardWorkflow(v)); err != nil {
		return err
	}
	return validateLimits(v.WipLimits)
}
func validateView(v BoardView) error {
	if v.Board.ID.UUID == uuid.Nil || v.Board.ProjectID.UUID == uuid.Nil || v.Board.Creator.ID.UUID == uuid.Nil || v.Board.Revision < 1 || len(v.Columns) < 2 || command.ValidateText(v.Board.Name, 1, 100) != nil {
		return errors.New("invalid board result")
	}
	if err := v.Board.SavedFilters.Validate(); err != nil {
		return err
	}
	if err := validateLimits(v.Board.WipLimits); err != nil {
		return err
	}
	for _, c := range v.Columns {
		if !c.Status.Valid() || c.OrderRevision < 1 || c.SavedMatchCount < 0 || c.VisibleMatchCount < 0 {
			return errors.New("invalid column result")
		}
	}
	return nil
}
func (s *Service) view(ctx context.Context, m *command.Mutation, id command.BoardID, temp command.IssueFilter) (BoardView, error) {
	board, err := readBoard(ctx, m, id)
	if err != nil {
		return BoardView{}, err
	}
	temp, err = normalizeFilter(board.ProjectID, temp)
	if err != nil {
		return BoardView{}, err
	}
	params := countsParams(board.ProjectID, board.SavedFilters, temp, m.Actor)
	rows, err := m.Queries.BoardsCounts(ctx, params)
	if err != nil {
		return BoardView{}, err
	}
	columns := []ColumnSummary{}
	for _, row := range rows {
		status := command.Status(row.Status)
		var limit *int32
		if status.Category() == command.InProgress {
			limit = board.WipLimits.InProgress
		}
		if status.Category() == command.Review {
			limit = board.WipLimits.Review
		}
		for _, configured := range boardWorkflow(board).Columns {
			if configured.Status == status && configured.WarningLimit != nil {
				limit = configured.WarningLimit
				if *limit == 0 {
					limit = nil
				}
			}
		}
		columns = append(columns, ColumnSummary{
			Status:            status,
			SavedMatchCount:   row.SavedCount,
			VisibleMatchCount: row.VisibleCount,
			WarningLimit:      limit,
			LimitExceeded:     limit != nil && row.SavedCount > *limit,
			OrderRevision:     command.Revision(row.Revision),
		})
	}
	ordered := []ColumnSummary{}
	for _, configured := range boardWorkflow(board).Columns {
		for _, column := range columns {
			if column.Status == configured.Status {
				ordered = append(ordered, column)
				break
			}
		}
	}
	result := BoardView{Board: board, Columns: ordered, CompanyToday: m.Actor.Today}
	return result, validateView(result)
}
func (s *Service) Get(ctx context.Context, actor command.Actor, input GetInput) (BoardView, error) {
	return command.ReadResolved(ctx, s.runner, actor, command.Access{RepeatableRead: true}, boardScopes(input.BoardID, false), func(ctx context.Context, m *command.Mutation) (BoardView, error) {
		if err := requireLegacyBoard(ctx, m, input.BoardID); err != nil {
			return BoardView{}, err
		}
		return s.view(ctx, m, input.BoardID, input.TemporaryFilters)
	})
}
func (s *Service) Access() command.BoardAccess {
	return command.BoardAccess{
		Transition: s.checkTransition,
		Check: func(ctx context.Context, m *command.Mutation, project command.ProjectID, id command.BoardID, expected command.Revision) error {
			board, err := readBoard(ctx, m, id)
			if err != nil {
				return err
			}
			if board.ProjectID != project {
				return unavailable()
			}
			if board.Archived {
				return forbidden("Restore the source board before moving its cards.")
			}
			if expected > 0 && board.Revision != expected {
				return boardConflict(board)
			}
			return nil
		},
		View: func(ctx context.Context, m *command.Mutation, id command.BoardID) (BoardView, error) {
			return s.view(ctx, m, id, command.IssueFilter{})
		},
	}
}
func boardEvent(ctx context.Context, m *command.Mutation, op command.Operation, board BoardSummary, changes []activity.FieldChange) (*string, error) {
	project := board.ProjectID
	event, err := activity.Append(ctx, m, activity.Draft{
		Action:       op,
		ResourceKind: activity.BoardResource,
		ResourceID:   board.ID.UUID,
		ProjectID:    &project,
		Changes:      changes,
	})
	if err != nil {
		return nil, err
	}
	id := event.ID.String()
	return &id, nil
}
func databaseWriteError(err error) error {
	var postgres *pgconn.PgError
	if errors.As(err, &postgres) && postgres.Code == "23505" {
		return validation("name", "A board already uses this name in the project.")
	}
	return err
}

type createCommand struct {
	ProjectID command.ProjectID   `json:"projectId"`
	Name      string              `json:"name"`
	Filters   command.IssueFilter `json:"filters"`
}

func (s *Service) Create(ctx context.Context, actor command.Actor, input CreateInput) (command.SaveOutcome[BoardSummary], error) {
	name, err := normalizeName(input.Name)
	if err != nil {
		return command.SaveOutcome[BoardSummary]{}, err
	}
	filter, err := normalizeFilter(input.ProjectID, input.SavedFilters)
	if err != nil {
		return command.SaveOutcome[BoardSummary]{}, err
	}
	request := command.MutationRequest{
		Actor:          actor,
		Operation:      command.CreateBoard,
		RetryReference: input.RetryReference,
		Access:         command.Access{Projects: []command.ProjectScope{{ProjectID: input.ProjectID, Write: true}}},
	}
	return command.Save(ctx, s.runner, request, createCommand{input.ProjectID, name, filter}, func(context.Context, *command.Mutation) error { return nil }, func(ctx context.Context, m *command.Mutation, args createCommand) (command.Change[BoardSummary], error) {
		permission, err := m.ProjectPermissions(args.ProjectID)
		if err != nil {
			return command.Change[BoardSummary]{}, err
		}
		if permission.ModernCore {
			return command.Change[BoardSummary]{}, validation("clientVersion", "Use the version 2 board creation contract for this project.")
		}
		id := command.NewID[command.BoardKind]()
		filters, err := json.Marshal(args.Filters)
		if err != nil {
			return command.Change[BoardSummary]{}, err
		}
		if _, err := m.Queries.BoardsInsert(ctx, dbgen.BoardsInsertParams{
			ID:           id.UUID,
			ProjectID:    args.ProjectID.UUID,
			Name:         args.Name,
			NameKey:      strings.ToLower(args.Name),
			CreatedBy:    m.User.ID,
			SavedFilters: filters,
		}); err != nil {
			return command.Change[BoardSummary]{}, databaseWriteError(err)
		}
		view, err := readBoard(ctx, m, id)
		if err != nil {
			return command.Change[BoardSummary]{}, err
		}
		text := string(filters)
		event, err := boardEvent(ctx, m, command.CreateBoard, view, []activity.FieldChange{
			{Field: "name", After: &args.Name},
			{Field: "savedFilters", After: &text},
		})
		return command.Change[BoardSummary]{Result: view, EventID: event, HTTPStatus: 201}, err
	}, validateBoard)
}

type updateCommand struct {
	RetireStages     []command.StageRetirement `json:"retireStages,omitempty"`
	ID               command.BoardID           `json:"id"`
	ExpectedRevision command.Revision          `json:"expectedRevision"`
	Name             string                    `json:"name"`
	Filters          command.IssueFilter       `json:"filters"`
	Limits           Limits                    `json:"limits"`
	Workflow         *command.BoardWorkflow    `json:"workflow,omitempty"`
}

func (s *Service) Update(ctx context.Context, actor command.Actor, input UpdateInput) (command.SaveOutcome[BoardSummary], error) {
	name, err := normalizeName(input.Name)
	if err != nil {
		return command.SaveOutcome[BoardSummary]{}, err
	}
	if input.ExpectedRevision < 1 {
		return command.SaveOutcome[BoardSummary]{}, validation("expectedRevision", "Read the current board before saving.")
	}
	if err := validateLimits(input.WipLimits); err != nil {
		return command.SaveOutcome[BoardSummary]{}, err
	}
	if len(input.RetireStages) > 0 && input.Workflow == nil {
		return command.SaveOutcome[BoardSummary]{}, validation("workflow", "Send the replacement workflow when retiring stages.")
	}
	if input.Workflow != nil {
		normalized, err := normalizeWorkflow(*input.Workflow)
		if err != nil {
			return command.SaveOutcome[BoardSummary]{}, err
		}
		input.Workflow = &normalized
	}
	filters, err := command.NormalizeIssueFilter(input.SavedFilters)
	if err != nil {
		return command.SaveOutcome[BoardSummary]{}, validation("filters", err.Error())
	}
	request := command.MutationRequest{
		Actor:           actor,
		Operation:       command.UpdateBoard,
		RetryReference:  input.RetryReference,
		ResolveProjects: boardScopes(input.BoardID, true),
	}
	return command.Save(ctx, s.runner, request, updateCommand{
		ID:               input.BoardID,
		ExpectedRevision: input.ExpectedRevision,
		Name:             name,
		Filters:          filters,
		Limits:           input.WipLimits,
		Workflow:         input.Workflow,
		RetireStages:     input.RetireStages,
	}, func(ctx context.Context, m *command.Mutation) error {
		b, err := readBoard(ctx, m, input.BoardID)
		if err != nil {
			return err
		}
		if !b.CanManage {
			return forbidden("Only the currently eligible creator or an Administrator can manage this board.")
		}
		if b.Archived {
			return forbidden("Restore the board before changing its settings.")
		}
		return nil
	}, func(ctx context.Context, m *command.Mutation, args updateCommand) (command.Change[BoardSummary], error) {
		if err := requireLegacyBoard(ctx, m, args.ID); err != nil {
			return command.Change[BoardSummary]{}, err
		}
		board, err := readBoard(ctx, m, args.ID)
		if err != nil {
			return command.Change[BoardSummary]{}, err
		}
		if board.Revision != args.ExpectedRevision {
			return command.Change[BoardSummary]{}, boardConflict(board)
		}
		args.Filters, err = normalizeFilter(board.ProjectID, args.Filters)
		if err != nil {
			return command.Change[BoardSummary]{}, err
		}
		args.Filters = remapStageFilters(args.Filters, args.RetireStages)
		newFilters, _ := json.Marshal(args.Filters)
		if board.Default && (args.Name != "All Issues" || string(newFilters) != "{}") {
			return command.Change[BoardSummary]{}, validation("savedFilters", "The default All Issues board keeps its name and unrestricted view.")
		}
		changes := []activity.FieldChange{}
		add := func(field, before, after string) {
			if before != after {
				changes = append(changes, activity.FieldChange{Field: field, Before: &before, After: &after})
			}
		}
		oldFilters, _ := json.Marshal(board.SavedFilters)
		oldLimits, _ := json.Marshal(board.WipLimits)
		newLimits, _ := json.Marshal(args.Limits)
		add("name", board.Name, args.Name)
		add("savedFilters", string(oldFilters), string(newFilters))
		add("wipLimits", string(oldLimits), string(newLimits))
		workflow := boardWorkflow(board)
		if args.Workflow != nil {
			workflow = *args.Workflow
		}
		oldWorkflow, _ := json.Marshal(boardWorkflow(board))
		newWorkflow, _ := json.Marshal(workflow)
		add("workflow", string(oldWorkflow), string(newWorkflow))
		// An explicit save reconciles legacy boards even when this board already
		// has the requested rules. Old clients omitting workflow do not reconcile.
		if args.Workflow != nil && len(changes) == 0 {
			rows, readErr := m.Queries.BoardsProjectWorkflows(ctx, board.ProjectID.UUID)
			if readErr != nil {
				return command.Change[BoardSummary]{}, readErr
			}
			for _, row := range rows {
				existing, err := decodeWorkflow(row.Workflow)
				if err != nil {
					return command.Change[BoardSummary]{}, err
				}
				canonical, _ := json.Marshal(existing)
				if string(canonical) != string(newWorkflow) {
					before, after := "board-specific rules", "shared project workflow"
					changes = append(changes, activity.FieldChange{Field: "workflow", Before: &before, After: &after})
					break
				}
			}
		}
		if len(changes) == 0 && len(args.RetireStages) == 0 {
			view, err := readBoard(ctx, m, args.ID)
			return command.Change[BoardSummary]{Result: view, HTTPStatus: 200}, err
		}
		if args.Workflow != nil {
			if err := s.expandStages(ctx, m, board, workflow, args.RetireStages); err != nil {
				return command.Change[BoardSummary]{}, err
			}
		}
		if _, err := m.Queries.BoardsUpdate(ctx, dbgen.BoardsUpdateParams{
			ID:              args.ID.UUID,
			Name:            args.Name,
			NameKey:         strings.ToLower(args.Name),
			SavedFilters:    newFilters,
			InProgressLimit: args.Limits.InProgress,
			ReviewLimit:     args.Limits.Review,
			Workflow:        newWorkflow,
		}); err != nil {
			return command.Change[BoardSummary]{}, databaseWriteError(err)
		}
		view, err := readBoard(ctx, m, args.ID)
		if err != nil {
			return command.Change[BoardSummary]{}, err
		}
		event, err := boardEvent(ctx, m, command.UpdateBoard, view, changes)
		return command.Change[BoardSummary]{Result: view, EventID: event, HTTPStatus: 200}, err
	}, validateBoard)
}
func (s *Service) Archive(ctx context.Context, actor command.Actor, input RevisionInput) (command.SaveOutcome[BoardSummary], error) {
	return s.setArchive(ctx, actor, input, true)
}
func (s *Service) Restore(ctx context.Context, actor command.Actor, input RevisionInput) (command.SaveOutcome[BoardSummary], error) {
	return s.setArchive(ctx, actor, input, false)
}

type archiveCommand struct {
	ID       command.BoardID  `json:"id"`
	Revision command.Revision `json:"revision"`
	Archived bool             `json:"archived"`
}

func (s *Service) setArchive(ctx context.Context, actor command.Actor, input RevisionInput, archived bool) (command.SaveOutcome[BoardSummary], error) {
	if input.ExpectedRevision < 1 {
		return command.SaveOutcome[BoardSummary]{}, validation("expectedRevision", "Read the current board before saving.")
	}
	op := command.ArchiveBoard
	if !archived {
		op = command.RestoreBoard
	}
	request := command.MutationRequest{
		Actor:           actor,
		Operation:       op,
		RetryReference:  input.RetryReference,
		ResolveProjects: boardScopes(input.BoardID, true),
	}
	return command.Save(ctx, s.runner, request, archiveCommand{
		input.BoardID,
		input.ExpectedRevision,
		archived,
	}, func(ctx context.Context, m *command.Mutation) error {
		b, err := readBoard(ctx, m, input.BoardID)
		if err != nil {
			return err
		}
		if !b.CanManage {
			return forbidden("Only the currently eligible creator or an Administrator can manage this board.")
		}
		if b.Default {
			return forbidden("The default All Issues board cannot be archived.")
		}
		return nil
	}, func(ctx context.Context, m *command.Mutation, args archiveCommand) (command.Change[BoardSummary], error) {
		b, err := readBoard(ctx, m, args.ID)
		if err != nil {
			return command.Change[BoardSummary]{}, err
		}
		if b.Revision != args.Revision {
			return command.Change[BoardSummary]{}, boardConflict(b)
		}
		if b.Archived == args.Archived {
			v, err := readBoard(ctx, m, args.ID)
			return command.Change[BoardSummary]{Result: v, HTTPStatus: 200}, err
		}
		if _, err := m.Queries.BoardsSetArchive(ctx, dbgen.BoardsSetArchiveParams{ID: args.ID.UUID, Archived: args.Archived}); err != nil {
			return command.Change[BoardSummary]{}, err
		}
		v, err := readBoard(ctx, m, args.ID)
		if err != nil {
			return command.Change[BoardSummary]{}, err
		}
		before, after := "false", "true"
		if !args.Archived {
			before, after = after, before
		}
		event, err := boardEvent(ctx, m, op, v, []activity.FieldChange{{Field: "archived", Before: &before, After: &after}})
		return command.Change[BoardSummary]{Result: v, EventID: event, HTTPStatus: 200}, err
	}, validateBoard)
}

func requireLegacyBoard(ctx context.Context, m *command.Mutation, id command.BoardID) error {
	row, err := m.Queries.ReadBoard(ctx, id.UUID)
	if err != nil {
		return unavailable()
	}
	permission, err := m.ProjectPermissions(command.ProjectID{UUID: row.ProjectID})
	if err != nil {
		return err
	}
	if permission.ModernCore {
		return validation("clientVersion", "Use the version 2 board layout and identifier-based card operations for this project.")
	}
	return nil
}
