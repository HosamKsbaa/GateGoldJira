package issues

import (
	"errors"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/httpapi"
	"github.com/danielgtaylor/huma/v2"
)

type ModernIssueFailureBody struct {
	Error      command.Failure                                    `json:"error"`
	Current    command.Nullable[ModernIssueView]                  `json:"current"`
	Unfinished command.Nullable[command.Page[ModernIssueSummary]] `json:"unfinished"`
}

func modernFailureBody(err error) ModernIssueFailureBody {
	out := ModernIssueFailureBody{Error: httpapi.Error(err).FailureBody.Error}
	var conflict *ModernIssueConflict
	if errors.As(err, &conflict) {
		out.Current.Value = &conflict.Current
	}
	var prerequisite *ModernPrerequisiteFailure
	if errors.As(err, &prerequisite) {
		out.Current.Value = &prerequisite.Current
		out.Unfinished = prerequisite.Unfinished
	}
	return out
}
func modernTransportError(err error) huma.StatusError {
	body := modernFailureBody(err)
	return &httpapi.TypedStatusError[ModernIssueFailureBody]{
		Payload: body,
		Status:  httpapi.Status(body.Error.Code),
		Message: body.Error.Message,
	}
}
