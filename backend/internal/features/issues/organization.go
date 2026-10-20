package issues

import (
	"context"
	"encoding/json"
	"errors"
	"gategoldjira/backend/internal/features/activity"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"strconv"
	"strings"
)

type OrganizeFields struct {
	ExpectedRevision command.Revision `json:"expectedRevision"`
	Archived         *bool            `json:"archived,omitempty"`
	Backlog          *bool            `json:"backlog,omitempty"`
}
type OrganizeInput struct {
	IssueID command.IssueID `json:"issueId"`
	OrganizeFields
	RetryReference string `json:"retryReference" format:"uuid"`
}
type WatchInput struct {
	IssueID        command.IssueID `json:"issueId"`
	Watching       bool            `json:"watching"`
	RetryReference string          `json:"retryReference" format:"uuid"`
}
type WatchView struct {
	IssueID  command.IssueID `json:"issueId"`
	Watching bool            `json:"watching"`
}
type LinkFields struct {
	ExpectedRevision command.Revision `json:"expectedRevision"`
	TargetID         command.IssueID  `json:"targetId"`
	Kind             string           `json:"kind" enum:"relates_to,duplicates"`
	Enabled          bool             `json:"enabled"`
}
type LinkInput struct {
	IssueID command.IssueID `json:"issueId"`
	LinkFields
	RetryReference string `json:"retryReference" format:"uuid"`
}

func noExtraAuthorization(context.Context, *command.Mutation) error { return nil }

func (s *Service) Organize(ctx context.Context, actor command.Actor, in OrganizeInput) (command.SaveOutcome[IssueView], error) {
	if in.ExpectedRevision < 1 || (in.Archived == nil && in.Backlog == nil) {
		return command.SaveOutcome[IssueView]{}, validation("expectedRevision", "Read the issue and choose an organization change.")
	}
	request := command.MutationRequest{
		Actor:           actor,
		Operation:       command.OrganizeIssue,
		RetryReference:  in.RetryReference,
		ResolveProjects: issueScopes(in.IssueID, true),
	}
	return command.Save(ctx, s.runner, request, in, noExtraAuthorization, func(ctx context.Context, m *command.Mutation, in OrganizeInput) (command.Change[IssueView], error) {
		current, err := readView(ctx, m, in.IssueID)
		if err != nil {
			return command.Change[IssueView]{}, err
		}
		if current.Summary.Revision != in.ExpectedRevision {
			return command.Change[IssueView]{}, conflict(current)
		}
		if in.Backlog != nil && *in.Backlog && current.Summary.Status.Category() != command.Todo {
			return command.Change[IssueView]{}, validation("backlog", "Move the issue to an unstarted stage before putting it in the backlog.")
		}
		changes := []activity.FieldChange{}
		for _, change := range []struct {
			name   string
			before bool
			after  *bool
		}{{"archived", current.Summary.Archived, in.Archived}, {"backlog", current.Summary.Backlog, in.Backlog}} {
			if change.after != nil && change.before != *change.after {
				before, after := strconv.FormatBool(change.before), strconv.FormatBool(*change.after)
				changes = append(changes, activity.FieldChange{Field: change.name, Before: &before, After: &after})
			}
		}
		if len(changes) == 0 {
			return command.Change[IssueView]{Result: current, HTTPStatus: 200}, nil
		}
		newBacklog, newArchived := current.Summary.Backlog, current.Summary.Archived
		if in.Backlog != nil {
			newBacklog = *in.Backlog
		}
		if in.Archived != nil {
			newArchived = *in.Archived
		}
		if newBacklog && !newArchived && (!current.Summary.Backlog || current.Summary.Archived) {
			rank, err := appendBacklogRank(ctx, m, current.Summary.ProjectID)
			if err != nil {
				return command.Change[IssueView]{}, err
			}
			if err = m.Queries.BacklogSetInitialRank(ctx, dbgen.BacklogSetInitialRankParams{ID: in.IssueID.UUID, BacklogRank: rank}); err != nil {
				return command.Change[IssueView]{}, err
			}
		}
		if err := m.Queries.IssuesOrganize(ctx, dbgen.IssuesOrganizeParams{
			ID:       in.IssueID.UUID,
			Archived: in.Archived,
			Backlog:  in.Backlog,
		}); err != nil {
			return command.Change[IssueView]{}, err
		}
		if current.Summary.Backlog && in.Backlog != nil && !*in.Backlog && s.stageRule != nil {
			if err := s.stageRule(ctx, m, current.Summary.ProjectID, in.IssueID, current.Summary.Status); err != nil {
				return command.Change[IssueView]{}, err
			}
		}
		if current.Summary.Backlog || (in.Backlog != nil && *in.Backlog) {
			if _, err := m.Queries.BacklogAdvanceOrder(ctx, current.Summary.ProjectID.UUID); err != nil {
				return command.Change[IssueView]{}, err
			}
		}
		if _, err := AdvanceOrder(ctx, m, current.Summary.ProjectID, current.Summary.Status); err != nil {
			return command.Change[IssueView]{}, err
		}
		view, err := readView(ctx, m, in.IssueID)
		if err != nil {
			return command.Change[IssueView]{}, err
		}
		event, err := issueEvent(ctx, m, command.OrganizeIssue, view, changes, nil)
		return command.Change[IssueView]{Result: view, EventID: event, HTTPStatus: 200}, err
	}, validateView)
}

