package httpapi

import (
	"errors"
	"net/http"

	"gategoldjira/backend/internal/platform/command"
	"github.com/danielgtaylor/huma/v2"
)

// A generic transport failure has no authorized current business record.
// Feature adapters may return their concrete typed conflict/prerequisite body.
type Null struct{}

func (Null) MarshalJSON() ([]byte, error)      { return []byte("null"), nil }
func (Null) Schema(huma.Registry) *huma.Schema { return &huma.Schema{Type: "null"} }

type FailureBody struct {
	Error      command.Failure `json:"error"`
	Current    Null            `json:"current"`
	Unfinished Null            `json:"unfinished"`
}
type StatusError struct {
	FailureBody
	Status int `json:"-"`
}

func (failure *StatusError) Error() string  { return failure.FailureBody.Error.Message }
func (failure *StatusError) GetStatus() int { return failure.Status }
func Status(code command.FailureCode) int {
	switch code {
	case command.Unauthenticated:
		return http.StatusUnauthorized
	case command.AccountInactive, command.Forbidden:
		return http.StatusForbidden
	case command.Unavailable:
		return http.StatusNotFound
	case command.Conflict, command.Prerequisite, command.RetryReferenceReused:
		return http.StatusConflict
	case command.Validation:
		return http.StatusUnprocessableEntity
	default:
		return http.StatusServiceUnavailable
	}
}
func Error(err error) *StatusError {
	var failure *command.Failure
	if !errors.As(err, &failure) {
		failure = &command.Failure{
			Code:        command.Busy,
			Message:     "The operation could not be confirmed. Retry the original request.",
			FieldErrors: []command.FieldError{},
			Retryable:   true,
			NextAction:  command.RetrySameReference,
		}
	}
	copy := *failure
	if copy.FieldErrors == nil {
		copy.FieldErrors = []command.FieldError{}
	}
	return &StatusError{FailureBody: FailureBody{Error: copy}, Status: Status(failure.Code)}
}
func validationError(status int, details ...error) *StatusError {
	code, next, message := command.Validation, command.ReviewFields, "The request is invalid."
	if status == 401 {
		code, next, message = command.Unauthenticated, command.SignIn, "Sign in with a valid access token."
	}
	if status == 403 {
		code, next, message = command.Forbidden, command.None, "The request is not permitted."
	}
	if status == 404 {
		code, next, message = command.Unavailable, command.None, "The record is unavailable."
	}
	if status >= 500 {
		code, next, message = command.Busy, command.RetrySameReference, "The operation could not be confirmed. Retry the original request."
	}
	fields := []command.FieldError{}
	for _, detail := range details {
		var typed huma.ErrorDetailer
		if errors.As(detail, &typed) {
			entry := typed.ErrorDetail()
			// Never echo the input value, SQL message, token or raw parser error.
			if entry != nil && entry.Location != "" && len(fields) < 100 {
				fields = append(fields, command.FieldError{Field: entry.Location, Message: "Invalid request field."})
			}
		}
	}
	return &StatusError{
		FailureBody: FailureBody{Error: command.Failure{
			Code:        code,
			Message:     message,
			FieldErrors: fields,
			Retryable:   status >= 500,
			NextAction:  next,
		}},
		Status: status,
	}
}
func init() {
	// Huma's documented customization point also covers parsing/validation errors.
	huma.NewError = func(status int, _ string, details ...error) huma.StatusError {
		return validationError(status, details...)
	}
}
