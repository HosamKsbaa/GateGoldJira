package projects

import (
	"context"
	"errors"
	"regexp"
	"strconv"
	"strings"

	"gategoldjira/backend/internal/features/activity"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
)

type Service struct {
	runner  command.Runner
	cursors *command.CursorSigner
}

func New(runner command.Runner, cursors *command.CursorSigner) *Service {
	return &Service{runner: runner, cursors: cursors}
}

var keyPattern = regexp.MustCompile(`^[A-Z][A-Z0-9]{1,9}$`)

func normalizeText(name, description string) (string, error) {
	name = strings.TrimSpace(name)
	if command.ValidateText(name, 1, 100) != nil {
		return "", validation("name", "Project names must contain 1–100 characters.")
	}
	if command.ValidateText(description, 0, 2000) != nil {
		return "", validation("description", "Descriptions may contain up to 2000 characters.")
	}
	return name, nil
}
func viewProject(row dbgen.Project, role EffectiveRole) ProjectView {
	return ProjectView{
		ID:            command.ProjectID{UUID: row.ID},
		Key:           row.Key,
		Name:          row.Name,
		Description:   row.Description,
		Archived:      row.ArchivedAt.Valid,
		Revision:      command.Revision(row.Revision),
		CreatedAt:     row.CreatedAt.Time,
		UpdatedAt:     row.UpdatedAt.Time,
		EffectiveRole: role,
	}
}
func validateView(view ProjectView) error {
	if view.ID.UUID == uuid.Nil || !keyPattern.MatchString(view.Key) || view.Revision < 1 || view.CreatedAt.IsZero() || view.UpdatedAt.IsZero() || (view.EffectiveRole != Administrator && view.EffectiveRole != ProjectAdmin && view.EffectiveRole != Member && view.EffectiveRole != Viewer) {
		return errors.New("invalid project result")
	}
	_, err := normalizeText(view.Name, view.Description)
	return err
}
func projectRequest(actor command.Actor, operation command.Operation, id command.ProjectID, reference string, allowArchived bool) command.MutationRequest {
	access := command.Access{
		AdministratorOnly: true,
		Projects: []command.ProjectScope{{
			ProjectID:     id,
			Write:         true,
			AllowArchived: allowArchived,
		}},
	}
	if operation == command.UpdateProject {
		access.AdministratorOnly = false
		access.Projects[0].Configure = true
	}
	return command.MutationRequest{Actor: actor, Operation: operation, RetryReference: reference, Access: access}
}
func projectEvent(ctx context.Context, mutation *command.Mutation, operation command.Operation, project command.ProjectID, fields []activity.FieldChange) (*string, error) {
	event, err := activity.Append(ctx, mutation, activity.Draft{
		Action:       operation,
		ResourceKind: activity.ProjectResource,
		ResourceID:   project.UUID,
		ProjectID:    &project,
		Changes:      fields,
	})
	if err != nil {
		return nil, err
	}
	id := event.ID.String()
	return &id, nil
}
func field(name, before, after string) activity.FieldChange {
	return activity.FieldChange{Field: name, Before: &before, After: &after}
}

func (service *Service) Create(ctx context.Context, actor command.Actor, input CreateInput) (command.SaveOutcome[ProjectView], error) {
	key := strings.ToUpper(strings.TrimSpace(input.Key))
	if !keyPattern.MatchString(key) {
		return command.SaveOutcome[ProjectView]{}, validation("key", "Use 2–10 letters/digits starting with a letter.")
	}
	name, err := normalizeText(input.Name, input.Description)
	if err != nil {
		return command.SaveOutcome[ProjectView]{}, err
	}
	args := CreateFields{Key: key, Name: name, Description: input.Description}
	request := command.MutationRequest{
		Actor:          actor,
		Operation:      command.CreateProject,
		RetryReference: input.RetryReference,
		Access:         command.Access{AdministratorOnly: true},
	}
	return command.Save(ctx, service.runner, request, args, func(context.Context, *command.Mutation) error { return nil }, func(ctx context.Context, mutation *command.Mutation, args CreateFields) (command.Change[ProjectView], error) {
		id := command.NewID[command.ProjectKind]()
		boardID := command.NewID[command.BoardKind]()
		row, err := mutation.Queries.ProjectsInsert(ctx, dbgen.ProjectsInsertParams{
			ID:          id.UUID,
			Key:         args.Key,
			Name:        args.Name,
			Description: args.Description,
			CreatedBy:   mutation.Actor.UserID.UUID,
		})
		if err != nil {
			var postgres *pgconn.PgError
			if errors.As(err, &postgres) && postgres.Code == "23505" {
				return command.Change[ProjectView]{}, validation("key", "A project already uses this key.")
			}
			return command.Change[ProjectView]{}, err
		}
		if err := mutation.Queries.ProjectsDefaultBoard(ctx, dbgen.ProjectsDefaultBoardParams{
			ID:        boardID.UUID,
			ProjectID: id.UUID,
			CreatedBy: mutation.Actor.UserID.UUID,
		}); err != nil {
			return command.Change[ProjectView]{}, err
		}
		if err := mutation.Queries.ProjectsInitialOrders(ctx, id.UUID); err != nil {
			return command.Change[ProjectView]{}, err
		}
		board := boardID.String()
		fields := []activity.FieldChange{
			{Field: "key", After: &args.Key},
			{Field: "name", After: &args.Name},
			{
				Field: "description",
				After: &args.Description,
			},
			{Field: "defaultBoardId", After: &board},
		}
		event, err := projectEvent(ctx, mutation, command.CreateProject, id, fields)
		if err != nil {
			return command.Change[ProjectView]{}, err
		}
		return command.Change[ProjectView]{Result: viewProject(row, Administrator), EventID: event, HTTPStatus: 201}, nil
	}, validateView)
}

