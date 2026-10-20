package issues

import (
	"context"
	"gategoldjira/backend/internal/platform/command"
)

func legacyUpgrade() error {
	return validation("clientVersion", "This project uses custom issue choices and workflows. Use the version 2 issue API or an updated app to preserve its identifiers.")
}
func requireLegacyProject(ctx context.Context, m *command.Mutation, project command.ProjectID) error {
	if permissions, err := m.ProjectPermissions(project); err == nil {
		if permissions.ModernCore {
			return legacyUpgrade()
		}
		return nil
	}
	row, err := m.Queries.ReadProject(ctx, project.UUID)
	if err != nil {
		return err
	}
	if row.CoreMode != "legacy" {
		return legacyUpgrade()
	}
	return nil
}
func requireLegacyIssue(ctx context.Context, m *command.Mutation, id command.IssueID) error {
	row, err := m.Queries.ReadIssue(ctx, id.UUID)
	if err != nil {
		return err
	}
	return requireLegacyProject(ctx, m, command.ProjectID{UUID: row.ProjectID})
}
