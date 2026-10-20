package issues

import (
	"context"
	"gategoldjira/backend/internal/features/activity"
	"gategoldjira/backend/internal/platform/command"
	"github.com/google/uuid"
	"strings"
	"testing"
)

func TestOrganizationWatchLinksAndSavedSearchPrivacy(t *testing.T) {
	f := issueDatabase(t)
	ctx := context.Background()
	work := f.create(t, "Work")
	other := f.create(t, "Related")
	yes := true
	input := OrganizeInput{
		IssueID: work.Summary.ID,
		OrganizeFields: OrganizeFields{
			ExpectedRevision: work.Summary.Revision,
			Backlog:          &yes,
		},
		RetryReference: uuid.NewString(),
	}
	if _, err := f.service.Organize(ctx, f.viewer, input); err == nil {
		t.Fatal("viewer organized work")
	}
	saved, err := f.service.Organize(ctx, f.member, input)
	if err != nil || !saved.Body.Result.Summary.Backlog {
		t.Fatal("backlog not saved", err)
	}
	input.ExpectedRevision = saved.Body.Result.Summary.Revision
	input.Archived = &yes
	input.RetryReference = uuid.NewString()
	saved, err = f.service.Organize(ctx, f.member, input)
	if err != nil || !saved.Body.Result.Summary.Archived {
		t.Fatal("archive not saved", err)
	}
	page, err := f.service.Search(ctx, f.member, SearchInput{})
	if err != nil || page.TotalMatching != 1 {
		t.Fatal("archived work leaked into active search", err)
	}
	page, err = f.service.Search(ctx, f.member, SearchInput{Filters: command.IssueFilter{Archived: &yes}})
	if err != nil || page.TotalMatching != 1 {
		t.Fatal("archive cannot be found", err)
	}
	watch, err := f.service.SetWatch(ctx, f.viewer, WatchInput{
		IssueID:        work.Summary.ID,
		Watching:       true,
		RetryReference: uuid.NewString(),
	})
	if err != nil || !watch.Body.Result.Watching {
		t.Fatal("reader cannot watch", err)
	}
	linked, err := f.service.SetLink(ctx, f.member, LinkInput{
		IssueID: work.Summary.ID,
		LinkFields: LinkFields{
			ExpectedRevision: saved.Body.Result.Summary.Revision,
			TargetID:         other.Summary.ID,
			Kind:             "relates_to",
			Enabled:          true,
		},
		RetryReference: uuid.NewString(),
	})
	if err != nil || len(linked.Body.Result.Links) != 1 {
		t.Fatal("relation not saved", err)
	}
	sid := command.NewID[SearchKind]()
	search, err := f.service.SaveSearch(ctx, f.member, SaveSearchInput{
		SearchID:       sid,
		Name:           "My backlog",
		Filters:        command.IssueFilter{Backlog: &yes},
		RetryReference: uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	mine, err := f.service.SavedSearches(ctx, f.member)
	if err != nil || len(mine.Items) != 1 {
		t.Fatal("saved search missing", err)
	}
	theirs, err := f.service.SavedSearches(ctx, f.viewer)
	if err != nil || len(theirs.Items) != 0 {
		t.Fatal("saved search leaked", err)
	}
	_, err = f.service.SaveSearch(ctx, f.viewer, SaveSearchInput{
		SearchID:         sid,
		ExpectedRevision: command.InitialRevision(search.Body.Result.Revision),
		Name:             "Other user's search",
		Filters:          command.IssueFilter{},
		RetryReference:   uuid.NewString(),
	})
	if err == nil {
		t.Fatal("another user edited saved search")
	}
}

func TestReadersSeeOnlyIssueHistoryAndWatchersLoseRevokedDelivery(t *testing.T) {
	f := issueDatabase(t)
	ctx := context.Background()
	work := f.create(t, "Watched work")
	if _, err := f.service.SetWatch(ctx, f.viewer, WatchInput{
		IssueID:        work.Summary.ID,
		Watching:       true,
		RetryReference: uuid.NewString(),
	}); err != nil {
		t.Fatal(err)
	}
	update := editable(work)
	update.Title = "Watched change"
	saved, err := f.service.Update(ctx, f.member, UpdateInput{
		IssueID:          work.Summary.ID,
		ExpectedRevision: work.Summary.Revision,
		Editable:         update,
		RetryReference:   uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	var notices int
	if err := f.pool.QueryRow(ctx, "SELECT count(*) FROM notifications WHERE issue_id=$1 AND recipient_id=$2 AND 'watching'=ANY(reasons)", work.Summary.ID.UUID, f.viewer.UserID.UUID).Scan(&notices); err != nil || notices != 1 {
		t.Fatal("watch notification missing", notices, err)
	}
	signer, _ := command.NewCursorSigner([]byte(strings.Repeat("h", 32)))
	history := activity.New(command.Runner{Pool: f.pool}, signer)
	kind := activity.IssueResource
	id := activity.ResourceID{UUID: work.Summary.ID.UUID}
	page, err := history.List(ctx, f.viewer, activity.ListInput{ResourceKind: &kind, ResourceID: &id})
	if err != nil || page.TotalMatching < 2 {
		t.Fatal("reader cannot see issue history", err)
	}
	for _, event := range page.Items {
		if event.ResourceKind == activity.NotificationResource || event.Action == string(command.SetIssueWatch) {
			t.Fatal("private subscription leaked")
		}
	}
	if _, err := history.List(ctx, f.viewer, activity.ListInput{}); err == nil {
		t.Fatal("reader accessed global history")
	}
	if _, err := f.pool.Exec(ctx, "UPDATE project_memberships SET removed_at=now() WHERE project_id=$1 AND user_id=$2", f.project.UUID, f.viewer.UserID.UUID); err != nil {
		t.Fatal(err)
	}
	if _, err := history.List(ctx, f.viewer, activity.ListInput{ResourceKind: &kind, ResourceID: &id}); err == nil {
		t.Fatal("revoked reader accessed history")
	}
	update.Title = "After revocation"
	if _, err := f.service.Update(ctx, f.member, UpdateInput{
		IssueID:          work.Summary.ID,
		ExpectedRevision: saved.Body.Result.Summary.Revision,
		Editable:         update,
		RetryReference:   uuid.NewString(),
	}); err != nil {
		t.Fatal(err)
	}
	if err := f.pool.QueryRow(ctx, "SELECT count(*) FROM notifications WHERE issue_id=$1 AND recipient_id=$2", work.Summary.ID.UUID, f.viewer.UserID.UUID).Scan(&notices); err != nil || notices != 1 {
		t.Fatal("revoked watcher received new event", notices, err)
	}
}

func TestSearchSortsHaveStableCursorsAndArchiveIsolation(t *testing.T) {
	f := issueDatabase(t)
	ctx := context.Background()
	a := f.create(t, "A")
	b := f.create(t, "B")
	c := f.create(t, "C")
	for i, item := range []IssueView{a, b, c} {
		if _, err := f.pool.Exec(ctx, "UPDATE issues SET priority=$2,created_at=$3::timestamptz,updated_at=$3::timestamptz,due_date=$4::date WHERE id=$1", item.Summary.ID.UUID, []string{"low", "high", "medium"}[i], []string{"2026-01-01", "2026-01-02", "2026-01-03"}[i], []*string{
			nil,
			ptrText("2026-05-03"),
			ptrText("2026-05-01"),
		}[i]); err != nil {
			t.Fatal(err)
		}
	}
	for _, scenario := range []struct {
		sort command.IssueSort
		want []command.IssueID
	}{
		{
			"updated",
			[]command.IssueID{c.Summary.ID, b.Summary.ID, a.Summary.ID},
		},
		{
			"created",
			[]command.IssueID{c.Summary.ID, b.Summary.ID, a.Summary.ID},
		},
		{
			"due",
			[]command.IssueID{c.Summary.ID, b.Summary.ID, a.Summary.ID},
		},
		{
			"priority",
			[]command.IssueID{b.Summary.ID, c.Summary.ID, a.Summary.ID},
		},
	} {
		limit := 1
		input := SearchInput{Filters: command.IssueFilter{Sort: scenario.sort}, Page: command.PageRequest{Limit: &limit}}
		for index, want := range scenario.want {
			page, err := f.service.Search(ctx, f.viewer, input)
			if err != nil || len(page.Items) != 1 || page.Items[0].ID != want {
				t.Fatalf("sort %s page %d: %+v %v", scenario.sort, index, page, err)
			}
			input.Page.Cursor = page.NextCursor
			if index < 2 && page.NextCursor == nil {
				t.Fatal("missing cursor")
			}
		}
		if input.Page.Cursor != nil {
			t.Fatal("extra cursor")
		}
	}
}
func ptrText(value string) *string { return &value }
