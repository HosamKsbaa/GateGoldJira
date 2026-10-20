package boards

import "gategoldjira/backend/internal/platform/command"

type BoardSummary = command.BoardSummary
type BoardView = command.BoardView
type ColumnSummary = command.ColumnSummary
type CardEpicKind struct{}
type BoardCardEpic struct {
	IssueID  command.IssueID          `json:"issueId"`
	EpicID   command.ID[CardEpicKind] `json:"epicId"`
	EpicName string                   `json:"epicName" minLength:"1" maxLength:"100"`
}
type CardPage struct {
	Column       ColumnSummary          `json:"column"`
	Items        []command.IssueSummary `json:"items" nullable:"false" maxItems:"100"`
	Epics        []BoardCardEpic        `json:"epics,omitempty" nullable:"false" maxItems:"100"`
	NextCursor   *string                `json:"nextCursor" nullable:"true" maxLength:"2048"`
	CompanyToday command.CalendarDate   `json:"companyToday"`
}
type CreateBoardFields struct {
	Name         string              `json:"name" minLength:"1" maxLength:"100"`
	SavedFilters command.IssueFilter `json:"savedFilters"`
}
type CreateInput struct {
	ProjectID      command.ProjectID   `json:"projectId"`
	Name           string              `json:"name" minLength:"1" maxLength:"100"`
	SavedFilters   command.IssueFilter `json:"savedFilters"`
	RetryReference string              `json:"retryReference" format:"uuid"`
}
type UpdateBoardFields struct {
	RetireStages     []command.StageRetirement `json:"retireStages,omitempty"`
	ExpectedRevision command.Revision          `json:"expectedRevision"`
	Name             string                    `json:"name" minLength:"1" maxLength:"100"`
	SavedFilters     command.IssueFilter       `json:"savedFilters"`
	WipLimits        Limits                    `json:"wipLimits"`
	Workflow         *command.BoardWorkflow    `json:"workflow,omitempty"`
}
type UpdateInput struct {
	RetireStages     []command.StageRetirement `json:"retireStages,omitempty"`
	BoardID          command.BoardID           `json:"boardId"`
	ExpectedRevision command.Revision          `json:"expectedRevision"`
	Name             string                    `json:"name" minLength:"1" maxLength:"100"`
	SavedFilters     command.IssueFilter       `json:"savedFilters"`
	WipLimits        Limits                    `json:"wipLimits"`
	RetryReference   string                    `json:"retryReference" format:"uuid"`
	Workflow         *command.BoardWorkflow    `json:"workflow,omitempty"`
}
type RevisionBoardFields struct {
	ExpectedRevision command.Revision `json:"expectedRevision"`
}
type RevisionInput struct {
	BoardID          command.BoardID  `json:"boardId"`
	ExpectedRevision command.Revision `json:"expectedRevision"`
	RetryReference   string           `json:"retryReference" format:"uuid"`
}
type ListInput struct {
	ProjectID       command.ProjectID   `json:"projectId"`
	Page            command.PageRequest `json:"page,omitempty"`
	IncludeArchived bool                `json:"includeArchived,omitempty"`
}
type GetInput struct {
	BoardID          command.BoardID     `json:"boardId"`
	TemporaryFilters command.IssueFilter `json:"temporaryFilters,omitempty"`
}
type CardsInput struct {
	BoardID          command.BoardID     `json:"boardId"`
	Status           command.Status      `json:"status"`
	TemporaryFilters command.IssueFilter `json:"temporaryFilters,omitempty"`
	Page             command.PageRequest `json:"page,omitempty"`
}
