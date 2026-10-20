package app

import (
	"context"
	"io"
	"log/slog"
	"testing"
	"time"

	"gategoldjira/backend/internal/features/notifications"
	"gategoldjira/backend/internal/platform/config"
	"gategoldjira/backend/internal/platform/database"
	"gategoldjira/backend/tests/testenv"
)

type waitingNotificationSink struct{ started chan struct{} }

func (sink waitingNotificationSink) Send(ctx context.Context, _ notifications.Email) error {
	close(sink.started)
	<-ctx.Done()
	return ctx.Err()
}

// Exercise shutdown during a real durable delivery transaction. Closing the
// database first would leave the worker blocked or lose a safe pending retry.
func TestShutdownCancelsNotificationDeliveryBeforeClosingDatabase(t *testing.T) {
	workspace := testenv.Work(t)
	ctx := context.Background()
	if _, err := workspace.Pool.Exec(ctx, "INSERT INTO notification_preferences(user_id,events,email_mode,due_reminders) VALUES($1,ARRAY['due_date'],'instant',true)", workspace.Other.UserID.UUID); err != nil {
		t.Fatal(err)
	}
	if _, err := workspace.Pool.Exec(ctx, "UPDATE issues SET due_date=$2::date WHERE id=$1", workspace.Issue.UUID, workspace.Other.Today.String()); err != nil {
		t.Fatal(err)
	}
	sink := waitingNotificationSink{started: make(chan struct{})}
	worker, err := notifications.NewWorker(workspace.Pool, sink, "https://fixture.test")
	if err != nil {
		t.Fatal(err)
	}
	application := &Application{
		Database:           &database.Database{Pool: workspace.Pool},
		NotificationWorker: worker,
		environment:        config.Development,
		workerInterval:     time.Hour,
		companyLocation:    time.UTC,
		logger:             slog.New(slog.NewTextHandler(io.Discard, nil)),
	}
	application.StartBackground(ctx)
	select {
	case <-sink.started:
	case <-time.After(5 * time.Second):
		application.Close()
		t.Fatal("development worker did not prepare a due-date delivery")
	}
	stopped := make(chan struct{})
	go func() { application.Close(); close(stopped) }()
	select {
	case <-stopped:
	case <-time.After(3 * time.Second):
		t.Fatal("application shutdown did not cancel the active worker")
	}
	if err := workspace.Pool.Ping(ctx); err == nil {
		t.Fatal("shutdown left the application database open")
	}
}
