# Baseline and preservation

Date: 2026-10-13. Applied database migration: 00010.

Private database and source archives are under ignored `.local/backups/`, with restricted permissions. No working project was reseeded. Existing feature 001 artifacts were preserved; active Spec Kit feature is 002.

Requirements checklist: 9/9 passed (requirements quality, not implementation acceptance). No extension hooks are configured. Pinned tools and existing ignore files cover caches, local credentials, build outputs and test data. Backend PostgreSQL and frontend type baselines are running; results will be recorded after completion.

Completed baseline: the unchanged complete backend suite passed against real isolated PostgreSQL databases, including numeric/key parity, project/graph/retry guards and contract schemas. Strict Angular application and test type checks both passed. Workload/restore suites correctly skipped their opt-in external runs; no hosted acceptance was inferred.
