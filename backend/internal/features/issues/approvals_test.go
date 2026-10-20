package issues

import (
	"context"
	"gategoldjira/backend/internal/platform/command"
	"github.com/google/uuid"
	"testing"
)

func TestApprovalsRemainHistoricalButOnlyCurrentDistinctEligibleVotesMove(t *testing.T) {
	f := modernIssueFixture(t)
	ctx := context.Background()
	created, err := f.service.CreateModern(ctx, f.member, ModernCreateInput{
		ProjectID:          f.project,
		ModernCreateFields: ModernCreateFields{Title: "Review context"},
		RetryReference:     uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	work := created.Body.Result
	if _, err := f.pool.Exec(ctx, "UPDATE projects SET core_mode='modern' WHERE id=$1", work.Summary.ProjectID.UUID); err != nil {
		t.Fatal(err)
	}
	current, err := f.service.GetModern(ctx, f.member, work.Summary.ID)
	if err != nil {
		t.Fatal(err)
	}
	var transition, target uuid.UUID
	if err = f.pool.QueryRow(ctx, "SELECT id,to_stage_id FROM workflow_transitions WHERE project_id=$1 AND from_stage_id=$2 AND to_stage_id=(SELECT id FROM workflow_stages WHERE project_id=$1 AND legacy_status='review')", work.Summary.ProjectID.UUID, current.Summary.Stage.ID.UUID).Scan(&transition, &target); err != nil {
		t.Fatal(err)
	}
	if _, err = f.pool.Exec(ctx, "UPDATE workflow_transitions SET approvals_required=1,approver_role='member' WHERE id=$1", transition); err != nil {
		t.Fatal(err)
	}
	contextView, err := f.service.GetApprovals(ctx, f.member, ApprovalContextInput{
		IssueID:      work.Summary.ID,
		TransitionID: command.TransitionID{UUID: transition},
	})
	if err != nil {
		t.Fatal(err)
	}
	vote := ApprovalVoteInput{
		IssueID:      work.Summary.ID,
		TransitionID: command.TransitionID{UUID: transition},
		ApprovalContextFields: ApprovalContextFields{
			ExpectedRevision:              current.Summary.Revision,
			ExpectedWorkflowRevision:      contextView.WorkflowRevision,
			ExpectedConfigurationRevision: contextView.ConfigurationRevision,
		},
		Decision:       Approve,
		RetryReference: uuid.NewString(),
	}
	approved, err := f.service.VoteApproval(ctx, f.member, vote)
	if err != nil {
		t.Fatal(err)
	}
	if approved.Body.Result.IssueRevision != current.Summary.Revision {
		t.Fatal("vote edited content revision")
	}
	// Change approved content without changing stage; retained votes become stale.
	due, _ := command.ParseDate("2027-01-01")
	edited, err := f.service.PatchModernField(ctx, f.member, ModernPatchInput{
		IssueID: work.Summary.ID,
		ModernPatchFields: ModernPatchFields{
			Field:   DueDateField,
			DueDate: &DateChange{Value: &due},
		},
		RetryReference: uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	move := ModernMoveInput{
		IssueID: work.Summary.ID,
		ModernMoveFields: ModernMoveFields{
			ExpectedRevision: edited.Body.Result.Summary.Revision,
			TargetStageID:    command.StageID{UUID: target},
		},
		RetryReference: uuid.NewString(),
	}
	if _, err = f.service.MoveModern(ctx, f.member, move); err == nil {
		t.Fatal("stale approval permitted movement")
	}
	vote.ExpectedRevision = edited.Body.Result.Summary.Revision
	vote.Decision = Reject
	vote.RetryReference = uuid.NewString()
	if _, err = f.service.VoteApproval(ctx, f.member, vote); err != nil {
		t.Fatal(err)
	}
	vote.Decision = Approve
	vote.RetryReference = uuid.NewString()
	if _, err = f.service.VoteApproval(ctx, f.member, vote); err == nil {
		t.Fatal("same reviewer changed an immutable decision without resubmit")
	}
	resubmitted, err := f.service.ResubmitApproval(ctx, f.member, ApprovalResubmitInput{
		IssueID:               work.Summary.ID,
		TransitionID:          vote.TransitionID,
		ApprovalContextFields: vote.ApprovalContextFields,
		RetryReference:        uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	vote.ExpectedRevision = resubmitted.Body.Result.IssueRevision
	vote.RetryReference = uuid.NewString()
	if _, err = f.service.VoteApproval(ctx, f.member, vote); err != nil {
		t.Fatal(err)
	}
	move.ExpectedRevision = vote.ExpectedRevision
	move.RetryReference = uuid.NewString()
	if _, err = f.service.MoveModern(ctx, f.member, move); err != nil {
		t.Fatal("current approval denied", err)
	}
	var retained int
	if err = f.pool.QueryRow(ctx, "SELECT count(*) FROM issue_approvals WHERE issue_id=$1", work.Summary.ID.UUID).Scan(&retained); err != nil || retained != 3 {
		t.Fatal("approval history lost", retained, err)
	}
}

func TestApprovalConcurrencyRuleInvalidationAndRevokedReviewer(t *testing.T) {
	f := modernIssueFixture(t)
	ctx := context.Background()
	saved, err := f.service.CreateModern(ctx, f.member, ModernCreateInput{
		ProjectID:          f.project,
		ModernCreateFields: ModernCreateFields{Title: "Two reviewers"},
		RetryReference:     uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	issue := saved.Body.Result
	var edge, target uuid.UUID
	if err = f.pool.QueryRow(ctx, "SELECT id,to_stage_id FROM workflow_transitions WHERE project_id=$1 AND from_stage_id=$2 AND to_stage_id=(SELECT id FROM workflow_stages WHERE project_id=$1 AND legacy_status='review')", f.project.UUID, issue.Summary.Stage.ID.UUID).Scan(&edge, &target); err != nil {
		t.Fatal(err)
	}
	if _, err = f.pool.Exec(ctx, "UPDATE workflow_transitions SET approvals_required=2,approver_role='member' WHERE id=$1", edge); err != nil {
		t.Fatal(err)
	}
	in := ApprovalContextInput{IssueID: issue.Summary.ID, TransitionID: command.TransitionID{UUID: edge}}
	view, err := f.service.GetApprovals(ctx, f.member, in)
	if err != nil {
		t.Fatal(err)
	}
	contextFields := func(v ApprovalContextView) ApprovalContextFields {
		return ApprovalContextFields{
			ExpectedRevision:              v.IssueRevision,
			ExpectedWorkflowRevision:      v.WorkflowRevision,
			ExpectedConfigurationRevision: v.ConfigurationRevision,
		}
	}
	start := make(chan struct{})
	results := make(chan error, 2)
	for _, actor := range []command.Actor{f.member, f.owner} {
		go func(a command.Actor) {
			<-start
			_, e := f.service.VoteApproval(ctx, a, ApprovalVoteInput{
				IssueID:               in.IssueID,
				TransitionID:          in.TransitionID,
				ApprovalContextFields: contextFields(view),
				Decision:              Approve,
				RetryReference:        uuid.NewString(),
			})
			results <- e
		}(actor)
	}
	close(start)
	for range 2 {
		if e := <-results; e != nil {
			t.Fatal(e)
		}
	}
	view, err = f.service.GetApprovals(ctx, f.member, in)
	if err != nil || view.Approved != 2 || !view.ReviewSatisfied || view.IssueRevision != issue.Summary.Revision {
		t.Fatal("distinct concurrent votes", view, err)
	}
	if _, err = f.pool.Exec(ctx, "UPDATE workflows SET revision=revision+1 WHERE id=$1", issue.Summary.Workflow.ID.UUID); err != nil {
		t.Fatal(err)
	}
	fresh, err := f.service.GetApprovals(ctx, f.member, in)
	if err != nil || fresh.Approved != 0 || fresh.ReviewSatisfied {
		t.Fatal("workflow edit retained stale approval", err)
	}
	if _, err = f.service.VoteApproval(ctx, f.member, ApprovalVoteInput{
		IssueID:               in.IssueID,
		TransitionID:          in.TransitionID,
		ApprovalContextFields: contextFields(view),
		Decision:              Approve,
		RetryReference:        uuid.NewString(),
	}); err == nil {
		t.Fatal("accepted stale workflow token")
	}
	for _, actor := range []command.Actor{f.member, f.owner} {
		if _, err = f.service.VoteApproval(ctx, actor, ApprovalVoteInput{
			IssueID:               in.IssueID,
			TransitionID:          in.TransitionID,
			ApprovalContextFields: contextFields(fresh),
			Decision:              Approve,
			RetryReference:        uuid.NewString(),
		}); err != nil {
			t.Fatal(err)
		}
	}
	if _, err = f.pool.Exec(ctx, "UPDATE project_memberships SET removed_at=now() WHERE project_id=$1 AND user_id=$2", f.project.UUID, f.member.UserID.UUID); err != nil {
		t.Fatal(err)
	}
	fresh, err = f.service.GetApprovals(ctx, f.owner, in)
	if err != nil || fresh.Approved != 1 || fresh.ReviewSatisfied {
		t.Fatal("revoked reviewer counted", err)
	}
	if _, err = f.service.MoveModern(ctx, f.owner, ModernMoveInput{
		IssueID: in.IssueID,
		ModernMoveFields: ModernMoveFields{
			ExpectedRevision: fresh.IssueRevision,
			TargetStageID:    command.StageID{UUID: target},
		},
		RetryReference: uuid.NewString(),
	}); err == nil {
		t.Fatal("revoked vote allowed movement")
	}
	if _, err = f.pool.Exec(ctx, "UPDATE projects SET configuration_revision=configuration_revision+1 WHERE id=$1", f.project.UUID); err != nil {
		t.Fatal(err)
	}
	fresh, err = f.service.GetApprovals(ctx, f.owner, in)
	if err != nil || fresh.Approved != 0 {
		t.Fatal("configuration edit retained stale votes", err)
	}
}

func TestApprovalHistoryCursorIncludesEveryContextAndRemainsReadableAfterMove(t *testing.T) {
	f := modernIssueFixture(t)
	ctx := context.Background()
	saved, err := f.service.CreateModern(ctx, f.member, ModernCreateInput{
		ProjectID:          f.project,
		ModernCreateFields: ModernCreateFields{Title: "Historical reviews"},
		RetryReference:     uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	issue := saved.Body.Result
	var edge, target uuid.UUID
	if err = f.pool.QueryRow(ctx, "SELECT id,to_stage_id FROM workflow_transitions WHERE project_id=$1 AND from_stage_id=$2 LIMIT 1", f.project.UUID, issue.Summary.Stage.ID.UUID).Scan(&edge, &target); err != nil {
		t.Fatal(err)
	}
	if _, err = f.pool.Exec(ctx, "INSERT INTO issue_approvals(project_id,issue_id,transition_id,issue_revision,workflow_revision,configuration_revision,approver_id,decision,decided_at) SELECT $1,$2,$3,n,1,1,$4,'approve','2026-01-01' FROM generate_series(1,10) n", f.project.UUID, issue.Summary.ID.UUID, edge, f.owner.UserID.UUID); err != nil {
		t.Fatal(err)
	}
	limit := 1
	in := ApprovalContextInput{
		IssueID:      issue.Summary.ID,
		TransitionID: command.TransitionID{UUID: edge},
		Page:         command.PageRequest{Limit: &limit},
	}
	seen := map[command.Revision]bool{}
	for {
		page, e := f.service.GetApprovals(ctx, f.member, in)
		if e != nil {
			t.Fatal(e)
		}
		for _, v := range page.Votes {
			if seen[v.IssueRevision] {
				t.Fatal("repeated vote context")
			}
			seen[v.IssueRevision] = true
		}
		if page.NextCursor == nil {
			break
		}
		in.Page.Cursor = page.NextCursor
	}
	if len(seen) != 10 {
		t.Fatal("history cursor skipped equal-time contexts", len(seen))
	}
	if _, err = f.service.MoveModern(ctx, f.member, ModernMoveInput{
		IssueID: issue.Summary.ID,
		ModernMoveFields: ModernMoveFields{
			ExpectedRevision: issue.Summary.Revision,
			TargetStageID:    command.StageID{UUID: target},
		},
		RetryReference: uuid.NewString(),
	}); err != nil {
		t.Fatal(err)
	}
	in.Page = command.PageRequest{}
	history, err := f.service.GetApprovals(ctx, f.member, in)
	if err != nil || history.CurrentContext || history.CanVote || len(history.Votes) != 10 {
		t.Fatal("past transition history unreadable", history, err)
	}
}
