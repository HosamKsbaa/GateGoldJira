package issues

import (
	"context"
	"errors"
	"gategoldjira/backend/internal/features/activity"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"golang.org/x/net/html"
	"strings"
	"time"
)

type ApprovalDecision string

const (
	Approve ApprovalDecision = "approve"
	Reject  ApprovalDecision = "reject"
)

type ApprovalContextInput struct {
	IssueID      command.IssueID      `json:"issueId"`
	TransitionID command.TransitionID `json:"transitionId"`
	Page         command.PageRequest  `json:"page,omitempty"`
}
type ApprovalContextFields struct {
	ExpectedRevision              command.Revision `json:"expectedRevision"`
	ExpectedWorkflowRevision      command.Revision `json:"expectedWorkflowRevision"`
	ExpectedConfigurationRevision command.Revision `json:"expectedConfigurationRevision"`
}
type ApprovalVoteInput struct {
	IssueID      command.IssueID      `json:"issueId"`
	TransitionID command.TransitionID `json:"transitionId"`
	ApprovalContextFields
	Decision       ApprovalDecision `json:"decision" enum:"approve,reject"`
	RetryReference string           `json:"retryReference" format:"uuid"`
}
type ApprovalResubmitInput struct {
	IssueID      command.IssueID      `json:"issueId"`
	TransitionID command.TransitionID `json:"transitionId"`
	ApprovalContextFields
	RetryReference string `json:"retryReference" format:"uuid"`
}
type ApprovalVoteView struct {
	Approver              command.IssueUserSummary `json:"approver"`
	Decision              ApprovalDecision         `json:"decision" enum:"approve,reject"`
	IssueRevision         command.Revision         `json:"issueRevision"`
	WorkflowRevision      command.Revision         `json:"workflowRevision"`
	ConfigurationRevision command.Revision         `json:"configurationRevision"`
	DecidedAt             time.Time                `json:"decidedAt" format:"date-time"`
	Current               bool                     `json:"current"`
	Eligible              bool                     `json:"eligible"`
}
type ApprovalContextView struct {
	IssueID               command.IssueID      `json:"issueId"`
	TransitionID          command.TransitionID `json:"transitionId"`
	IssueRevision         command.Revision     `json:"issueRevision"`
	WorkflowRevision      command.Revision     `json:"workflowRevision"`
	ConfigurationRevision command.Revision     `json:"configurationRevision"`
	Required              int32                `json:"required" minimum:"0"`
	Approved              int32                `json:"approved" minimum:"0"`
	Rejected              bool                 `json:"rejected"`
	CurrentContext        bool                 `json:"currentContext"`
	CanVote               bool                 `json:"canVote"`
	ReviewSatisfied       bool                 `json:"reviewSatisfied"`
	Votes                 []ApprovalVoteView   `json:"votes" nullable:"false" maxItems:"100"`
	NextCursor            *string              `json:"nextCursor" nullable:"true"`
}
type approvalPosition struct {
	Time                  time.Time        `json:"time"`
	User                  uuid.UUID        `json:"user"`
	IssueRevision         command.Revision `json:"issueRevision"`
	WorkflowRevision      command.Revision `json:"workflowRevision"`
	ConfigurationRevision command.Revision `json:"configurationRevision"`
}

