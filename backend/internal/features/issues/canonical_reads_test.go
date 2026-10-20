package issues

import (
	"context"
	"encoding/json"
	"errors"
	"gategoldjira/backend/internal/platform/command"
	"github.com/google/uuid"
	"testing"
)

func TestCanonicalIssueReadUsesCurrentTypedChoicesAndRetainsAccessChecks(t *testing.T) {
	f := issueDatabase(t)
	ctx := context.Background()
	issue := f.create(t, "عمل جديد")
	kind, priority := command.NewID[command.IssueTypeKind](), command.NewID[command.PriorityKind]()
	if _, err := f.pool.Exec(ctx, "INSERT INTO issue_types(id,project_id,key,name,behavior) VALUES($1,$2,'story','قصة','standard')", kind.UUID, f.project.UUID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.pool.Exec(ctx, "INSERT INTO priorities(id,project_id,key,name,sort_order) VALUES($1,$2,'urgent','عاجل',9007199254740993)", priority.UUID, f.project.UUID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.pool.Exec(ctx, "INSERT INTO issue_type_workflows(project_id,type_id,workflow_id,is_default,accepts_new) SELECT project_id,$2,workflow_id,true,true FROM issues WHERE id=$1", issue.Summary.ID.UUID, kind.UUID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.pool.Exec(ctx, "UPDATE projects SET core_mode='modern' WHERE id=$1", f.project.UUID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.pool.Exec(ctx, "UPDATE issues SET type_id=$2,priority_id=$3 WHERE id=$1", issue.Summary.ID.UUID, kind.UUID, priority.UUID); err != nil {
		t.Fatal(err)
	}
	view, err := f.service.GetModern(ctx, f.viewer, issue.Summary.ID)
	if err != nil || view.Summary.Type.ID != kind || view.Summary.Type.Key != "story" || view.Summary.Type.Name != "قصة" || view.Summary.Type.Behavior != command.StandardBehavior || view.Summary.Priority.ID != priority || view.Summary.Priority.Key != "urgent" {
		t.Fatal("canonical choices", view, err)
	}
	raw, err := json.Marshal(view)
	if err != nil {
		t.Fatal(err)
	}
	var wire struct {
		Summary struct {
			Priority struct {
				SortOrder string `json:"sortOrder"`
			} `json:"priority"`
		} `json:"summary"`
	}
	if json.Unmarshal(raw, &wire) != nil || wire.Summary.Priority.SortOrder != "9007199254740993" {
		t.Fatal("priority precision")
	}
	for _, cap := range view.Capabilities {
		if cap == command.IssueEdit {
			t.Fatal("viewer received write capability")
		}
	}
	if _, err = f.pool.Exec(ctx, "UPDATE priorities SET name='Urgent retained',retired=true WHERE id=$1", priority.UUID); err != nil {
		t.Fatal(err)
	}
	current, err := f.service.GetModern(ctx, f.member, issue.Summary.ID)
	if err != nil || current.Summary.Priority.Name != "Urgent retained" || !current.Summary.Priority.Retired || current.Summary.Revision != issue.Summary.Revision {
		t.Fatal("retained choice/name/content revision", current, err)
	}
	if _, err = f.pool.Exec(ctx, "UPDATE project_memberships SET removed_at=now() WHERE project_id=$1 AND user_id=$2", f.project.UUID, f.viewer.UserID.UUID); err != nil {
		t.Fatal(err)
	}
	_, err = f.service.GetModern(ctx, f.viewer, issue.Summary.ID)
	var failure *command.Failure
	if !errors.As(err, &failure) || failure.Code != command.Unavailable {
		t.Fatal("revoked read", err)
	}
	_, err = f.service.GetModern(ctx, f.owner, command.IssueID{UUID: uuid.New()})
	if !errors.As(err, &failure) || failure.Code != command.Unavailable {
		t.Fatal("missing issue", err)
	}
}
