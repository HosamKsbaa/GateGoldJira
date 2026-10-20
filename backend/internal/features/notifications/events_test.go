package notifications

import (
	"testing"

	"gategoldjira/backend/internal/platform/command"
)

func TestExactRecipientTable(t *testing.T) {
	actor, reporter, assignee, mentioned := command.NewID[command.UserKind](), command.NewID[command.UserKind](), command.NewID[command.UserKind](), command.NewID[command.UserKind]()
	project, issue := command.NewID[command.ProjectKind](), command.NewID[command.IssueKind]()
	for _, test := range []struct {
		effect Effect
		wanted int
		reason Reason
	}{
		{NewComment, 3, Comment}, {EditedComment, 1, Mention}, {NewAssignment, 1, Assignment},
		{ChangedStatus, 2, Status}, {ChangedDueDate, 2, DueDate}, {BecameBlocked, 2, DependencyBlocked},
		{LastBlockerCompleted, 2, DependencyResolved}, {NewSubtask, 2, SubtaskCreated}, {LastSubtaskCompleted, 2, SubtasksCompleted},
	} {
		t.Run(string(test.effect), func(t *testing.T) {
			fact := Fact{
				ProjectID:      project,
				IssueID:        issue,
				ReporterID:     reporter,
				AssigneeID:     &assignee,
				MentionUserIDs: []command.UserID{mentioned, actor},
				Effect:         test.effect,
				Summary:        "مراجعة العمل",
			}
			result, err := recipients([]Fact{fact}, actor)
			if err != nil || len(result) != test.wanted {
				t.Fatalf("recipients=%d want=%d err=%v", len(result), test.wanted, err)
			}
			for key, entry := range result {
				if key.Recipient == actor {
					t.Fatal("actor notified themselves")
				}
				if test.effect == EditedComment && key.Recipient != mentioned {
					t.Fatal("edit notified an existing responsible user")
				}
				if test.effect == NewAssignment && key.Recipient != assignee {
					t.Fatal("assignment notified someone other than new assignee")
				}
				if test.effect != NewComment && (len(entry.Reasons) != 1 || entry.Reasons[0] != test.reason) {
					t.Fatal("wrong notification reason")
				}
			}
		})
	}

	fact := Fact{
		ProjectID:      project,
		IssueID:        issue,
		ReporterID:     reporter,
		AssigneeID:     &reporter,
		MentionUserIDs: []command.UserID{reporter, reporter, actor},
		Effect:         NewComment,
		Summary:        "Merged roles",
	}
	result, err := recipients([]Fact{fact, fact}, actor)
	if err != nil || len(result) != 1 {
		t.Fatal("duplicate role or fact created extra recipients")
	}
	for _, entry := range result {
		if len(entry.Reasons) != 2 {
			t.Fatal("comment/mention reasons were not unioned")
		}
	}
	fact.Effect = NewAssignment
	fact.AssigneeID = nil
	result, err = recipients([]Fact{fact}, actor)
	if err != nil || len(result) != 0 {
		t.Fatal("clearing assignment created notification")
	}
}
