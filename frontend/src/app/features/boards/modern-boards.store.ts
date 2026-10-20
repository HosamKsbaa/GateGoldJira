import { ModernIssuesApi } from '../issues/modern-issues.api';
import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import type {
  BoardCardEpic,
  LayoutView,
  LayoutColumn,
  ModernIssueSummary,
  PageModernIssueSummary,
  IssueFilter,
  NativeMoveFields,
  ProjectView,
} from '../../api/generated/types.gen';
import { AuthService } from '../../core/auth/auth.service';
import { ApiError } from '../../core/api/api-result';
import { RequestState } from '../../shared/ui/request-state';
import { ModernBoardsApi } from './modern-boards.api';
import { BoardsApi } from './boards.api';
export interface NativeBoardColumn {
  summary: LayoutColumn;
  items: ModernIssueSummary[];
  epics: BoardCardEpic[];
  cursor: string | null;
  loaded: boolean;
  loading: boolean;
  skipped: number;
}
interface NativeIntent {
  boardId: string;
  body: NativeMoveFields;
  reference: string;
  reorder: boolean;
}
@Injectable()
export class ModernBoardsStore {
  private readonly api = inject(ModernBoardsApi);
  private readonly issues = inject(ModernIssuesApi);
  private readonly projects = inject(BoardsApi);
  private readonly auth = inject(AuthService);
  private readonly destroyed = inject(DestroyRef);
  private generation = 0;
  private controller: AbortController | undefined;
  private activeCardReaders = 0;
  private readonly waitingCardReaders: Array<() => void> = [];
  readonly view = signal<LayoutView | null>(null);
  readonly project = signal<ProjectView | null>(null);
  readonly columns = signal<NativeBoardColumn[]>([]);
  readonly filters = signal<IssueFilter>({});
  readonly loading = signal(false);
  readonly state = new RequestState();
  readonly pending = signal<NativeIntent | null>(null);
  readonly notice = signal('');
  readonly unfinished = signal<PageModernIssueSummary | null>(null);
  readonly unfinishedState = new RequestState();
  private unfinishedIssueId: string | null = null;
  readonly writable = computed(
    () =>
      !!this.project() &&
      !!this.view() &&
      !this.project()?.archived &&
      !this.view()?.board.archived &&
      this.project()?.effectiveRole !== 'viewer',
  );
  constructor() {
    effect(() => {
      this.auth.sessionEpoch();
      this.reset();
    });
    this.destroyed.onDestroy(() => this.reset());
  }
  private reset(): void {
    this.controller?.abort();
    this.generation++;
    this.view.set(null);
    this.columns.set([]);
    this.project.set(null);
    this.pending.set(null);
    this.unfinished.set(null);
    this.unfinishedIssueId = null;
    this.unfinishedState.clear();
    this.unfinishedState.busy.set(false);
    this.state.clear();
    this.state.busy.set(false);
    this.loading.set(false);
  }
  async open(boardId: string, filters: IssueFilter = {}, retain = false): Promise<void> {
    if (this.pending() && !this.loading()) return;
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    const generation = ++this.generation,
      epoch = this.auth.sessionEpoch();
    const current = () =>
      generation === this.generation &&
      epoch === this.auth.sessionEpoch() &&
      !this.destroyed.destroyed;
    const loaded = new Set(
      retain
        ? this.columns()
            .filter(c => c.loaded)
            .map(c => c.summary.id)
        : [],
    );
    this.loading.set(true);
    this.filters.set(filters);
    this.state.clear();
    this.unfinished.set(null);
    this.unfinishedIssueId = null;
    this.unfinishedState.clear();
    this.unfinishedState.busy.set(false);
    if (!retain) {
      this.view.set(null);
      this.columns.set([]);
      this.project.set(null);
    }
    try {
      const view = await this.api.get(boardId, filters, controller.signal);
      if (!current()) return;
      const columns: NativeBoardColumn[] = view.columns.map(summary => ({
        summary,
        items: [],
        epics: [],
        cursor: null,
        loaded: false,
        loading: false,
        skipped: 0,
      }));
      this.view.set(view);
      this.columns.set(columns);
      const projectPromise =
        this.project()?.id === view.board.projectId
          ? Promise.resolve(this.project())
          : this.projects.project(view.board.projectId).then(project => {
              if (current()) this.project.set(project);
              return project;
            });
      // Bound initial fan-out and DOM work. Additional columns load when visible.
      const initial = columns.filter((c, index) => index < 4 || loaded.has(c.summary.id));
      let next = 0;
      await Promise.all([
        projectPromise,
        ...Array.from({ length: Math.min(3, initial.length) }, async () => {
          for (;;) {
            const column = initial[next++];
            if (!column || !current()) return;
            await this.loadColumn(column.summary.id, false, generation);
          }
        }),
      ]);
    } catch (error: unknown) {
      if (current() && !controller.signal.aborted) this.failure(error);
    } finally {
      if (current()) this.loading.set(false);
    }
  }
  async loadColumn(id: string, more = false, expectedGeneration = this.generation): Promise<void> {
    const column = this.columns().find(c => c.summary.id === id),
      view = this.view();
    if (!column || !view || column.loading || (!more && column.loaded) || (more && !column.cursor))
      return;
    const epoch = this.auth.sessionEpoch(),
      generation = expectedGeneration;
    const current = () =>
      generation === this.generation &&
      epoch === this.auth.sessionEpoch() &&
      !this.destroyed.destroyed;
    this.columns.update(columns =>
      columns.map(c => (c.summary.id === id ? { ...c, loading: true } : c)),
    );
    let releaseReader: (() => void) | undefined;
    try {
      releaseReader = await this.acquireCardReader();
      if (!current()) return;
      const page = await this.api.cards(
        view.board.id,
        id,
        this.filters(),
        more ? (column.cursor ?? undefined) : undefined,
        this.controller?.signal,
      );
      if (!current()) return;
      const items = more ? [...column.items, ...page.items] : page.items;
      const unique = items.filter(
        (item, index) => items.findIndex(other => other.id === item.id) === index,
      );
      const skipped = Math.max(0, unique.length - 200);
      const visible = new Set(unique.slice(-200).map(item => item.id));
      const epics = [
        ...new Map(
          [...(more ? column.epics : []), ...(page.epics ?? [])]
            .filter(epic => visible.has(epic.issueId))
            .map(epic => [epic.issueId, epic]),
        ).values(),
      ];
      this.columns.update(columns =>
        columns.map(c =>
          c.summary.id === id
            ? {
                summary: page.column,
                items: unique.slice(-200),
                epics,
                cursor: page.nextCursor,
                loaded: true,
                loading: false,
                skipped: (more ? column.skipped : 0) + skipped,
              }
            : c,
        ),
      );
    } catch (error: unknown) {
      if (current() && !this.controller?.signal.aborted) {
        this.failure(error);
        this.columns.update(columns =>
          columns.map(c => (c.summary.id === id ? { ...c, loading: false } : c)),
        );
      }
    } finally {
      releaseReader?.();
    }
  }
  private async acquireCardReader(): Promise<() => void> {
    if (this.activeCardReaders < 3) this.activeCardReaders++;
    else await new Promise<void>(resolve => this.waitingCardReaders.push(resolve));
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = this.waitingCardReaders.shift();
      // Transfer the reservation so a new request cannot race the waking waiter.
      if (next) next();
      else this.activeCardReaders--;
    };
  }
  async place(
    issue: ModernIssueSummary,
    targetId: string,
    neighbor: string | null,
    placement: 'before' | 'after' | 'last',
    stageId: string | null = null,
  ): Promise<void> {
    const view = this.view();
    if (!view || !this.writable() || this.state.busy() || this.loading() || this.pending()) return;
    const source = this.columns().find(c =>
      c.summary.stages.some(mapping => mapping.stage.id === issue.stage.id),
    );
    const target = this.columns().find(c => c.summary.id === targetId);
    if (!target) return;
    this.unfinished.set(null);
    this.unfinishedIssueId = null;
    this.unfinishedState.clear();
    this.unfinishedState.busy.set(false);
    const body: NativeMoveFields = {
      issueId: issue.id,
      expectedIssueRevision: issue.revision,
      expectedBoardRevision: view.board.revision,
      sourceColumnId: source?.summary.id ?? null,
      expectedSourceOrderRevision: source?.summary.orderRevision ?? null,
      targetColumnId: targetId,
      expectedTargetOrderRevision: target.summary.orderRevision,
      targetStageId: stageId,
      neighborIssueId: neighbor,
      placement,
      temporaryFilters: this.filters(),
    };
    this.pending.set({
      boardId: view.board.id,
      body: structuredClone(body),
      reference: crypto.randomUUID(),
      reorder: source?.summary.id === targetId && stageId === null,
    });
    await this.retry();
  }
  async retry(): Promise<void> {
    const intent = this.pending();
    if (!intent) return;
    const generation = this.generation,
      epoch = this.auth.sessionEpoch();
    const current = () => generation === this.generation && epoch === this.auth.sessionEpoch();
    let confirmed = false;
    await this.state.run(async () => {
      const saved = await this.api.move(
        intent.boardId,
        intent.body,
        intent.reference,
        intent.reorder,
      );
      if (!current()) return;
      this.pending.set(null);
      this.notice.set(saved.receipt.replayed ? 'Original move confirmed.' : 'Board updated.');
      confirmed = true;
    }, current);
    const failure = this.state.failure();
    if (failure && !failure.payload.error.retryable) this.pending.set(null);
    if (failure?.payload.error.code === 'prerequisite_unfinished' && current()) {
      this.unfinishedIssueId = intent.body.issueId;
      this.unfinishedState.busy.set(false);
      await this.loadPrerequisites();
    }
    if (confirmed && current()) {
      await this.open(intent.boardId, this.filters(), true);
      // A drop into a later, previously unloaded column must reveal the moved
      // card even when that column is outside the initial bounded fan-out.
      if (epoch === this.auth.sessionEpoch() && this.view()?.board.id === intent.boardId)
        await this.loadColumn(intent.body.targetColumnId);
    }
  }
  async loadPrerequisites(more = false): Promise<void> {
    const id = this.unfinishedIssueId,
      projectId = this.view()?.board.projectId;
    if (!id || !projectId) return;
    const generation = this.generation,
      epoch = this.auth.sessionEpoch();
    const current = () =>
      generation === this.generation &&
      epoch === this.auth.sessionEpoch() &&
      id === this.unfinishedIssueId &&
      !this.destroyed.destroyed;
    await this.unfinishedState.run(async () => {
      const page = await this.issues.search(
        { projectIds: [projectId], prerequisiteFor: id },
        more ? (this.unfinished()?.nextCursor ?? undefined) : undefined,
      );
      if (current())
        this.unfinished.set(
          more ? { ...page, items: [...(this.unfinished()?.items ?? []), ...page.items] } : page,
        );
    }, current);
  }
  async refresh(): Promise<void> {
    const view = this.view();
    if (view && !this.state.busy() && !this.pending())
      await this.open(view.board.id, this.filters(), true);
  }
  private failure(error: unknown): void {
    if (error instanceof ApiError) this.state.failure.set(error);
    this.state.message.set(
      error instanceof ApiError
        ? error.message
        : 'The board could not be loaded. Check your connection and retry.',
    );
  }
}
