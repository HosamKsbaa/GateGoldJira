import { CustomFieldsComponent } from '../custom-fields/custom-fields.component';
import { SearchablePickerComponent } from '../../../../shared/ui/searchable-picker.component';
import { DestroyRef } from '@angular/core';
import { DraftsService, type DraftFile, type ModernIssueDraft } from '../../../../core/drafts/drafts.service';
import { AssetsApi } from '../../../attachments/assets.api';
import { assetMetadata } from '../../../attachments/attachment-files';
import { plainTextHTML } from '../../../comments/comment-renderer';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
  inject,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormGroup, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import type {
  ModernEditable,
  ModernIssueView,
  UserSummary,
  FieldAssignment,
  ModernCreateFields,
  ConfigurationView,
  TypeView,
  PriorityView,
  BindingView,
  WorkflowView,
} from '../../../../api/generated/types.gen';
import { zModernEditable, zModernCreateFields } from '../../../../api/generated/zod.gen';
import { unicodeLength } from '../../../../shared/forms/unicode.validators';
import { DescriptionEditorComponent } from '../description-editor/description-editor.component';
import { DateLabelFieldsComponent } from '../date-label-fields/date-label-fields.component';
import { IssueChoiceCache } from '../../issue-choice-cache.service';
import { IssuesApi } from '../../issues.api';
import { ModernIssuesApi } from '../../modern-issues.api';
import { modernEditable } from '../../issue-model';
import { ProjectConfigurationApi } from '../../../projects/project-configuration.api';
import { ProjectWorkflowsApi } from '../../../projects/project-workflows.api';
import { AuthService } from '../../../../core/auth/auth.service';
import { RequestState } from '../../../../shared/ui/request-state';
import { RequestStatusComponent } from '../../../../shared/ui/request-status.component';
import { IconComponent } from '../../../../shared/ui/icon.component';
@Component({
  selector: 'gg-modern-issue-form',
  imports: [
    CustomFieldsComponent,
    SearchablePickerComponent,
    IconComponent,
    ReactiveFormsModule,
    RequestStatusComponent,
    DateLabelFieldsComponent,
    DescriptionEditorComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: '../issue-form/issue-form.component.css',
  template: ` <form [formGroup]="form" (ngSubmit)="submit()" class="issue-form"
    ><fieldset class="issue-fields" [disabled]="busy() || !saveAllowed()">
      <label [for]="subtask() ? 'subtask-title' : 'issue-title'">Issue title</label
      ><input
        [id]="subtask() ? 'subtask-title' : 'issue-title'"
        formControlName="title"
        dir="auto"
        required
        aria-describedby="issue-title-count"
        placeholder="What needs to be done?"
      />
      <p id="issue-title-count" class="muted field-hint">{{ titleCount() }} / 200 characters</p>
      <div class="issue-form-grid">
        @if (subtask() || current()?.summary?.type?.behavior === 'subtask') {
          <p
            >Type: {{ current()?.summary?.type?.name ?? defaultTypeName() }} · Parent stays
            fixed.</p
          >
        } @else {
          <div
            ><label for="issue-type">Issue type</label
            ><select id="issue-type" formControlName="typeId">
              @if (!current()) {
                <option value="">Project default · {{ defaultTypeName() }}</option>
              }
              @for (type of typeOptions(); track type.id) {
                <option [value]="type.id"
                  >{{ type.name }}{{ type.retired ? ' · Retired' : '' }}</option
                >
              }
            </select></div
          >
        }
        <p class="create-help"
          >Start with a title. Add details and files when they help your team.</p
        ></div
      >
      <gg-request-status [state]="configurationState" />
      <div class="actions">
        @if (typeCursor()) {
          <button
            type="button"
            class="secondary"
            (click)="moreChoices('types')"
            [disabled]="configurationState.busy()"
            >More types</button
          >
        }
        @if (priorityCursor()) {
          <button
            type="button"
            class="secondary"
            (click)="moreChoices('priorities')"
            [disabled]="configurationState.busy()"
            >More priorities</button
          >
        }
      </div>
      @if (!current()) {
        <label
          >Workflow<select [formControl]="workflow"
            ><option value="">Default for this issue type</option>
            @for (binding of bindings(); track binding.workflowId) {
              @if (binding.acceptsNew) {
                <option [value]="binding.workflowId">{{ workflowName(binding.workflowId) }}</option>
              }
            }
          </select></label
        ><gg-request-status [state]="bindingState" />
        @if (bindingCursor()) {
          <button type="button" class="secondary" (click)="loadBindings(true)"
            >More workflows for this type</button
          >
        }
        @if (workflowCursor()) {
          <button type="button" class="secondary" (click)="moreChoices('workflows')"
            >More workflow names</button
          >
        }
      } @else {
        <p class="field-hint"
          >Workflow: {{ current()?.summary?.workflow?.name }} · Existing work keeps its process.</p
        >
      }
      <label for="issue-description">Description</label
      ><gg-description-editor
        [issueId]="current()?.summary?.id ?? ''"
        [issueRevision]="current()?.summary?.revision ?? '1'"
        (uploadedRevision)="uploadedRevision.emit($event)"
        [initial]="initialDescription()"
        [initialFormat]="initialDescriptionFormat()"
        (queuedFiles)="queueFiles($event)"
        [disabled]="busy()"
        (changed)="descriptionChanged($event)"
      />
      @if (restored()) {
        <p class="notice" role="status"
          >Draft restored in this tab. Saving checks the issue revision before applying your
          changes.</p
        >
      }
      @if (!current() && files().length) {
        <ul class="creation-files" aria-label="Queued attachments">
          @for (item of files(); track item.id) {
            <li
              ><gg-icon name="paperclip" /><div
                ><bdi>{{ item.file.name }}</bdi
                ><small>{{
                  item.state === 'uploaded'
                    ? 'Uploaded'
                    : item.state === 'failed'
                      ? 'Upload failed'
                      : 'Uploads when you create this issue'
                }}</small>
                @if (item.error) {
                  <span class="file-error" role="alert">{{ item.error }}</span>
                }
              </div>
              @if (item.state !== 'uploaded') {
                <button
                  type="button"
                  class="secondary"
                  (click)="removeFile(item.id)"
                  [disabled]="busy()"
                  [attr.aria-label]="'Remove queued ' + item.file.name"
                  ><gg-icon name="close"
                /></button>
              }
            </li>
          }
        </ul>
      }
      <details class="optional-fields" [open]="!!current() || restored()"
        ><summary
          >Assignment, priority, due date and labels <span class="muted">Optional</span></summary
        ><div class="optional-fields-body">
          <div
            ><label for="issue-priority">Priority</label
            ><select id="issue-priority" formControlName="priorityId">
              @if (!current()) {
                <option value="">Project default · {{ defaultPriorityName() }}</option>
              }
              @for (priority of priorityOptions(); track priority.id) {
                <option [value]="priority.id"
                  >{{ priority.name }}{{ priority.retired ? ' · Retired' : '' }}</option
                >
              }
            </select></div
          >
          <gg-searchable-picker
            label="Assignee"
            placeholder="Search teammates or leave unassigned"
            [options]="assigneeOptions()"
            [selected]="selectedAssigneeOptions()"
            [value]="form.controls.assigneeId.value ? [form.controls.assigneeId.value] : []"
            [loading]="candidatePending() || candidatesState.busy()"
            [hasMore]="!!candidateCursor()"
            [disabled]="busy()"
            (searched)="candidateQuery.setValue($event)"
            (more)="findAssignees(true)"
            (changed)="assign($event)"
          />
          <gg-request-status [state]="candidatesState" />
          <gg-date-label-fields
            [projectId]="projectId()"
            [dueDateControl]="form.controls.dueDate"
            [labelsControl]="form.controls.labelIds"
            [initialLabels]="currentLabels()"
            [disabled]="busy()"
          /> </div
      ></details>
      @if (!current()) {
        <gg-custom-fields
          [projectId]="projectId()"
          [initial]="customFields()"
          [disabled]="busy()"
          (edited)="customChanged($event)"
        />
      }</fieldset
    ><div class="actions form-footer"
      ><button
        type="submit"
        [disabled]="
          form.invalid ||
          !saveAllowed() ||
          busy() ||
          configurationState.busy() ||
          bindingState.busy() ||
          !descriptionReady()
        "
        >{{ current() ? 'Save issue' : subtask() ? 'Create subtask' : 'Create issue' }}</button
      ><button type="button" class="secondary" [disabled]="busy()" (click)="requestCancel()"
        >Cancel</button
      ></div
    >
    @if (validationMessage()) {
      <p class="notice error" role="alert">{{ validationMessage() }}</p>
    }
  </form>`,
})
export class ModernIssueFormComponent {
  private readonly drafts = inject(DraftsService);
  private readonly assets = inject(AssetsApi);
  readonly maximumBytes = signal(10 * 1024 * 1024);
  readonly draftScope = input('');
  readonly files = signal<DraftFile[]>([]);
  readonly customFields = signal<FieldAssignment[]>([]);
  customChanged(values: FieldAssignment[]): void {
    this.customFields.set(values);
    this.remember();
  }
  readonly restored = signal(false);
  readonly initialDescription = signal('');
  readonly initialDescriptionFormat = signal<'plain' | 'html'>('plain');
  private currentKey = '';
  private editorGeneration = 0;
  private readonly uploadTransfers = new Set<AbortController>();
  private baselineRevision = '1';
  private initializing = false;
  readonly projectId = input.required<string>();
  readonly current = input<ModernIssueView | null>(null);
  readonly currentLabels = computed(() => this.current()?.summary.labels ?? []);
  readonly busy = input(false);
  readonly saveAllowed = input(true);
  readonly restoredDraft = input<ModernIssueDraft | null>(null);
  readonly subtask = input(false);
  readonly uploadedRevision = output<string>();
  readonly save = output<ModernEditable>();
  readonly create = output<ModernCreateFields>();
  readonly cancel = output<void>();
  private readonly descriptionEditor = viewChild(DescriptionEditorComponent);
  private readonly choices = inject(IssueChoiceCache);
  private readonly api = inject(IssuesApi);
  private readonly modern = inject(ModernIssuesApi);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private candidateTimer: ReturnType<typeof setTimeout> | null = null;
  readonly candidatePending = signal(false);
  readonly assignees = signal<UserSummary[]>([]);
  readonly selectedAssignee = signal<UserSummary | null>(null);
  readonly assigneeOptions = computed(() =>
    this.assignees().map(user => ({ id: user.id, label: user.displayName })),
  );
  readonly selectedAssigneeOptions = computed(() => {
    const user = this.selectedAssignee();
    return user ? [{ id: user.id, label: user.displayName }] : [];
  });
  private candidateGeneration = 0;
  readonly candidateCursor = signal<string | null>(null);
  readonly candidatesState = new RequestState();
  readonly validationMessage = signal('');
  readonly candidateQuery = new FormControl('', {
    nonNullable: true,
    validators: [unicodeLength(100)],
  });
  readonly form = new FormGroup({
    descriptionFormat: new FormControl<'plain' | 'html'>('plain', { nonNullable: true }),
    title: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, unicodeLength(200)],
    }),
    description: new FormControl('', { nonNullable: true, validators: [unicodeLength(10000)] }),
    typeId: new FormControl('', { nonNullable: true }),
    priorityId: new FormControl('', { nonNullable: true }),
    assigneeId: new FormControl('', { nonNullable: true }),
    dueDate: new FormControl('', { nonNullable: true }),
    labelIds: new FormControl<string[]>([], { nonNullable: true }),
  });
  readonly titleCount = signal(0);
  readonly workflow = new FormControl('', { nonNullable: true });
  readonly configurationState = new RequestState();
  readonly bindingState = new RequestState();
  readonly configuration = signal<ConfigurationView | null>(null);
  readonly types = signal<TypeView[]>([]);
  readonly priorities = signal<PriorityView[]>([]);
  readonly bindings = signal<BindingView[]>([]);
  readonly workflows = signal<WorkflowView[]>([]);
  readonly typeCursor = signal<string | null>(null);
  readonly priorityCursor = signal<string | null>(null);
  readonly bindingCursor = signal<string | null>(null);
  readonly workflowCursor = signal<string | null>(null);
  private readonly configurationApi = inject(ProjectConfigurationApi);
  private readonly workflowsApi = inject(ProjectWorkflowsApi);
  private configurationGeneration = 0;
  private bindingGeneration = 0;
  readonly typeOptions = computed(() => {
    const saved = this.current()?.summary.type;
    const values = this.types().filter(
      v =>
        !v.retired &&
        v.behavior === (this.subtask() || saved?.behavior === 'subtask' ? 'subtask' : 'standard'),
    );
    return saved && !values.some(v => v.id === saved.id)
      ? [{ ...saved, projectId: this.projectId(), default: false }, ...values]
      : values;
  });
  readonly priorityOptions = computed(() => {
    const saved = this.current()?.summary.priority;
    const values = this.priorities().filter(v => !v.retired);
    return saved && !values.some(v => v.id === saved.id)
      ? [{ ...saved, projectId: this.projectId(), default: false }, ...values]
      : values;
  });
  defaultTypeName(): string {
    const id = this.subtask()
      ? this.configuration()?.defaults.subtaskTypeId
      : this.configuration()?.defaults.standardTypeId;
    return this.types().find(v => v.id === id)?.name ?? 'Current project default';
  }
  defaultPriorityName(): string {
    return (
      this.priorities().find(v => v.id === this.configuration()?.defaults.priorityId)?.name ??
      'Current project default'
    );
  }
  workflowName(id: string): string {
    return this.workflows().find(v => v.id === id)?.name ?? 'Workflow ' + id;
  }
  private creationFields(): ModernCreateFields {
    const raw = this.form.getRawValue();
    return {
      fieldValues: this.customFields(),
      title: raw.title.trim(),
      description: raw.description,
      descriptionFormat: raw.descriptionFormat,
      assigneeId: raw.assigneeId || null,
      dueDate: raw.dueDate || null,
      labelIds: raw.labelIds,
      ...(raw.typeId ? { typeId: raw.typeId } : {}),
      ...(raw.priorityId ? { priorityId: raw.priorityId } : {}),
      ...(this.workflow.value ? { workflowId: this.workflow.value } : {}),
    };
  }
  async loadConfiguration(project = this.projectId()): Promise<void> {
    const generation = ++this.configurationGeneration,
      epoch = this.auth.sessionEpoch();
    this.bindingGeneration++;
    this.configurationState.busy.set(false);
    this.bindingState.busy.set(false);
    this.configuration.set(null);
    this.types.set([]);
    this.priorities.set([]);
    this.bindings.set([]);
    this.workflows.set([]);
    this.typeCursor.set(null);
    this.priorityCursor.set(null);
    this.workflowCursor.set(null);
    this.bindingCursor.set(null);
    const current = () =>
      !this.destroyRef.destroyed &&
      generation === this.configurationGeneration &&
      project === this.projectId() &&
      epoch === this.auth.sessionEpoch();
    await this.configurationState.run(async () => {
      const [cfg, types, priorities, flows] = await Promise.all([
        this.configurationApi.get(project),
        this.configurationApi.types(project),
        this.configurationApi.priorities(project),
        this.workflowsApi.workflows(project),
      ]);
      if (!current()) return;
      this.configuration.set(cfg);
      this.types.set(types.items);
      this.typeCursor.set(types.nextCursor);
      this.priorities.set(priorities.items);
      this.priorityCursor.set(priorities.nextCursor);
      this.workflows.set(flows.items);
      this.workflowCursor.set(flows.nextCursor);
      await this.loadBindings();
    }, current);
  }
  async moreChoices(kind: 'types' | 'priorities' | 'workflows'): Promise<void> {
    const generation = this.configurationGeneration,
      epoch = this.auth.sessionEpoch(),
      project = this.projectId();
    const current = () =>
      !this.destroyRef.destroyed &&
      generation === this.configurationGeneration &&
      epoch === this.auth.sessionEpoch();
    await this.configurationState.run(async () => {
      if (kind === 'types' && this.typeCursor()) {
        const p = await this.configurationApi.types(project, this.typeCursor()!);
        if (current()) {
          this.types.update(v => [...v, ...p.items]);
          this.typeCursor.set(p.nextCursor);
        }
      }
      if (kind === 'priorities' && this.priorityCursor()) {
        const p = await this.configurationApi.priorities(project, this.priorityCursor()!);
        if (current()) {
          this.priorities.update(v => [...v, ...p.items]);
          this.priorityCursor.set(p.nextCursor);
        }
      }
      if (kind === 'workflows' && this.workflowCursor()) {
        const p = await this.workflowsApi.workflows(project, this.workflowCursor()!);
        if (current()) {
          this.workflows.update(v => [...v, ...p.items]);
          this.workflowCursor.set(p.nextCursor);
        }
      }
    }, current);
  }
  async loadBindings(more = false): Promise<void> {
    if (this.current()) return;
    const cfg = this.configuration();
    const type =
      this.form.controls.typeId.value ||
      (this.subtask() ? cfg?.defaults.subtaskTypeId : cfg?.defaults.standardTypeId);
    if (!type) return;
    const generation = more ? this.bindingGeneration : ++this.bindingGeneration,
      epoch = this.auth.sessionEpoch(),
      project = this.projectId();
    if (!more) {
      this.bindingState.busy.set(false);
      this.bindings.set([]);
      this.bindingCursor.set(null);
    }
    const current = () =>
      !this.destroyRef.destroyed &&
      generation === this.bindingGeneration &&
      epoch === this.auth.sessionEpoch() &&
      project === this.projectId();
    await this.bindingState.run(async () => {
      const page = await this.workflowsApi.bindings(
        project,
        type,
        more ? (this.bindingCursor() ?? undefined) : undefined,
      );
      if (current()) {
        this.bindings.set(more ? [...this.bindings(), ...page.items] : page.items);
        this.bindingCursor.set(page.nextCursor);
      }
    }, current);
  }

  constructor() {
    void this.assets
      .policy()
      .then(policy => this.maximumBytes.set(Number(policy.maximumFileBytes)))
      .catch(() => {});
    effect(() => {
      const current = this.current(),
        project = this.projectId(),
        subtask = this.subtask(),
        scope = this.draftScope(),
        restoredDraft = this.restoredDraft();
      this.auth.sessionEpoch();
      untracked(() => {
        this.cancelUploads();
        this.editorGeneration++;
        this.cancelCandidateSearch();
        this.candidateGeneration++;
        this.candidatesState.busy.set(false);
        this.candidatesState.clear();
        if (this.currentKey) this.drafts.release(this.currentKey);
        this.currentKey =
          'issue:' + (current?.summary.id ?? `${project}:${subtask ? 'subtask' : 'new'}:${scope}`);
        const draft = restoredDraft ?? this.drafts.modernIssues.get(this.currentKey);
        if (restoredDraft) this.drafts.modernIssues.set(this.currentKey, restoredDraft);
        this.baselineRevision = draft?.revision ?? current?.summary.revision ?? '1';
        this.initializing = true;
        const value =
          draft?.editable ??
          draft?.fields ??
          (current
            ? modernEditable(current)
            : {
                title: '',
                description: '',
                descriptionFormat: 'plain' as const,
                typeId: '',
                priorityId: '',
                assigneeId: null,
                dueDate: null,
                labelIds: [],
              });
        this.form.reset(
          {
            ...value,
            typeId: value.typeId ?? '',
            priorityId: value.priorityId ?? '',
            assigneeId: value.assigneeId ?? '',
            dueDate: value.dueDate ?? '',
          },
          { emitEvent: false },
        );
        this.initialDescription.set(value.description ?? '');
        this.initialDescriptionFormat.set(value.descriptionFormat ?? 'plain');
        this.files.set(draft?.files ?? []);
        this.customFields.set(draft?.fields.fieldValues ?? []);
        this.restored.set(!!draft);
        this.titleCount.set(Array.from(value.title).length);
        if (current?.summary.assignee)
          this.choices.users.set(current.summary.assignee.id, current.summary.assignee);
        this.selectedAssignee.set(
          value.assigneeId ? (this.choices.users.get(value.assigneeId) ?? null) : null,
        );
        this.candidateQuery.reset('', { emitEvent: false });
        this.assignees.set(current?.summary.assignee ? [current.summary.assignee] : []);
        this.candidateCursor.set(null);
        this.validationMessage.set('');
        this.initializing = false;
        this.drafts.activate(this.currentKey, !!draft);
        this.workflow.reset(draft?.fields.workflowId ?? '', { emitEvent: false });
        void this.loadConfiguration(project);
        if (draft && current) this.uploadedRevision.emit(this.baselineRevision);
        void this.findAssignees(false, project);
      });
    });
    this.form.controls.typeId.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.workflow.reset('', { emitEvent: false });
      void this.loadBindings();
    });
    this.workflow.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.remember());
    this.candidateQuery.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.cancelCandidateSearch();
      this.candidateGeneration++;
      this.candidatesState.busy.set(false);
      this.candidatesState.clear();
      this.assignees.set([]);
      this.candidateCursor.set(null);
      if (this.candidateQuery.invalid || !this.projectId() || this.busy()) return;
      this.candidatePending.set(true);
      this.candidateTimer = setTimeout(() => {
        this.candidateTimer = null;
        void this.findAssignees();
      }, 120);
    });
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.remember());
    this.destroyRef.onDestroy(() => {
      this.cancelUploads();
      this.cancelCandidateSearch();
      this.candidateGeneration++;
      this.drafts.release(this.currentKey);
    });
    this.form.controls.title.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(value => this.titleCount.set(Array.from(value).length));
  }
  private cancelCandidateSearch(): void {
    if (this.candidateTimer !== null) {
      clearTimeout(this.candidateTimer);
      this.candidateTimer = null;
    }
    this.candidatePending.set(false);
  }
  assign(ids: string[]): void {
    const id = ids[0] ?? '';
    this.selectedAssignee.set(this.assignees().find(user => user.id === id) ?? null);
    this.form.controls.assigneeId.setValue(id);
    this.form.controls.assigneeId.markAsDirty();
  }
  async findAssignees(more = false, project = this.projectId()): Promise<void> {
    this.cancelCandidateSearch();
    if (this.candidateQuery.invalid || !project) return;
    if (!more) {
      this.candidateGeneration++;
      this.candidatesState.busy.set(false);
      this.candidateCursor.set(null);
    }
    const generation = this.candidateGeneration,
      cursor = more ? this.candidateCursor() : null,
      epoch = this.auth.sessionEpoch(),
      query = this.candidateQuery.value;
    const current = () =>
      !this.destroyRef.destroyed &&
      generation === this.candidateGeneration &&
      epoch === this.auth.sessionEpoch() &&
      project === this.projectId() &&
      query === this.candidateQuery.value;
    await this.candidatesState.run(async () => {
      const page = await this.api.assignees(project, query, cursor ?? undefined);
      if (!current()) return;
      for (const user of page.items) this.choices.users.set(user.id, user);
      const existing = more ? this.assignees() : [];
      const ids = new Set(existing.map(user => user.id));
      this.assignees.set([...existing, ...page.items.filter(user => !ids.has(user.id))]);
      this.candidateCursor.set(page.nextCursor);
    }, current);
  }
  descriptionReady(): boolean {
    return (
      (this.descriptionEditor()?.ready() ?? false) && !this.descriptionEditor()?.uploadPending()
    );
  }
  private remember(): void {
    if (this.initializing || !this.currentKey) return;
    const raw = this.form.getRawValue();
    const existing = this.drafts.modernIssues.get(this.currentKey);
    this.drafts.modernIssues.set(this.currentKey, {
      fields: this.creationFields(),
      editable: this.current()
        ? { ...raw, assigneeId: raw.assigneeId || null, dueDate: raw.dueDate || null }
        : null,
      revision: this.baselineRevision,
      files: this.files(),
      ...(existing?.createdIssueId ? { createdIssueId: existing.createdIssueId } : {}),
    });
    this.drafts.activate(this.currentKey, true);
  }
  requestCancel(): void {
    this.cancel.emit();
  }
  confirmClose(): boolean {
    return this.drafts.mayLeave();
  }
  saved(): void {
    this.descriptionEditor()?.saved();
    this.drafts.clearModernIssue(this.currentKey);
    this.files.set([]);
  }
  createdIssueId(): string | undefined {
    return this.drafts.modernIssues.get(this.currentKey)?.createdIssueId;
  }
  markCreated(id: string): void {
    this.remember();
    const draft = this.drafts.modernIssues.get(this.currentKey);
    if (draft) draft.createdIssueId = id;
  }
  queueFiles(files: File[]): void {
    const valid: DraftFile[] = [];
    for (const file of files) {
      if (!assetMetadata(file, this.maximumBytes(), 'issue')) {
        this.validationMessage.set(
          'Choose nonempty files within the current upload limit. Pictures are limited to 10 MiB.',
        );
        continue;
      }
      if (this.files().length + valid.length >= 20) {
        this.validationMessage.set('Upload at most 20 files at a time.');
        break;
      }
      valid.push({
        id: crypto.randomUUID(),
        file,
        state: 'queued',
        reference: crypto.randomUUID(),
      });
    }
    this.files.update(items => [...items, ...valid]);
    this.remember();
  }
  removeFile(id: string): void {
    this.files.update(items => items.filter(item => item.id !== id));
    this.remember();
  }
  private cancelUploads(): void {
    for (const transfer of this.uploadTransfers) transfer.abort();
    this.uploadTransfers.clear();
  }
  async finishUploads(issue: ModernIssueView): Promise<ModernIssueView> {
    const epoch = this.auth.sessionEpoch(),
      key = this.currentKey,
      generation = this.editorGeneration;
    const current = () =>
      !this.destroyRef.destroyed &&
      epoch === this.auth.sessionEpoch() &&
      key === this.currentKey &&
      generation === this.editorGeneration;
    const requireCurrent = () => {
      if (epoch !== this.auth.sessionEpoch()) throw new Error('Your session changed.');
      if (!current()) throw new Error('This editor is no longer current.');
    };
    requireCurrent();
    const transfer = new AbortController();
    this.uploadTransfers.add(transfer);
    try {
      this.markCreated(issue.summary.id);
      for (const item of this.files()) {
        requireCurrent();
        if (item.state === 'uploaded') continue;
        try {
          const metadata = assetMetadata(item.file, this.maximumBytes(), 'issue');
          if (!metadata) throw new Error('This file exceeds the upload limit.');
          const saved = await this.assets.uploadFile(
            issue.summary.id,
            metadata,
            item,
            received => {
              if (!current()) return;
              item.receivedBytes = received;
              this.files.update(items => [...items]);
              this.remember();
            },
            transfer.signal,
          );
          requireCurrent();
          if (saved.kind === 'image') item.pictureId = saved.id;
          item.state = 'uploaded';
          delete item.error;
          this.files.update(items => [...items]);
          this.remember();
        } catch (error: unknown) {
          requireCurrent();
          item.state = 'failed';
          item.error = 'Upload failed; retry Save to resume without creating another issue.';
          this.files.update(items => [...items]);
          this.remember();
          throw error;
        }
      }
      requireCurrent();
      const latest = await this.modern.get(issue.summary.id);
      requireCurrent();
      const pictures = this.files().filter(
        item => item.pictureId && !latest.description.includes(item.pictureId),
      );
      if (!pictures.length) return latest;
      const html =
        (latest.descriptionFormat === 'html'
          ? latest.description
          : plainTextHTML(latest.description)) +
        pictures
          .map(item => `<p><img data-picture-id="${item.pictureId}" alt="Attached picture"></p>`)
          .join('');
      const editable = {
        ...modernEditable(latest),
        description: html,
        descriptionFormat: 'html' as const,
      };
      const saved = await this.modern.update(
        latest.summary.id,
        latest.summary.revision,
        editable,
        crypto.randomUUID(),
      );
      requireCurrent();
      return saved.result;
    } finally {
      this.uploadTransfers.delete(transfer);
    }
  }
  descriptionChanged(html: string): void {
    this.form.controls.description.setValue(html);
    this.form.controls.descriptionFormat.setValue('html');
  }
  submit(): void {
    if (!this.saveAllowed() || !this.descriptionEditor()?.commit()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    if (!this.current()) {
      const parsed = zModernCreateFields.safeParse(this.creationFields());
      if (parsed.success) {
        this.validationMessage.set('');
        this.create.emit(parsed.data);
      } else this.validationMessage.set('Review the issue fields before creating.');
      return;
    }
    const raw = this.form.getRawValue();
    const parsed = zModernEditable.safeParse({
      ...raw,
      title: raw.title.trim(),
      assigneeId: raw.assigneeId || null,
      dueDate: raw.dueDate || null,
    });
    if (!parsed.success) {
      this.validationMessage.set('Review the issue fields before saving.');
      return;
    }
    this.validationMessage.set('');
    this.save.emit(parsed.data);
  }
}
