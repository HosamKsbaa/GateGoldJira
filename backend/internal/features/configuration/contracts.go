package configuration

import (
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/httpapi"
)

type CoreMode string

const (
	Legacy CoreMode = "legacy"
	Modern CoreMode = "modern"
)

type TypeBehavior = command.IssueBehavior

const (
	Standard TypeBehavior = command.StandardBehavior
	Subtask  TypeBehavior = command.SubtaskBehavior
)

type Defaults struct {
	StandardTypeID command.IssueTypeID `json:"standardTypeId"`
	SubtaskTypeID  command.IssueTypeID `json:"subtaskTypeId"`
	PriorityID     command.PriorityID  `json:"priorityId"`
}
type ConfigurationView struct {
	ProjectID command.ProjectID `json:"projectId"`
	Revision  command.Revision  `json:"revision"`
	Mode      CoreMode          `json:"mode" enum:"legacy,modern"`
	Defaults  Defaults          `json:"defaults"`
	CanManage bool              `json:"canManage"`
}
type TypeView struct {
	ID        command.IssueTypeID `json:"id"`
	ProjectID command.ProjectID   `json:"projectId"`
	Key       string              `json:"key" pattern:"^[a-z][a-z0-9_]{0,31}$"`
	Name      string              `json:"name" minLength:"1" maxLength:"60"`
	Behavior  TypeBehavior        `json:"behavior" enum:"standard,subtask"`
	Default   bool                `json:"default"`
	Retired   bool                `json:"retired"`
}
type PriorityView struct {
	ID        command.PriorityID `json:"id"`
	ProjectID command.ProjectID  `json:"projectId"`
	Key       string             `json:"key" pattern:"^[a-z][a-z0-9_]{0,31}$"`
	Name      string             `json:"name" minLength:"1" maxLength:"60"`
	SortOrder command.Position   `json:"sortOrder"`
	Default   bool               `json:"default"`
	Retired   bool               `json:"retired"`
}
type GetInput struct {
	ProjectID command.ProjectID `json:"projectId"`
}
type ListInput struct {
	ProjectID      command.ProjectID   `json:"projectId"`
	IncludeRetired bool                `json:"includeRetired,omitempty"`
	Page           command.PageRequest `json:"page,omitempty"`
}
type SaveTypeFields struct {
	ExpectedRevision     command.Revision     `json:"expectedRevision"`
	Key                  string               `json:"key" pattern:"^[a-z][a-z0-9_]{0,31}$"`
	Name                 string               `json:"name" minLength:"1" maxLength:"60"`
	Behavior             TypeBehavior         `json:"behavior" enum:"standard,subtask"`
	Retired              bool                 `json:"retired"`
	ReplacementDefaultID *command.IssueTypeID `json:"replacementDefaultId,omitempty"`
}
type SaveTypeInput struct {
	ProjectID command.ProjectID   `json:"projectId"`
	TypeID    command.IssueTypeID `json:"typeId"`
	SaveTypeFields
	RetryReference string `json:"retryReference" format:"uuid"`
}
type SavePriorityFields struct {
	ExpectedRevision     command.Revision    `json:"expectedRevision"`
	Key                  string              `json:"key" pattern:"^[a-z][a-z0-9_]{0,31}$"`
	Name                 string              `json:"name" minLength:"1" maxLength:"60"`
	SortOrder            command.Position    `json:"sortOrder"`
	Retired              bool                `json:"retired"`
	ReplacementDefaultID *command.PriorityID `json:"replacementDefaultId,omitempty"`
}
type SavePriorityInput struct {
	ProjectID  command.ProjectID  `json:"projectId"`
	PriorityID command.PriorityID `json:"priorityId"`
	SavePriorityFields
	RetryReference string `json:"retryReference" format:"uuid"`
}
type SetDefaultsFields struct {
	ExpectedRevision command.Revision `json:"expectedRevision"`
	Defaults         Defaults         `json:"defaults"`
}
type SetDefaultsInput struct {
	ProjectID command.ProjectID `json:"projectId"`
	SetDefaultsFields
	RetryReference string `json:"retryReference" format:"uuid"`
}
type TypeSaved struct {
	Configuration ConfigurationView `json:"configuration"`
	Type          TypeView          `json:"type"`
}
type PrioritySaved struct {
	Configuration ConfigurationView `json:"configuration"`
	Priority      PriorityView      `json:"priority"`
}
type ConfigurationFailureBody struct {
	Error      command.Failure                     `json:"error"`
	Current    command.Nullable[ConfigurationView] `json:"current"`
	Unfinished httpapi.Null                        `json:"unfinished"`
}
