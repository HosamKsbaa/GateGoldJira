import { NativeBoardFiltersComponent } from '../../components/native-board-filters/native-board-filters.component';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import type {
  BoardSummary,
  ColumnDraft,
  IssueFilter,
  LayoutView,
  ProjectView,
  SaveLayoutFields,
  WorkflowView,
} from '../../../../api/generated/types.gen';
import { AuthService } from '../../../../core/auth/auth.service';
import { DraftsService } from '../../../../core/drafts/drafts.service';
import { RequestState } from '../../../../shared/ui/request-state';
import { RequestStatusComponent } from '../../../../shared/ui/request-status.component';
import {
  SearchablePickerComponent,
  type PickerOption,
} from '../../../../shared/ui/searchable-picker.component';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { BoardsApi } from '../../boards.api';
import { ModernBoardsApi } from '../../modern-boards.api';
import { ProjectWorkflowsApi } from '../../../projects/project-workflows.api';
type BoardListing = Pick<BoardSummary, 'id' | 'name' | 'creator' | 'archived'>;
type ColumnForm = FormGroup<{
  id: FormControl<string>;
  name: FormControl<string>;
  stageIds: FormControl<string[]>;
  wipLimit: FormControl<number | null>;
  wipMode: FormControl<'warn' | 'block'>;
}>;
type SettingsIntent =
  | { kind: 'settings'; id: string; body: SaveLayoutFields; reference: string }
  | { kind: 'create'; id: string; name: string; reference: string }
  | { kind: 'archive'; id: string; revision: string; archive: boolean; reference: string };
