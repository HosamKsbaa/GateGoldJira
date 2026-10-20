package integrations_test

import (
	"context"
	"gategoldjira/backend/internal/features/integrations"
	"gategoldjira/backend/internal/platform/command"
	"github.com/google/uuid"
	"testing"
)

func TestCanonicalAssignmentStageIdentityIsScopedAndReplays(t *testing.T) {
	f := integrationDatabase(t)
	ctx := context.Background()
	var id uuid.UUID
	if err := f.pool.QueryRow(ctx, "SELECT id FROM workflow_stages WHERE project_id=$1 AND legacy_status='review'", f.project.UUID).Scan(&id); err != nil {
		t.Fatal(err)
	}
	stage := command.StageID{UUID: id}
	input := integrations.AutomationRuleInput{
		ProjectID: f.project,
		RuleID:    command.NewID[integrations.RuleMarker](),
		AutomationRuleFields: integrations.AutomationRuleFields{
			StageID:    &stage,
			Name:       "مراجع",
			AssigneeID: f.member.UserID,
			Enabled:    true,
		},
		RetryReference: uuid.NewString(),
	}
	saved, err := f.s.SaveRule(ctx, f.owner, input)
	if err != nil || saved.Body.Result.StageID == nil || *saved.Body.Result.StageID != stage || saved.Body.Result.Stage != command.Review {
		t.Fatal("canonical rule", err)
	}
	actor := f.owner
	actor.Channel = command.MCP
	replayed, err := f.s.SaveRule(ctx, actor, input)
	if err != nil || !replayed.Body.Receipt.Replayed {
		t.Fatal("stage identity replay", err)
	}
	other := command.NewID[command.StageKind]()
	input.StageID = &other
	input.RuleID = command.NewID[integrations.RuleMarker]()
	input.RetryReference = uuid.NewString()
	if _, err = f.s.SaveRule(ctx, f.owner, input); code(err) != command.Unavailable {
		t.Fatal("unscoped stage", err)
	}
	if _, err = f.s.SaveRule(ctx, f.viewer, input); code(err) != command.Forbidden {
		t.Fatal("viewer wrote rule", err)
	}
}
