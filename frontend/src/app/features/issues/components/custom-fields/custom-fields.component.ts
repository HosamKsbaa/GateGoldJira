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
import type {
  FieldAssignment,
  FieldDefinition,
  FieldValueDisplay,
  ModernIssueView,
  SaveIssueFieldsRequest,
} from '../../../../api/generated/types.gen';
import { FieldValueEditorComponent } from './field-value-editor.component';
import { fieldDraftFailure, fieldText, type FieldValue } from './field-value';
import { IssueFieldsApi } from '../../issue-fields.api';
import { ProjectFieldsApi } from '../../../projects/project-fields.api';
import { AuthService } from '../../../../core/auth/auth.service';
import { DraftsService } from '../../../../core/drafts/drafts.service';
import { ApiError, RetryIntent } from '../../../../core/api/api-result';
import { RequestState } from '../../../../shared/ui/request-state';
import { RequestStatusComponent } from '../../../../shared/ui/request-status.component';
@Component({
  selector: 'gg-custom-fields',
  imports: [FieldValueEditorComponent, RequestStatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ` @if (definitions().length) {
    <section aria-label="Custom fields"
      ><h3>Custom fields</h3><gg-request-status [state]="state" />
      @for (field of definitions(); track field.id) {
        @if (field.retired) {
          <p
            ><bdi>{{ field.name }}</bdi> · Retired: <bdi>{{ display(field) }}</bdi></p
          >
        } @else {
          <gg-field-value-editor
            [field]="field"
            [value]="value(field)"
            [reference]="reference(field)"
            [disabled]="disabled() || state.busy() || !!pending() || (!!issue() && !canEdit())"
            (changed)="edit(field.id, $event)"
          />
        }
      }
      @if (cursor()) {
        <button
          type="button"
          class="secondary"
          (click)="load(true)"
          [disabled]="state.busy() || dirty()"
          >More fields</button
        >
      }
      @if (issue() && dirty()) {
        <div class="actions"
          ><button type="button" (click)="save()" [disabled]="state.busy() || reviewRequired()">{{
            pending() ? 'Retry original save' : 'Save fields'
          }}</button
          ><button type="button" class="secondary" (click)="discard()" [disabled]="state.busy()"
            >Discard draft</button
          ></div
        >
      }
      @if (reviewRequired()) {
        <p class="notice"
          >The issue changed. Your field draft is preserved.
          <button type="button" class="secondary" (click)="review()"
            >Review current issue</button
          ></p
        >
      }
    </section>
  }`,
})
export class CustomFieldsComponent {
  readonly projectId = input.required<string>();
  readonly issue = input<ModernIssueView | null>(null);
  readonly initial = input<FieldAssignment[]>([]);
  readonly disabled = input(false);
  readonly edited = output<FieldAssignment[]>();
  readonly saved = output<void>();
  readonly definitions = signal<FieldDefinition[]>([]);
  readonly assignments = signal<FieldAssignment[]>([]);
  readonly cursor = signal<string | null>(null);
  readonly revision = signal('1');
  readonly dirty = signal(false);
  readonly pending = signal<SaveIssueFieldsRequest | null>(null);
  readonly reviewRequired = signal(false);
  readonly state = new RequestState();
  readonly canEdit = computed(() => this.issue()?.capabilities.includes('edit') ?? true);
  readonly displayValues = signal<FieldValueDisplay[]>([]);
  private readonly api = inject(IssueFieldsApi);
  private readonly projectApi = inject(ProjectFieldsApi);
  private readonly auth = inject(AuthService);
  private readonly drafts = inject(DraftsService);
  private readonly destroyed = inject(DestroyRef);
  private readonly retry = new RetryIntent<SaveIssueFieldsRequest>();
  private generation = 0;
  private key = '';
  constructor() {
    effect(() => {
      const issue = this.issue(),
        project = this.projectId(),
        epoch = this.auth.sessionEpoch();
      untracked(() => {
        const key = issue ? 'custom:' + issue.summary.id : '';
        if (key === this.key && this.dirty()) {
          if (issue?.summary.revision !== this.revision()) this.reviewRequired.set(true);
          return;
        }
        this.generation++;
        this.key = key;
        this.state.busy.set(false);
        this.definitions.set([]);
        this.displayValues.set([]);
        this.cursor.set(null);
        this.assignments.set(this.initial());
        this.dirty.set(false);
        this.pending.set(null);
        this.reviewRequired.set(false);
        this.retry.finish();
        void this.load();
      });
    });
    this.destroyed.onDestroy(() => {
      this.generation++;
      this.drafts.release(this.key);
    });
  }
  value(field: FieldDefinition): FieldValue {
    const assignment = this.assignments().find(v => v.fieldId === field.id);
    return assignment ? assignment.value : !this.issue() ? field.defaultValue : null;
  }
  reference(field: FieldDefinition): FieldValueDisplay | null {
    const value = this.value(field);
    if (!value || !['user', 'choice'].includes(value.kind)) return null;
    return this.displayValues().find(reference =>
      reference.fieldId === field.id && reference.referenceId === fieldText(value),
    ) ?? null;
  }
  display(field: FieldDefinition): string {
    const value = this.value(field);
    if (value?.kind === 'user') return this.reference(field)?.label ?? 'Unavailable person';
    if (value?.kind === 'choice') return this.reference(field)?.label ?? 'Unavailable option';
    return fieldText(value);
  }
  edit(fieldId: string, value: FieldValue): void {
    const next = [...this.assignments().filter(v => v.fieldId !== fieldId), { fieldId, value }];
    this.assignments.set(next);
    this.dirty.set(true);
    if (this.key) {
      this.drafts.customFields.set(this.key, { revision: this.revision(), values: next });
      this.drafts.activate(this.key, true);
    }
    this.edited.emit(next);
  }
  async load(more = false): Promise<void> {
    const generation = this.generation,
      epoch = this.auth.sessionEpoch(),
      issue = this.issue(),
      project = this.projectId();
    const current = () =>
      !this.destroyed.destroyed &&
      generation === this.generation &&
      epoch === this.auth.sessionEpoch();
    await this.state.run(async () => {
      const cursor = more ? (this.cursor() ?? undefined) : undefined;
      if (issue) {
        const page = await this.api.fields(issue.summary.id, cursor);
        if (!current()) return;
        this.definitions.set(
          more ? [...this.definitions(), ...page.definitions] : page.definitions,
        );
        this.assignments.set(more ? [...this.assignments(), ...page.values] : page.values);
        this.displayValues.set(more ? [...this.displayValues(), ...(page.displayValues ?? [])] : (page.displayValues ?? []));
        this.revision.set(page.revision);
        this.cursor.set(page.nextCursor);
        const draft = this.drafts.customFields.get(this.key);
        if (draft && !more) {
          this.assignments.set(draft.values);
          this.revision.set(draft.revision);
          this.dirty.set(true);
          this.reviewRequired.set(draft.revision !== page.revision);
          this.drafts.activate(this.key, true);
        }
      } else {
        const page = await this.projectApi.fields(project, cursor);
        if (current()) {
          this.definitions.set(more ? [...this.definitions(), ...page.items] : page.items);
          this.cursor.set(page.nextCursor);
        }
      }
    }, current);
  }
  async save(): Promise<void> {
    const issue = this.issue();
    if (!issue || !this.canEdit() || this.reviewRequired()) return;
    const body = this.pending() ?? {
      expectedRevision: this.revision(),
      values: this.assignments().filter(
        v => !this.definitions().find(f => f.id === v.fieldId)?.retired,
      ),
    };
    const validation = fieldDraftFailure(body, this.definitions());
    if (validation) {
      this.state.clear();
      this.state.failure.set(new ApiError(validation, 0));
      this.state.message.set(validation.error.message);
      return;
    }
    this.pending.set(structuredClone(body));
    const epoch = this.auth.sessionEpoch(),
      generation = this.generation;
    const current = () =>
      epoch === this.auth.sessionEpoch() &&
      generation === this.generation &&
      !this.destroyed.destroyed;
    await this.state.run(async () => {
      const saved = await this.api.save(issue.summary.id, body, this.retry.reference(body));
      if (!current()) return;
      this.revision.set(saved.result.revision);
      this.clearDraft();
      this.saved.emit();
    }, current);
    if (current() && this.state.failure()?.payload.error.code === 'conflict')
      this.reviewRequired.set(true);
    if (current() && this.state.failure()?.payload.error.code === 'validation_failed') {
      this.pending.set(null);
      this.retry.finish();
    }
  }
  private clearDraft(): void {
    this.drafts.customFields.delete(this.key);
    this.drafts.release(this.key);
    this.dirty.set(false);
    this.pending.set(null);
    this.retry.finish();
    this.reviewRequired.set(false);
  }
  discard(): void {
    this.clearDraft();
    void this.load();
  }
  async review(): Promise<void> {
    const issue = this.issue();
    if (!issue) return;
    const epoch = this.auth.sessionEpoch(), generation = this.generation;
    const current = () => !this.destroyed.destroyed && generation === this.generation && epoch === this.auth.sessionEpoch();
    const loadedCount = this.definitions().length;
    await this.state.run(async () => {
      const definitions: FieldDefinition[] = [], values: FieldAssignment[] = [], displays: FieldValueDisplay[] = [];
      let cursor: string | undefined, revision = this.revision();
      do {
        const page = await this.api.fields(issue.summary.id, cursor);
        if (!current()) return;
        definitions.push(...page.definitions);
        values.push(...page.values);
        displays.push(...(page.displayValues ?? []));
        revision = page.revision;
        cursor = page.nextCursor ?? undefined;
      } while (cursor && definitions.length < loadedCount);
      const retained = new Map(values.map(value => [value.fieldId, value]));
      for (const value of this.assignments()) retained.set(value.fieldId, value);
      this.definitions.set(definitions);
      this.displayValues.set(displays);
      this.assignments.set([...retained.values()]);
      this.cursor.set(cursor ?? null);
      this.revision.set(revision);
      this.pending.set(null);
      this.retry.finish();
      this.reviewRequired.set(false);
      this.drafts.customFields.set(this.key, {
        revision,
        values: this.assignments(),
      });
    }, current);
  }
}
