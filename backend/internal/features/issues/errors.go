package issues

import (
	"encoding/json"
	"errors"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database"
	"gategoldjira/backend/internal/platform/httpapi"
	"github.com/danielgtaylor/huma/v2"
	"reflect"
)

type IssueCurrent struct {
	Issue      *IssueView
	Board      *command.BoardSummary
	Dependency *DependencyView
}

func (current IssueCurrent) MarshalJSON() ([]byte, error) {
	if current.Issue != nil && current.Board == nil && current.Dependency == nil {
		return json.Marshal(current.Issue)
	}
	if current.Board != nil && current.Issue == nil && current.Dependency == nil {
		return json.Marshal(current.Board)
	}
	if current.Dependency != nil && current.Issue == nil && current.Board == nil {
		return json.Marshal(current.Dependency)
	}
	if current.Issue != nil || current.Board != nil || current.Dependency != nil {
		return nil, errors.New("ambiguous current record")
	}
	return []byte("null"), nil
}
func (current *IssueCurrent) UnmarshalJSON(data []byte) error {
	*current = IssueCurrent{}
	if string(data) == "null" {
		return nil
	}
	var kind struct {
		Summary   *json.RawMessage `json:"summary"`
		ID        *command.BoardID `json:"id"`
		Dependent *json.RawMessage `json:"dependent"`
	}
	if err := json.Unmarshal(data, &kind); err != nil {
		return err
	}
	if kind.Summary != nil && kind.ID == nil && kind.Dependent == nil {
		v, err := database.DecodeJSON[IssueView](data)
		if err != nil {
			return err
		}
		if err = validateView(v); err != nil {
			return err
		}
		current.Issue = &v
		return nil
	}
	if kind.ID != nil && kind.Summary == nil && kind.Dependent == nil {
		v, err := database.DecodeJSON[command.BoardSummary](data)
		if err != nil {
			return err
		}
		if v.Revision < 1 {
			return errors.New("invalid current board")
		}
		current.Board = &v
		return nil
	}
	if kind.Dependent != nil && kind.Summary == nil && kind.ID == nil {
		v, err := database.DecodeJSON[DependencyView](data)
		if err != nil {
			return err
		}
		if err = validateDependency(v); err != nil {
			return err
		}
		current.Dependency = &v
		return nil
	}
	return errors.New("current must contain one concrete issue, board, dependency or null")
}
func (IssueCurrent) Schema(registry huma.Registry) *huma.Schema {
	return &huma.Schema{AnyOf: []*huma.Schema{
		registry.Schema(reflect.TypeFor[IssueView](), true, ""),
		registry.Schema(reflect.TypeFor[command.BoardSummary](), true, ""),
		registry.Schema(reflect.TypeFor[DependencyView](), true, ""),
		{Type: "null"},
	}}
}

type IssueFailureBody struct {
	Error      command.Failure                              `json:"error"`
	Current    IssueCurrent                                 `json:"current"`
	Unfinished command.Nullable[command.Page[IssueSummary]] `json:"unfinished"`
}
type IssueConflict struct {
	Failure *command.Failure
	Current *IssueView
}

func (e *IssueConflict) Error() string { return e.Failure.Message }
func (e *IssueConflict) Unwrap() error { return e.Failure }

type DependencyConflict struct {
	Failure *command.Failure
	Current *DependencyView
}

func (e *DependencyConflict) Error() string { return e.Failure.Message }
func (e *DependencyConflict) Unwrap() error { return e.Failure }

type PrerequisiteFailure struct {
	Failure    *command.Failure
	Current    *IssueView
	Unfinished *command.Page[IssueSummary]
}

func (e *PrerequisiteFailure) Error() string { return e.Failure.Message }
func (e *PrerequisiteFailure) Unwrap() error { return e.Failure }
func conflict(v IssueView) error {
	return &IssueConflict{
		Failure: &command.Failure{
			Code:        command.Conflict,
			Message:     "This issue changed. Review its current values before saving.",
			FieldErrors: []command.FieldError{},
			NextAction:  command.ReloadCurrentState,
		},
		Current: &v,
	}
}
func failureBody(err error) IssueFailureBody {
	body := IssueFailureBody{Error: httpapi.Error(err).FailureBody.Error}
	var conflict *IssueConflict
	if errors.As(err, &conflict) {
		body.Current.Issue = conflict.Current
	}
	var board *command.BoardConflict
	if errors.As(err, &board) {
		body.Current.Board = board.Current
	}
	var dependency *DependencyConflict
	if errors.As(err, &dependency) {
		body.Current.Dependency = dependency.Current
	}
	var prerequisite *PrerequisiteFailure
	if errors.As(err, &prerequisite) {
		body.Current.Issue = prerequisite.Current
		body.Unfinished.Value = prerequisite.Unfinished
	}
	return body
}
func transportError(err error) error {
	body := failureBody(err)
	return &httpapi.TypedStatusError[IssueFailureBody]{
		Payload: body,
		Status:  httpapi.Status(body.Error.Code),
		Message: body.Error.Message,
	}
}
