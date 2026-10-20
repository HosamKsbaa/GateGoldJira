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
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { IssuePlanningView, PlanningItemView } from '../../api/generated/types.gen';
import { AuthService } from '../../core/auth/auth.service';
import { DraftsService, type PlanningDraft } from '../../core/drafts/drafts.service';
import { RequestState } from '../../shared/ui/request-state';
import { RequestStatusComponent } from '../../shared/ui/request-status.component';
import { PlanningApi } from './planning.api';

@Component({
  selector: 'gg-issue-planning',
  imports: [ReactiveFormsModule, RouterLink, RequestStatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './issue-planning.component.html',
  styleUrl: './issue-planning.component.css',
})
export class IssuePlanningComponent {
  readonly issueId = input.required<string>();
  readonly projectId = input.required<string>();
  readonly canEdit = input(false);
  readonly assignment = signal<IssuePlanningView | null>(null);
  readonly items = signal<PlanningItemView[]>([]);
  readonly cursor = signal<string | null>(null);
  readonly readState = new RequestState();
  readonly choicesState = new RequestState();
  readonly state = new RequestState();
  readonly reviewState = new RequestState();
  readonly pending = signal<PlanningDraft | null>(null);
  readonly reviewReady = signal(false);
  readonly notice = signal('');
  readonly busy = computed(
    () => this.readState.busy() || this.state.busy() || this.reviewState.busy(),
  );
  readonly conflict = computed(() => this.state.failure()?.payload.error.code === 'conflict');
  readonly epics = computed(() => this.items().filter(item => item.kind === 'epic'));
  readonly releases = computed(() => this.items().filter(item => item.kind === 'release'));
  readonly form = new FormGroup({
    epicId: new FormControl('', { nonNullable: true }),
    releaseId: new FormControl('', { nonNullable: true }),
  });
  private readonly api = inject(PlanningApi);
  private readonly auth = inject(AuthService);
  private readonly drafts = inject(DraftsService);
  private readonly destroy = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly root = inject<ElementRef<HTMLElement>>(ElementRef);
  private generation = 0;
  private choicesGeneration = 0;
  private key = '';

  constructor() {
    effect(() => {
      const id = this.issueId(),
        projectId = this.projectId(),
        epoch = this.auth.sessionEpoch();
      untracked(() => {
        this.generation++;
        this.choicesGeneration++;
        this.drafts.release(this.key);
        this.key = 'planning:' + id;
        this.assignment.set(null);
        this.items.set([]);
        this.cursor.set(null);
        this.pending.set(this.drafts.planning.get(this.key) ?? null);
        this.reviewReady.set(false);
        this.notice.set('');
        for (const state of [this.readState, this.choicesState, this.state, this.reviewState]) {
          state.clear();
          state.busy.set(false);
        }
        this.form.reset({ epicId: '', releaseId: '' }, { emitEvent: false });
        this.drafts.activate(this.key, !!this.pending());
        if (this.pending())
          this.state.message.set(
            'Your unsaved planning selection is restored. Retry it or cancel the change.',
          );
        if (this.auth.me()) {
          void this.loadAssignment(id, epoch);
          void this.loadChoices(projectId, false);
        }
      });
    });
    effect(() => {
      const locked =
        !this.canEdit() ||
        !this.assignment() ||
        this.readState.busy() ||
        this.busy() ||
        !!this.pending();
      untracked(() =>
        locked ? this.form.disable({ emitEvent: false }) : this.form.enable({ emitEvent: false }),
      );
    });
    this.destroy.onDestroy(() => {
      this.generation++;
      this.choicesGeneration++;
      this.drafts.release(this.key);
    });
  }

  hasChoice(id: string): boolean {
    return this.items().some(item => item.id === id);
  }
  selectedName(field: PlanningDraft['field']): string {
    const values = this.pending() ?? this.assignment();
    return (field === 'epicId' ? values?.epicName : values?.releaseName) ?? 'Selected item';
  }

  private owned(generation: number, id: string, epoch: number): boolean {
    return (
      !this.destroy.destroyed &&
      generation === this.generation &&
      id === this.issueId() &&
      epoch === this.auth.sessionEpoch()
    );
  }

  private showAssignment(current: IssuePlanningView): void {
    this.assignment.set(current);
    const values = this.pending()?.body ?? current;
    this.form.setValue(
      { epicId: values.epicId ?? '', releaseId: values.releaseId ?? '' },
      { emitEvent: false },
    );
  }

  private async loadAssignment(
    id: string,
    epoch: number,
    focus?: PlanningDraft['field'],
  ): Promise<void> {
    const generation = this.generation;
    const current = () => this.owned(generation, id, epoch);
    let loaded = false;
    await this.readState.run(async () => {
      const assignment = await this.api.getIssue(id);
      if (current()) {
        this.showAssignment(assignment);
        loaded = true;
      }
    }, current);
    if (loaded && current() && focus) this.focusField(focus);
  }

  reload(): void {
    if (this.readState.busy() || this.busy()) return;
    void this.loadAssignment(this.issueId(), this.auth.sessionEpoch());
    void this.loadChoices(this.projectId(), false);
  }

  more(): void {
    if (!this.choicesState.busy() && this.cursor()) void this.loadChoices(this.projectId(), true);
  }

  private async loadChoices(projectId: string, append: boolean): Promise<void> {
    if (append && this.choicesState.busy()) return;
    const generation = this.generation,
      choicesGeneration = ++this.choicesGeneration;
    const epoch = this.auth.sessionEpoch();
    const current = () =>
      !this.destroy.destroyed &&
      generation === this.generation &&
      choicesGeneration === this.choicesGeneration &&
      projectId === this.projectId() &&
      epoch === this.auth.sessionEpoch();
    if (!append) {
      this.choicesState.busy.set(false);
      this.cursor.set(null);
    }
    await this.choicesState.run(async () => {
      const page = await this.api.list(
        projectId,
        undefined,
        append ? (this.cursor() ?? undefined) : undefined,
      );
      if (!current()) return;
      const values = [...(append ? this.items() : []), ...page.items];
      this.items.set([...new Map(values.map(item => [item.id, item])).values()]);
      this.cursor.set(page.nextCursor);
    }, current);
  }

  choose(field: PlanningDraft['field'], event: Event): void {
    const current = this.assignment();
    if (
      !current ||
      !this.canEdit() ||
      this.busy() ||
      this.pending() ||
      !(event.target instanceof HTMLSelectElement)
    )
      return;
    const selected = event.target.value || null;
    if (current[field] === selected) return;
    const selectedName = selected
      ? (event.target.selectedOptions[0]?.textContent?.trim() ?? 'Selected item')
      : null;
    const draft: PlanningDraft = {
      field,
      reference: crypto.randomUUID(),
      epicName: field === 'epicId' ? selectedName : current.epicName,
      releaseName: field === 'releaseId' ? selectedName : current.releaseName,
      body: {
        expectedRevision: current.revision,
        epicId: field === 'epicId' ? selected : current.epicId,
        releaseId: field === 'releaseId' ? selected : current.releaseId,
      },
    };
    this.remember(draft);
    this.notice.set('');
    void this.save();
  }

  private remember(draft: PlanningDraft): void {
    this.form.disable({ emitEvent: false });
    this.pending.set(draft);
    this.drafts.planning.set(this.key, draft);
    this.drafts.activate(this.key, true);
  }

  async save(): Promise<void> {
    const draft = this.pending();
    if (!draft || !this.canEdit() || this.busy()) return;
    const generation = this.generation,
      id = this.issueId(),
      epoch = this.auth.sessionEpoch();
    const current = () => this.owned(generation, id, epoch);
    await this.state.run(async () => {
      const saved = await this.api.setIssue(id, draft.body, draft.reference);
      if (!current()) return;
      this.pending.set(null);
      this.reviewReady.set(false);
      this.drafts.clearPlanning(this.key);
      this.showAssignment(saved.result);
      this.notice.set('Planning updated.');
      this.focusField(draft.field);
    }, current);
  }

  async review(): Promise<void> {
    const draft = this.pending();
    if (!draft || !this.canEdit() || this.busy()) return;
    const generation = this.generation,
      id = this.issueId(),
      epoch = this.auth.sessionEpoch();
    const current = () => this.owned(generation, id, epoch);
    await this.reviewState.run(async () => {
      const latest = await this.api.getIssue(id);
      if (!current()) return;
      this.remember({
        field: draft.field,
        reference: crypto.randomUUID(),
        epicName: draft.field === 'epicId' ? draft.epicName : latest.epicName,
        releaseName: draft.field === 'releaseId' ? draft.releaseName : latest.releaseName,
        body: {
          expectedRevision: latest.revision,
          epicId: draft.field === 'epicId' ? draft.body.epicId : latest.epicId,
          releaseId: draft.field === 'releaseId' ? draft.body.releaseId : latest.releaseId,
        },
      });
      this.showAssignment(latest);
      this.state.clear();
      this.reviewReady.set(true);
      afterNextRender(
        () => {
          if (current() && this.reviewReady())
            this.root.nativeElement
              .querySelector<HTMLButtonElement>('[data-planning-apply]')
              ?.focus({ preventScroll: true });
        },
        { injector: this.injector },
      );
    }, current);
  }

  cancel(): void {
    if (this.busy()) return;
    const draft = this.pending();
    this.pending.set(null);
    this.reviewReady.set(false);
    this.drafts.clearPlanning(this.key);
    this.state.clear();
    this.reviewState.clear();
    this.notice.set('');
    const current = this.assignment();
    if (current) this.showAssignment(current);
    void this.loadAssignment(this.issueId(), this.auth.sessionEpoch(), draft?.field);
  }

  private focusField(field: PlanningDraft['field']): void {
    const generation = this.generation;
    afterNextRender(
      () => {
        if (generation === this.generation && !this.destroy.destroyed)
          this.root.nativeElement
            .querySelector<HTMLSelectElement>('[formcontrolname="' + field + '"]')
            ?.focus({ preventScroll: true });
      },
      { injector: this.injector },
    );
  }
}
