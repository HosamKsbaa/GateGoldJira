-- Operator-reviewed grants for an isolated target only. Run with the initial
-- Cloud SQL database administrator, after the two IAM database users exist.
-- psql -v migration_db_user='...@PROJECT.iam' -v runtime_db_user='...@PROJECT.iam'
-- Bootstrap first, migrate under the migration identity, then run runtime-grants.sql.
SELECT format('GRANT CONNECT ON DATABASE %I TO %I, %I', current_database(), :'migration_db_user', :'runtime_db_user') \gexec
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
SELECT format('GRANT USAGE, CREATE ON SCHEMA public TO %I', :'migration_db_user') \gexec
SELECT format('GRANT USAGE ON SCHEMA public TO %I', :'runtime_db_user') \gexec
