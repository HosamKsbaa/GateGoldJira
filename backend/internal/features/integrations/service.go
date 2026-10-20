package integrations

import (
	"context"
	"errors"
	"gategoldjira/backend/internal/features/activity"
	"gategoldjira/backend/internal/features/notifications"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"net/url"
	"strconv"
	"strings"
	"unicode"
)

type Service struct {
	runner  command.Runner
	cursors *command.CursorSigner
}

func New(runner command.Runner, cursors *command.CursorSigner) *Service {
	return &Service{runner, cursors}
}
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
		Message:     "This integration record is unavailable.",
		FieldErrors: []command.FieldError{},
		NextAction:  command.None,
	}
}
func conflict() error {
	return &command.Failure{
		Code:        command.Conflict,
		Message:     "This record changed. Reload its current values before saving.",
		FieldErrors: []command.FieldError{},
		NextAction:  command.ReloadCurrentState,
	}
}
func noAuth(context.Context, *command.Mutation) error { return nil }
func scopes(id command.IssueID, write bool) func(context.Context, *command.Mutation) ([]command.ProjectScope, error) {
	return func(ctx context.Context, m *command.Mutation) ([]command.ProjectScope, error) {
		row, err := m.Queries.ReadIssue(ctx, id.UUID)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, unavailable()
		}
		if err != nil {
			return nil, err
		}
		return []command.ProjectScope{{ProjectID: command.ProjectID{UUID: row.ProjectID}, Write: write}}, nil
	}
}
func linkView(row dbgen.DevelopmentLink) DevelopmentLinkView {
	return DevelopmentLinkView{
		LinkID{UUID: row.ID},
		command.IssueID{UUID: row.IssueID},
		row.Url,
		row.Title,
		LinkKind(row.Kind),
		command.Revision(row.Revision),
		row.Removed,
		row.CreatedAt.Time,
		row.UpdatedAt.Time,
	}
}
func normalizeLink(fields DevelopmentLinkFields) (DevelopmentLinkFields, error) {
	fields.URL = strings.TrimSpace(fields.URL)
	fields.Title = strings.TrimSpace(fields.Title)
	if command.ValidateText(fields.Title, 1, 200) != nil {
		return fields, validation("title", "Use a title of 1–200 characters.")
	}
	parsed, err := url.Parse(fields.URL)
	if err != nil || command.ValidateText(fields.URL, 1, 2000) != nil || parsed == nil || parsed.Hostname() == "" || (parsed.Scheme != "https" && parsed.Scheme != "http") || parsed.User != nil || strings.IndexFunc(fields.URL, unicode.IsControl) >= 0 {
		return fields, validation("url", "Use an HTTP or HTTPS URL without credentials.")
	}
	if fields.Kind != PullRequest && fields.Kind != Commit && fields.Kind != Other {
		return fields, validation("kind", "Choose pull request, commit or other.")
	}
	if fields.ExpectedRevision < 0 {
		return fields, validation("expectedRevision", "Read the current revision or use zero for a new link.")
	}
	return fields, nil
}
func validateLink(view DevelopmentLinkView) error {
	if view.ID.UUID == uuid.Nil || view.IssueID.UUID == uuid.Nil || view.Revision < 1 || view.CreatedAt.IsZero() {
		return errors.New("invalid development link")
	}
	_, err := normalizeLink(DevelopmentLinkFields{URL: view.URL, Title: view.Title, Kind: view.Kind})
	return err
}
func (s *Service) SaveLink(ctx context.Context, actor command.Actor, in DevelopmentLinkInput) (command.SaveOutcome[DevelopmentLinkView], error) {
	fields, err := normalizeLink(in.DevelopmentLinkFields)
	if err != nil {
		return command.SaveOutcome[DevelopmentLinkView]{}, err
	}
	in.DevelopmentLinkFields = fields
	if in.LinkID.UUID == uuid.Nil {
		return command.SaveOutcome[DevelopmentLinkView]{}, validation("linkId", "Use a nonzero UUID for this link.")
	}
	request := command.MutationRequest{
		Actor:           actor,
		Operation:       command.SaveDevelopmentLink,
		RetryReference:  in.RetryReference,
		ResolveProjects: scopes(in.IssueID, true),
	}
	return command.Save(ctx, s.runner, request, in, func(ctx context.Context, m *command.Mutation) error {
		row, err := m.Queries.IntegrationLinkGet(ctx, in.LinkID.UUID)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil
		}
		if err != nil {
			return err
		}
		if row.IssueID != in.IssueID.UUID {
			return unavailable()
		}
		return nil
	}, func(ctx context.Context, m *command.Mutation, in DevelopmentLinkInput) (command.Change[DevelopmentLinkView], error) {
		issue, err := m.Queries.ReadIssue(ctx, in.IssueID.UUID)
		if err != nil {
			return command.Change[DevelopmentLinkView]{}, err
		}
		if issue.Archived {
			return command.Change[DevelopmentLinkView]{}, validation("issueId", "Restore this issue before changing its links.")
		}
		old, err := m.Queries.IntegrationLinkGet(ctx, in.LinkID.UUID)
		isNew := errors.Is(err, pgx.ErrNoRows)
		if err != nil && !isNew {
			return command.Change[DevelopmentLinkView]{}, err
		}
		revision := command.InitialRevision(0)
		if !isNew {
			revision = command.InitialRevision(old.Revision)
		}
		if revision != in.ExpectedRevision {
			return command.Change[DevelopmentLinkView]{}, conflict()
		}
		if isNew && in.Removed {
			return command.Change[DevelopmentLinkView]{}, validation("removed", "A new link must be visible.")
		}
		if !isNew && old.Url == in.URL && old.Title == in.Title && old.Kind == string(in.Kind) && old.Removed == in.Removed {
			return command.Change[DevelopmentLinkView]{Result: linkView(old), HTTPStatus: 200}, nil
		}
		var row dbgen.DevelopmentLink
		if isNew {
			row, err = m.Queries.IntegrationLinkInsert(ctx, dbgen.IntegrationLinkInsertParams{
				ID:        in.LinkID.UUID,
				IssueID:   in.IssueID.UUID,
				Url:       in.URL,
				Title:     in.Title,
				Kind:      string(in.Kind),
				CreatedBy: actor.UserID.UUID,
			})
		} else {
			row, err = m.Queries.IntegrationLinkUpdate(ctx, dbgen.IntegrationLinkUpdateParams{
				ID:      in.LinkID.UUID,
				Url:     in.URL,
				Title:   in.Title,
				Kind:    string(in.Kind),
				Removed: in.Removed,
			})
		}
		if err != nil {
			return command.Change[DevelopmentLinkView]{}, err
		}
		project := command.ProjectID{UUID: issue.ProjectID}
		before := ""
		if !isNew {
			before = old.Url + " | " + old.Title + " | " + old.Kind + " | " + strconv.FormatBool(old.Removed)
		}
		after := row.Url + " | " + row.Title + " | " + row.Kind + " | " + strconv.FormatBool(row.Removed)
		event, err := activity.Append(ctx, m, activity.Draft{
			Action:       command.SaveDevelopmentLink,
			ResourceKind: activity.IssueResource,
			ResourceID:   in.IssueID.UUID,
			ProjectID:    &project,
			IssueID:      &in.IssueID,
			Changes: []activity.FieldChange{{
				Field:  "links." + in.LinkID.String(),
				Before: &before,
				After:  &after,
			}},
		})
		if err != nil {
			return command.Change[DevelopmentLinkView]{}, err
		}
		id := event.ID.String()
		status := 200
		if isNew {
			status = 201
		}
		return command.Change[DevelopmentLinkView]{Result: linkView(row), EventID: &id, HTTPStatus: status}, nil
	}, validateLink)
}
func ruleView(row dbgen.IntegrationRuleGetRow) AutomationRuleView {
	var stage *command.StageID
	if row.StageID != nil {
		id := command.StageID{UUID: *row.StageID}
		stage = &id
	}
	return AutomationRuleView{
		StageID:   stage,
		ID:        RuleID{UUID: row.ID},
		ProjectID: command.ProjectID{UUID: row.ProjectID},
		Name:      row.Name,
		Stage:     command.Status(row.Stage),
		Assignee: command.IssueUserSummary{
			ID:          command.UserID{UUID: row.AssigneeID},
			DisplayName: row.DisplayName,
		},
		Enabled:   row.Enabled,
		Revision:  command.Revision(row.Revision),
		CreatedAt: row.CreatedAt.Time,
		UpdatedAt: row.UpdatedAt.Time,
	}
}
func validateRule(view AutomationRuleView) error {
	if view.ID.UUID == uuid.Nil || view.ProjectID.UUID == uuid.Nil || view.Assignee.ID.UUID == uuid.Nil || view.Revision < 1 || !view.Stage.Valid() || command.ValidateText(view.Name, 1, 100) != nil {
		return errors.New("invalid automation rule")
	}
	return nil
}
func (s *Service) SaveRule(ctx context.Context, actor command.Actor, in AutomationRuleInput) (command.SaveOutcome[AutomationRuleView], error) {
	in.Name = strings.TrimSpace(in.Name)
	if in.RuleID.UUID == uuid.Nil || in.ExpectedRevision < 0 || in.AssigneeID.UUID == uuid.Nil || (in.StageID == nil && !in.Stage.Valid()) || (in.StageID != nil && in.StageID.UUID == uuid.Nil) || command.ValidateText(in.Name, 1, 100) != nil {
		return command.SaveOutcome[AutomationRuleView]{}, validation("name", "Supply a name, valid stage, assignee, rule UUID and current revision.")
	}
	request := command.MutationRequest{
		Actor:          actor,
		Operation:      command.SaveAutomationRule,
		RetryReference: in.RetryReference,
		Access: command.Access{
			AdministratorOnly: true,
			Projects:          []command.ProjectScope{{ProjectID: in.ProjectID, Write: true}},
		},
	}
	return command.Save(ctx, s.runner, request, in, func(ctx context.Context, m *command.Mutation) error {
		row, err := m.Queries.IntegrationRuleGet(ctx, in.RuleID.UUID)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil
		}
		if err != nil {
			return err
		}
		if row.ProjectID != in.ProjectID.UUID {
			return unavailable()
		}
		return nil
	}, func(ctx context.Context, m *command.Mutation, in AutomationRuleInput) (command.Change[AutomationRuleView], error) {
		if in.StageID != nil {
			stage, err := m.Queries.IntegrationStageForID(ctx, dbgen.IntegrationStageForIDParams{
				ProjectID: in.ProjectID.UUID,
				ID:        in.StageID.UUID,
			})
			if errors.Is(err, pgx.ErrNoRows) {
				return command.Change[AutomationRuleView]{}, unavailable()
			}
			if err != nil {
				return command.Change[AutomationRuleView]{}, err
			}
			if in.Stage != "" && in.Stage != command.Status(stage) {
				return command.Change[AutomationRuleView]{}, validation("stageId", "Use one matching stage identity.")
			}
			in.Stage = command.Status(stage)
		}
		old, err := m.Queries.IntegrationRuleGet(ctx, in.RuleID.UUID)
		isNew := errors.Is(err, pgx.ErrNoRows)
		if err != nil && !isNew {
			return command.Change[AutomationRuleView]{}, err
		}
		revision := command.InitialRevision(0)
		if !isNew {
			revision = command.InitialRevision(old.Revision)
		}
		if revision != in.ExpectedRevision {
			return command.Change[AutomationRuleView]{}, conflict()
		}
		if in.Enabled {
			exists, err := m.Queries.IntegrationStageExists(ctx, dbgen.IntegrationStageExistsParams{
				ProjectID: in.ProjectID.UUID,
				Stage:     string(in.Stage),
			})
			if err != nil {
				return command.Change[AutomationRuleView]{}, err
			}
			if !exists {
				return command.Change[AutomationRuleView]{}, validation("stage", "Choose a current project stage.")
			}
			eligible, err := m.Queries.IssuesAssigneeEligible(ctx, dbgen.IssuesAssigneeEligibleParams{
				ProjectID: in.ProjectID.UUID,
				ID:        in.AssigneeID.UUID,
			})
			if err != nil {
				return command.Change[AutomationRuleView]{}, err
			}
			if !eligible {
				return command.Change[AutomationRuleView]{}, validation("assigneeId", "Choose an active project member or administrator.")
			}
		}
		if !isNew && old.Name == in.Name && old.Stage == string(in.Stage) && old.AssigneeID == in.AssigneeID.UUID && old.Enabled == in.Enabled {
			return command.Change[AutomationRuleView]{Result: ruleView(old), HTTPStatus: 200}, nil
		}
		if isNew {
			err = m.Queries.IntegrationRuleInsert(ctx, dbgen.IntegrationRuleInsertParams{
				ID:         in.RuleID.UUID,
				ProjectID:  in.ProjectID.UUID,
				Name:       in.Name,
				Stage:      string(in.Stage),
				AssigneeID: in.AssigneeID.UUID,
				Enabled:    in.Enabled,
				CreatedBy:  actor.UserID.UUID,
			})
		} else {
			err = m.Queries.IntegrationRuleUpdate(ctx, dbgen.IntegrationRuleUpdateParams{
				ID:         in.RuleID.UUID,
				Name:       in.Name,
				Stage:      string(in.Stage),
				AssigneeID: in.AssigneeID.UUID,
				Enabled:    in.Enabled,
			})
		}
		if err != nil {
			var postgres *pgconn.PgError
			if errors.As(err, &postgres) && postgres.Code == "23505" {
				return command.Change[AutomationRuleView]{}, validation("stage", "Only one enabled assignment rule is allowed per stage.")
			}
			return command.Change[AutomationRuleView]{}, err
		}
		row, err := m.Queries.IntegrationRuleGet(ctx, in.RuleID.UUID)
		if err != nil {
			return command.Change[AutomationRuleView]{}, err
		}
		before := ""
		if !isNew {
			before = old.Name + " | " + old.Stage + " | " + old.AssigneeID.String() + " | " + strconv.FormatBool(old.Enabled)
		}
		after := in.Name + " | " + string(in.Stage) + " | " + in.AssigneeID.String() + " | " + strconv.FormatBool(in.Enabled)
		event, err := activity.Append(ctx, m, activity.Draft{
			Action:       command.SaveAutomationRule,
			ResourceKind: activity.ProjectResource,
			ResourceID:   in.ProjectID.UUID,
			ProjectID:    &in.ProjectID,
			Changes: []activity.FieldChange{{
				Field:  "workflow",
				Before: &before,
				After:  &after,
			}},
		})
		if err != nil {
			return command.Change[AutomationRuleView]{}, err
		}
		id := event.ID.String()
		status := 200
		if isNew {
			status = 201
		}
		return command.Change[AutomationRuleView]{Result: ruleView(row), EventID: &id, HTTPStatus: status}, nil
	}, validateRule)
}

