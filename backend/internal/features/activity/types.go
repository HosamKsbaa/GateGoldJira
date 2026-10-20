package activity

import (
	"gategoldjira/backend/internal/platform/command"
	"time"
)

type ResourceKind string

const (
	UserResource         ResourceKind = "user"
	ProjectResource      ResourceKind = "project"
	IssueResource        ResourceKind = "issue"
	BoardResource        ResourceKind = "board"
	CommentResource      ResourceKind = "comment"
	PictureResource      ResourceKind = "picture"
	AttachmentResource   ResourceKind = "attachment"
	LabelResource        ResourceKind = "label"
	NotificationResource ResourceKind = "notification"
)

type FieldChange struct {
	Field  string  `json:"field" minLength:"1" maxLength:"200"`
	Before *string `json:"before"`
	After  *string `json:"after"`
}
type Changes struct {
	Version int           `json:"version"`
	Fields  []FieldChange `json:"fields"`
}
type Event struct {
	ID           command.EventID
	ActorID      command.UserID
	Channel      command.Channel
	Action       string
	ResourceKind ResourceKind
	ResourceID   string
	ProjectID    *command.ProjectID
	IssueID      *command.IssueID
	Changes      Changes
	CreatedAt    time.Time
}
