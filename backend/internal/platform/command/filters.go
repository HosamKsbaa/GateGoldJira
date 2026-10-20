package command

import (
	"github.com/google/uuid"
	"strings"
)

type Status string

const (
	Todo       Status = "todo"
	InProgress Status = "in_progress"
	Review     Status = "review"
	Done       Status = "done"
)

func (status Status) Valid() bool {
	if status == Todo || status == InProgress || status == Review || status == Done {
		return true
	}
	parts := strings.Split(string(status), ":")
	if len(parts) != 2 {
		return false
	}
	category := Status(parts[0])
	if category != Todo && category != InProgress && category != Review && category != Done {
		return false
	}
	id, err := uuid.Parse(parts[1])
	return err == nil && id != uuid.Nil && id.String() == parts[1]
}

// Category keeps completion and WIP rules consistent across user-created stages.
func (status Status) Category() Status { return Status(strings.SplitN(string(status), ":", 2)[0]) }

type IssueType string

const (
	Task    IssueType = "task"
	Bug     IssueType = "bug"
	Subtask IssueType = "subtask"
)

func (kind IssueType) Valid() bool { return kind == Task || kind == Bug || kind == Subtask }

type Priority string

const (
	Low    Priority = "low"
	Medium Priority = "medium"
	High   Priority = "high"
)

func (priority Priority) Valid() bool {
	return priority == Low || priority == Medium || priority == High
}

type Role string

const (
	ProjectAdmin Role = "project_admin"
	Member       Role = "member"
	Viewer       Role = "viewer"
)

func (role Role) Valid() bool { return role == ProjectAdmin || role == Member || role == Viewer }

type AssigneeMode string

const (
	AssigneeUser AssigneeMode = "user"
	AssigneeMe   AssigneeMode = "self"
	AssigneeAny  AssigneeMode = "any"
	Unassigned   AssigneeMode = "unassigned"
)

type AssigneeFilter struct {
	Mode   AssigneeMode `json:"kind" enum:"any,unassigned,self,user"`
	UserID *UserID      `json:"userId,omitempty"`
}

// Optional filters use pointers/slices to retain false versus not supplied.
type IssueSort string

const (
	SortUpdated  IssueSort = "updated"
	SortCreated  IssueSort = "created"
	SortDue      IssueSort = "due"
	SortPriority IssueSort = "priority"
)

type IssueFilter struct {
	TypeIDs         []IssueTypeID   `json:"typeIds,omitempty" nullable:"false" minItems:"1" maxItems:"100" uniqueItems:"true"`
	PriorityIDs     []PriorityID    `json:"priorityIds,omitempty" nullable:"false" minItems:"1" maxItems:"100" uniqueItems:"true"`
	WorkflowIDs     []WorkflowID    `json:"workflowIds,omitempty" nullable:"false" minItems:"1" maxItems:"100" uniqueItems:"true"`
	StageIDs        []StageID       `json:"stageIds,omitempty" nullable:"false" minItems:"1" maxItems:"100" uniqueItems:"true"`
	Archived        *bool           `json:"archived,omitempty"`
	Backlog         *bool           `json:"backlog,omitempty"`
	Sort            IssueSort       `json:"sort,omitempty" enum:"updated,created,due,priority"`
	ProjectIDs      []ProjectID     `json:"projectIds,omitempty" nullable:"false" minItems:"1" maxItems:"100" uniqueItems:"true"`
	Query           *string         `json:"query,omitempty" maxLength:"200"`
	Statuses        []Status        `json:"statuses,omitempty" nullable:"false" minItems:"1" uniqueItems:"true"`
	Priorities      []Priority      `json:"priorities,omitempty" nullable:"false" minItems:"1" uniqueItems:"true"`
	Types           []IssueType     `json:"types,omitempty" nullable:"false" minItems:"1" uniqueItems:"true"`
	Assignee        *AssigneeFilter `json:"assignee,omitempty"`
	ParentID        *IssueID        `json:"parentId,omitempty"`
	PrerequisiteFor *IssueID        `json:"prerequisiteFor,omitempty"`
	LabelIDs        []LabelID       `json:"labelIds,omitempty" nullable:"false" minItems:"1" maxItems:"10" uniqueItems:"true"`
	DueFrom         *CalendarDate   `json:"dueFrom,omitempty"`
	DueTo           *CalendarDate   `json:"dueTo,omitempty"`
	Overdue         *bool           `json:"overdue,omitempty"`
	Blocked         *bool           `json:"blocked,omitempty"`
}

// Project-scoped permissions are shared by all feature services.
func (role Role) CanWrite() bool     { return role == Member || role == ProjectAdmin }
func (role Role) CanConfigure() bool { return role == ProjectAdmin }
