package projects

import (
	"gategoldjira/backend/internal/platform/command"
	"time"
)

type Project struct {
	ID              command.ProjectID
	Key             string
	Name            string
	Description     string
	CreatedBy       command.UserID
	NextIssueNumber int64
	Revision        command.Revision
	GraphRevision   command.Revision
	ArchivedAt      *time.Time
	CreatedAt       time.Time
	UpdatedAt       time.Time
}
