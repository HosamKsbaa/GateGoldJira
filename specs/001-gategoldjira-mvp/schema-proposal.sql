-- GateGoldJira: proposed PostgreSQL schema, 2026-10-11.
-- DESIGN DRAFT: not an applied migration or a complete implementation.
-- Based on spec.md plus the requested configurable issue types/custom fields.
-- This keeps one company, four fixed statuses, and one level of subtasks.
-- Types and field definitions are project-scoped. Configuration is Admin-only
-- in this proposal; Members edit issue values under existing permissions.
-- UUIDs are supplied by the application. Timestamps are stored in UTC;
-- due_date is a calendar DATE evaluated in the company time zone.
-- JSONB is limited to typed, validated filters, event payloads, and retry data.
-- File bytes live in private durable object storage, not these tables.
--
-- SERVICE RULES STILL REQUIRED, in the same Go services for REST and MCP:
-- * Authenticate, check current approval/access, enforce ownership and archival.
-- * Clear invalid assignments on account/membership changes; protect last Admin.
-- * Keep project/key/issue number/reporter and existing parent links immutable.
-- * Seed Task, Bug, Subtask and the default board when creating each project.
-- * Parent must be a standard issue; reject nesting and prerequisite cycles.
-- * Serialize dependency/parent/completion changes with a project graph lock;
--   validate both explicit blockers and implicit parent->subtask prerequisites.
-- * Check revision on every guarded update and increment it only on success.
-- * Allocate issue numbers atomically with UPDATE projects SET
--   next_issue_number = next_issue_number + 1 ... RETURNING next_issue_number - 1.
-- * Lock affected project/status ordering rows in a consistent order for moves;
--   use rank gaps, rebalance an exhausted gap, and update ordering revisions.
-- * Validate required fields, active type/field mappings, string/number bounds,
--   current user eligibility, and nonempty required multi-selects in a transaction.
-- * Serialize schema configuration against issue writes using configuration_revision.
--   Before activating a required field, validate/backfill affected existing issues.
-- * Keep field data_type, stable keys, option keys, and hierarchy_kind immutable
--   once used. Archive definitions/options/mappings rather than deleting them.
-- * On a standard issue type change, reconcile incompatible field values in one
--   transaction, retain prior values in activity history, validate new required
--   fields, and defer the value->issue foreign key until transaction commit.
--   Subtask conversion/reparenting remains prohibited by the current spec.
-- * Validate safe HTML, Unicode/direction, meaningful comments, max 5 inline
--   pictures, same-issue publication, and uploader-only access to draft pictures.
-- * Insert mutation + activity event + notifications + retry result atomically.
--   Notifications are visible only while the recipient has current project access.
-- * Recheck current authorization before replaying stored retry results.
-- * Enforce field limits from the spec, including max 10 labels per issue.
-- * Ordinary lists use updated_at/id cursors; boards use rank/id cursors.
--   Default page size 25, maximum 100. Do not persist blocked/overdue/WIP counts.
-- These cross-row rules are not guaranteed by the DDL below alone.

CREATE TABLE company_settings (
    singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
    time_zone text NOT NULL DEFAULT 'Africa/Cairo',
    revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0)
);

CREATE TABLE users (
    id uuid PRIMARY KEY,
    email text NOT NULL CHECK (btrim(email) <> ''),
    display_name text NOT NULL CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 100),
    is_administrator boolean NOT NULL DEFAULT false,
    approved_at timestamptz,
    disabled_at timestamptz,
    revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_unique ON users (lower(email));

-- Provider details are chosen during planning; never store an access token here.
CREATE TABLE user_identities (
    provider text NOT NULL,
    subject text NOT NULL,
    user_id uuid NOT NULL REFERENCES users(id),
    PRIMARY KEY (provider, subject)
);

CREATE TABLE projects (
    id uuid PRIMARY KEY,
    key text NOT NULL UNIQUE CHECK (key ~ '^[A-Z][A-Z0-9]{1,9}$'),
    name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
    description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 2000),
    created_by uuid NOT NULL REFERENCES users(id),
    next_issue_number bigint NOT NULL DEFAULT 1 CHECK (next_issue_number > 0),
    revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
    configuration_revision bigint NOT NULL DEFAULT 1 CHECK (configuration_revision > 0),
    graph_revision bigint NOT NULL DEFAULT 1 CHECK (graph_revision > 0),
    archived_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE project_memberships (
    project_id uuid NOT NULL REFERENCES projects(id),
    user_id uuid NOT NULL REFERENCES users(id),
    role text NOT NULL CHECK (role IN ('member', 'viewer')),
    revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
    removed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (project_id, user_id)
);
CREATE INDEX memberships_by_user ON project_memberships (user_id, project_id)
    WHERE removed_at IS NULL;

