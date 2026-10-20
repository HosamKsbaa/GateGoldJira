package issues

import (
	"context"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/httpapi"
	"github.com/danielgtaylor/huma/v2"
)

func registerOrganizationHTTP(api huma.API, s *Service) {
	registerSave(api, issueOperation(api, command.OrganizeIssue, "POST", "/issues/{issueId}/organize"), func(ctx context.Context, a command.Actor, in *struct {
		httpapi.MutationHeader
		IssueID command.IssueID `path:"issueId"`
		Body    OrganizeFields
	}) (command.SaveOutcome[IssueView], error) {
		return s.Organize(ctx, a, OrganizeInput{
			IssueID:        in.IssueID,
			OrganizeFields: in.Body,
			RetryReference: in.RetryReference,
		})
	})
	registerSave(api, issueOperation(api, command.SetIssueWatch, "POST", "/issues/{issueId}/watch"), func(ctx context.Context, a command.Actor, in *struct {
		httpapi.MutationHeader
		IssueID command.IssueID `path:"issueId"`
		Body    struct {
			Watching bool `json:"watching"`
		}
	}) (command.SaveOutcome[WatchView], error) {
		return s.SetWatch(ctx, a, WatchInput{
			IssueID:        in.IssueID,
			Watching:       in.Body.Watching,
			RetryReference: in.RetryReference,
		})
	})
	registerSave(api, issueOperation(api, command.SetIssueLink, "POST", "/issues/{issueId}/links"), func(ctx context.Context, a command.Actor, in *struct {
		httpapi.MutationHeader
		IssueID command.IssueID `path:"issueId"`
		Body    LinkFields
	}) (command.SaveOutcome[IssueView], error) {
		return s.SetLink(ctx, a, LinkInput{IssueID: in.IssueID, LinkFields: in.Body, RetryReference: in.RetryReference})
	})
	registerRead(api, issueOperation(api, command.ListSavedSearches, "GET", "/issue-searches"), func(ctx context.Context, a command.Actor, _ *struct{}) (SavedSearchList, error) {
		return s.SavedSearches(ctx, a)
	})
	registerSave(api, issueOperation(api, command.SaveIssueSearch, "PUT", "/issue-searches/{searchId}"), func(ctx context.Context, a command.Actor, in *struct {
		httpapi.MutationHeader
		SearchID SavedSearchID `path:"searchId"`
		Body     struct {
			ExpectedRevision command.InitialRevision `json:"expectedRevision"`
			Name             string                  `json:"name" minLength:"1" maxLength:"80"`
			Filters          command.IssueFilter     `json:"filters"`
			Removed          bool                    `json:"removed,omitempty"`
		}
	}) (command.SaveOutcome[SavedSearch], error) {
		return s.SaveSearch(ctx, a, SaveSearchInput{
			SearchID:         in.SearchID,
			ExpectedRevision: in.Body.ExpectedRevision,
			Name:             in.Body.Name,
			Filters:          in.Body.Filters,
			Removed:          in.Body.Removed,
			RetryReference:   in.RetryReference,
		})
	})
}
