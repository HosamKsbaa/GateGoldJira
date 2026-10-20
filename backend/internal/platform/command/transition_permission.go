package command

import "github.com/danielgtaylor/huma/v2"

// Transition permission is separate from membership: viewers cannot be granted
// workflow moves, and null means the ordinary project-write requirement.
type TransitionPermission string

const (
	TransitionMember       TransitionPermission = "member"
	TransitionProjectAdmin TransitionPermission = "project_admin"
)

func (p TransitionPermission) Valid() bool {
	return p == TransitionMember || p == TransitionProjectAdmin
}
func (TransitionPermission) Schema(huma.Registry) *huma.Schema {
	return &huma.Schema{Type: "string", Enum: []any{string(TransitionMember), string(TransitionProjectAdmin)}}
}
