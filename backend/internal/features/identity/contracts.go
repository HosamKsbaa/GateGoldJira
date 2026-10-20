package identity

import (
	"time"

	"gategoldjira/backend/internal/platform/command"
)

type Me struct {
	UserID          command.UserID `json:"userId"`
	Email           string         `json:"email" format:"email"`
	DisplayName     string         `json:"displayName" minLength:"1" maxLength:"100"`
	Administrator   bool           `json:"administrator"`
	CompanyTimeZone string         `json:"companyTimeZone" minLength:"1"`
}
type UserView struct {
	ID            command.UserID   `json:"id"`
	Email         string           `json:"email" format:"email"`
	DisplayName   string           `json:"displayName" minLength:"1" maxLength:"100"`
	Approved      bool             `json:"approved" enum:"true"`
	Active        bool             `json:"active"`
	Administrator bool             `json:"administrator"`
	Revision      command.Revision `json:"revision"`
	CreatedAt     time.Time        `json:"createdAt"`
	UpdatedAt     time.Time        `json:"updatedAt"`
}
type UserSummary struct {
	ID          command.UserID `json:"id"`
	DisplayName string         `json:"displayName" minLength:"1" maxLength:"100"`
}
type MembershipView struct {
	ProjectID command.ProjectID `json:"projectId"`
	User      UserSummary       `json:"user"`
	Role      command.Role      `json:"role" enum:"project_admin,member,viewer"`
	Removed   bool              `json:"removed"`
	Revision  command.Revision  `json:"revision"`
}
type ApproveFields struct {
	Email         string `json:"email" format:"email"`
	DisplayName   string `json:"displayName" minLength:"1" maxLength:"100"`
	Administrator bool   `json:"administrator"`
}
type ApproveInput struct {
	Email          string `json:"email" format:"email"`
	DisplayName    string `json:"displayName" minLength:"1" maxLength:"100"`
	Administrator  bool   `json:"administrator"`
	RetryReference string `json:"retryReference" format:"uuid"`
}
type UpdateUserFields struct {
	ExpectedRevision command.Revision `json:"expectedRevision"`
	Email            string           `json:"email" format:"email"`
	DisplayName      string           `json:"displayName" minLength:"1" maxLength:"100"`
	Active           bool             `json:"active"`
	Administrator    bool             `json:"administrator"`
}
type UpdateUserInput struct {
	UserID           command.UserID   `json:"userId"`
	ExpectedRevision command.Revision `json:"expectedRevision"`
	Email            string           `json:"email" format:"email"`
	DisplayName      string           `json:"displayName" minLength:"1" maxLength:"100"`
	Active           bool             `json:"active"`
	Administrator    bool             `json:"administrator"`
	RetryReference   string           `json:"retryReference" format:"uuid"`
}
type SetMembershipInput struct {
	ProjectID        command.ProjectID       `json:"projectId"`
	UserID           command.UserID          `json:"userId"`
	ExpectedRevision command.InitialRevision `json:"expectedRevision"`
	Role             command.Role            `json:"role" enum:"project_admin,member,viewer"`
	RetryReference   string                  `json:"retryReference" format:"uuid"`
}
type RemoveMembershipInput struct {
	ProjectID        command.ProjectID `json:"projectId"`
	UserID           command.UserID    `json:"userId"`
	ExpectedRevision command.Revision  `json:"expectedRevision"`
	RetryReference   string            `json:"retryReference" format:"uuid"`
}
type MembershipListInput struct {
	ProjectID      command.ProjectID   `json:"projectId"`
	Page           command.PageRequest `json:"page,omitempty"`
	IncludeRemoved bool                `json:"includeRemoved,omitempty"`
}
type CandidateInput struct {
	ProjectID command.ProjectID   `json:"projectId"`
	Page      command.PageRequest `json:"page,omitempty"`
	Query     string              `json:"query,omitempty" maxLength:"100"`
}

// Project administrators receive directory names, not global account details.
type MembershipCandidateView struct {
	ID          command.UserID `json:"id"`
	DisplayName string         `json:"displayName" minLength:"1" maxLength:"100"`
	Active      bool           `json:"active"`
}
