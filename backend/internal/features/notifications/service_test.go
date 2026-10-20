package notifications

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"
	"testing"
	"time"

	"gategoldjira/backend/db/migrations"
	"gategoldjira/backend/internal/features/activity"
	"gategoldjira/backend/internal/features/identity"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/tests/testenv"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type inboxFixture struct {
	pool                  *pgxpool.Pool
	service               *Service
	project               command.ProjectID
	issue                 command.IssueID
	owner, member, viewer command.Actor
}

func inboxDatabase(t *testing.T) inboxFixture {
	t.Helper()
	ctx := context.Background()
	pool := testenv.Database(t)
	if err := migrations.Apply(ctx, pool); err != nil {
		t.Fatal(err)
	}
	signer, _ := command.NewCursorSigner([]byte(strings.Repeat("n", 32)))
	f := inboxFixture{
		pool:    pool,
		service: New(command.Runner{Pool: pool}, signer),
		project: command.NewID[command.ProjectKind](),
		issue:   command.NewID[command.IssueKind](),
	}
	for i, a := range []*command.Actor{&f.owner, &f.member, &f.viewer} {
		*a = command.Actor{
			UserID:  command.NewID[command.UserKind](),
			Channel: command.REST,
			Today:   command.Today(time.Now(), time.UTC),
		}
		if _, err := pool.Exec(ctx, "INSERT INTO users(id,email,email_key,display_name,approved_at,is_administrator) VALUES($1,$2,$2,$3,now(),$4)", a.UserID.UUID, a.UserID.String()+"@example.test", []string{"Owner", "عضو", "مشاهد"}[i], i == 0); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := pool.Exec(ctx, "INSERT INTO projects(id,key,name,created_by) VALUES($1,'INBOX','Inbox',$2)", f.project.UUID, f.owner.UserID.UUID); err != nil {
		t.Fatal(err)
	}
	for i, a := range []command.Actor{f.member, f.viewer} {
		if _, err := pool.Exec(ctx, "INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,$3)", f.project.UUID, a.UserID.UUID, []string{"member", "viewer"}[i]); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := pool.Exec(ctx, "INSERT INTO issues(id,project_id,number,title,reporter_id,assignee_id,rank) VALUES($1,$2,1,'Issue',$3,$3,1024)", f.issue.UUID, f.project.UUID, f.member.UserID.UUID); err != nil {
		t.Fatal(err)
	}
	return f
}
func (f inboxFixture) produce(t *testing.T, effects ...Effect) {
	t.Helper()
	ctx := context.Background()
	request := command.MutationRequest{
		Actor:          f.owner,
		Operation:      command.UpdateIssue,
		RetryReference: uuid.NewString(),
		Access:         command.Access{Projects: []command.ProjectScope{{ProjectID: f.project, Write: true}}},
	}
	_, err := command.Save(ctx, command.Runner{Pool: f.pool}, request, struct{}{}, func(context.Context, *command.Mutation) error { return nil }, func(ctx context.Context, m *command.Mutation, _ struct{}) (command.Change[command.EventID], error) {
		before, after := "before", uuid.NewString()
		event, err := activity.Append(ctx, m, activity.Draft{
			Action:       command.UpdateIssue,
			ResourceKind: activity.IssueResource,
			ResourceID:   f.issue.UUID,
			ProjectID:    &f.project,
			IssueID:      &f.issue,
			Changes: []activity.FieldChange{{
				Field:  "title",
				Before: &before,
				After:  &after,
			}},
		})
		if err != nil {
			return command.Change[command.EventID]{}, err
		}
		facts := []Fact{}
		for _, effect := range effects {
			facts = append(facts, Fact{
				ProjectID:  f.project,
				IssueID:    f.issue,
				ReporterID: f.member.UserID,
				AssigneeID: &f.member.UserID,
				MentionUserIDs: []command.UserID{
					f.member.UserID,
					f.viewer.UserID,
					f.owner.UserID,
				},
				Effect:  effect,
				Summary: "تحديث العمل GG-1",
			})
		}
		err = Write(ctx, m, event.ID, facts)
		id := event.ID.String()
		return command.Change[command.EventID]{Result: event.ID, EventID: &id, HTTPStatus: 200}, err
	}, func(id command.EventID) error {
		if id.UUID == uuid.Nil {
			return errors.New("missing event")
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}
func TestInboxOwnOnlyPureReadsRevisionsRetriesAndRevokedCounts(t *testing.T) {
	f := inboxDatabase(t)
	ctx := context.Background()
	f.produce(t, NewComment)
	page, err := f.service.List(ctx, f.member, ListInput{})
	if err != nil || len(page.Items) != 1 || page.TotalMatching != 1 || len(page.Items[0].Reasons) != 2 {
		t.Fatal("deduplicated personal inbox", err)
	}
	n := page.Items[0]
	// Administrator access never overrides a notification's recipient.
	for _, id := range []command.NotificationID{n.ID, command.NewID[command.NotificationKind]()} {
		if _, err := f.service.Get(ctx, f.owner, id); err == nil {
			t.Fatal("Admin read another inbox")
		}
	}
	if _, err := f.service.Get(ctx, f.member, n.ID); err != nil {
		t.Fatal(err)
	}
	summary, err := f.service.Summary(ctx, f.member)
	if err != nil || summary.UnreadCount != 1 {
		t.Fatal("GET changed read state", err)
	}
	in := SetReadInput{
		NotificationID: n.ID,
		SetReadFields:  SetReadFields{ExpectedRevision: n.Revision, Read: true},
		RetryReference: uuid.NewString(),
	}
	saved, err := f.service.SetRead(ctx, f.member, in)
	if err != nil || saved.Body.Result.ReadAt == nil || saved.Body.Result.Revision != n.Revision+1 {
		t.Fatal("read state", err)
	}
	actor := f.member
	actor.Channel = command.MCP
	replay, err := f.service.SetRead(ctx, actor, in)
	if err != nil || !replay.Body.Receipt.Replayed || *replay.Body.Receipt.EventID != *saved.Body.Receipt.EventID {
		t.Fatal("read retry", err)
	}
	in.RetryReference = uuid.NewString()
	if _, err := f.service.SetRead(ctx, f.member, in); err == nil {
		t.Fatal("stale inbox revision accepted")
	}
	in.ExpectedRevision = saved.Body.Result.Revision
	noop, err := f.service.SetRead(ctx, f.member, in)
	if err != nil || noop.Body.Receipt.EventID != nil || noop.Body.Result.Revision != in.ExpectedRevision {
		t.Fatal("read no-op created activity", err)
	}
	var count int
	if err := f.pool.QueryRow(ctx, "SELECT count(*) FROM notifications").Scan(&count); err != nil || count != 2 {
		t.Fatal("read state generated notifications", err, count)
	}
	if _, err := f.pool.Exec(ctx, "UPDATE project_memberships SET removed_at=now() WHERE project_id=$1 AND user_id=$2", f.project.UUID, f.member.UserID.UUID); err != nil {
		t.Fatal(err)
	}
	summary, err = f.service.Summary(ctx, f.member)
	if err != nil || summary.UnreadCount != 0 {
		t.Fatal("hidden unread count", err)
	}
	page, err = f.service.List(ctx, f.member, ListInput{})
	if err != nil || len(page.Items) != 0 || page.TotalMatching != 0 {
		t.Fatal("hidden list/count", err)
	}
	if _, err := f.service.SetRead(ctx, f.member, in); err == nil {
		t.Fatal("revoked replay exposed notification")
	}
}
func TestProducerTrialsAndMarkAllKeepViewerPrivateStateAndCurrentSnapshot(t *testing.T) {
	f := inboxDatabase(t)
	ctx := context.Background()
	latencies := make([]time.Duration, 0, 100)
	for trial := 0; trial < 100; trial++ {
		f.produce(t, NewComment, ChangedStatus, ChangedDueDate, NewSubtask, LastSubtaskCompleted, BecameBlocked, LastBlockerCompleted, NewAssignment, EditedComment)
		committed := time.Now()
		next, err := f.service.List(ctx, f.member, ListInput{UnreadOnly: true})
		latency := time.Since(committed)
		if err != nil || next.TotalMatching != int32(trial+1) {
			t.Fatal("notification unavailable on next read", err)
		}
		latencies = append(latencies, latency)
	}
	sort.Slice(latencies, func(i, j int) bool { return latencies[i] < latencies[j] })
	t.Logf("LOCAL producer-to-next-read: trials=100 p95=%s max=%s (not Cloud acceptance)", latencies[94], latencies[99])
	if latencies[94] > 5*time.Second {
		t.Fatal("local next-read availability exceeded five seconds")
	}
	summary, err := f.service.Summary(ctx, f.member)
	if err != nil || summary.UnreadCount != 100 {
		t.Fatal("producer trial count", err)
	}
	limit := 25
	seen := map[command.NotificationID]bool{}
	var cursor *string
	for {
		page, err := f.service.List(ctx, f.member, ListInput{
			UnreadOnly: true,
			Page:       command.PageRequest{Limit: &limit, Cursor: cursor},
		})
		if err != nil {
			t.Fatal(err)
		}
		if len(page.Items) > 25 || page.TotalMatching != 100 {
			t.Fatal("unbounded inbox/count")
		}
		for _, n := range page.Items {
			if seen[n.ID] || len(n.Reasons) != 9 {
				t.Fatal("duplicate notification or incomplete union", fmt.Sprint(n.Reasons))
			}
			seen[n.ID] = true
		}
		cursor = page.NextCursor
		if cursor == nil {
			break
		}
	}
	if len(seen) != 100 {
		t.Fatal("incomplete traversal")
	}
	ref := uuid.NewString()
	all, err := f.service.MarkAll(ctx, f.viewer, MarkAllInput{RetryReference: ref})
	if err != nil || all.Body.Result.ChangedCount != 100 || all.Body.Result.Inbox.UnreadCount != 0 {
		t.Fatal("Viewer personal mark-all", err)
	}
	replay, err := f.service.MarkAll(ctx, f.viewer, MarkAllInput{RetryReference: ref})
	if err != nil || !replay.Body.Receipt.Replayed {
		t.Fatal("mark-all retry", err)
	}
	summary, err = f.service.Summary(ctx, f.member)
	if err != nil || summary.UnreadCount != 100 {
		t.Fatal("mark-all changed another recipient", err)
	}
	all, err = f.service.MarkAll(ctx, f.member, MarkAllInput{RetryReference: uuid.NewString()})
	if err != nil || all.Body.Result.ChangedCount != 100 {
		t.Fatal(err)
	}
	noop, err := f.service.MarkAll(ctx, f.member, MarkAllInput{RetryReference: uuid.NewString()})
	if err != nil || noop.Body.Result.ChangedCount != 0 || noop.Body.Receipt.EventID != nil {
		t.Fatal("mark-all no-op", err)
	}
}

func TestMarkAllSkipsRevokedProjectsAndSerializesWithMembershipRemoval(t *testing.T) {
	f := inboxDatabase(t)
	ctx := context.Background()
	f.produce(t, NewComment)
	hidden := f
	hidden.project = command.NewID[command.ProjectKind]()
	hidden.issue = command.NewID[command.IssueKind]()
	if _, err := f.pool.Exec(ctx, "INSERT INTO projects(id,key,name,created_by) VALUES($1,'HIDDEN','Hidden',$2)", hidden.project.UUID, f.owner.UserID.UUID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.pool.Exec(ctx, "INSERT INTO issues(id,project_id,number,title,reporter_id,rank) VALUES($1,$2,1,'Hidden issue',$3,1024)", hidden.issue.UUID, hidden.project.UUID, f.member.UserID.UUID); err != nil {
		t.Fatal(err)
	}
	// A retained notification can exist after removal; its contents and read state
	// must be excluded from the caller's accessible snapshot.
	if _, err := f.pool.Exec(ctx, "INSERT INTO project_memberships(project_id,user_id,role) VALUES($1,$2,'member')", hidden.project.UUID, f.member.UserID.UUID); err != nil {
		t.Fatal(err)
	}
	hidden.produce(t, NewComment)
	if _, err := f.pool.Exec(ctx, "UPDATE project_memberships SET removed_at=now() WHERE project_id=$1", hidden.project.UUID); err != nil {
		t.Fatal(err)
	}
	all, err := f.service.MarkAll(ctx, f.member, MarkAllInput{RetryReference: uuid.NewString()})
	if err != nil || all.Body.Result.ChangedCount != 1 {
		t.Fatal("mark-all included inaccessible project", err)
	}
	var read bool
	if err := f.pool.QueryRow(ctx, "SELECT read_at IS NOT NULL FROM notifications WHERE project_id=$1 AND recipient_id=$2", hidden.project.UUID, f.member.UserID.UUID).Scan(&read); err != nil || read {
		t.Fatal("hidden read state changed", err)
	}
	signer, _ := command.NewCursorSigner([]byte(strings.Repeat("r", 32)))
	access := identity.New(command.Runner{Pool: f.pool}, signer, time.UTC, "http://fixture/")
	for trial := 0; trial < 20; trial++ {
		// Fixture reset occurs before either real competing command starts.
		if _, err := f.pool.Exec(ctx, "UPDATE project_memberships SET removed_at=NULL,revision=1 WHERE project_id=$1 AND user_id=$2", f.project.UUID, f.member.UserID.UUID); err != nil {
			t.Fatal(err)
		}
		if _, err := f.pool.Exec(ctx, "UPDATE notifications SET read_at=NULL,revision=1 WHERE project_id=$1 AND recipient_id=$2", f.project.UUID, f.member.UserID.UUID); err != nil {
			t.Fatal(err)
		}
		start := make(chan struct{})
		marked := make(chan error, 1)
		removed := make(chan error, 1)
		go func() {
			<-start
			_, err := f.service.MarkAll(ctx, f.member, MarkAllInput{RetryReference: uuid.NewString()})
			marked <- err
		}()
		go func() {
			<-start
			_, err := access.RemoveMembership(ctx, f.owner, identity.RemoveMembershipInput{
				ProjectID:        f.project,
				UserID:           f.member.UserID,
				ExpectedRevision: 1,
				RetryReference:   uuid.NewString(),
			})
			removed <- err
		}()
		close(start)
		if err := <-marked; err != nil {
			t.Fatal("mark-all race", err)
		}
		if err := <-removed; err != nil {
			t.Fatal("membership race", err)
		}
		summary, err := f.service.Summary(ctx, f.member)
		if err != nil || summary.UnreadCount != 0 {
			t.Fatal("revoked race leaked count", err)
		}
		page, err := f.service.List(ctx, f.member, ListInput{})
		if err != nil || page.TotalMatching != 0 || len(page.Items) != 0 {
			t.Fatal("revoked race leaked inbox", err)
		}
	}
}
