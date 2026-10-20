package boards

import (
	"gategoldjira/backend/internal/platform/command"
	"time"
)

type Limits = command.WipLimits
type Board struct {
	ID           command.BoardID
	ProjectID    command.ProjectID
	Name         string
	NameKey      string
	CreatedBy    command.UserID
	Default      bool
	SavedFilters command.IssueFilter
	Limits       Limits
	Revision     command.Revision
	ArchivedAt   *time.Time
	CreatedAt    time.Time
	UpdatedAt    time.Time
}
