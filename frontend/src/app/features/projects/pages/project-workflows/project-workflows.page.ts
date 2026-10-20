import { DraftsService } from '../../../../core/drafts/drafts.service';
import { TransitionPolicyComponent } from '../../components/transition-policy.component';
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
  WorkflowView,
  StageView,
  TransitionView,
  TypeView,
  BindingView,
  SaveWorkflowFields,
  SaveStageFields,
  SaveTransitionFields,
  SetBindingFields,
  MigrationFields,
} from '../../../../api/generated/types.gen';
import { AuthService } from '../../../../core/auth/auth.service';
import { ApiError, RetryIntent } from '../../../../core/api/api-result';
import { RequestState } from '../../../../shared/ui/request-state';
import { RequestStatusComponent } from '../../../../shared/ui/request-status.component';
import { unicodeLength } from '../../../../shared/forms/unicode.validators';
import { ProjectConfigurationApi } from '../../project-configuration.api';
import { ProjectWorkflowsApi } from '../../project-workflows.api';

type Intent =
  | { kind: 'workflow'; id: string; body: SaveWorkflowFields }
  | { kind: 'stage'; flow: string; id: string; body: SaveStageFields }
  | { kind: 'transition'; flow: string; id: string; body: SaveTransitionFields }
  | { kind: 'binding'; flow: string; type: string; body: SetBindingFields }
  | { kind: 'migration'; body: MigrationFields };
type Panel = 'workflow' | 'stage' | 'transition' | 'binding' | 'migration';

