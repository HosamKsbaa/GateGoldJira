package integration

import (
	"context"
	"errors"
	"testing"

	"gategoldjira/backend/db/migrations"
	"gategoldjira/backend/internal/features/activity"
	"gategoldjira/backend/internal/features/notifications"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/tests/testenv"
	"github.com/google/uuid"
)

func TestActivityNotificationAndRetryCommitTogether(t *testing.T) {
	ctx := context.Background()
	pool := testenv.Database(t)
	if err := migrations.Apply(ctx, pool); err != nil {
		t.Fatal(err)
	}
	actor, recipient, disabled := command.NewID[command.UserKind](), command.NewID[command.UserKind](), command.NewID[command.UserKind]()
	project, issue := command.NewID[command.ProjectKind](), command.NewID[command.IssueKind]()
	for i, id := range []command.UserID{actor, recipient, disabled} {
		if _, err := pool.Exec(ctx, "INSERT INTO users(id,email,email_key,display_name,approved_at,is_administrator) VALUES($1,$2,$2,'User',now(),$3)", id.UUID, id.String()+"@example.test", i == 0); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := pool.Exec(ctx, "UPDATE users SET disabled_at=now() WHERE id=$1", disabled.UUID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, "INSERT INTO projects(id,key,name,created_by) VALUES($1,'GG','Project',$2)", project.UUID, actor.UUID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, "INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,'viewer')", project.UUID, recipient.UUID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, "INSERT INTO issues(id,project_id,number,title,reporter_id,assignee_id,rank) VALUES($1,$2,1,'Issue',$3,$3,1024)", issue.UUID, project.UUID, recipient.UUID); err != nil {
		t.Fatal(err)
	}
	request := command.MutationRequest{
		Actor:          command.Actor{UserID: actor, Channel: command.MCP},
		Operation:      command.UpdateIssue,
		RetryReference: uuid.NewString(),
		Access:         command.Access{Projects: []command.ProjectScope{{ProjectID: project, Write: true}}},
	}
	type input struct {
		Fail bool `json:"fail"`
	}
	type output struct {
		EventID command.EventID `json:"eventId"`
	}
	apply := func(ctx context.Context, mutation *command.Mutation, value input) (output, error) {
		before, after := "Old", "New"
		event, err := activity.Append(ctx, mutation, activity.Draft{
			Action:       request.Operation,
			ResourceKind: activity.IssueResource,
			ResourceID:   issue.UUID,
			ProjectID:    &project,
			IssueID:      &issue,
			Changes: []activity.FieldChange{{
				Field:  "title",
				Before: &before,
				After:  &after,
			}},
		})
		if err != nil {
			return output{}, err
		}
		fact := notifications.Fact{
			ProjectID:      project,
			IssueID:        issue,
			ReporterID:     recipient,
			AssigneeID:     &recipient,
			MentionUserIDs: []command.UserID{recipient, actor, disabled},
			Effect:         notifications.NewComment,
			Summary:        "تعليق جديد",
		}
		if err := notifications.Write(ctx, mutation, event.ID, []notifications.Fact{fact}); err != nil {
			return output{}, err
		}
		if value.Fail {
			return output{}, &command.Failure{
				Code:       command.Validation,
				Message:    "intentional rollback",
				NextAction: command.ReviewFields,
			}
		}
		return output{event.ID}, nil
	}
	authorize := func(context.Context, *command.Mutation) error { return nil }
	validate := func(result output) error {
		if result.EventID.UUID == uuid.Nil {
			return errors.New("missing event")
		}
		return nil
	}
	if _, err := command.Execute(ctx, command.Runner{Pool: pool}, request, input{true}, authorize, apply, validate); err == nil {
		t.Fatal("failed event command succeeded")
	}
	for _, table := range []string{"activity_events", "notifications", "idempotency_records"} {
		var count int
		if err := pool.QueryRow(ctx, "SELECT count(*) FROM "+table).Scan(&count); err != nil || count != 0 {
			t.Fatal("rollback left partial event state", table, count, err)
		}
	}
	first, err := command.Execute(ctx, command.Runner{Pool: pool}, request, input{false}, authorize, apply, validate)
	if err != nil {
		t.Fatal(err)
	}
	second, err := command.Execute(ctx, command.Runner{Pool: pool}, request, input{false}, authorize, apply, validate)
	if err != nil || second.EventID != first.EventID {
		t.Fatal("retry recreated event")
	}
	var count int
	var reasons []string
	if err := pool.QueryRow(ctx, "SELECT count(*) FROM activity_events").Scan(&count); err != nil || count != 1 {
		t.Fatal("duplicate activity")
	}
	if err := pool.QueryRow(ctx, "SELECT count(*) FROM notifications").Scan(&count); err != nil || count != 1 {
		t.Fatal("duplicate or ineligible notification")
	}
	if err := pool.QueryRow(ctx, "SELECT reasons FROM notifications WHERE recipient_id=$1", recipient.UUID).Scan(&reasons); err != nil || len(reasons) != 2 {
		t.Fatal("overlapping reasons lost", err)
	}
}
