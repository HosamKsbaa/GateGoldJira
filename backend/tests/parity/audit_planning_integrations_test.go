package parity

import (
	"encoding/json"
	"gategoldjira/backend/internal/features/integrations"
	"gategoldjira/backend/internal/features/planning"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/httpapi"
	"github.com/google/uuid"
	"math"
	"reflect"
	"testing"
	"time"
)

// Uses the same real-instance restart, stale-current-read, caller/Viewer denial,
// retry identity and REST/MCP equality assertions as the original60 operations.
func matrixPlanningAndIntegrations(t *testing.T, m *catalogMatrix, project command.ProjectID, member, admin command.UserID, issue command.IssueID) {
	target, _ := command.ParseDate("2026-10-31")
	epic := matrixSave[planning.PlanningCreateInput, planning.PlanningItemView, planning.PlanningFailureBody](t, m, member, command.CreatePlanningItem, planning.PlanningCreateInput{
		ProjectID: project,
		PlanningCreateFields: planning.PlanningCreateFields{
			Kind:        planning.Epic,
			Name:        "هدف الفريق",
			Description: "Coordinate work",
			TargetDate:  &target,
			Status:      planning.Planned,
		},
		RetryReference: uuid.NewString(),
	})
	epic = matrixSave[planning.PlanningUpdateInput, planning.PlanningItemView, planning.PlanningFailureBody](t, m, member, command.UpdatePlanningItem, planning.PlanningUpdateInput{
		ProjectID:  project,
		PlanningID: epic.ID,
		PlanningUpdateFields: planning.PlanningUpdateFields{
			ExpectedRevision: epic.Revision,
			Name:             epic.Name,
			Description:      epic.Description,
			TargetDate:       &target,
			Status:           planning.Active,
		},
		RetryReference: uuid.NewString(),
	})
	matrixRead[planning.PlanningListInput, command.Page[planning.PlanningItemView], planning.PlanningFailureBody](t, m, member, command.ListPlanningItems, planning.PlanningListInput{ProjectID: project})
	matrixSave[planning.IssuePlanningInput, planning.IssuePlanningView, planning.PlanningFailureBody](t, m, member, command.SetIssuePlanning, planning.IssuePlanningInput{
		IssueID:             issue,
		IssuePlanningFields: planning.IssuePlanningFields{EpicID: &epic.ID},
		RetryReference:      uuid.NewString(),
	})
	matrixRead[planning.GetIssueInput, planning.IssuePlanningView, planning.PlanningFailureBody](t, m, member, command.GetIssuePlanning, planning.GetIssueInput{IssueID: issue})
	matrixRead[planning.PlanningIssuesInput, command.Page[planning.PlanningIssueSummary], planning.PlanningFailureBody](t, m, member, command.ListPlanningIssues, planning.PlanningIssuesInput{ProjectID: project, PlanningID: epic.ID})
	from, _ := command.ParseDate("2026-10-01")
	through, _ := command.ParseDate("2026-10-31")
	matrixRead[planning.KanbanReportInput, planning.KanbanReport, planning.PlanningFailureBody](t, m, member, command.GetKanbanReport, planning.KanbanReportInput{
		ProjectID: project,
		From:      from,
		Through:   through,
	})
	matrixSave[integrations.DevelopmentLinkInput, integrations.DevelopmentLinkView, httpapi.FailureBody](t, m, member, command.SaveDevelopmentLink, integrations.DevelopmentLinkInput{
		IssueID: issue,
		LinkID:  command.NewID[integrations.LinkMarker](),
		DevelopmentLinkFields: integrations.DevelopmentLinkFields{
			Title: "Review pull request",
			URL:   "https://github.com/company/project/pull/123",
			Kind:  integrations.PullRequest,
		},
		RetryReference: uuid.NewString(),
	})
	matrixRead[integrations.DevelopmentListInput, command.Page[integrations.DevelopmentLinkView], httpapi.FailureBody](t, m, member, command.ListDevelopmentLinks, integrations.DevelopmentListInput{IssueID: issue})
	matrixSave[integrations.AutomationRuleInput, integrations.AutomationRuleView, httpapi.FailureBody](t, m, admin, command.SaveAutomationRule, integrations.AutomationRuleInput{
		ProjectID: project,
		RuleID:    command.NewID[integrations.RuleMarker](),
		AutomationRuleFields: integrations.AutomationRuleFields{
			Name:       "Assign review",
			Stage:      command.Review,
			AssigneeID: admin,
			Enabled:    true,
		},
		RetryReference: uuid.NewString(),
	})
	matrixRead[integrations.AutomationListInput, command.Page[integrations.AutomationRuleView], httpapi.FailureBody](t, m, member, command.ListAutomationRules, integrations.AutomationListInput{ProjectID: project})
}

// Live report timestamps and ages legitimately advance between transports.
// Verify exactly the elapsed delta, then compare every other field unchanged.
func assertEquivalentKanbanSnapshots(t *testing.T, expectedBytes, actualBytes []byte) {
	t.Helper()
	var expected, actual planning.KanbanReport
	if json.Unmarshal(expectedBytes, &expected) != nil || json.Unmarshal(actualBytes, &actual) != nil {
		t.Fatal("invalid typed report")
	}
	delta := actual.SnapshotAt.Sub(expected.SnapshotAt)
	if delta < 0 || delta > 5*time.Second || len(expected.Work.Items) != len(actual.Work.Items) {
		t.Fatal("inconsistent report snapshots")
	}
	for i := range expected.Work.Items {
		before, after := &expected.Work.Items[i], &actual.Work.Items[i]
		if before.ID != after.ID {
			t.Fatal("report issue ordering drift")
		}
		days := delta.Hours() / 24
		if math.Abs(after.WorkAgeDays-max(0, before.WorkAgeDays+days)) > 0.000001 {
			t.Fatal("work age does not follow snapshot time")
		}
		if (before.CycleAgeDays == nil) != (after.CycleAgeDays == nil) {
			t.Fatal("cycle age nullability drift")
		}
		if before.CycleAgeDays != nil && after.CycleAgeDays != nil && math.Abs(*after.CycleAgeDays-max(0, *before.CycleAgeDays+days)) > 0.000001 {
			t.Fatal("cycle age does not follow snapshot time")
		}
		after.WorkAgeDays = before.WorkAgeDays
		after.CycleAgeDays = before.CycleAgeDays
	}
	actual.SnapshotAt = expected.SnapshotAt
	if !reflect.DeepEqual(expected, actual) {
		t.Fatal("REST/MCP report state or metrics differ")
	}
}
