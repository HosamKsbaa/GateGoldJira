package command

import "context"

type WipLimits struct {
	InProgress *int32 `json:"inProgress" nullable:"true" minimum:"1" maximum:"1000"`
	Review     *int32 `json:"review" nullable:"true" minimum:"1" maximum:"1000"`
}
type BoardSummary struct {
	Workflow     *BoardWorkflow   `json:"workflow,omitempty"`
	ID           BoardID          `json:"id"`
	ProjectID    ProjectID        `json:"projectId"`
	Name         string           `json:"name" minLength:"1" maxLength:"100"`
	Creator      IssueUserSummary `json:"creator"`
	Default      bool             `json:"default"`
	SavedFilters IssueFilter      `json:"savedFilters"`
	WipLimits    WipLimits        `json:"wipLimits"`
	Archived     bool             `json:"archived"`
	Revision     Revision         `json:"revision"`
	CanManage    bool             `json:"canManage"`
}
type ColumnSummary struct {
	Status            Status   `json:"status"`
	SavedMatchCount   int32    `json:"savedMatchCount" minimum:"0"`
	VisibleMatchCount int32    `json:"visibleMatchCount" minimum:"0"`
	WarningLimit      *int32   `json:"warningLimit" nullable:"true" minimum:"1" maximum:"1000"`
	LimitExceeded     bool     `json:"limitExceeded"`
	OrderRevision     Revision `json:"orderRevision"`
}
type BoardView struct {
	Board        BoardSummary    `json:"board"`
	Columns      []ColumnSummary `json:"columns" nullable:"false" minItems:"2"`
	CompanyToday CalendarDate    `json:"companyToday"`
}
type MoveResult struct {
	Issue               IssueView           `json:"issue"`
	SourceOrderRevision Revision            `json:"sourceOrderRevision"`
	TargetOrderRevision Revision            `json:"targetOrderRevision"`
	BoardView           Nullable[BoardView] `json:"boardView"`
}

// App wiring supplies this small collaborator. Issue commands retain their
// transaction and project locks; board checks never open a nested transaction.
type BoardAccess struct {
	Check      func(context.Context, *Mutation, ProjectID, BoardID, Revision) error
	View       func(context.Context, *Mutation, BoardID) (BoardView, error)
	Transition func(context.Context, *Mutation, ProjectID, *BoardID, Status, Status) error
}
type BoardConflict struct {
	Failure *Failure
	Current *BoardSummary
}

func (e *BoardConflict) Error() string { return e.Failure.Message }
func (e *BoardConflict) Unwrap() error { return e.Failure }
