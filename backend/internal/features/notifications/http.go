package notifications

import (
	"context"
	"reflect"
	"strconv"

	"gategoldjira/backend/internal/platform/auth"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/httpapi"
	"github.com/danielgtaylor/huma/v2"
)

func operation(api huma.API, name command.Operation, method, path string) huma.Operation {
	responses := map[string]*huma.Response{}
	for _, status := range []int{400, 401, 403, 404, 409, 413, 422, 503} {
		responses[strconv.Itoa(status)] = &huma.Response{
			Description: "Safe typed failure",
			Content:     map[string]*huma.MediaType{"application/json": {Schema: api.OpenAPI().Components.Schemas.Schema(reflect.TypeFor[NotificationFailureBody](), true, "")}},
		}
	}
	return huma.Operation{OperationID: string(name), Method: method, Path: "/api/v1" + path, Responses: responses}
}
func registerRead[In, Out any](api huma.API, op huma.Operation, run func(context.Context, command.Actor, *In) (Out, error)) {
	huma.Register(api, op, func(ctx context.Context, in *In) (*struct{ Body Out }, error) {
		actor, err := auth.Actor(ctx)
		if err != nil {
			return nil, transportError(err)
		}
		out, err := run(ctx, actor, in)
		if err != nil {
			return nil, transportError(err)
		}
		return &struct{ Body Out }{out}, nil
	})
}
func registerSave[In, Out any](api huma.API, op huma.Operation, run func(context.Context, command.Actor, *In) (command.SaveOutcome[Out], error)) {
	huma.Register(api, op, func(ctx context.Context, in *In) (*struct {
		Status int
		Body   command.Saved[Out]
	}, error) {
		actor, err := auth.Actor(ctx)
		if err != nil {
			return nil, transportError(err)
		}
		out, err := run(ctx, actor, in)
		if err != nil {
			return nil, transportError(err)
		}
		return &struct {
			Status int
			Body   command.Saved[Out]
		}{out.HTTPStatus, out.Body}, nil
	})
}
func RegisterHTTP(api huma.API, s *Service) {
	registerRead(api, operation(api, command.GetNotificationPreferences, "GET", "/notifications/preferences"), func(ctx context.Context, a command.Actor, _ *struct{}) (NotificationPreferencesView, error) {
		return s.Preferences(ctx, a)
	})
	registerSave(api, operation(api, command.UpdateNotificationPreferences, "PUT", "/notifications/preferences"), func(ctx context.Context, a command.Actor, in *struct {
		httpapi.MutationHeader
		Body UpdateNotificationPreferencesFields
	}) (command.SaveOutcome[NotificationPreferencesView], error) {
		return s.UpdatePreferences(ctx, a, UpdateNotificationPreferencesInput{
			UpdateNotificationPreferencesFields: in.Body,
			RetryReference:                      in.RetryReference,
		})
	})
	registerRead(api, operation(api, command.GetInboxSummary, "GET", "/notifications/summary"), func(ctx context.Context, a command.Actor, _ *struct{}) (InboxSummary, error) {
		return s.Summary(ctx, a)
	})
	registerRead(api, operation(api, command.ListNotifications, "GET", "/notifications"), func(ctx context.Context, a command.Actor, in *struct {
		Limit      int    `query:"limit" default:"25" minimum:"1" maximum:"100"`
		Cursor     string `query:"cursor" minLength:"1" maxLength:"2048"`
		UnreadOnly bool   `query:"unreadOnly"`
	}) (command.Page[NotificationView], error) {
		page := command.PageRequest{Limit: &in.Limit}
		if in.Cursor != "" {
			page.Cursor = &in.Cursor
		}
		return s.List(ctx, a, ListInput{Page: page, UnreadOnly: in.UnreadOnly})
	})
	registerRead(api, operation(api, command.GetNotification, "GET", "/notifications/{notificationId}"), func(ctx context.Context, a command.Actor, in *struct {
		NotificationID command.NotificationID `path:"notificationId"`
	}) (NotificationView, error) {
		return s.Get(ctx, a, in.NotificationID)
	})
	registerSave(api, operation(api, command.SetNotificationRead, "PUT", "/notifications/{notificationId}/read-state"), func(ctx context.Context, a command.Actor, in *struct {
		httpapi.MutationHeader
		NotificationID command.NotificationID `path:"notificationId"`
		Body           SetReadFields
	}) (command.SaveOutcome[NotificationView], error) {
		return s.SetRead(ctx, a, SetReadInput{
			NotificationID: in.NotificationID,
			SetReadFields:  in.Body,
			RetryReference: in.RetryReference,
		})
	})
	registerSave(api, operation(api, command.MarkAllNotificationsRead, "POST", "/notifications/mark-all-read"), func(ctx context.Context, a command.Actor, in *struct{ httpapi.MutationHeader }) (command.SaveOutcome[MarkAllResult], error) {
		return s.MarkAll(ctx, a, MarkAllInput{RetryReference: in.RetryReference})
	})
}
