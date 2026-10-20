package planning

import (
	"encoding/json"
	"errors"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database"
	"gategoldjira/backend/internal/platform/httpapi"
	"github.com/danielgtaylor/huma/v2"
	"reflect"
)

type PlanningCurrent struct{ Value *PlanningItemView }

func (value PlanningCurrent) MarshalJSON() ([]byte, error) { return json.Marshal(value.Value) }
func (value *PlanningCurrent) UnmarshalJSON(data []byte) error {
	value.Value = nil
	if string(data) == "null" {
		return nil
	}
	parsed, err := database.DecodeJSON[PlanningItemView](data)
	if err != nil {
		return err
	}
	if err = validateItem(parsed); err != nil {
		return err
	}
	value.Value = &parsed
	return nil
}
func (PlanningCurrent) Schema(registry huma.Registry) *huma.Schema {
	return &huma.Schema{AnyOf: []*huma.Schema{
		registry.Schema(reflect.TypeFor[PlanningItemView](), true, ""),
		{Type: "null"},
	}}
}

type PlanningFailureBody struct {
	Error      command.Failure `json:"error"`
	Current    PlanningCurrent `json:"current"`
	Unfinished httpapi.Null    `json:"unfinished"`
}
type ConflictError struct {
	Failure *command.Failure
	Current *PlanningItemView
}

func (e *ConflictError) Error() string { return e.Failure.Message }
func (e *ConflictError) Unwrap() error { return e.Failure }
func validation(field, message string) error {
	return &command.Failure{
		Code:        command.Validation,
		Message:     message,
		FieldErrors: []command.FieldError{{Field: field, Message: message}},
		NextAction:  command.ReviewFields,
	}
}
func stale(view *PlanningItemView) error {
	return &ConflictError{
		Failure: &command.Failure{
			Code:        command.Conflict,
			Message:     "This planning record changed. Reload before saving again.",
			FieldErrors: []command.FieldError{},
			NextAction:  command.ReloadCurrentState,
		},
		Current: view,
	}
}
func unavailable() error {
	return &command.Failure{
		Code:        command.Unavailable,
		Message:     "The planning record is unavailable.",
		FieldErrors: []command.FieldError{},
		NextAction:  command.None,
	}
}
func failureBody(err error) PlanningFailureBody {
	safe := httpapi.Error(err)
	body := PlanningFailureBody{Error: safe.FailureBody.Error}
	var conflict *ConflictError
	if errors.As(err, &conflict) {
		body.Current.Value = conflict.Current
	}
	return body
}
func transportError(err error) error {
	body := failureBody(err)
	return &httpapi.TypedStatusError[PlanningFailureBody]{
		Payload: body,
		Status:  httpapi.Status(body.Error.Code),
		Message: body.Error.Message,
	}
}
