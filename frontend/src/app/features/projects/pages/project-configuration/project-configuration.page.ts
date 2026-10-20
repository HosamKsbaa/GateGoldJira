import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type {
  ConfigurationView,
  TypeView,
  PriorityView,
  SaveTypeFields,
  SavePriorityFields,
  Defaults,
} from '../../../../api/generated/types.gen';
import { AuthService } from '../../../../core/auth/auth.service';
import { DraftsService } from '../../../../core/drafts/drafts.service';
import { RetryIntent } from '../../../../core/api/api-result';
import { RequestState } from '../../../../shared/ui/request-state';
import { RequestStatusComponent } from '../../../../shared/ui/request-status.component';
import { unicodeLength } from '../../../../shared/forms/unicode.validators';
import { ProjectActivationComponent } from '../../components/project-activation/project-activation.component';
import { ProjectConfigurationApi } from '../../project-configuration.api';
type Tab = 'types' | 'priorities' | 'defaults';
type TypeIntent = {
  id: string;
  body: SaveTypeFields;
};
type PriorityIntent = {
  id: string;
  body: SavePriorityFields;
};
@Component({
  imports: [RouterLink, ReactiveFormsModule, RequestStatusComponent, ProjectActivationComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './project-configuration.page.html',
  styleUrl: './project-configuration.page.css',
})
export class ProjectConfigurationPage {
  private readonly api = inject(ProjectConfigurationApi);
  private readonly auth = inject(AuthService);
  private readonly drafts = inject(DraftsService);
  private readonly destroyed = inject(DestroyRef);
  activated(configuration: ConfigurationView) {
    this.configuration.set(configuration);
    this.notice.set('New issue mode activated. Existing work is preserved.');
  }
  readonly projectId = inject(ActivatedRoute).snapshot.paramMap.get('projectId') ?? '';
  private readonly draftKey = 'project-configuration:' + this.projectId;
  readonly state = new RequestState();
  readonly configuration = signal<ConfigurationView | null>(null);
  readonly types = signal<TypeView[]>([]);
  readonly priorities = signal<PriorityView[]>([]);
  readonly typeCursor = signal<string | null>(null);
  readonly priorityCursor = signal<string | null>(null);
  readonly tab = signal<Tab>('types');
  readonly notice = signal('');
  readonly reviewRequired = signal(false);
  readonly typeOpen = signal(false);
  readonly priorityOpen = signal(false);
  readonly selectedType = signal<TypeView | null>(null);
  readonly selectedPriority = signal<PriorityView | null>(null);
  readonly writable = computed(() => !!this.configuration()?.canManage && !this.state.busy());
  readonly defaultFrozen = () => !!this.defaultIntent && !!this.state.message();
  readonly typeFrozen = () => !!this.typeIntent && !!this.state.message();
  readonly priorityFrozen = () => !!this.priorityIntent && !!this.state.message();
  readonly hasStandardDefault = computed(() =>
    this.types().some(v => v.id === this.configuration()?.defaults.standardTypeId),
  );
  readonly hasSubtaskDefault = computed(() =>
    this.types().some(v => v.id === this.configuration()?.defaults.subtaskTypeId),
  );
  readonly hasPriorityDefault = computed(() =>
    this.priorities().some(v => v.id === this.configuration()?.defaults.priorityId),
  );
  readonly standardTypes = computed(() =>
    this.types().filter(v => !v.retired && v.behavior === 'standard'),
  );
  readonly subtaskTypes = computed(() =>
    this.types().filter(v => !v.retired && v.behavior === 'subtask'),
  );
  readonly activePriorities = computed(() => this.priorities().filter(v => !v.retired));
  readonly typeReplacements = computed(() =>
    this.types().filter(
      v =>
        !v.retired &&
        v.id !== this.selectedType()?.id &&
        v.behavior === this.selectedType()?.behavior,
    ),
  );
  readonly priorityReplacements = computed(() =>
    this.priorities().filter(v => !v.retired && v.id !== this.selectedPriority()?.id),
  );
  readonly typeForm = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, unicodeLength(60)],
    }),
    behavior: new FormControl<TypeView['behavior']>('standard', {
      nonNullable: true,
    }),
    retired: new FormControl(false, {
      nonNullable: true,
    }),
    replacement: new FormControl('', {
      nonNullable: true,
    }),
  });
  readonly priorityForm = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, unicodeLength(60)],
    }),
    sortOrder: new FormControl('4', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/^[1-9][0-9]*$/)],
    }),
    retired: new FormControl(false, {
      nonNullable: true,
    }),
    replacement: new FormControl('', {
      nonNullable: true,
    }),
  });
  readonly defaultsForm = new FormGroup({
    standardTypeId: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    subtaskTypeId: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    priorityId: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });
  private defaultIntent: {
    revision: string;
    defaults: Defaults;
  } | null = null;
  private typeIntent: TypeIntent | null = null;
  private priorityIntent: PriorityIntent | null = null;
  private readonly typeRetry = new RetryIntent<TypeIntent>();
  private readonly priorityRetry = new RetryIntent<PriorityIntent>();
  private readonly defaultRetry = new RetryIntent<{
    revision: string;
    defaults: Defaults;
  }>();
  constructor() {
    this.typeForm.valueChanges.pipe(takeUntilDestroyed(this.destroyed)).subscribe(() => this.remember());
    this.priorityForm.valueChanges.pipe(takeUntilDestroyed(this.destroyed)).subscribe(() => this.remember());
    this.defaultsForm.valueChanges.pipe(takeUntilDestroyed(this.destroyed)).subscribe(() => this.remember());
    this.destroyed.onDestroy(() => this.drafts.release(this.draftKey));
    let epoch = this.auth.sessionEpoch();
    effect(() => {
      const next = this.auth.sessionEpoch();
      if (next !== epoch) {
        epoch = next;
        this.configuration.set(null);
        this.types.set([]);
        this.priorities.set([]);
        this.typeCursor.set(null);
        this.priorityCursor.set(null);
        this.state.busy.set(false);
        this.cancel();
        this.notice.set('');
      }
    });
    void this.reload();
  }
  private remember(): void {
    if (this.destroyed.destroyed) {
      this.drafts.release(this.draftKey);
      return;
    }
    const defaults = this.configuration()?.defaults;
    const values = this.defaultsForm.getRawValue();
    const defaultsChanged = !!defaults && (
      values.standardTypeId !== defaults.standardTypeId ||
      values.subtaskTypeId !== defaults.subtaskTypeId ||
      values.priorityId !== defaults.priorityId
    );
    this.drafts.activate(this.draftKey,
      (this.typeOpen() && this.typeForm.dirty) ||
      (this.priorityOpen() && this.priorityForm.dirty) ||
      defaultsChanged || !!this.typeIntent || !!this.priorityIntent || !!this.defaultIntent,
    );
  }
  private current(epoch: number): boolean {
    return !this.destroyed.destroyed && epoch === this.auth.sessionEpoch();
  }
  async reload() {
    const epoch = this.auth.sessionEpoch();
    let loaded = false;
    await this.state.run(
      async () => {
        const [configuration, types, priorities] = await Promise.all([
          this.api.get(this.projectId),
          this.api.types(this.projectId),
          this.api.priorities(this.projectId),
        ]);
        if (!this.current(epoch)) return;
        this.configuration.set(configuration);
        this.types.set(types.items);
        this.priorities.set(priorities.items);
        this.typeCursor.set(types.nextCursor);
        this.priorityCursor.set(priorities.nextCursor);
        this.defaultsForm.setValue(configuration.defaults);
        loaded = true;
      },
      () => this.current(epoch),
    );
    return loaded;
  }
  async moreTypes() {
    const cursor = this.typeCursor();
    if (!cursor) return;
    const epoch = this.auth.sessionEpoch();
    await this.state.run(
      async () => {
        const page = await this.api.types(this.projectId, cursor);
        if (!this.current(epoch)) return;
        this.types.update(v => [...v, ...page.items]);
        this.typeCursor.set(page.nextCursor);
      },
      () => this.current(epoch),
    );
  }
  async morePriorities() {
    const cursor = this.priorityCursor();
    if (!cursor) return;
    const epoch = this.auth.sessionEpoch();
    await this.state.run(
      async () => {
        const page = await this.api.priorities(this.projectId, cursor);
        if (!this.current(epoch)) return;
        this.priorities.update(v => [...v, ...page.items]);
        this.priorityCursor.set(page.nextCursor);
      },
      () => this.current(epoch),
    );
  }
  openType(value: TypeView | null = null) {
    this.cancel();
    this.selectedType.set(value);
    this.typeForm.setValue({
      name: value?.name ?? '',
      behavior: value?.behavior ?? 'standard',
      retired: value?.retired ?? false,
      replacement: '',
    });
    this.typeOpen.set(true);
    this.typeForm.markAsPristine();
    this.remember();
  }
  openPriority(value: PriorityView | null = null) {
    this.cancel();
    this.selectedPriority.set(value);
    this.priorityForm.setValue({
      name: value?.name ?? '',
      sortOrder: value?.sortOrder ?? String(this.priorities().length + 1),
      retired: value?.retired ?? false,
      replacement: '',
    });
    this.priorityOpen.set(true);
    this.priorityForm.markAsPristine();
    this.remember();
  }
  cancel() {
    this.typeOpen.set(false);
    this.priorityOpen.set(false);
    this.typeIntent = null;
    this.priorityIntent = null;
    this.defaultIntent = null;
    this.typeRetry.finish();
    this.priorityRetry.finish();
    this.defaultRetry.finish();
    this.state.clear();
    this.reviewRequired.set(false);
    this.remember();
  }
  private key(name: string, prefix: string) {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 23);
    return slug && /^[a-z]/.test(slug) ? slug : prefix + '_' + crypto.randomUUID().slice(0, 8);
  }
  async saveType() {
    const configuration = this.configuration();
    if (this.reviewRequired()) return;
    if (!configuration || !this.writable() || this.typeForm.invalid) return;
    const fields = this.typeForm.getRawValue(),
      selected = this.selectedType();
    const intent = this.typeIntent ?? {
      id: selected?.id ?? crypto.randomUUID(),
      body: {
        expectedRevision: configuration.revision,
        key: selected?.key ?? this.key(fields.name, 'type'),
        name: fields.name,
        behavior: fields.behavior,
        retired: fields.retired,
        ...(fields.replacement
          ? {
              replacementDefaultId: fields.replacement,
            }
          : {}),
      },
    };
    this.typeIntent = intent;
    this.remember();
    const epoch = this.auth.sessionEpoch();
    await this.state.run(
      async () => {
        const saved = await this.api.saveType(
          this.projectId,
          intent.id,
          intent.body,
          this.typeRetry.reference(intent),
        );
        if (!this.current(epoch)) return;
        this.configuration.set(saved.result.configuration);
        this.types.update(v =>
          [
            ...v
              .filter(t => t.id !== saved.result.type.id)
              .map(t => ({
                ...t,
                default:
                  t.id === saved.result.configuration.defaults.standardTypeId ||
                  t.id === saved.result.configuration.defaults.subtaskTypeId,
              })),
            saved.result.type,
          ].sort((a, b) => a.key.localeCompare(b.key)),
        );
        this.defaultsForm.setValue(saved.result.configuration.defaults);
        this.typeOpen.set(false);
        this.typeRetry.finish();
        this.typeIntent = null;
        this.notice.set('Issue type saved.');
        this.remember();
      },
      () => this.current(epoch),
    );
    if (this.state.failure()?.payload.error.code === 'conflict') this.reviewRequired.set(true);
    if (this.state.failure() && !this.state.failure()?.payload.error.retryable) {
      this.typeIntent = null;
      this.typeRetry.finish();
    }
    this.remember();
  }
  async savePriority() {
    const configuration = this.configuration();
    if (this.reviewRequired()) return;
    if (!configuration || !this.writable() || this.priorityForm.invalid) return;
    const fields = this.priorityForm.getRawValue(),
      selected = this.selectedPriority();
    const intent = this.priorityIntent ?? {
      id: selected?.id ?? crypto.randomUUID(),
      body: {
        expectedRevision: configuration.revision,
        key: selected?.key ?? this.key(fields.name, 'priority'),
        name: fields.name,
        sortOrder: fields.sortOrder,
        retired: fields.retired,
        ...(fields.replacement
          ? {
              replacementDefaultId: fields.replacement,
            }
          : {}),
      },
    };
    this.priorityIntent = intent;
    this.remember();
    const epoch = this.auth.sessionEpoch();
    await this.state.run(
      async () => {
        const saved = await this.api.savePriority(
          this.projectId,
          intent.id,
          intent.body,
          this.priorityRetry.reference(intent),
        );
        if (!this.current(epoch)) return;
        this.configuration.set(saved.result.configuration);
        this.priorities.update(v =>
          [
            ...v
              .filter(p => p.id !== saved.result.priority.id)
              .map(p => ({
                ...p,
                default: p.id === saved.result.configuration.defaults.priorityId,
              })),
            saved.result.priority,
          ].sort((a, b) =>
            BigInt(a.sortOrder) < BigInt(b.sortOrder)
              ? -1
              : BigInt(a.sortOrder) > BigInt(b.sortOrder)
                ? 1
                : a.id.localeCompare(b.id),
          ),
        );
        this.defaultsForm.setValue(saved.result.configuration.defaults);
        this.priorityOpen.set(false);
        this.priorityRetry.finish();
        this.priorityIntent = null;
        this.notice.set('Priority saved.');
        this.remember();
      },
      () => this.current(epoch),
    );
    if (this.state.failure()?.payload.error.code === 'conflict') this.reviewRequired.set(true);
    if (this.state.failure() && !this.state.failure()?.payload.error.retryable) {
      this.priorityIntent = null;
      this.priorityRetry.finish();
    }
    this.remember();
  }
  async saveDefaults() {
    const configuration = this.configuration();
    if (this.reviewRequired()) return;
    if (
      !configuration ||
      !this.writable() ||
      configuration.mode !== 'modern' ||
      this.defaultsForm.invalid
    )
      return;
    const intent = this.defaultIntent ?? {
      revision: configuration.revision,
      defaults: this.defaultsForm.getRawValue(),
    };
    this.defaultIntent = intent;
    this.remember();
    const epoch = this.auth.sessionEpoch();
    await this.state.run(
      async () => {
        const saved = await this.api.defaults(
          this.projectId,
          {
            expectedRevision: intent.revision,
            defaults: intent.defaults,
          },
          this.defaultRetry.reference(intent),
        );
        if (!this.current(epoch)) return;
        this.configuration.set(saved.result);
        this.types.update(v =>
          v.map(t => ({
            ...t,
            default:
              t.id === saved.result.defaults.standardTypeId ||
              t.id === saved.result.defaults.subtaskTypeId,
          })),
        );
        this.priorities.update(v =>
          v.map(p => ({
            ...p,
            default: p.id === saved.result.defaults.priorityId,
          })),
        );
        this.defaultRetry.finish();
        this.defaultIntent = null;
        this.defaultsForm.setValue(saved.result.defaults);
        this.notice.set('Creation defaults saved. Existing issues keep their current values.');
        this.remember();
      },
      () => this.current(epoch),
    );
    if (this.state.failure()?.payload.error.code === 'conflict') this.reviewRequired.set(true);
    if (this.state.failure() && !this.state.failure()?.payload.error.retryable) {
      this.defaultIntent = null;
      this.defaultRetry.finish();
    }
    this.remember();
  }
  async review() {
    const type = this.typeOpen(),
      priority = this.priorityOpen(),
      typeDraft = this.typeForm.getRawValue(),
      priorityDraft = this.priorityForm.getRawValue(),
      defaultsDraft = this.defaultsForm.getRawValue(),
      selectedType = this.selectedType(),
      selectedPriority = this.selectedPriority();
    this.typeIntent = null;
    this.priorityIntent = null;
    this.defaultIntent = null;
    this.typeRetry.finish();
    this.priorityRetry.finish();
    this.defaultRetry.finish();
    const loaded = await this.reload();
    if (!loaded) return;
    this.reviewRequired.set(false);
    const current = this.configuration();
    if (!current) return;
    if (type) {
      const updated = this.types().find(v => v.id === selectedType?.id) ?? selectedType;
      this.selectedType.set(
        updated
          ? {
              ...updated,
              default:
                updated.id === current.defaults.standardTypeId ||
                updated.id === current.defaults.subtaskTypeId,
            }
          : null,
      );
      this.typeForm.setValue(typeDraft);
      this.typeOpen.set(true);
    }
    if (priority) {
      const updated =
        this.priorities().find(v => v.id === selectedPriority?.id) ?? selectedPriority;
      this.selectedPriority.set(
        updated
          ? {
              ...updated,
              default: updated.id === current.defaults.priorityId,
            }
          : null,
      );
      this.priorityForm.setValue(priorityDraft);
      this.priorityOpen.set(true);
    }
    if (this.tab() === 'defaults') this.defaultsForm.setValue(defaultsDraft);
    this.notice.set(
      'Latest configuration loaded. Your draft is preserved; review it before saving.',
    );
    this.remember();
  }
}