-- All types share issues. A type name does not determine hierarchy behavior.
CREATE TABLE issue_types (
    id uuid PRIMARY KEY,
    project_id uuid NOT NULL REFERENCES projects(id),
    key text NOT NULL CHECK (key ~ '^[a-z][a-z0-9_]{0,63}$'),
    name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
    hierarchy_kind text NOT NULL DEFAULT 'standard'
        CHECK (hierarchy_kind IN ('standard', 'subtask')),
    revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
    archived_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (project_id, key),
    UNIQUE (project_id, id),
    UNIQUE (project_id, id, hierarchy_kind)
);
CREATE UNIQUE INDEX issue_type_names_unique ON issue_types (project_id, lower(name));

ALTER TABLE projects ADD COLUMN default_issue_type_id uuid;
ALTER TABLE projects ADD CONSTRAINT projects_default_type_fk
    FOREIGN KEY (id, default_issue_type_id) REFERENCES issue_types(project_id, id);
-- Nullable only during project provisioning; service must set a standard active
-- default type before the transaction commits. Task is the initial default.

CREATE TABLE field_definitions (
    id uuid PRIMARY KEY,
    project_id uuid NOT NULL REFERENCES projects(id),
    key text NOT NULL CHECK (key ~ '^[a-z][a-z0-9_]{0,63}$'),
    name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
    data_type text NOT NULL CHECK (data_type IN
        ('text', 'number', 'date', 'boolean', 'user', 'single_select', 'multi_select')),
    help_text text NOT NULL DEFAULT '',
    max_text_length integer CHECK (max_text_length BETWEEN 1 AND 10000),
    min_number numeric,
    max_number numeric,
    revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
    archived_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (min_number IS NULL OR max_number IS NULL OR min_number <= max_number),
    CHECK (data_type = 'text' OR max_text_length IS NULL),
    CHECK (data_type = 'number' OR (min_number IS NULL AND max_number IS NULL)),
    UNIQUE (project_id, key),
    UNIQUE (project_id, id),
    UNIQUE (project_id, id, data_type)
);

-- A definition may be attached to many types. Required/order vary by type.
CREATE TABLE issue_type_fields (
    project_id uuid NOT NULL,
    issue_type_id uuid NOT NULL,
    field_id uuid NOT NULL,
    data_type text NOT NULL,
    is_required boolean NOT NULL DEFAULT false,
    display_order integer NOT NULL DEFAULT 0 CHECK (display_order >= 0),
    revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
    archived_at timestamptz,
    PRIMARY KEY (project_id, issue_type_id, field_id),
    UNIQUE (project_id, issue_type_id, field_id, data_type),
    FOREIGN KEY (project_id, issue_type_id) REFERENCES issue_types(project_id, id),
    FOREIGN KEY (project_id, field_id, data_type)
        REFERENCES field_definitions(project_id, id, data_type)
);

CREATE TABLE field_options (
    id uuid PRIMARY KEY,
    project_id uuid NOT NULL,
    field_id uuid NOT NULL,
    data_type text NOT NULL CHECK (data_type IN ('single_select', 'multi_select')),
    key text NOT NULL CHECK (key ~ '^[a-z][a-z0-9_]{0,63}$'),
    label text NOT NULL CHECK (char_length(btrim(label)) BETWEEN 1 AND 100),
    display_order integer NOT NULL DEFAULT 0 CHECK (display_order >= 0),
    revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
    archived_at timestamptz,
    UNIQUE (project_id, field_id, key),
    UNIQUE (project_id, field_id, id),
    FOREIGN KEY (project_id, field_id, data_type)
        REFERENCES field_definitions(project_id, id, data_type)
);

-- Revision for the entire shared ordering within one project/status.
CREATE TABLE project_status_order (
    project_id uuid NOT NULL REFERENCES projects(id),
    status text NOT NULL CHECK (status IN ('todo', 'in_progress', 'review', 'done')),
    revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
    PRIMARY KEY (project_id, status)
);

