package configuration

import (
	"context"
	"fmt"
	"gategoldjira/backend/internal/features/issues"
	"gategoldjira/backend/internal/platform/command"
	"github.com/google/uuid"
	"strings"
	"testing"
)

func TestTypedFieldRequiredPreparationAndRetirement(t *testing.T) {
	f := configurationFixture(t)
	ctx := context.Background()
	is := issues.New(command.Runner{Pool: f.pool}, f.service.cursors)
	issue, err := is.Create(ctx, f.member, issues.CreateInput{
		ProjectID:         f.project,
		CreateIssueFields: issues.CreateIssueFields{Title: "Existing work"},
		RetryReference:    uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = f.pool.Exec(ctx, "UPDATE projects SET core_mode='modern' WHERE id=$1", f.project.UUID); err != nil {
		t.Fatal(err)
	}
	id := command.NewID[command.FieldKind]()
	input := SaveFieldInput{
		ProjectID: f.project,
		FieldID:   id,
		SaveFieldFields: SaveFieldFields{
			ExpectedRevision: f.view(t).Revision,
			Key:              "acceptance",
			Name:             "معيار القبول",
			Kind:             command.TextValue,
			Required:         true,
		},
		RetryReference: uuid.NewString(),
	}
	if _, err = f.service.SaveField(ctx, f.admin, input); err == nil {
		t.Fatal("required field stranded existing work")
	}
	input.Required = false
	input.RetryReference = uuid.NewString()
	prepared, err := f.service.SaveField(ctx, f.admin, input)
	if err != nil {
		t.Fatal(err)
	}
	value := "Verified"
	patched, err := is.SaveCustomFields(ctx, f.member, issues.SaveCustomFieldsInput{
		IssueID:          issue.Body.Result.Summary.ID,
		ExpectedRevision: issue.Body.Result.Summary.Revision,
		Values: []command.FieldAssignment{{
			FieldID: id,
			Value:   &command.FieldValue{Kind: command.TextValue, Text: &value},
		}},
		RetryReference: uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	if patched.Body.Result.Revision != issue.Body.Result.Summary.Revision+1 {
		t.Fatal("custom value did not update content")
	}
	input.ExpectedRevision = prepared.Body.Result.Configuration.Revision
	input.Required = true
	input.RetryReference = uuid.NewString()
	enabled, err := f.service.SaveField(ctx, f.admin, input)
	if err != nil {
		t.Fatal(err)
	}
	_, err = is.SaveCustomFields(ctx, f.member, issues.SaveCustomFieldsInput{
		IssueID:          issue.Body.Result.Summary.ID,
		ExpectedRevision: patched.Body.Result.Revision,
		Values:           []command.FieldAssignment{{FieldID: id}},
		RetryReference:   uuid.NewString(),
	})
	if err == nil {
		t.Fatal("required value cleared")
	}
	input.ExpectedRevision = enabled.Body.Result.Configuration.Revision
	input.Retired = true
	input.RetryReference = uuid.NewString()
	if _, err = f.service.SaveField(ctx, f.admin, input); err == nil {
		t.Fatal("required field retired without deactivation")
	}
	input.Required = false
	input.RetryReference = uuid.NewString()
	retired, err := f.service.SaveField(ctx, f.admin, input)
	if err != nil {
		t.Fatal(err)
	}
	if !retired.Body.Result.Field.Retired {
		t.Fatal("retirement lost")
	}
	historical, err := is.GetCustomFields(ctx, f.member, issues.CustomFieldsInput{IssueID: issue.Body.Result.Summary.ID})
	if err != nil || len(historical.Values) != 1 || historical.Values[0].Value == nil || *historical.Values[0].Value.Text != value {
		t.Fatal("retirement discarded stored values", err)
	}
}
func TestFieldChoiceScopeAndImmutableUsedKind(t *testing.T) {
	f := configurationFixture(t)
	ctx := context.Background()
	id := command.NewID[command.FieldKind]()
	input := SaveFieldInput{
		ProjectID: f.project,
		FieldID:   id,
		SaveFieldFields: SaveFieldFields{
			ExpectedRevision: f.view(t).Revision,
			Key:              "team",
			Name:             "Team",
			Kind:             command.ChoiceValue,
		},
		RetryReference: uuid.NewString(),
	}
	field, err := f.service.SaveField(ctx, f.admin, input)
	if err != nil {
		t.Fatal(err)
	}
	option, err := f.service.SaveFieldOption(ctx, f.admin, SaveFieldOptionInput{
		ProjectID: f.project,
		FieldID:   id,
		OptionID:  command.NewID[command.FieldOptionKind](),
		SaveFieldOptionFields: SaveFieldOptionFields{
			ExpectedRevision: field.Body.Result.Configuration.Revision,
			Name:             "Frontend",
			Position:         9007199254740993,
		},
		RetryReference: uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	input.ExpectedRevision = option.Body.Result.Configuration.Revision
	input.Kind = command.NumberValue
	input.RetryReference = uuid.NewString()
	if _, err = f.service.SaveField(ctx, f.admin, input); err == nil {
		t.Fatal("choice field with existing options changed kind")
	}
	// CHECK predicates must reject a wrong slot and NULL kind; composite FKs
	// reject referencing a choice from another field rather than silently coercing.
	var issue uuid.UUID
	if err = f.pool.QueryRow(ctx, "INSERT INTO issues(id,project_id,number,title,reporter_id,rank) VALUES(gen_random_uuid(),$1,100,'Constraint issue',$2,1024) RETURNING id", f.project.UUID, f.admin.UserID.UUID).Scan(&issue); err != nil {
		t.Fatal(err)
	}
	if _, err = f.pool.Exec(ctx, "INSERT INTO issue_field_values(project_id,issue_id,field_id,value_kind,text_value) VALUES($1,$2,$3,'choice','wrong')", f.project.UUID, issue, id.UUID); err == nil {
		t.Fatal("wrong typed slot accepted")
	}
}

func TestFieldDefaultsBackfillPreciselyAndRequiredRulesBlockRetirement(t *testing.T) {
	f := configurationFixture(t)
	ctx := context.Background()
	is := issues.New(command.Runner{Pool: f.pool}, f.service.cursors)
	f.service.WithFieldBackfiller(is.BackfillFieldDefault)
	old, err := is.Create(ctx, f.member, issues.CreateInput{
		ProjectID:         f.project,
		CreateIssueFields: issues.CreateIssueFields{Title: "Existing"},
		RetryReference:    uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = f.pool.Exec(ctx, "UPDATE projects SET core_mode='modern' WHERE id=$1", f.project.UUID); err != nil {
		t.Fatal(err)
	}
	amount, err := command.ParseDecimal("9007199254740993.1234567890")
	if err != nil {
		t.Fatal(err)
	}
	input := SaveFieldInput{
		ProjectID: f.project,
		FieldID:   command.NewID[command.FieldKind](),
		SaveFieldFields: SaveFieldFields{
			ExpectedRevision: f.view(t).Revision,
			Key:              "estimate",
			Name:             "Estimate",
			Kind:             command.NumberValue,
			DefaultValue:     &command.FieldValue{Kind: command.NumberValue, Number: &amount},
		},
		RetryReference: uuid.NewString(),
	}
	field, err := f.service.SaveField(ctx, f.admin, input)
	if err != nil {
		t.Fatal(err)
	}
	batch := BackfillFieldInput{
		ProjectID: f.project,
		FieldID:   input.FieldID,
		BackfillFieldFields: BackfillFieldFields{
			ExpectedRevision: field.Body.Result.Configuration.Revision,
			Limit:            1,
		},
		RetryReference: uuid.NewString(),
	}
	filled, err := f.service.BackfillField(ctx, f.admin, batch)
	if err != nil || filled.Body.Result.Changed != 1 || filled.Body.Result.Remaining != 0 {
		t.Fatal("default backfill", err)
	}
	replay, err := f.service.BackfillField(ctx, f.admin, batch)
	if err != nil || !replay.Body.Receipt.Replayed {
		t.Fatal("backfill replay", err)
	}
	input.ExpectedRevision = field.Body.Result.Configuration.Revision
	input.Required = true
	input.RetryReference = uuid.NewString()
	enabled, err := f.service.SaveField(ctx, f.admin, input)
	if err != nil {
		t.Fatal(err)
	}
	created, err := is.CreateModern(ctx, f.member, issues.ModernCreateInput{
		ProjectID:          f.project,
		ModernCreateFields: issues.ModernCreateFields{Title: "Uses exact default"},
		RetryReference:     uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	for _, id := range []command.IssueID{old.Body.Result.Summary.ID, created.Body.Result.Summary.ID} {
		view, err := is.GetCustomFields(ctx, f.member, issues.CustomFieldsInput{IssueID: id})
		if err != nil || len(view.Values) != 1 || view.Values[0].Value == nil || view.Values[0].Value.Number == nil || *view.Values[0].Value.Number != amount {
			t.Fatal("decimal default changed", err)
		}
	}
	if created.Body.Result.Summary.Revision != 1 {
		t.Fatal("initial defaults invented content edits")
	}
	var edge, flow uuid.UUID
	if err = f.pool.QueryRow(ctx, "SELECT id,workflow_id FROM workflow_transitions WHERE project_id=$1 LIMIT 1", f.project.UUID).Scan(&edge, &flow); err != nil {
		t.Fatal(err)
	}
	_, err = f.service.SaveTransitionPolicy(ctx, f.admin, SaveTransitionPolicyInput{
		ProjectID:    f.project,
		WorkflowID:   command.WorkflowID{UUID: flow},
		TransitionID: command.TransitionID{UUID: edge},
		TransitionPolicyFields: TransitionPolicyFields{
			ExpectedRevision: enabled.Body.Result.Configuration.Revision,
			Policy:           TransitionPolicy{RequiredFieldIDs: []command.FieldID{input.FieldID}},
		},
		RetryReference: uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	input.ExpectedRevision = f.view(t).Revision
	input.Required = false
	input.Retired = true
	input.RetryReference = uuid.NewString()
	if _, err = f.service.SaveField(ctx, f.admin, input); err == nil {
		t.Fatal("field retired while an active move requires it")
	}
}

func TestFieldStorageChecksRejectLossyNumbersWrongSlotsAndForeignChoices(t *testing.T) {
	f := configurationFixture(t)
	ctx := context.Background()
	var issue uuid.UUID
	if err := f.pool.QueryRow(ctx, "INSERT INTO issues(id,project_id,number,title,reporter_id,rank) VALUES(gen_random_uuid(),$1,100,'Checked slots',$2,1024) RETURNING id", f.project.UUID, f.admin.UserID.UUID).Scan(&issue); err != nil {
		t.Fatal(err)
	}
	number, text, choice, other := uuid.New(), uuid.New(), uuid.New(), uuid.New()
	for _, v := range []struct {
		id   uuid.UUID
		kind string
	}{{number, "number"}, {text, "text"}, {choice, "choice"}, {other, "choice"}} {
		if _, err := f.pool.Exec(ctx, "INSERT INTO field_definitions(id,project_id,key,name,value_kind) VALUES($1,$2,$3,'Checked',$4)", v.id, f.project.UUID, "f_"+strings.ReplaceAll(v.id.String(), "-", "")[:25], v.kind); err != nil {
			t.Fatal(err)
		}
	}
	option := uuid.New()
	if _, err := f.pool.Exec(ctx, "INSERT INTO field_options(id,project_id,field_id,name,position) VALUES($1,$2,$3,'Foreign option',1)", option, f.project.UUID, other); err != nil {
		t.Fatal(err)
	}
	for _, value := range []string{"NaN", "Infinity", "-Infinity", "1.00000000001", "10000000000000000000000000000"} {
		if _, err := f.pool.Exec(ctx, "INSERT INTO issue_field_values(project_id,issue_id,field_id,value_kind,number_value) VALUES($1,$2,$3,'number',$4::numeric)", f.project.UUID, issue, number, value); err == nil {
			t.Fatal("lossy numeric accepted", value)
		}
	}
	cases := []struct {
		field uuid.UUID
		kind  string
		sql   string
		arg   any
	}{{number, "number", "text_value", "1"}, {text, "text", "number_value", 1}, {choice, "choice", "option_id", option}}
	for _, v := range cases {
		if _, err := f.pool.Exec(ctx, "INSERT INTO issue_field_values(project_id,issue_id,field_id,value_kind,"+v.sql+") VALUES($1,$2,$3,$4,$5)", f.project.UUID, issue, v.field, v.kind, v.arg); err == nil {
			t.Fatal("wrong slot or foreign choice accepted")
		}
	}
	if _, err := f.pool.Exec(ctx, "INSERT INTO issue_field_values(project_id,issue_id,field_id,value_kind,text_value,number_value) VALUES($1,$2,$3,'text','mixed',1)", f.project.UUID, issue, text); err == nil {
		t.Fatal("mixed slots accepted")
	}
	if _, err := f.pool.Exec(ctx, "INSERT INTO issue_field_values(project_id,issue_id,field_id,value_kind) VALUES($1,$2,$3,'text')", f.project.UUID, issue, text); err == nil {
		t.Fatal("empty slots accepted")
	}
}

func TestOptionCursorCannotContinueAcrossConfigurationReordering(t *testing.T) {
	f := configurationFixture(t)
	ctx := context.Background()
	id := command.NewID[command.FieldKind]()
	field, err := f.service.SaveField(ctx, f.admin, SaveFieldInput{
		ProjectID: f.project,
		FieldID:   id,
		SaveFieldFields: SaveFieldFields{
			ExpectedRevision: f.view(t).Revision,
			Key:              "pick",
			Name:             "Pick",
			Kind:             command.ChoiceValue,
		},
		RetryReference: uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	revision := field.Body.Result.Configuration.Revision
	options := []command.FieldOptionID{}
	for i := range 2 {
		option := command.NewID[command.FieldOptionKind]()
		options = append(options, option)
		saved, e := f.service.SaveFieldOption(ctx, f.admin, SaveFieldOptionInput{
			ProjectID: f.project,
			FieldID:   id,
			OptionID:  option,
			SaveFieldOptionFields: SaveFieldOptionFields{
				ExpectedRevision: revision,
				Name:             fmt.Sprintf("Option %d", i),
				Position:         command.Position(i + 1),
			},
			RetryReference: uuid.NewString(),
		})
		if e != nil {
			t.Fatal(e)
		}
		revision = saved.Body.Result.Configuration.Revision
	}
	limit := 1
	in := FieldOptionsInput{ProjectID: f.project, FieldID: id, Page: command.PageRequest{Limit: &limit}}
	page, err := f.service.FieldOptions(ctx, f.member, in)
	if err != nil || page.NextCursor == nil {
		t.Fatal("initial option page", err)
	}
	if _, err = f.service.SaveFieldOption(ctx, f.admin, SaveFieldOptionInput{
		ProjectID: f.project,
		FieldID:   id,
		OptionID:  options[0],
		SaveFieldOptionFields: SaveFieldOptionFields{
			ExpectedRevision: revision,
			Name:             "Reordered",
			Position:         3,
		},
		RetryReference: uuid.NewString(),
	}); err != nil {
		t.Fatal(err)
	}
	in.Page.Cursor = page.NextCursor
	if _, err = f.service.FieldOptions(ctx, f.member, in); err == nil {
		t.Fatal("stale reordered cursor accepted")
	}
}

func TestFieldKindPublishingRacesValueWriteWithoutInvalidStorage(t *testing.T) {
	f := configurationFixture(t)
	ctx := context.Background()
	is := issues.New(command.Runner{Pool: f.pool}, f.service.cursors)
	created, err := is.Create(ctx, f.member, issues.CreateInput{
		ProjectID:         f.project,
		CreateIssueFields: issues.CreateIssueFields{Title: "Kind race"},
		RetryReference:    uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = f.pool.Exec(ctx, "UPDATE projects SET core_mode='modern' WHERE id=$1", f.project.UUID); err != nil {
		t.Fatal(err)
	}
	in := SaveFieldInput{
		ProjectID: f.project,
		FieldID:   command.NewID[command.FieldKind](),
		SaveFieldFields: SaveFieldFields{
			ExpectedRevision: f.view(t).Revision,
			Key:              "precise",
			Name:             "Precise",
			Kind:             command.NumberValue,
		},
		RetryReference: uuid.NewString(),
	}
	field, err := f.service.SaveField(ctx, f.admin, in)
	if err != nil {
		t.Fatal(err)
	}
	in.ExpectedRevision = field.Body.Result.Configuration.Revision
	in.Kind = command.TextValue
	in.RetryReference = uuid.NewString()
	start := make(chan struct{})
	results := make(chan error, 2)
	number := command.Decimal("9007199254740993.1")
	go func() { <-start; _, e := f.service.SaveField(ctx, f.admin, in); results <- e }()
	go func() {
		<-start
		_, e := is.SaveCustomFields(ctx, f.member, issues.SaveCustomFieldsInput{
			IssueID:          created.Body.Result.Summary.ID,
			ExpectedRevision: created.Body.Result.Summary.Revision,
			Values: []command.FieldAssignment{{
				FieldID: in.FieldID,
				Value:   &command.FieldValue{Kind: command.NumberValue, Number: &number},
			}},
			RetryReference: uuid.NewString(),
		})
		results <- e
	}()
	close(start)
	successes := 0
	for range 2 {
		if e := <-results; e == nil {
			successes++
		}
	}
	if successes != 1 {
		t.Fatal("expected one consistent publisher", successes)
	}
	var invalid int
	if err = f.pool.QueryRow(ctx, "SELECT count(*) FROM issue_field_values v JOIN field_definitions f ON f.id=v.field_id WHERE v.value_kind<>f.value_kind").Scan(&invalid); err != nil || invalid != 0 {
		t.Fatal("mixed kind storage", invalid, err)
	}
}
