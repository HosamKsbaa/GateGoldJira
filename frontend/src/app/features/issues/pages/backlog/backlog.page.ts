import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CdkDrag, CdkDragHandle, CdkDropList, type CdkDragDrop } from '@angular/cdk/drag-drop';
import type {
  ModernCreateFields,
  ProjectView,
} from '../../../../api/generated/types.gen';
import { AuthService } from '../../../../core/auth/auth.service';
import { RetryIntent } from '../../../../core/api/api-result';
import { ProjectsApi } from '../../../projects/projects.api';
import { type IssueCard, issueStageName } from '../../issue-model';
import { ModernIssuesApi } from '../../modern-issues.api';
import { ModernIssueFormComponent } from '../../components/modern-issue-form/modern-issue-form.component';
import { IssuesApi } from '../../issues.api';
import { BacklogApi } from '../../backlog.api';
import { RequestState } from '../../../../shared/ui/request-state';
import { RequestStatusComponent } from '../../../../shared/ui/request-status.component';
import { IconComponent } from '../../../../shared/ui/icon.component';
@Component({
  standalone: true,
  imports: [
    RouterLink,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    ModernIssueFormComponent,
    RequestStatusComponent,
    IconComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './backlog.page.css',
  template: `
    <header class="page-heading"
      ><div
        ><p class="eyebrow">{{ project()?.name }} / Planning</p><h1>Backlog</h1
        ><p>Prioritize future work, then bring it onto the board when the team is ready.</p></div
      ><div class="actions">
        @if (canEdit()) {
          <button
            id="new-backlog-issue"
            type="button"
            (click)="openCreate()"
            [disabled]="state.busy()"
            ><gg-icon name="plus" /> New issue</button
          >
        }
        <button class="secondary" type="button" (click)="load()" [disabled]="state.busy()"
          >Refresh backlog</button
        ></div
      ></header
    >
    <nav class="project-subnav" aria-label="Project views"
      ><a routerLink="/issues" [queryParams]="{ projectId: projectId() }">Issues</a
      ><a class="selected" [routerLink]="['/backlog', projectId()]" aria-current="page">Backlog</a
      ><a [routerLink]="['/boards/project', projectId()]">Boards</a
      ><a [routerLink]="['/projects', projectId(), 'planning']">Epics & releases</a
      ><a [routerLink]="['/projects', projectId(), 'reports']">Reports</a></nav
    >
    <gg-request-status [state]="state" />
    @if (notice()) {
      <p role="status" class="notice">{{ notice() }}</p>
    }
    <section class="planning-list" aria-labelledby="planned-heading"
      ><header class="planning-toolbar"
        ><h2 id="planned-heading"
          >Planned work <span class="badge">{{ total() }}</span></h2
        >
        @if (canEdit()) {
          <label class="select-all"
            ><input
              type="checkbox"
              [checked]="allSelected()"
              (change)="selectAll($event)"
              [disabled]="state.busy()"
            />Select loaded (up to 100)</label
          ><button
            type="button"
            [disabled]="!selected().length || state.busy()"
            (click)="activateSelected()"
            >Move {{ selected().length || '' }} to board</button
          >
        }
      </header>
      @if (!items().length && !state.busy()) {
        <div class="empty-state"
          ><gg-icon name="list" /><h3>Make room for the next idea</h3
          ><p
            >Create planned work here, or send an unstarted issue to the backlog from its
            actions.</p
          ></div
        >
      }
      <div
        cdkDropList
        [cdkDropListData]="items()"
        [cdkDropListDisabled]="!canEdit() || state.busy()"
        (cdkDropListDropped)="drop($event)"
        role="list"
        aria-label="Ranked backlog"
      >
        @for (issue of items(); track issue.id; let index = $index) {
          <article
            cdkDrag
            role="listitem"
            class="planned-row"
            [cdkDragDisabled]="!canEdit() || state.busy()"
          >
            @if (canEdit()) {
              <button
                cdkDragHandle
                type="button"
                class="drag-handle secondary"
                [disabled]="state.busy()"
                [attr.aria-label]="'Drag ' + issue.key"
                title="Drag to rank"
                >⠿</button
              ><input
                type="checkbox"
                [attr.aria-label]="'Select ' + issue.key"
                [checked]="selected().includes(issue.id)"
                (change)="select(issue.id, $event)"
                [disabled]="state.busy()"
              />
            }
            <span class="rank-number">{{ index + 1 }}</span
            ><div class="planned-work"
              ><a [routerLink]="['/issues', issue.id]"
                ><small>{{ issue.key }}</small
                ><bdi>{{ issue.title }}</bdi></a
              ><div class="planned-meta"
                ><span class="status-badge">{{ stageName(issue) }}</span
                ><span>{{ issue.assignee?.displayName ?? 'Unassigned' }}</span>
                @if (issue.dueDate) {
                  <span [class.overdue]="issue.overdue">Due {{ issue.dueDate }}</span>
                }
                @if (issue.unfinishedBlockerCount) {
                  <span class="blocked">Blocked</span>
                }
                @for (label of issue.labels; track label.id) {
                  <span class="label-chip">{{ label.name }}</span>
                }
              </div></div
            >
            @if (canEdit()) {
              <div class="row-actions"
                ><button
                  class="secondary"
                  type="button"
                  [attr.aria-label]="'Rank ' + issue.key + ' earlier'"
                  [disabled]="index === 0 || state.busy()"
                  (click)="rank(index, index - 1)"
                  >↑</button
                ><button
                  class="secondary"
                  type="button"
                  [attr.aria-label]="'Rank ' + issue.key + ' later'"
                  [disabled]="index === items().length - 1 || state.busy()"
                  (click)="rank(index, index + 1)"
                  >↓</button
                ><button
                  class="secondary"
                  type="button"
                  [attr.aria-label]="'Move ' + issue.key + ' to board'"
                  [disabled]="state.busy()"
                  (click)="activate([issue])"
                  >Move to board</button
                ></div
              >
            }
          </article>
        }
      </div>
      @if (cursor()) {
        <button
          type="button"
          class="secondary more-items"
          (click)="more()"
          [disabled]="state.busy()"
          >More planned work</button
        >
      }
      <p class="planning-hint"
        >Ranking is separate from board columns. Only loaded rows can be dragged; load more to reach
        further work.</p
      ></section
    >
    <dialog
      #createDialog
      class="issue-dialog"
      aria-labelledby="create-backlog-heading"
      (cancel)="cancelEvent($event)"
      ><header class="dialog-heading"
        ><div
          ><h2 id="create-backlog-heading">Create issue</h2
          ><p>{{ project()?.key }} · Planned work</p></div
        ><button
          class="secondary"
          type="button"
          aria-label="Close create issue"
          (click)="closeCreate()"
          [disabled]="state.busy()"
          >×</button
        ></header
      >
      @if (creating()) {
        <gg-request-status [state]="state" />
        <gg-modern-issue-form
          [projectId]="projectId()"
          [busy]="state.busy() || !!pendingModern()"
          (create)="createModern($event)"
          (cancel)="closeCreate()"
        />
        @if (pendingModern() && state.message()) {
          <button type="button" (click)="createModern(pendingModern()!)" [disabled]="state.busy()"
            >Retry original create</button
          >
        }
      }
    </dialog>
  `,
})
export class BacklogPage {
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  private readonly projectsApi = inject(ProjectsApi);
  private readonly api = inject(BacklogApi);
  private readonly issues = inject(IssuesApi);
  private readonly native = inject(ModernIssuesApi);
  readonly pendingModern = signal<ModernCreateFields | null>(null);
  private readonly injector = inject(Injector);
  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  readonly projectId = computed(() => this.params().get('projectId') ?? '');
  private generation = 0;
  readonly state = new RequestState();
  readonly project = signal<ProjectView | null>(null);
  readonly items = signal<IssueCard[]>([]);
  readonly cursor = signal<string | null>(null);
  readonly total = signal(0);
  readonly orderRevision = signal('1');
  readonly selected = signal<string[]>([]);
  readonly notice = signal('');
  readonly creating = signal(false);
  readonly stageName = issueStageName;
  readonly canEdit = computed(
    () =>
      !!this.project() && !this.project()?.archived && this.project()?.effectiveRole !== 'viewer',
  );
  readonly allSelected = computed(
    () => !!this.items().length && this.items().every(item => this.selected().includes(item.id)),
  );
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('createDialog');
  private readonly modernForm = viewChild(ModernIssueFormComponent);
  private readonly retry = new RetryIntent<object>();
  private readonly moveRetries = new Map<string, RetryIntent<object>>();
  constructor() {
    inject(DestroyRef).onDestroy(() => this.generation++);
    effect(() => {
      const id = this.projectId(),
        approved = this.auth.me();
      this.auth.sessionEpoch();
      untracked(() => {
        this.generation++;
        this.state.busy.set(false);
        this.state.clear();
        this.items.set([]);
        this.project.set(null);
        this.cursor.set(null);
        this.total.set(0);
        this.selected.set([]);
        this.dialog()?.nativeElement.close();
        this.creating.set(false);
        this.pendingModern.set(null);
        this.notice.set('');
        this.retry.finish();
        this.moveRetries.clear();
        if (approved && id) void this.load();
      });
    });
  }
  private currentRequest(): () => boolean {
    const id = this.projectId(),
      generation = this.generation,
      epoch = this.auth.sessionEpoch();
    return () =>
      id === this.projectId() &&
      generation === this.generation &&
      epoch === this.auth.sessionEpoch();
  }
  async load(): Promise<void> {
    const id = this.projectId(),
      current = this.currentRequest();
    await this.state.run(async () => {
      const [project, page] = await Promise.all([
        this.projectsApi.get(id),
        this.api.list(id),
      ]);
      if (!current()) return;
      this.project.set(project);
      this.items.set(page.modernItems ?? page.items);
      this.cursor.set(page.nextCursor);
      this.total.set(page.totalMatching);
      this.orderRevision.set(page.orderRevision);
      this.selected.update(ids => ids.filter(id => page.items.some(item => item.id === id)));
    }, current);
  }
  async more(): Promise<void> {
    const cursor = this.cursor();
    if (!cursor) return;
    const id = this.projectId(),
      current = this.currentRequest();
    await this.state.run(async () => {
      const page = await this.api.list(id, cursor);
      if (!current()) return;
      const existing = this.items(),
        ids = new Set(existing.map(item => item.id));
      this.items.set([
        ...existing,
        ...(page.modernItems ?? page.items).filter(item => !ids.has(item.id)),
      ]);
      this.cursor.set(page.nextCursor);
      this.total.set(page.totalMatching);
      this.orderRevision.set(page.orderRevision);
    }, current);
  }
  select(id: string, event: Event) {
    if (!(event.target instanceof HTMLInputElement) || !this.canEdit()) return;
    if (event.target.checked && this.selected().length >= 100) {
      event.target.checked = false;
      this.state.message.set('Select at most 100 issues per move.');
      return;
    }
    this.selected.update(ids =>
      event.target instanceof HTMLInputElement && event.target.checked
        ? [...ids.filter(value => value !== id), id]
        : ids.filter(value => value !== id),
    );
  }
  selectAll(event: Event) {
    if (!this.canEdit()) return;
    if (event.target instanceof HTMLInputElement)
      this.selected.set(
        event.target.checked
          ? this.items()
              .slice(0, 100)
              .map(item => item.id)
          : [],
      );
  }
  drop(event: CdkDragDrop<IssueCard[]>) {
    void this.rank(event.previousIndex, event.currentIndex);
  }
  async rank(from: number, to: number) {
    if (from === to || !this.canEdit() || this.state.busy()) return;
    const issue = this.items()[from],
      neighbor = this.items()[to];
    if (!issue || !neighbor) return;
    const current = this.currentRequest();
    await this.state.run(async () => {
      const epoch = this.auth.sessionEpoch(),
        body = {
          expectedRevision: issue.revision,
          expectedOrderRevision: this.orderRevision(),
          neighborId: neighbor.id,
          before: to < from,
        };
      await this.api.reorder(
        issue.id,
        body,
        this.retry.reference({ kind: 'rank', id: issue.id, body }),
      );
      if (epoch !== this.auth.sessionEpoch() || !current()) return;
      this.retry.finish();
      const page = await this.api.list(this.projectId());
      if (!current()) return;
      this.items.set(page.modernItems ?? page.items);
      this.cursor.set(page.nextCursor);
      this.total.set(page.totalMatching);
      this.orderRevision.set(page.orderRevision);
      this.notice.set('Backlog order saved.');
    }, current);
  }
  activateSelected() {
    return this.activate(this.items().filter(item => this.selected().includes(item.id)));
  }
  async activate(items: IssueCard[]) {
    if (!this.canEdit() || this.state.busy()) return;
    const current = this.currentRequest();
    await this.state.run(async () => {
      const epoch = this.auth.sessionEpoch();
      let count = 0;
      for (const issue of items.slice(0, 100)) {
        let retry = this.moveRetries.get(issue.id);
        if (!retry) {
          retry = new RetryIntent<object>();
          this.moveRetries.set(issue.id, retry);
        }
        const body = { expectedRevision: issue.revision, backlog: false };
        await this.issues.organize(issue.id, body, retry.reference(body));
        if (epoch !== this.auth.sessionEpoch() || !current()) return;
        retry.finish();
        this.moveRetries.delete(issue.id);
        this.items.update(items => items.filter(item => item.id !== issue.id));
        this.selected.update(ids => ids.filter(id => id !== issue.id));
        count++;
        this.notice.set(count + ' moved to the board.');
      }
      const page = await this.api.list(this.projectId());
      if (!current()) return;
      this.items.set(page.modernItems ?? page.items);
      this.cursor.set(page.nextCursor);
      this.total.set(page.totalMatching);
      this.orderRevision.set(page.orderRevision);
    }, current);
  }
  openCreate() {
    if (!this.canEdit()) return;
    this.creating.set(true);
    afterNextRender(
      () => {
        this.dialog()?.nativeElement.showModal();
        document.getElementById('issue-title')?.focus();
      },
      { injector: this.injector },
    );
  }
  closeCreate() {
    if (this.state.busy() || !this.modernForm()?.confirmClose()) return;
    this.dialog()?.nativeElement.close();
    this.creating.set(false);
    this.pendingModern.set(null);
    this.retry.finish();
    document.getElementById('new-backlog-issue')?.focus();
  }
  cancelEvent(event: Event) {
    event.preventDefault();
    this.closeCreate();
  }
  async createModern(fields: ModernCreateFields): Promise<void> {
    if (!this.canEdit() || this.state.busy()) return;
    const body = this.pendingModern() ?? { ...fields, backlog: true };
    this.pendingModern.set(body);
    const projectId = this.projectId(),
      form = this.modernForm(),
      current = this.currentRequest(),
      epoch = this.auth.sessionEpoch();
    await this.state.run(async () => {
      const existing = form?.createdIssueId();
      const issue = existing
        ? await this.native.get(existing)
        : (
            await this.native.create(
              projectId,
              body,
              this.retry.reference({ kind: 'native-create', projectId, body }),
            )
          ).result;
      if (!current() || epoch !== this.auth.sessionEpoch()) return;
      form?.markCreated(issue.summary.id);
      await form?.finishUploads(issue);
      if (!current() || epoch !== this.auth.sessionEpoch()) return;
      form?.saved();
      this.pendingModern.set(null);
      this.retry.finish();
      this.dialog()?.nativeElement.close();
      this.creating.set(false);
      const page = await this.api.list(projectId);
      if (!current()) return;
      this.items.set(page.modernItems ?? page.items);
      this.cursor.set(page.nextCursor);
      this.total.set(page.totalMatching);
      this.orderRevision.set(page.orderRevision);
      this.notice.set(issue.summary.key + ' created in Backlog.');
    }, current);
  }
}