CREATE TABLE issues (
    id uuid PRIMARY KEY,
    project_id uuid NOT NULL REFERENCES projects(id),
    number bigint NOT NULL CHECK (number > 0),
    issue_type_id uuid NOT NULL,
    hierarchy_kind text NOT NULL CHECK (hierarchy_kind IN ('standard', 'subtask')),
    parent_issue_id uuid,
    title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
    description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 10000),
    status text NOT NULL DEFAULT 'todo'
        CHECK (status IN ('todo', 'in_progress', 'review', 'done')),
    priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
    reporter_id uuid NOT NULL REFERENCES users(id),
    assignee_id uuid REFERENCES users(id),
    due_date date,
    rank numeric(38,18) NOT NULL,
    revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (project_id, number),
    UNIQUE (project_id, id),
    UNIQUE (project_id, id, issue_type_id),
    CHECK (parent_issue_id IS DISTINCT FROM id),
    CHECK ((hierarchy_kind = 'subtask') = (parent_issue_id IS NOT NULL)),
    FOREIGN KEY (project_id, issue_type_id, hierarchy_kind)
        REFERENCES issue_types(project_id, id, hierarchy_kind),
    FOREIGN KEY (project_id, parent_issue_id) REFERENCES issues(project_id, id),
    FOREIGN KEY (project_id, status) REFERENCES project_status_order(project_id, status)
);
-- Public identifier is projects.key || '-' || issues.number, e.g. GGJ-42.
-- Subtasks are ordinary rows linked to a parent; no separate subtasks table.

-- Exactly one scalar value, or a multi-select marker with separate option rows.
-- No row means unset. False and zero are legitimate values, not unset values.
-- Redundant project/type/data_type columns enable enforceable composite FKs.
CREATE TABLE issue_field_values (
    project_id uuid NOT NULL,
    issue_id uuid NOT NULL,
    issue_type_id uuid NOT NULL,
    field_id uuid NOT NULL,
    data_type text NOT NULL,
    text_value text CHECK (char_length(text_value) <= 10000),
    number_value numeric,
    date_value date,
    boolean_value boolean,
    user_value uuid REFERENCES users(id),
    option_value uuid,
    PRIMARY KEY (project_id, issue_id, field_id),
    UNIQUE (project_id, issue_id, issue_type_id, field_id, data_type),
    FOREIGN KEY (project_id, issue_id, issue_type_id)
        REFERENCES issues(project_id, id, issue_type_id) DEFERRABLE INITIALLY IMMEDIATE,
    FOREIGN KEY (project_id, issue_type_id, field_id, data_type)
        REFERENCES issue_type_fields(project_id, issue_type_id, field_id, data_type),
    FOREIGN KEY (project_id, field_id, option_value)
        REFERENCES field_options(project_id, field_id, id),
    CHECK (
        (data_type = 'multi_select' AND
            num_nonnulls(text_value, number_value, date_value, boolean_value, user_value, option_value) = 0)
        OR
        (num_nonnulls(text_value, number_value, date_value, boolean_value, user_value, option_value) = 1 AND (
            (data_type = 'text' AND text_value IS NOT NULL) OR
            (data_type = 'number' AND number_value IS NOT NULL) OR
            (data_type = 'date' AND date_value IS NOT NULL) OR
            (data_type = 'boolean' AND boolean_value IS NOT NULL) OR
            (data_type = 'user' AND user_value IS NOT NULL) OR
            (data_type = 'single_select' AND option_value IS NOT NULL)
        ))
    )
);

CREATE TABLE issue_field_selections (
    project_id uuid NOT NULL,
    issue_id uuid NOT NULL,
    issue_type_id uuid NOT NULL,
    field_id uuid NOT NULL,
    data_type text NOT NULL DEFAULT 'multi_select' CHECK (data_type = 'multi_select'),
    option_id uuid NOT NULL,
    PRIMARY KEY (project_id, issue_id, field_id, option_id),
    FOREIGN KEY (project_id, issue_id, issue_type_id, field_id, data_type)
        REFERENCES issue_field_values(project_id, issue_id, issue_type_id, field_id, data_type)
        ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (project_id, field_id, option_id)
        REFERENCES field_options(project_id, field_id, id)
);
-- Replacing/clearing current field values is permitted; retain their previous
-- values in activity_events. It does not permanently delete an issue.

