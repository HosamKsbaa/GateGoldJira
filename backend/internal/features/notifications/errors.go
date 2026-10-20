package notifications

import (
	"errors"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/httpapi"
)

type NotificationFailureBody struct {
	Error      command.Failure                    `json:"error"`
	Current    command.Nullable[NotificationView] `json:"current"`
	Unfinished httpapi.Null                       `json:"unfinished"`
}
type NotificationConflict struct {
	Failure *command.Failure
	Current *NotificationView
}

func (e *NotificationConflict) Error() string { return e.Failure.Message }
func (e *NotificationConflict) Unwrap() error { return e.Failure }
func failureBody(err error) NotificationFailureBody {
	body := NotificationFailureBody{Error: httpapi.Error(err).FailureBody.Error}
	var conflict *NotificationConflict
	if errors.As(err, &conflict) {
		body.Current.Value = conflict.Current
	}
	return body
}
func transportError(err error) error {
	body := failureBody(err)
	return &httpapi.TypedStatusError[NotificationFailureBody]{
		Payload: body,
		Status:  httpapi.Status(body.Error.Code),
		Message: body.Error.Message,
	}
}
