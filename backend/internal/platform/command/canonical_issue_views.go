package command

import "time"

// Canonical references carry their own identities and current display names.
// Mutable project choices never become a fixed compile-time list of names.
type IssueBehavior string

const (
	StandardBehavior IssueBehavior = "standard"
	SubtaskBehavior  IssueBehavior = "subtask"
)

func (b IssueBehavior) Valid() bool { return b == StandardBehavior || b == SubtaskBehavior }

type IssueTypeChoice struct {
	ID       IssueTypeID   `json:"id"`
	Key      string        `json:"key" pattern:"^[a-z][a-z0-9_]{0,31}$"`
	Name     string        `json:"name" minLength:"1" maxLength:"60"`
	Behavior IssueBehavior `json:"behavior" enum:"standard,subtask"`
	Retired  bool          `json:"retired"`
}
type PriorityChoice struct {
	ID        PriorityID `json:"id"`
	Key       string     `json:"key" pattern:"^[a-z][a-z0-9_]{0,31}$"`
	Name      string     `json:"name" minLength:"1" maxLength:"60"`
	SortOrder Position   `json:"sortOrder"`
	Retired   bool       `json:"retired"`
}
type WorkflowChoice struct {
	ID       WorkflowID `json:"id"`
	Name     string     `json:"name" minLength:"1" maxLength:"100"`
	Revision Revision   `json:"revision"`
	Retired  bool       `json:"retired"`
}
type StageChoice struct {
	ID             StageID  `json:"id"`
	Name           string   `json:"name" minLength:"1" maxLength:"60"`
	Category       Status   `json:"category" enum:"todo,in_progress,review,done"`
	Position       Position `json:"position"`
	Initial        bool     `json:"initial"`
	AcceptsEntries bool     `json:"acceptsEntries"`
	Retired        bool     `json:"retired"`
}
type ModernIssueSummary struct {
	Archived               bool                       `json:"archived"`
	Backlog                bool                       `json:"backlog"`
	ID                     IssueID                    `json:"id"`
	ProjectID              ProjectID                  `json:"projectId"`
	Key                    string                     `json:"key" minLength:"1" maxLength:"32"`
	Number                 Revision                   `json:"number"`
	Title                  string                     `json:"title" minLength:"1" maxLength:"200"`
	Type                   IssueTypeChoice            `json:"type"`
	Priority               PriorityChoice             `json:"priority"`
	Workflow               WorkflowChoice             `json:"workflow"`
	Stage                  StageChoice                `json:"stage"`
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
type ModernIssueView struct {
	Watching          bool               `json:"watching"`
	Links             []IssueLinkView    `json:"links" nullable:"false" maxItems:"100"`
	DescriptionFormat DescriptionFormat  `json:"descriptionFormat"`
	Summary           ModernIssueSummary `json:"summary"`
	Description       string             `json:"description" maxLength:"10000"`
	Reporter          IssueUserSummary   `json:"reporter"`
	GraphRevision     Revision           `json:"graphRevision"`
	Capabilities      []Capability       `json:"capabilities" nullable:"false" maxItems:"7"`
}
