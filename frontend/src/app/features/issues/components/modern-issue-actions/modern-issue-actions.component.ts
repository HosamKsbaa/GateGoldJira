import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import type {
  IssueEditable,
  ModernIssueView,
  ModernIssueSummary,
  LinkFields,
} from '../../../../api/generated/types.gen';
import { AuthService } from '../../../../core/auth/auth.service';
import { RetryIntent } from '../../../../core/api/api-result';
import { RequestState } from '../../../../shared/ui/request-state';
import { RequestStatusComponent } from '../../../../shared/ui/request-status.component';
import { ModernIssueStatusMenuComponent } from '../modern-issue-status-menu/modern-issue-status-menu.component';
import { IssuesApi } from '../../issues.api';
import { ModernIssuesApi } from '../../modern-issues.api';
import { modernEditable } from '../../issue-model';

@Component({
  selector: 'gg-modern-issue-actions',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    RequestStatusComponent,
    ModernIssueStatusMenuComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ` <section class="quick-issue-actions" aria-label="Issue actions">
    <gg-request-status [state]="state" />
    <gg-request-status [state]="reviewState" />
    @if (conflict()) {
      <div class="notice"
        ><p>This issue changed. Review the latest details before trying your action again.</p
        ><button type="button" class="secondary" (click)="review()" [disabled]="busy()"
          >Review latest issue details</button
        ></div
      >
    }
    @if (notice()) {
      <p role="status">{{ notice() }}</p>
    }
    <div class="actions primary-actions">
      @if (issue().capabilities.includes('move')) {
        <gg-modern-issue-status-menu
          [issue]="issue()"
          [disabled]="busy()"
          (selected)="move($event)"
        />
      } @else {
        <span class="readonly-status"
          >{{ issue().summary.stage.name }} · <span>Read-only access</span></span
        >
      }
      <ng-content />
      <button
        type="button"
        class="secondary"
        (click)="watch()"
        [attr.aria-pressed]="!!issue().watching"
        [disabled]="busy()"
        >{{ issue().watching ? 'Watching' : 'Watch issue' }}</button
      >
      @if (issue().capabilities.includes('edit')) {
        <details class="more-actions"
          ><summary>More actions</summary
          ><div class="actions"
            ><button type="button" class="secondary" (click)="clone()" [disabled]="busy()"
              >Clone issue</button
            ><button
              type="button"
              class="secondary"
              (click)="organize('archived', !issue().summary.archived)"
              [disabled]="busy()"
              >{{ issue().summary.archived ? 'Restore issue' : 'Archive issue' }}</button
            >
            @if (issue().summary.stage.category === 'todo') {
              <button
                type="button"
                class="secondary"
                (click)="organize('backlog', !issue().summary.backlog)"
                [disabled]="busy()"
                >{{ issue().summary.backlog ? 'Add to board' : 'Move to backlog' }}</button
              >
            }</div
          ><p class="field-hint"
            >Cloning copies fields and text into a new task. Files, comments, links and subtasks
            stay with the original.</p
          ></details
        >
      }
    </div>
    @if (issue().summary.archived) {
      <p class="notice"
        >Archived · This issue and its history remain accessible. Restore it to show it in active
        work.</p
      >
    }
    @if (issue().summary.backlog) {
      <p class="notice">In backlog · Add to the board when it is ready to start.</p>
    }
    <details (toggle)="relatedOpenChanged($event)"
      ><summary>Related issues ({{ issue().links.length }})</summary>
      <ul class="related-links">
        @for (link of issue().links; track link.issueId + link.targetId + link.kind) {
          <li
            ><span>{{
              link.kind === 'relates_to'
                ? 'Relates to'
                : link.issueId === issue().summary.id
                  ? 'Duplicates'
                  : 'Duplicated by'
            }}</span>
            <a [routerLink]="['/issues', otherId(link)]"
              ><bdi>{{ link.key }} · {{ link.title }}</bdi></a
            >
            @if (issue().capabilities.includes('edit')) {
              <button type="button" class="secondary" [disabled]="busy()" (click)="unlink(link)"
                >Remove link</button
              >
            }
          </li>
        }
      </ul>
      @if (issue().capabilities.includes('edit')) {
        <label
          >Find related issue<input
            type="search"
            [formControl]="relatedQuery"
            aria-label="Related issue search"
            dir="auto"
            placeholder="Issue number, key or title"
            [attr.aria-busy]="searchPending() || searchState.busy()"
            (keydown.enter)="$event.preventDefault(); searchLinks(relatedQuery.value)"
        /></label>
        @if (searchPending() || searchState.busy()) {
          <p class="field-hint" role="status">Searching related issues…</p>
        }
        <label
          >Relation<select #kind aria-label="Issue relation"
            ><option value="relates_to">Relates to</option
            ><option value="duplicates">Duplicates</option></select
          ></label
        ><gg-request-status [state]="searchState" /><ul class="related-results">
          @for (candidate of candidates(); track candidate.id) {
            <li
              ><bdi>{{ candidate.key }} · {{ candidate.title }}</bdi
              ><button
                type="button"
                class="secondary"
                (click)="link(candidate.id, kind.value)"
                [disabled]="searchPending() || searchState.busy() || busy()"
                >Link issue</button
              ></li
            >
          }
        </ul>
        @if (searched() && !candidates().length && !searchPending() && !searchState.busy()) {
          <p class="field-hint" role="status">No matching other issues.</p>
        }
        @if (candidateCursor()) {
          <button
            type="button"
            class="secondary"
            (click)="searchLinks(relatedQuery.value, true)"
            [disabled]="searchPending() || searchState.busy() || busy()"
            >More related issues</button
          >
        }
      }
    </details>
  </section>`,
  styleUrl: '../issue-actions/issue-actions.component.css',
})
export class ModernIssueActionsComponent {
  readonly issue = input.required<ModernIssueView>();
  readonly disabled = input(false);
  readonly changed = output<ModernIssueView>();
  private readonly api = inject(IssuesApi);
  private readonly modern = inject(ModernIssuesApi);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyed = inject(DestroyRef);
  readonly relatedQuery = new FormControl('', { nonNullable: true });
  readonly searchPending = signal(false);
  readonly searchState = new RequestState();
  readonly candidateCursor = signal<string | null>(null);
  readonly searched = signal(false);
  private searchGeneration = 0;
  private searchQuery = '';
  private searchTimer: ReturnType<typeof setTimeout> | undefined;
  readonly state = new RequestState();
  readonly notice = signal('');
  readonly candidates = signal<ModernIssueSummary[]>([]);
  readonly conflict = computed(() => this.state.failure()?.payload.error.code === 'conflict');
  readonly reviewState = new RequestState();
  async review(): Promise<void> {
    if (!this.conflict() || this.busy()) return;
    const id = this.issueId(), epoch = this.auth.sessionEpoch();
    const current = () => !this.destroyed.destroyed && id === this.issueId() && epoch === this.auth.sessionEpoch();
    // Link/organization commands may return a legacy current projection. Read
    // the authoritative modern issue only after the user chooses to review it.
    await this.reviewState.run(async () => {
      const fresh = await this.modern.get(id);
      if (!current()) return;
      this.changed.emit(fresh);
      this.state.clear();
      this.retry.finish();
    }, current);
  }
  readonly busy = computed(() => this.disabled() || this.state.busy() || this.reviewState.busy());
  private readonly retry = new RetryIntent<object>();
  private readonly issueId = computed(() => this.issue().summary.id);
  constructor() {
    this.destroyed.onDestroy(() => this.cancelSearch());
    this.relatedQuery.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(query => this.linkQueryChanged(query));
    effect(() => {
      this.issueId();
      this.auth.sessionEpoch();
      untracked(() => {
        this.cancelSearch();
        this.relatedQuery.reset('', { emitEvent: false });
        this.candidates.set([]);
        this.candidateCursor.set(null);
        this.searched.set(false);
        this.searchState.busy.set(false);
        this.searchState.clear();
        this.retry.finish();
        this.state.clear();
        this.reviewState.clear();
        this.reviewState.busy.set(false);
        this.notice.set('');
      });
    });
  }
  private async run(
    intent: object,
    action: (ref: string) => Promise<ModernIssueView | void>,
  ): Promise<void> {
    if (this.busy()) return;
    const id = this.issueId(),
      epoch = this.auth.sessionEpoch();
    await this.state.run(
      async () => {
        const result = await action(this.retry.reference(intent));
        if (epoch !== this.auth.sessionEpoch() || id !== this.issueId()) return;
        this.retry.finish();
        if (result) this.changed.emit(result);
      },
      () => epoch === this.auth.sessionEpoch() && id === this.issueId(),
    );
  }
  async move(stageId: string): Promise<void> {
    const current = this.issue();
    if (stageId === current.summary.stage.id) return;
    const body = { expectedRevision: current.summary.revision, targetStageId: stageId };
    await this.run(
      { kind: 'move', id: current.summary.id, body },
      async ref => (await this.modern.move(current.summary.id, body, ref)).result,
    );
  }
  async organize(field: 'archived' | 'backlog', value: boolean): Promise<void> {
    const current = this.issue(),
      body = { expectedRevision: current.summary.revision, [field]: value };
    await this.run({ kind: 'organize', id: current.summary.id, body }, async ref => {
      await this.api.organize(current.summary.id, body, ref);
      return this.modern.get(current.summary.id);
    });
  }
  async watch(): Promise<void> {
    const current = this.issue(),
      watching = !current.watching;
    await this.run({ kind: 'watch', id: current.summary.id, watching }, async ref => {
      await this.api.watch(current.summary.id, watching, ref);
      return { ...this.issue(), watching };
    });
  }
  private cancelSearch(): void {
    this.searchGeneration++;
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = undefined;
    this.searchPending.set(false);
  }
  relatedOpenChanged(event: Event): void {
    if (!(event.target instanceof HTMLDetailsElement)) return;
    if (event.target.open) void this.searchLinks(this.relatedQuery.value);
    else {
      this.cancelSearch();
      this.searchState.busy.set(false);
    }
  }
  linkQueryChanged(query: string): void {
    this.cancelSearch();
    this.searchState.busy.set(false);
    this.searchState.clear();
    this.candidateCursor.set(null);
    this.candidates.set([]);
    this.searched.set(false);
    this.searchPending.set(true);
    this.searchTimer = setTimeout(() => void this.searchLinks(query), 120);
  }
  async searchLinks(query: string, more = false): Promise<void> {
    if (!more) {
      this.cancelSearch();
      this.searchQuery = query.trim();
      this.candidateCursor.set(null);
      this.searchState.busy.set(false);
    }
    const generation = this.searchGeneration,
      id = this.issueId(),
      epoch = this.auth.sessionEpoch(),
      cursor = more ? this.candidateCursor() : null;
    const current = () =>
      !this.destroyed.destroyed &&
      generation === this.searchGeneration &&
      id === this.issueId() &&
      epoch === this.auth.sessionEpoch();
    await this.searchState.run(async () => {
      const page = await this.modern.search(
        { projectIds: [this.issue().summary.projectId], query: this.searchQuery },
        cursor ?? undefined,
      );
      if (!current()) return;
      const existing = more ? this.candidates() : [];
      const ids = new Set(existing.map(item => item.id));
      this.candidates.set([
        ...existing,
        ...page.items.filter(item => item.id !== id && !ids.has(item.id)),
      ]);
      this.candidateCursor.set(page.nextCursor);
      this.searched.set(true);
    }, current);
  }
  otherId(link: NonNullable<ModernIssueView['links']>[number]): string {
    return link.issueId === this.issueId() ? link.targetId : link.issueId;
  }
  async link(id: string, kind: string): Promise<void> {
    if (kind !== 'relates_to' && kind !== 'duplicates') return;
    await this.saveLink(this.issueId(), {
      expectedRevision: this.issue().summary.revision,
      targetId: id,
      kind,
      enabled: true,
    });
  }
  async unlink(link: NonNullable<ModernIssueView['links']>[number]): Promise<void> {
    try {
      const source = link.kind === 'duplicates' ? link.issueId : this.issueId();
      const current = source === this.issueId() ? this.issue() : await this.modern.get(source);
      await this.saveLink(source, {
        expectedRevision: current.summary.revision,
        targetId: source === this.issueId() ? this.otherId(link) : this.issueId(),
        kind: link.kind,
        enabled: false,
      });
    } catch (error: unknown) {
      await this.state.run(async () => {
        throw error;
      });
    }
  }
  private async saveLink(id: string, body: LinkFields): Promise<void> {
    await this.run({ kind: 'link', id, body }, async ref => {
      await this.api.link(id, body, ref);
      this.cancelSearch();
      this.searchState.busy.set(false);
      this.candidates.set([]);
      this.candidateCursor.set(null);
      this.searched.set(false);
      return this.modern.get(this.issueId());
    });
  }
  async clone(): Promise<void> {
    const current = this.issue();
    const fields = modernEditable(current);
    const description =
      current.descriptionFormat === 'html'
        ? (new DOMParser().parseFromString(current.description, 'text/html').body.textContent ?? '')
        : current.description;
    const body = {
      ...fields,
      title: ('Copy of ' + fields.title).slice(0, 200),
      ...(current.summary.type.behavior === 'subtask' ? { typeId: undefined } : {}),
      description,
      descriptionFormat: 'plain' as const,
    };
    await this.run({ kind: 'clone', source: current.summary.id, body }, async ref => {
      const saved = await this.modern.create(current.summary.projectId, body, ref);
      await this.router.navigate(['/issues', saved.result.summary.id]);
    });
  }
}