func (s *Service) SetWatch(ctx context.Context, actor command.Actor, in WatchInput) (command.SaveOutcome[WatchView], error) {
	request := command.MutationRequest{
		Actor:           actor,
		Operation:       command.SetIssueWatch,
		RetryReference:  in.RetryReference,
		ResolveProjects: issueScopes(in.IssueID, false),
	}
	return command.Save(ctx, s.runner, request, in, noExtraAuthorization, func(ctx context.Context, m *command.Mutation, in WatchInput) (command.Change[WatchView], error) {
		was, err := m.Queries.IssuesWatching(ctx, dbgen.IssuesWatchingParams{IssueID: in.IssueID.UUID, UserID: m.User.ID})
		if err != nil {
			return command.Change[WatchView]{}, err
		}
		view := WatchView{IssueID: in.IssueID, Watching: in.Watching}
		if was == in.Watching {
			return command.Change[WatchView]{Result: view, HTTPStatus: 200}, nil
		}
		if err := m.Queries.IssuesSetWatch(ctx, dbgen.IssuesSetWatchParams{
			IssueID:  in.IssueID.UUID,
			UserID:   m.User.ID,
			Watching: in.Watching,
		}); err != nil {
			return command.Change[WatchView]{}, err
		}
		before, after := strconv.FormatBool(was), strconv.FormatBool(in.Watching)
		// A person's subscription is private, not an issue's public activity.
		event, err := activity.Append(ctx, m, activity.Draft{
			Action:       command.SetIssueWatch,
			ResourceKind: activity.UserResource,
			ResourceID:   m.User.ID,
			Changes: []activity.FieldChange{{
				Field:  "watching",
				Before: &before,
				After:  &after,
			}},
		})
		if err != nil {
			return command.Change[WatchView]{}, err
		}
		id := event.ID.String()
		return command.Change[WatchView]{Result: view, EventID: &id, HTTPStatus: 200}, nil
	}, func(v WatchView) error {
		if v.IssueID.UUID == uuid.Nil {
			return errors.New("invalid watched issue")
		}
		return nil
	})
}

