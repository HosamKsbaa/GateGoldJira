package issues

import (
	"gategoldjira/backend/internal/platform/command"
	"time"
)

type Issue struct {
	ID          command.IssueID
	ProjectID   command.ProjectID
	Number      int64
	Title       string
	Description string
	Type        command.IssueType
	Priority    command.Priority
	Status      command.Status
	ReporterID  command.UserID
	AssigneeID  *command.UserID
	DueDate     *command.CalendarDate
	ParentID    *command.IssueID
	Rank        int64
	Revision    command.Revision
	CreatedAt   time.Time
	UpdatedAt   time.Time
}
type Label struct {
	ID        command.LabelID
	ProjectID command.ProjectID
	Name      string
	NameKey   string
	CreatedBy command.UserID
	CreatedAt time.Time
}
type Dependency struct {
	ProjectID   command.ProjectID
	DependentID command.IssueID
	BlockerID   command.IssueID
	Revision    command.Revision
	CreatedBy   command.UserID
	CreatedAt   time.Time
	RemovedBy   *command.UserID
	RemovedAt   *time.Time
}
