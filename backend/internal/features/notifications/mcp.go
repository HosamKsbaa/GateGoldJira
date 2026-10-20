package notifications

import (
	"context"
	"gategoldjira/backend/internal/platform/auth"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/mcpapi"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func RegisterMCP(server *mcp.Server, s *Service) error {
	if err := mcpapi.RegisterWithFailure(server, mcpapi.ToolOptions{
		Operation:   command.GetNotificationPreferences,
		Description: "Read your own notification event, inbox, email and due-reminder preferences. Email availability reflects deployment configuration.",
	}, func(ctx context.Context, _ struct{}) (NotificationPreferencesView, error) {
		a, err := auth.Actor(ctx)
		if err != nil {
			return NotificationPreferencesView{}, err
		}
		return s.Preferences(ctx, a)
	}, failureBody); err != nil {
		return err
	}
	if err := mcpapi.RegisterWithFailure(server, mcpapi.ToolOptions{
		Operation:   command.UpdateNotificationPreferences,
		Description: "Save your notification preferences with current revision and retry reference. Applies to new events; email delivery requires a configured sender. Due reminders use your selected channels for assigned or reported issues due today.",
	}, func(ctx context.Context, in UpdateNotificationPreferencesInput) (command.Saved[NotificationPreferencesView], error) {
		a, err := auth.Actor(ctx)
		if err != nil {
			return command.Saved[NotificationPreferencesView]{}, err
		}
		out, err := s.UpdatePreferences(ctx, a, in)
		return out.Body, err
	}, failureBody); err != nil {
		return err
	}
	if err := mcpapi.RegisterWithFailure(server, mcpapi.ToolOptions{
		Operation:   command.GetInboxSummary,
		Description: "Read your current accessible unread count and company calendar date. Other users and revoked projects are excluded.",
	}, func(ctx context.Context, _ struct{}) (InboxSummary, error) {
		a, err := auth.Actor(ctx)
		if err != nil {
			return InboxSummary{}, err
		}
		return s.Summary(ctx, a)
	}, failureBody); err != nil {
		return err
	}
	if err := mcpapi.RegisterWithFailure(server, mcpapi.ToolOptions{
		Operation:   command.ListNotifications,
		Description: "Read your private newest-first inbox, with bounded cursor pages and an optional unread-only filter. Only currently accessible projects are included.",
	}, func(ctx context.Context, in ListInput) (command.Page[NotificationView], error) {
		a, err := auth.Actor(ctx)
		if err != nil {
			return command.Page[NotificationView]{}, err
		}
		return s.List(ctx, a, in)
	}, failureBody); err != nil {
		return err
	}
	if err := mcpapi.RegisterWithFailure(server, mcpapi.ToolOptions{
		Operation:   command.GetNotification,
		Description: "Read one of your notifications without changing its read state. Unknown, foreign and inaccessible notifications share an unavailable outcome.",
	}, func(ctx context.Context, in GetInput) (NotificationView, error) {
		a, err := auth.Actor(ctx)
		if err != nil {
			return NotificationView{}, err
		}
		return s.Get(ctx, a, in.NotificationID)
	}, failureBody); err != nil {
		return err
	}
	if err := mcpapi.RegisterWithFailure(server, mcpapi.ToolOptions{
		Operation:   command.SetNotificationRead,
		Description: "Set your notification read or unread using its current revision. Viewer access is sufficient for your own inbox. Retry the original reference after an uncertain response; this produces no further notifications.",
	}, func(ctx context.Context, in SetReadInput) (command.Saved[NotificationView], error) {
		a, err := auth.Actor(ctx)
		if err != nil {
			return command.Saved[NotificationView]{}, err
		}
		out, err := s.SetRead(ctx, a, in)
		return out.Body, err
	}, failureBody); err != nil {
		return err
	}
	return mcpapi.RegisterWithFailure(server, mcpapi.ToolOptions{
		Operation:   command.MarkAllNotificationsRead,
		Description: "Mark your currently accessible inbox snapshot read, returning only your changed count and summary. No recipient override, sending or notification loop is supported.",
	}, func(ctx context.Context, in MarkAllInput) (command.Saved[MarkAllResult], error) {
		a, err := auth.Actor(ctx)
		if err != nil {
			return command.Saved[MarkAllResult]{}, err
		}
		out, err := s.MarkAll(ctx, a, in)
		return out.Body, err
	}, failureBody)
}
