package notifications

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
)

func preferencesSave(t *testing.T, f inboxFixture, fields NotificationPreferencesFields) NotificationPreferencesView {
	t.Helper()
	ctx := context.Background()
	current, err := f.service.Preferences(ctx, f.member)
	if err != nil {
		t.Fatal(err)
	}
	saved, err := f.service.UpdatePreferences(ctx, f.member, UpdateNotificationPreferencesInput{
		UpdateNotificationPreferencesFields: UpdateNotificationPreferencesFields{
			NotificationPreferencesFields: fields,
			ExpectedRevision:              current.Revision,
		},
		RetryReference: uuid.NewString(),
	})
	if err != nil {
		t.Fatal(err)
	}
	return saved.Body.Result
}

func TestPreferencesArePrivateRevisionedAuditedAndRetryableWithEventOptOut(t *testing.T) {
	f := inboxDatabase(t)
	ctx := context.Background()
	initial, err := f.service.Preferences(ctx, f.viewer)
	if err != nil || !initial.InAppEnabled || initial.EmailMode != EmailOff || len(initial.Events) != 10 || initial.Revision != 1 || initial.EmailDeliveryAvailable {
		t.Fatal("defaults", initial, err)
	}
	in := UpdateNotificationPreferencesInput{
		UpdateNotificationPreferencesFields: UpdateNotificationPreferencesFields{
			NotificationPreferencesFields: NotificationPreferencesFields{
				InAppEnabled: true,
				Events:       []Reason{Mention},
				EmailMode:    EmailOff,
			},
			ExpectedRevision: 1,
		},
		RetryReference: uuid.NewString(),
	}
	saved, err := f.service.UpdatePreferences(ctx, f.member, in)
	if err != nil || saved.Body.Result.Revision != 2 || saved.Body.Receipt.EventID == nil {
		t.Fatal("saved preferences", err)
	}
	actor := f.member
	actor.Channel = command.MCP
	replayed, err := f.service.UpdatePreferences(ctx, actor, in)
	if err != nil || !replayed.Body.Receipt.Replayed || replayed.Body.Result.Revision != 2 || *replayed.Body.Receipt.EventID != *saved.Body.Receipt.EventID {
		t.Fatal("retry across transports", err)
	}
	in.RetryReference = uuid.NewString()
	_, err = f.service.UpdatePreferences(ctx, f.member, in)
	var failure *command.Failure
	if !errors.As(err, &failure) || failure.Code != command.Conflict {
		t.Fatal("stale preferences accepted", err)
	}
	f.produce(t, NewComment, NewAssignment)
	page, err := f.service.List(ctx, f.member, ListInput{})
	if err != nil || len(page.Items) != 1 || len(page.Items[0].Reasons) != 1 || page.Items[0].Reasons[0] != Mention {
		t.Fatal("event optout", err, page)
	}
	preferencesSave(t, f, NotificationPreferencesFields{InAppEnabled: true, Events: []Reason{}, EmailMode: EmailOff})
	f.produce(t, NewComment)
	page, err = f.service.List(ctx, f.member, ListInput{})
	if err != nil || page.TotalMatching != 1 {
		t.Fatal("select none should retain history only", err, page.TotalMatching)
	}
	other, err := f.service.Preferences(ctx, f.viewer)
	if err != nil || len(other.Events) != 10 || other.Revision != 1 {
		t.Fatal("another user's settings changed", err)
	}
	if _, err = f.pool.Exec(ctx, "UPDATE users SET disabled_at=now() WHERE id=$1", f.member.UserID.UUID); err != nil {
		t.Fatal(err)
	}
	if _, err = f.service.Preferences(ctx, f.member); err == nil {
		t.Fatal("disabled user read preferences")
	}
}

type mailSink struct {
	mu       sync.Mutex
	messages []Email
	fail     bool
}

func (s *mailSink) Send(_ context.Context, message Email) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.fail {
		return errors.New("local simulated failure")
	}
	s.messages = append(s.messages, message)
	return nil
}
func (s *mailSink) count() int { s.mu.Lock(); defer s.mu.Unlock(); return len(s.messages) }

