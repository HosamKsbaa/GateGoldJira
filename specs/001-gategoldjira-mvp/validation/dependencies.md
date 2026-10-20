# Local dependency checkpoint

Verified 2026-10-12 on isolated PostgreSQL 18.6 databases, official Go MCP SDK clients and Chromium. Tasks T074–T081 are complete for the local story.

- Sixteen combined browser acceptance cases passed. The dependency flows select a same-project issue assigned to another developer, expose reciprocal Blocked By/Blocks summaries, guard Done, complete/reopen blockers without changing the dependent's status, remove links, reject cycles, and preserve the selected blocker while reviewing a stale graph.
- PostgreSQL race tests prove a pair of concurrent cycle-forming links cannot both commit, and a Done move racing an unfinished blocker cannot create an invalid completed issue. Self-links, foreign projects, Viewer mutations, stale graph versions and cycles through parent/subtask edges are rejected.
- Duplicate active adds and already-removed relationships are no-ops with no event. Removal retains a tombstone; re-add continues its revision. Add/remove results and original event identities replay across the actual MCP/REST adapters, with current permission checks before replay.
- Both relationship directions traverse all unchanged pages once. Reads batch issue projections and use a consistent graph snapshot; changed graph cursors require reloading. Current conflict records contain the authorized Issue or Dependency, including a removed relationship's current revision.
- All 31 registered routes and typed payloads match the current catalog subset. Full Go race/vet checks, generated drift, feature boundaries, strict Angular application/template/test compilation and 35 frontend unit cases passed. A stale UI request cannot publish an earlier identity's conflict into newer protected state.
- Production Angular output is 737 kB initial raw / 158 kB estimated transfer. The existing 600 kB warning remains for final optimization; the 1 MB hard limit passes.

Local application state is retained in PostgreSQL; no Auth0 tenant or Google Cloud resource was provisioned. The remaining MVP stories and external assistant/OAuth/cloud/usability/performance/recovery gates are still pending.
