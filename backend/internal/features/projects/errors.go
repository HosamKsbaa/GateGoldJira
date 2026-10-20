package projects

import (
	"encoding/json"
	"errors"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database"
	"gategoldjira/backend/internal/platform/httpapi"
	"github.com/danielgtaylor/huma/v2"
	"reflect"
)

type ProjectCurrent struct{ Value *ProjectView }

func (current ProjectCurrent) MarshalJSON() ([]byte, error) { return json.Marshal(current.Value) }
func (current *ProjectCurrent) UnmarshalJSON(data []byte) error {
	current.Value = nil
	if string(data) == "null" {
		return nil
	}
	view, err := database.DecodeJSON[ProjectView](data)
	if err != nil {
		return err
	}
	if err := validateView(view); err != nil {
		return err
	}
	current.Value = &view
	return nil
}
func (ProjectCurrent) Schema(registry huma.Registry) *huma.Schema {
	return &huma.Schema{AnyOf: []*huma.Schema{registry.Schema(reflect.TypeFor[ProjectView](), true, ""), {Type: "null"}}}
}

type ProjectFailureBody struct {
	Error      command.Failure `json:"error"`
	Current    ProjectCurrent  `json:"current"`
	Unfinished httpapi.Null    `json:"unfinished"`
}
type ConflictError struct {
	Failure *command.Failure
	Current *ProjectView
}

func (failure *ConflictError) Error() string { return failure.Failure.Message }
func (failure *ConflictError) Unwrap() error { return failure.Failure }
func conflict(view ProjectView) error {
	return &ConflictError{
		Failure: &command.Failure{
			Code:        command.Conflict,
			Message:     "This project changed. Review its current values before saving.",
			FieldErrors: []command.FieldError{},
			NextAction:  command.ReloadCurrentState,
		},
		Current: &view,
	}
}
func validation(field, message string) error {
	return &command.Failure{
		Code:        command.Validation,
		Message:     message,
		FieldErrors: []command.FieldError{{Field: field, Message: message}},
		NextAction:  command.ReviewFields,
	}
}
func failureBody(err error) ProjectFailureBody {
	safe := httpapi.Error(err)
	body := ProjectFailureBody{Error: safe.FailureBody.Error}
	var conflict *ConflictError
	if errors.As(err, &conflict) {
		body.Current.Value = conflict.Current
	}
	return body
}
func transportError(err error) error {
	body := failureBody(err)
	return &httpapi.TypedStatusError[ProjectFailureBody]{
		Payload: body,
		Status:  httpapi.Status(body.Error.Code),
		Message: body.Error.Message,
	}
}