CREATE TABLE labels (
    id uuid PRIMARY KEY,
    project_id uuid NOT NULL REFERENCES projects(id),
    name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 40 AND name = btrim(name)),
    created_by uuid NOT NULL REFERENCES users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (project_id, id)
);
CREATE UNIQUE INDEX label_names_unique ON labels (project_id, lower(name));

CREATE TABLE issue_labels (
    project_id uuid NOT NULL,
    issue_id uuid NOT NULL,
    label_id uuid NOT NULL,
    PRIMARY KEY (project_id, issue_id, label_id),
    FOREIGN KEY (project_id, issue_id) REFERENCES issues(project_id, id),
    FOREIGN KEY (project_id, label_id) REFERENCES labels(project_id, id)
);

CREATE TABLE issue_dependencies (
    project_id uuid NOT NULL,
    dependent_issue_id uuid NOT NULL,
    blocking_issue_id uuid NOT NULL,
    created_by uuid NOT NULL REFERENCES users(id),
    removed_by uuid REFERENCES users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    removed_at timestamptz,
    revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
    PRIMARY KEY (project_id, dependent_issue_id, blocking_issue_id),
    CHECK (dependent_issue_id <> blocking_issue_id),
    CHECK ((removed_at IS NULL) = (removed_by IS NULL)),
    FOREIGN KEY (project_id, dependent_issue_id) REFERENCES issues(project_id, id),
    FOREIGN KEY (project_id, blocking_issue_id) REFERENCES issues(project_id, id)
);
-- One directed row supports both Blocks and Blocked By views. Removed/re-added
-- relationships retain every change in activity_events. Cycles need service checks.

CREATE TABLE boards (
    id uuid PRIMARY KEY,
    project_id uuid NOT NULL REFERENCES projects(id),
    name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
    created_by uuid NOT NULL REFERENCES users(id),
    is_default boolean NOT NULL DEFAULT false,
    saved_filters jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(saved_filters) = 'object'),
    revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
    archived_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (project_id, id),
    CHECK (NOT is_default OR (archived_at IS NULL AND saved_filters = '{}'::jsonb))
);
CREATE UNIQUE INDEX board_names_unique ON boards (project_id, lower(name));
CREATE UNIQUE INDEX one_default_board ON boards (project_id) WHERE is_default;
-- This guarantees at most one default; creation service guarantees exactly one.
-- No board_cards: boards query existing issues and share issues.rank.

CREATE TABLE board_wip_limits (
    project_id uuid NOT NULL,
    board_id uuid NOT NULL,
    status text NOT NULL CHECK (status IN ('in_progress', 'review')),
    warning_limit integer NOT NULL CHECK (warning_limit BETWEEN 1 AND 1000),
    PRIMARY KEY (project_id, board_id, status),
    FOREIGN KEY (project_id, board_id) REFERENCES boards(project_id, id)
);
-- WIP edits compare/increment boards.revision. Absence means no warning limit.

CREATE TABLE pictures (
    id uuid PRIMARY KEY,
    project_id uuid NOT NULL,
    issue_id uuid NOT NULL,
    uploaded_by uuid NOT NULL REFERENCES users(id),
    storage_object_key text NOT NULL UNIQUE,
    filename text NOT NULL CHECK (btrim(filename) <> ''),
    description text NOT NULL CHECK (char_length(btrim(description)) BETWEEN 1 AND 200),
    mime_type text NOT NULL CHECK (mime_type IN ('image/png', 'image/jpeg', 'image/webp')),
    byte_size bigint NOT NULL CHECK (byte_size BETWEEN 1 AND 10485760),
    state text NOT NULL CHECK (state IN ('draft', 'published')),
    in_gallery boolean NOT NULL DEFAULT false,
    uploaded_at timestamptz NOT NULL DEFAULT now(),
    published_at timestamptz,
    draft_expires_at timestamptz,
    UNIQUE (project_id, issue_id, id),
    FOREIGN KEY (project_id, issue_id) REFERENCES issues(project_id, id),
    CHECK (NOT in_gallery OR state = 'published'),
    CHECK (
        (state = 'draft' AND published_at IS NULL AND
            draft_expires_at IS NOT NULL AND draft_expires_at = uploaded_at + interval '24 hours')
        OR
        (state = 'published' AND published_at IS NOT NULL AND draft_expires_at IS NULL)
    )
);

