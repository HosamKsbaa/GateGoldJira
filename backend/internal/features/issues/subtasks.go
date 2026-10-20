package issues

import (
	"context"
	"gategoldjira/backend/internal/features/activity"
	"gategoldjira/backend/internal/features/notifications"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"github.com/google/uuid"
	"strconv"
)

type CreateSubtaskFields struct {
	DescriptionFormat      command.DescriptionFormat `json:"descriptionFormat,omitempty"`
	ExpectedParentRevision command.Revision          `json:"expectedParentRevision"`
	Title                  string                    `json:"title" minLength:"1" maxLength:"200"`
	Description            string                    `json:"description,omitempty" maxLength:"10000"`
	Priority               command.Priority          `json:"priority,omitempty" enum:"low,medium,high"`
	AssigneeID             *command.UserID           `json:"assigneeId,omitempty" nullable:"true"`
	DueDate                *command.CalendarDate     `json:"dueDate,omitempty" nullable:"true"`
	LabelIDs               []command.LabelID         `json:"labelIds,omitempty" nullable:"false" maxItems:"10" uniqueItems:"true"`
}
type CreateSubtaskInput struct {
	ParentID command.IssueID `json:"parentId"`
	CreateSubtaskFields
	RetryReference string `json:"retryReference" format:"uuid"`
}
type ListSubtasksInput struct {
	ParentID command.IssueID     `json:"parentId"`
	Page     command.PageRequest `json:"page,omitempty"`
}
type childCommand struct {
	ParentID               command.IssueID  `json:"parentId"`
	ExpectedParentRevision command.Revision `json:"expectedParentRevision"`
	Editable               IssueEditable    `json:"editable"`
}

