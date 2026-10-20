-- name: ReadNotification :one
SELECT * FROM notifications WHERE id = $1 AND recipient_id = $2;

-- name: EligibleNotificationRecipients :many
SELECT u.id FROM users u
LEFT JOIN project_memberships m ON m.user_id=u.id AND m.project_id=$1
WHERE u.id=ANY($2::uuid[]) AND u.approved_at IS NOT NULL AND u.disabled_at IS NULL
AND (u.is_administrator OR (m.user_id IS NOT NULL AND m.removed_at IS NULL AND m.role IN ('project_admin','member','viewer')))
ORDER BY u.id;

-- name: InsertNotificationBatch :batchexec
INSERT INTO notifications (id,recipient_id,event_id,project_id,issue_id,actor_id,reasons,plain_text_summary,show_in_app)
SELECT sqlc.arg(id)::uuid,sqlc.arg(recipient_id)::uuid,sqlc.arg(event_id)::uuid,sqlc.arg(project_id)::uuid,sqlc.arg(issue_id)::uuid,sqlc.arg(actor_id)::uuid,
 ARRAY(SELECT reason FROM unnest(sqlc.arg(reasons)::text[]) reason WHERE prefs.user_id IS NULL OR reason=ANY(prefs.events)),sqlc.arg(plain_text_summary)::text,coalesce(prefs.in_app_enabled,true)
FROM (SELECT 1) seed LEFT JOIN notification_preferences prefs ON prefs.user_id=sqlc.arg(recipient_id)::uuid
WHERE (prefs.user_id IS NULL OR sqlc.arg(reasons)::text[] && prefs.events) AND (prefs.user_id IS NULL OR prefs.in_app_enabled OR prefs.email_mode<>'off')
ON CONFLICT (event_id,issue_id,recipient_id) DO UPDATE
SET reasons=(SELECT array_agg(DISTINCT reason ORDER BY reason) FROM unnest(notifications.reasons || EXCLUDED.reasons) reason);

-- name: InboxList :many
SELECT n.id,n.issue_id,n.project_id,(p.key || '-' || i.number::text)::text AS issue_key,
 n.actor_id,u.display_name AS actor_name,n.reasons,n.plain_text_summary,n.created_at,n.read_at,n.revision
FROM notifications n JOIN projects p ON p.id=n.project_id JOIN issues i ON i.id=n.issue_id JOIN users u ON u.id=n.actor_id
WHERE n.show_in_app AND n.recipient_id=sqlc.arg(caller_id)
 AND (sqlc.arg(is_admin)::boolean OR EXISTS(SELECT 1 FROM project_memberships m WHERE m.project_id=n.project_id AND m.user_id=sqlc.arg(caller_id) AND m.removed_at IS NULL))
 AND (NOT sqlc.arg(unread_only)::boolean OR n.read_at IS NULL)
 AND (NOT sqlc.arg(has_cursor)::boolean OR (n.created_at,n.id)<(sqlc.arg(after_time)::timestamptz,sqlc.arg(after_id)::uuid))
ORDER BY n.created_at DESC,n.id DESC LIMIT sqlc.arg(page_size)::integer;

-- name: InboxCount :one
SELECT count(*)::integer FROM notifications n WHERE n.show_in_app AND n.recipient_id=sqlc.arg(caller_id)
 AND (sqlc.arg(is_admin)::boolean OR EXISTS(SELECT 1 FROM project_memberships m WHERE m.project_id=n.project_id AND m.user_id=sqlc.arg(caller_id) AND m.removed_at IS NULL))
 AND (NOT sqlc.arg(unread_only)::boolean OR n.read_at IS NULL);

-- name: InboxGet :one
SELECT n.id,n.issue_id,n.project_id,(p.key || '-' || i.number::text)::text AS issue_key,
 n.actor_id,u.display_name AS actor_name,n.reasons,n.plain_text_summary,n.created_at,n.read_at,n.revision
FROM notifications n JOIN projects p ON p.id=n.project_id JOIN issues i ON i.id=n.issue_id JOIN users u ON u.id=n.actor_id
WHERE n.show_in_app AND n.id=sqlc.arg(notification_id) AND n.recipient_id=sqlc.arg(caller_id)
 AND (sqlc.arg(is_admin)::boolean OR EXISTS(SELECT 1 FROM project_memberships m WHERE m.project_id=n.project_id AND m.user_id=sqlc.arg(caller_id) AND m.removed_at IS NULL));

-- name: InboxLockNotification :one
SELECT * FROM notifications WHERE id=sqlc.arg(notification_id) AND recipient_id=sqlc.arg(caller_id) FOR UPDATE;

