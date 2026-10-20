package notifications

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"strings"
	"time"

	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Senders are configured at startup. Tests use a sink; nil leaves email disabled.
type Email struct {
	ID      uuid.UUID
	To      string
	Subject string
	Text    string
}
type Sender interface {
	Send(context.Context, Email) error
}

type Worker struct {
	pool    *pgxpool.Pool
	sender  Sender
	baseURL string
}

func NewWorker(pool *pgxpool.Pool, sender Sender, baseURL string) (*Worker, error) {
	parsed, err := url.Parse(baseURL)
	if pool == nil || err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" {
		return nil, errors.New("notification worker requires a database and public application URL")
	}
	return &Worker{pool: pool, sender: sender, baseURL: strings.TrimRight(baseURL, "/")}, nil
}

// RunOnce is bounded and safe for concurrent instances. Schedule it with a
// authenticated scheduled maintenance or a local ticker; the database remains
// the durable queue across instance restarts.
// SMTP is at-least-once: a crash after SMTP acceptance and before commit may
// repeat the stable Message-ID. The database never claims exactly-once mail.
func (w *Worker) RunOnce(ctx context.Context, today command.CalendarDate) (int, error) {
	ctx, cancel := context.WithTimeout(ctx, 45*time.Second)
	defer cancel()
	date, err := time.Parse("2006-01-02", today.String())
	if err != nil || date.IsZero() {
		return 0, errors.New("notification worker requires a company date")
	}
	q := dbgen.New(w.pool)
	// In-app reminders work without SMTP. Serialize only their bounded creation
	// transaction, so concurrent Cloud Run jobs cannot create duplicate events.
	if err = w.remind(ctx, pgtype.Date{Time: date, Valid: true}); err != nil {
		return 0, err
	}
	if w.sender == nil {
		return 0, nil
	}
	if _, err = q.NotificationQueueEvents(ctx); err != nil {
		return 0, err
	}
	processed := 0
	for trial := 0; trial < 100; trial++ {
		count, err := w.deliverNext(ctx)
		if err != nil {
			return processed, err
		}
		if count == 0 {
			break
		}
		processed += count
	}
	return processed, nil
}

func (w *Worker) remind(ctx context.Context, date pgtype.Date) error {
	tx, err := w.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	q := dbgen.New(tx)
	if _, err = q.CompanySharedGuard(ctx); err != nil {
		return err
	}
	locked, err := q.NotificationReminderGuard(ctx)
	if err != nil {
		return err
	}
	if !locked {
		return nil
	}
	if _, err = q.NotificationQueueReminders(ctx, date); err != nil {
		return err
	}
	if _, err = q.NotificationInsertDueNotifications(ctx, date); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (w *Worker) deliverNext(ctx context.Context) (int, error) {
	tx, err := w.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return 0, err
	}
	defer func() {
		cleanup, cancel := context.WithTimeout(context.WithoutCancel(ctx), time.Second)
		defer cancel()
		_ = tx.Rollback(cleanup)
	}()
	q := dbgen.New(tx)
	// Membership removal and account disable take the exclusive company guard.
	// Hold its shared side through the send so delivery cannot race revocation.
	if _, err = q.CompanySharedGuard(ctx); err != nil {
		return 0, err
	}
	first, err := q.NotificationNextDelivery(ctx)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, nil
	}
	if err != nil {
		return 0, err
	}
	mode, err := q.NotificationDeliveryMode(ctx, first.RecipientID)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, errors.New("delivery preferences unavailable")
	}
	if err != nil {
		return 0, err
	}
	group := []dbgen.NotificationDelivery{first}
	if mode == string(EmailDaily) {
		group, err = q.NotificationDeliveryGroup(ctx, dbgen.NotificationDeliveryGroupParams{
			RecipientID: first.RecipientID,
			Column2:     true,
		})
		if err != nil {
			return 0, err
		}
	}
	eligible := []dbgen.NotificationDelivery{}
	to := ""
	body := strings.Builder{}
	subject := "GateGoldJira work update"
	finish := func(item dbgen.NotificationDelivery, state string, available time.Time) error {
		return q.NotificationDeliveryFinish(ctx, dbgen.NotificationDeliveryFinishParams{
			ID:          item.ID,
			State:       state,
			AvailableAt: pgtype.Timestamptz{Time: available, Valid: true},
		})
	}
	// Lock projects in ascending order before re-reading. Project archival and
	// issue changes use the same locks; queued summaries never bypass access.
	projects := map[uuid.UUID]bool{}
	for _, item := range group {
		issue, readErr := q.ReadIssue(ctx, item.IssueID)
		if readErr != nil {
			return 0, readErr
		}
		projects[issue.ProjectID] = true
	}
	projectIDs := make([]uuid.UUID, 0, len(projects))
	for id := range projects {
		projectIDs = append(projectIDs, id)
	}
	sortUUIDs(projectIDs)
	for _, id := range projectIDs {
		// Retain a stable current-content snapshot through delivery, just as
		// the legacy project row guard does before narrower metadata writes.
		if _, err = q.ProjectExclusiveLifecycle(ctx, id); err != nil {
			return 0, err
		}
		if _, err = q.LockProjectShared(ctx, id); err != nil {
			return 0, err
		}
	}
	for _, item := range group {
		current, err := q.NotificationDeliveryCurrent(ctx, item.ID)
		if err != nil {
			return 0, err
		}
		if !current.Eligible {
			if err := finish(item, "cancelled", time.Now()); err != nil {
				return 0, err
			}
			continue
		}
		to = current.Email
		eligible = append(eligible, item)
		if mode != string(EmailDaily) {
			subject = "GateGoldJira: " + current.IssueKey
		}
		fmt.Fprintf(&body, "%s · %s\n%s\n%s/issues/%s\n\n", current.IssueKey, current.Title, current.Summary, w.baseURL, item.IssueID.String())
	}
	if len(eligible) > 0 {
		if mode == string(EmailDaily) {
			subject = fmt.Sprintf("GateGoldJira daily digest · %d updates", len(eligible))
		}
		body.WriteString("Manage notification preferences in your GateGoldJira Inbox.\n")
		sendCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
		sendErr := w.sender.Send(sendCtx, Email{ID: eligible[0].ID, To: to, Subject: subject, Text: body.String()})
		cancel()
		for _, item := range eligible {
			state := "sent"
			available := time.Now()
			if sendErr != nil {
				state = "pending"
				available = available.Add(time.Minute * time.Duration(1<<uint(item.Attempts)))
				if item.Attempts >= 7 {
					state = "failed"
				}
			}
			if err := finish(item, state, available); err != nil {
				return 0, err
			}
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}
	return len(group), nil
}

func sortUUIDs(ids []uuid.UUID) {
	for i := 1; i < len(ids); i++ {
		for j := i; j > 0 && ids[j].String() < ids[j-1].String(); j-- {
			ids[j], ids[j-1] = ids[j-1], ids[j]
		}
	}
}