// ApplyStageRule joins the existing issue-move transaction and never opens a nested command.
// Revoked users and retired stages make a rule inert. Completion/transition guards run before this hook.
func ApplyStageRule(ctx context.Context, m *command.Mutation, project command.ProjectID, issueID command.IssueID, target command.Status) error {
	if err := m.RequireProjectWrite(project); err != nil {
		return err
	}
	rule, err := m.Queries.IntegrationStageRule(ctx, dbgen.IntegrationStageRuleParams{
		ProjectID: project.UUID,
		Stage:     string(target),
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	issue, err := m.Queries.ReadIssue(ctx, issueID.UUID)
	if err != nil {
		return err
	}
	if issue.ProjectID != project.UUID || issue.Status != string(target) {
		return errors.New("stage rule scope mismatch")
	}
	if issue.AssigneeID != nil && *issue.AssigneeID == rule.AssigneeID {
		return nil
	}
	if err := m.Queries.IntegrationAssignIssue(ctx, dbgen.IntegrationAssignIssueParams{
		IssueID:    issueID.UUID,
		AssigneeID: &rule.AssigneeID,
	}); err != nil {
		return err
	}
	before := ""
	if issue.AssigneeID != nil {
		before = issue.AssigneeID.String()
	}
	after := rule.AssigneeID.String()
	matchedRule := rule.ID.String() + " | " + rule.Name
	event, err := activity.Append(ctx, m, activity.Draft{
		Action:       command.SaveAutomationRule,
		ResourceKind: activity.IssueResource,
		ResourceID:   issueID.UUID,
		ProjectID:    &project,
		IssueID:      &issueID,
		Changes: []activity.FieldChange{
			{
				Field:  "assigneeId",
				Before: &before,
				After:  &after,
			},
			{
				Field: "automationRule",
				After: &matchedRule,
			},
		},
	})
	if err != nil {
		return err
	}
	assignee := command.UserID{UUID: rule.AssigneeID}
	p, err := m.Queries.ReadProject(ctx, project.UUID)
	if err != nil {
		return err
	}
	return notifications.Write(ctx, m, event.ID, []notifications.Fact{{
		ProjectID:  project,
		IssueID:    issueID,
		ReporterID: command.UserID{UUID: issue.ReporterID},
		AssigneeID: &assignee,
		Effect:     notifications.NewAssignment,
		Summary:    p.Key + "-" + strconv.FormatInt(issue.Number, 10) + ": " + issue.Title,
	}})
}
