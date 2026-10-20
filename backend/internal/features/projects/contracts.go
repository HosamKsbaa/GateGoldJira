package projects

import (
	"gategoldjira/backend/internal/platform/command"
	"time"
)

type EffectiveRole string

const (
	Administrator EffectiveRole = "administrator"
	ProjectAdmin  EffectiveRole = "project_admin"
	Member        EffectiveRole = "member"
	Viewer        EffectiveRole = "viewer"
)

type ProjectView struct {
	ID            command.ProjectID `json:"id"`
	Key           string            `json:"key" pattern:"^[A-Z][A-Z0-9]{1,9}$"`
	Name          string            `json:"name" minLength:"1" maxLength:"100"`
	Description   string            `json:"description" maxLength:"2000"`
	Archived      bool              `json:"archived"`
	Revision      command.Revision  `json:"revision"`
	CreatedAt     time.Time         `json:"createdAt"`
	UpdatedAt     time.Time         `json:"updatedAt"`
	EffectiveRole EffectiveRole     `json:"effectiveRole" enum:"administrator,project_admin,member,viewer"`
}
type CreateFields struct {
	Key         string `json:"key" pattern:"^[A-Za-z][A-Za-z0-9]{1,9}$"`
	Name        string `json:"name" minLength:"1" maxLength:"100"`
	Description string `json:"description,omitempty" maxLength:"2000"`
}
type CreateInput struct {
	Key            string `json:"key" pattern:"^[A-Za-z][A-Za-z0-9]{1,9}$"`
	Name           string `json:"name" minLength:"1" maxLength:"100"`
	Description    string `json:"description,omitempty" maxLength:"2000"`
	RetryReference string `json:"retryReference" format:"uuid"`
}
type UpdateFields struct {
	ExpectedRevision command.Revision `json:"expectedRevision"`
	Name             string           `json:"name" minLength:"1" maxLength:"100"`
	Description      string           `json:"description" maxLength:"2000"`
}
type UpdateInput struct {
	ProjectID        command.ProjectID `json:"projectId"`
	ExpectedRevision command.Revision  `json:"expectedRevision"`
	Name             string            `json:"name" minLength:"1" maxLength:"100"`
	Description      string            `json:"description" maxLength:"2000"`
	RetryReference   string            `json:"retryReference" format:"uuid"`
}
type RevisionFields struct {
	ExpectedRevision command.Revision `json:"expectedRevision"`
}
type RevisionInput struct {
	ProjectID        command.ProjectID `json:"projectId"`
	ExpectedRevision command.Revision  `json:"expectedRevision"`
	RetryReference   string            `json:"retryReference" format:"uuid"`
}
type ListInput struct {
	Page            command.PageRequest `json:"page,omitempty"`
	IncludeArchived bool                `json:"includeArchived,omitempty"`
}
