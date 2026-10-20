package issues

import "gategoldjira/backend/internal/platform/command"

type IssueUserSummary = command.IssueUserSummary
type LabelView = command.LabelView
type ParentRef = command.ParentRef
type SubtaskProgress = command.SubtaskProgress
type ColumnOrder = command.ColumnOrder
type Capability = command.Capability
type IssueSummary = command.IssueSummary
type IssueView = command.IssueView

const (
	Read               = command.IssueRead
	Edit               = command.IssueEdit
	Move               = command.IssueMove
	Comment            = command.IssueComment
	UploadPicture      = command.IssueUploadPicture
	AddSubtask         = command.IssueAddSubtask
	ManageDependencies = command.IssueManageDependencies
)

type CreateIssueFields struct {
	Backlog           bool                      `json:"backlog,omitempty"`
	ImportSourceKey   string                    `json:"importSourceKey,omitempty" maxLength:"200"`
	InitialStatus     command.Status            `json:"initialStatus,omitempty"`
	DescriptionFormat command.DescriptionFormat `json:"descriptionFormat,omitempty"`
	Title             string                    `json:"title" minLength:"1" maxLength:"200"`
	Description       string                    `json:"description,omitempty" maxLength:"10000"`
	Type              command.IssueType         `json:"type,omitempty" enum:"task,bug"`
	Priority          command.Priority          `json:"priority,omitempty" enum:"low,medium,high"`
	AssigneeID        *command.UserID           `json:"assigneeId,omitempty" nullable:"true"`
	DueDate           *command.CalendarDate     `json:"dueDate,omitempty" nullable:"true"`
	LabelIDs          []command.LabelID         `json:"labelIds,omitempty" nullable:"false" maxItems:"10" uniqueItems:"true"`
}
type CreateInput struct {
	ProjectID command.ProjectID `json:"projectId"`
	CreateIssueFields
	RetryReference string `json:"retryReference" format:"uuid"`
}
type IssueEditable struct {
	DescriptionFormat command.DescriptionFormat `json:"descriptionFormat,omitempty"`
	Title             string                    `json:"title" minLength:"1" maxLength:"200"`
	Description       string                    `json:"description" maxLength:"10000"`
	Type              command.IssueType         `json:"type" enum:"task,bug,subtask"`
	Priority          command.Priority          `json:"priority" enum:"low,medium,high"`
	AssigneeID        *command.UserID           `json:"assigneeId" nullable:"true"`
	DueDate           *command.CalendarDate     `json:"dueDate" nullable:"true"`
	LabelIDs          []command.LabelID         `json:"labelIds" nullable:"false" maxItems:"10" uniqueItems:"true"`
}
type UpdateIssueFields struct {
	ExpectedRevision command.Revision `json:"expectedRevision"`
	Editable         IssueEditable    `json:"editable"`
}
type UpdateInput struct {
	IssueID          command.IssueID  `json:"issueId"`
	ExpectedRevision command.Revision `json:"expectedRevision"`
	Editable         IssueEditable    `json:"editable"`
	RetryReference   string           `json:"retryReference" format:"uuid"`
}
type SearchInput struct {
	Filters command.IssueFilter `json:"filters"`
	Page    command.PageRequest `json:"page,omitempty"`
}
