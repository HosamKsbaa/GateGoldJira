#!/usr/bin/env python3
"""Owner-only initial database setup; receive new credentials on private stdin."""
import base64
import hashlib
import hmac
import json
import os
from pathlib import Path
import subprocess
import sys


def run_sql(sql, database='postgres'):
    result = subprocess.run(['runuser', '-u', 'postgres', '--', 'psql', '-X', '-q', '-A', '-t',
                             '-v', 'ON_ERROR_STOP=1', '--dbname=' + database], input=sql,
                            text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode:
        raise RuntimeError('Database owner operation failed; inspect private PostgreSQL diagnostics.')
    return result.stdout.strip()


def scram(password):
    salt = os.urandom(16)
    salted = hashlib.pbkdf2_hmac('sha256', password.encode(), salt, 4096)
    client = hmac.new(salted, b'Client Key', 'sha256').digest()
    stored = hashlib.sha256(client).digest()
    server = hmac.new(salted, b'Server Key', 'sha256').digest()
    encode = lambda value: base64.b64encode(value).decode()
    return 'SCRAM-SHA-256$4096:' + encode(salt) + '$' + encode(stored) + ':' + encode(server)


def main():
    if os.geteuid() != 0:
        raise RuntimeError('Run through the authorized database owner.')
    config = json.load(sys.stdin)
    if run_sql("SELECT datname FROM pg_database WHERE datname='gategoldjira'"):
        raise RuntimeError('GateGoldJira database already exists; initial provisioning will not replace it.')
    for role, key, limit in [('gategoldjira_migrator', 'migrationPassword', 3), ('gategoldjira_app', 'runtimePassword', 10)]:
        if run_sql("SELECT rolname FROM pg_roles WHERE rolname='" + role + "'"):
            raise RuntimeError('A GateGoldJira role already exists; inspect before provisioning.')
        password = config[key]
        if not isinstance(password, str) or len(password) < 32:
            raise RuntimeError('Use new strong database credentials.')
        hashed = scram(password)
        run_sql(f"CREATE ROLE {role} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT {limit} PASSWORD '{hashed}';")
    run_sql("CREATE DATABASE gategoldjira OWNER gategoldjira_migrator; REVOKE ALL ON DATABASE gategoldjira FROM PUBLIC; GRANT CONNECT ON DATABASE gategoldjira TO gategoldjira_app;")
    run_sql("REVOKE CREATE ON SCHEMA public FROM PUBLIC; GRANT USAGE ON SCHEMA public TO gategoldjira_app;", 'gategoldjira')
    run_sql("ALTER ROLE gategoldjira_app SET statement_timeout='30s'; ALTER ROLE gategoldjira_app SET lock_timeout='5s';")
    hba = Path('/etc/postgresql/16/main/pg_hba.conf')
    before = hba.read_text()
    include = "include_if_exists 'gategoldjira-hba.conf'"
    rules = (
        'hostssl gategoldjira gategoldjira_app,gategoldjira_migrator 10.30.0.10/32 scram-sha-256\n'
        'host all gategoldjira_app,gategoldjira_migrator 0.0.0.0/0 reject\n'
        'host all gategoldjira_app,gategoldjira_migrator ::/0 reject\n'
    )
    (hba.parent / 'gategoldjira-hba.conf').write_text(rules)
    if include not in before:
        (hba.parent / 'pg_hba.conf.before-gategoldjira').write_text(before)
        hba.write_text(include + '\n' + before)
    errors = run_sql('SELECT count(*) FROM pg_hba_file_rules WHERE error IS NOT NULL')
    if errors != '0':
        hba.write_text(before)
        raise RuntimeError('PostgreSQL access-rule validation failed; prior rules restored.')
    run_sql('SELECT pg_reload_conf()')
    print(json.dumps({'database': 'gategoldjira', 'runtimeRole': 'gategoldjira_app', 'tlsRequired': True, 'publicDatabaseAccess': False}))


if __name__ == '__main__':
    main()
