package issues

import (
	"context"
	"errors"
	"strconv"

	"gategoldjira/backend/internal/features/activity"
	"gategoldjira/backend/internal/features/notifications"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func (s *Service) MoveModern(ctx context.Context, actor command.Actor, input ModernMoveInput) (command.SaveOutcome[ModernIssueView], error) {
	if input.ExpectedRevision < 1 || input.TargetStageID.UUID == uuid.Nil {
		return command.SaveOutcome[ModernIssueView]{}, validation("targetStageId", "Supply the target stage and current issue revision.")
	}
	request := command.MutationRequest{
		Actor:           actor,
		Operation:       command.MoveModernIssue,
		RetryReference:  input.RetryReference,
		ResolveProjects: issueScopes(input.IssueID, true),
	}
	return command.Save(ctx, s.runner, request, input, func(ctx context.Context, m *command.Mutation) error {
		_, err := m.Queries.ReadIssue(ctx, input.IssueID.UUID)
		return err
	}, func(ctx context.Context, m *command.Mutation, in ModernMoveInput) (command.Change[ModernIssueView], error) {
		return s.ApplyModernMove(ctx, m, in)
	}, validateModernView)
}

// ApplyModernMove shares workflow, completion and notification rules with a board command.
// Its caller owns the authenticated project transaction and retry receipt.
func (s *Service) ApplyModernMove(ctx context.Context, m *command.Mutation, in ModernMoveInput) (command.Change[ModernIssueView], error) {
	if _, err := m.Queries.IssuesLockFieldRow(ctx, in.IssueID.UUID); err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return command.Change[ModernIssueView]{}, err
	}
	current, sourceStatus, err := readModernViewWithStatus(ctx, m, in.IssueID)
	if err != nil {
		return command.Change[ModernIssueView]{}, err
	}
	project, flow := current.Summary.ProjectID, current.Summary.Workflow.ID
	if err = requireModernProject(ctx, m, project); err != nil {
		return command.Change[ModernIssueView]{}, err
	}
	if current.Summary.Revision != in.ExpectedRevision {
		return command.Change[ModernIssueView]{}, modernConflict(current)
	}
	if current.Summary.Stage.ID == in.TargetStageID {
		return command.Change[ModernIssueView]{Result: current, HTTPStatus: 200}, nil
	}

	target, err := canonicalStage(ctx, m, project, flow, in.TargetStageID)
	if err != nil {
		return command.Change[ModernIssueView]{}, err
	}
	if target.Retired || !target.AcceptsEntries {
		return command.Change[ModernIssueView]{}, validation("targetStageId", "Choose an open, active target stage in this issue's existing workflow.")
	}
	edge, err := m.Queries.IssuesCanonicalTransition(ctx, dbgen.IssuesCanonicalTransitionParams{
		ProjectID:   project.UUID,
		WorkflowID:  flow.UUID,
		FromStageID: current.Summary.Stage.ID.UUID,
		ToStageID:   target.ID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return command.Change[ModernIssueView]{}, validation("targetStageId", "This workflow does not allow that move.")
	}
	if err != nil {
		return command.Change[ModernIssueView]{}, err
	}
	permissions, err := m.ProjectPermissions(project)
	if err != nil {
		return command.Change[ModernIssueView]{}, err
	}
	if edge.RequiredPermission != nil && *edge.RequiredPermission == string(command.TransitionProjectAdmin) && !permissions.CanConfigure {
		return command.Change[ModernIssueView]{}, &command.Failure{
			Code:        command.Forbidden,
			Message:     "This move requires a project administrator.",
			FieldErrors: []command.FieldError{},
			NextAction:  command.ContactAdministrator,
		}
	}
	if err = validateTransitionFields(ctx, m, current, command.TransitionID{UUID: edge.ID}); err != nil {
		return command.Change[ModernIssueView]{}, err
	}
	if edge.ApprovalsRequired > 0 {
		rule, err := approvalRule(ctx, m, current, command.TransitionID{UUID: edge.ID})
		if err != nil {
			return command.Change[ModernIssueView]{}, err
		}
		approved, rejected, err := currentReview(ctx, m, current, rule)
		if err != nil {
			return command.Change[ModernIssueView]{}, err
		}
		if rejected || approved < int32(edge.ApprovalsRequired) {
			return command.Change[ModernIssueView]{}, validation("targetStageId", "Complete current eligible approvals and resubmit any rejected review before this move.")
		}
	}
	status := command.Status(target.LegacyStatus)
	if err = m.Queries.IssuesRegisterMigrationStage(ctx, dbgen.IssuesRegisterMigrationStageParams{
		ProjectID: project.UUID,
		Status:    string(status),
		StageName: target.Name,
	}); err != nil {
		return command.Change[ModernIssueView]{}, err
	}
	oldStage, newStage := current.Summary.Stage.ID.String(), in.TargetStageID.String()
	return s.applyCanonicalMove(ctx, m, current, sourceStatus, command.StageMigrationTarget{
		WorkflowID: flow,
		StageID:    in.TargetStageID,
		Status:     status,
		Name:       target.Name,
	}, []activity.FieldChange{{Field: "stageId", Before: &oldStage, After: &newStage}})
}

func (s *Service) applyCanonicalMove(ctx context.Context, m *command.Mutation, current ModernIssueView, source command.Status, target command.StageMigrationTarget, canonicalChanges []activity.FieldChange) (command.Change[ModernIssueView], error) {
	project := current.Summary.ProjectID
	issueID := current.Summary.ID
	if target.Status.Category() == command.Done {
		if err := CheckCompletion(ctx, m, project, issueID); err != nil {
			return command.Change[ModernIssueView]{}, s.modernPrerequisiteFailure(ctx, m, current, err)
		}
	}
	if source.Category() == command.Done && target.Status.Category() != command.Done {
		if err := CheckReopen(ctx, m, project, issueID); err != nil {
			return command.Change[ModernIssueView]{}, s.modernPrerequisiteFailure(ctx, m, current, err)
		}
	}
	completionChanged := (source.Category() == command.Done) != (target.Status.Category() == command.Done)
	var err error
	affected := []dbgen.IssuesAffectedCompletionRow{}
	if completionChanged {
		affected, err = m.Queries.IssuesAffectedCompletion(ctx, dbgen.IssuesAffectedCompletionParams{
			ProjectID: project.UUID,
			BlockerID: issueID.UUID,
		})
		if err != nil {
			return command.Change[ModernIssueView]{}, err
		}
	}
	rank, err := AppendRank(ctx, m, project, target.Status)
	if err != nil {
		return command.Change[ModernIssueView]{}, err
	}
	if _, err = m.Queries.IssuesMoveCanonical(ctx, dbgen.IssuesMoveCanonicalParams{
		ID:         issueID.UUID,
		WorkflowID: &target.WorkflowID.UUID,
		StageID:    &target.StageID.UUID,
		Status:     string(target.Status),
		Rank:       rank,
	}); err != nil {
		return command.Change[ModernIssueView]{}, err
	}
	if current.Summary.Backlog {
		if _, err = m.Queries.BacklogAdvanceOrder(ctx, project.UUID); err != nil {
			return command.Change[ModernIssueView]{}, err
		}
	}
	if s.stageRule != nil {
		if err = s.stageRule(ctx, m, project, issueID, target.Status); err != nil {
			return command.Change[ModernIssueView]{}, err
		}
	}
	if _, err = AdvanceOrder(ctx, m, project, source); err != nil {
		return command.Change[ModernIssueView]{}, err
	}
	if _, err = AdvanceOrder(ctx, m, project, target.Status); err != nil {
		return command.Change[ModernIssueView]{}, err
	}
	if completionChanged {
		if _, err = m.Queries.IssuesAdvanceGraph(ctx, project.UUID); err != nil {
			return command.Change[ModernIssueView]{}, err
		}
	}
	view, err := readModernView(ctx, m, issueID)
	if err != nil {
		return command.Change[ModernIssueView]{}, err
	}
	before, after := string(source), string(target.Status)
	changes := []activity.FieldChange{{Field: "status", Before: &before, After: &after}}
	changes = append(changes, canonicalChanges...)
	facts := []notifications.Fact{modernFact(view, notifications.ChangedStatus)}
	prefix := view.Summary.Key[:len(view.Summary.Key)-len(view.Summary.Number.String())]
	for _, row := range affected {
		var assignee *command.UserID
		if row.AssigneeID != nil {
			assignee = &command.UserID{UUID: *row.AssigneeID}
		}
		base := notifications.Fact{
			ProjectID:  project,
			IssueID:    command.IssueID{UUID: row.ID},
			ReporterID: command.UserID{UUID: row.ReporterID},
			AssigneeID: assignee,
			Summary:    prefix + strconv.FormatInt(row.Number, 10) + ": " + row.Title,
		}
		add := func(effect notifications.Effect) {
			f := base
			f.Effect = effect
			facts = append(facts, f)
		}
		if row.IsBlocker {
			oldCount, newCount := row.UnfinishedBlockers, row.UnfinishedBlockers+1
			if target.Status.Category() == command.Done {
				newCount = oldCount - 1
			}
			oldText, newText := strconv.FormatInt(int64(oldCount), 10), strconv.FormatInt(int64(newCount), 10)
			changes = append(changes, activity.FieldChange{
				Field:  "issues." + row.ID.String() + ".unfinishedBlockerCount",
				Before: &oldText,
				After:  &newText,
			})
			if oldCount == 1 && newCount == 0 {
				add(notifications.LastBlockerCompleted)
			}
			if oldCount == 0 && newCount == 1 {
				add(notifications.BecameBlocked)
			}
		}
		if row.IsParent {
			oldCount, newCount := row.UnfinishedChildren, row.UnfinishedChildren+1
			if target.Status.Category() == command.Done {
				newCount = oldCount - 1
			}
			oldText, newText := strconv.FormatInt(int64(oldCount), 10), strconv.FormatInt(int64(newCount), 10)
			changes = append(changes, activity.FieldChange{
				Field:  "issues." + row.ID.String() + ".unfinishedChildren",
				Before: &oldText,
				After:  &newText,
			})
			if oldCount == 1 && newCount == 0 {
				add(notifications.LastSubtaskCompleted)
			}
		}
	}
	event, err := modernIssueEvent(ctx, m, command.MoveIssue, view, changes, facts)
	return command.Change[ModernIssueView]{Result: view, EventID: event, HTTPStatus: 200}, err
}

func (s *Service) MoveStageForBoard(ctx context.Context, m *command.Mutation, id command.IssueID, revision command.Revision, stage command.StageID) (command.Change[command.ModernIssueView], error) {
	return s.ApplyModernMove(ctx, m, ModernMoveInput{
		IssueID: id,
		ModernMoveFields: ModernMoveFields{
			ExpectedRevision: revision,
			TargetStageID:    stage,
		},
	})
}
