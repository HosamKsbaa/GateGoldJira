package configuration

import (
	"errors"
	"gategoldjira/backend/internal/platform/httpapi"
)

func failureBody(err error) ConfigurationFailureBody {
	safe := httpapi.Error(err)
	body := ConfigurationFailureBody{Error: safe.FailureBody.Error}
	var conflict *Conflict
	if errors.As(err, &conflict) {
		body.Current.Value = &conflict.Current
	}
	return body
}
func transportError(err error) error {
	body := failureBody(err)
	return &httpapi.TypedStatusError[ConfigurationFailureBody]{
		Payload: body,
		Status:  httpapi.Status(body.Error.Code),
		Message: body.Error.Message,
	}
}