func (s *Service) SetLink(ctx context.Context, actor command.Actor, in LinkInput) (command.SaveOutcome[IssueView], error) {
	if in.ExpectedRevision < 1 || in.IssueID == in.TargetID || in.TargetID.UUID == uuid.Nil || (in.Kind != "relates_to" && in.Kind != "duplicates") {
		return command.SaveOutcome[IssueView]{}, validation("targetId", "Choose a different issue and a supported relation.")
	}
	request := command.MutationRequest{
		Actor:           actor,
		Operation:       command.SetIssueLink,
		RetryReference:  in.RetryReference,
		ResolveProjects: issueScopes(in.IssueID, true),
	}
	return command.Save(ctx, s.runner, request, in, noExtraAuthorization, func(ctx context.Context, m *command.Mutation, in LinkInput) (command.Change[IssueView], error) {
		current, err := readView(ctx, m, in.IssueID)
		if err != nil {
			return command.Change[IssueView]{}, err
		}
		if current.Summary.Revision != in.ExpectedRevision {
			return command.Change[IssueView]{}, conflict(current)
		}
		target, err := m.Queries.ReadIssue(ctx, in.TargetID.UUID)
		if err != nil || target.ProjectID != current.Summary.ProjectID.UUID {
			return command.Change[IssueView]{}, validation("targetId", "Choose an issue in the same project.")
		}
		sourceID, targetID := in.IssueID.UUID, in.TargetID.UUID
		if in.Kind == "relates_to" && sourceID.String() > targetID.String() {
			sourceID, targetID = targetID, sourceID
		}
		exists, err := m.Queries.IssuesLinkExists(ctx, dbgen.IssuesLinkExistsParams{
			IssueID:  sourceID,
			TargetID: targetID,
			Kind:     in.Kind,
		})
		if err != nil {
			return command.Change[IssueView]{}, err
		}
		if exists == in.Enabled {
			return command.Change[IssueView]{Result: current, HTTPStatus: 200}, nil
		}
		targetLinks, err := m.Queries.IssuesLinks(ctx, in.TargetID.UUID)
		if err != nil {
			return command.Change[IssueView]{}, err
		}
		if in.Enabled && (len(current.Links) >= 100 || len(targetLinks) >= 100) {
			return command.Change[IssueView]{}, validation("targetId", "Each issue supports up to 100 related issue links.")
		}
		if err := m.Queries.IssuesSetLink(ctx, dbgen.IssuesSetLinkParams{
			IssueID:   sourceID,
			TargetID:  targetID,
			Kind:      in.Kind,
			CreatedBy: m.User.ID,
			Enabled:   in.Enabled,
		}); err != nil {
			return command.Change[IssueView]{}, err
		}
		for _, id := range []uuid.UUID{in.IssueID.UUID, in.TargetID.UUID} {
			if err := m.Queries.IssuesAdvanceRevision(ctx, id); err != nil {
				return command.Change[IssueView]{}, err
			}
		}
		view, err := readView(ctx, m, in.IssueID)
		if err != nil {
			return command.Change[IssueView]{}, err
		}
		before, after := strconv.FormatBool(exists), strconv.FormatBool(in.Enabled)
		event, err := issueEvent(ctx, m, command.SetIssueLink, view, []activity.FieldChange{{
			Field:  "links." + in.TargetID.String() + "." + in.Kind,
			Before: &before,
			After:  &after,
		}}, nil)
		return command.Change[IssueView]{Result: view, EventID: event, HTTPStatus: 200}, err
	}, validateView)
}

type SearchKind struct{}
type SavedSearchID = command.ID[SearchKind]
type SavedSearch struct {
	ID       SavedSearchID       `json:"id"`
	Name     string              `json:"name" minLength:"1" maxLength:"80"`
	Filters  command.IssueFilter `json:"filters"`
	Revision command.Revision    `json:"revision"`
	Removed  bool                `json:"removed"`
}
type SavedSearchList struct {
	Items []SavedSearch `json:"items" nullable:"false" maxItems:"50"`
}
type SaveSearchInput struct {
	SearchID         SavedSearchID           `json:"searchId"`
	ExpectedRevision command.InitialRevision `json:"expectedRevision"`
	Name             string                  `json:"name" minLength:"1" maxLength:"80"`
	Filters          command.IssueFilter     `json:"filters"`
	Removed          bool                    `json:"removed,omitempty"`
	RetryReference   string                  `json:"retryReference" format:"uuid"`
}

