-- +goose Up
ALTER TABLE project_status_order ADD COLUMN retired boolean NOT NULL DEFAULT false;
ALTER TABLE boards DROP CONSTRAINT boards_workflow_check;
ALTER TABLE boards ADD CONSTRAINT boards_workflow_check CHECK (CASE WHEN jsonb_typeof(workflow->'columns')='array' THEN jsonb_array_length(workflow->'columns')>=2 ELSE false END);
-- Stage identities remain available to old audit events and order receipts.
-- +goose Down
-- +goose StatementBegin
DO $$ BEGIN RAISE EXCEPTION 'Retired stage identities require a forward-compatible rollback'; END $$;
-- +goose StatementEnd
