import { type IssueRecord, type IssueCard } from '../../issue-model';
import { ModernIssuesApi } from '../../modern-issues.api';
import type { ModernIssueView } from '../../../../api/generated/types.gen';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  computed,
  inject,
  input,
  output,
  signal,
  untracked,
  Injector,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import type {
  DependencyView,
  AddDependencyFields,
  RemoveDependencyFields,
} from '../../../../api/generated/types.gen';
import { zAddDependencyFields, zRemoveDependencyFields } from '../../../../api/generated/zod.gen';
import { AuthService } from '../../../../core/auth/auth.service';
import { RetryIntent } from '../../../../core/api/api-result';
import { RequestState } from '../../../../shared/ui/request-state';
import { RequestStatusComponent } from '../../../../shared/ui/request-status.component';
import { focusAfterRender } from '../../../../shared/ui/focus-after-render';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { RelatedIssueRowComponent } from '../related-issue-row/related-issue-row.component';
import { IssuesApi } from '../../issues.api';
type Direction = 'blocked_by' | 'blocks';
@Component({
  selector: 'gg-dependencies',
  imports: [IconComponent, RelatedIssueRowComponent, ReactiveFormsModule, RequestStatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './dependencies.component.css',
  templateUrl: './dependencies.component.html',
})
export class DependenciesComponent {
  readonly issue = input.required<IssueRecord>();
  readonly changed = output<void>();
  readonly modernCurrent = output<ModernIssueView>();
  private readonly modernApi = inject(ModernIssuesApi);
  private readonly api = inject(IssuesApi);
  private readonly auth = inject(AuthService);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private generation = 0;
  readonly state = new RequestState();
  readonly searchState = new RequestState();
  readonly searchPending = signal(false);
  readonly searching = computed(() => this.searchPending() || this.searchState.busy());
  readonly activeCandidate = signal(-1);
  private searchGeneration = 0;
  private searchTimer: ReturnType<typeof setTimeout> | undefined;
  readonly notice = signal('');
  readonly blockedBy = signal<DependencyView[]>([]);
  readonly blocks = signal<DependencyView[]>([]);
  readonly blockedCursor = signal<string | null>(null);
  readonly blocksCursor = signal<string | null>(null);
  readonly candidates = signal<IssueCard[]>([]);
  readonly candidateCursor = signal<string | null>(null);
  readonly selected = signal<IssueCard | null>(null);
  readonly searched = signal(false);
  readonly adding = signal(false);
  readonly controlId = 'dependency-' + crypto.randomUUID();
  beginAdd(): void {
    this.adding.set(true);
    void this.search();
    focusAfterRender(this.controlId + '-query', this.injector);
  }
  cancelAdd(): void {
    if (this.state.busy()) return;
    this.cancelScheduledSearch();
    this.adding.set(false);
    this.selected.set(null);
    this.candidates.set([]);
    this.searched.set(false);
    this.candidateCursor.set(null);
    this.searchGeneration++;
    this.searchState.busy.set(false);
    this.searchState.clear();
    this.form.reset(undefined, { emitEvent: false });
    this.retry.finish();
    this.state.clear();
    focusAfterRender(this.controlId + '-add', this.injector);
  }
  readonly form = new FormGroup({ query: new FormControl('', { nonNullable: true }) });
  private candidateQuery = '';
  private readonly retry = new RetryIntent<{
    issueId: string;
    action: string;
    body: AddDependencyFields | RemoveDependencyFields;
    blockerId: string;
  }>();
  private readonly rootId = computed(() => this.issue().summary.id);
  constructor() {
    this.form.controls.query.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      if (!this.adding()) return;
      this.cancelScheduledSearch();
      this.searchGeneration++;
      this.searchState.busy.set(false);
      this.searchState.clear();
      this.candidates.set([]);
      this.candidateCursor.set(null);
      this.selected.set(null);
      this.searched.set(false);
      this.activeCandidate.set(-1);
      this.searchPending.set(true);
      this.searchTimer = setTimeout(() => {
        this.searchTimer = undefined;
        void this.search();
      }, 120);
    });
    this.destroyRef.onDestroy(() => {
      this.generation++;
      this.searchGeneration++;
      this.cancelScheduledSearch();
    });
    effect(() => {
      this.rootId();
      this.auth.sessionEpoch();
      untracked(() => {
        this.cancelScheduledSearch();
        this.generation++;
        this.searchGeneration++;
        this.searchState.busy.set(false);
        this.searchState.clear();
        this.activeCandidate.set(-1);
        this.adding.set(false);
        this.blockedBy.set([]);
        this.blocks.set([]);
        this.candidates.set([]);
        this.selected.set(null);
        this.searched.set(false);
        this.blockedCursor.set(null);
        this.blocksCursor.set(null);
        this.candidateCursor.set(null);
        this.form.reset(undefined, { emitEvent: false });
        this.candidateQuery = '';
        this.notice.set('');
        this.state.clear();
        this.state.busy.set(false);
        this.retry.finish();
        if (this.auth.me()) void this.load();
      });
    });
  }
  private cancelScheduledSearch(): void {
    if (this.searchTimer !== undefined) clearTimeout(this.searchTimer);
    this.searchTimer = undefined;
    this.searchPending.set(false);
  }
  writable(): boolean {
    return this.issue().capabilities.includes('manage_dependencies');
  }
  private run(action: () => Promise<void>): Promise<void> {
    const generation = this.generation;
    return this.state.run(action, () => generation === this.generation);
  }
  async load(): Promise<void> {
    await this.run(async () => {
      const generation = this.generation;
      const id = this.issue().summary.id;
      const [blocked, blocks] = await Promise.all([
        this.api.dependencies(id, 'blocked_by'),
        this.api.dependencies(id, 'blocks'),
      ]);
      if (generation !== this.generation) return;
      this.blockedBy.set(blocked.items);
      this.blocks.set(blocks.items);
      this.blockedCursor.set(blocked.nextCursor);
      this.blocksCursor.set(blocks.nextCursor);
    });
  }
  async more(direction: Direction): Promise<void> {
    const cursor = direction === 'blocked_by' ? this.blockedCursor() : this.blocksCursor();
    if (!cursor) return;
    await this.run(async () => {
      const generation = this.generation;
      const page = await this.api.dependencies(this.issue().summary.id, direction, cursor);
      if (generation !== this.generation) return;
      if (direction === 'blocked_by') {
        this.blockedBy.update(all => [...all, ...page.items]);
        this.blockedCursor.set(page.nextCursor);
      } else {
        this.blocks.update(all => [...all, ...page.items]);
        this.blocksCursor.set(page.nextCursor);
      }
    });
  }
  async search(cursor?: string): Promise<void> {
    if (!this.adding()) return;
    this.cancelScheduledSearch();
    if (!cursor) {
      this.searchGeneration++;
      this.candidateQuery = this.form.controls.query.value.trim();
      this.searchState.busy.set(false);
      this.candidateCursor.set(null);
      this.activeCandidate.set(-1);
    }
    const generation = this.generation,
      searchGeneration = this.searchGeneration,
      root = this.issue().summary,
      epoch = this.auth.sessionEpoch();
    const current = () =>
      !this.destroyRef.destroyed &&
      this.adding() &&
      generation === this.generation &&
      searchGeneration === this.searchGeneration &&
      root.id === this.rootId() &&
      epoch === this.auth.sessionEpoch();
    await this.searchState.run(async () => {
      const page = await this.modernApi.search(
        {
          projectIds: [root.projectId],
          ...(this.candidateQuery ? { query: this.candidateQuery } : {}),
        },
        cursor,
      );
      if (!current()) return;
      const existing = cursor ? this.candidates() : [],
        ids = new Set(existing.map(item => item.id));
      this.candidates.set([
        ...existing,
        ...page.items.filter(item => item.id !== root.id && !ids.has(item.id)),
      ]);
      this.candidateCursor.set(page.nextCursor);
      this.searched.set(true);
    }, current);
  }
  candidateKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.cancelAdd();
      return;
    }
    if (event.key === 'Enter' && this.activeCandidate() >= 0 && !this.searching()) {
      event.preventDefault();
      const candidate = this.candidates()[this.activeCandidate()];
      if (candidate) this.select(candidate);
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const last = this.candidates().length - 1;
    if (last < 0 || this.searching()) return;
    event.preventDefault();
    this.activeCandidate.set(
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? last
          : event.key === 'ArrowDown'
            ? Math.min(last, this.activeCandidate() + 1)
            : Math.max(0, this.activeCandidate() - 1),
    );
    queueMicrotask(() =>
      document
        .getElementById(this.controlId + '-candidate-' + this.activeCandidate())
        ?.scrollIntoView({ block: 'nearest' }),
    );
  }
  select(candidate: IssueCard): void {
    this.selected.set(candidate);
    this.retry.finish();
    this.state.clear();
    focusAfterRender(this.controlId + '-confirm', this.injector);
  }
  async add(): Promise<void> {
    const candidate = this.selected(),
      root = this.issue();
    if (!candidate || !this.writable()) return;
    const body = zAddDependencyFields.parse({
      blockerId: candidate.id,
      expectedIssueRevision: root.summary.revision,
      expectedGraphRevision: root.graphRevision,
    });
    await this.run(async () => {
      const generation = this.generation;
      await this.api.addDependency(
        root.summary.id,
        body,
        this.retry.reference({
          issueId: root.summary.id,
          action: 'add',
          blockerId: candidate.id,
          body,
        }),
      );
      if (generation !== this.generation) return;
      this.retry.finish();
      this.cancelScheduledSearch();
      this.adding.set(false);
      this.selected.set(null);
      this.candidates.set([]);
      this.searched.set(false);
      this.candidateCursor.set(null);
      this.searchGeneration++;
      this.searchState.busy.set(false);
      this.searchState.clear();
      this.form.reset(undefined, { emitEvent: false });
      focusAfterRender(this.controlId + '-add', this.injector);
      this.notice.set('Blocker linked. The dependent issue keeps its status.');
      this.changed.emit();
    });
    if (!this.state.message()) await this.load();
  }
  async remove(link: DependencyView): Promise<void> {
    const root = this.issue();
    if (!this.writable()) return;
    const body = zRemoveDependencyFields.parse({
      expectedIssueRevision: root.summary.revision,
      expectedDependencyRevision: link.revision,
      expectedGraphRevision: root.graphRevision,
    });
    await this.run(async () => {
      const generation = this.generation;
      await this.api.removeDependency(
        root.summary.id,
        link.blocker.id,
        body,
        this.retry.reference({
          issueId: root.summary.id,
          action: 'remove',
          blockerId: link.blocker.id,
          body,
        }),
      );
      if (generation !== this.generation) return;
      this.retry.finish();
      this.notice.set('Blocker removed. Its relationship history is retained.');
      this.changed.emit();
    });
    if (!this.state.message()) await this.load();
  }
  async review(): Promise<void> {
    await this.run(async () => {
      const generation = this.generation;
      const fresh = await this.modernApi.get(this.issue().summary.id);
      if (generation !== this.generation) return;
      this.retry.finish();
      this.modernCurrent.emit(fresh);
      this.notice.set('Current relationships loaded. Your selected blocker is retained.');
    });
    if (!this.state.message()) await this.load();
  }
}