func savedSearch(row dbgen.SavedIssueSearch) (SavedSearch, error) {
	filter, err := database.DecodeJSON[command.IssueFilter](row.Filters)
	return SavedSearch{
		ID:       SavedSearchID{UUID: row.ID},
		Name:     row.Name,
		Filters:  filter,
		Revision: command.Revision(row.Revision),
		Removed:  row.Removed,
	}, err
}
func (s *Service) SavedSearches(ctx context.Context, actor command.Actor) (SavedSearchList, error) {
	return command.Read(ctx, s.runner, actor, command.Access{}, func(ctx context.Context, m *command.Mutation) (SavedSearchList, error) {
		rows, err := m.Queries.SavedSearchesList(ctx, m.User.ID)
		if err != nil {
			return SavedSearchList{}, err
		}
		result := SavedSearchList{Items: []SavedSearch{}}
		for _, row := range rows {
			item, err := savedSearch(row)
			if err != nil {
				return result, err
			}
			result.Items = append(result.Items, item)
		}
		return result, nil
	})
}
func (s *Service) SaveSearch(ctx context.Context, actor command.Actor, in SaveSearchInput) (command.SaveOutcome[SavedSearch], error) {
	in.Name = strings.TrimSpace(in.Name)
	if in.SearchID.UUID == uuid.Nil || in.ExpectedRevision < 0 || command.ValidateText(in.Name, 1, 80) != nil {
		return command.SaveOutcome[SavedSearch]{}, validation("name", "Choose a search name and its current revision.")
	}
	filter, err := command.NormalizeIssueFilter(in.Filters)
	if err != nil {
		return command.SaveOutcome[SavedSearch]{}, validation("filters", err.Error())
	}
	in.Filters = filter
	request := command.MutationRequest{Actor: actor, Operation: command.SaveIssueSearch, RetryReference: in.RetryReference}
	return command.Save(ctx, s.runner, request, in, noExtraAuthorization, func(ctx context.Context, m *command.Mutation, in SaveSearchInput) (command.Change[SavedSearch], error) {
		// Serialize a caller's named-search edits across distinct retry references.
		if err := m.Queries.SavedSearchesLockUser(ctx, m.User.ID); err != nil {
			return command.Change[SavedSearch]{}, err
		}
		prior, err := m.Queries.SavedSearchesGet(ctx, dbgen.SavedSearchesGetParams{ID: in.SearchID.UUID, UserID: m.User.ID})
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return command.Change[SavedSearch]{}, err
		}
		if (errors.Is(err, pgx.ErrNoRows) && in.ExpectedRevision != 0) || (err == nil && prior.Revision != int64(in.ExpectedRevision)) {
			return command.Change[SavedSearch]{}, validation("expectedRevision", "This saved search changed or is unavailable. Reload your searches.")
		}
		if (errors.Is(err, pgx.ErrNoRows) || prior.Removed) && !in.Removed {
			count, err := m.Queries.SavedSearchesCount(ctx, m.User.ID)
			if err != nil {
				return command.Change[SavedSearch]{}, err
			}
			if count >= 50 {
				return command.Change[SavedSearch]{}, validation("name", "Remove a saved search before adding another; the limit is 50.")
			}
		}
		data, err := json.Marshal(in.Filters)
		if err != nil {
			return command.Change[SavedSearch]{}, err
		}
		row, err := m.Queries.SavedSearchesSave(ctx, dbgen.SavedSearchesSaveParams{
			ID:      in.SearchID.UUID,
			UserID:  m.User.ID,
			Name:    in.Name,
			Filters: data,
			Removed: in.Removed,
		})
		if err != nil {
			return command.Change[SavedSearch]{}, validation("name", "This search identifier or name is unavailable. Reload and choose a unique name.")
		}
		view, err := savedSearch(row)
		if err != nil {
			return command.Change[SavedSearch]{}, err
		}
		before, after := strconv.FormatInt(int64(in.ExpectedRevision), 10), view.Revision.String()
		event, err := activity.Append(ctx, m, activity.Draft{
			Action:       command.SaveIssueSearch,
			ResourceKind: "saved_search",
			ResourceID:   in.SearchID.UUID,
			Changes: []activity.FieldChange{{
				Field:  "revision",
				Before: &before,
				After:  &after,
			}},
		})
		if err != nil {
			return command.Change[SavedSearch]{}, err
		}
		id := event.ID.String()
		return command.Change[SavedSearch]{Result: view, EventID: &id, HTTPStatus: 200}, nil
	}, func(v SavedSearch) error { return v.Filters.Validate() })
}
