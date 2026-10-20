-- Apply as the schema owner after migration 18. Runtime cannot alter schema,
-- delete business rows, edit retained history or delete published object bytes.
SELECT format('GRANT SELECT, INSERT ON personal_mcp_tokens TO %I', :'runtime_db_user') \gexec
SELECT format('GRANT UPDATE(last_used_at, revoked_at) ON personal_mcp_tokens TO %I', :'runtime_db_user') \gexec
SELECT format('GRANT SELECT, INSERT ON personal_mcp_token_activity TO %I', :'runtime_db_user') \gexec
SELECT format('GRANT UPDATE(outcome, error_code, resource_url, completed_at, duration_ms) ON personal_mcp_token_activity TO %I', :'runtime_db_user') \gexec
SELECT format('GRANT SELECT ON company_settings,users,user_identities,projects,project_memberships,workflow_stages,workflows,workflow_transitions,issue_types,priorities,issue_type_workflows,issue_records,issues,board_records,boards,board_columns,board_column_stages,board_issue_ranks,project_status_order,labels,issue_labels,issue_dependencies,attachments,upload_reservations,compatible_pictures,compatible_attachments,pictures,attachment_upload_reservations,picture_upload_reservations,comment_version_pictures,comments,comment_versions,comment_version_attachments,comment_version_mentions,activity_events,notifications,idempotency_records,issue_watchers,issue_links,saved_issue_searches,planning_items,planning_issue,planning_status_events,planning_completion_cycles,issue_import_sources,development_links,assignment_rule_records,project_assignment_rules,notification_preferences,notification_deliveries,notification_due_events,field_definitions,field_options,issue_field_values,transition_required_fields,issue_approvals TO %I', :'runtime_db_user') \gexec
SELECT format('GRANT INSERT, UPDATE ON users, projects, project_memberships, issue_records, board_records, issues, boards, project_status_order, issue_dependencies, comments, notifications, idempotency_records TO %I', :'runtime_db_user') \gexec
SELECT format('GRANT INSERT ON user_identities, labels, issue_labels, issue_watchers, issue_links, saved_issue_searches, comments, comment_versions, comment_version_attachments, comment_version_mentions, activity_events, notifications, idempotency_records TO %I', :'runtime_db_user') \gexec
SELECT format('GRANT DELETE ON issue_labels, idempotency_records, upload_reservations TO %I', :'runtime_db_user') \gexec
SELECT format('GRANT UPDATE(singleton) ON company_settings TO %I', :'runtime_db_user') \gexec
SELECT format('GRANT UPDATE(in_gallery) ON pictures TO %I', :'runtime_db_user') \gexec
SELECT format('GRANT UPDATE(attached) ON compatible_attachments TO %I', :'runtime_db_user') \gexec
SELECT format('GRANT UPDATE(watching, updated_at) ON issue_watchers TO %I', :'runtime_db_user') \gexec
SELECT format('GRANT UPDATE(removed_at) ON issue_links TO %I', :'runtime_db_user') \gexec
SELECT format('GRANT UPDATE(name, filters, revision, removed, updated_at) ON saved_issue_searches TO %I', :'runtime_db_user') \gexec
SELECT format('GRANT INSERT ON assignment_rule_records, planning_items, planning_issue, issue_import_sources, development_links, project_assignment_rules, notification_preferences, notification_deliveries, notification_due_events TO %I', :'runtime_db_user') \gexec
SELECT format('GRANT UPDATE(name, description, target_date, status, revision, updated_at) ON planning_items TO %I', :'runtime_db_user') \gexec
SELECT format('GRANT UPDATE(epic_id, release_id, revision) ON planning_issue TO %I', :'runtime_db_user') \gexec
SELECT format('GRANT UPDATE(url, title, kind, removed, revision, updated_at) ON development_links TO %I', :'runtime_db_user') \gexec
SELECT format('GRANT UPDATE(name, stage, stage_id, assignee_id, enabled, revision, updated_at) ON project_assignment_rules TO %I', :'runtime_db_user') \gexec
SELECT format('GRANT UPDATE(in_app_enabled, events, email_mode, due_reminders, revision, updated_at) ON notification_preferences TO %I', :'runtime_db_user') \gexec
SELECT format('GRANT UPDATE(state, attempts, available_at, completed_at) ON notification_deliveries TO %I', :'runtime_db_user') \gexec
SELECT format('GRANT INSERT, UPDATE ON workflows, workflow_stages, workflow_transitions, issue_types, priorities, issue_type_workflows TO %I', :'runtime_db_user') \gexec
SELECT format('GRANT INSERT, UPDATE, DELETE ON board_columns, board_column_stages, board_issue_ranks TO %I', :'runtime_db_user') \gexec
SELECT format('GRANT INSERT, UPDATE ON field_definitions, field_options, issue_field_values, transition_required_fields TO %I', :'runtime_db_user') \gexec
SELECT format('GRANT DELETE ON issue_field_values, transition_required_fields TO %I', :'runtime_db_user') \gexec
SELECT format('GRANT INSERT ON issue_approvals, attachments, upload_reservations TO %I', :'runtime_db_user') \gexec
SELECT format('GRANT UPDATE(state, in_panel, published_key, published_generation, published_at) ON attachments TO %I', :'runtime_db_user') \gexec
SELECT format('GRANT UPDATE(staging_generation, published_key, published_generation, checksum, lease_until, state, expected_bytes, received_bytes, filename, description, mime_type, publication, storage_session, last_chunk_hash, updated_at) ON upload_reservations TO %I', :'runtime_db_user') \gexec
SELECT format('GRANT UPDATE(name, stage_id, assignee_id, enabled, revision, updated_at) ON assignment_rule_records TO %I', :'runtime_db_user') \gexec

-- Local OAuth protocol storage; unused by managed production authorization.
SELECT format('GRANT SELECT, INSERT ON mcp_oauth_authorizations, mcp_oauth_credentials TO %I', :'runtime_db_user') \gexec
SELECT format('GRANT UPDATE(consumed_at) ON mcp_oauth_authorizations TO %I', :'runtime_db_user') \gexec
SELECT format('GRANT UPDATE(code_used, access_removed, refresh_used) ON mcp_oauth_credentials TO %I', :'runtime_db_user') \gexec
