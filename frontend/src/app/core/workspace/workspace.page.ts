import { ChangeDetectionStrategy, Component, inject, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ModernIssueSummary } from '../../api/generated/types.gen';
import { IconComponent } from '../../shared/ui/icon.component';
import { ApiError } from '../api/api-result';
import { AuthService } from '../auth/auth.service';
import { WorkspaceApi } from './workspace-api.service';

@Component({
  imports: [RouterLink, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="page-heading welcome-heading">
      <div
        ><p class="eyebrow">Your workspace</p><h1>Welcome, {{ auth.me()?.displayName }}</h1
        ><p class="welcome-description">A clear view of your work. A good place to start.</p></div
      >
      <a class="button" routerLink="/projects"><gg-icon name="folder" /> Open projects</a>
    </header>
    @if (dashboard.isLoading()) {
      <p class="muted" role="status">Loading your workspace…</p>
    }
    @if (dashboard.error()) {
      <div class="notice error" role="alert"
        ><p>{{ errorMessage() }}</p
        ><button type="button" class="secondary" (click)="dashboard.reload()"
          >Refresh workspace</button
        ></div
      >
    }
    @if (dashboard.hasValue()) {
      @let data = dashboard.value();
      <div class="workspace-stats" aria-label="Workspace overview">
        <a
          class="stat-card"
          routerLink="/issues"
          [queryParams]="{ assignee: 'self', status: 'open' }"
          ><span class="stat-icon blue"><gg-icon name="check-square" /></span
          ><span class="stat-label">Assigned to me</span
          ><strong>{{ data.assigned.totalMatching }}</strong
          ><span class="stat-caption">Open issues <gg-icon name="arrow-right" /></span
        ></a>
        <a class="stat-card" routerLink="/issues" [queryParams]="{ status: 'review' }"
          ><span class="stat-icon purple"><gg-icon name="users" /></span
          ><span class="stat-label">Ready for review</span
          ><strong>{{ data.review.totalMatching }}</strong
          ><span class="stat-caption">Across your projects <gg-icon name="arrow-right" /></span
        ></a>
        <a
          class="stat-card"
          routerLink="/issues"
          [queryParams]="{ blocked: 'true', status: 'open' }"
          ><span class="stat-icon amber"><gg-icon name="link" /></span
          ><span class="stat-label">Blocked work</span
          ><strong>{{ data.blocked.totalMatching }}</strong
          ><span class="stat-caption">Needs a prerequisite <gg-icon name="arrow-right" /></span
        ></a>
        <a class="stat-card" routerLink="/projects"
          ><span class="stat-icon green"><gg-icon name="folder" /></span
          ><span class="stat-label">Active projects</span
          ><strong>{{ data.projects.totalMatching }}</strong
          ><span class="stat-caption">Available to you <gg-icon name="arrow-right" /></span
        ></a>
      </div>
      <section class="workspace-section" aria-labelledby="workspace-projects-heading">
        <div class="section-heading"
          ><h2 id="workspace-projects-heading">Jump back into a project</h2
          ><a routerLink="/projects">View all projects <gg-icon name="arrow-right" /></a
        ></div>
        <div class="workspace-projects">
          @for (project of data.projects.items.slice(0, 4); track project.id; let index = $index) {
            <article class="workspace-project"
              ><div class="project-title"
                ><span
                  class="project-avatar"
                  [class.purple]="index % 3 === 1"
                  [class.green]="index % 3 === 2"
                  >{{ project.key.slice(0, 2) }}</span
                ><div
                  ><a [routerLink]="['/projects', project.id]"
                    ><bdi>{{ project.name }}</bdi></a
                  ><p
                    ><bdi>{{ project.key }}</bdi> · {{ project.effectiveRole }}</p
                  ></div
                ></div
              >
              <p class="project-description" dir="auto">{{
                project.description || 'Keep your team’s work moving in one place.'
              }}</p>
              <div class="project-links"
                ><a [routerLink]="['/boards/project', project.id]"><gg-icon name="board" /> Board</a
                ><a routerLink="/issues" [queryParams]="{ projectId: project.id }"
                  ><gg-icon name="list" /> Issues</a
                ></div
              >
            </article>
          } @empty {
            <div class="empty-workspace"
              ><gg-icon name="folder" /><h3>No projects yet</h3
              ><p>Your accessible projects will appear here.</p
              ><a routerLink="/projects">Open projects</a></div
            >
          }
        </div>
      </section>
      <div class="workspace-bottom">
        <section class="workspace-section my-work" aria-labelledby="workspace-work-heading">
          <div class="section-heading"
            ><h2 id="workspace-work-heading">My open work</h2
            ><a routerLink="/issues" [queryParams]="{ assignee: 'self', status: 'open' }"
              >View all <gg-icon name="arrow-right" /></a
          ></div>
          <ul class="work-list">
            @for (issue of data.assigned.items.slice(0, 6); track issue.id) {
              <li
                ><span class="work-type" [class.bug]="issue.type.key === 'bug'"
                  ><gg-icon
                    [name]="
                      issue.type.key === 'bug'
                        ? 'bug'
                        : issue.type.behavior === 'subtask'
                          ? 'subtask'
                          : 'check-square'
                    " /></span
                ><a [routerLink]="['/issues', issue.id]"
                  ><span class="work-key"
                    ><bdi>{{ issue.key }}</bdi></span
                  ><span class="work-title" dir="auto">{{ issue.title }}</span></a
                ><span
                  class="work-status"
                  [class.review]="issue.stage.category === 'review'"
                  [class.progress]="issue.stage.category === 'in_progress'"
                  >{{ statusLabel(issue) }}</span
                >
                @if (issue.blocked) {
                  <span class="work-blocked" title="Waiting for an unfinished prerequisite"
                    ><gg-icon name="link"
                  /></span>
                }
              </li>
            } @empty {
              <li class="empty-work"
                ><gg-icon name="check-square" /><div
                  ><h3>You’re all caught up</h3
                  ><p>No open issues are currently assigned to you.</p></div
                ></li
              >
            }
          </ul>
        </section>
        <aside class="workspace-guide"
          ><span class="guide-icon"><gg-icon name="board" /></span><h2>Keep the work flowing</h2
          ><p
            >Use your project board to plan the next task, move work into Review, and see what’s
            blocking your team.</p
          ><a routerLink="/projects">Find your board <gg-icon name="arrow-right" /></a
          ><div class="guide-footer"
            ><gg-icon name="clock" /><span
              >Company time zone<br /><strong>{{ auth.me()?.companyTimeZone }}</strong></span
            ></div
          >
          @if (auth.me()?.administrator) {
            <a class="admin-link" routerLink="/admin/users"
              ><gg-icon name="users" /> Manage users</a
            >
          }
        </aside>
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .welcome-heading {
      margin-bottom: 28px;
    }
    .welcome-description {
      color: var(--color-muted);
      margin: 6px 0 0;
    }
    .workspace-stats {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 16px;
      margin-bottom: 32px;
    }
    .stat-card {
      position: relative;
      display: flex;
      flex-direction: column;
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      padding: 18px 20px;
      text-decoration: none;
      color: var(--color-text);
      min-width: 0;
      transition:
        border-color 0.15s,
        box-shadow 0.15s;
    }
    .stat-card:hover {
      border-color: #85b8ff;
      box-shadow: 0 2px 6px #091e4210;
    }
    .stat-icon {
      position: absolute;
      inset-inline-end: 16px;
      top: 16px;
      width: 32px;
      height: 32px;
      display: grid;
      place-items: center;
      border-radius: 6px;
    }
    .blue {
      background: #e9f2ff;
      color: #0c66e4;
    }
    .purple {
      background: #f3f0ff;
      color: #6e5dc6;
    }
    .amber {
      background: #fff7d6;
      color: #946f00;
    }
    .green {
      background: #dcfff1;
      color: #1f845a;
    }
    .stat-label {
      font-weight: 500;
      padding-inline-end: 34px;
    }
    .stat-card strong {
      font-size: 30px;
      line-height: 1.3;
      margin: 14px 0 8px;
      letter-spacing: -0.8px;
    }
    .stat-caption {
      font-size: 12px;
      color: var(--color-muted);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .stat-caption gg-icon {
      width: 14px;
      height: 14px;
    }
    .workspace-section {
      min-width: 0;
    }
    .section-heading {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 16px;
    }
    .section-heading h2 {
      font-size: 16px;
      margin: 0;
    }
    .section-heading > a,
    .project-links a,
    .workspace-guide > a {
      display: inline-flex;
      gap: 7px;
      align-items: center;
      font-size: 13px;
      text-decoration: none;
    }
    .workspace-projects {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 16px;
    }
    .workspace-project {
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      padding: 18px;
      min-width: 0;
    }
    .project-title {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .project-avatar {
      flex: none;
      display: grid;
      place-items: center;
      width: 36px;
      height: 36px;
      background: #e9f2ff;
      color: #0c66e4;
      border-radius: 7px;
      font-size: 13px;
      font-weight: 700;
    }
    .project-avatar.purple {
      background: #f3f0ff;
      color: #6e5dc6;
    }
    .project-avatar.green {
      background: #dcfff1;
      color: #1f845a;
    }
    .project-title > div {
      min-width: 0;
    }
    .project-title a {
      font-weight: 600;
      text-decoration: none;
      color: var(--color-text);
      overflow-wrap: anywhere;
    }
    .project-title p {
      font-size: 11px;
      color: var(--color-muted);
      margin: 3px 0 0;
      text-transform: capitalize;
    }
    .project-description {
      color: var(--color-muted);
      font-size: 12px;
      line-height: 1.6;
      min-height: 38px;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }
    .project-links {
      display: flex;
      gap: 18px;
      border-top: 1px solid #f1f2f4;
      padding-top: 12px;
    }
    .project-links gg-icon {
      width: 15px;
      height: 15px;
    }
    .workspace-bottom {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 290px;
      gap: 28px;
      margin-top: 32px;
    }
    .work-list {
      list-style: none;
      margin: 0;
      padding: 0;
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
    }
    .work-list li {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 16px;
      border-bottom: 1px solid #f1f2f4;
      min-width: 0;
    }
    .work-list li:last-child {
      border-bottom: 0;
    }
    .work-list li > a {
      display: flex;
      flex: 1;
      flex-direction: column;
      min-width: 0;
      text-decoration: none;
    }
    .work-key {
      color: var(--color-muted);
      font-size: 11px;
      margin-bottom: 3px;
    }
    .work-title {
      color: var(--color-text);
      overflow-wrap: anywhere;
    }
    .work-type {
      color: #0c66e4;
    }
    .work-type.bug {
      color: #c9372c;
    }
    .work-status {
      border-radius: 3px;
      background: #f1f2f4;
      color: #44546f;
      padding: 3px 6px;
      font-size: 10px;
      font-weight: 650;
      text-transform: uppercase;
      white-space: nowrap;
    }
    .work-status.review {
      background: #f3f0ff;
      color: #6e5dc6;
    }
    .work-status.progress {
      background: #e9f2ff;
      color: #0c66e4;
    }
    .work-blocked {
      color: #946f00;
    }
    .workspace-guide {
      align-self: start;
      background: #f7f8f9;
      border: 1px solid #f1f2f4;
      border-radius: var(--radius);
      padding: 22px;
    }
    .guide-icon {
      display: inline-flex;
      background: #e9f2ff;
      color: #0c66e4;
      border-radius: 8px;
      padding: 9px;
      margin-bottom: 16px;
    }
    .workspace-guide h2 {
      font-size: 16px;
      margin: 0;
    }
    .workspace-guide p {
      color: var(--color-muted);
      font-size: 13px;
      line-height: 1.6;
    }
    .guide-footer {
      border-top: 1px solid var(--color-border);
      padding-top: 18px;
      margin-top: 24px;
      display: flex;
      gap: 10px;
      color: var(--color-muted);
      font-size: 11px;
    }
    .guide-footer strong {
      color: var(--color-text);
      font-weight: 500;
    }
    .workspace-guide .admin-link {
      font-size: 12px;
      margin-top: 16px;
    }
    .empty-workspace {
      grid-column: 1/-1;
      padding: 30px;
      text-align: center;
      border: 1px dashed var(--color-border);
      border-radius: var(--radius);
      color: var(--color-muted);
    }
    .empty-workspace h3,
    .empty-work h3 {
      margin: 8px 0 4px;
      font-size: 14px;
      color: var(--color-text);
    }
    .empty-workspace p,
    .empty-work p {
      margin: 0 0 12px;
    }
    .work-list .empty-work {
      padding: 32px;
      justify-content: center;
      color: var(--color-muted);
    }
    .empty-work p {
      font-size: 12px;
      margin: 4px 0;
    }
    .empty-work h3 {
      margin: 0;
    }
    @media (max-width: 1150px) {
      .workspace-projects,
      .workspace-stats {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
    @media (max-width: 850px) {
      .workspace-bottom {
        grid-template-columns: 1fr;
      }
      .workspace-guide {
        display: none;
      }
      .welcome-heading {
        align-items: flex-start;
      }
    }
    @media (max-width: 520px) {
      .workspace-projects {
        grid-template-columns: 1fr;
      }
      .workspace-stats {
        gap: 10px;
      }
      .stat-card {
        padding: 14px;
      }
      .stat-label {
        font-size: 12px;
      }
      .stat-icon {
        display: none;
      }
      .stat-label {
        padding: 0;
      }
      .section-heading > a {
        font-size: 12px;
      }
      .work-list li {
        padding: 12px 10px;
        gap: 8px;
      }
      .work-status {
        font-size: 9px;
      }
      .welcome-heading > .button {
        white-space: nowrap;
        padding: 8px;
        font-size: 12px;
      }
    }
  `,
})
export class WorkspacePage {
  readonly auth = inject(AuthService);
  private readonly workspace = inject(WorkspaceApi);
  readonly dashboard = resource({
    params: () => (this.auth.me() ? { epoch: this.auth.sessionEpoch() } : undefined),
    loader: async () => {
      const [projects, assigned, review, blocked] = await Promise.all([
        this.workspace.projects(false),
        this.workspace.searchFilters({
          assignee: { kind: 'self' },
          statuses: ['todo', 'in_progress', 'review'],
        }),
        this.workspace.searchFilters({ statuses: ['review'] }),
        this.workspace.searchFilters({
          blocked: true,
          statuses: ['todo', 'in_progress', 'review'],
        }),
      ]);
      return { projects, assigned, review, blocked };
    },
  });
  statusLabel(issue: ModernIssueSummary): string {
    return issue.stage.name;
  }
  errorMessage(): string {
    const error = this.dashboard.error();
    return error instanceof ApiError
      ? error.message
      : 'Your workspace could not be loaded. Try again.';
  }
}
