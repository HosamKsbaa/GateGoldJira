package planning

import (
	"gategoldjira/backend/internal/platform/command"
	"time"
)

type KindMarker struct{}
type ID = command.ID[KindMarker]
type Kind string
type Status string

const (
	Epic     Kind   = "epic"
	Release  Kind   = "release"
	Planned  Status = "planned"
	Active   Status = "active"
	Complete Status = "complete"
)

type PlanningItemView struct {
	ID             ID                    `json:"id"`
	ProjectID      command.ProjectID     `json:"projectId"`
	Kind           Kind                  `json:"kind" enum:"epic,release"`
	Name           string                `json:"name" minLength:"1" maxLength:"100"`
	Description    string                `json:"description" maxLength:"2000"`
	TargetDate     *command.CalendarDate `json:"targetDate" nullable:"true"`
	Status         Status                `json:"status" enum:"planned,active,complete"`
	Revision       command.Revision      `json:"revision"`
	IssueCount     int32                 `json:"issueCount" minimum:"0"`
	CompletedCount int32                 `json:"completedCount" minimum:"0"`
	CreatedAt      time.Time             `json:"createdAt"`
	UpdatedAt      time.Time             `json:"updatedAt"`
}
type PlanningCreateFields struct {
	Kind        Kind                  `json:"kind" enum:"epic,release"`
	Name        string                `json:"name" minLength:"1" maxLength:"100"`
	Description string                `json:"description" maxLength:"2000"`
	TargetDate  *command.CalendarDate `json:"targetDate" nullable:"true"`
	Status      Status                `json:"status" enum:"planned,active,complete"`
}
type PlanningCreateInput struct {
	ProjectID command.ProjectID `json:"projectId"`
	PlanningCreateFields
	RetryReference string `json:"retryReference" format:"uuid"`
}
type PlanningUpdateFields struct {
	ExpectedRevision command.Revision      `json:"expectedRevision"`
	Name             string                `json:"name" minLength:"1" maxLength:"100"`
	Description      string                `json:"description" maxLength:"2000"`
	TargetDate       *command.CalendarDate `json:"targetDate" nullable:"true"`
	Status           Status                `json:"status" enum:"planned,active,complete"`
}
type PlanningUpdateInput struct {
	ProjectID  command.ProjectID `json:"projectId"`
	PlanningID ID                `json:"planningId"`
	PlanningUpdateFields
	RetryReference string `json:"retryReference" format:"uuid"`
}
type PlanningListInput struct {
	ProjectID command.ProjectID   `json:"projectId"`
	Kind      *Kind               `json:"kind,omitempty" enum:"epic,release"`
	Page      command.PageRequest `json:"page,omitempty"`
}
type PlanningIssuesInput struct {
	ProjectID  command.ProjectID   `json:"projectId"`
	PlanningID ID                  `json:"planningId"`
	Page       command.PageRequest `json:"page,omitempty"`
}
type PlanningIssueSummary struct {
	StageName string          `json:"stageName,omitempty" minLength:"1" maxLength:"60"`
	ID        command.IssueID `json:"id"`
	Number    string          `json:"number"`
	Title     string          `json:"title"`
	Status    command.Status  `json:"status"`
}
type IssuePlanningView struct {
	IssueID     command.IssueID         `json:"issueId"`
	ProjectID   command.ProjectID       `json:"projectId"`
	Revision    command.InitialRevision `json:"revision"`
	EpicID      *ID                     `json:"epicId" nullable:"true"`
	ReleaseID   *ID                     `json:"releaseId" nullable:"true"`
	EpicName    *string                 `json:"epicName" nullable:"true"`
	ReleaseName *string                 `json:"releaseName" nullable:"true"`
}
type IssuePlanningFields struct {
	ExpectedRevision command.InitialRevision `json:"expectedRevision"`
	EpicID           *ID                     `json:"epicId" nullable:"true"`
	ReleaseID        *ID                     `json:"releaseId" nullable:"true"`
}
type IssuePlanningInput struct {
	IssueID command.IssueID `json:"issueId"`
	IssuePlanningFields
	RetryReference string `json:"retryReference" format:"uuid"`
}
type GetIssueInput struct {
	IssueID command.IssueID `json:"issueId"`
}
type KanbanReportInput struct {
	ProjectID command.ProjectID    `json:"projectId"`
	From      command.CalendarDate `json:"from"`
	Through   command.CalendarDate `json:"through"`
	Page      command.PageRequest  `json:"page,omitempty"`
}
type ThroughputDay struct {
	Day             command.CalendarDate `json:"day"`
	CompletedCycles int32                `json:"completedCycles" minimum:"0"`
}
type AgingIssue struct {
	StageName          string                                     `json:"stageName,omitempty" minLength:"1" maxLength:"60"`
	ID                 command.IssueID                            `json:"id"`
	Key                string                                     `json:"key"`
	Title              string                                     `json:"title"`
	Status             command.Status                             `json:"status"`
	Assignee           command.Nullable[command.IssueUserSummary] `json:"assignee"`
	StartedAt          *time.Time                                 `json:"startedAt" nullable:"true"`
	CycleAgeDays       *float64                                   `json:"cycleAgeDays" nullable:"true"`
	WorkAgeDays        float64                                    `json:"workAgeDays" minimum:"0"`
	UnfinishedBlockers int32                                      `json:"unfinishedBlockers" minimum:"0"`
}
type KanbanReport struct {
	ProjectID        command.ProjectID        `json:"projectId"`
	From             command.CalendarDate     `json:"from"`
	Through          command.CalendarDate     `json:"through"`
	SnapshotAt       time.Time                `json:"snapshotAt"`
	CompletedCycles  int32                    `json:"completedCycles" minimum:"0"`
	MeasuredCycles   int32                    `json:"measuredCycles" minimum:"0"`
	AverageCycleDays *float64                 `json:"averageCycleDays" nullable:"true"`
	ActiveCount      int32                    `json:"activeCount" minimum:"0"`
	BlockedCount     int32                    `json:"blockedCount" minimum:"0"`
	Days             []ThroughputDay          `json:"days" nullable:"false" maxItems:"366"`
	Work             command.Page[AgingIssue] `json:"work"`
	Definition       string                   `json:"definition" maxLength:"2000"`
}
