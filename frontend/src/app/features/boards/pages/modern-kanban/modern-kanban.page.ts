import { RelatedIssueRowComponent } from '../../../issues/components/related-issue-row/related-issue-row.component';
import { nativeBoardLanes } from '../../native-board-lanes';
import { boardEpicMap, issueLaneId, type BoardGrouping } from '../../board-lanes';
import { BoardQuickFiltersComponent } from '../../components/board-quick-filters/board-quick-filters.component';
import { NativeBoardFiltersComponent } from '../../components/native-board-filters/native-board-filters.component';
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
  input,
  signal,
  untracked,
  viewChild,
  viewChildren,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  CdkDrag,
  CdkDropList,
  CdkDropListGroup,
  CdkDragPlaceholder,
  type CdkDragDrop,
} from '@angular/cdk/drag-drop';
import type {
  IssueFilter,
  IssueTransitionOption,
  ModernCreateFields,
  ModernIssueSummary,
} from '../../../../api/generated/types.gen';
import { AuthService } from '../../../../core/auth/auth.service';
import { DraftsService } from '../../../../core/drafts/drafts.service';
import { foregroundRefresh } from '../../../../core/refresh/foreground-refresh';
import { RequestState } from '../../../../shared/ui/request-state';
import { RequestStatusComponent } from '../../../../shared/ui/request-status.component';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { ModernIssueDetailPage } from '../../../issues/pages/issue-detail/modern-issue-detail.page';
import { ModernIssuesApi } from '../../../issues/modern-issues.api';
import { ModernIssueFormComponent } from '../../../issues/components/modern-issue-form/modern-issue-form.component';
import { NativeIssueCardComponent } from '../../components/native-issue-card/native-issue-card.component';
import { ModernBoardsStore, type NativeBoardColumn } from '../../modern-boards.store';
interface Destination {
  issue: ModernIssueSummary;
  columnId: string;
  neighbor: string | null;
  placement: 'before' | 'after' | 'last';
  choices: IssueTransitionOption[];
}
@Component({
  selector: 'gg-modern-kanban',
  providers: [ModernBoardsStore],
  imports: [
    RelatedIssueRowComponent,
    BoardQuickFiltersComponent,
    NativeBoardFiltersComponent,
    RouterLink,
    ReactiveFormsModule,
    CdkDrag,
    CdkDropList,
    CdkDropListGroup,
    CdkDragPlaceholder,
    RequestStatusComponent,
    IconComponent,
    ModernIssueDetailPage,
    ModernIssueFormComponent,
    NativeIssueCardComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './modern-kanban.page.html',
  styleUrls: [
    '../kanban/kanban.page.css',
    '../../components/board-lane-column/board-lane-column.component.css',
  ],
})
export class ModernKanbanPage {
  private readonly route = inject(ActivatedRoute);
  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  readonly boardIdInput = input('', { alias: 'boardId' });
  readonly boardId = computed(() => this.boardIdInput() || (this.params().get('boardId') ?? ''));
  readonly store = inject(ModernBoardsStore);
  private readonly auth = inject(AuthService);
  private readonly issues = inject(ModernIssuesApi);
  private readonly drafts = inject(DraftsService);
  private readonly injector = inject(Injector);
  private readonly destroy = inject(DestroyRef);
  readonly searchPending = signal(false);
  readonly query = new FormControl('', { nonNullable: true });
  readonly previewId = signal<string | null>(null);
  readonly creating = signal(false);
  readonly draggingId = signal<string | null>(null);
  readonly grouping = signal<BoardGrouping>('none');
  readonly collapsed = signal<Set<string>>(new Set());
  readonly activeColumn = signal('');
  readonly lanes = computed(() => nativeBoardLanes(this.store.columns(), this.grouping()));
  readonly epics = computed(() => boardEpicMap(this.store.columns()));
  readonly destination = signal<Destination | null>(null);
  readonly actionState = new RequestState();
  readonly createState = new RequestState();
  readonly busy = computed(
    () =>
      this.store.state.busy() ||
      this.actionState.busy() ||
      this.createState.busy() ||
      !!this.store.pending(),
  );
  private searchTimer: ReturnType<typeof setTimeout> | undefined;
  private createGeneration = 0;
  private createIntent: { projectId: string; body: ModernCreateFields; reference: string } | null =
    null;
  private readonly previewDialog = viewChild<ElementRef<HTMLDialogElement>>('previewDialog');
  private readonly createTrigger = viewChild<ElementRef<HTMLButtonElement>>('createTrigger');
  private readonly createDialog = viewChild<ElementRef<HTMLDialogElement>>('createDialog');
  private readonly stageDialog = viewChild<ElementRef<HTMLDialogElement>>('stageDialog');
  private readonly createForm = viewChild(ModernIssueFormComponent);
  private readonly scroll = viewChild<ElementRef<HTMLElement>>('scroll');
  private readonly columnElements = viewChildren<ElementRef<HTMLElement>>('columnElement');
  private observer: IntersectionObserver | undefined;
  constructor() {
    effect(() => {
      const id = this.boardId(),
        epoch = this.auth.sessionEpoch();
      if (!id) return;
      if (this.auth.me())
        untracked(() => {
          this.createGeneration++;
          this.createIntent = null;
          this.grouping.set('none');
          this.collapsed.set(new Set());
          this.activeColumn.set('');
          this.previewId.set(null);
          this.creating.set(false);
          this.destination.set(null);
          this.stageDialog()?.nativeElement.close();
          this.createDialog()?.nativeElement.close();
          this.actionState.busy.set(false);
          this.createState.busy.set(false);
          this.actionState.clear();
          this.createState.clear();
          void this.store.open(id);
        });
      void epoch;
    });
    this.query.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.searchPending.set(true);
      if (this.searchTimer) clearTimeout(this.searchTimer);
      this.searchTimer = setTimeout(() => {
        this.searchTimer = undefined;
        this.search();
      }, 120);
    });
    effect(() => {
      this.columnElements();
      this.store.columns();
      this.store.loading();
      untracked(() => afterNextRender(() => this.observeColumns(), { injector: this.injector }));
    });
    effect(() => {
      if (this.searchPending() && !this.busy() && !this.store.pending() && !this.searchTimer)
        untracked(() => this.search());
    });
    this.destroy.onDestroy(() => {
      if (this.searchTimer) clearTimeout(this.searchTimer);
      this.observer?.disconnect();
    });
    foregroundRefresh(
      () =>
        !!this.auth.me() &&
        !this.busy() &&
        !this.store.loading() &&
        !this.draggingId() &&
        !this.previewId() &&
        !this.creating() &&
        !this.destination() &&
        !this.drafts.dirtyCount(),
      () => this.store.refresh(),
    );
  }
  private observeColumns(): void {
    this.observer?.disconnect();
    if (this.store.loading()) return;
    const root = this.scroll()?.nativeElement;
    if (!root) return;
    this.observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.target instanceof HTMLElement) {
            const id = entry.target.dataset['columnId'];
            if (id) void this.store.loadColumn(id);
          }
        }
      },
      { root, rootMargin: '0px 80px', threshold: 0.01 },
    );
    for (const element of this.columnElements()) this.observer.observe(element.nativeElement);
  }
  filtersChanged(filter: IssueFilter): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = undefined;
    this.query.setValue(filter.query ?? '', { emitEvent: false });
    this.searchPending.set(false);
    if (!this.busy()) void this.store.open(this.boardId(), filter, true);
  }
  search(): void {
    if (this.query.value.length > 200) {
      this.searchPending.set(false);
      return;
    }
    if (this.busy()) return;
    this.searchPending.set(false);
    const { query, ...filters } = this.store.filters();
    const term = this.query.value.trim();
    void this.store.open(this.boardId(), term ? { ...filters, query: term } : filters, true);
  }
  toggleMine(): void {
    if (this.busy()) return;
    const { assignee, ...filters } = this.store.filters();
    void this.store.open(
      this.boardId(),
      assignee?.kind === 'self' ? filters : { ...filters, assignee: { kind: 'self' } },
      true,
    );
  }
  closeFilters(panel: HTMLDetailsElement, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    panel.open = false;
    panel.querySelector('summary')?.focus();
  }
  syncVisibleColumn(): void {
    const root = this.scroll()?.nativeElement,
      columns = this.store.view()?.columns;
    if (!root || !columns?.length) return;
    const maximum = root.scrollWidth - root.clientWidth;
    if (root.scrollLeft <= 1 || maximum <= 1) {
      this.activeColumn.set(columns[0]!.id);
      return;
    }
    if (root.scrollLeft >= maximum - 1) {
      this.activeColumn.set(columns.at(-1)!.id);
      return;
    }
    const left = root.getBoundingClientRect().left;
    let nearest = '',
      distance = Number.POSITIVE_INFINITY;
    for (const column of this.columnElements()) {
      const offset = Math.abs(column.nativeElement.getBoundingClientRect().left - left);
      if (offset < distance) {
        nearest = column.nativeElement.dataset['columnId'] ?? '';
        distance = offset;
      }
    }
    if (nearest) this.activeColumn.set(nearest);
  }
  jumpColumn(event: Event): void {
    if (!(event.target instanceof HTMLSelectElement)) return;
    const id = event.target.value;
    const element = this.columnElements().find(
      column => column.nativeElement.dataset['columnId'] === id,
    );
    element?.nativeElement.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'start',
    });
  }
  clearFilters(): void {
    this.query.setValue('', { emitEvent: false });
    void this.store.open(this.boardId(), {}, true);
  }
  groupChanged(event: Event): void {
    if (!(event.target instanceof HTMLSelectElement)) return;
    const value = event.target.value;
    if (value === 'none' || value === 'assignee' || value === 'epic') {
      this.grouping.set(value);
      this.collapsed.set(new Set());
    }
  }
  toggleLane(id: string): void {
    this.collapsed.update(previous => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  readonly canEnter = (
    drag: CdkDrag<ModernIssueSummary>,
    list: CdkDropList<NativeBoardColumn & { laneId: string }>,
  ): boolean => issueLaneId(drag.data, this.grouping(), this.epics()) === list.data.laneId;
  drop(
    event: CdkDragDrop<
      NativeBoardColumn & { laneId: string },
      NativeBoardColumn & { laneId: string },
      ModernIssueSummary
    >,
  ): void {
    this.draggingId.set(null);
    if (!event.isPointerOverContainer) return;
    if (this.busy() || !this.store.writable()) return;
    if (event.previousContainer === event.container && event.previousIndex === event.currentIndex)
      return;
    const issue = event.item.data,
      column = event.container.data;
    if (issueLaneId(issue, this.grouping(), this.epics()) !== column.laneId) return;
    const peers = column.items.filter(item => item.id !== issue.id);
    const neighbor = peers[event.currentIndex];
    const last = peers.at(-1);
    if (neighbor) void this.chooseDestination(issue, column.summary.id, neighbor.id, 'before');
    else if (column.cursor && last)
      void this.chooseDestination(issue, column.summary.id, last.id, 'after');
    else void this.chooseDestination(issue, column.summary.id, null, 'last');
  }
  async chooseDestination(
    issue: ModernIssueSummary,
    columnId: string,
    neighbor: string | null = null,
    placement: 'before' | 'after' | 'last' = 'last',
  ): Promise<void> {
    if (this.busy() || !this.store.writable()) return;
    const column = this.store.columns().find(c => c.summary.id === columnId);
    if (!column) return;
    if (column.summary.stages.some(mapping => mapping.stage.id === issue.stage.id)) {
      await this.store.place(issue, columnId, neighbor, placement);
      return;
    }
    const epoch = this.auth.sessionEpoch(),
      board = this.boardId();
    await this.actionState.run(
      async () => {
        const options: IssueTransitionOption[] = [];
        let cursor: string | undefined;
        do {
          const page = await this.issues.transitions(issue.id, cursor);
          if (epoch !== this.auth.sessionEpoch() || board !== this.boardId()) return;
          options.push(...page.items);
          cursor = page.nextCursor ?? undefined;
        } while (cursor);
        const choices = options.filter(
          option =>
            option.canRequest &&
            column.summary.stages.some(mapping => mapping.stage.id === option.stage.id),
        );
        if (!choices.length) {
          this.actionState.message.set('This workflow has no eligible move to that column.');
          return;
        }
        const destination = { issue, columnId, neighbor, placement, choices };
        if (choices.length === 1 && choices[0]?.reviewSatisfied) {
          await this.store.place(
            issue,
            columnId,
            neighbor,
            placement,
            choices[0]?.stage.id ?? null,
          );
          return;
        }
        this.destination.set(destination);
        afterNextRender(() => this.stageDialog()?.nativeElement.showModal(), {
          injector: this.injector,
        });
      },
      () => epoch === this.auth.sessionEpoch() && board === this.boardId(),
    );
  }
  async selectStage(id: string): Promise<void> {
    const destination = this.destination();
    if (!destination) return;
    this.closeDestination();
    await this.store.place(
      destination.issue,
      destination.columnId,
      destination.neighbor,
      destination.placement,
      id,
    );
  }
  closeDestination(): void {
    this.stageDialog()?.nativeElement.close();
    this.destination.set(null);
  }
  openPreview(id: string): void {
    if (this.draggingId()) return;
    this.previewId.set(id);
    afterNextRender(() => this.previewDialog()?.nativeElement.showModal(), {
      injector: this.injector,
    });
  }
  async closePreview(): Promise<void> {
    if (!this.drafts.mayLeave()) return;
    this.previewDialog()?.nativeElement.close();
    this.previewId.set(null);
    await this.store.refresh();
  }
  openCreate(): void {
    if (!this.store.writable() || this.busy()) return;
    this.creating.set(true);
    afterNextRender(
      () => {
        const dialog = this.createDialog()?.nativeElement;
        dialog?.showModal();
        dialog?.querySelector<HTMLInputElement>('#issue-title')?.focus();
      },
      { injector: this.injector },
    );
  }
  cancelCreate(): void {
    if (this.createState.busy() || !this.drafts.mayLeave()) return;
    this.createDialog()?.nativeElement.close();
    this.creating.set(false);
    this.createTrigger()?.nativeElement.focus();
  }
  async create(fields: ModernCreateFields): Promise<void> {
    const projectId = this.store.view()?.board.projectId,
      form = this.createForm();
    if (!projectId || !form) return;
    const epoch = this.auth.sessionEpoch(),
      boardId = this.boardId(),
      generation = this.createGeneration;
    const owner = () =>
      !this.destroy.destroyed &&
      epoch === this.auth.sessionEpoch() &&
      boardId === this.boardId() &&
      generation === this.createGeneration;
    const current = () => owner() && form === this.createForm();
    await this.createState.run(
      async () => {
        const created = form.createdIssueId();
        let issue;
        if (created) issue = await this.issues.get(created);
        else {
          this.createIntent ??= {
            projectId,
            body: structuredClone(fields),
            reference: crypto.randomUUID(),
          };
          const saved = await this.issues.create(
            this.createIntent.projectId,
            this.createIntent.body,
            this.createIntent.reference,
          );
          issue = saved.result;
        }
        if (!current()) return;
        issue = await form.finishUploads(issue);
        if (!current()) return;
        form.saved();
        this.createIntent = null;
        this.createDialog()?.nativeElement.close();
        this.creating.set(false);
        await this.store.refresh();
        if (!owner()) return;
        this.openPreview(issue.summary.id);
      },
      owner,
    );
    if (!current()) return;
    const failure = this.createState.failure();
    if (failure && !failure.payload.error.retryable) this.createIntent = null;
  }
}
