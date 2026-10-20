package issues

import (
	"context"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/httpapi"
	"github.com/danielgtaylor/huma/v2"
)

func registerFieldHTTP(api huma.API, s *Service) {
	registerCanonicalRead(api, canonicalOperation(api, command.GetCustomFields, "GET", "/issues/{issueId}/custom-fields"), func(ctx context.Context, a command.Actor, in *struct {
		IssueID command.IssueID `path:"issueId"`
		PageQuery
	}) (CustomFieldsView, error) {
		return s.GetCustomFields(ctx, a, CustomFieldsInput{IssueID: in.IssueID, Page: in.page()})
	})
	registerCanonicalSave(api, canonicalOperation(api, command.SaveCustomFields, "PUT", "/issues/{issueId}/custom-fields"), func(ctx context.Context, a command.Actor, in *struct {
		httpapi.MutationHeader
		IssueID command.IssueID `path:"issueId"`
		Body    struct {
			ExpectedRevision command.Revision          `json:"expectedRevision"`
			Values           []command.FieldAssignment `json:"values" nullable:"false" minItems:"1" maxItems:"100"`
		}
	}) (command.SaveOutcome[CustomFieldsView], error) {
		return s.SaveCustomFields(ctx, a, SaveCustomFieldsInput{
			RetryReference:   in.RetryReference,
			IssueID:          in.IssueID,
			ExpectedRevision: in.Body.ExpectedRevision,
			Values:           in.Body.Values,
		})
	})
	registerCanonicalRead(api, canonicalOperation(api, command.GetApprovalContext, "GET", "/issues/{issueId}/transitions/{transitionId}/approvals"), func(ctx context.Context, a command.Actor, in *struct {
		IssueID      command.IssueID      `path:"issueId"`
		TransitionID command.TransitionID `path:"transitionId"`
		PageQuery
	}) (ApprovalContextView, error) {
		return s.GetApprovals(ctx, a, ApprovalContextInput{
			IssueID:      in.IssueID,
			TransitionID: in.TransitionID,
			Page:         in.page(),
		})
	})
	registerCanonicalSave(api, canonicalOperation(api, command.VoteApproval, "POST", "/issues/{issueId}/transitions/{transitionId}/approvals"), func(ctx context.Context, a command.Actor, in *struct {
		httpapi.MutationHeader
		IssueID      command.IssueID      `path:"issueId"`
		TransitionID command.TransitionID `path:"transitionId"`
		Body         struct {
			ApprovalContextFields
			Decision ApprovalDecision `json:"decision" enum:"approve,reject"`
		}
	}) (command.SaveOutcome[ApprovalContextView], error) {
		return s.VoteApproval(ctx, a, ApprovalVoteInput{
			RetryReference:        in.RetryReference,
			IssueID:               in.IssueID,
			TransitionID:          in.TransitionID,
			ApprovalContextFields: in.Body.ApprovalContextFields,
			Decision:              in.Body.Decision,
		})
	})
	registerCanonicalSave(api, canonicalOperation(api, command.ResubmitApproval, "POST", "/issues/{issueId}/transitions/{transitionId}/resubmit"), func(ctx context.Context, a command.Actor, in *struct {
		httpapi.MutationHeader
		IssueID      command.IssueID      `path:"issueId"`
		TransitionID command.TransitionID `path:"transitionId"`
		Body         ApprovalContextFields
	}) (command.SaveOutcome[ApprovalContextView], error) {
		return s.ResubmitApproval(ctx, a, ApprovalResubmitInput{
			RetryReference:        in.RetryReference,
			IssueID:               in.IssueID,
			TransitionID:          in.TransitionID,
			ApprovalContextFields: in.Body,
		})
	})
}