func approvalRule(ctx context.Context, m *command.Mutation, issue command.ModernIssueView, id command.TransitionID) (dbgen.IssuesApprovalTransitionRow, error) {
	row, err := m.Queries.IssuesApprovalTransition(ctx, dbgen.IssuesApprovalTransitionParams{
		ProjectID: issue.Summary.ProjectID.UUID,
		ID:        id.UUID,
	})
	if err != nil {
		return row, validation("transitionId", "Choose a transition in this issue's assigned workflow.")
	}
	edge := row.WorkflowTransition
	if edge.WorkflowID != issue.Summary.Workflow.ID.UUID || edge.FromStageID != issue.Summary.Stage.ID.UUID || edge.Retired {
		return row, validation("transitionId", "The approval context requires an active move from this issue's current stage.")
	}
	return row, nil
}
func approvalContextCAS(issue command.ModernIssueView, row dbgen.IssuesApprovalTransitionRow, expected ApprovalContextFields) error {
	if issue.Summary.Revision != expected.ExpectedRevision || command.Revision(row.WorkflowRevision) != expected.ExpectedWorkflowRevision || command.Revision(row.ConfigurationRevision) != expected.ExpectedConfigurationRevision {
		return &command.Failure{
			Code:        command.Conflict,
			Message:     "The issue or review rules changed. Reload the current approval context.",
			FieldErrors: []command.FieldError{},
			NextAction:  command.ReloadCurrentState,
		}
	}
	return nil
}
func approvalEligible(m *command.Mutation, issue command.ModernIssueView, edge dbgen.WorkflowTransition) bool {
	p, err := m.ProjectPermissions(issue.Summary.ProjectID)
	if err != nil || !p.CanWrite || edge.ApprovalsRequired < 1 || edge.ApproverRole == nil {
		return false
	}
	if edge.ExcludeIssueReporter && issue.Reporter.ID == m.Actor.UserID {
		return false
	}
	return *edge.ApproverRole == "member" || p.CanConfigure
}
func currentReview(ctx context.Context, m *command.Mutation, issue command.ModernIssueView, row dbgen.IssuesApprovalTransitionRow) (int32, bool, error) {
	if row.WorkflowTransition.ApprovalsRequired < 1 {
		return 0, false, nil
	}
	role := ""
	if row.WorkflowTransition.ApproverRole != nil {
		role = *row.WorkflowTransition.ApproverRole
	}
	votes, err := m.Queries.IssuesCurrentApprovalVotes(ctx, dbgen.IssuesCurrentApprovalVotesParams{
		IssueID:               issue.Summary.ID.UUID,
		TransitionID:          row.WorkflowTransition.ID,
		IssueRevision:         int64(issue.Summary.Revision),
		WorkflowRevision:      row.WorkflowRevision,
		ConfigurationRevision: row.ConfigurationRevision,
		ReporterID:            issue.Reporter.ID.UUID,
		ExcludeReporter:       row.WorkflowTransition.ExcludeIssueReporter,
		ApproverRole:          role,
	})
	if err != nil {
		return 0, false, err
	}
	var approved int32
	rejected := false
	for _, vote := range votes {
		if vote.Decision == string(Approve) {
			approved++
		} else if vote.Decision == string(Reject) {
			rejected = true
		}
	}
	return approved, rejected, nil
}
func (s *Service) approvalView(ctx context.Context, m *command.Mutation, issue command.ModernIssueView, row dbgen.IssuesApprovalTransitionRow, pageRequest command.PageRequest) (ApprovalContextView, error) {
	limit, err := pageRequest.Size()
	if err != nil {
		return ApprovalContextView{}, err
	}
	scope, err := command.CursorScopeFor(command.GetApprovalContext, m.Actor.UserID, "decidedAt,user,issueRevision,workflowRevision,configurationRevision DESC", struct {
		IssueID                                                command.IssueID
		TransitionID                                           command.TransitionID
		IssueRevision, WorkflowRevision, ConfigurationRevision command.Revision
	}{
		issue.Summary.ID,
		command.TransitionID{UUID: row.WorkflowTransition.ID},
		issue.Summary.Revision,
		command.Revision(row.WorkflowRevision),
		command.Revision(row.ConfigurationRevision),
	})
	if err != nil {
		return ApprovalContextView{}, err
	}
	position := approvalPosition{}
	if pageRequest.Cursor != nil {
		position, err = command.ReadCursor[approvalPosition](s.cursors, scope, *pageRequest.Cursor)
		if err != nil {
			return ApprovalContextView{}, err
		}
	}
	rows, err := m.Queries.IssuesApprovalVotes(ctx, dbgen.IssuesApprovalVotesParams{
		IssueID:                    issue.Summary.ID.UUID,
		TransitionID:               row.WorkflowTransition.ID,
		HasCursor:                  pageRequest.Cursor != nil,
		AfterTime:                  pgtype.Timestamptz{Time: position.Time, Valid: true},
		AfterUser:                  position.User,
		AfterIssueRevision:         int64(position.IssueRevision),
		AfterWorkflowRevision:      int64(position.WorkflowRevision),
		AfterConfigurationRevision: int64(position.ConfigurationRevision),
		PageSize:                   int32(limit + 1),
	})
	if err != nil {
		return ApprovalContextView{}, err
	}
	total, err := m.Queries.IssuesApprovalVoteCount(ctx, dbgen.IssuesApprovalVoteCountParams{
		IssueID:      issue.Summary.ID.UUID,
		TransitionID: row.WorkflowTransition.ID,
	})
	if err != nil {
		return ApprovalContextView{}, err
	}
	items := make([]ApprovalVoteView, 0, len(rows))
	for _, vote := range rows {
		eligible := vote.EligibleMember
		if row.WorkflowTransition.ApproverRole != nil && *row.WorkflowTransition.ApproverRole == "project_admin" {
			eligible = vote.EligibleAdmin
		}
		if row.WorkflowTransition.ExcludeIssueReporter && vote.ApproverID == issue.Reporter.ID.UUID {
			eligible = false
		}
		items = append(items, ApprovalVoteView{
			Approver: command.IssueUserSummary{
				ID:          command.UserID{UUID: vote.ApproverID},
				DisplayName: vote.DisplayName,
			},
			Decision:              ApprovalDecision(vote.Decision),
			IssueRevision:         command.Revision(vote.IssueRevision),
			WorkflowRevision:      command.Revision(vote.WorkflowRevision),
			ConfigurationRevision: command.Revision(vote.ConfigurationRevision),
			DecidedAt:             vote.DecidedAt.Time,
			Current:               vote.IssueRevision == int64(issue.Summary.Revision) && vote.WorkflowRevision == row.WorkflowRevision && vote.ConfigurationRevision == row.ConfigurationRevision,
			Eligible:              eligible,
		})
	}
	page, err := command.BuildPage(s.cursors, scope, items, limit, int(total), false, func(v ApprovalVoteView) approvalPosition {
		return approvalPosition{v.DecidedAt, v.Approver.ID.UUID, v.IssueRevision, v.WorkflowRevision, v.ConfigurationRevision}
	})
	if err != nil {
		return ApprovalContextView{}, err
	}
	approved, rejected, err := currentReview(ctx, m, issue, row)
	return ApprovalContextView{
		IssueID:               issue.Summary.ID,
		TransitionID:          command.TransitionID{UUID: row.WorkflowTransition.ID},
		IssueRevision:         issue.Summary.Revision,
		WorkflowRevision:      command.Revision(row.WorkflowRevision),
		ConfigurationRevision: command.Revision(row.ConfigurationRevision),
		Required:              int32(row.WorkflowTransition.ApprovalsRequired),
		Approved:              approved,
		Rejected:              rejected,
		CurrentContext:        approvalContextCurrent(issue, row.WorkflowTransition),
		CanVote:               approvalContextCurrent(issue, row.WorkflowTransition) && approvalEligible(m, issue, row.WorkflowTransition),
		ReviewSatisfied:       approvalContextCurrent(issue, row.WorkflowTransition) && !rejected && approved >= int32(row.WorkflowTransition.ApprovalsRequired),
		Votes:                 page.Items,
		NextCursor:            page.NextCursor,
	}, err
}
func (s *Service) GetApprovals(ctx context.Context, actor command.Actor, in ApprovalContextInput) (ApprovalContextView, error) {
	return command.ReadResolved(ctx, s.runner, actor, command.Access{RepeatableRead: true}, issueScopes(in.IssueID, false), func(ctx context.Context, m *command.Mutation) (ApprovalContextView, error) {
		issue, err := readModernView(ctx, m, in.IssueID)
		if err != nil {
			return ApprovalContextView{}, err
		}
		row, err := m.Queries.IssuesApprovalTransition(ctx, dbgen.IssuesApprovalTransitionParams{
			ProjectID: issue.Summary.ProjectID.UUID,
			ID:        in.TransitionID.UUID,
		})
		if err != nil {
			return ApprovalContextView{}, err
		}
		return s.approvalView(ctx, m, issue, row, in.Page)
	})
}
func (s *Service) VoteApproval(ctx context.Context, actor command.Actor, in ApprovalVoteInput) (command.SaveOutcome[ApprovalContextView], error) {
	if in.ExpectedRevision < 1 || in.ExpectedWorkflowRevision < 1 || in.ExpectedConfigurationRevision < 1 || (in.Decision != Approve && in.Decision != Reject) {
		return command.SaveOutcome[ApprovalContextView]{}, validation("decision", "Supply a decision and the current issue, workflow and configuration revisions.")
	}
	request := command.MutationRequest{
		Actor:           actor,
		Operation:       command.VoteApproval,
		RetryReference:  in.RetryReference,
		Access:          command.Access{SharedMetadata: true},
		ResolveProjects: issueScopes(in.IssueID, true),
	}
	return command.Save(ctx, s.runner, request, in, func(ctx context.Context, m *command.Mutation) error {
		_, err := m.Queries.IssuesLockFieldRow(ctx, in.IssueID.UUID)
		return err
	}, func(ctx context.Context, m *command.Mutation, in ApprovalVoteInput) (command.Change[ApprovalContextView], error) {
		empty := command.Change[ApprovalContextView]{}
		issue, err := readModernView(ctx, m, in.IssueID)
		if err != nil {
			return empty, err
		}
		if err = requireModernProject(ctx, m, issue.Summary.ProjectID); err != nil {
			return empty, err
		}
		row, err := approvalRule(ctx, m, issue, in.TransitionID)
		if err != nil {
			return empty, err
		}
		if err = approvalContextCAS(issue, row, in.ApprovalContextFields); err != nil {
			return empty, err
		}
		if !approvalEligible(m, issue, row.WorkflowTransition) {
			return empty, &command.Failure{
				Code:        command.Forbidden,
				Message:     "Current review rules require an eligible project reviewer.",
				FieldErrors: []command.FieldError{},
				NextAction:  command.ContactAdministrator,
			}
		}
		old, err := m.Queries.IssuesExistingApprovalVote(ctx, dbgen.IssuesExistingApprovalVoteParams{
			IssueID:               in.IssueID.UUID,
			TransitionID:          in.TransitionID.UUID,
			IssueRevision:         int64(in.ExpectedRevision),
			WorkflowRevision:      row.WorkflowRevision,
			ConfigurationRevision: row.ConfigurationRevision,
			ApproverID:            m.User.ID,
		})
		if err == nil {
			if old.Decision != string(in.Decision) {
				return empty, validation("decision", "Decisions are retained. Resubmit for a fresh review context before changing this vote.")
			}
			view, err := s.approvalView(ctx, m, issue, row, command.PageRequest{})
			return command.Change[ApprovalContextView]{Result: view, HTTPStatus: 200}, err
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return empty, err
		}
		if err = m.Queries.IssuesInsertApprovalVote(ctx, dbgen.IssuesInsertApprovalVoteParams{
			ProjectID:             issue.Summary.ProjectID.UUID,
			IssueID:               in.IssueID.UUID,
			TransitionID:          in.TransitionID.UUID,
			IssueRevision:         int64(in.ExpectedRevision),
			WorkflowRevision:      row.WorkflowRevision,
			ConfigurationRevision: row.ConfigurationRevision,
			ApproverID:            m.User.ID,
			Decision:              string(in.Decision),
		}); err != nil {
			return empty, err
		}
		decision := string(in.Decision)
		event, err := activity.Append(ctx, m, activity.Draft{
			Action:       command.VoteApproval,
			ResourceKind: activity.IssueResource,
			ResourceID:   in.IssueID.UUID,
			ProjectID:    &issue.Summary.ProjectID,
			IssueID:      &in.IssueID,
			Changes: []activity.FieldChange{{
				Field: "approval." + in.TransitionID.String(),
				After: &decision,
			}},
		})
		if err != nil {
			return empty, err
		}
		view, err := s.approvalView(ctx, m, issue, row, command.PageRequest{})
		id := event.ID.String()
		return command.Change[ApprovalContextView]{Result: view, EventID: &id, HTTPStatus: 200}, err
	}, validateApprovalContext)
}
func (s *Service) ResubmitApproval(ctx context.Context, actor command.Actor, in ApprovalResubmitInput) (command.SaveOutcome[ApprovalContextView], error) {
	if in.ExpectedRevision < 1 || in.ExpectedWorkflowRevision < 1 || in.ExpectedConfigurationRevision < 1 {
		return command.SaveOutcome[ApprovalContextView]{}, validation("expectedRevision", "Read the current approval context before resubmitting.")
	}
	request := command.MutationRequest{
		Actor:           actor,
		Operation:       command.ResubmitApproval,
		RetryReference:  in.RetryReference,
		Access:          command.Access{SharedMetadata: true},
		ResolveProjects: issueScopes(in.IssueID, true),
	}
	return command.Save(ctx, s.runner, request, in, func(ctx context.Context, m *command.Mutation) error {
		_, err := m.Queries.IssuesLockFieldRow(ctx, in.IssueID.UUID)
		return err
	}, func(ctx context.Context, m *command.Mutation, in ApprovalResubmitInput) (command.Change[ApprovalContextView], error) {
		empty := command.Change[ApprovalContextView]{}
		issue, err := readModernView(ctx, m, in.IssueID)
		if err != nil {
			return empty, err
		}
		if err = requireModernProject(ctx, m, issue.Summary.ProjectID); err != nil {
			return empty, err
		}
		row, err := approvalRule(ctx, m, issue, in.TransitionID)
		if err != nil {
			return empty, err
		}
		if err = approvalContextCAS(issue, row, in.ApprovalContextFields); err != nil {
			return empty, err
		}
		if row.WorkflowTransition.ApprovalsRequired < 1 {
			return empty, validation("transitionId", "This transition has no approval requirement.")
		}
		if err = m.Queries.IssuesCustomValueRevision(ctx, in.IssueID.UUID); err != nil {
			return empty, err
		}
		fresh, err := readModernView(ctx, m, in.IssueID)
		if err != nil {
			return empty, err
		}
		before, after := issue.Summary.Revision.String(), fresh.Summary.Revision.String()
		event, err := modernIssueEvent(ctx, m, command.ResubmitApproval, fresh, []activity.FieldChange{{
			Field:  "approvalResubmission",
			Before: &before,
			After:  &after,
		}}, nil)
		if err != nil {
			return empty, err
		}
		view, err := s.approvalView(ctx, m, fresh, row, command.PageRequest{})
		return command.Change[ApprovalContextView]{Result: view, EventID: event, HTTPStatus: 200}, err
	}, validateApprovalContext)
}
func validateApprovalContext(v ApprovalContextView) error {
	if v.IssueID.UUID == uuid.Nil || v.TransitionID.UUID == uuid.Nil || v.IssueRevision < 1 || v.WorkflowRevision < 1 || v.ConfigurationRevision < 1 || v.Votes == nil {
		return errors.New("invalid approval context")
	}
	return nil
}
func meaningfulDescription(value string) bool {
	document, err := html.Parse(strings.NewReader(value))
	if err != nil {
		return false
	}
	var visible func(*html.Node) bool
	visible = func(node *html.Node) bool {
		if node.Type == html.TextNode && strings.TrimSpace(node.Data) != "" {
			return true
		}
		if node.Type == html.ElementNode && node.Data == "img" {
			return true
		}
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			if visible(child) {
				return true
			}
		}
		return false
	}
	return visible(document)
}
func validateTransitionFields(ctx context.Context, m *command.Mutation, issue command.ModernIssueView, transition command.TransitionID) error {
	required, err := m.Queries.IssuesTransitionRequiredFields(ctx, transition.UUID)
	if err != nil {
		return err
	}
	ids := []uuid.UUID{}
	for _, r := range required {
		if r.FieldID != nil {
			ids = append(ids, *r.FieldID)
		}
		if r.SystemField != nil {
			switch *r.SystemField {
			case "assignee":
				if issue.Summary.Assignee.Value == nil {
					return validation("assigneeId", "Assign the issue before this move.")
				}
			case "due_date":
				if issue.Summary.DueDate == nil {
					return validation("dueDate", "Set a due date before this move.")
				}
			case "description":
				if (issue.DescriptionFormat == command.HTMLDescription && !meaningfulDescription(issue.Description)) || (issue.DescriptionFormat != command.HTMLDescription && strings.TrimSpace(issue.Description) == "") {
					return validation("description", "Add a meaningful description before this move.")
				}
			}
		}
	}
	values, err := customValues(ctx, m, issue.Summary.ID, ids)
	if err != nil {
		return err
	}
	for _, id := range ids {
		value := values[command.FieldID{UUID: id}]
		if value == nil || value.Text != nil && strings.TrimSpace(*value.Text) == "" {
			return validation("fieldValues", "Complete all custom fields required by this transition.")
		}
	}
	return checkRequiredFields(ctx, m, issue.Summary.ProjectID, issue.Summary.ID)
}

func approvalContextCurrent(issue command.ModernIssueView, edge dbgen.WorkflowTransition) bool {
	return edge.WorkflowID == issue.Summary.Workflow.ID.UUID && edge.FromStageID == issue.Summary.Stage.ID.UUID && !edge.Retired
}
