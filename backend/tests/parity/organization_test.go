package parity

import (
	"context"
	"testing"

	"gategoldjira/backend/internal/features/boards"
	"gategoldjira/backend/internal/features/identity"
	"gategoldjira/backend/internal/features/issues"
	"gategoldjira/backend/internal/features/projects"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/httpapi"
	"gategoldjira/backend/tests/testapp"
	"github.com/google/uuid"
)

func TestLabelsDatesAndSubtasksShareChannelsReplaysFiltersAndRestart(t *testing.T) {
	r := testapp.NewRuntime(t)
	admin := reference(t, r, r.Admin)
	project := call[projects.CreateInput, command.Saved[projects.ProjectView], httpapi.FailureBody](t, admin, command.CreateProject, projects.CreateInput{
		Key:            "ORG",
		Name:           "تنظيم العمل",
		RetryReference: uuid.NewString(),
	})
	if !project.OK {
		t.Fatal("project", project.Error)
	}
	projectID := project.Data.Result.ID
	for i, user := range []command.UserID{r.Member, r.Viewer} {
		role := command.Member
		if i == 1 {
			role = command.Viewer
		}
		member := call[identity.SetMembershipInput, command.Saved[identity.MembershipView], httpapi.FailureBody](t, admin, command.SetMembership, identity.SetMembershipInput{
			ProjectID:      projectID,
			UserID:         user,
			Role:           role,
			RetryReference: uuid.NewString(),
		})
		if !member.OK {
			t.Fatal("membership", member.Error)
		}
	}
	member, viewer := reference(t, r, r.Member), reference(t, r, r.Viewer)
	labelInput := issues.CreateLabelInput{
		ProjectID:         projectID,
		CreateLabelFields: issues.CreateLabelFields{Name: "عاجل Straße"},
		RetryReference:    uuid.NewString(),
	}
	originalLabelInput := labelInput
	label := call[issues.CreateLabelInput, command.Saved[issues.LabelView], issues.IssueFailureBody](t, member, command.CreateLabel, labelInput)
	if !label.OK {
		t.Fatal("label", label.Error)
	}
	replay, status := rest[issues.CreateLabelFields, command.Saved[issues.LabelView]](t, r, r.Member, "POST", "/projects/"+projectID.String()+"/labels", labelInput.RetryReference, labelInput.CreateLabelFields)
	if status != 201 || !replay.Receipt.Replayed || replay.Result.ID != label.Data.Result.ID {
		t.Fatal("cross-channel label retry", status)
	}
	labelInput.Name = "عاجل STRASSE"
	labelInput.RetryReference = uuid.NewString()
	reused := call[issues.CreateLabelInput, command.Saved[issues.LabelView], issues.IssueFailureBody](t, member, command.CreateLabel, labelInput)
	if !reused.OK || reused.Data.Result.ID != label.Data.Result.ID || reused.Data.Receipt.EventID != nil {
		t.Fatal("casefold reuse", reused.Error)
	}
	labels := call[issues.ListLabelsInput, command.Page[issues.LabelView], issues.IssueFailureBody](t, viewer, command.ListLabels, issues.ListLabelsInput{ProjectID: projectID, Query: "STRASSE"})
	if !labels.OK || labels.Data.TotalMatching != 1 || labels.Data.Items[0].Name != "عاجل Straße" {
		t.Fatal("Unicode catalog", labels.Error)
	}
	due, _ := command.ParseDate("2026-10-11")
	parent := call[issues.CreateInput, command.Saved[issues.IssueView], issues.IssueFailureBody](t, member, command.CreateIssue, issues.CreateInput{
		ProjectID: projectID,
		CreateIssueFields: issues.CreateIssueFields{
			Title:    "Parent",
			DueDate:  &due,
			LabelIDs: []command.LabelID{label.Data.Result.ID},
		},
		RetryReference: uuid.NewString(),
	})
	if !parent.OK {
		t.Fatal("parent", parent.Error)
	}
	parentID := parent.Data.Result.Summary.ID
	childInput := issues.CreateSubtaskInput{
		ParentID: parentID,
		CreateSubtaskFields: issues.CreateSubtaskFields{
			ExpectedParentRevision: parent.Data.Result.Summary.Revision,
			Title:                  "عمل مستقل",
			AssigneeID:             &r.Admin,
		},
		RetryReference: uuid.NewString(),
	}
	child := call[issues.CreateSubtaskInput, command.Saved[issues.IssueView], issues.IssueFailureBody](t, member, command.CreateSubtask, childInput)
	if !child.OK || child.Data.Result.Summary.DueDate != nil || len(child.Data.Result.Summary.Labels) != 0 || child.Data.Result.Reporter.ID != r.Member {
		t.Fatal("child independent fields", child.Error)
	}
	r.Restart(t)
	again, status := rest[issues.CreateSubtaskFields, command.Saved[issues.IssueView]](t, r, r.Member, "POST", "/issues/"+parentID.String()+"/subtasks", childInput.RetryReference, childInput.CreateSubtaskFields)
	if status != 201 || !again.Receipt.Replayed || again.Result.Summary.ID != child.Data.Result.Summary.ID {
		t.Fatal("child retry after restart", status)
	}
	read, status := rest[struct{}, command.Page[issues.IssueSummary]](t, r, r.Viewer, "GET", "/issues/"+parentID.String()+"/subtasks", "", struct{}{})
	if status != 200 || read.TotalMatching != 1 || read.Items[0].Parent.Value.ID != parentID || read.Items[0].Assignee.Value.ID != r.Admin {
		t.Fatal("child list", status)
	}
	listed := call[issues.ListSubtasksInput, command.Page[issues.IssueSummary], issues.IssueFailureBody](t, viewer, command.ListSubtasks, issues.ListSubtasksInput{ParentID: parentID})
	if !listed.OK || listed.Data.Items[0].ID != read.Items[0].ID {
		t.Fatal("child list parity", listed.Error)
	}
	matches := call[issues.SearchInput, command.Page[issues.IssueSummary], issues.IssueFailureBody](t, viewer, command.SearchIssues, issues.SearchInput{Filters: command.IssueFilter{
		ProjectIDs: []command.ProjectID{projectID},
		LabelIDs:   []command.LabelID{label.Data.Result.ID},
		DueFrom:    &due,
		DueTo:      &due,
	}})
	if !matches.OK || matches.Data.TotalMatching != 1 || matches.Data.Items[0].ID != parentID {
		t.Fatal("inclusive date/label filters", matches.Error)
	}
	filteredBoard := call[boards.CreateInput, command.Saved[command.BoardSummary], httpapi.FailureBody](t, member, command.CreateBoard, boards.CreateInput{
		ProjectID: projectID,
		Name:      "Dated labels",
		SavedFilters: command.IssueFilter{
			LabelIDs: []command.LabelID{label.Data.Result.ID},
			DueFrom:  &due,
			DueTo:    &due,
		},
		RetryReference: uuid.NewString(),
	})
	if !filteredBoard.OK {
		t.Fatal("filtered board", filteredBoard.Error)
	}
	board := call[boards.GetInput, command.BoardView, httpapi.FailureBody](t, viewer, command.GetBoard, boards.GetInput{
		BoardID:          filteredBoard.Data.Result.ID,
		TemporaryFilters: command.IssueFilter{Assignee: &command.AssigneeFilter{Mode: command.Unassigned}},
	})
	if !board.OK || board.Data.Columns[0].SavedMatchCount != 1 || board.Data.Columns[0].VisibleMatchCount != 1 {
		t.Fatal("saved and temporary date/label/unassigned board filters", board.Error)
	}
	cards := call[boards.CardsInput, boards.CardPage, httpapi.FailureBody](t, viewer, command.ListBoardCards, boards.CardsInput{
		BoardID: filteredBoard.Data.Result.ID,
		Status:  command.Todo,
	})
	if !cards.OK || len(cards.Data.Items) != 1 || cards.Data.Items[0].ID != parentID {
		t.Fatal("filtered cards", cards.Error)
	}
	childMatches := call[issues.SearchInput, command.Page[issues.IssueSummary], issues.IssueFailureBody](t, viewer, command.SearchIssues, issues.SearchInput{Filters: command.IssueFilter{
		ProjectIDs: []command.ProjectID{projectID},
		ParentID:   &parentID,
		Assignee: &command.AssigneeFilter{
			Mode:   command.AssigneeUser,
			UserID: &r.Admin,
		},
	}})
	if !childMatches.OK || childMatches.Data.TotalMatching != 1 || childMatches.Data.Items[0].ID != child.Data.Result.Summary.ID {
		t.Fatal("child-parent-assignment filter intersection", childMatches.Error)
	}
	denied := call[issues.CreateSubtaskInput, command.Saved[issues.IssueView], issues.IssueFailureBody](t, viewer, command.CreateSubtask, childInput)
	if denied.OK || denied.Error.Error.Code != command.Forbidden {
		t.Fatal("Viewer child write")
	}
	childInput.ParentID = child.Data.Result.Summary.ID
	childInput.RetryReference = uuid.NewString()
	nested := call[issues.CreateSubtaskInput, command.Saved[issues.IssueView], issues.IssueFailureBody](t, member, command.CreateSubtask, childInput)
	if nested.OK || nested.Error.Error.Code != command.Validation {
		t.Fatal("nested child accepted", nested.Error)
	}
	if _, err := r.Pool.Exec(context.Background(), "UPDATE project_memberships SET removed_at=now() WHERE project_id=$1 AND user_id=$2", projectID.UUID, r.Member.UUID); err != nil {
		t.Fatal(err)
	}
	childInput.ParentID = parentID
	// Revoke before replay: neither a cached child nor a label may reveal project work.
	labelInput = originalLabelInput
	revoked := call[issues.CreateLabelInput, command.Saved[issues.LabelView], issues.IssueFailureBody](t, member, command.CreateLabel, labelInput)
	if revoked.OK || revoked.Error.Error.Code != command.Unavailable {
		t.Fatal("revoked label replay exposed")
	}
}