CREATE TABLE comments (
    id uuid PRIMARY KEY,
    project_id uuid NOT NULL,
    issue_id uuid NOT NULL,
    author_id uuid NOT NULL REFERENCES users(id),
    revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    edited_at timestamptz,
    UNIQUE (project_id, issue_id, id),
    FOREIGN KEY (project_id, issue_id) REFERENCES issues(project_id, id)
);

-- Immutable versions preserve prior HTML, mentions, direction, and pictures.
CREATE TABLE comment_versions (
    project_id uuid NOT NULL,
    issue_id uuid NOT NULL,
    comment_id uuid NOT NULL,
    version bigint NOT NULL CHECK (version > 0),
    safe_html text NOT NULL CHECK (octet_length(safe_html) <= 65536),
    plain_text text NOT NULL CHECK (char_length(plain_text) <= 5000),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (project_id, issue_id, comment_id, version),
    FOREIGN KEY (project_id, issue_id, comment_id)
        REFERENCES comments(project_id, issue_id, id)
);
-- Paragraph-level dir="rtl"/"ltr" survives in sanitized HTML, rather than
-- forcing a direction on the entire bilingual comment.
ALTER TABLE comments ADD CONSTRAINT comments_current_version_fk
    FOREIGN KEY (project_id, issue_id, id, revision)
        REFERENCES comment_versions(project_id, issue_id, comment_id, version)
        DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE comment_version_pictures (
    project_id uuid NOT NULL,
    issue_id uuid NOT NULL,
    comment_id uuid NOT NULL,
    version bigint NOT NULL,
    picture_id uuid NOT NULL,
    PRIMARY KEY (project_id, issue_id, comment_id, version, picture_id),
    FOREIGN KEY (project_id, issue_id, comment_id, version)
        REFERENCES comment_versions(project_id, issue_id, comment_id, version),
    FOREIGN KEY (project_id, issue_id, picture_id) REFERENCES pictures(project_id, issue_id, id)
);

CREATE TABLE comment_version_mentions (
    project_id uuid NOT NULL,
    issue_id uuid NOT NULL,
    comment_id uuid NOT NULL,
    version bigint NOT NULL,
    mentioned_user_id uuid NOT NULL REFERENCES users(id),
    PRIMARY KEY (project_id, issue_id, comment_id, version, mentioned_user_id),
    FOREIGN KEY (project_id, issue_id, comment_id, version)
        REFERENCES comment_versions(project_id, issue_id, comment_id, version)
);

CREATE TABLE activity_events (
    id uuid PRIMARY KEY,
    actor_id uuid NOT NULL REFERENCES users(id),
    project_id uuid REFERENCES projects(id),
    issue_id uuid,
    resource_kind text NOT NULL,
    resource_key text NOT NULL,
    action text NOT NULL,
    channel text NOT NULL CHECK (channel IN ('web', 'mcp')),
    changes jsonb NOT NULL CHECK (jsonb_typeof(changes) = 'object'),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (project_id, id),
    CHECK (issue_id IS NULL OR project_id IS NOT NULL),
    FOREIGN KEY (project_id, issue_id) REFERENCES issues(project_id, id)
);
-- Append-only via database grants/application role. Payloads use validated,
-- versioned event structures; never include credentials or private inbox content.

CREATE TABLE notifications (
    id uuid PRIMARY KEY,
    recipient_id uuid NOT NULL REFERENCES users(id),
    event_id uuid NOT NULL,
    project_id uuid NOT NULL,
    issue_id uuid NOT NULL,
    summary text NOT NULL,
    read_at timestamptz,
    revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (recipient_id, event_id, issue_id),
    FOREIGN KEY (project_id, event_id) REFERENCES activity_events(project_id, id),
    FOREIGN KEY (project_id, issue_id) REFERENCES issues(project_id, id)
);

CREATE TABLE notification_reasons (
    notification_id uuid NOT NULL REFERENCES notifications(id),
    reason text NOT NULL CHECK (reason IN ('mention', 'comment', 'assignment', 'status', 'dependency')),
    PRIMARY KEY (notification_id, reason)
);
-- Actor/time come from event_id. A recipient with multiple roles receives one
-- notification with multiple reasons. Counts must join current project access.

