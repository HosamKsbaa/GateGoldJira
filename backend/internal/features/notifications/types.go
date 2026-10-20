package notifications

import (
	"gategoldjira/backend/internal/platform/command"
	"time"
)

type Reason string

const (
	Watching           Reason = "watching"
	Comment            Reason = "comment"
	Mention            Reason = "mention"
	Assignment         Reason = "assignment"
	Status             Reason = "status"
	DueDate            Reason = "due_date"
	DependencyBlocked  Reason = "dependency_blocked"
	DependencyResolved Reason = "dependency_resolved"
	SubtaskCreated     Reason = "subtask_created"
	SubtasksCompleted  Reason = "subtasks_completed"
)

type Notification struct {
	ID          command.NotificationID
	RecipientID command.UserID
	EventID     command.EventID
	ProjectID   command.ProjectID
	IssueID     command.IssueID
	ActorID     command.UserID
	Reasons     []Reason
	Summary     string
	CreatedAt   time.Time
	ReadAt      *time.Time
	Revision    command.Revision
}
