# Development links and stage assignment rules

This feature stores manual pull-request/commit/other issue links and one optional assignment rule per project stage. It introduces no external webhook, provider credential or network request. REST and MCP adapters invoke the same typed services with current authorization, revision CAS, caller-scoped retries and attributable audit.

Development links use stable caller-generated IDs. Revision 0 creates; positive revisions edit/remove. URL validation permits absolute HTTP/HTTPS with a host and rejects userinfo, control characters and unsupported schemes. Removal retains a tombstone; ordinary lists show current links in creation/ID order. Current project readers can list links, while active-project writers can change links on active issues.

Rule configuration is Administrator-only. An enabled rule requires a registered project stage and eligible active approved assignee; a partial unique index permits one enabled rule per stage. Disabled records may retain a retired stage or ineligible assignee for cleanup. Rules use name/ID pages with signed actor-bound cursors.

`ApplyStageRule` receives the existing `command.Mutation`. The application injects it through `issues.Service.WithStageRule` to avoid feature-to-feature imports. Issues call it after normal create/move workflow and prerequisite guards in the same transaction. Pending backlog creation defers application until activation. The callback rechecks eligible assignee, skips absent/inactive/ineligible/same-assignee rules, and atomically updates assignment revision, audit attribution and assignment notification when a real change occurs. It never starts a nested command or changes completion guards. Retry replay cannot apply a rule twice.

Focused verification:

```sh
source ../scripts/tool-env.sh
TEST_DATABASE_URL='postgres://gategoldjira:local-development-only@127.0.0.1:54329/gategoldjira?sslmode=disable' REQUIRE_POSTGRES_TESTS=1 go test -race -count=1 ./internal/features/integrations
```

Isolated database tests verify unsafe URL rejection, caller permission/revocation, paginated lists, stale revisions, exact cross-transport retry, tombstone removal, Administrator-only rules, duplicate-stage validation, actual move-time assignment/notification, ineligible-assignee skipping and disabled rule cleanup. The issue frontend component is `DevelopmentLinksComponent` (`gg-development-links`); the project page is `AutomationRulesPage`. Both use the generated SDK and preserve retry references after uncertain saves. Browser journeys live in `frontend/e2e/planning-integrations.spec.ts`.
