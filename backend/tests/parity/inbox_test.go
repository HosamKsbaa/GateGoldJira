package parity

import (
	"gategoldjira/backend/internal/features/comments"
	"gategoldjira/backend/internal/features/identity"
	"gategoldjira/backend/internal/features/issues"
	"gategoldjira/backend/internal/features/notifications"
	"gategoldjira/backend/internal/features/projects"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/httpapi"
	"gategoldjira/backend/tests/testapp"
	"github.com/google/uuid"
	"testing"
)

func TestPrivateInboxMentionsReadStateAndRestartShareRESTAndMCP(t *testing.T) {
	r := testapp.NewRuntime(t)
	admin := reference(t, r, r.Admin)
	project := call[projects.CreateInput, command.Saved[projects.ProjectView], httpapi.FailureBody](t, admin, command.CreateProject, projects.CreateInput{
		Key:            "NOTICE",
		Name:           "الإشعارات",
		RetryReference: uuid.NewString(),
	})
	if !project.OK {
		t.Fatal(project.Error)
	}
	id := project.Data.Result.ID
	for i, user := range []command.UserID{r.Member, r.Viewer} {
		role := command.Member
		if i == 1 {
			role = command.Viewer
		}
		saved := call[identity.SetMembershipInput, command.Saved[identity.MembershipView], httpapi.FailureBody](t, admin, command.SetMembership, identity.SetMembershipInput{
			ProjectID:      id,
			UserID:         user,
			Role:           role,
			RetryReference: uuid.NewString(),
		})
		if !saved.OK {
			t.Fatal(saved.Error)
		}
	}
	member, viewer := reference(t, r, r.Member), reference(t, r, r.Viewer)
	issue := call[issues.CreateInput, command.Saved[issues.IssueView], issues.IssueFailureBody](t, member, command.CreateIssue, issues.CreateInput{
		ProjectID: id,
		CreateIssueFields: issues.CreateIssueFields{
			Title:      "عمل عربي",
			AssigneeID: &r.Admin,
		},
		RetryReference: uuid.NewString(),
	})
	if !issue.OK {
		t.Fatal(issue.Error)
	}
	comment := call[comments.CreateInput, command.Saved[comments.CommentView], comments.CommentFailureBody](t, admin, command.CreateComment, comments.CreateInput{
		IssueID: issue.Data.Result.Summary.ID,
		Body: comments.Body{
			HTML:           `<p>مرحبا <span data-user-id="` + r.Viewer.String() + `">forged label</span> @plain-text</p>`,
			MentionUserIDs: []command.UserID{r.Viewer},
			PictureIDs:     []command.PictureID{},
		},
		RetryReference: uuid.NewString(),
	})
	if !comment.OK || comment.Data.Result.Mentions[0].DisplayLabel != "Viewer" {
		t.Fatal("server-controlled mention", comment.Error)
	}
	list := call[notifications.ListInput, command.Page[notifications.NotificationView], notifications.NotificationFailureBody](t, viewer, command.ListNotifications, notifications.ListInput{UnreadOnly: true})
	if !list.OK || list.Data.TotalMatching != 1 || list.Data.Items[0].Reasons[0] != notifications.Mention {
		t.Fatal("Viewer mention", list.Error)
	}
	notice := list.Data.Items[0]
	read := call[notifications.GetInput, notifications.NotificationView, notifications.NotificationFailureBody](t, viewer, command.GetNotification, notifications.GetInput{NotificationID: notice.ID})
	if !read.OK || read.Data.ReadAt != nil {
		t.Fatal("GET mutated read state")
	}
	denied := call[notifications.GetInput, notifications.NotificationView, notifications.NotificationFailureBody](t, admin, command.GetNotification, notifications.GetInput{NotificationID: notice.ID})
	if denied.OK || denied.Error.Error.Code != command.Unavailable {
		t.Fatal("Admin read another user's inbox")
	}
	input := notifications.SetReadInput{
		NotificationID: notice.ID,
		SetReadFields: notifications.SetReadFields{
			ExpectedRevision: notice.Revision,
			Read:             true,
		},
		RetryReference: uuid.NewString(),
	}
	saved := call[notifications.SetReadInput, command.Saved[notifications.NotificationView], notifications.NotificationFailureBody](t, viewer, command.SetNotificationRead, input)
	if !saved.OK || saved.Data.Result.ReadAt == nil {
		t.Fatal("read mutation", saved.Error)
	}
	again, status := rest[notifications.SetReadFields, command.Saved[notifications.NotificationView]](t, r, r.Viewer, "PUT", "/notifications/"+notice.ID.String()+"/read-state", input.RetryReference, input.SetReadFields)
	if status != 200 || !again.Receipt.Replayed || *again.Receipt.EventID != *saved.Data.Receipt.EventID {
		t.Fatal("read replay", status)
	}
	unread, status := rest[notifications.SetReadFields, command.Saved[notifications.NotificationView]](t, r, r.Viewer, "PUT", "/notifications/"+notice.ID.String()+"/read-state", uuid.NewString(), notifications.SetReadFields{
		ExpectedRevision: again.Result.Revision,
		Read:             false,
	})
	if status != 200 || unread.Result.ReadAt != nil {
		t.Fatal("unread", status)
	}
	allInput := notifications.MarkAllInput{RetryReference: uuid.NewString()}
	all := call[notifications.MarkAllInput, command.Saved[notifications.MarkAllResult], notifications.NotificationFailureBody](t, viewer, command.MarkAllNotificationsRead, allInput)
	if !all.OK || all.Data.Result.ChangedCount != 1 || all.Data.Result.Inbox.UnreadCount != 0 {
		t.Fatal("mark-all", all.Error)
	}
	r.Restart(t)
	allReplay, status := rest[struct{}, command.Saved[notifications.MarkAllResult]](t, r, r.Viewer, "POST", "/notifications/mark-all-read", allInput.RetryReference, struct{}{})
	if status != 200 || !allReplay.Receipt.Replayed {
		t.Fatal("mark-all restart retry", status)
	}
	other := call[struct{}, notifications.InboxSummary, notifications.NotificationFailureBody](t, member, command.GetInboxSummary, struct{}{})
	if !other.OK || other.Data.UnreadCount != 1 {
		t.Fatal("private read state", other.Error)
	}
	revoked := call[identity.RemoveMembershipInput, command.Saved[identity.MembershipView], httpapi.FailureBody](t, admin, command.RemoveMembership, identity.RemoveMembershipInput{
		ProjectID:        id,
		UserID:           r.Viewer,
		ExpectedRevision: 1,
		RetryReference:   uuid.NewString(),
	})
	if !revoked.OK {
		t.Fatal(revoked.Error)
	}
	hidden := call[struct{}, notifications.InboxSummary, notifications.NotificationFailureBody](t, viewer, command.GetInboxSummary, struct{}{})
	if !hidden.OK || hidden.Data.UnreadCount != 0 {
		t.Fatal("hidden inbox count")
	}
	replayDenied := call[notifications.SetReadInput, command.Saved[notifications.NotificationView], notifications.NotificationFailureBody](t, viewer, command.SetNotificationRead, input)
	if replayDenied.OK || replayDenied.Error.Error.Code != command.Unavailable {
		t.Fatal("revoked read replay")
	}
	update := call[comments.UpdateInput, command.Saved[comments.CommentView], comments.CommentFailureBody](t, admin, command.UpdateComment, comments.UpdateInput{
		CommentID:        comment.Data.Result.ID,
		ExpectedRevision: comment.Data.Result.Revision,
		Body: comments.Body{
			HTML:           comment.Data.Result.SafeHTML + "<p>Retained historical mention</p>",
			MentionUserIDs: []command.UserID{r.Viewer},
			PictureIDs:     []command.PictureID{},
		},
		RetryReference: uuid.NewString(),
	})
	if !update.OK {
		t.Fatal("retained mention edit", update.Error)
	}
	other = call[struct{}, notifications.InboxSummary, notifications.NotificationFailureBody](t, member, command.GetInboxSummary, struct{}{})
	if !other.OK || other.Data.UnreadCount != 1 {
		t.Fatal("edit notified an old recipient")
	}
}
