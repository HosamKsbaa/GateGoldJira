# Local project checkpoint

Verified 2026-10-12 with PostgreSQL 18.6, Go race checks and Chromium.

- Five combined account/project browser cases passed against an isolated, migrated database and real local RS256 access tokens.
- Create/edit, immutable normalized keys, Arabic/plain-text descriptions, default All Issues board, membership administration while archived, restore and Viewer restrictions passed.
- Project service and transport checks passed, including concurrent archive/edit, preserved issues and memberships, pagination and cross-channel retry identity.
- Generated OpenAPI/SQL/TypeScript drift and feature import boundaries passed. Strict production Angular build passed; its 715 kB initial bundle exceeds the 600 kB warning budget and remains below the 1 MB hard limit. Optimization remains part of final verification.
- A browser-discovered timestamp mismatch now has a real PostgreSQL regression: pgx decodes instants in UTC even on a Cairo-time machine. Required nullable values and decimal-string revisions retain their wire representation.

Auth0 tenant, deployed Google Cloud behavior and actual assistant acceptance remain unverified. This checkpoint covers local projects, not the full MVP.