func TestDeliveryDurableDedupRetryOptOutAndRevokedMembership(t *testing.T) {
	f := inboxDatabase(t)
	ctx := context.Background()
	sink := &mailSink{}
	preferencesSave(t, f, NotificationPreferencesFields{
		InAppEnabled: true,
		Events:       []Reason{Mention, Comment},
		EmailMode:    EmailInstant,
	})
	worker, err := NewWorker(f.pool, sink, "https://fixture.test")
	if err != nil {
		t.Fatal(err)
	}
	f.produce(t, NewComment)
	if count, err := worker.RunOnce(ctx, f.member.Today); err != nil || count != 1 || sink.count() != 1 {
		t.Fatal("delivery", count, sink.count(), err)
	}
	if count, err := worker.RunOnce(ctx, f.member.Today); err != nil || count != 0 || sink.count() != 1 {
		t.Fatal("delivery duplicated", count, err)
	}
	f.produce(t, NewComment)
	sink.fail = true
	if count, err := worker.RunOnce(ctx, f.member.Today); err != nil || count != 1 || sink.count() != 1 {
		t.Fatal("durable failure", count, err)
	}
	var attempts int
	var pending int
	if err = f.pool.QueryRow(ctx, "SELECT count(*),coalesce(max(attempts),0) FROM notification_deliveries WHERE state='pending'").Scan(&pending, &attempts); err != nil || pending != 1 || attempts != 1 {
		t.Fatal("failed send was not retained", err, pending, attempts)
	}
	sink.fail = false
	if _, err = f.pool.Exec(ctx, "UPDATE notification_deliveries SET available_at=now() WHERE state='pending'"); err != nil {
		t.Fatal(err)
	}
	if count, err := worker.RunOnce(ctx, f.member.Today); err != nil || count != 1 || sink.count() != 2 {
		t.Fatal("retry failed", count, err)
	}
	f.produce(t, NewComment)
	if _, err = dbgen.New(f.pool).NotificationQueueEvents(ctx); err != nil {
		t.Fatal(err)
	}
	preferencesSave(t, f, NotificationPreferencesFields{
		InAppEnabled: true,
		Events:       []Reason{Mention},
		EmailMode:    EmailOff,
	})
	if _, err = worker.RunOnce(ctx, f.member.Today); err != nil || sink.count() != 2 {
		t.Fatal("opt-out did not cancel queue", err)
	}
	preferencesSave(t, f, NotificationPreferencesFields{
		InAppEnabled: true,
		Events:       []Reason{Mention},
		EmailMode:    EmailInstant,
	})
	f.produce(t, NewComment)
	if _, err = dbgen.New(f.pool).NotificationQueueEvents(ctx); err != nil {
		t.Fatal(err)
	}
	if _, err = f.pool.Exec(ctx, "UPDATE project_memberships SET removed_at=now() WHERE project_id=$1 AND user_id=$2", f.project.UUID, f.member.UserID.UUID); err != nil {
		t.Fatal(err)
	}
	if _, err = worker.RunOnce(ctx, f.member.Today); err != nil || sink.count() != 2 {
		t.Fatal("revoked membership received mail", err)
	}
	var cancelled int
	if err = f.pool.QueryRow(ctx, "SELECT count(*) FROM notification_deliveries WHERE state='cancelled'").Scan(&cancelled); err != nil || cancelled != 2 {
		t.Fatal("cancelled deliveries retained", err, cancelled)
	}
}