CREATE TABLE idempotency_records (
    user_id uuid NOT NULL REFERENCES users(id),
    request_reference text NOT NULL CHECK (char_length(request_reference) BETWEEN 1 AND 200),
    operation text NOT NULL,
    request_hash bytea NOT NULL,
    result jsonb NOT NULL CHECK (jsonb_typeof(result) = 'object'),
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    PRIMARY KEY (user_id, request_reference),
    CHECK (expires_at >= created_at + interval '24 hours')
);
-- Hash includes operation + canonical validated arguments; channel is excluded
-- so the same caller can retry one logical command across web and MCP.
-- Store only committed results; concurrent retries wait on the unique key.
-- Replay rechecks current access to every referenced resource.

-- Initial indexes: choose additional ones from real query plans/workloads.
CREATE INDEX issues_board_order ON issues (project_id, status, rank, id);
CREATE INDEX issues_updated ON issues (project_id, updated_at DESC, id DESC);
CREATE INDEX issues_my_work ON issues (assignee_id, updated_at DESC, id DESC)
    WHERE assignee_id IS NOT NULL;
CREATE INDEX issues_type ON issues (project_id, issue_type_id, updated_at DESC, id DESC);
CREATE INDEX issues_parent ON issues (project_id, parent_issue_id, id)
    WHERE parent_issue_id IS NOT NULL;
CREATE INDEX issues_open_due_date ON issues (project_id, due_date, id)
    WHERE due_date IS NOT NULL AND status <> 'done';
CREATE INDEX issue_labels_by_label ON issue_labels (project_id, label_id, issue_id);
CREATE INDEX dependencies_active ON issue_dependencies (project_id, dependent_issue_id, blocking_issue_id)
    WHERE removed_at IS NULL;
CREATE INDEX dependencies_reverse ON issue_dependencies (project_id, blocking_issue_id, dependent_issue_id)
    WHERE removed_at IS NULL;
CREATE INDEX comments_by_issue ON comments (project_id, issue_id, created_at, id);
CREATE INDEX pictures_by_issue ON pictures (project_id, issue_id, uploaded_at, id);
CREATE INDEX draft_picture_expiration ON pictures (draft_expires_at) WHERE state = 'draft';
CREATE INDEX events_by_resource ON activity_events (project_id, resource_kind, resource_key, created_at, id);
CREATE INDEX events_by_issue ON activity_events (project_id, issue_id, created_at, id);
CREATE INDEX events_company_history ON activity_events (created_at, id);
CREATE INDEX notifications_inbox ON notifications (recipient_id, created_at DESC, id DESC);
CREATE INDEX notifications_unread ON notifications (recipient_id, created_at DESC, id DESC)
    WHERE read_at IS NULL;
CREATE INDEX retry_expiration ON idempotency_records (expires_at);
CREATE INDEX field_values_number ON issue_field_values (project_id, field_id, number_value, issue_id)
    WHERE data_type = 'number';
CREATE INDEX field_values_date ON issue_field_values (project_id, field_id, date_value, issue_id)
    WHERE data_type = 'date';
CREATE INDEX field_values_option ON issue_field_values (project_id, field_id, option_value, issue_id)
    WHERE data_type = 'single_select';
CREATE INDEX field_selections_option ON issue_field_selections (project_id, field_id, option_id, issue_id);

-- Enable after confirming extension support/permissions in the chosen environment:
-- CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- CREATE INDEX issues_title_search ON issues USING gin (title gin_trgm_ops);
-- This serves the spec's case-insensitive title substring search (ILIKE).
-- Short search strings may still scan: retain bounded results and measure queries.

-- EXAMPLE CONFIGURATION (data illustration, not seed commands):
-- issue_types: Bug (standard), Feature (standard), Support (standard), Subtask.
-- field_definitions:
--   environment -> single_select -> development / staging / production
--   reproduction_steps -> text; estimate_hours -> number; customer -> text
-- issue_type_fields:
--   Bug -> environment required, reproduction_steps required
--   Feature -> estimate_hours optional
--   Support -> customer required, environment optional
-- issue_field_values:
--   GGJ-42 / Bug / environment -> production option UUID
--   GGJ-42 / Bug / reproduction_steps -> 'Open the login page ...'
-- All remain ordinary issues. Creating another type or field inserts metadata
-- rows; it does not run ALTER TABLE or add a per-type table.
