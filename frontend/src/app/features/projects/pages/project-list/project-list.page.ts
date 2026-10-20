import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  Injector,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { ProjectsApi } from '../../projects.api';
import { ProjectDirectoryRecents } from '../../project-directory-recents.service';
import type {
  CreateProjectData,
  ProjectView,
  UpdateProjectData,
} from '../../../../api/generated/types.gen';
import { zProjectView } from '../../../../api/generated/zod.gen';
import { AuthService } from '../../../../core/auth/auth.service';
import { RetryIntent } from '../../../../core/api/api-result';
import { unicodeLength } from '../../../../shared/forms/unicode.validators';
import { RequestState } from '../../../../shared/ui/request-state';
import { RequestStatusComponent } from '../../../../shared/ui/request-status.component';
import { focusAfterRender } from '../../../../shared/ui/focus-after-render';

const nameControl = () =>
  new FormControl('', { nonNullable: true, validators: [Validators.required, unicodeLength(100)] });
const descriptionControl = () =>
  new FormControl('', { nonNullable: true, validators: [unicodeLength(2000)] });
@Component({
  imports: [ReactiveFormsModule, RouterLink, RequestStatusComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="page-heading"
      ><div
        ><p class="eyebrow">Workspace / Projects</p><h1>Projects</h1
        ><p class="page-description">Bring your team, issues, and boards together.</p></div
      ><div class="actions"
        ><button type="button" class="secondary" (click)="reload()" [disabled]="state.busy()"
          ><gg-icon name="refresh" /> Refresh projects</button
        >
        @if (auth.me()?.administrator) {
          <button type="button" (click)="newProject()"><gg-icon name="plus" /> New project</button>
        }
      </div></header
    >
    <gg-request-status [state]="state" />
    @if (notice()) {
      <p class="notice" role="status">{{ notice() }}</p>
    }
    <div class="projects-layout" [class.can-manage]="auth.me()?.administrator">
      <section class="project-directory" aria-labelledby="your-projects-heading">
        <div class="directory-header"
          ><h2 id="your-projects-heading"
            >Your projects <span class="project-count">{{ total() }}</span></h2
          ><div class="project-filters"
            ><label class="project-search"
              ><span class="sr-only">Search loaded projects</span><gg-icon name="search" /><input
                [formControl]="search"
                placeholder="Find a project"
                aria-label="Search loaded projects" /></label
            ><label [formGroup]="filters" class="checkbox"
              ><input type="checkbox" formControlName="includeArchived" (change)="reload()" />
              Include archived projects</label
            ></div
          ></div
        >
        @if (query()) {
          <p class="search-help muted"
            >Showing matches among {{ projects().length }} loaded projects.</p
          >
        }
        <div class="directory-columns" aria-hidden="true"
          ><span>Project</span><span>Status</span><span>Your role</span
          ><span>Quick actions</span></div
        >
        <ul class="project-records">
          @for (project of visibleProjects(); track project.id; let index = $index) {
            <li
              ><div class="project-info"
                ><span
                  class="project-avatar"
                  [class.purple]="index % 3 === 1"
                  [class.green]="index % 3 === 2"
                  >{{ project.key.slice(0, 2) }}</span
                ><div
                  ><a [routerLink]="['/projects', project.id]"
                    ><strong
                      ><span class="project-key"
                        ><bdi>{{ project.key }}</bdi> · </span
                      ><bdi>{{ project.name }}</bdi></strong
                    ></a
                  ><p class="project-description" dir="auto">{{
                    project.description || 'No description yet.'
                  }}</p></div
                ></div
              >
              <span class="project-state" [class.archived]="project.archived">{{
                project.archived ? 'Archived · Read-only' : 'Active'
              }}</span
              ><span class="project-role">{{ project.effectiveRole }}</span>
              <div class="project-actions"
                ><a
                  [routerLink]="['/boards/project', project.id]"
                  [attr.aria-label]="'Open ' + project.key + ' boards'"
                  ><gg-icon name="board" /><span>Board</span></a
                >
                @if (auth.me()?.administrator) {
                  @if (project.archived) {
                    <button
                      type="button"
                      class="secondary"
                      [attr.aria-label]="'Restore ' + project.key"
                      (click)="setArchive(project, false)"
                      [disabled]="state.busy()"
                      >Restore</button
                    >
                  } @else {
                    <button
                      type="button"
                      class="secondary"
                      [attr.aria-label]="'Edit ' + project.key"
                      (click)="edit(project)"
                      [disabled]="state.busy()"
                      >Edit</button
                    ><button
                      type="button"
                      class="secondary"
                      [attr.aria-label]="'Archive ' + project.key"
                      (click)="setArchive(project, true)"
                      [disabled]="state.busy()"
                      >Archive</button
                    >
                  }
                }
              </div>
            </li>
          } @empty {
            <li class="empty-projects"
              ><gg-icon name="folder" /><h3>No projects to show</h3
              ><p>{{
                query()
                  ? 'Try another project name or key.'
                  : 'No accessible projects match this view.'
              }}</p></li
            >
          }
        </ul>
        @if (cursor()) {
          <div class="directory-footer"
            ><p class="muted">{{ projects().length }} of {{ total() }} projects loaded</p
            ><button type="button" class="secondary" (click)="more()" [disabled]="state.busy()"
              >More projects</button
            ></div
          >
        }
      </section>
      @if (auth.me()?.administrator) {
        <section class="project-form-panel" aria-label="Project details">
          @if (selected(); as project) {
            <div class="form-panel-heading"
              ><span class="form-icon"><gg-icon name="folder" /></span
              ><div
                ><h2
                  >Edit project <bdi>{{ project.key }}</bdi></h2
                ><p>The project key stays fixed.</p></div
              ></div
            >
            <form [formGroup]="editForm" (ngSubmit)="save()">
              <label for="project-edit-name">Project name</label
              ><input id="project-edit-name" formControlName="name" dir="auto" required />
              <label for="project-edit-description">Description</label
              ><textarea
                id="project-edit-description"
                formControlName="description"
                dir="auto"
                rows="4"
              ></textarea>
              <div class="actions"
                ><button type="submit" [disabled]="editForm.invalid || state.busy()"
                  >Save project</button
                ><button type="button" class="secondary" (click)="cancel()">Cancel</button></div
              >
            </form>
          } @else {
            <div class="form-panel-heading"
              ><span class="form-icon"><gg-icon name="plus" /></span
              ><div><h2>Create a project</h2><p>A shared space for your team’s work.</p></div></div
            >
            <form [formGroup]="createForm" (ngSubmit)="create()">
              <label for="project-key"
                >Project key <span class="required-mark" aria-hidden="true">*</span></label
              ><input
                id="project-key"
                formControlName="key"
                placeholder="GOLD"
                required
                aria-describedby="project-key-help"
                autocomplete="off"
              />
              <p id="project-key-help" class="field-help"
                >2–10 letters or digits, starting with a letter. Used in issue keys, such as
                GOLD-1.</p
              >
              <label for="project-name"
                >Project name <span class="required-mark" aria-hidden="true">*</span></label
              ><input
                id="project-name"
                formControlName="name"
                dir="auto"
                placeholder="For example, Product development"
                required
              />
              <label for="project-description">Description</label
              ><textarea
                id="project-description"
                formControlName="description"
                dir="auto"
                rows="4"
                placeholder="What will your team work on?"
              ></textarea>
              <button type="submit" [disabled]="createForm.invalid || state.busy()"
                ><gg-icon name="plus" /> Create project</button
              >
            </form>
          }
          @if (currentConflict(); as current) {
            <div class="notice"
              ><p
                >Current project: <bdi>{{ current.name }}</bdi> ·
                {{ current.archived ? 'archived' : 'active' }}.</p
              ><button type="button" (click)="reviewCurrent(current)" [disabled]="current.archived"
                >Review current project</button
              ></div
            >
          }
          <p class="form-footnote"
            >Names support Arabic and up to 100 characters. Descriptions are plain text, up to 2000
            characters.</p
          >
        </section>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .page-description {
      color: var(--color-muted);
      margin: 5px 0 0;
      font-size: 13px;
    }
    .projects-layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 24px;
      align-items: start;
    }
    .projects-layout.can-manage {
      grid-template-columns: minmax(0, 1fr) 320px;
    }
    .project-directory {
      min-width: 0;
    }
    .directory-header {
      display: flex;
      flex-direction: column;
      gap: 16px;
      margin-bottom: 20px;
    }
    .directory-header h2 {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 16px;
      margin: 0;
    }
    .project-count {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 2px 7px;
      min-width: 17px;
      background: #f1f2f4;
      border-radius: 3px;
      font-size: 11px;
      font-weight: 500;
      color: var(--color-muted);
    }
    .project-filters {
      display: flex;
      align-items: center;
      gap: 20px;
      flex-wrap: wrap;
    }
    .project-search {
      position: relative;
      display: flex;
      align-items: center;
      margin: 0;
      max-width: 280px;
      flex: 1;
      min-width: 160px;
    }
    .project-search gg-icon {
      position: absolute;
      inset-inline-start: 10px;
      color: var(--color-muted);
      width: 16px;
      height: 16px;
    }
    .project-search input {
      padding-inline-start: 34px;
    }
    .project-filters .checkbox {
      margin: 0;
      font-size: 12px;
      font-weight: 400;
    }
    .search-help {
      margin-bottom: 10px;
      font-size: 12px;
    }
    .directory-columns,
    .project-records > li:not(.empty-projects) {
      display: grid;
      grid-template-columns: minmax(150px, 1fr) 110px 100px 180px;
      align-items: center;
      gap: 12px;
    }
    .directory-columns {
      font-size: 11px;
      color: var(--color-muted);
      padding: 10px 12px;
      border-bottom: 1px solid var(--color-border);
      font-weight: 600;
    }
    .project-records {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .project-records > li {
      padding: 18px 12px;
      border-bottom: 1px solid #f1f2f4;
      transition: background 0.15s;
    }
    .project-records > li:hover {
      background: #f7f8f9;
    }
    .project-info {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
    }
    .project-info > div {
      min-width: 0;
    }
    .project-avatar {
      flex: none;
      display: grid;
      place-items: center;
      width: 36px;
      height: 36px;
      border-radius: 7px;
      background: #e9f2ff;
      color: #0c66e4;
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
    .project-info a {
      color: var(--color-text);
      text-decoration: none;
      overflow-wrap: anywhere;
    }
    .project-info a:hover {
      color: var(--color-brand);
      text-decoration: underline;
    }
    .project-info strong {
      font-weight: 550;
    }
    .project-key {
      color: var(--color-muted);
    }
    .project-description {
      font-size: 12px;
      color: var(--color-muted);
      margin: 4px 0 0;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      line-height: 1.5;
    }
    .project-state {
      justify-self: start;
      background: #dcfff1;
      color: #216e4e;
      border-radius: 3px;
      font-weight: 600;
      font-size: 10px;
      padding: 3px 6px;
      text-transform: uppercase;
    }
    .project-state.archived {
      background: #f1f2f4;
      color: #626f86;
      font-size: 9px;
    }
    .project-role {
      text-transform: capitalize;
      color: var(--color-muted);
      font-size: 12px;
    }
    .project-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .project-actions a {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      text-decoration: none;
      font-size: 12px;
    }
    .project-actions gg-icon {
      width: 15px;
      height: 15px;
    }
    .project-actions button {
      font-size: 11px;
      min-height: 28px;
      padding: 3px 8px;
    }
    .directory-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      padding: 16px 0;
    }
    .directory-footer p {
      margin: 0;
      font-size: 12px;
    }
    .project-form-panel {
      background: #f7f8f9;
      border: 1px solid #f1f2f4;
      border-radius: var(--radius);
      padding: 22px;
      position: sticky;
      top: 18px;
    }
    .form-panel-heading {
      display: flex;
      gap: 12px;
      align-items: center;
      padding-bottom: 20px;
      border-bottom: 1px solid var(--color-border);
      margin-bottom: 18px;
    }
    .form-panel-heading h2 {
      font-size: 15px;
      margin: 0;
    }
    .form-panel-heading p {
      font-size: 12px;
      color: var(--color-muted);
      margin: 4px 0 0;
    }
    .form-icon {
      display: inline-flex;
      background: #e9f2ff;
      color: var(--color-brand);
      border-radius: 7px;
      padding: 9px;
    }
    .project-form-panel label {
      font-size: 12px;
    }
    .project-form-panel input,
    .project-form-panel textarea {
      font-size: 13px;
      background: var(--color-surface);
    }
    .project-form-panel input::placeholder,
    .project-form-panel textarea::placeholder {
      color: #8993a5;
    }
    .field-help {
      font-size: 11px;
      color: var(--color-muted);
      line-height: 1.5;
      margin: 6px 0 0;
    }
    .required-mark {
      color: #c9372c;
    }
    .form-footnote {
      font-size: 11px;
      color: var(--color-muted);
      line-height: 1.6;
      padding-top: 18px;
      margin-top: 22px;
      border-top: 1px solid var(--color-border);
    }
    .empty-projects {
      text-align: center;
      border: 1px dashed var(--color-border);
      border-radius: var(--radius);
      padding: 36px !important;
      color: var(--color-muted);
    }
    .empty-projects h3 {
      font-size: 14px;
      margin: 10px 0 6px;
      color: var(--color-text);
    }
    .empty-projects p {
      font-size: 13px;
      margin: 0;
    }
    @media (max-width: 1300px) {
      .directory-columns,
      .project-records > li:not(.empty-projects) {
        grid-template-columns: minmax(140px, 1fr) 100px 150px;
      }
      .directory-columns > span:nth-child(3),
      .project-role {
        display: none;
      }
      .project-actions {
        gap: 5px;
      }
      .project-actions button {
        padding: 3px 6px;
      }
      .project-actions a > span {
        display: none;
      }
    }
    @media (max-width: 1050px) {
      .projects-layout.can-manage {
        grid-template-columns: 1fr;
      }
      .project-form-panel {
        position: static;
        max-width: 600px;
      }
    }
    @media (max-width: 600px) {
      .directory-columns {
        display: none;
      }
      .project-records > li:not(.empty-projects) {
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 10px;
      }
      .project-info {
        grid-column: 1/-1;
      }
      .project-state {
        margin-inline-start: 48px;
      }
      .project-actions {
        justify-content: flex-end;
      }
      .project-actions a > span {
        display: inline;
      }
      .project-records > li {
        padding: 16px 0;
      }
      .page-heading {
        align-items: flex-start;
      }
      .page-heading > .actions {
        gap: 6px;
      }
      .page-heading button {
        padding: 6px 8px;
        font-size: 11px;
      }
      .page-heading button gg-icon {
        display: none;
      }
    }
  `,
})
export class ProjectListPage {
  readonly auth = inject(AuthService);
  private readonly api = inject(ProjectsApi);
  private readonly recents = inject(ProjectDirectoryRecents);
  private readonly injector = inject(Injector);
  readonly state = new RequestState();
  readonly notice = signal('');
  readonly total = signal(0);
  readonly search = new FormControl('', { nonNullable: true });
  readonly query = toSignal(this.search.valueChanges, { initialValue: '' });
  readonly visibleProjects = computed(() => {
    const query = this.query().trim().toLocaleLowerCase();
    return this.projects().filter(
      project =>
        !query ||
        project.name.toLocaleLowerCase().includes(query) ||
        project.key.toLocaleLowerCase().includes(query),
    );
  });
  readonly projects = signal<ProjectView[]>([]);
  readonly cursor = signal<string | null>(null);
  readonly selected = signal<ProjectView | null>(null);
  readonly filters = new FormGroup({
    includeArchived: new FormControl(false, { nonNullable: true }),
  });
  readonly createForm = new FormGroup({
    key: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/^[A-Za-z][A-Za-z0-9]{1,9}$/)],
    }),
    name: nameControl(),
    description: descriptionControl(),
  });
  readonly editForm = new FormGroup({ name: nameControl(), description: descriptionControl() });
  private readonly createRetry = new RetryIntent<CreateProjectData['body']>();
  private readonly editRetry = new RetryIntent<{
    projectId: string;
    body: UpdateProjectData['body'];
  }>();
  private readonly archiveRetry = new RetryIntent<{
    projectId: string;
    expectedRevision: string;
    archived: boolean;
  }>();
  constructor() {
    // A directory request owns its filter snapshot. Keep the checkbox aligned
    // with that snapshot until the request finishes instead of dropping a busy reload.
    effect(() => {
      const includeArchived = this.filters.controls.includeArchived;
      if (this.state.busy()) includeArchived.disable({ emitEvent: false });
      else includeArchived.enable({ emitEvent: false });
    });
    let epoch = this.auth.sessionEpoch();
    effect(() => {
      const current = this.auth.sessionEpoch();
      if (current !== epoch) {
        epoch = current;
        this.projects.set([]);
        this.cursor.set(null);
        this.total.set(0);
        this.search.reset();
        this.cancel();
        this.createForm.reset();
        this.notice.set('');
      }
    });
    void this.reload();
  }
  private async load(cursor?: string): Promise<void> {
    const epoch = this.auth.sessionEpoch(),
      includeArchived = this.filters.controls.includeArchived.value;
    const page = await this.api.list(includeArchived, cursor);
    const recentId = this.recents.id;
    const recent =
      cursor || !recentId || page.items.some(project => project.id === recentId)
        ? null
        : await this.api.get(recentId).catch(() => null);
    if (epoch !== this.auth.sessionEpoch()) return;
    const currentRecents = recent && (includeArchived || !recent.archived) ? [recent] : [];
    this.projects.update(items => [
      ...new Map(
        [...(cursor ? items : []), ...page.items, ...currentRecents].map(project => [
          project.id,
          project,
        ]),
      ).values(),
    ]);
    this.cursor.set(page.nextCursor);
    this.total.set(page.totalMatching);
  }
  async reload(): Promise<void> {
    this.cancel();
    await this.state.run(() => this.load());
  }
  async more(): Promise<void> {
    const cursor = this.cursor();
    if (cursor) await this.state.run(() => this.load(cursor));
  }
  async edit(project: ProjectView): Promise<void> {
    await this.state.run(async () => {
      const epoch = this.auth.sessionEpoch();
      const current = await this.api.get(project.id);
      if (epoch !== this.auth.sessionEpoch() || current.archived) return;
      this.reviewCurrent(current);
    });
  }
  reviewCurrent(project: ProjectView): void {
    this.selected.set(project);
    this.editRetry.finish();
    this.state.clear();
    this.editForm.setValue({ name: project.name, description: project.description });
    focusAfterRender('project-edit-name', this.injector);
  }
  newProject(): void {
    this.cancel();
    focusAfterRender('project-key', this.injector);
  }
  cancel(): void {
    this.selected.set(null);
    this.editRetry.finish();
    this.editForm.reset();
  }
  currentConflict(): ProjectView | null {
    const parsed = zProjectView.safeParse(this.state.failure()?.payload.current);
    return parsed.success ? parsed.data : null;
  }
  async create(): Promise<void> {
    if (this.createForm.invalid) return;
    const body = this.createForm.getRawValue();
    const epoch = this.auth.sessionEpoch();
    await this.state.run(
      async () => {
        const saved = await this.api.create(body, this.createRetry.reference(body));
        if (epoch !== this.auth.sessionEpoch()) return;
        this.recents.remember(saved.result.id);
        this.createRetry.finish();
        this.createForm.reset();
        this.search.reset();
        this.notice.set('Project created.');
        await this.load();
      },
      () => epoch === this.auth.sessionEpoch(),
    );
  }
  async save(): Promise<void> {
    const project = this.selected();
    if (!project || this.editForm.invalid) return;
    const body: UpdateProjectData['body'] = {
      ...this.editForm.getRawValue(),
      expectedRevision: project.revision,
    };
    const epoch = this.auth.sessionEpoch();
    await this.state.run(
      async () => {
        const saved = await this.api.update(
          project.id,
          body,
          this.editRetry.reference({ projectId: project.id, body }),
        );
        if (epoch !== this.auth.sessionEpoch()) return;
        this.recents.remember(saved.result.id);
        this.cancel();
        this.notice.set('Project saved.');
        await this.load();
      },
      () => epoch === this.auth.sessionEpoch(),
    );
  }
  async setArchive(project: ProjectView, archived: boolean): Promise<void> {
    const intention = { projectId: project.id, expectedRevision: project.revision, archived };
    const epoch = this.auth.sessionEpoch();
    await this.state.run(
      async () => {
        const reference = this.archiveRetry.reference(intention);
        const saved = archived
          ? await this.api.archive(project.id, project.revision, reference)
          : await this.api.restore(project.id, project.revision, reference);
        if (epoch !== this.auth.sessionEpoch()) return;
        this.recents.remember(saved.result.id);
        this.archiveRetry.finish();
        this.cancel();
        this.notice.set(archived ? 'Project archived.' : 'Project restored.');
        await this.load();
      },
      () => epoch === this.auth.sessionEpoch(),
    );
  }
}