function draftOf(view: LayoutView): SaveLayoutFields {
  return {
    expectedRevision: view.board.revision,
    name: view.board.name,
    savedFilters: view.board.savedFilters,
    columns: view.columns.map(column => ({
      id: column.id,
      name: column.name,
      stageIds: column.stages.map(mapping => mapping.stage.id),
      wipLimit: column.wipLimit,
      wipMode: column.wipMode,
    })),
  };
}
@Component({
  selector: 'gg-modern-board-settings',
  imports: [
    NativeBoardFiltersComponent,
    RouterLink,
    ReactiveFormsModule,
    RequestStatusComponent,
    SearchablePickerComponent,
    IconComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './modern-board-settings.page.html',
  styleUrls: ['../board-settings/board-settings.page.css', './modern-board-settings.page.css'],
})
export class ModernBoardSettingsPage {
  private readonly route = inject(ActivatedRoute);
  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  readonly boardIdInput = input('', { alias: 'boardId' });
  readonly projectIdInput = input('', { alias: 'projectId' });
  readonly boardId = computed(() => this.boardIdInput() || (this.params().get('boardId') ?? ''));
  readonly projectId = computed(
    () => this.projectIdInput() || (this.params().get('projectId') ?? ''),
  );
  private readonly auth = inject(AuthService);
  private readonly api = inject(ModernBoardsApi);
  private readonly legacy = inject(BoardsApi);
  private readonly workflowsApi = inject(ProjectWorkflowsApi);
  private readonly drafts = inject(DraftsService);
  private readonly destroy = inject(DestroyRef);
  private generation = 0;
  private stageGeneration = 0;
  private initializing = false;
  private draftKey = '';
  private baselineRevision = '1';
  readonly state = new RequestState();
  readonly choicesState = new RequestState();
  readonly dirty = signal(false);
  readonly reviewRequired = signal(false);
  readonly notice = signal('');
  readonly current = signal<LayoutView | null>(null);
  readonly project = signal<ProjectView | null>(null);
  readonly boards = signal<BoardListing[]>([]);
  readonly boardCursor = signal<string | null>(null);
  readonly pending = signal<SettingsIntent | null>(null);
  readonly workflows = signal<WorkflowView[]>([]);
  readonly workflowCursor = signal<string | null>(null);
  readonly stageCursor = signal<string | null>(null);
  readonly stages = signal<PickerOption[]>([]);
  readonly query = signal('');
  readonly selectedWorkflow = new FormControl('', { nonNullable: true });
  readonly createName = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(100)],
  });
  readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(100)],
    }),
    columns: new FormArray<ColumnForm>([]),
  });
  readonly filtersEditor = viewChild(NativeBoardFiltersComponent);
  readonly savedFilters = signal<IssueFilter>({});
  readonly editable = computed(
    () =>
      !!this.current()?.board.canManage &&
      !this.current()?.board.archived &&
      !this.project()?.archived,
  );
  readonly stageOptions = computed(() => {
    const needle = this.query().trim().toLocaleLowerCase();
    return this.stages().filter(
      stage =>
        !needle ||
        [stage.label, stage.detail ?? ''].some(text => text.toLocaleLowerCase().includes(needle)),
    );
  });
  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.remember());
    this.selectedWorkflow.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => void this.loadStages());
    effect(() => {
      const id = this.boardId(),
        project = this.projectId(),
        epoch = this.auth.sessionEpoch();
      untracked(() => {
        this.generation++;
        this.stageGeneration++;
        this.pending.set(null);
        this.reviewRequired.set(false);
        this.current.set(null);
        this.project.set(null);
        this.state.clear();
        this.state.busy.set(false);
        this.choicesState.clear();
        this.choicesState.busy.set(false);
        this.drafts.release(this.draftKey);
        this.draftKey = '';
        if (this.auth.me()) void this.load(id, project);
      });
      void epoch;
    });
    this.destroy.onDestroy(() => {
      this.generation++;
      this.stageGeneration++;
      this.drafts.release(this.draftKey);
    });
  }
  private columnForm(column: ColumnDraft): ColumnForm {
    return new FormGroup({
      id: new FormControl(column.id, { nonNullable: true }),
      name: new FormControl(column.name, {
        nonNullable: true,
        validators: [Validators.required, Validators.maxLength(60)],
      }),
      stageIds: new FormControl(column.stageIds, { nonNullable: true }),
      wipLimit: new FormControl<number | null>(column.wipLimit, {
        validators: [Validators.min(1), Validators.max(1000)],
      }),
      wipMode: new FormControl<'warn' | 'block'>(column.wipMode, { nonNullable: true }),
    });
  }
  private adopt(view: LayoutView, keepDraft = false): void {
    const existing = keepDraft
      ? this.fields()
      : this.drafts.modernBoards.get('native-board:' + view.board.id);
    this.current.set(view);
    this.drafts.release(this.draftKey);
    this.draftKey = 'native-board:' + view.board.id;
    const draft = existing ?? draftOf(view);
    if (keepDraft) draft.expectedRevision = view.board.revision;
    this.baselineRevision = draft.expectedRevision;
    this.initializing = true;
    this.form.controls.name.setValue(draft.name, { emitEvent: false });
    this.form.controls.columns.clear({ emitEvent: false });
    for (const column of draft.columns)
      this.form.controls.columns.push(this.columnForm(column), { emitEvent: false });
    this.savedFilters.set(draft.savedFilters);
    this.initializing = false;
    const retained = view.columns.flatMap(column =>
      column.stages.map(mapping => ({
        id: mapping.stage.id,
        label: mapping.stage.name,
        detail: mapping.workflow.name + (mapping.stage.retired ? ' · Retired' : ''),
      })),
    );
    this.stages.set([
      ...new Map([...retained, ...this.stages()].map(stage => [stage.id, stage])).values(),
    ]);
    this.dirty.set(!!existing);
    this.reviewRequired.set(!!existing && draft.expectedRevision !== view.board.revision);
    this.drafts.activate(this.draftKey, !!existing);
    if (existing)
      this.notice.set('Your draft is retained. Saving checks the current board revision.');
  }
  private fields(): SaveLayoutFields {
    return {
      expectedRevision: this.baselineRevision,
      name: this.form.controls.name.value.trim(),
      savedFilters: this.savedFilters(),
      columns: this.form.controls.columns.controls.map(control => control.getRawValue()),
    };
  }
  private remember(): void {
    if (this.initializing || !this.editable() || !this.draftKey) return;
    this.dirty.set(true);
    this.drafts.modernBoards.set(this.draftKey, this.fields());
    this.drafts.activate(this.draftKey, true);
  }
  async load(boardId = this.boardId(), projectId = this.projectId()): Promise<void> {
    const generation = ++this.generation,
      epoch = this.auth.sessionEpoch();
    const current = () => generation === this.generation && epoch === this.auth.sessionEpoch();
    await this.state.run(async () => {
      if (boardId) {
        const view = await this.api.get(boardId);
        if (!current()) return;
        this.adopt(view);
        const [project] = await Promise.all([
          this.legacy.project(view.board.projectId),
          this.loadWorkflows(false, view.board.projectId),
        ]);
        if (!current()) return;
        this.project.set(project);
      } else if (projectId) {
        const [project, list] = await Promise.all([
          this.legacy.project(projectId),
          this.legacy.list(projectId, true),
        ]);
        if (!current()) return;
        this.project.set(project);
        this.boards.set(list.items);
        this.boardCursor.set(list.nextCursor);
      }
    }, current);
  }
  addColumn(): void {
    if (!this.editable() || this.pending()) return;
    this.form.controls.columns.push(
      this.columnForm({
        id: crypto.randomUUID(),
        name: 'New column',
        stageIds: [],
        wipLimit: null,
        wipMode: 'warn',
      }),
    );
  }
  removeColumn(index: number): void {
    if (!this.editable() || this.pending() || this.form.controls.columns.length < 2) return;
    this.form.controls.columns.removeAt(index);
  }
  reorder(index: number, offset: number): void {
    const destination = index + offset,
      columns = this.form.controls.columns;
    if (destination < 0 || destination >= columns.length || this.pending()) return;
    const column = columns.at(index);
    columns.removeAt(index, { emitEvent: false });
    columns.insert(destination, column);
  }
  chooseStages(column: ColumnForm, ids: string[]): void {
    if (this.pending()) return;
    column.controls.stageIds.setValue(ids);
  }
  filtersChanged(filter: IssueFilter): void {
    this.savedFilters.set(filter);
    this.remember();
  }
  filterQueryEvent(event: Event): void {
    if (event.target instanceof HTMLInputElement) this.filterQuery(event.target.value);
  }
  filterQuery(value: string): void {
    const { query, ...filter } = this.savedFilters();
    this.savedFilters.set(value.trim() ? { ...filter, query: value.trim() } : filter);
    this.remember();
  }
  async loadWorkflows(more = false, targetProjectId = this.project()?.id): Promise<void> {
    if (!targetProjectId) return;
    const epoch = this.auth.sessionEpoch(),
      generation = this.generation;
    await this.choicesState.run(
      async () => {
        const page = await this.workflowsApi.workflows(
          targetProjectId,
          more ? (this.workflowCursor() ?? undefined) : undefined,
        );
        if (epoch !== this.auth.sessionEpoch() || generation !== this.generation) return;
        this.workflows.set(more ? [...this.workflows(), ...page.items] : page.items);
        this.workflowCursor.set(page.nextCursor);
        if (!this.selectedWorkflow.value && page.items[0])
          this.selectedWorkflow.setValue(page.items[0].id, { emitEvent: false });
      },
      () => epoch === this.auth.sessionEpoch() && generation === this.generation,
    );
    await this.loadStages(false, targetProjectId);
  }
  async loadStages(more = false, targetProjectId = this.project()?.id): Promise<void> {
    const workflow = this.selectedWorkflow.value;
    if (!targetProjectId || !workflow || this.choicesState.busy()) return;
    const stageGeneration = ++this.stageGeneration,
      epoch = this.auth.sessionEpoch();
    await this.choicesState.run(
      async () => {
        const page = await this.workflowsApi.stages(
          targetProjectId,
          workflow,
          more ? (this.stageCursor() ?? undefined) : undefined,
        );
        if (stageGeneration !== this.stageGeneration || epoch !== this.auth.sessionEpoch()) return;
        const name = this.workflows().find(flow => flow.id === workflow)?.name ?? 'Workflow';
        const options = page.items.map(stage => ({
          id: stage.id,
          label: stage.name,
          detail: name + (stage.retired ? ' · Retired' : ''),
        }));
        this.stages.set([
          ...new Map([...this.stages(), ...options].map(stage => [stage.id, stage])).values(),
        ]);
        this.stageCursor.set(page.nextCursor);
      },
      () => stageGeneration === this.stageGeneration && epoch === this.auth.sessionEpoch(),
    );
  }
  async save(): Promise<void> {
    const filter = this.filtersEditor()?.value();
    if (filter === null) {
      this.state.message.set('Check the saved-view filters before saving.');
      return;
    }
    if (filter) this.savedFilters.set(filter);
    const view = this.current();
    if (!view || !this.editable() || this.form.invalid || this.reviewRequired()) return;
    this.pending.set(
      this.pending() ?? {
        kind: 'settings',
        id: view.board.id,
        body: structuredClone(this.fields()),
        reference: crypto.randomUUID(),
      },
    );
    await this.retry();
  }
  async create(): Promise<void> {
    const project = this.project();
    if (
      !project ||
      project.archived ||
      project.effectiveRole === 'viewer' ||
      this.createName.invalid
    )
      return;
    this.pending.set(
      this.pending() ?? {
        kind: 'create',
        id: project.id,
        name: this.createName.value.trim(),
        reference: crypto.randomUUID(),
      },
    );
    await this.retry();
  }
  async setArchive(archive: boolean): Promise<void> {
    const view = this.current();
    if (!view || !view.board.canManage || view.board.default) return;
    this.pending.set(
      this.pending() ?? {
        kind: 'archive',
        id: view.board.id,
        revision: view.board.revision,
        archive,
        reference: crypto.randomUUID(),
      },
    );
    await this.retry();
  }
  async retry(): Promise<void> {
    const intent = this.pending();
    if (!intent) return;
    const generation = this.generation,
      epoch = this.auth.sessionEpoch();
    const current = () => generation === this.generation && epoch === this.auth.sessionEpoch();
    let refresh = false;
    await this.state.run(async () => {
      if (intent.kind === 'settings') {
        const out = await this.api.save(intent.id, intent.body, intent.reference);
        if (!current()) return;
        this.drafts.modernBoards.delete(this.draftKey);
        this.adopt(out.result);
        this.notice.set(
          out.receipt.replayed ? 'Original settings confirmed.' : 'Board settings saved.',
        );
      } else if (intent.kind === 'create') {
        const out = await this.api.create(intent.id, intent.name, {}, intent.reference);
        if (!current()) return;
        this.boards.update(items => [out.result.board, ...items]);
        this.createName.reset('');
        this.notice.set('Board created. Open Settings to customize its columns.');
      } else {
        if (intent.archive) await this.legacy.archive(intent.id, intent.revision, intent.reference);
        else await this.legacy.restore(intent.id, intent.revision, intent.reference);
        if (!current()) return;
        refresh = true;
      }
      this.pending.set(null);
    }, current);
    const failure = this.state.failure();
    if (failure && !failure.payload.error.retryable) {
      this.pending.set(null);
      if (failure.payload.error.code === 'conflict') this.reviewRequired.set(true);
    }
    if (refresh && current()) await this.load();
  }
  async reviewCurrent(): Promise<void> {
    const view = this.current();
    if (!view) return;
    const epoch = this.auth.sessionEpoch();
    await this.state.run(
      async () => {
        const fresh = await this.api.get(view.board.id);
        if (epoch !== this.auth.sessionEpoch() || this.current()?.board.id !== view.board.id)
          return;
        this.adopt(fresh, true);
        this.notice.set(
          'Current board reviewed. Your draft remains; check stage mappings before saving.',
        );
      },
      () => epoch === this.auth.sessionEpoch(),
    );
  }
  async moreBoards(): Promise<void> {
    const project = this.project(),
      cursor = this.boardCursor();
    if (!project || !cursor) return;
    const epoch = this.auth.sessionEpoch();
    await this.state.run(
      async () => {
        const page = await this.legacy.list(project.id, true, cursor);
        if (epoch !== this.auth.sessionEpoch()) return;
        this.boards.update(items => [...items, ...page.items]);
        this.boardCursor.set(page.nextCursor);
      },
      () => epoch === this.auth.sessionEpoch(),
    );
  }
}
