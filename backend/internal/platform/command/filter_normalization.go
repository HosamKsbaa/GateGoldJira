package command

import (
	"sort"
	"strings"
)

func NormalizeIssueFilter(filter IssueFilter) (IssueFilter, error) {
	if err := filter.Validate(); err != nil {
		return filter, err
	}
	if filter.Query != nil {
		query := strings.TrimSpace(*filter.Query)
		if query == "" {
			filter.Query = nil
		} else {
			filter.Query = &query
		}
	}
	// Sort only copies: callers may reuse their typed filter values.
	if filter.ProjectIDs != nil {
		filter.ProjectIDs = append([]ProjectID{}, filter.ProjectIDs...)
		sort.Slice(filter.ProjectIDs, func(i, j int) bool { return filter.ProjectIDs[i].String() < filter.ProjectIDs[j].String() })
	}
	if filter.LabelIDs != nil {
		filter.LabelIDs = append([]LabelID{}, filter.LabelIDs...)
		sort.Slice(filter.LabelIDs, func(i, j int) bool { return filter.LabelIDs[i].String() < filter.LabelIDs[j].String() })
	}
	if filter.Statuses != nil {
		filter.Statuses = append([]Status{}, filter.Statuses...)
		sort.Slice(filter.Statuses, func(i, j int) bool { return filter.Statuses[i] < filter.Statuses[j] })
	}
	if filter.Priorities != nil {
		filter.Priorities = append([]Priority{}, filter.Priorities...)
		sort.Slice(filter.Priorities, func(i, j int) bool { return filter.Priorities[i] < filter.Priorities[j] })
	}
	if filter.Types != nil {
		filter.Types = append([]IssueType{}, filter.Types...)
		sort.Slice(filter.Types, func(i, j int) bool { return filter.Types[i] < filter.Types[j] })
	}
	filter.TypeIDs = sortedFilterIDs(filter.TypeIDs)
	filter.PriorityIDs = sortedFilterIDs(filter.PriorityIDs)
	filter.WorkflowIDs = sortedFilterIDs(filter.WorkflowIDs)
	filter.StageIDs = sortedFilterIDs(filter.StageIDs)
	return filter, nil
}

func sortedFilterIDs[K comparable](ids []ID[K]) []ID[K] {
	if ids == nil {
		return nil
	}
	copy := append([]ID[K]{}, ids...)
	sort.Slice(copy, func(i, j int) bool { return copy[i].String() < copy[j].String() })
	return copy
}
