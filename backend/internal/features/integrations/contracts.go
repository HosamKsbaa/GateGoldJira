package integrations

import (
	"gategoldjira/backend/internal/platform/command"
	"time"
)

type LinkMarker struct{}
type RuleMarker struct{}
type LinkID = command.ID[LinkMarker]
type RuleID = command.ID[RuleMarker]
type LinkKind string

const (
	PullRequest LinkKind = "pull_request"
	Commit      LinkKind = "commit"
	Other       LinkKind = "other"
)

type DevelopmentLinkView struct {
	ID        LinkID           `json:"id"`
	IssueID   command.IssueID  `json:"issueId"`
	URL       string           `json:"url" minLength:"1" maxLength:"2000"`
	Title     string           `json:"title" minLength:"1" maxLength:"200"`
	Kind      LinkKind         `json:"kind" enum:"pull_request,commit,other"`
	Revision  command.Revision `json:"revision"`
	Removed   bool             `json:"removed"`
	CreatedAt time.Time        `json:"createdAt"`
	UpdatedAt time.Time        `json:"updatedAt"`
}
type DevelopmentLinkFields struct {
	ExpectedRevision command.InitialRevision `json:"expectedRevision"`
	URL              string                  `json:"url" minLength:"1" maxLength:"2000"`
	Title            string                  `json:"title" minLength:"1" maxLength:"200"`
	Kind             LinkKind                `json:"kind" enum:"pull_request,commit,other"`
	Removed          bool                    `json:"removed"`
}
type DevelopmentLinkInput struct {
	IssueID command.IssueID `json:"issueId"`
	LinkID  LinkID          `json:"linkId"`
	DevelopmentLinkFields
	RetryReference string `json:"retryReference" format:"uuid"`
}
type DevelopmentListInput struct {
	IssueID command.IssueID     `json:"issueId"`
	Page    command.PageRequest `json:"page,omitempty"`
}
type AutomationRuleView struct {
	StageID   *command.StageID         `json:"stageId,omitempty"`
	ID        RuleID                   `json:"id"`
	ProjectID command.ProjectID        `json:"projectId"`
	Name      string                   `json:"name" minLength:"1" maxLength:"100"`
	Stage     command.Status           `json:"stage"`
	Assignee  command.IssueUserSummary `json:"assignee"`
	Enabled   bool                     `json:"enabled"`
	Revision  command.Revision         `json:"revision"`
	CreatedAt time.Time                `json:"createdAt"`
	UpdatedAt time.Time                `json:"updatedAt"`
}
type AutomationRuleFields struct {
	StageID          *command.StageID        `json:"stageId,omitempty"`
	ExpectedRevision command.InitialRevision `json:"expectedRevision"`
	Name             string                  `json:"name" minLength:"1" maxLength:"100"`
	Stage            command.Status          `json:"stage,omitempty"`
	AssigneeID       command.UserID          `json:"assigneeId"`
	Enabled          bool                    `json:"enabled"`
}
type AutomationRuleInput struct {
	ProjectID command.ProjectID `json:"projectId"`
	RuleID    RuleID            `json:"ruleId"`
	AutomationRuleFields
	RetryReference string `json:"retryReference" format:"uuid"`
}
type AutomationListInput struct {
	ProjectID command.ProjectID   `json:"projectId"`
	Page      command.PageRequest `json:"page,omitempty"`
}
