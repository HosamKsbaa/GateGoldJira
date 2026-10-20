-- +goose Up
CREATE TABLE notification_preferences (
 user_id uuid PRIMARY KEY REFERENCES users(id),
 in_app_enabled boolean NOT NULL DEFAULT true,
 events text[] NOT NULL DEFAULT ARRAY['watching','comment','mention','assignment','status','due_date','dependency_blocked','dependency_resolved','subtask_created','subtasks_completed']::text[],
 email_mode text NOT NULL DEFAULT 'off' CHECK(email_mode IN ('off','instant','daily')),
 due_reminders boolean NOT NULL DEFAULT false,
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(cardinality(events)<=10 AND events <@ ARRAY['watching','comment','mention','assignment','status','due_date','dependency_blocked','dependency_resolved','subtask_created','subtasks_completed']::text[])
);
ALTER TABLE notifications ADD COLUMN show_in_app boolean NOT NULL DEFAULT true;
-- Automated events have an explicit inactive actor and cannot impersonate an
-- employee. This user has no identity binding and cannot authenticate.
INSERT INTO users(id,email,email_key,display_name,disabled_at)
VALUES('ffffffff-ffff-4fff-8fff-ffffffffffff','reminders@system.invalid','reminders@system.invalid','GateGoldJira reminder',now());
CREATE TABLE notification_due_events (
 issue_id uuid NOT NULL REFERENCES issues(id), due_date date NOT NULL,
 event_id uuid NOT NULL UNIQUE REFERENCES activity_events(id),
 PRIMARY KEY(issue_id,due_date)
);
CREATE TABLE notification_deliveries (
 id uuid PRIMARY KEY,
 recipient_id uuid NOT NULL REFERENCES users(id),
 issue_id uuid NOT NULL REFERENCES issues(id),
 notification_id uuid NOT NULL UNIQUE REFERENCES notifications(id),
 dedup_key text NOT NULL UNIQUE,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sent','cancelled','failed')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 8),
 available_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz
);
CREATE INDEX notification_deliveries_pending ON notification_deliveries(available_at,id) WHERE state='pending';
CREATE INDEX notification_delivery_events ON notifications(created_at,id);
CREATE INDEX issues_reminder_due ON issues(due_date,id) WHERE due_date IS NOT NULL AND NOT archived AND split_part(status,':',1)<>'done';
-- +goose Down
DROP TABLE notification_deliveries;
DROP INDEX notification_delivery_events;
DROP INDEX issues_reminder_due;
DROP TABLE notification_due_events;
ALTER TABLE notifications DROP COLUMN show_in_app;
DROP TABLE notification_preferences;
