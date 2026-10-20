package issues

import (
	"context"
	"errors"
	"testing"

	"gategoldjira/backend/internal/platform/command"
	"github.com/google/uuid"
)

func TestCustomFieldDisplayNamesStayBoundedToAuthorizedRetainedValues(t *testing.T) {
	f := modernIssueFixture(t)
	ctx := context.Background()
	issue := f.createModern(t, "Retained field display")
	personID, choiceID, optionID := uuid.New(), uuid.New(), uuid.New()
	if _, err := f.pool.Exec(ctx, `INSERT INTO field_definitions(id,project_id,key,name,value_kind,retired) VALUES($1,$3,'historical_person','Historical person','user',true),($2,$3,'historical_choice','Historical choice','choice',true)`, personID, choiceID, f.project.UUID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.pool.Exec(ctx, `INSERT INTO field_options(id,project_id,field_id,name,position,retired) VALUES($1,$2,$3,'Historical outcome',1,true)`, optionID, f.project.UUID, choiceID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.pool.Exec(ctx, `INSERT INTO issue_field_values(project_id,issue_id,field_id,value_kind,user_id) VALUES($1,$2,$3,'user',$4)`, f.project.UUID, issue.Summary.ID.UUID, personID, f.member.UserID.UUID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.pool.Exec(ctx, `INSERT INTO issue_field_values(project_id,issue_id,field_id,value_kind,option_id) VALUES($1,$2,$3,'choice',$4)`, f.project.UUID, issue.Summary.ID.UUID, choiceID, optionID); err != nil {
		t.Fatal(err)
	}
	var memberName string
	if err := f.pool.QueryRow(ctx, "SELECT display_name FROM users WHERE id=$1", f.member.UserID.UUID).Scan(&memberName); err != nil {
		t.Fatal(err)
	}
	limit := 1
	first, err := f.service.GetCustomFields(ctx, f.viewer, CustomFieldsInput{IssueID: issue.Summary.ID, Page: command.PageRequest{Limit: &limit}})
	if err != nil || len(first.Definitions) != 1 || len(first.Values) != 1 || len(first.DisplayValues) != 1 || first.NextCursor == nil {
		t.Fatal("first bounded display page", first, err)
	}
	second, err := f.service.GetCustomFields(ctx, f.viewer, CustomFieldsInput{IssueID: issue.Summary.ID, Page: command.PageRequest{Limit: &limit, Cursor: first.NextCursor}})
	if err != nil || len(second.Definitions) != 1 || len(second.Values) != 1 || len(second.DisplayValues) != 1 || second.NextCursor != nil {
		t.Fatal("second bounded display page", second, err)
	}
	for _, page := range []CustomFieldsView{first, second} {
		value, display := page.Values[0], page.DisplayValues[0]
		if value.FieldID != page.Definitions[0].ID || display.FieldID != value.FieldID {
			t.Fatal("display escaped field page", page)
		}
		switch value.Value.Kind {
		case command.UserValue:
			if value.Value.UserID == nil || value.Value.UserID.UUID != f.member.UserID.UUID || display.ReferenceID != f.member.UserID.UUID || display.Label != memberName {
				t.Fatal("person display changed typed identity", page)
			}
		case command.ChoiceValue:
			if value.Value.OptionID == nil || value.Value.OptionID.UUID != optionID || display.ReferenceID != optionID || display.Label != "Historical outcome" || !display.Retired {
				t.Fatal("retired option display changed typed identity", page)
			}
		default:
			t.Fatal("unexpected fixture kind", value.Value.Kind)
		}
	}
	if _, err := f.pool.Exec(ctx, "UPDATE project_memberships SET removed_at=now() WHERE project_id=$1 AND user_id=$2", f.project.UUID, f.viewer.UserID.UUID); err != nil {
		t.Fatal(err)
	}
	denied, err := f.service.GetCustomFields(ctx, f.viewer, CustomFieldsInput{IssueID: issue.Summary.ID})
	var failure *command.Failure
	if !errors.As(err, &failure) || failure.Code != command.Unavailable || len(denied.DisplayValues) != 0 {
		t.Fatal("revoked reader received retained names", denied, err)
	}
}
