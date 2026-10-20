package activity

import (
	"context"
	"fmt"
	"regexp"
	"strings"
	"time"

	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

type ResourceIDKind struct{}
type ResourceID = command.ID[ResourceIDKind]
type ActivityView struct {
	ID            command.EventID          `json:"id"`
	Actor         command.IssueUserSummary `json:"actor"`
	Action        string                   `json:"action" minLength:"1" maxLength:"100"`
	Channel       command.Channel          `json:"channel" enum:"web,mcp"`
	ResourceKind  ResourceKind             `json:"resourceKind" minLength:"1" maxLength:"50"`
	ResourceID    ResourceID               `json:"resourceId"`
	ProjectID     *command.ProjectID       `json:"projectId" nullable:"true"`
	IssueID       *command.IssueID         `json:"issueId" nullable:"true"`
	ChangeSummary string                   `json:"changeSummary" maxLength:"10000"`
	IssueKey      *string                  `json:"issueKey" nullable:"true" maxLength:"32"`
	ProjectName   *string                  `json:"projectName" nullable:"true" maxLength:"100"`
	ResourceName  string                   `json:"resourceName" maxLength:"200"`
	ActionSummary string                   `json:"actionSummary" maxLength:"200"`
	CreatedAt     time.Time                `json:"createdAt"`
	Changes       []FieldChange            `json:"changes" nullable:"false"`
}
type ListInput struct {
	Page         command.PageRequest   `json:"page,omitempty"`
	ResourceKind *ResourceKind         `json:"resourceKind,omitempty" minLength:"1" maxLength:"50"`
	ResourceID   *ResourceID           `json:"resourceId,omitempty"`
	ProjectID    *command.ProjectID    `json:"projectId,omitempty"`
	IssueKey     *string               `json:"issueKey,omitempty" minLength:"3" maxLength:"32"`
	FromDate     *command.CalendarDate `json:"fromDate,omitempty"`
	ToDate       *command.CalendarDate `json:"toDate,omitempty"`
}
type Service struct {
	runner  command.Runner
	cursors *command.CursorSigner
}

func New(runner command.Runner, cursors *command.CursorSigner) *Service {
	return &Service{runner, cursors}
}

type filters struct {
	ResourceKind *ResourceKind         `json:"resourceKind,omitempty"`
	ResourceID   *ResourceID           `json:"resourceId,omitempty"`
	ProjectID    *command.ProjectID    `json:"projectId,omitempty"`
	IssueKey     *string               `json:"issueKey,omitempty"`
	FromDate     *command.CalendarDate `json:"fromDate,omitempty"`
	ToDate       *command.CalendarDate `json:"toDate,omitempty"`
}
type position struct {
	CreatedAt time.Time `json:"createdAt"`
	ID        uuid.UUID `json:"id"`
}

func (s *Service) List(ctx context.Context, actor command.Actor, in ListInput) (command.Page[ActivityView], error) {
	empty := command.Page[ActivityView]{}
	if (in.IssueKey != nil && !regexp.MustCompile(`(?i)^[a-z][a-z0-9]{1,9}-[1-9][0-9]*$`).MatchString(*in.IssueKey)) || (in.FromDate != nil && in.ToDate != nil && in.ToDate.Before(*in.FromDate)) {
		return empty, &command.Failure{
			Code:        command.Validation,
			Message:     "Enter a complete issue key and a valid date range.",
			FieldErrors: []command.FieldError{},
			NextAction:  command.ReviewFields,
		}
	}
	if (in.ResourceKind == nil) != (in.ResourceID == nil) || (in.ResourceKind != nil && command.ValidateText(string(*in.ResourceKind), 1, 50) != nil) || (in.ResourceID != nil && in.ResourceID.UUID == uuid.Nil) || (in.ProjectID != nil && in.ProjectID.UUID == uuid.Nil) {
		return empty, &command.Failure{
			Code:        command.Validation,
			Message:     "Supply a resource kind and identifier together, with valid identifiers.",
			FieldErrors: []command.FieldError{},
			NextAction:  command.ReviewFields,
		}
	}
	size, err := in.Page.Size()
	if err != nil {
		return empty, err
	}
	scope, err := command.CursorScopeFor(command.ListActivity, actor.UserID, "created_at DESC,id DESC", filters{
		in.ResourceKind,
		in.ResourceID,
		in.ProjectID,
		in.IssueKey,
		in.FromDate,
		in.ToDate,
	})
	if err != nil {
		return empty, err
	}
	after := position{}
	if in.Page.Cursor != nil {
		after, err = command.ReadCursor[position](s.cursors, scope, *in.Page.Cursor)
		if err != nil {
			return empty, err
		}
	}
	access := command.Access{AdministratorOnly: true, RepeatableRead: true}
	var resolve func(context.Context, *command.Mutation) ([]command.ProjectScope, error)
	if in.ResourceKind != nil && *in.ResourceKind == IssueResource && in.ResourceID != nil {
		access.AdministratorOnly = false
		resolve = func(ctx context.Context, m *command.Mutation) ([]command.ProjectScope, error) {
			if m.User.IsAdministrator {
				return nil, nil
			}
			issue, err := m.Queries.ReadIssue(ctx, in.ResourceID.UUID)
			if err != nil {
				return nil, &command.Failure{
					Code:        command.Unavailable,
					Message:     "The issue is unavailable.",
					FieldErrors: []command.FieldError{},
					NextAction:  command.None,
				}
			}
			if in.ProjectID != nil && in.ProjectID.UUID != issue.ProjectID {
				return nil, &command.Failure{
					Code:        command.Unavailable,
					Message:     "The issue is unavailable.",
					FieldErrors: []command.FieldError{},
					NextAction:  command.None,
				}
			}
			return []command.ProjectScope{{ProjectID: command.ProjectID{UUID: issue.ProjectID}}}, nil
		}
	}
	return command.ReadResolved(ctx, s.runner, actor, access, resolve, func(ctx context.Context, m *command.Mutation) (command.Page[ActivityView], error) {
		params := dbgen.ActivityCountParams{IssueKey: in.IssueKey}
		if in.FromDate != nil {
			value, _ := time.Parse("2006-01-02", in.FromDate.String())
			params.FromDate = pgtype.Date{Time: value, Valid: true}
		}
		if in.ToDate != nil {
			value, _ := time.Parse("2006-01-02", in.ToDate.String())
			params.ToDate = pgtype.Date{Time: value, Valid: true}
		}
		if in.ResourceKind != nil {
			v := string(*in.ResourceKind)
			params.ResourceKind = &v
		}
		if in.ResourceID != nil {
			params.ResourceID = &in.ResourceID.UUID
		}
		if in.ProjectID != nil {
			params.ProjectID = &in.ProjectID.UUID
		}
		count, err := m.Queries.ActivityCount(ctx, params)
		if err != nil {
			return empty, err
		}
		rows, err := m.Queries.ActivityList(ctx, dbgen.ActivityListParams{
			ResourceKind: params.ResourceKind,
			ResourceID:   params.ResourceID,
			ProjectID:    params.ProjectID,
			IssueKey:     params.IssueKey,
			FromDate:     params.FromDate,
			ToDate:       params.ToDate,
			HasCursor:    in.Page.Cursor != nil,
			AfterTime:    pgtype.Timestamptz{Time: after.CreatedAt, Valid: true},
			AfterID:      after.ID,
			PageSize:     int32(size + 1),
		})
		if err != nil {
			return empty, err
		}
		items := []ActivityView{}
		for _, row := range rows {
			fields, summary, err := projectChanges(row.PublicChanges)
			if err != nil {
				return empty, err
			}
			v := ActivityView{
				ID: command.EventID{UUID: row.ID},
				Actor: command.IssueUserSummary{
					ID:          command.UserID{UUID: row.ActorID},
					DisplayName: row.DisplayName,
				},
				Action:        row.Action,
				Channel:       command.Channel(row.Channel),
				ResourceKind:  ResourceKind(row.ResourceKind),
				ResourceID:    ResourceID{UUID: row.ResourceID},
				Changes:       fields,
				ChangeSummary: summary,
				CreatedAt:     row.CreatedAt.Time.UTC(),
			}
			if row.IssueKey != "" {
				v.IssueKey = &row.IssueKey
			}
			if row.ProjectName != "" {
				v.ProjectName = &row.ProjectName
			}
			v.ResourceName = row.ResourceName
			v.ActionSummary = actionSummary(row.Action)
			if row.Action == string(command.SaveAutomationRule) && v.ResourceKind == IssueResource {
				v.ActionSummary = "assigned the issue using an assignment rule"
			}
			if row.ProjectID != nil {
				v.ProjectID = &command.ProjectID{UUID: *row.ProjectID}
			}
			if row.IssueID != nil {
				v.IssueID = &command.IssueID{UUID: *row.IssueID}
			}
			items = append(items, v)
		}
		return command.BuildPage(s.cursors, scope, items, size, int(count), false, func(v ActivityView) position { return position{v.CreatedAt, v.ID.UUID} })
	})
}

// This read projection has a closed field vocabulary. Tokens, storage object
// names and future private fields cannot become public by adding an audit value.
var pictureField = regexp.MustCompile(`^pictures\.[0-9a-f-]{36}\.state$`)
var relatedField = regexp.MustCompile(`^(issues\.[0-9a-f-]+\.(?:[0-9a-f-]+\.)?(?:assigneeId|unfinishedBlockerCount|unfinishedChildren|blocks\.[0-9a-f-]+)|blockedBy\.[0-9a-f-]+|memberships\.[0-9a-f-]+\.(?:role|removed))$`)

func publicField(field string) bool {
	switch field {
	case "dueReminder", "backlogRank", "importedCount", "developmentLink", "automationRule", "planningKind", "planningStatus", "targetDate", "epicId", "releaseId", "inAppEnabled", "events", "emailMode", "dueReminders", "backlog", "watching", "revision", "key", "name", "description", "defaultBoardId", "email", "displayName", "active", "administrator", "title", "type", "priority", "status", "assigneeId", "dueDate", "labelIds", "parentId", "rank", "archived", "savedFilters", "wipLimits", "html", "safeHtml", "plainText", "mentionIds", "pictureIds", "version", "filename", "contentType", "byteSize", "detached", "commentId", "read", "readAt", "changedCount", "state", "inGallery", "mimeType", "attached", "descriptionFormat", "workflow":
		return true
	}
	return strings.HasPrefix(field, "links.") || relatedField.MatchString(field) || pictureField.MatchString(field)
}

func actionSummary(action string) string {
	switch command.Operation(action) {
	case "schedule_due_reminder":
		return "scheduled a due-date reminder"
	case command.CreateIssue:
		return "created an issue"
	case command.UpdateIssue:
		return "updated an issue"
	case command.MoveIssue:
		return "changed the issue stage"
	case command.ReorderIssue:
		return "reordered an issue"
	case command.OrganizeIssue:
		return "organized an issue"
	case command.CreateSubtask:
		return "created a subtask"
	case command.CreateComment:
		return "added a comment"
	case command.UpdateComment:
		return "edited a comment"
	case command.AddDependency:
		return "added a blocker"
	case command.RemoveDependency:
		return "removed a blocker"
	case command.SetIssueLink:
		return "changed related work"
	case command.SetIssueWatch:
		return "changed following"
	case command.CreateBoard:
		return "created a board"
	case command.UpdateBoard:
		return "updated a board or workflow"
	case command.ArchiveBoard:
		return "archived a board"
	case command.RestoreBoard:
		return "restored a board"
	case command.CreateProject:
		return "created a project"
	case command.UpdateProject:
		return "updated project settings"
	case command.ArchiveProject:
		return "archived a project"
	case command.RestoreProject:
		return "restored a project"
	case command.CreateLabel:
		return "created a label"
	case command.ApproveUser:
		return "approved an account"
	case command.UpdateUser:
		return "updated an account"
	case command.SetMembership:
		return "updated project access"
	case command.RemoveMembership:
		return "removed project access"
	case command.UploadPicture, command.UploadAttachment:
		return "attached a file"
	case command.DetachGalleryPicture, command.DetachAttachment:
		return "removed an attachment"
	case command.SaveIssueSearch:
		return "saved an issue search"
	case command.SetNotificationRead:
		return "changed an inbox update's read state"
	case command.MarkAllNotificationsRead:
		return "marked inbox updates as read"
	case command.UpdateNotificationPreferences:
		return "updated notification preferences"
	case command.CreatePlanningItem:
		return "created a planning item"
	case command.UpdatePlanningItem:
		return "updated a planning item"
	case command.SetIssuePlanning:
		return "changed the issue's epic or release"
	case command.ReorderBacklog:
		return "changed the backlog order"
	case command.ImportIssues:
		return "imported issues"
	case command.SaveDevelopmentLink:
		return "changed a development link"
	case command.SaveAutomationRule:
		return "updated a stage assignment rule"
	default:
		return strings.ReplaceAll(action, "_", " ")
	}
}

type projection struct {
	Version     int           `json:"version"`
	Fields      []FieldChange `json:"fields"`
	Abbreviated bool          `json:"abbreviated,omitempty"`
}

func projectChanges(data []byte) ([]FieldChange, string, error) {
	value, err := database.DecodeJSON[projection](data)
	if err != nil {
		return nil, "", err
	}
	if value.Version != 1 {
		return nil, "", fmt.Errorf("unsupported activity version")
	}
	fields := []FieldChange{}
	abbreviated := value.Abbreviated
	for _, field := range value.Fields {
		if !publicField(field.Field) {
			abbreviated = true
			continue
		}
		if len(fields) == 50 {
			abbreviated = true
			break
		}
		for _, text := range []**string{&field.Before, &field.After} {
			if *text == nil {
				continue
			}
			runes := []rune(**text)
			if len(runes) > 1024 {
				short := string(runes[:1024]) + "…"
				*text = &short
				abbreviated = true
			}
		}
		fields = append(fields, field)
	}
	names := []string{}
	for _, field := range fields {
		if len(names) == 8 {
			break
		}
		names = append(names, field.Field)
	}
	summary := strings.Join(names, ", ")
	if abbreviated {
		summary += " (abbreviated; full changes retained)"
	}
	return fields, summary, nil
}
