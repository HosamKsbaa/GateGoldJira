import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { toSignal, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type {
  ImportIssuesData,
  ProjectView,
  IssueFilter,
} from '../../../../api/generated/types.gen';
import { ApiError } from '../../../../core/api/api-result';
import { AuthService } from '../../../../core/auth/auth.service';
import { DraftsService } from '../../../../core/drafts/drafts.service';
import { RequestState } from '../../../../shared/ui/request-state';
import { RequestStatusComponent } from '../../../../shared/ui/request-status.component';
import { ProjectsApi } from '../../../projects/projects.api';
import { ImportExportApi } from '../../import-export.api';
import { ImportDraftsService } from '../../import-drafts.service';
import { csvColumns, withoutCSVHeader } from '../../csv-columns';

type Preview = Awaited<ReturnType<ImportExportApi['preview']>>;
type ImportResult = Awaited<ReturnType<ImportExportApi['import']>>['result'];
const mappingFields = [
  { key: 'title', label: 'Title' },
  { key: 'description', label: 'Description' },
  { key: 'descriptionFormat', label: 'Description format' },
  { key: 'type', label: 'Issue type' },
  { key: 'priority', label: 'Priority' },
  { key: 'assignee', label: 'Assignee' },
  { key: 'dueDate', label: 'Due date' },
  { key: 'labels', label: 'Labels' },
  { key: 'sourceKey', label: 'Source key' },
  { key: 'status', label: 'Stage' },
] as const;
const columnControl = () => new FormControl('', { nonNullable: true });

@Component({
  imports: [ReactiveFormsModule, RouterLink, RequestStatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './import-export.page.html',
  styleUrl: './import-export.page.css',
})
export class ImportExportPage {
  private readonly route = inject(ActivatedRoute);
  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  readonly projectId = computed(() => this.params().get('projectId') ?? '');
  private readonly auth = inject(AuthService);
  private readonly api = inject(ImportExportApi);
  private readonly projects = inject(ProjectsApi);
  private readonly importDrafts = inject(ImportDraftsService);
  private readonly drafts = inject(DraftsService);
  readonly project = signal<ProjectView | null>(null);
  readonly state = new RequestState();
  readonly previewState = new RequestState();
  readonly importState = new RequestState();
  readonly exportState = new RequestState();
  readonly busy = computed(
    () =>
      this.state.busy() ||
      this.previewState.busy() ||
      this.importState.busy() ||
      this.exportState.busy(),
  );
  readonly canImport = computed(
    () =>
      !!this.project() && !this.project()?.archived && this.project()?.effectiveRole !== 'viewer',
  );
  readonly fileName = signal('');
  readonly csv = signal('');
  readonly headers = signal<string[]>([]);
  readonly preview = signal<Preview | null>(null);
  readonly result = signal<ImportResult | null>(null);
  readonly notice = signal('');
  readonly locked = signal(false);
  readonly restored = signal(false);
  readonly confirmed = new FormControl(false, { nonNullable: true });
  readonly backlog = new FormControl(false, { nonNullable: true });
  readonly fields = mappingFields;
  readonly mapping = new FormGroup({
    title: columnControl(),
    description: columnControl(),
    descriptionFormat: columnControl(),
    type: columnControl(),
    priority: columnControl(),
    assignee: columnControl(),
    dueDate: columnControl(),
    labels: columnControl(),
    sourceKey: columnControl(),
    status: columnControl(),
  });
  readonly exportQuery = columnControl();
  readonly exportView = new FormControl<'all' | 'active' | 'backlog' | 'archived'>('all', {
    nonNullable: true,
  });
  readonly exportedRows = signal(0);
  readonly exportTotal = signal(0);
  private batchId: string = crypto.randomUUID();
  private reference: string = crypto.randomUUID();
  private generation = 0;
  private previewGeneration = 0;
  private initializing = false;
  private exportAbort: AbortController | undefined;
  private draftKey = '';
  constructor() {
    effect(() => {
      const busy = this.busy(),
        locked = this.locked(),
        writable = this.canImport(),
        valid = !!this.preview()?.validCount;
      untracked(() => {
        if (busy || locked || !writable) {
          this.mapping.disable({ emitEvent: false });
          this.backlog.disable({ emitEvent: false });
        } else {
          this.mapping.enable({ emitEvent: false });
          this.backlog.enable({ emitEvent: false });
        }
        if (busy || !valid) this.confirmed.disable({ emitEvent: false });
        else this.confirmed.enable({ emitEvent: false });
        if (busy) {
          this.exportQuery.disable({ emitEvent: false });
          this.exportView.disable({ emitEvent: false });
        } else {
          this.exportQuery.enable({ emitEvent: false });
          this.exportView.enable({ emitEvent: false });
        }
      });
    });
    this.mapping.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.invalidatePreview());
    this.backlog.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.confirmed.setValue(false);
      this.remember();
    });
    inject(DestroyRef).onDestroy(() => {
      this.generation++;
      this.previewGeneration++;
      this.exportAbort?.abort();
      this.drafts.release(this.draftKey);
    });
    effect(() => {
      const id = this.projectId(),
        epoch = this.auth.sessionEpoch(),
        approved = this.auth.me();
      untracked(() => {
        this.generation++;
        this.previewGeneration++;
        this.exportAbort?.abort();
        this.drafts.release(this.draftKey);
        this.draftKey = 'csv-import:' + id;
        this.project.set(null);
        this.preview.set(null);
        this.result.set(null);
        this.notice.set('');
        this.confirmed.reset();
        this.state.busy.set(false);
        this.state.clear();
        this.previewState.busy.set(false);
        this.previewState.clear();
        this.importState.busy.set(false);
        this.importState.clear();
        this.exportState.busy.set(false);
        this.exportState.clear();
        const draft = this.importDrafts.drafts.get(id);
        this.initializing = true;
        this.mapping.reset(draft?.body.mapping ?? {});
        this.backlog.setValue(draft?.body.backlog ?? false);
        this.csv.set(draft?.body.csv ?? '');
        this.fileName.set(draft?.filename ?? '');
        this.batchId = draft?.body.batchId ?? crypto.randomUUID();
        this.reference = draft?.reference ?? crypto.randomUUID();
        this.locked.set(draft?.locked ?? false);
        this.restored.set(!!draft);
        this.headers.set(draft ? csvColumns(draft.body.csv) : []);
        this.initializing = false;
        this.drafts.activate(this.draftKey, !!draft);
        if (approved && id) void this.loadProject(id, epoch, this.generation);
      });
    });
  }
  private async loadProject(id: string, epoch: number, generation: number): Promise<void> {
    await this.state.run(
      async () => {
        const project = await this.projects.get(id);
        if (
          id !== this.projectId() ||
          epoch !== this.auth.sessionEpoch() ||
          generation !== this.generation
        )
          return;
        this.project.set(project);
      },
      () => generation === this.generation && epoch === this.auth.sessionEpoch(),
    );
  }
  fileChanged(event: Event): void {
    if (!(event.target instanceof HTMLInputElement)) return;
    const file = event.target.files?.[0];
    if (file) void this.loadFile(file);
    event.target.value = '';
  }
  drop(event: DragEvent): void {
    event.preventDefault();
    if (this.busy() || this.locked()) return;
    const file = event.dataTransfer?.files[0];
    if (file) void this.loadFile(file);
  }
  async loadFile(file: File): Promise<void> {
    if (this.busy() || this.locked() || !this.canImport()) return;
    const generation = this.generation,
      epoch = this.auth.sessionEpoch();
    if (!file.size || file.size > 1024 * 1024) {
      this.previewState.message.set('Choose a nonempty UTF-8 CSV up to 1 MiB.');
      return;
    }
    await this.previewState.run(
      async () => {
        let csv: string;
        try {
          csv = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
        } catch {
          this.previewState.message.set(
            'Choose a UTF-8 CSV so Arabic and other text are preserved.',
          );
          return;
        }
        if (new TextEncoder().encode(csv).length > 1024 * 1024) {
          this.previewState.message.set('Choose a CSV up to 1 MiB.');
          return;
        }
        let headers: string[];
        try {
          headers = csvColumns(csv);
        } catch (error: unknown) {
          this.previewState.message.set(
            error instanceof Error ? error.message : 'The CSV header could not be read.',
          );
          return;
        }
        if (generation !== this.generation || epoch !== this.auth.sessionEpoch()) return;
        this.csv.set(csv);
        this.headers.set(headers);
        this.fileName.set(file.name);
        this.preview.set(null);
        this.result.set(null);
        this.confirmed.reset();
        this.batchId = crypto.randomUUID();
        this.reference = crypto.randomUUID();
        this.initializing = true;
        this.mapping.reset();
        this.initializing = false;
        this.remember();
      },
      () => generation === this.generation && epoch === this.auth.sessionEpoch(),
    );
  }
  private invalidatePreview(): void {
    if (this.initializing) return;
    this.previewGeneration++;
    this.preview.set(null);
    this.confirmed.reset();
    this.previewState.busy.set(false);
    this.previewState.clear();
    this.remember();
  }
  private body(): ImportIssuesData['body'] {
    return {
      csv: this.csv(),
      mapping: this.mapping.getRawValue(),
      backlog: this.backlog.value,
      batchId: this.batchId,
    };
  }
  private remember(): void {
    if (this.initializing || !this.csv()) return;
    this.importDrafts.drafts.set(this.projectId(), {
      body: this.body(),
      filename: this.fileName(),
      locked: this.locked(),
      reference: this.reference,
    });
    this.drafts.activate(this.draftKey, true);
  }
  async previewImport(): Promise<void> {
    if (this.busy() || !this.csv() || !this.canImport()) return;
    const id = this.projectId(),
      generation = this.generation,
      previewGeneration = ++this.previewGeneration,
      epoch = this.auth.sessionEpoch();
    this.confirmed.reset();
    const current = () =>
      generation === this.generation &&
      previewGeneration === this.previewGeneration &&
      epoch === this.auth.sessionEpoch() &&
      id === this.projectId();
    await this.previewState.run(async () => {
      const preview = await this.api.preview(id, {
        csv: this.csv(),
        mapping: this.mapping.getRawValue(),
      });
      if (current()) this.preview.set(preview);
    }, current);
  }
  async importValidRows(): Promise<void> {
    const preview = this.preview();
    if (this.busy() || !this.canImport() || !preview?.validCount || !this.confirmed.value) return;
    const id = this.projectId(),
      generation = this.generation,
      epoch = this.auth.sessionEpoch(),
      body = this.body();
    this.locked.set(true);
    this.remember();
    const current = () =>
      generation === this.generation &&
      epoch === this.auth.sessionEpoch() &&
      id === this.projectId();
    await this.importState.run(async () => {
      const saved = await this.api.import(id, body, this.reference);
      if (!current()) return;
      this.result.set(saved.result);
      this.reference = crypto.randomUUID();
      this.remember();
      this.notice.set('Import finished. Review the result for every row.');
      if (!saved.result.failedCount) this.drafts.release(this.draftKey);
    }, current);
  }
  startNewImport(): void {
    if (this.busy()) return;
    this.importDrafts.drafts.delete(this.projectId());
    this.drafts.release(this.draftKey);
    this.csv.set('');
    this.headers.set([]);
    this.fileName.set('');
    this.preview.set(null);
    this.result.set(null);
    this.locked.set(false);
    this.restored.set(false);
    this.confirmed.reset();
    this.initializing = true;
    this.mapping.reset();
    this.backlog.reset();
    this.initializing = false;
    this.batchId = crypto.randomUUID();
    this.reference = crypto.randomUUID();
    this.notice.set('');
    this.importState.clear();
  }
  async exportCSV(): Promise<void> {
    if (this.busy() || !this.project()) return;
    const id = this.projectId(),
      generation = this.generation,
      epoch = this.auth.sessionEpoch(),
      query = this.exportQuery.value.trim(),
      view = this.exportView.value;
    const filters: IssueFilter = {
      projectIds: [id],
      ...(query ? { query } : {}),
      ...(view === 'all'
        ? {}
        : view === 'archived'
          ? { archived: true }
          : view === 'backlog'
            ? { archived: false, backlog: true }
            : { archived: false, backlog: false }),
    };
    const controller = new AbortController();
    this.exportAbort = controller;
    this.exportedRows.set(0);
    this.exportTotal.set(0);
    this.notice.set('');
    const current = () =>
      generation === this.generation &&
      epoch === this.auth.sessionEpoch() &&
      id === this.projectId();
    await this.exportState.run(async () => {
      const chunks: string[] = [];
      let cursor: string | undefined,
        limit = 100;
      try {
        do {
          let page: Awaited<ReturnType<ImportExportApi['export']>>;
          try {
            page = await this.api.export(id, filters, cursor, controller.signal, limit);
          } catch (error: unknown) {
            if (
              error instanceof ApiError &&
              error.payload.error.fieldErrors.some(field => field.field === 'page.limit') &&
              limit > 1
            ) {
              limit = Math.max(1, Math.floor(limit / 2));
              cursor = undefined;
              chunks.length = 0;
              this.exportedRows.set(0);
              continue;
            }
            throw error;
          }
          if (!current() || controller.signal.aborted) return;
          chunks.push(chunks.length ? withoutCSVHeader(page.csv) : page.csv);
          this.exportTotal.set(page.totalMatching);
          this.exportedRows.set(Math.min(page.totalMatching, this.exportedRows() + limit));
          cursor = page.nextCursor ?? undefined;
        } while (cursor || !chunks.length);
        const url = URL.createObjectURL(new Blob(chunks, { type: 'text/csv;charset=utf-8' }));
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = (this.project()?.key ?? 'project') + '-issues.csv';
        anchor.hidden = true;
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        this.notice.set('CSV downloaded with ' + this.exportTotal() + ' matching issues.');
      } catch (error: unknown) {
        if (controller.signal.aborted) {
          this.notice.set('Export cancelled.');
          return;
        }
        throw error;
      }
    }, current);
    if (this.exportAbort === controller) this.exportAbort = undefined;
  }
  cancelExport(): void {
    this.exportAbort?.abort();
  }
}
