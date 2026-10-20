package notifications

import (
	"context"
	"errors"
	"sort"

	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"github.com/google/uuid"
)

type Effect string

const (
	IssueUpdated         Effect = "issue_updated"
	NewComment           Effect = "new_comment"
	EditedComment        Effect = "edited_comment"
	NewAssignment        Effect = "new_assignment"
	ChangedStatus        Effect = "changed_status"
	ChangedDueDate       Effect = "changed_due_date"
	BecameBlocked        Effect = "became_blocked"
	LastBlockerCompleted Effect = "last_blocker_completed"
	NewSubtask           Effect = "new_subtask"
	LastSubtaskCompleted Effect = "last_subtask_completed"
)

// For dependency/child effects, IssueID identifies the affected dependent or
// parent. Comments supply selected mentions; edits supply newly added IDs only.
type Fact struct {
	WatcherIDs     []command.UserID
	ProjectID      command.ProjectID
	IssueID        command.IssueID
	ReporterID     command.UserID
	AssigneeID     *command.UserID
	MentionUserIDs []command.UserID
	Effect         Effect
	Summary        string
}
type candidateKey struct {
	Project   command.ProjectID
	Issue     command.IssueID
	Recipient command.UserID
}
type candidate struct {
	Reasons []Reason
	Summary string
}
type ProjectRecipients struct {
	ID      command.ProjectID
	UserIDs []uuid.UUID
}

func includeReason(reasons []Reason, reason Reason) []Reason {
	for _, existing := range reasons {
		if existing == reason {
			return reasons
		}
	}
	return append(reasons, reason)
}

func recipients(facts []Fact, actor command.UserID) (map[candidateKey]candidate, error) {
	result := make(map[candidateKey]candidate)
	for _, fact := range facts {
		if fact.ProjectID.UUID == uuid.Nil || fact.IssueID.UUID == uuid.Nil || fact.ReporterID.UUID == uuid.Nil {
			return nil, errors.New("notification fact has an invalid identifier")
		}
		if err := command.ValidateText(fact.Summary, 1, 1000); err != nil {
			return nil, err
		}
		add := func(user command.UserID, reason Reason) {
			if user == actor || user.UUID == uuid.Nil {
				return
			}
			key := candidateKey{fact.ProjectID, fact.IssueID, user}
			entry := result[key]
			entry.Reasons = includeReason(entry.Reasons, reason)
			if entry.Summary == "" {
				entry.Summary = fact.Summary
			}
			result[key] = entry
		}
		responsible := func(reason Reason) {
			add(fact.ReporterID, reason)
			if fact.AssigneeID != nil {
				add(*fact.AssigneeID, reason)
			}
		}
		for _, user := range fact.WatcherIDs {
			add(user, Watching)
		}
		switch fact.Effect {
		case IssueUpdated: // Only subscribers receive generic field changes.
		case NewComment:
			responsible(Comment)
			for _, user := range fact.MentionUserIDs {
				add(user, Mention)
			}
		case EditedComment:
			for _, user := range fact.MentionUserIDs {
				add(user, Mention)
			}
		case NewAssignment:
			if fact.AssigneeID != nil {
				add(*fact.AssigneeID, Assignment)
			}
		case ChangedStatus:
			responsible(Status)
		case ChangedDueDate:
			responsible(DueDate)
		case BecameBlocked:
			responsible(DependencyBlocked)
		case LastBlockerCompleted:
			responsible(DependencyResolved)
		case NewSubtask:
			responsible(SubtaskCreated)
		case LastSubtaskCompleted:
			responsible(SubtasksCompleted)
		default:
			return nil, errors.New("unsupported notification effect")
		}
	}
	return result, nil
}

// Write shares the business transaction, including current recipient checks.
// No user/account/comment/issue service imports or asynchronous queue are needed.
func Write(ctx context.Context, mutation *command.Mutation, event command.EventID, facts []Fact) error {
	if event.UUID == uuid.Nil {
		return errors.New("notification requires a saved event identity")
	}
	issueIDs := []uuid.UUID{}
	seenIssues := map[uuid.UUID]bool{}
	for _, fact := range facts {
		if !seenIssues[fact.IssueID.UUID] {
			issueIDs = append(issueIDs, fact.IssueID.UUID)
			seenIssues[fact.IssueID.UUID] = true
		}
	}
	watched, err := mutation.Queries.NotificationWatchers(ctx, issueIDs)
	if err != nil {
		return err
	}
	byIssue := map[uuid.UUID][]command.UserID{}
	for _, row := range watched {
		byIssue[row.IssueID] = append(byIssue[row.IssueID], command.UserID{UUID: row.UserID})
	}
	for index := range facts {
		facts[index].WatcherIDs = byIssue[facts[index].IssueID.UUID]
	}
	candidates, err := recipients(facts, mutation.Actor.UserID)
	if err != nil {
		return err
	}
	projects := make(map[command.ProjectID][]uuid.UUID)
	for key := range candidates {
		projects[key.Project] = append(projects[key.Project], key.Recipient.UUID)
	}
	eligibleUsers := make(map[command.ProjectID]map[uuid.UUID]bool)
	for project, users := range projects {
		rows, err := mutation.Queries.EligibleNotificationRecipients(ctx, dbgen.EligibleNotificationRecipientsParams{ProjectID: project.UUID, Column2: users})
		if err != nil {
			return err
		}
		eligibleUsers[project] = make(map[uuid.UUID]bool, len(rows))
		for _, id := range rows {
			eligibleUsers[project][id] = true
		}
	}
	keys := make([]candidateKey, 0, len(candidates))
	for key := range candidates {
		if eligibleUsers[key.Project][key.Recipient.UUID] {
			keys = append(keys, key)
		}
	}
	sort.Slice(keys, func(i, j int) bool {
		if keys[i].Issue != keys[j].Issue {
			return keys[i].Issue.String() < keys[j].Issue.String()
		}
		return keys[i].Recipient.String() < keys[j].Recipient.String()
	})
	params := make([]dbgen.InsertNotificationBatchParams, 0, len(keys))
	for _, key := range keys {
		entry := candidates[key]
		reasons := make([]string, 0, len(entry.Reasons))
		for _, reason := range entry.Reasons {
			reasons = append(reasons, string(reason))
		}
		params = append(params, dbgen.InsertNotificationBatchParams{
			ID:               uuid.New(),
			RecipientID:      key.Recipient.UUID,
			EventID:          event.UUID,
			ProjectID:        key.Project.UUID,
			IssueID:          key.Issue.UUID,
			ActorID:          mutation.User.ID,
			Reasons:          reasons,
			PlainTextSummary: entry.Summary,
		})
	}
	if len(params) == 0 {
		return nil
	}
	batch := mutation.Queries.InsertNotificationBatch(ctx, params)
	var firstError error
	batch.Exec(func(_ int, err error) {
		if firstError == nil {
			firstError = err
		}
	})
	return firstError
}

// Published file changes share the same current-recipient checks as other issue changes.
func WatchIssueChange(ctx context.Context, m *command.Mutation, event command.EventID, issue command.IssueID, summary string) error {
	row, err := m.Queries.ReadIssue(ctx, issue.UUID)
	if err != nil {
		return err
	}
	return Write(ctx, m, event, []Fact{{
		ProjectID:  command.ProjectID{UUID: row.ProjectID},
		IssueID:    issue,
		ReporterID: command.UserID{UUID: row.ReporterID},
		Effect:     IssueUpdated,
		Summary:    summary,
	}})
}
