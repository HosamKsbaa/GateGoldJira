package comments

import (
	"errors"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/httpapi"
)

type CommentFailureBody struct {
	Error      command.Failure               `json:"error"`
	Current    command.Nullable[CommentView] `json:"current"`
	Unfinished httpapi.Null                  `json:"unfinished"`
}
type CommentConflict struct {
	Failure *command.Failure
	Current *CommentView
}

func (e *CommentConflict) Error() string { return e.Failure.Message }
func (e *CommentConflict) Unwrap() error { return e.Failure }
func conflict(view CommentView) error {
	return &CommentConflict{
		Failure: &command.Failure{
			Code:        command.Conflict,
			Message:     "This comment changed. Review its current version before saving.",
			FieldErrors: []command.FieldError{},
			NextAction:  command.ReloadCurrentState,
		},
		Current: &view,
	}
}
func failureBody(err error) CommentFailureBody {
	body := CommentFailureBody{Error: httpapi.Error(err).FailureBody.Error}
	var conflict *CommentConflict
	if errors.As(err, &conflict) {
		body.Current.Value = conflict.Current
	}
	return body
}
func transportError(err error) error {
	body := failureBody(err)
	return &httpapi.TypedStatusError[CommentFailureBody]{
		Payload: body,
		Status:  httpapi.Status(body.Error.Code),
		Message: body.Error.Message,
	}
}
