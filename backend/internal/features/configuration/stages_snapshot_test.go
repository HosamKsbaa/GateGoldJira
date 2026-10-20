package configuration

import (
	"gategoldjira/backend/internal/platform/database/dbgen"
	"testing"
)

func TestTransitionAuditDistinguishesUnsetPermissionFromExplicitMember(t *testing.T) {
	row := dbgen.WorkflowTransition{}
	before := transitionSnapshot(row)
	member := "member"
	row.RequiredPermission = &member
	if before == transitionSnapshot(row) {
		t.Fatal("a persisted permission change would create an empty audit event")
	}
}
