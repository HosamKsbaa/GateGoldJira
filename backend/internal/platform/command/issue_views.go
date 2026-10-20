package command

import (
	"github.com/danielgtaylor/huma/v2"
	"time"
)

type IssueUserSummary struct {
	ID          UserID `json:"id"`
	DisplayName string `json:"displayName" minLength:"1" maxLength:"100"`
}
type LabelView struct {
	ID        LabelID   `json:"id"`
	ProjectID ProjectID `json:"projectId"`
	Name      string    `json:"name" minLength:"1" maxLength:"40"`
}
type ParentRef struct {
	ID  IssueID `json:"id"`
	Key string  `json:"key" minLength:"1" maxLength:"32"`
}
type SubtaskProgress struct {
	Total int32 `json:"total" minimum:"0"`
	Done  int32 `json:"done" minimum:"0"`
}
type ColumnOrder struct {
	Status   Status   `json:"status"`
	Revision Revision `json:"revision"`
}
type Capability string

const (
	IssueRead               Capability = "read"
	IssueEdit               Capability = "edit"
	IssueMove               Capability = "move"
	IssueComment            Capability = "comment"
	IssueUploadPicture      Capability = "upload_picture"
	IssueAddSubtask         Capability = "add_subtask"
	IssueManageDependencies Capability = "manage_dependencies"
)

type IssueSummary struct {
	Archived               bool                       `json:"archived,omitempty"`
	Backlog                bool                       `json:"backlog,omitempty"`
	StatusName             string                     `json:"statusName,omitempty" maxLength:"60"`
	ID                     IssueID                    `json:"id"`
	ProjectID              ProjectID                  `json:"projectId"`
	Key                    string                     `json:"key" minLength:"1" maxLength:"32"`
	Number                 Revision                   `json:"number"`
	Title                  string                     `json:"title" minLength:"1" maxLength:"200"`
	Type                   IssueType                  `json:"type" enum:"task,bug,subtask"`
	Priority               Priority                   `json:"priority" enum:"low,medium,high"`
	Status                 Status                     `json:"status"`
	Assignee               Nullable[IssueUserSummary] `json:"assignee"`
	DueDate                *CalendarDate              `json:"dueDate" nullable:"true"`
	Overdue                bool                       `json:"overdue"`
	Labels                 []LabelView                `json:"labels" nullable:"false" maxItems:"10"`
	Blocked                bool                       `json:"blocked"`
	UnfinishedBlockerCount int32                      `json:"unfinishedBlockerCount" minimum:"0"`
	Parent                 Nullable[ParentRef]        `json:"parent"`
	SubtaskProgress        SubtaskProgress            `json:"subtaskProgress"`
	Revision               Revision                   `json:"revision"`
	CreatedAt              time.Time                  `json:"createdAt"`
	UpdatedAt              time.Time                  `json:"updatedAt"`
}
type IssueLinkView struct {
	IssueID  IssueID `json:"issueId"`
	TargetID IssueID `json:"targetId"`
	Kind     string  `json:"kind" enum:"relates_to,duplicates"`
	Key      string  `json:"key"`
	Title    string  `json:"title"`
	Status   Status  `json:"status"`
}
type IssueView struct {
	Watching            bool              `json:"watching,omitempty"`
	Links               []IssueLinkView   `json:"links,omitempty" maxItems:"100"`
	Workflow            *BoardWorkflow    `json:"workflow,omitempty"`
	DescriptionFormat   DescriptionFormat `json:"descriptionFormat,omitempty"`
	Summary             IssueSummary      `json:"summary"`
	Description         string            `json:"description" maxLength:"10000"`
	Reporter            IssueUserSummary  `json:"reporter"`
	GraphRevision       Revision          `json:"graphRevision"`
	SourceOrderRevision Revision          `json:"sourceOrderRevision"`
	Capabilities        []Capability      `json:"capabilities" nullable:"false" maxItems:"7"`
	OrderRevisions      []ColumnOrder     `json:"orderRevisions" nullable:"false" minItems:"4"`
}

func (Capability) Schema(huma.Registry) *huma.Schema {
	return &huma.Schema{
		Type: "string",
		Enum: []any{
			"read",
			"edit",
			"move",
			"comment",
			"upload_picture",
			"add_subtask",
			"manage_dependencies",
		},
	}
}
