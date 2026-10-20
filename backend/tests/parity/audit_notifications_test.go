package parity

import (
	"context"
	"reflect"
	"testing"
	"time"

	"gategoldjira/backend/internal/features/identity"
	"gategoldjira/backend/internal/features/issues"
	"gategoldjira/backend/internal/features/notifications"
	"gategoldjira/backend/internal/features/projects"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/httpapi"
	"gategoldjira/backend/tests/testapp"
	"github.com/google/uuid"
)

func TestNotificationPreferencesAndScheduledRemindersShareRESTAndMCP(t *testing.T) {
	r := testapp.NewRuntime(t)
	admin, member := reference(t, r, r.Admin), reference(t, r, r.Member)
	before := call[struct{}, notifications.NotificationPreferencesView, notifications.NotificationFailureBody](t, member, command.GetNotificationPreferences, struct{}{})
	web, status := rest[struct{}, notifications.NotificationPreferencesView](t, r, r.Member, "GET", "/notifications/preferences", "", struct{}{})
	if !before.OK || status != 200 || !reflect.DeepEqual(*before.Data, web) {
		t.Fatal("preference read parity", status, before.Error)
	}
	in := notifications.UpdateNotificationPreferencesInput{
		UpdateNotificationPreferencesFields: notifications.UpdateNotificationPreferencesFields{
			NotificationPreferencesFields: notifications.NotificationPreferencesFields{
				InAppEnabled: true,
				Events: []notifications.Reason{
					notifications.Mention,
					notifications.DueDate,
				},
				EmailMode:    notifications.EmailOff,
				DueReminders: true,
			},
			ExpectedRevision: web.Revision,
		},
		RetryReference: uuid.NewString(),
	}
	saved := call[notifications.UpdateNotificationPreferencesInput, command.Saved[notifications.NotificationPreferencesView], notifications.NotificationFailureBody](t, member, command.UpdateNotificationPreferences, in)
	if !saved.OK || saved.Data.Result.Revision != 2 || saved.Data.Receipt.EventID == nil {
		t.Fatal("preference MCP save", saved.Error)
	}
	r.Restart(t)
	replay, status := rest[notifications.UpdateNotificationPreferencesFields, command.Saved[notifications.NotificationPreferencesView]](t, r, r.Member, "PUT", "/notifications/preferences", in.RetryReference, in.UpdateNotificationPreferencesFields)
	if status != 200 || !replay.Receipt.Replayed || !reflect.DeepEqual(saved.Data.Result, replay.Result) || *replay.Receipt.EventID != *saved.Data.Receipt.EventID {
		t.Fatal("restart and cross-transport preference replay", status)
	}
	stale, status := rest[notifications.UpdateNotificationPreferencesFields, notifications.NotificationFailureBody](t, r, r.Member, "PUT", "/notifications/preferences", uuid.NewString(), in.UpdateNotificationPreferencesFields)
	if status != 409 || stale.Error.Code != command.Conflict {
		t.Fatal("stale REST preferences", status)
	}
	project := call[projects.CreateInput, command.Saved[projects.ProjectView], httpapi.FailureBody](t, admin, command.CreateProject, projects.CreateInput{
		Key:            "DUE",
		Name:           "Due work",
		RetryReference: uuid.NewString(),
	})
	if !project.OK {
		t.Fatal(project.Error)
	}
	id := project.Data.Result.ID
	access := call[identity.SetMembershipInput, command.Saved[identity.MembershipView], httpapi.FailureBody](t, admin, command.SetMembership, identity.SetMembershipInput{
		ProjectID:      id,
		UserID:         r.Member,
		Role:           command.Member,
		RetryReference: uuid.NewString(),
	})
	if !access.OK {
		t.Fatal(access.Error)
	}
	location, err := time.LoadLocation("Africa/Cairo")
	if err != nil {
		t.Fatal(err)
	}
	today := command.Today(time.Now(), location)
	issue := call[issues.CreateInput, command.Saved[issues.IssueView], issues.IssueFailureBody](t, admin, command.CreateIssue, issues.CreateInput{
		ProjectID: id,
		CreateIssueFields: issues.CreateIssueFields{
			Title:      "Reminder parity عربي",
			AssigneeID: &r.Member,
			DueDate:    &today,
		},
		RetryReference: uuid.NewString(),
	})
	if !issue.OK {
		t.Fatal(issue.Error)
	}
	worker, err := notifications.NewWorker(r.Pool, nil, "https://fixture.test")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = worker.RunOnce(context.Background(), today); err != nil {
		t.Fatal(err)
	}
	inbox := call[notifications.ListInput, command.Page[notifications.NotificationView], notifications.NotificationFailureBody](t, member, command.ListNotifications, notifications.ListInput{})
	inboxWeb, status := rest[struct{}, command.Page[notifications.NotificationView]](t, r, r.Member, "GET", "/notifications", "", struct{}{})
	if !inbox.OK || status != 200 || !reflect.DeepEqual(*inbox.Data, inboxWeb) || len(inboxWeb.Items) != 1 || inboxWeb.Items[0].Actor.DisplayName != "GateGoldJira reminder" {
		t.Fatal("reminder inbox parity", status, inbox.Error)
	}
	if _, err = worker.RunOnce(context.Background(), today); err != nil {
		t.Fatal(err)
	}
	inboxWeb, status = rest[struct{}, command.Page[notifications.NotificationView]](t, r, r.Member, "GET", "/notifications", "", struct{}{})
	if status != 200 || inboxWeb.TotalMatching != 1 {
		t.Fatal("reminder duplicated", status)
	}
	removed := call[identity.RemoveMembershipInput, command.Saved[identity.MembershipView], httpapi.FailureBody](t, admin, command.RemoveMembership, identity.RemoveMembershipInput{
		ProjectID:        id,
		UserID:           r.Member,
		ExpectedRevision: 1,
		RetryReference:   uuid.NewString(),
	})
	if !removed.OK {
		t.Fatal(removed.Error)
	}
	inboxWeb, status = rest[struct{}, command.Page[notifications.NotificationView]](t, r, r.Member, "GET", "/notifications", "", struct{}{})
	if status != 200 || inboxWeb.TotalMatching != 0 {
		t.Fatal("revoked reminder exposed", status)
	}
}
