# GateGoldJira on the existing Homes VMs

This is a separate application in Google Cloud project `homes-eg-2657`, zone `europe-west1-b`. It uses no Cloud SQL instance and does not deploy the Homes repository. Owner operations use `hosamchakasba@gmail.com`, OS Login and IAP. Keep the Homes live/development releases, access gate, private database network and shared `/run/homes-deploy.lock` intact.

The temporary site is `https://jira.34.62.68.230.sslip.io`. This hostname depends on the external sslip.io DNS service and the web VM's public address. Replace it with a company-controlled domain when available. Caddy obtains and renews its own hostname certificate; the existing Homes IP certificate stays separate.

`homes-web` runs an immutable native Go executable under the unprivileged `gategoldjira` system user, with a 512 MiB service memory limit. Caddy serves the independently built Angular site and proxies the API/MCP/OAuth to loopback port 21081 or 21082. Native production PostgreSQL connections require `sslmode=verify-full` and the pinned Homes database CA. `homes-db` hosts the separate `gategoldjira` database, `gategoldjira_app` runtime role (10 connections) and `gategoldjira_migrator` schema-owner role (3 connections). Narrow PostgreSQL access rules deny these roles access to other hosted databases.

## Password accounts

Hosted password authentication is explicit `APP_ENV=production`, `DEPLOYMENT_TARGET=vm`, `AUTH_MODE=password`. Development credentials and fixture endpoints remain unavailable. Password hashes use bcrypt; sign-in is rate/concurrency limited and creates a one-hour REST-only token kept in browser memory. Reloading or signing out clears the browser session. Current account approval and project roles are checked independently on every call. MCP has separate revocable OAuth or personal credentials.

Approve the employee's exact email through Company users and grant project membership. The owner then runs the release executable's `password-account --username USER --email EMAIL`, sending a new 16–72 byte password through stdin. Set `APP_ENV=production DEPLOYMENT_TARGET=vm AUTH_MODE=password PASSWORD_CREDENTIALS_FILE=/etc/gategoldjira/identity/accounts.json` for that owner command. Do not put passwords in arguments or logs. The credential directory must be private, the file is replaced atomically, and rotation preserves username/subject/email. Restart the active GateGoldJira service after provisioning. This operator-managed mode supports up to 50 accounts; self-registration, email invitations and browser password reset are not implemented.

Signing keys, bcrypt records, cursor keys and database passwords stay in root-only configuration. systemd passes the identity files through `LoadCredential`. Preserve the private operator recovery copy; database backups do not contain these filesystem credentials. Never put the recovery bundle in Git, a public artifact, or the Homes backup bucket.

## Release and verification

Build and test locally through the project's storage guard. Prepare an archive containing only the executable, static site, source manifest and checksum manifest. `infra/compute/deploy.py` deploys that already-built archive using a private settings file; secrets travel through encrypted SSH stdin. It verifies VM identity and archive/file checksums, applies migrations under the separate migration role, bootstraps the initial approved administrator without fixture seeding, reapplies runtime grants, takes a private database backup, starts and probes an inactive API port, validates Caddy, then changes only the GateGoldJira site. A failed candidate restores the prior routing. Retain the previous release for application rollback; do not reverse schema migrations over company data.

The active receipt is `/opt/gategoldjira/active.json`; prior state is `previous.json`. After deployment verify trusted HTTPS, failed and successful password login, `/api/v1/me`, protected REST reads, MCP discovery and public denial of operational/fixture routes. Recheck Homes live pages and the unauthenticated `/dev` access gate after Caddy work. No test fixture or integration/browser suite runs against hosted databases.

## Data and backups

Private uploaded files persist under `/var/lib/gategoldjira/pictures` on the web VM; they are user data and must never be pruned as caches. Daily native PostgreSQL dumps use the existing DB VM object-creator identity and private backup bucket, with upload size/checksum verification and a separate GateGoldJira timer. These database dumps do not back up uploaded files. Before a web-VM replacement, take an operator-managed private file backup and preserve root-only identity/runtime configuration. A paired database/file restore has not been verified for this new VM target.

No local database, identity, upload directory or retained verification proof is replaced during deployment. Heavy local commands continue to use the standard storage guard and retention limits.