func (s *Service) CreateSubtask(ctx context.Context, actor command.Actor, in CreateSubtaskInput) (command.SaveOutcome[IssueView], error) {
	priority := in.Priority
	if priority == "" {
		priority = command.Medium
	}
	fields, err := normalizeEditable(IssueEditable{
		Title:             in.Title,
		Description:       in.Description,
		DescriptionFormat: in.DescriptionFormat,
		Type:              command.Subtask,
		Priority:          priority,
		AssigneeID:        in.AssigneeID,
		DueDate:           in.DueDate,
		LabelIDs:          in.LabelIDs,
	})
	if err != nil {
		return command.SaveOutcome[IssueView]{}, err
	}
	if err := validateNewDescription(fields); err != nil {
		return command.SaveOutcome[IssueView]{}, err
	}
	if in.ExpectedParentRevision < 1 {
		return command.SaveOutcome[IssueView]{}, validation("expectedParentRevision", "Read the current parent revision before creating a subtask.")
	}
	request := command.MutationRequest{
		Actor:           actor,
		Operation:       command.CreateSubtask,
		RetryReference:  in.RetryReference,
		ResolveProjects: issueScopes(in.ParentID, true),
	}
	return command.Save(ctx, s.runner, request, childCommand{
		in.ParentID,
		in.ExpectedParentRevision,
		fields,
	}, func(context.Context, *command.Mutation) error { return nil }, func(ctx context.Context, m *command.Mutation, a childCommand) (command.Change[IssueView], error) {
		if err := requireLegacyIssue(ctx, m, a.ParentID); err != nil {
			return command.Change[IssueView]{}, err
		}
		parent, err := readView(ctx, m, a.ParentID)
		if err != nil {
			return command.Change[IssueView]{}, err
		}
		if parent.Summary.Revision != a.ExpectedParentRevision {
			return command.Change[IssueView]{}, conflict(parent)
		}
		project := parent.Summary.ProjectID
		if err := CheckChildCreation(ctx, m, project, a.ParentID); err != nil {
			return command.Change[IssueView]{}, s.prerequisiteFailure(ctx, m, parent, err)
		}
		if err := checkReferences(ctx, m, project, a.Editable); err != nil {
			return command.Change[IssueView]{}, err
		}
		number, err := m.Queries.IssuesAllocateNumber(ctx, project.UUID)
		if err != nil {
			return command.Change[IssueView]{}, err
		}
		status, err := initialStage(ctx, m, project)
		if err != nil {
			return command.Change[IssueView]{}, err
		}
		rank, err := AppendRank(ctx, m, project, status)
		if err != nil {
			return command.Change[IssueView]{}, err
		}
		id := command.NewID[command.IssueKind]()
		f := a.Editable
		if _, err := m.Queries.IssuesInsertSubtask(ctx, dbgen.IssuesInsertSubtaskParams{
			Status:            string(status),
			ID:                id.UUID,
			ProjectID:         project.UUID,
			Number:            number,
			Title:             f.Title,
			Description:       f.Description,
			DescriptionFormat: f.DescriptionFormat.Stored(),
			Priority:          string(f.Priority),
			ReporterID:        m.User.ID,
			AssigneeID:        userUUID(f.AssigneeID),
			DueDate:           dateValue(f.DueDate),
			ParentID:          &a.ParentID.UUID,
			Rank:              rank,
		}); err != nil {
			return command.Change[IssueView]{}, err
		}
		if err := setLabels(ctx, m, project, id, f.LabelIDs); err != nil {
			return command.Change[IssueView]{}, err
		}
		if _, err := AdvanceOrder(ctx, m, project, status); err != nil {
			return command.Change[IssueView]{}, err
		}
		if _, err := m.Queries.IssuesAdvanceGraph(ctx, project.UUID); err != nil {
			return command.Change[IssueView]{}, err
		}
		child, err := readView(ctx, m, id)
		if err != nil {
			return command.Change[IssueView]{}, err
		}
		changes := editableChanges(nil, &f)
		parentID := a.ParentID.String()
		key := child.Summary.Key
		oldCount := strconv.Itoa(int(parent.Summary.SubtaskProgress.Total - parent.Summary.SubtaskProgress.Done))
		newCount := strconv.Itoa(int(parent.Summary.SubtaskProgress.Total - parent.Summary.SubtaskProgress.Done + 1))
		changes = append(changes, activity.FieldChange{Field: "parentId", After: &parentID}, activity.FieldChange{Field: "key", After: &key}, activity.FieldChange{
			Field:  "issues." + parentID + ".unfinishedChildren",
			Before: &oldCount,
			After:  &newCount,
		})
		facts := []notifications.Fact{fact(parent, notifications.NewSubtask)}
		if f.AssigneeID != nil {
			facts = append(facts, fact(child, notifications.NewAssignment))
		}
		event, err := issueEvent(ctx, m, command.CreateSubtask, child, changes, facts)
		return command.Change[IssueView]{Result: child, EventID: event, HTTPStatus: 201}, err
	}, validateView)
}
func (s *Service) Subtasks(ctx context.Context, actor command.Actor, in ListSubtasksInput) (command.Page[IssueSummary], error) {
	empty := command.Page[IssueSummary]{}
	limit, err := in.Page.Size()
	if err != nil {
		return empty, err
	}
	scope, err := command.CursorScopeFor(command.ListSubtasks, actor.UserID, "number ASC", struct {
		ParentID command.IssueID `json:"parentId"`
	}{in.ParentID})
	if err != nil {
		return empty, err
	}
	var after int64
	if in.Page.Cursor != nil {
		after, err = command.ReadCursor[int64](s.cursors, scope, *in.Page.Cursor)
		if err != nil {
			return empty, err
		}
	}
	return command.ReadResolved(ctx, s.runner, actor, command.Access{RepeatableRead: true}, issueScopes(in.ParentID, false), func(ctx context.Context, m *command.Mutation) (command.Page[IssueSummary], error) {
		parent, err := m.Queries.ReadIssue(ctx, in.ParentID.UUID)
		if err != nil {
			return empty, err
		}
		rows, err := m.Queries.IssuesListSubtaskIDs(ctx, dbgen.IssuesListSubtaskIDsParams{
			ParentID:    &in.ParentID.UUID,
			AfterNumber: after,
			PageSize:    int32(limit + 1),
		})
		if err != nil {
			return empty, err
		}
		count, err := m.Queries.IssuesCountSubtasks(ctx, &in.ParentID.UUID)
		if err != nil {
			return empty, err
		}
		ids := []uuid.UUID{}
		for _, row := range rows {
			ids = append(ids, row.ID)
		}
		summaries, err := dependencySummaries(ctx, m, command.ProjectID{UUID: parent.ProjectID}, ids)
		if err != nil {
			return empty, err
		}
		values := []IssueSummary{}
		for _, row := range rows {
			values = append(values, summaries[command.IssueID{UUID: row.ID}])
		}
		return command.BuildPage(s.cursors, scope, values, limit, int(count), false, func(v IssueSummary) int64 { return int64(v.Number) })
	})
}
