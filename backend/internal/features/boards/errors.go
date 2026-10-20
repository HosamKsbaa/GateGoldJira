package boards

import (
	"errors"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/httpapi"
)

type BoardConflict = command.BoardConflict
type BoardFailureBody struct {
	Error      command.Failure                `json:"error"`
	Current    command.Nullable[BoardSummary] `json:"current"`
	Unfinished httpapi.Null                   `json:"unfinished"`
}

func boardConflict(board BoardSummary) error {
	return &command.BoardConflict{
		Failure: &command.Failure{
			Code:        command.Conflict,
			Message:     "This board changed. Review its current settings before saving.",
			FieldErrors: []command.FieldError{},
			NextAction:  command.ReloadCurrentState,
		},
		Current: &board,
	}
}
func failureBody(err error) BoardFailureBody {
	body := BoardFailureBody{Error: httpapi.Error(err).FailureBody.Error}
	var current *command.BoardConflict
	if errors.As(err, &current) {
		body.Current.Value = current.Current
	}
	return body
}
func transportError(err error) error {
	body := failureBody(err)
	return &httpapi.TypedStatusError[BoardFailureBody]{
		Payload: body,
		Status:  httpapi.Status(body.Error.Code),
		Message: body.Error.Message,
	}
}
