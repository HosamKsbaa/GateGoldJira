package issues

import "gategoldjira/backend/internal/platform/command"

type ModernIssueConflict struct {
	Failure *command.Failure
	Current ModernIssueView
}

func (e *ModernIssueConflict) Error() string { return e.Failure.Message }
func (e *ModernIssueConflict) Unwrap() error { return e.Failure }
func modernConflict(current ModernIssueView) error {
	return &ModernIssueConflict{
		Failure: &command.Failure{
			Code:        command.Conflict,
			Message:     "The issue changed. Review the current fields before saving.",
			FieldErrors: []command.FieldError{},
			NextAction:  command.ReloadCurrentState,
		},
		Current: current,
	}
}

type ModernPrerequisiteFailure struct {
	Failure    *command.Failure
	Current    ModernIssueView
	Unfinished command.Nullable[command.Page[ModernIssueSummary]]
}

func (e *ModernPrerequisiteFailure) Error() string { return e.Failure.Message }
func (e *ModernPrerequisiteFailure) Unwrap() error { return e.Failure }