-- name: InboxSetRead :execrows
UPDATE notifications SET read_at=CASE WHEN sqlc.arg(is_read)::boolean THEN now() ELSE NULL END,revision=revision+1
WHERE id=sqlc.arg(notification_id) AND recipient_id=sqlc.arg(caller_id) AND revision=sqlc.arg(expected_revision);

-- name: InboxAccessibleProjects :many
SELECT p.id FROM projects p WHERE sqlc.arg(is_admin)::boolean OR EXISTS(
 SELECT 1 FROM project_memberships m WHERE m.project_id=p.id AND m.user_id=sqlc.arg(caller_id) AND m.removed_at IS NULL)
ORDER BY p.id;

-- name: InboxMarkAllRead :one
WITH changed AS (
 UPDATE notifications SET read_at=now(),revision=revision+1
 WHERE show_in_app AND recipient_id=sqlc.arg(caller_id) AND project_id=ANY(sqlc.arg(project_ids)::uuid[]) AND read_at IS NULL RETURNING id
) SELECT count(*)::integer FROM changed;

-- name: NotificationWatchers :many
SELECT issue_id,user_id FROM issue_watchers WHERE issue_id=ANY($1::uuid[]) AND watching;


-- name: NotificationPreferencesGet :one
SELECT coalesce(p.in_app_enabled,true)::boolean AS in_app_enabled,
 coalesce(p.events,ARRAY['watching','comment','mention','assignment','status','due_date','dependency_blocked','dependency_resolved','subtask_created','subtasks_completed']::text[])::text[] AS events,
 coalesce(p.email_mode,'off')::text AS email_mode,coalesce(p.due_reminders,false)::boolean AS due_reminders,coalesce(p.revision,1)::bigint AS revision
FROM users u LEFT JOIN notification_preferences p ON p.user_id=u.id WHERE u.id=$1;

-- name: NotificationPreferencesEnsure :exec
INSERT INTO notification_preferences(user_id) VALUES($1) ON CONFLICT DO NOTHING;

-- name: NotificationPreferencesLock :one
SELECT * FROM notification_preferences WHERE user_id=$1 FOR UPDATE;

-- name: NotificationPreferencesUpdate :execrows
UPDATE notification_preferences SET in_app_enabled=$2,events=$3,email_mode=$4,due_reminders=$5,revision=revision+1,updated_at=now() WHERE user_id=$1 AND revision=$6;

-- name: NotificationQueueEvents :execrows
INSERT INTO notification_deliveries(id,recipient_id,issue_id,notification_id,dedup_key,available_at)
SELECT gen_random_uuid(),n.recipient_id,n.issue_id,n.id,'notification:'||n.id::text,
 CASE WHEN prefs.email_mode='daily' THEN n.created_at+interval '24 hours' ELSE n.created_at END
FROM notifications n JOIN notification_preferences prefs ON prefs.user_id=n.recipient_id
WHERE prefs.email_mode<>'off' AND n.reasons && prefs.events AND n.created_at>=prefs.updated_at AND n.created_at>now()-interval '7 days'
 AND NOT EXISTS(SELECT 1 FROM notification_deliveries existing WHERE existing.dedup_key='notification:'||n.id::text)
ORDER BY n.created_at,n.id LIMIT 1000
ON CONFLICT(dedup_key) DO NOTHING;

-- name: NotificationReminderGuard :one
SELECT pg_try_advisory_xact_lock(28714318)::boolean;

-- name: NotificationQueueReminders :execrows
WITH due_issues AS (
 SELECT i.id,i.project_id,i.due_date FROM issues i JOIN projects p ON p.id=i.project_id
 WHERE i.due_date=sqlc.arg(today)::date AND i.stage_id IN (SELECT id FROM workflow_stages WHERE category<>'done') AND NOT i.archived AND p.archived_at IS NULL
 AND NOT EXISTS(SELECT 1 FROM notification_due_events d WHERE d.issue_id=i.id AND d.due_date=i.due_date)
 AND EXISTS(SELECT 1 FROM notification_preferences prefs JOIN users u ON u.id=prefs.user_id
 WHERE (prefs.user_id=i.assignee_id OR prefs.user_id=i.reporter_id) AND prefs.due_reminders AND 'due_date'=ANY(prefs.events)
 AND (prefs.in_app_enabled OR prefs.email_mode<>'off') AND u.approved_at IS NOT NULL AND u.disabled_at IS NULL
 AND (u.is_administrator OR EXISTS(SELECT 1 FROM project_memberships m WHERE m.project_id=i.project_id AND m.user_id=u.id AND m.removed_at IS NULL)))
 ORDER BY i.id LIMIT 500
), events AS (
 INSERT INTO activity_events(id,actor_id,channel,action,resource_kind,resource_id,project_id,issue_id,changes)
 SELECT gen_random_uuid(),'ffffffff-ffff-4fff-8fff-ffffffffffff','web','schedule_due_reminder','issue',id,project_id,id,
 jsonb_build_object('version',1,'fields',jsonb_build_array(jsonb_build_object('field','dueReminder','before',NULL,'after',due_date::text))) FROM due_issues
 RETURNING id,issue_id
)
INSERT INTO notification_due_events(issue_id,due_date,event_id)
SELECT e.issue_id,d.due_date,e.id FROM events e JOIN due_issues d ON d.id=e.issue_id;

