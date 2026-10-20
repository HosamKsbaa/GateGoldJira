package issues

import "gategoldjira/backend/internal/platform/command"

type MoveIssueFields struct {
	ExpectedRevision            command.Revision  `json:"expectedRevision"`
	TargetStatus                command.Status    `json:"targetStatus"`
	ExpectedSourceOrderRevision command.Revision  `json:"expectedSourceOrderRevision"`
	ExpectedTargetOrderRevision command.Revision  `json:"expectedTargetOrderRevision"`
	SourceBoardID               *command.BoardID  `json:"sourceBoardId,omitempty"`
	ExpectedBoardRevision       *command.Revision `json:"expectedBoardRevision,omitempty"`
}
type MoveInput struct {
	IssueID                     command.IssueID   `json:"issueId"`
	ExpectedRevision            command.Revision  `json:"expectedRevision"`
	TargetStatus                command.Status    `json:"targetStatus"`
	ExpectedSourceOrderRevision command.Revision  `json:"expectedSourceOrderRevision"`
	ExpectedTargetOrderRevision command.Revision  `json:"expectedTargetOrderRevision"`
	SourceBoardID               *command.BoardID  `json:"sourceBoardId,omitempty"`
	ExpectedBoardRevision       *command.Revision `json:"expectedBoardRevision,omitempty"`
	RetryReference              string            `json:"retryReference" format:"uuid"`
}
type Placement string

const (
	Before Placement = "before"
	After  Placement = "after"
)

type ReorderIssueFields struct {
	ExpectedRevision      command.Revision  `json:"expectedRevision"`
	ExpectedOrderRevision command.Revision  `json:"expectedOrderRevision"`
	NeighborIssueID       command.IssueID   `json:"neighborIssueId"`
	Placement             Placement         `json:"placement" enum:"before,after"`
	SourceBoardID         *command.BoardID  `json:"sourceBoardId,omitempty"`
	ExpectedBoardRevision *command.Revision `json:"expectedBoardRevision,omitempty"`
}
type ReorderInput struct {
	IssueID               command.IssueID   `json:"issueId"`
	ExpectedRevision      command.Revision  `json:"expectedRevision"`
	ExpectedOrderRevision command.Revision  `json:"expectedOrderRevision"`
	NeighborIssueID       command.IssueID   `json:"neighborIssueId"`
	Placement             Placement         `json:"placement" enum:"before,after"`
	SourceBoardID         *command.BoardID  `json:"sourceBoardId,omitempty"`
	ExpectedBoardRevision *command.Revision `json:"expectedBoardRevision,omitempty"`
	RetryReference        string            `json:"retryReference" format:"uuid"`
}
