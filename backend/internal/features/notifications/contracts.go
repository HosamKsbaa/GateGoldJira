package notifications

import (
	"gategoldjira/backend/internal/platform/command"
	"github.com/danielgtaylor/huma/v2"
	"time"
)

type NotificationView struct {
	ID        command.NotificationID   `json:"id"`
	IssueID   command.IssueID          `json:"issueId"`
	IssueKey  string                   `json:"issueKey" minLength:"1" maxLength:"32"`
	ProjectID command.ProjectID        `json:"projectId"`
	Actor     command.IssueUserSummary `json:"actor"`
	Reasons   []Reason                 `json:"reasons" nullable:"false" minItems:"1" maxItems:"10" uniqueItems:"true"`
	Summary   string                   `json:"summary" maxLength:"10000"`
	CreatedAt time.Time                `json:"createdAt"`
	ReadAt    *time.Time               `json:"readAt" nullable:"true"`
	Revision  command.Revision         `json:"revision"`
}
type InboxSummary struct {
	UnreadCount  int32                `json:"unreadCount" minimum:"0"`
	CompanyToday command.CalendarDate `json:"companyToday"`
}
type MarkAllResult struct {
	ChangedCount int32        `json:"changedCount" minimum:"0"`
	Inbox        InboxSummary `json:"inbox"`
}
type ListInput struct {
	Page       command.PageRequest `json:"page,omitempty"`
	UnreadOnly bool                `json:"unreadOnly,omitempty"`
}
type GetInput struct {
	NotificationID command.NotificationID `json:"notificationId"`
}
type SetReadFields struct {
	ExpectedRevision command.Revision `json:"expectedRevision"`
	Read             bool             `json:"read"`
}
type SetReadInput struct {
	NotificationID command.NotificationID `json:"notificationId"`
	SetReadFields
	RetryReference string `json:"retryReference" format:"uuid"`
}
type MarkAllInput struct {
	RetryReference string `json:"retryReference" format:"uuid"`
}

type EmailMode string

const (
	EmailOff     EmailMode = "off"
	EmailInstant EmailMode = "instant"
	EmailDaily   EmailMode = "daily"
)

type NotificationPreferencesFields struct {
	InAppEnabled bool      `json:"inAppEnabled"`
	Events       []Reason  `json:"events" nullable:"false" maxItems:"10" uniqueItems:"true"`
	EmailMode    EmailMode `json:"emailMode" enum:"off,instant,daily"`
	DueReminders bool      `json:"dueReminders"`
}
type NotificationPreferencesView struct {
	NotificationPreferencesFields
	Revision               command.Revision `json:"revision"`
	EmailDeliveryAvailable bool             `json:"emailDeliveryAvailable"`
}
type UpdateNotificationPreferencesFields struct {
	NotificationPreferencesFields
	ExpectedRevision command.Revision `json:"expectedRevision"`
}
type UpdateNotificationPreferencesInput struct {
	UpdateNotificationPreferencesFields
	RetryReference string `json:"retryReference" format:"uuid"`
}

func (Reason) Schema(huma.Registry) *huma.Schema {
	return &huma.Schema{
		Type: "string",
		Enum: []any{
			string(Watching),
			string(Comment),
			string(Mention),
			string(Assignment),
			string(Status),
			string(DueDate),
			string(DependencyBlocked),
			string(DependencyResolved),
			string(SubtaskCreated),
			string(SubtasksCompleted),
		},
	}
}