-- name: NotificationInsertDueNotifications :execrows
INSERT INTO notifications(id,recipient_id,event_id,project_id,issue_id,actor_id,reasons,plain_text_summary,show_in_app)
SELECT gen_random_uuid(),u.id,d.event_id,i.project_id,i.id,'ffffffff-ffff-4fff-8fff-ffffffffffff',ARRAY['due_date']::text[],'Due today: '||i.title,prefs.in_app_enabled
FROM notification_due_events d JOIN issues i ON i.id=d.issue_id JOIN projects p ON p.id=i.project_id
JOIN notification_preferences prefs ON prefs.user_id=i.assignee_id OR prefs.user_id=i.reporter_id JOIN users u ON u.id=prefs.user_id
WHERE d.due_date=sqlc.arg(today)::date AND i.due_date=d.due_date AND i.stage_id IN (SELECT id FROM workflow_stages WHERE category<>'done') AND NOT i.archived AND p.archived_at IS NULL
 AND prefs.due_reminders AND 'due_date'=ANY(prefs.events) AND (prefs.in_app_enabled OR prefs.email_mode<>'off')
 AND u.approved_at IS NOT NULL AND u.disabled_at IS NULL
 AND (u.is_administrator OR EXISTS(SELECT 1 FROM project_memberships m WHERE m.project_id=i.project_id AND m.user_id=u.id AND m.removed_at IS NULL))
 AND NOT EXISTS(SELECT 1 FROM notifications existing WHERE existing.event_id=d.event_id AND existing.issue_id=i.id AND existing.recipient_id=u.id)
ORDER BY i.id,u.id LIMIT 1000
ON CONFLICT(event_id,issue_id,recipient_id) DO NOTHING;

-- name: NotificationNextDelivery :one
SELECT d.* FROM notification_deliveries d WHERE d.state='pending' AND d.available_at<=now() ORDER BY d.available_at,d.id LIMIT 1 FOR UPDATE SKIP LOCKED;

-- name: NotificationDeliveryCurrent :one
SELECT d.id,d.recipient_id,d.issue_id,d.notification_id,u.email,u.display_name,(p.key||'-'||i.number::text)::text AS issue_key,i.title,
 coalesce(n.plain_text_summary,'Due today: '||i.title)::text AS summary,
 (u.approved_at IS NOT NULL AND u.disabled_at IS NULL AND p.archived_at IS NULL AND NOT i.archived
  AND prefs.email_mode<>'off'
  AND (u.is_administrator OR EXISTS(SELECT 1 FROM project_memberships m WHERE m.project_id=i.project_id AND m.user_id=u.id AND m.removed_at IS NULL))
  AND n.reasons && prefs.events AND
    (e.action<>'schedule_due_reminder' OR (prefs.due_reminders AND EXISTS(SELECT 1 FROM notification_due_events reminder WHERE reminder.event_id=n.event_id AND reminder.due_date=i.due_date) AND (i.assignee_id=u.id OR i.reporter_id=u.id) AND i.stage_id IN (SELECT id FROM workflow_stages WHERE category<>'done'))))::boolean AS eligible
FROM notification_deliveries d JOIN users u ON u.id=d.recipient_id JOIN issues i ON i.id=d.issue_id JOIN projects p ON p.id=i.project_id
JOIN notification_preferences prefs ON prefs.user_id=u.id JOIN notifications n ON n.id=d.notification_id JOIN activity_events e ON e.id=n.event_id WHERE d.id=$1;

-- name: NotificationDeliveryFinish :exec
UPDATE notification_deliveries SET state=$2,attempts=attempts+1,available_at=$3,completed_at=CASE WHEN $2<>'pending' THEN now() ELSE NULL END WHERE id=$1;


-- name: NotificationDeliveryGroup :many
SELECT * FROM notification_deliveries WHERE state='pending' AND recipient_id=$1
 AND (available_at<=now() OR $2::boolean) ORDER BY available_at,id LIMIT 50 FOR UPDATE SKIP LOCKED;

-- name: NotificationDeliveryMode :one
SELECT email_mode FROM notification_preferences WHERE user_id=$1 FOR SHARE;