type updateCommand struct {
	ProjectID command.ProjectID `json:"projectId"`
	Fields    UpdateFields      `json:"fields"`
}

func (service *Service) Update(ctx context.Context, actor command.Actor, input UpdateInput) (command.SaveOutcome[ProjectView], error) {
	name, err := normalizeText(input.Name, input.Description)
	if err != nil {
		return command.SaveOutcome[ProjectView]{}, err
	}
	if input.ExpectedRevision < 1 {
		return command.SaveOutcome[ProjectView]{}, validation("expectedRevision", "Read the current project revision before saving.")
	}
	args := updateCommand{input.ProjectID, UpdateFields{input.ExpectedRevision, name, input.Description}}
	return command.Save(ctx, service.runner, projectRequest(actor, command.UpdateProject, input.ProjectID, input.RetryReference, false), args, func(context.Context, *command.Mutation) error { return nil }, func(ctx context.Context, mutation *command.Mutation, args updateCommand) (command.Change[ProjectView], error) {
		row, err := mutation.Queries.ReadProject(ctx, args.ProjectID.UUID)
		if err != nil {
			return command.Change[ProjectView]{}, err
		}
		role := Administrator
		if !mutation.User.IsAdministrator {
			role = ProjectAdmin
		}
		view := viewProject(row, role)
		if view.Revision != args.Fields.ExpectedRevision {
			return command.Change[ProjectView]{}, conflict(view)
		}
		fields := []activity.FieldChange{}
		if row.Name != args.Fields.Name {
			fields = append(fields, field("name", row.Name, args.Fields.Name))
		}
		if row.Description != args.Fields.Description {
			fields = append(fields, field("description", row.Description, args.Fields.Description))
		}
		if len(fields) == 0 {
			return command.Change[ProjectView]{Result: view, HTTPStatus: 200}, nil
		}
		row, err = mutation.Queries.ProjectsUpdate(ctx, dbgen.ProjectsUpdateParams{
			ID:          args.ProjectID.UUID,
			Name:        args.Fields.Name,
			Description: args.Fields.Description,
		})
		if err != nil {
			return command.Change[ProjectView]{}, err
		}
		event, err := projectEvent(ctx, mutation, command.UpdateProject, args.ProjectID, fields)
		if err != nil {
			return command.Change[ProjectView]{}, err
		}
		return command.Change[ProjectView]{Result: viewProject(row, role), EventID: event, HTTPStatus: 200}, nil
	}, validateView)
}
func (service *Service) Archive(ctx context.Context, actor command.Actor, input RevisionInput) (command.SaveOutcome[ProjectView], error) {
	return service.setArchived(ctx, actor, input, true)
}
func (service *Service) Restore(ctx context.Context, actor command.Actor, input RevisionInput) (command.SaveOutcome[ProjectView], error) {
	return service.setArchived(ctx, actor, input, false)
}

type archiveCommand struct {
	ProjectID        command.ProjectID `json:"projectId"`
	ExpectedRevision command.Revision  `json:"expectedRevision"`
	Archived         bool              `json:"archived"`
}

func (service *Service) setArchived(ctx context.Context, actor command.Actor, input RevisionInput, archived bool) (command.SaveOutcome[ProjectView], error) {
	if input.ExpectedRevision < 1 {
		return command.SaveOutcome[ProjectView]{}, validation("expectedRevision", "Read the current project revision before saving.")
	}
	operation := command.ArchiveProject
	if !archived {
		operation = command.RestoreProject
	}
	args := archiveCommand{input.ProjectID, input.ExpectedRevision, archived}
	return command.Save(ctx, service.runner, projectRequest(actor, operation, input.ProjectID, input.RetryReference, true), args, func(context.Context, *command.Mutation) error { return nil }, func(ctx context.Context, mutation *command.Mutation, args archiveCommand) (command.Change[ProjectView], error) {
		row, err := mutation.Queries.ReadProject(ctx, args.ProjectID.UUID)
		if err != nil {
			return command.Change[ProjectView]{}, err
		}
		view := viewProject(row, Administrator)
		if view.Revision != args.ExpectedRevision {
			return command.Change[ProjectView]{}, conflict(view)
		}
		if view.Archived == args.Archived {
			return command.Change[ProjectView]{Result: view, HTTPStatus: 200}, nil
		}
		row, err = mutation.Queries.ProjectsSetArchive(ctx, dbgen.ProjectsSetArchiveParams{
			ID:       args.ProjectID.UUID,
			Archived: args.Archived,
		})
		if err != nil {
			return command.Change[ProjectView]{}, err
		}
		event, err := projectEvent(ctx, mutation, operation, args.ProjectID, []activity.FieldChange{field("archived", strconv.FormatBool(view.Archived), strconv.FormatBool(args.Archived))})
		if err != nil {
			return command.Change[ProjectView]{}, err
		}
		return command.Change[ProjectView]{Result: viewProject(row, Administrator), EventID: event, HTTPStatus: 200}, nil
	}, validateView)
}
