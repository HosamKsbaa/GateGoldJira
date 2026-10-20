package parity

import (
	"gategoldjira/backend/internal/features/issues"
	"gategoldjira/backend/internal/features/notifications"
	"gategoldjira/backend/internal/platform/command"
	"github.com/google/uuid"
	"testing"
)

// The main catalog matrix calls this helper before its final project archive.
// Every operation uses real transports, restart replay and current-account guards.
func matrixBacklogImportAndPreferences(t *testing.T, m *catalogMatrix, project command.ProjectID, member command.UserID) {
	t.Helper()
	first := matrixSave[issues.CreateInput, issues.IssueView, issues.IssueFailureBody](t, m, member, command.CreateIssue, issues.CreateInput{
		ProjectID: project,
		CreateIssueFields: issues.CreateIssueFields{
			Title:   "First planned parity",
			Backlog: true,
		},
		RetryReference: uuid.NewString(),
	})
	second := matrixSave[issues.CreateInput, issues.IssueView, issues.IssueFailureBody](t, m, member, command.CreateIssue, issues.CreateInput{
		ProjectID: project,
		CreateIssueFields: issues.CreateIssueFields{
			Title:   "Second planned parity",
			Backlog: true,
		},
		RetryReference: uuid.NewString(),
	})
	backlog := matrixRead[issues.BacklogInput, issues.BacklogPage, issues.IssueFailureBody](t, m, member, command.ListBacklog, issues.BacklogInput{ProjectID: project})
	matrixSave[issues.BacklogReorderInput, issues.BacklogChange, issues.IssueFailureBody](t, m, member, command.ReorderBacklog, issues.BacklogReorderInput{
		IssueID: second.Summary.ID,
		BacklogReorderFields: issues.BacklogReorderFields{
			ExpectedRevision:      second.Summary.Revision,
			ExpectedOrderRevision: backlog.OrderRevision,
			NeighborID:            first.Summary.ID,
			Before:                true,
		},
		RetryReference: uuid.NewString(),
	})
	fields := issues.ImportPreviewFields{
		CSV:     "sourceKey,title,description\nPARITY-CSV,CSV parity عربي,Imported work\n",
		Mapping: issues.ImportMapping{},
	}
	matrixRead[issues.ImportPreviewInput, issues.ImportPreview, issues.IssueFailureBody](t, m, member, command.PreviewIssueImport, issues.ImportPreviewInput{
		ProjectID:           project,
		ImportPreviewFields: fields,
	})
	matrixSave[issues.ImportInput, issues.ImportResult, issues.IssueFailureBody](t, m, member, command.ImportIssues, issues.ImportInput{
		ProjectID: project,
		ImportFields: issues.ImportFields{
			ImportPreviewFields: fields,
			Backlog:             true,
			BatchID:             uuid.NewString(),
		},
		RetryReference: uuid.NewString(),
	})
	matrixRead[issues.ExportInput, issues.IssueExport, issues.IssueFailureBody](t, m, member, command.ExportIssues, issues.ExportInput{
		ProjectID: project,
		ExportFields: issues.ExportFields{
			Filters: command.IssueFilter{},
			Page:    command.PageRequest{},
		},
	})
	prefs := matrixRead[struct{}, notifications.NotificationPreferencesView, notifications.NotificationFailureBody](t, m, member, command.GetNotificationPreferences, struct{}{})
	matrixSave[notifications.UpdateNotificationPreferencesInput, notifications.NotificationPreferencesView, notifications.NotificationFailureBody](t, m, member, command.UpdateNotificationPreferences, notifications.UpdateNotificationPreferencesInput{
		UpdateNotificationPreferencesFields: notifications.UpdateNotificationPreferencesFields{
			NotificationPreferencesFields: notifications.NotificationPreferencesFields{
				InAppEnabled: true,
				Events: []notifications.Reason{
					notifications.Comment,
					notifications.Mention,
				},
				EmailMode:    notifications.EmailOff,
				DueReminders: true,
			},
			ExpectedRevision: prefs.Revision,
		},
		RetryReference: uuid.NewString(),
	})
}