func TestDueRemindersWorkWithoutSMTPAndDeduplicateConcurrentWorkers(t *testing.T) {
	f := inboxDatabase(t)
	ctx := context.Background()
	preferencesSave(t, f, NotificationPreferencesFields{
		InAppEnabled: true,
		Events:       []Reason{DueDate},
		EmailMode:    EmailOff,
		DueReminders: true,
	})
	if _, err := f.pool.Exec(ctx, "UPDATE issues SET due_date=$2::date WHERE id=$1", f.issue.UUID, f.member.Today.String()); err != nil {
		t.Fatal(err)
	}
	worker, err := NewWorker(f.pool, nil, "https://fixture.test")
	if err != nil {
		t.Fatal(err)
	}
	start := make(chan struct{})
	outcomes := make(chan error, 2)
	for trial := 0; trial < 2; trial++ {
		go func() { <-start; _, err := worker.RunOnce(ctx, f.member.Today); outcomes <- err }()
	}
	close(start)
	for trial := 0; trial < 2; trial++ {
		if err := <-outcomes; err != nil {
			t.Fatal(err)
		}
	}
	page, err := f.service.List(ctx, f.member, ListInput{})
	if err != nil || len(page.Items) != 1 || page.Items[0].Actor.DisplayName != "GateGoldJira reminder" || !strings.Contains(page.Items[0].Summary, "Due today:") {
		t.Fatal("in-app reminder", err, page)
	}
	if _, err = worker.RunOnce(ctx, f.member.Today); err != nil {
		t.Fatal(err)
	}
	var count int
	if err = f.pool.QueryRow(ctx, "SELECT count(*) FROM notification_due_events").Scan(&count); err != nil || count != 1 {
		t.Fatal("duplicate reminder event", err, count)
	}
	if _, err = f.pool.Exec(ctx, "UPDATE issues SET status='done' WHERE id=$1", f.issue.UUID); err != nil {
		t.Fatal(err)
	}
	if _, err = worker.RunOnce(ctx, f.member.Today); err != nil {
		t.Fatal(err)
	}
	page, err = f.service.List(ctx, f.member, ListInput{})
	if err != nil || len(page.Items) != 1 {
		t.Fatal("completed work generated a fresh reminder", err)
	}
}

func TestDailyDigestGroupsUpdatesAndDueEmailRechecksCurrentIssue(t *testing.T) {
	f := inboxDatabase(t)
	ctx := context.Background()
	sink := &mailSink{}
	preferencesSave(t, f, NotificationPreferencesFields{
		InAppEnabled: true,
		Events:       []Reason{Mention, DueDate},
		EmailMode:    EmailDaily,
		DueReminders: true,
	})
	f.produce(t, NewComment)
	f.produce(t, NewComment)
	worker, err := NewWorker(f.pool, sink, "https://fixture.test")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = worker.RunOnce(ctx, f.member.Today); err != nil || sink.count() != 0 {
		t.Fatal("digest sent before day window", err)
	}
	if _, err = f.pool.Exec(ctx, "UPDATE notification_deliveries SET available_at=now()-interval '1 second'"); err != nil {
		t.Fatal(err)
	}
	if _, err = worker.RunOnce(ctx, f.member.Today); err != nil || sink.count() != 1 || !strings.Contains(sink.messages[0].Subject, "2 updates") {
		t.Fatal("digest was not grouped", err, sink.count())
	}
	preferencesSave(t, f, NotificationPreferencesFields{
		InAppEnabled: true,
		Events:       []Reason{DueDate},
		EmailMode:    EmailInstant,
		DueReminders: true,
	})
	if _, err = f.pool.Exec(ctx, "UPDATE issues SET due_date=$2::date WHERE id=$1", f.issue.UUID, f.member.Today.String()); err != nil {
		t.Fatal(err)
	}
	if err = worker.remind(ctx, pgtypeDate(f.member.Today)); err != nil {
		t.Fatal(err)
	}
	if _, err = dbgen.New(f.pool).NotificationQueueEvents(ctx); err != nil {
		t.Fatal(err)
	}
	if _, err = f.pool.Exec(ctx, "UPDATE issues SET status='done' WHERE id=$1", f.issue.UUID); err != nil {
		t.Fatal(err)
	}
	if _, err = worker.RunOnce(ctx, f.member.Today); err != nil || sink.count() != 1 {
		t.Fatal("completed work received stale due email", err)
	}
}

func pgtypeDate(date command.CalendarDate) pgtype.Date {
	parsed, _ := time.Parse("2006-01-02", date.String())
	return pgtype.Date{Time: parsed, Valid: true}
}