@Component({
  imports: [TransitionPolicyComponent, RouterLink, ReactiveFormsModule, RequestStatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './project-workflows.page.html',
  styleUrl: './project-workflows.page.css',
})
export class ProjectWorkflowsPage {
  private readonly api = inject(ProjectWorkflowsApi);
  private readonly draftsService = inject(DraftsService);
  private readonly configurationApi = inject(ProjectConfigurationApi);
  private readonly auth = inject(AuthService);
  private readonly destroy = inject(DestroyRef);
  readonly projectId = inject(ActivatedRoute).snapshot.paramMap.get('projectId') ?? '';
  readonly state = new RequestState();
  readonly configuration = signal<ConfigurationView | null>(null);
  readonly workflows = signal<WorkflowView[]>([]);
  readonly stages = signal<StageView[]>([]);
  readonly transitions = signal<TransitionView[]>([]);
  readonly types = signal<TypeView[]>([]);
  readonly bindings = signal<BindingView[]>([]);
  readonly workflowCursor = signal<string | null>(null);
  readonly stageCursor = signal<string | null>(null);
  readonly transitionCursor = signal<string | null>(null);
  readonly typeCursor = signal<string | null>(null);
  readonly bindingCursor = signal<string | null>(null);
  readonly ruleTransition = signal<string | null>(null);
  readonly selectedFlow = signal<string>('');
  readonly selectedType = signal<string>('');
  readonly panel = signal<Panel | null>(null);
  readonly notice = signal('');
  readonly reviewRequired = signal(false);
  readonly dirty = signal(false);
  readonly pending = signal<Intent | null>(null);
  readonly flow = computed(() => this.workflows().find(v => v.id === this.selectedFlow()) ?? null);
  readonly writable = computed(() => !!this.configuration()?.canManage && !this.state.busy());
  readonly editableFlow = computed(
    () =>
      this.writable() &&
      !this.flow()?.retired &&
      !(this.flow()?.legacyBridge && this.configuration()?.mode === 'legacy'),
  );
  readonly frozen = computed(() => !!this.pending());
  readonly activeStages = computed(() => this.stages().filter(v => !v.retired));
  readonly closedStages = computed(() => this.stages().filter(v => !v.acceptsEntries));
  private readonly retry = new RetryIntent<Intent>();
  private selectedStage: StageView | null = null;
  private selectedTransition: TransitionView | null = null;
  readonly workflowForm = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, unicodeLength(100)],
    }),
    retired: new FormControl(false, { nonNullable: true }),
  });
  readonly stageForm = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, unicodeLength(60)],
    }),
    category: new FormControl<StageView['category']>('todo', { nonNullable: true }),
    position: new FormControl('1', {
      nonNullable: true,
      validators: [Validators.pattern(/^[1-9][0-9]*$/)],
    }),
    initial: new FormControl(false, { nonNullable: true }),
    acceptsEntries: new FormControl(false, { nonNullable: true }),
    retired: new FormControl(false, { nonNullable: true }),
  });
  readonly transitionForm = new FormGroup({
    from: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    to: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    permission: new FormControl<'' | 'member' | 'project_admin'>('', { nonNullable: true }),
    retired: new FormControl(false, { nonNullable: true }),
  });
  readonly bindingForm = new FormGroup({
    flow: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    default: new FormControl(false, { nonNullable: true }),
    acceptsNew: new FormControl(true, { nonNullable: true }),
  });
  readonly migrationForm = new FormGroup({
    source: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    targetFlow: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    targetStage: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    limit: new FormControl(25, {
      nonNullable: true,
      validators: [Validators.min(1), Validators.max(100)],
    }),
  });
  readonly activeForm = computed(() => {
    switch (this.panel()) {
      case 'stage':
        return this.stageForm;
      case 'transition':
        return this.transitionForm;
      case 'binding':
        return this.bindingForm;
      case 'migration':
        return this.migrationForm;
      default:
        return this.workflowForm;
    }
  });
  readonly targetStages = signal<StageView[]>([]);
  readonly targetCursor = signal<string | null>(null);
  constructor() {
    this.workflowForm.valueChanges
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe(() => this.dirty.set(true));
    this.stageForm.valueChanges
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe(() => this.dirty.set(true));
    this.transitionForm.valueChanges
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe(() => this.dirty.set(true));
    this.bindingForm.valueChanges
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe(() => this.dirty.set(true));
    this.migrationForm.valueChanges
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe(() => this.dirty.set(true));
    const unload = (event: BeforeUnloadEvent) => {
      if (this.dirty() || this.pending()) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', unload);
    this.destroy.onDestroy(() => window.removeEventListener('beforeunload', unload));
    let epoch = this.auth.sessionEpoch();
    effect(() => {
      const current = this.auth.sessionEpoch();
      if (epoch === current) return;
      epoch = current;
      this.configuration.set(null);
      this.workflows.set([]);
      this.stages.set([]);
      this.transitions.set([]);
      this.types.set([]);
      this.bindings.set([]);
      this.targetStages.set([]);
      this.selectedFlow.set('');
      this.selectedType.set('');
      this.state.busy.set(false);
      this.pending.set(null);
      this.retry.finish();
      this.panel.set(null);
      this.dirty.set(false);
      this.notice.set('');
    });
    void this.reload();
  }
  mayLeave(): boolean {
    return (
      !(this.dirty() || this.pending() || this.draftsService.dirtyCount()) ||
      window.confirm('Leave workflow settings? Unsaved changes will be lost.')
    );
  }
  private current(epoch: number) {
    return epoch === this.auth.sessionEpoch();
  }
  async reload() {
    const epoch = this.auth.sessionEpoch();
    await this.state.run(
      async () => {
        const [cfg, flows, types] = await Promise.all([
          this.configurationApi.get(this.projectId),
          this.api.workflows(this.projectId),
          this.configurationApi.types(this.projectId),
        ]);
        if (!this.current(epoch)) return;
        this.configuration.set(cfg);
        this.workflows.set(flows.items);
        this.workflowCursor.set(flows.nextCursor);
        this.types.set(types.items);
        this.typeCursor.set(types.nextCursor);
        const flow = this.selectedFlow() || flows.items.find(v => !v.retired)?.id || '';
        this.selectedFlow.set(flow);
        this.selectedType.set(this.selectedType() || types.items[0]?.id || '');
        await this.loadFlow(epoch);
        await this.loadBindings(epoch);
      },
      () => this.current(epoch),
    );
  }
  private async loadFlow(epoch: number) {
    const id = this.selectedFlow();
    if (!id) return;
    const [stages, moves] = await Promise.all([
      this.api.stages(this.projectId, id),
      this.api.transitions(this.projectId, id),
    ]);
    if (!this.current(epoch) || id !== this.selectedFlow()) return;
    this.stages.set(stages.items);
    this.stageCursor.set(stages.nextCursor);
    this.transitions.set(moves.items);
    this.transitionCursor.set(moves.nextCursor);
  }
  private async loadBindings(epoch: number) {
    const id = this.selectedType();
    if (!id) return;
    const page = await this.api.bindings(this.projectId, id);
    if (!this.current(epoch) || id !== this.selectedType()) return;
    this.bindings.set(page.items);
    this.bindingCursor.set(page.nextCursor);
  }
  async selectFlow(id: string) {
    this.ruleTransition.set(null);
    if (this.state.busy() || this.pending() || (this.dirty() && !this.mayLeave())) return;
    this.cancel();
    this.selectedFlow.set(id);
    const epoch = this.auth.sessionEpoch();
    await this.state.run(
      () => this.loadFlow(epoch),
      () => this.current(epoch),
    );
  }
  selectTypeEvent(event: Event) {
    if (event.target instanceof HTMLSelectElement) void this.selectType(event.target.value);
  }
  async selectType(id: string) {
    if (this.state.busy() || this.pending() || (this.dirty() && !this.mayLeave())) return;
    this.cancel();
    this.selectedType.set(id);
    const epoch = this.auth.sessionEpoch();
    await this.state.run(
      () => this.loadBindings(epoch),
      () => this.current(epoch),
    );
  }
  async more(kind: 'workflows' | 'stages' | 'transitions' | 'types' | 'bindings' | 'targets') {
    const epoch = this.auth.sessionEpoch();
    await this.state.run(
      async () => {
        if (kind === 'workflows' && this.workflowCursor()) {
          const p = await this.api.workflows(this.projectId, this.workflowCursor()!);
          if (this.current(epoch)) {
            this.workflows.update(v => [...v, ...p.items]);
            this.workflowCursor.set(p.nextCursor);
          }
        }
        if (kind === 'stages' && this.stageCursor()) {
          const p = await this.api.stages(this.projectId, this.selectedFlow(), this.stageCursor()!);
          if (this.current(epoch)) {
            this.stages.update(v => [...v, ...p.items]);
            this.stageCursor.set(p.nextCursor);
          }
        }
        if (kind === 'transitions' && this.transitionCursor()) {
          const p = await this.api.transitions(
            this.projectId,
            this.selectedFlow(),
            this.transitionCursor()!,
          );
          if (this.current(epoch)) {
            this.transitions.update(v => [...v, ...p.items]);
            this.transitionCursor.set(p.nextCursor);
          }
        }
        if (kind === 'types' && this.typeCursor()) {
          const p = await this.configurationApi.types(this.projectId, this.typeCursor()!);
          if (this.current(epoch)) {
            this.types.update(v => [...v, ...p.items]);
            this.typeCursor.set(p.nextCursor);
          }
        }
        if (kind === 'bindings' && this.bindingCursor()) {
          const p = await this.api.bindings(
            this.projectId,
            this.selectedType(),
            this.bindingCursor()!,
          );
          if (this.current(epoch)) {
            this.bindings.update(v => [...v, ...p.items]);
            this.bindingCursor.set(p.nextCursor);
          }
        }
        if (kind === 'targets' && this.targetCursor()) {
          const p = await this.api.stages(
            this.projectId,
            this.migrationForm.controls.targetFlow.value,
            this.targetCursor()!,
          );
          if (this.current(epoch)) {
            this.targetStages.update(v => [...v, ...p.items]);
            this.targetCursor.set(p.nextCursor);
          }
        }
      },
      () => this.current(epoch),
    );
  }
  openWorkflow(edit = false) {
    if (!this.prepare()) return;
    const value = edit ? this.flow() : null;
    this.workflowForm.reset(
      { name: value?.name ?? '', retired: value?.retired ?? false },
      { emitEvent: false },
    );
    this.panel.set('workflow');
    this.workflowEditID = value?.id ?? null;
  }
  private workflowEditID: string | null = null;
  openStage(value: StageView | null = null) {
    if (!this.prepare()) return;
    this.selectedStage = value;
    const max = this.stages().reduce(
      (n, v) => (BigInt(v.position) > n ? BigInt(v.position) : n),
      0n,
    );
    this.stageForm.reset(
      {
        name: value?.name ?? '',
        category: value?.category ?? 'todo',
        position: value?.position ?? String(max + 1n),
        initial: value?.initial ?? false,
        acceptsEntries: value?.acceptsEntries ?? false,
        retired: value?.retired ?? false,
      },
      { emitEvent: false },
    );
    this.panel.set('stage');
  }
  openTransition(value: TransitionView | null = null) {
    if (!this.prepare()) return;
    this.selectedTransition = value;
    this.transitionForm.reset(
      {
        from: value?.fromStageId ?? '',
        to: value?.toStageId ?? '',
        permission: value?.requiredPermission ?? '',
        retired: value?.retired ?? false,
      },
      { emitEvent: false },
    );
    this.panel.set('transition');
  }
  openBinding(value: BindingView | null = null) {
    if (!this.prepare()) return;
    this.bindingForm.reset(
      {
        flow: value?.workflowId ?? this.selectedFlow(),
        default: value?.default ?? false,
        acceptsNew: value?.acceptsNew ?? true,
      },
      { emitEvent: false },
    );
    this.panel.set('binding');
  }
  openMigration() {
    if (!this.prepare()) return;
    this.migrationForm.reset(
      { source: '', targetFlow: this.selectedFlow(), targetStage: '', limit: 25 },
      { emitEvent: false },
    );
    this.panel.set('migration');
    void this.loadTargets();
  }
  private prepare() {
    if (this.pending() || this.state.busy() || (this.dirty() && !this.mayLeave())) return false;
    this.cancel();
    return true;
  }
  cancel() {
    if (this.state.busy()) return;
    this.panel.set(null);
    this.pending.set(null);
    this.retry.finish();
    this.dirty.set(false);
    this.reviewRequired.set(false);
  }
  stageName(id: string) {
    return this.stages().find(v => v.id === id)?.name ?? 'Retained stage';
  }
  flowName(id: string) {
    return this.workflows().find(v => v.id === id)?.name ?? 'Retained workflow';
  }
  async loadTargets() {
    const id = this.migrationForm.controls.targetFlow.value;
    const epoch = this.auth.sessionEpoch();
    await this.state.run(
      async () => {
        const page = await this.api.stages(this.projectId, id);
        if (this.current(epoch) && id === this.migrationForm.controls.targetFlow.value) {
          this.targetStages.set(page.items);
          this.targetCursor.set(page.nextCursor);
        }
      },
      () => this.current(epoch),
    );
  }
  async save() {
    const cfg = this.configuration();
    if (!cfg || !this.writable() || this.reviewRequired()) return;
    let intent = this.pending();
    if (!intent) {
      const panel = this.panel();
      if (panel === 'workflow' && this.workflowForm.valid)
        intent = {
          kind: 'workflow',
          id: this.workflowEditID ?? crypto.randomUUID(),
          body: { expectedRevision: cfg.revision, ...this.workflowForm.getRawValue() },
        };
      if (panel === 'stage' && this.stageForm.valid)
        intent = {
          kind: 'stage',
          flow: this.selectedFlow(),
          id: this.selectedStage?.id ?? crypto.randomUUID(),
          body: { expectedRevision: cfg.revision, ...this.stageForm.getRawValue() },
        };
      if (panel === 'transition' && this.transitionForm.valid) {
        const f = this.transitionForm.getRawValue();
        intent = {
          kind: 'transition',
          flow: this.selectedFlow(),
          id: this.selectedTransition?.id ?? crypto.randomUUID(),
          body: {
            expectedRevision: cfg.revision,
            fromStageId: f.from,
            toStageId: f.to,
            requiredPermission: f.permission || null,
            retired: f.retired,
          },
        };
      }
      if (panel === 'binding' && this.bindingForm.valid) {
        const f = this.bindingForm.getRawValue();
        intent = {
          kind: 'binding',
          flow: f.flow,
          type: this.selectedType(),
          body: { expectedRevision: cfg.revision, default: f.default, acceptsNew: f.acceptsNew },
        };
      }
      if (panel === 'migration' && this.migrationForm.valid) {
        const f = this.migrationForm.getRawValue();
        intent = {
          kind: 'migration',
          body: {
            expectedRevision: cfg.revision,
            sourceStageId: f.source,
            targetStageId: f.targetStage,
            limit: f.limit,
          },
        };
      }
      if (!intent) return;
      this.pending.set(intent);
    }
    const stable = intent,
      reference = this.retry.reference(stable),
      epoch = this.auth.sessionEpoch();
    await this.state.run(
      async () => {
        try {
          if (stable.kind === 'workflow') {
            const out = await this.api.saveWorkflow(
              this.projectId,
              stable.id,
              stable.body,
              reference,
            );
            if (!this.current(epoch)) return;
            this.configuration.set(out.result.configuration);
            this.workflows.update(v => [
              out.result.workflow,
              ...v.filter(w => w.id !== out.result.workflow.id),
            ]);
            this.selectedFlow.set(out.result.workflow.id);
          }
          if (stable.kind === 'stage') {
            const out = await this.api.saveStage(
              this.projectId,
              stable.flow,
              stable.id,
              stable.body,
              reference,
            );
            if (!this.current(epoch)) return;
            this.configuration.set(out.result.configuration);
          }
          if (stable.kind === 'transition') {
            const out = await this.api.saveTransition(
              this.projectId,
              stable.flow,
              stable.id,
              stable.body,
              reference,
            );
            if (!this.current(epoch)) return;
            this.configuration.set(out.result.configuration);
          }
          if (stable.kind === 'binding') {
            const out = await this.api.saveBinding(
              this.projectId,
              stable.type,
              stable.flow,
              stable.body,
              reference,
            );
            if (!this.current(epoch)) return;
            this.configuration.set(out.result);
          }
          if (stable.kind === 'migration') {
            const out = await this.api.migrate(this.projectId, stable.body, reference);
            if (!this.current(epoch)) return;
            this.configuration.set(out.result.configuration);
            this.notice.set(
              `Moved ${out.result.moved} issues. ${out.result.remaining} remain in the source stage.`,
            );
          }
          if (!this.current(epoch)) return;
          this.pending.set(null);
          this.retry.finish();
          this.panel.set(null);
          this.dirty.set(false);
          if (stable.kind !== 'migration')
            this.notice.set('Changes saved. Existing issues keep their assigned workflow.');
          await this.loadFlow(epoch);
          await this.loadBindings(epoch);
        } catch (error: unknown) {
          if (!this.current(epoch)) return;
          if (error instanceof ApiError && error.payload.error.code === 'conflict') {
            this.pending.set(null);
            this.retry.finish();
            this.reviewRequired.set(true);
          } else if (error instanceof ApiError && !error.payload.error.retryable) {
            this.pending.set(null);
            this.retry.finish();
          }
          throw error;
        }
      },
      () => this.current(epoch),
    );
  }
  async review() {
    await this.reload();
    if (!this.state.message()) {
      this.reviewRequired.set(false);
      this.pending.set(null);
      this.retry.finish();
      this.notice.set(
        'Current configuration loaded. Your draft is preserved; review it before saving.',
      );
    }
  }
}
