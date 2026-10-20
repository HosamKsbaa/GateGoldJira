package issues

import (
	"context"
	"errors"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"github.com/google/uuid"
)

type ModernIssueView = command.ModernIssueView
type ModernIssueSummary = command.ModernIssueSummary

// ModernSummaries enriches an authorized board page in its existing snapshot.
// The app injects this collaborator, so board code does not own issue decoding.
func ModernSummaries(ctx context.Context, m *command.Mutation, rows []dbgen.IssuesGetRow, today command.CalendarDate) ([]ModernIssueSummary, error) {
	ids := make([]uuid.UUID, 0, len(rows))
	for _, row := range rows {
		ids = append(ids, row.Issue.ID)
	}
	metadata, err := canonicalMetadata(ctx, m, ids)
	if err != nil {
		return nil, err
	}
	items := make([]ModernIssueSummary, 0, len(rows))
	for _, row := range rows {
		base, err := Summary(row, today)
		if err != nil {
			return nil, err
		}
		items = append(items, modernSummary(base, metadata[row.Issue.ID]))
	}
	return items, nil
}

func modernSummary(base IssueSummary, meta dbgen.IssuesCanonicalMetadataRow) ModernIssueSummary {
	return ModernIssueSummary{
		Archived: base.Archived, Backlog: base.Backlog, ID: base.ID, ProjectID: base.ProjectID, Key: base.Key, Number: base.Number, Title: base.Title,
		Type: command.IssueTypeChoice{
			ID:       command.IssueTypeID{UUID: meta.TypeID},
			Key:      meta.TypeKey,
			Name:     meta.TypeName,
			Behavior: command.IssueBehavior(meta.Behavior),
			Retired:  meta.TypeRetired,
		},
		Priority: command.PriorityChoice{
			ID:        command.PriorityID{UUID: meta.PriorityID},
			Key:       meta.PriorityKey,
			Name:      meta.PriorityName,
			SortOrder: command.Position(meta.PriorityOrder),
			Retired:   meta.PriorityRetired,
		},
		Workflow: command.WorkflowChoice{
			ID:       command.WorkflowID{UUID: meta.WorkflowID},
			Name:     meta.WorkflowName,
			Revision: command.Revision(meta.WorkflowRevision),
			Retired:  meta.WorkflowRetired,
		},
		Stage: command.StageChoice{
			ID:             command.StageID{UUID: meta.StageID},
			Name:           meta.StageName,
			Category:       command.Status(meta.Category),
			Position:       command.Position(meta.StagePosition),
			Initial:        meta.IsInitial,
			AcceptsEntries: meta.AcceptsEntries,
			Retired:        meta.StageRetired,
		},
		Assignee: base.Assignee, DueDate: base.DueDate, Overdue: base.Overdue, Labels: base.Labels, Blocked: base.Blocked, UnfinishedBlockerCount: base.UnfinishedBlockerCount, Parent: base.Parent, SubtaskProgress: base.SubtaskProgress, Revision: base.Revision, CreatedAt: base.CreatedAt, UpdatedAt: base.UpdatedAt,
	}
}
func validateModernView(v ModernIssueView) error {
	s := v.Summary
	if s.ID.UUID == uuid.Nil || s.ProjectID.UUID == uuid.Nil || s.Revision < 1 || s.Number < 1 || s.Type.ID.UUID == uuid.Nil || !s.Type.Behavior.Valid() || s.Priority.ID.UUID == uuid.Nil || s.Priority.SortOrder < 1 || s.Workflow.ID.UUID == uuid.Nil || s.Workflow.Revision < 1 || s.Stage.ID.UUID == uuid.Nil || s.Stage.Position < 1 || !s.Stage.Category.Valid() || s.Stage.Category.Category() != s.Stage.Category || v.Reporter.ID.UUID == uuid.Nil || v.GraphRevision < 1 || s.Labels == nil || v.Capabilities == nil || v.Links == nil || s.CreatedAt.IsZero() || s.UpdatedAt.IsZero() {
		return errors.New("invalid canonical issue result")
	}
	if !v.DescriptionFormat.Valid() || command.ValidateText(s.Title, 1, 200) != nil || command.ValidateText(v.Description, 0, 10000) != nil || command.ValidateText(s.Type.Name, 1, 60) != nil || command.ValidateText(s.Priority.Name, 1, 60) != nil || command.ValidateText(s.Stage.Name, 1, 60) != nil || command.ValidateText(s.Workflow.Name, 1, 100) != nil {
		return errors.New("invalid canonical issue text")
	}
	return nil
}

// One batched metadata query serves an entire search page. Page callers supply
// only issue IDs already returned by their authorized, scoped search transaction.
func canonicalMetadata(ctx context.Context, m *command.Mutation, ids []uuid.UUID) (map[uuid.UUID]dbgen.IssuesCanonicalMetadataRow, error) {
	if len(ids) == 0 {
		return map[uuid.UUID]dbgen.IssuesCanonicalMetadataRow{}, nil
	}
	rows, err := m.Queries.IssuesCanonicalMetadata(ctx, ids)
	if err != nil {
		return nil, err
	}
	values := make(map[uuid.UUID]dbgen.IssuesCanonicalMetadataRow, len(rows))
	for _, row := range rows {
		values[row.IssueID] = row
	}
	if len(values) != len(ids) {
		return nil, &command.Failure{
			Code:        command.Busy,
			Message:     "Issue configuration is being prepared. Reload to read its current references.",
			FieldErrors: []command.FieldError{},
			Retryable:   true,
			NextAction:  command.ReloadCurrentState,
		}
	}
	return values, nil
}
func readModernView(ctx context.Context, m *command.Mutation, id command.IssueID) (ModernIssueView, error) {
	view, _, err := readModernViewWithStatus(ctx, m, id)
	return view, err
}

func readModernViewWithStatus(ctx context.Context, m *command.Mutation, id command.IssueID) (ModernIssueView, command.Status, error) {
	base, err := readViewBase(ctx, m, id, false)
	if err != nil {
		return ModernIssueView{}, "", err
	}
	metadata, err := canonicalMetadata(ctx, m, []uuid.UUID{id.UUID})
	if err != nil {
		return ModernIssueView{}, "", err
	}
	links := append([]command.IssueLinkView{}, base.Links...)
	view := ModernIssueView{
		Watching:          base.Watching,
		Links:             links,
		DescriptionFormat: base.DescriptionFormat,
		Summary:           modernSummary(base.Summary, metadata[id.UUID]),
		Description:       base.Description,
		Reporter:          base.Reporter,
		GraphRevision:     base.GraphRevision,
		Capabilities:      base.Capabilities,
	}
	return view, base.Summary.Status, validateModernView(view)
}
func (s *Service) GetModern(ctx context.Context, actor command.Actor, id command.IssueID) (ModernIssueView, error) {
	return command.ReadResolved(ctx, s.runner, actor, command.Access{RepeatableRead: true}, issueScopes(id, false), func(ctx context.Context, m *command.Mutation) (ModernIssueView, error) {
		return readModernView(ctx, m, id)
	})
}
