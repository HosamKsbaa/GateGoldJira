package issues

import "gategoldjira/backend/internal/platform/command"

// Omitted creation choices resolve under the project guard and are recorded in
// the accepted result. Replay keeps that result even if defaults later change.
type ModernCreateFields struct {
	ImportSourceKey        string                    `json:"importSourceKey,omitempty" maxLength:"200"`
	FieldValues            []command.FieldAssignment `json:"fieldValues,omitempty" nullable:"false" maxItems:"100"`
	Title                  string                    `json:"title" minLength:"1" maxLength:"200"`
	Description            string                    `json:"description,omitempty" maxLength:"10000"`
	DescriptionFormat      command.DescriptionFormat `json:"descriptionFormat,omitempty"`
	TypeID                 *command.IssueTypeID      `json:"typeId,omitempty"`
	PriorityID             *command.PriorityID       `json:"priorityId,omitempty"`
	WorkflowID             *command.WorkflowID       `json:"workflowId,omitempty"`
	StageID                *command.StageID          `json:"stageId,omitempty"`
	ParentID               *command.IssueID          `json:"parentId,omitempty"`
	ExpectedParentRevision *command.Revision         `json:"expectedParentRevision,omitempty"`
	AssigneeID             *command.UserID           `json:"assigneeId,omitempty" nullable:"true"`
	DueDate                *command.CalendarDate     `json:"dueDate,omitempty" nullable:"true"`
	LabelIDs               []command.LabelID         `json:"labelIds,omitempty" nullable:"false" maxItems:"10" uniqueItems:"true"`
	Backlog                bool                      `json:"backlog,omitempty"`
}
type ModernCreateInput struct {
	ProjectID command.ProjectID `json:"projectId"`
	ModernCreateFields
	RetryReference string `json:"retryReference" format:"uuid"`
}
type ModernEditable struct {
	Title             string                    `json:"title" minLength:"1" maxLength:"200"`
	Description       string                    `json:"description" maxLength:"10000"`
	DescriptionFormat command.DescriptionFormat `json:"descriptionFormat"`
	TypeID            command.IssueTypeID       `json:"typeId"`
	PriorityID        command.PriorityID        `json:"priorityId"`
	AssigneeID        *command.UserID           `json:"assigneeId" nullable:"true"`
	DueDate           *command.CalendarDate     `json:"dueDate" nullable:"true"`
	LabelIDs          []command.LabelID         `json:"labelIds" nullable:"false" maxItems:"10" uniqueItems:"true"`
}
type ModernUpdateFields struct {
	ExpectedRevision command.Revision `json:"expectedRevision"`
	Editable         ModernEditable   `json:"editable"`
}
type ModernUpdateInput struct {
	IssueID command.IssueID `json:"issueId"`
	ModernUpdateFields
	RetryReference string `json:"retryReference" format:"uuid"`
}
type ModernMoveFields struct {
	ExpectedRevision command.Revision `json:"expectedRevision"`
	TargetStageID    command.StageID  `json:"targetStageId"`
}
type ModernMoveInput struct {
	IssueID command.IssueID `json:"issueId"`
	ModernMoveFields
	RetryReference string `json:"retryReference" format:"uuid"`
}
type ModernGetInput struct {
	IssueID command.IssueID `json:"issueId"`
}
