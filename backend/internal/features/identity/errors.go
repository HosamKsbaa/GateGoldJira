package identity

import (
	"encoding/json"
	"errors"
	"reflect"

	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database"
	"gategoldjira/backend/internal/platform/httpapi"
	"github.com/danielgtaylor/huma/v2"
)

type Current = IdentityCurrent
type IdentityCurrent struct {
	User       *UserView
	Membership *MembershipView
}

func (current *IdentityCurrent) UnmarshalJSON(data []byte) error {
	*current = IdentityCurrent{}
	if string(data) == "null" {
		return nil
	}
	var discriminator struct {
		ID        *command.UserID    `json:"id"`
		ProjectID *command.ProjectID `json:"projectId"`
	}
	if err := json.Unmarshal(data, &discriminator); err != nil {
		return err
	}
	if discriminator.ID != nil && discriminator.ProjectID == nil {
		user, err := database.DecodeJSON[UserView](data)
		if err != nil {
			return err
		}
		if err := validateUser(user); err != nil {
			return err
		}
		current.User = &user
		return nil
	}
	if discriminator.ProjectID != nil && discriminator.ID == nil {
		membership, err := database.DecodeJSON[MembershipView](data)
		if err != nil {
			return err
		}
		if err := validateMembership(membership); err != nil {
			return err
		}
		current.Membership = &membership
		return nil
	}
	return errors.New("conflict must contain one concrete record or null")
}

func (current IdentityCurrent) MarshalJSON() ([]byte, error) {
	if current.User != nil && current.Membership == nil {
		return json.Marshal(current.User)
	}
	if current.Membership != nil && current.User == nil {
		return json.Marshal(current.Membership)
	}
	return []byte("null"), nil
}
func (IdentityCurrent) Schema(registry huma.Registry) *huma.Schema {
	return &huma.Schema{AnyOf: []*huma.Schema{
		registry.Schema(reflect.TypeFor[UserView](), true, ""),
		registry.Schema(reflect.TypeFor[MembershipView](), true, ""),
		{Type: "null"},
	}}
}

type FailureBody = IdentityFailureBody
type IdentityFailureBody struct {
	Error      command.Failure `json:"error"`
	Current    Current         `json:"current"`
	Unfinished httpapi.Null    `json:"unfinished"`
}
type ConflictError struct {
	Failure *command.Failure
	Current Current
}

func (err *ConflictError) Error() string { return err.Failure.Message }
func (err *ConflictError) Unwrap() error { return err.Failure }
func conflict(current Current) error {
	return &ConflictError{
		Failure: &command.Failure{
			Code:        command.Conflict,
			Message:     "This record changed. Review its current values before saving a new intention.",
			FieldErrors: []command.FieldError{},
			NextAction:  command.ReloadCurrentState,
		},
		Current: current,
	}
}
func failureBody(err error) FailureBody {
	safe := httpapi.Error(err)
	body := FailureBody{Error: safe.FailureBody.Error}
	var current *ConflictError
	if errors.As(err, &current) {
		body.Current = current.Current
	}
	return body
}
func transportError(err error) error {
	body := failureBody(err)
	return &httpapi.TypedStatusError[FailureBody]{
		Payload: body,
		Status:  httpapi.Status(body.Error.Code),
		Message: body.Error.Message,
	}
}
