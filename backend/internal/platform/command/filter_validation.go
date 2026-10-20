package command

import "errors"

func uniqueIDs[K comparable](ids []ID[K], limit int) bool {
	if len(ids) > limit {
		return false
	}
	for i, id := range ids {
		if id.UUID == [16]byte{} {
			return false
		}
		for _, prior := range ids[:i] {
			if prior == id {
				return false
			}
		}
	}
	return true
}

func (filter IssueFilter) Validate() error {
	if !uniqueIDs(filter.TypeIDs, 100) || !uniqueIDs(filter.PriorityIDs, 100) || !uniqueIDs(filter.WorkflowIDs, 100) || !uniqueIDs(filter.StageIDs, 100) {
		return errors.New("canonical filter IDs must be distinct, nonzero and bounded")
	}
	if (filter.TypeIDs != nil && len(filter.TypeIDs) == 0) || (filter.PriorityIDs != nil && len(filter.PriorityIDs) == 0) || (filter.WorkflowIDs != nil && len(filter.WorkflowIDs) == 0) || (filter.StageIDs != nil && len(filter.StageIDs) == 0) {
		return errors.New("supplied canonical selection filters must not be empty")
	}

	if filter.Sort != "" && filter.Sort != SortUpdated && filter.Sort != SortCreated && filter.Sort != SortDue && filter.Sort != SortPriority {
		return errors.New("invalid issue sorting")
	}
	if (filter.ProjectIDs != nil && len(filter.ProjectIDs) == 0) || (filter.LabelIDs != nil && len(filter.LabelIDs) == 0) || (filter.Statuses != nil && len(filter.Statuses) == 0) || (filter.Priorities != nil && len(filter.Priorities) == 0) || (filter.Types != nil && len(filter.Types) == 0) {
		return errors.New("supplied selection filters must not be empty")
	}
	if !uniqueIDs(filter.ProjectIDs, 100) || !uniqueIDs(filter.LabelIDs, 10) {
		return errors.New("filter IDs must be distinct, nonzero and bounded")
	}
	if filter.Query != nil {
		if err := ValidateText(*filter.Query, 0, 200); err != nil {
			return err
		}
	}
	if len(filter.Priorities) > 3 || len(filter.Types) > 3 {
		return errors.New("too many filter values")
	}
	for i, status := range filter.Statuses {
		if !status.Valid() {
			return errors.New("invalid status filter")
		}
		for _, prior := range filter.Statuses[:i] {
			if prior == status {
				return errors.New("duplicate status filter")
			}
		}
	}
	for i, priority := range filter.Priorities {
		if !priority.Valid() {
			return errors.New("invalid priority filter")
		}
		for _, prior := range filter.Priorities[:i] {
			if prior == priority {
				return errors.New("duplicate priority filter")
			}
		}
	}
	for i, kind := range filter.Types {
		if !kind.Valid() {
			return errors.New("invalid issue type filter")
		}
		for _, prior := range filter.Types[:i] {
			if prior == kind {
				return errors.New("duplicate issue type filter")
			}
		}
	}
	if filter.ParentID != nil && filter.ParentID.UUID == [16]byte{} {
		return errors.New("invalid parent filter")
	}
	if filter.PrerequisiteFor != nil && filter.PrerequisiteFor.UUID == [16]byte{} {
		return errors.New("invalid prerequisite filter")
	}
	if filter.DueFrom != nil && filter.DueTo != nil && filter.DueTo.Before(*filter.DueFrom) {
		return errors.New("due-date range is reversed")
	}
	if filter.Assignee != nil {
		switch filter.Assignee.Mode {
		case AssigneeUser:
			if filter.Assignee.UserID == nil || filter.Assignee.UserID.UUID == [16]byte{} {
				return errors.New("user assignee filter requires a user ID")
			}
		case AssigneeMe, Unassigned, AssigneeAny:
			if filter.Assignee.UserID != nil {
				return errors.New("this assignee filter cannot include a user ID")
			}
		default:
			return errors.New("invalid assignee filter")
		}
	}
	return nil
}
