package configuration

import "gategoldjira/backend/internal/platform/command"

type WorkflowView struct {
	ID           command.WorkflowID `json:"id"`
	ProjectID    command.ProjectID  `json:"projectId"`
	Name         string             `json:"name" minLength:"1" maxLength:"100"`
	Revision     command.Revision   `json:"revision"`
	Retired      bool               `json:"retired"`
	LegacyBridge bool               `json:"legacyBridge"`
}
type StageView struct {
	ID             command.StageID    `json:"id"`
	ProjectID      command.ProjectID  `json:"projectId"`
	WorkflowID     command.WorkflowID `json:"workflowId"`
	Name           string             `json:"name" minLength:"1" maxLength:"60"`
	Category       command.Status     `json:"category" enum:"todo,in_progress,review,done"`
	Position       command.Position   `json:"position"`
	Initial        bool               `json:"initial"`
	AcceptsEntries bool               `json:"acceptsEntries"`
	Retired        bool               `json:"retired"`
}
type TransitionView struct {
	ID                 command.TransitionID                           `json:"id"`
	ProjectID          command.ProjectID                              `json:"projectId"`
	WorkflowID         command.WorkflowID                             `json:"workflowId"`
	FromStageID        command.StageID                                `json:"fromStageId"`
	ToStageID          command.StageID                                `json:"toStageId"`
	RequiredPermission command.Nullable[command.TransitionPermission] `json:"requiredPermission"`
	Retired            bool                                           `json:"retired"`
}
type WorkflowListInput struct{ ListInput }
type StageListInput struct {
	ProjectID      command.ProjectID   `json:"projectId"`
	WorkflowID     command.WorkflowID  `json:"workflowId"`
	IncludeRetired bool                `json:"includeRetired,omitempty"`
	Page           command.PageRequest `json:"page,omitempty"`
}
type SaveWorkflowFields struct {
	ExpectedRevision command.Revision `json:"expectedRevision"`
	Name             string           `json:"name" minLength:"1" maxLength:"100"`
	Retired          bool             `json:"retired"`
}
type SaveWorkflowInput struct {
	ProjectID  command.ProjectID  `json:"projectId"`
	WorkflowID command.WorkflowID `json:"workflowId"`
	SaveWorkflowFields
	RetryReference string `json:"retryReference" format:"uuid"`
}
type SaveStageFields struct {
	ExpectedRevision command.Revision `json:"expectedRevision"`
	Name             string           `json:"name" minLength:"1" maxLength:"60"`
	Category         command.Status   `json:"category" enum:"todo,in_progress,review,done"`
	Position         command.Position `json:"position"`
	Initial          bool             `json:"initial"`
	AcceptsEntries   bool             `json:"acceptsEntries"`
	Retired          bool             `json:"retired"`
}
type SaveStageInput struct {
	ProjectID  command.ProjectID  `json:"projectId"`
	WorkflowID command.WorkflowID `json:"workflowId"`
	StageID    command.StageID    `json:"stageId"`
	SaveStageFields
	RetryReference string `json:"retryReference" format:"uuid"`
}
type SaveTransitionFields struct {
	ExpectedRevision   command.Revision                               `json:"expectedRevision"`
	FromStageID        command.StageID                                `json:"fromStageId"`
	ToStageID          command.StageID                                `json:"toStageId"`
	RequiredPermission command.Nullable[command.TransitionPermission] `json:"requiredPermission"`
	Retired            bool                                           `json:"retired"`
}
type SaveTransitionInput struct {
	ProjectID    command.ProjectID    `json:"projectId"`
	WorkflowID   command.WorkflowID   `json:"workflowId"`
	TransitionID command.TransitionID `json:"transitionId"`
	SaveTransitionFields
	RetryReference string `json:"retryReference" format:"uuid"`
}
type SetBindingFields struct {
	ExpectedRevision command.Revision `json:"expectedRevision"`
	Default          bool             `json:"default"`
	AcceptsNew       bool             `json:"acceptsNew"`
}
type SetBindingInput struct {
	ProjectID  command.ProjectID   `json:"projectId"`
	TypeID     command.IssueTypeID `json:"typeId"`
	WorkflowID command.WorkflowID  `json:"workflowId"`
	SetBindingFields
	RetryReference string `json:"retryReference" format:"uuid"`
}
type WorkflowSaved struct {
	Configuration ConfigurationView `json:"configuration"`
	Workflow      WorkflowView      `json:"workflow"`
}
type StageSaved struct {
	Configuration ConfigurationView `json:"configuration"`
	Stage         StageView         `json:"stage"`
}
type TransitionSaved struct {
	Configuration ConfigurationView `json:"configuration"`
	Transition    TransitionView    `json:"transition"`
}
type MigrationFields struct {
	ExpectedRevision command.Revision `json:"expectedRevision"`
	SourceStageID    command.StageID  `json:"sourceStageId"`
	TargetStageID    command.StageID  `json:"targetStageId"`
	Limit            int              `json:"limit" minimum:"1" maximum:"100"`
}
type MigrationInput struct {
	ProjectID command.ProjectID `json:"projectId"`
	MigrationFields
	RetryReference string `json:"retryReference" format:"uuid"`
}
type MigrationResult struct {
	Configuration ConfigurationView `json:"configuration"`
	Moved         int               `json:"moved"`
	Remaining     int64             `json:"remaining"`
}

type BindingView struct {
	ProjectID  command.ProjectID   `json:"projectId"`
	TypeID     command.IssueTypeID `json:"typeId"`
	WorkflowID command.WorkflowID  `json:"workflowId"`
	Default    bool                `json:"default"`
	AcceptsNew bool                `json:"acceptsNew"`
}
type BindingListInput struct {
	ProjectID command.ProjectID   `json:"projectId"`
	TypeID    command.IssueTypeID `json:"typeId"`
	Page      command.PageRequest `json:"page,omitempty"`
}
