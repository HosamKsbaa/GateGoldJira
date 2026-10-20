package identity

import (
	"gategoldjira/backend/internal/platform/command"
	"time"
)

type User struct {
	ID            command.UserID
	Email         string
	DisplayName   string
	ApprovedAt    *time.Time
	DisabledAt    *time.Time
	Administrator bool
	Revision      command.Revision
	CreatedAt     time.Time
	UpdatedAt     time.Time
}
type Membership struct {
	ProjectID command.ProjectID
	UserID    command.UserID
	Role      command.Role
	Revision  command.Revision
	RemovedAt *time.Time
	CreatedAt time.Time
	UpdatedAt time.Time
}
type Binding struct {
	Issuer  string
	Subject string
	UserID  command.UserID
	BoundAt time.Time
}
