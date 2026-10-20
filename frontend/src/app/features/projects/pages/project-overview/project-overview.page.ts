import { ChangeDetectionStrategy, Component, computed, inject, resource } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ProjectsApi } from '../../projects.api';
import { BoardsApi } from '../../../boards/boards.api';
import { AuthService } from '../../../../core/auth/auth.service';
import { ApiError } from '../../../../core/api/api-result';
import { defaultWorkflow, statusCategory, statusName } from '../../../boards/board-workflow';
import { IconComponent } from '../../../../shared/ui/icon.component';

@Component({
  imports: [RouterLink, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (project.isLoading()) {
      <p role="status">Loading project…</p>
    }
    @if (project.error()) {
      <div class="notice error" role="alert"
        ><p>{{ errorMessage() }}</p
        ><button type="button" (click)="project.reload()">Reload project</button></div
      >
    }
    @if (project.hasValue()) {
      @let current = project.value();
      <div class="project-breadcrumb"
        ><a routerLink="/projects">All projects</a><gg-icon name="chevron-right" /><span
          ><bdi>{{ current.key }}</bdi></span
        ></div
      >
      <header class="page-heading"
        ><div class="project-identity"
          ><span class="project-avatar">{{ current.key.slice(0, 2) }}</span
          ><div
            ><p class="eyebrow">{{ current.effectiveRole }} access</p
            ><h1 dir="auto">{{ current.name }}</h1></div
          ></div
        >
        @if (!current.archived && current.effectiveRole !== 'viewer') {
          <a
            class="button"
            routerLink="/issues"
            [queryParams]="{ projectId: current.id, create: 'true' }"
            ><gg-icon name="plus" /> Create issue</a
          >
        }
      </header>
      <nav class="project-tabs" aria-label="Project views"
        ><a [routerLink]="boardLink()"><gg-icon name="board" /> Board</a
        ><a routerLink="/issues" [queryParams]="{ projectId: current.id }"
          ><gg-icon name="list" /> Issues</a
        ><a [routerLink]="['/backlog', current.id]">Backlog</a
        ><a [routerLink]="['/projects', current.id, 'planning']">Planning</a
        ><a [routerLink]="['/projects', current.id, 'reports']">Reports</a
        ><a [routerLink]="['/projects', current.id, 'import-export']">Import & export</a>
        @if (current.effectiveRole === 'administrator') {
          <a [routerLink]="['/projects', current.id, 'automation']">Automation</a>
        }
        <span class="active-tab" aria-current="page"><gg-icon name="folder" /> Overview</span>
        @if (
          current.effectiveRole === 'administrator' || current.effectiveRole === 'project_admin'
        ) {
          <a [routerLink]="['/projects', current.id, 'settings']"
            ><gg-icon name="settings" /> Project settings</a
          >
        }
      </nav>
      @if (current.archived) {
        <p class="notice">Archived project · Content is read-only.</p>
      }
      <div class="overview-layout">
        <div class="overview-main"
          ><section class="overview-section"
            ><h2>Project overview</h2
            ><p class="preserve-space description" dir="auto">{{
              current.description || 'No description yet.'
            }}</p></section
          >
          <section class="overview-section"
            ><div class="section-title"
              ><h2>Your workflow</h2
              ><span class="workflow-caption"
                >Kanban · {{ workflowColumns().length }} stages</span
              ></div
            ><p class="section-description"
              >Move work from a first idea to a finished issue. Review gives your team a chance to
              check it together.</p
            >
            <div class="workflow-stages">
              @for (stage of workflowColumns(); track stage.status; let index = $index) {
                <a
                  routerLink="/issues"
                  [queryParams]="{ projectId: current.id, status: stage.status }"
                  ><span
                    class="stage-number"
                    [class.progress]="category(stage.status) === 'in_progress'"
                    [class.review]="category(stage.status) === 'review'"
                    [class.done]="category(stage.status) === 'done'"
                    >{{ index + 1 }}</span
                  ><strong dir="auto">{{ stage.name }}</strong
                  ><span>{{ categoryLabel(stage.status) }}</span></a
                >
              }
            </div>
            <div class="workflow-footer"
              ><gg-icon name="link" /><p
                >Blocked issues wait for their prerequisites. Open the board to see blockers and
                move cards.</p
              ></div
            >
          </section>
          <section class="project-quick-actions"
            ><a aria-label="Open project boards" [routerLink]="['/boards/project', current.id]"
              ><span class="quick-icon"><gg-icon name="board" /></span
              ><div
                ><strong>Open project boards</strong
                ><p>Plan, drag, and move work through your workflow.</p></div
              ><gg-icon name="arrow-right" /></a
            ><a
              aria-label="Open project issues"
              routerLink="/issues"
              [queryParams]="{ projectId: current.id }"
              ><span class="quick-icon"><gg-icon name="list" /></span
              ><div
                ><strong>Open project issues</strong
                ><p>Find tasks, bugs, subtasks, and the details behind them.</p></div
              ><gg-icon name="arrow-right" /></a
          ></section>
        </div>
        <aside class="project-details"
          ><h2>Project details</h2
          ><dl
            ><div
              ><dt>Key</dt
              ><dd
                ><bdi>{{ current.key }}</bdi></dd
              ></div
            ><div
              ><dt>Status</dt
              ><dd
                ><span class="project-state" [class.archived]="current.archived">{{
                  current.archived ? 'Archived' : 'Active'
                }}</span></dd
              ></div
            ><div
              ><dt>Your role</dt><dd class="role">{{ current.effectiveRole }}</dd></div
            ><div
              ><dt>Created</dt><dd>{{ formatDate(current.createdAt) }}</dd></div
            ><div
              ><dt>Time zone</dt><dd>{{ auth.me()?.companyTimeZone }}</dd></div
            ></dl
          >
          @if (
            current.effectiveRole === 'administrator' || current.effectiveRole === 'project_admin'
          ) {
            <a class="access-link" [routerLink]="['/admin/projects', current.id, 'memberships']"
              ><gg-icon name="users" /> Manage project access</a
            >
          }
          <p class="details-help"
            ><gg-icon name="help" /><span
              >Project permissions apply to the web app and MCP access.</span
            ></p
          >
        </aside>
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .project-breadcrumb {
      display: flex;
      align-items: center;
      gap: 9px;
      font-size: 12px;
      color: var(--color-muted);
      margin-bottom: 18px;
    }
    .project-breadcrumb a {
      color: var(--color-muted);
      text-decoration: none;
    }
    .project-breadcrumb a:hover {
      color: var(--color-brand);
    }
    .project-breadcrumb gg-icon {
      width: 13px;
      height: 13px;
    }
    .project-identity {
      display: flex;
      gap: 14px;
      align-items: center;
      min-width: 0;
    }
    .project-identity > div {
      min-width: 0;
    }
    .project-avatar {
      flex: none;
      width: 48px;
      height: 48px;
      display: grid;
      place-items: center;
      border-radius: 9px;
      background: linear-gradient(135deg, #0c66e4, #579dff);
      color: white;
      font-size: 17px;
      font-weight: 650;
    }
    .project-identity h1 {
      overflow-wrap: anywhere;
    }
    .project-tabs {
      display: flex;
      gap: 28px;
      border-bottom: 1px solid var(--color-border);
      margin-bottom: 28px;
      flex-wrap: wrap;
    }
    .project-tabs a,
    .active-tab {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      text-decoration: none;
      color: var(--color-muted);
      font-size: 13px;
      padding: 12px 0;
      border-bottom: 2px solid transparent;
      margin-bottom: -1px;
    }
    .project-tabs a:hover {
      color: var(--color-brand);
    }
    .project-tabs .active-tab {
      border-bottom-color: var(--color-brand);
      color: var(--color-brand);
      font-weight: 600;
    }
    .project-tabs gg-icon {
      width: 16px;
      height: 16px;
    }
    .overview-layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 280px;
      gap: 36px;
      align-items: start;
    }
    .overview-main {
      min-width: 0;
    }
    .overview-section {
      padding: 0 0 28px;
      margin-bottom: 28px;
      border-bottom: 1px solid #f1f2f4;
    }
    .overview-section h2,
    .project-details h2 {
      font-size: 16px;
      margin: 0 0 16px;
    }
    .description {
      font-size: 14px;
      line-height: 1.8;
      color: var(--color-muted);
    }
    .section-title {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .section-title h2 {
      margin: 0;
    }
    .workflow-caption {
      font-size: 11px;
      color: var(--color-muted);
      white-space: nowrap;
    }
    .section-description {
      font-size: 13px;
      color: var(--color-muted);
      line-height: 1.6;
      margin: 12px 0 20px;
    }
    .workflow-stages {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
    }
    .workflow-stages a {
      display: flex;
      flex-direction: column;
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      padding: 16px 12px;
      min-width: 0;
      text-decoration: none;
      color: var(--color-text);
    }
    .workflow-stages a:hover {
      border-color: #85b8ff;
      background: #f7faff;
    }
    .stage-number {
      display: grid;
      place-items: center;
      align-self: flex-start;
      width: 24px;
      height: 24px;
      border-radius: 5px;
      background: #f1f2f4;
      color: #44546f;
      font-size: 11px;
      font-weight: 600;
      margin-bottom: 12px;
    }
    .stage-number.progress {
      background: #e9f2ff;
      color: #0c66e4;
    }
    .stage-number.review {
      background: #f3f0ff;
      color: #6e5dc6;
    }
    .stage-number.done {
      background: #dcfff1;
      color: #216e4e;
    }
    .workflow-stages strong {
      font-size: 12px;
      font-weight: 600;
    }
    .workflow-stages a > span:last-child {
      font-size: 11px;
      color: var(--color-muted);
      margin-top: 6px;
      line-height: 1.5;
    }
    .workflow-footer {
      display: flex;
      align-items: center;
      gap: 9px;
      margin-top: 18px;
      color: var(--color-muted);
    }
    .workflow-footer gg-icon {
      width: 15px;
      height: 15px;
    }
    .workflow-footer p {
      font-size: 12px;
      line-height: 1.6;
      margin: 0;
    }
    .project-quick-actions {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 16px;
    }
    .project-quick-actions a {
      display: flex;
      align-items: center;
      gap: 12px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      padding: 18px;
      text-decoration: none;
      color: var(--color-text);
      min-width: 0;
    }
    .project-quick-actions a:hover {
      border-color: #85b8ff;
    }
    .quick-icon {
      display: flex;
      background: #e9f2ff;
      color: var(--color-brand);
      padding: 9px;
      border-radius: 7px;
    }
    .project-quick-actions a > div {
      min-width: 0;
      flex: 1;
    }
    .project-quick-actions strong {
      font-size: 13px;
      font-weight: 550;
    }
    .project-quick-actions p {
      font-size: 11px;
      color: var(--color-muted);
      line-height: 1.5;
      margin: 5px 0 0;
    }
    .project-quick-actions a > gg-icon {
      width: 15px;
      height: 15px;
      color: var(--color-muted);
    }
    .project-details {
      background: #f7f8f9;
      border: 1px solid #f1f2f4;
      border-radius: var(--radius);
      padding: 22px;
    }
    .project-details h2 {
      font-size: 14px;
    }
    .project-details dl {
      margin: 0;
    }
    .project-details dl > div {
      display: flex;
      gap: 14px;
      justify-content: space-between;
      margin-bottom: 16px;
      font-size: 12px;
    }
    .project-details dt {
      color: var(--color-muted);
    }
    .project-details dd {
      margin: 0;
      text-align: end;
      max-width: 170px;
      overflow-wrap: anywhere;
    }
    .role {
      text-transform: capitalize;
    }
    .project-state {
      padding: 3px 6px;
      border-radius: 3px;
      background: #dcfff1;
      color: #216e4e;
      font-size: 10px;
      font-weight: 650;
      text-transform: uppercase;
    }
    .project-state.archived {
      background: #e4e6e9;
      color: var(--color-muted);
    }
    .access-link {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      padding-top: 18px;
      border-top: 1px solid var(--color-border);
      text-decoration: none;
    }
    .access-link gg-icon {
      width: 16px;
      height: 16px;
    }
    .details-help {
      display: flex;
      gap: 8px;
      font-size: 11px;
      line-height: 1.5;
      color: var(--color-muted);
      margin: 20px 0 0;
    }
    .details-help gg-icon {
      width: 14px;
      height: 14px;
      margin-top: 2px;
    }
    @media (max-width: 1050px) {
      .overview-layout {
        grid-template-columns: 1fr;
      }
      .project-details {
        max-width: 600px;
      }
      .project-details dl {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0 28px;
      }
    }
    @media (max-width: 600px) {
      .workflow-stages,
      .project-quick-actions {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .project-tabs {
        gap: 16px;
      }
      .project-tabs a,
      .active-tab {
        font-size: 12px;
        gap: 5px;
      }
      .project-tabs gg-icon {
        display: none;
      }
      .project-identity {
        gap: 10px;
      }
      .project-avatar {
        width: 38px;
        height: 38px;
        font-size: 14px;
      }
      .page-heading > .button {
        font-size: 11px;
        padding: 6px 8px;
        white-space: nowrap;
      }
      .project-details dl {
        grid-template-columns: 1fr;
      }
      .project-quick-actions a {
        padding: 12px;
      }
      .quick-icon {
        display: none;
      }
    }
  `,
})
export class ProjectOverviewPage {
  readonly auth = inject(AuthService);
  private readonly api = inject(ProjectsApi);
  private readonly boardApi = inject(BoardsApi);
  private readonly route = inject(ActivatedRoute);
  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  readonly project = resource({
    params: () =>
      this.auth.me()
        ? { id: this.params().get('projectId') ?? '', epoch: this.auth.sessionEpoch() }
        : undefined,
    loader: ({ params, abortSignal }) => this.api.get(params.id, abortSignal),
  });
  readonly boards = resource({
    params: () =>
      this.auth.me()
        ? { id: this.params().get('projectId') ?? '', epoch: this.auth.sessionEpoch() }
        : undefined,
    loader: ({ params }) => this.boardApi.list(params.id, false),
  });
  readonly workflowColumns = computed(() => {
    const items = this.boards.value()?.items ?? [];
    return (items.find(item => item.default)?.workflow ?? items[0]?.workflow ?? defaultWorkflow())
      .columns;
  });
  readonly category = statusCategory;
  categoryLabel(status: string) {
    return statusName(statusCategory(status));
  }
  boardLink(): string[] {
    const items = this.boards.value()?.items ?? [];
    const board = items.find(item => item.default) ?? items[0];
    return board
      ? ['/boards', board.id]
      : ['/boards/project', this.params().get('projectId') ?? ''];
  }
  formatDate(value: string): string {
    return new Intl.DateTimeFormat('en', {
      dateStyle: 'medium',
      timeZone: this.auth.me()?.companyTimeZone ?? 'UTC',
    }).format(new Date(value));
  }
  errorMessage(): string {
    const error = this.project.error();
    return error instanceof ApiError
      ? error.message
      : 'The project could not be loaded. Try again.';
  }
}
