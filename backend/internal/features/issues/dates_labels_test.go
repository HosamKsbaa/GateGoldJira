package issues

import (
	"context"
	"gategoldjira/backend/internal/platform/command"
	"github.com/google/uuid"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestCalendarDatesInclusiveAllLabelsAndAtomicLimits(t *testing.T) {
	f := issueDatabase(t)
	ctx := context.Background()
	cairo, err := time.LoadLocation("Africa/Cairo")
	if err != nil {
		t.Fatal(err)
	}
	midnight := time.Date(2026, 10, 12, 0, 0, 0, 0, cairo)
	for _, value := range []string{"2026-02-29", "2026-13-01", "2026-1-01", "2026-10-12T00:00:00Z"} {
		if _, err := command.ParseDate(value); err == nil {
			t.Fatal("invalid calendar date accepted", value)
		}
	}
	if _, err := command.ParseDate("2028-02-29"); err != nil {
		t.Fatal(err)
	}
	labels := []command.LabelID{}
	for _, name := range []string{"أولوية", "Release"} {
		id := command.NewID[command.LabelKind]()
		labels = append(labels, id)
		if _, err := f.pool.Exec(ctx, "INSERT INTO labels(id,project_id,name,name_key,created_by) VALUES($1,$2,$3,$3,$4)", id.UUID, f.project.UUID, name, f.member.UserID.UUID); err != nil {
			t.Fatal(err)
		}
	}
	due, _ := command.ParseDate("2026-10-11")
	saved, err := f.service.Create(ctx, f.member, CreateInput{
		ProjectID: f.project,
		CreateIssueFields: CreateIssueFields{
			Title:    "dated عربي",
			DueDate:  &due,
			LabelIDs: labels,
		},
		RetryReference: uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	v := saved.Body.Result
	before := f.member
	before.Today = command.Today(midnight.Add(-time.Nanosecond), cairo)
	after := f.member
	after.Today = command.Today(midnight, cairo)
	old, err := f.service.Get(ctx, before, v.Summary.ID)
	if err != nil || old.Summary.Overdue {
		t.Fatal("due today became overdue", err)
	}
	current, err := f.service.Get(ctx, after, v.Summary.ID)
	if err != nil || !current.Summary.Overdue || current.Summary.DueDate.String() != due.String() {
		t.Fatal("calendar midnight/date shifted", err)
	}
	f.create(t, "undated")
	if _, err := f.service.Create(ctx, f.member, CreateInput{
		ProjectID: f.project,
		CreateIssueFields: CreateIssueFields{
			Title:    "only one label",
			DueDate:  &due,
			LabelIDs: labels[:1],
		},
		RetryReference: uuid.NewString(),
	}); err != nil {
		t.Fatal(err)
	}
	filter := command.IssueFilter{ProjectIDs: []command.ProjectID{f.project}, LabelIDs: labels, DueFrom: &due, DueTo: &due}
	matches, err := f.service.Search(ctx, after, SearchInput{Filters: filter})
	if err != nil || matches.TotalMatching != 1 {
		t.Fatal("inclusive ALL labels", err, matches.TotalMatching)
	}
	falseValue := false
	matches, err = f.service.Search(ctx, after, SearchInput{Filters: command.IssueFilter{
		ProjectIDs: []command.ProjectID{f.project},
		Overdue:    &falseValue,
	}})
	if err != nil || matches.TotalMatching != 1 {
		t.Fatal("undated excluded from not overdue", err)
	}
	later, _ := command.ParseDate("2026-10-12")
	filter.DueFrom = &later
	if _, err := f.service.Search(ctx, after, SearchInput{Filters: filter}); err == nil {
		t.Fatal("reversed range accepted")
	}
	edit := editable(v)
	edit.Title = "must rollback"
	for len(edit.LabelIDs) < 11 {
		edit.LabelIDs = append(edit.LabelIDs, command.NewID[command.LabelKind]())
	}
	if _, err := f.service.Update(ctx, f.member, UpdateInput{
		IssueID:          v.Summary.ID,
		ExpectedRevision: v.Summary.Revision,
		Editable:         edit,
		RetryReference:   uuid.NewString(),
	}); err == nil {
		t.Fatal("eleven labels accepted")
	}
	untouched, err := f.service.Get(ctx, f.member, v.Summary.ID)
	if err != nil || untouched.Summary.Title != v.Summary.Title || untouched.Summary.Revision != v.Summary.Revision {
		t.Fatal("partial excess-label update", err)
	}
	edit = editable(untouched)
	edit.DueDate = nil
	edit.LabelIDs = []command.LabelID{}
	out, err := f.service.Update(ctx, f.member, UpdateInput{
		IssueID:          v.Summary.ID,
		ExpectedRevision: untouched.Summary.Revision,
		Editable:         edit,
		RetryReference:   uuid.NewString(),
	})
	if err != nil || out.Body.Result.Summary.DueDate != nil || len(out.Body.Result.Summary.Labels) != 0 {
		t.Fatal("explicit clear failed", err)
	}
	for _, text := range []string{" ", strings.Repeat("ع", 41)} {
		if command.ValidateText(strings.TrimSpace(text), 1, 40) == nil {
			t.Fatal("invalid label text accepted")
		}
	}
}

func TestLabelCasefoldRaceLengthAndForeignIDsRollback(t *testing.T) {
	f := issueDatabase(t)
	ctx := context.Background()
	var wg sync.WaitGroup
	results := make(chan command.LabelID, 2)
	failures := make(chan error, 2)
	for _, name := range []string{"Straße", "STRASSE"} {
		wg.Add(1)
		go func(name string) {
			defer wg.Done()
			out, err := f.service.CreateLabel(ctx, f.member, CreateLabelInput{
				ProjectID:         f.project,
				CreateLabelFields: CreateLabelFields{Name: name},
				RetryReference:    uuid.NewString(),
			})
			if err != nil {
				failures <- err
			} else {
				results <- out.Body.Result.ID
			}
		}(name)
	}
	wg.Wait()
	close(results)
	close(failures)
	for err := range failures {
		t.Fatal(err)
	}
	var id command.LabelID
	for label := range results {
		if id.UUID != uuid.Nil && id != label {
			t.Fatal("casefold race created duplicate labels")
		}
		id = label
	}
	forty := strings.Repeat("ع", 40)
	if _, err := f.service.CreateLabel(ctx, f.member, CreateLabelInput{
		ProjectID:         f.project,
		CreateLabelFields: CreateLabelFields{Name: forty},
		RetryReference:    uuid.NewString(),
	}); err != nil {
		t.Fatal("40 Unicode characters rejected", err)
	}
	for _, name := range []string{" ", forty + "ع"} {
		if _, err := f.service.CreateLabel(ctx, f.member, CreateLabelInput{
			ProjectID:         f.project,
			CreateLabelFields: CreateLabelFields{Name: name},
			RetryReference:    uuid.NewString(),
		}); err == nil {
			t.Fatal("invalid label accepted")
		}
	}
	foreign := command.NewID[command.ProjectKind]()
	foreignLabel := command.NewID[command.LabelKind]()
	if _, err := f.pool.Exec(ctx, "INSERT INTO projects(id,key,name,created_by) VALUES($1,'OTHER','Other',$2)", foreign.UUID, f.owner.UserID.UUID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.pool.Exec(ctx, "INSERT INTO labels(id,project_id,name,name_key,created_by) VALUES($1,$2,'Other','other',$3)", foreignLabel.UUID, foreign.UUID, f.owner.UserID.UUID); err != nil {
		t.Fatal(err)
	}
	issue := f.create(t, "Untouched")
	edit := editable(issue)
	edit.Title = "partial"
	edit.LabelIDs = []command.LabelID{foreignLabel}
	if _, err := f.service.Update(ctx, f.member, UpdateInput{
		IssueID:          issue.Summary.ID,
		ExpectedRevision: issue.Summary.Revision,
		Editable:         edit,
		RetryReference:   uuid.NewString(),
	}); err == nil {
		t.Fatal("foreign project label accepted")
	}
	current, err := f.service.Get(ctx, f.member, issue.Summary.ID)
	if err != nil || current.Summary.Title != issue.Summary.Title || current.Summary.Revision != issue.Summary.Revision {
		t.Fatal("foreign-label validation partially updated issue", err)
	}
}

func TestDoneAndReopenedIssueUseCompanyCalendarOverdue(t *testing.T) {
	f := issueDatabase(t)
	ctx := context.Background()
	due, _ := command.ParseDate("2026-10-11")
	today, _ := command.ParseDate("2026-10-12")
	f.member.Today = today
	made, err := f.service.Create(ctx, f.member, CreateInput{
		ProjectID:         f.project,
		CreateIssueFields: CreateIssueFields{Title: "Overdue", DueDate: &due},
		RetryReference:    uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	id := made.Body.Result.Summary.ID
	if _, err := f.service.Move(ctx, f.member, f.moveInput(t, id, command.Done)); err != nil {
		t.Fatal(err)
	}
	done, err := f.service.Get(ctx, f.member, id)
	if err != nil || done.Summary.Overdue {
		t.Fatal("Done issue marked overdue", err)
	}
	if _, err := f.service.Move(ctx, f.member, f.moveInput(t, id, command.Review)); err != nil {
		t.Fatal(err)
	}
	reopened, err := f.service.Get(ctx, f.member, id)
	if err != nil || !reopened.Summary.Overdue || reopened.Summary.DueDate.String() != due.String() {
		t.Fatal("reopen lost deadline/overdue", err)
	}
}
