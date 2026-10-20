import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type {
  ConfigurationView,
  FieldDefinition,
  FieldOptionView,
  SaveFieldFields,
  SaveFieldOptionFields,
} from '../../../../api/generated/types.gen';
import { FieldValueEditorComponent } from '../../../issues/components/custom-fields/field-value-editor.component';
import type { FieldValue } from '../../../issues/components/custom-fields/field-value';
import { ProjectFieldsApi } from '../../project-fields.api';
import { ProjectConfigurationApi } from '../../project-configuration.api';
import { AuthService } from '../../../../core/auth/auth.service';
import { DraftsService } from '../../../../core/drafts/drafts.service';
import { RetryIntent } from '../../../../core/api/api-result';
import { RequestState } from '../../../../shared/ui/request-state';
import { RequestStatusComponent } from '../../../../shared/ui/request-status.component';
type Intent =
  | { kind: 'field'; id: string; body: SaveFieldFields }
  | { kind: 'option'; fieldId: string; id: string; body: SaveFieldOptionFields }
  | { kind: 'backfill'; id: string; revision: string };
@Component({
  imports: [RouterLink, ReactiveFormsModule, FieldValueEditorComponent, RequestStatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="breadcrumb"
      ><a [routerLink]="['/projects', projectId, 'settings']">Project settings</a><span>/</span
      ><span>Custom fields</span></nav
    >
    <header class="page-heading"
      ><div
        ><p class="eyebrow">Project settings</p><h1>Custom fields</h1
        ><p class="muted">Typed values, optional defaults, and requirements for your team.</p></div
      ><button type="button" (click)="edit()" [disabled]="!writable() || !!pending()"
        >Add field</button
      ></header
    >
    <gg-request-status [state]="state" />
    @if (notice()) {
      <p class="notice" role="status">{{ notice() }}</p>
    }
    @if (conflict()) {
      <p class="notice"
        >Configuration changed. Your draft stays below.
        <button type="button" class="secondary" (click)="review()"
          >Review current configuration</button
        ></p
      >
    }
    <div class="table-scroll"
      ><table
        ><thead
          ><tr
            ><th>Name</th><th>Type</th><th>Requirement</th><th>Availability</th><th>Actions</th></tr
          ></thead
        ><tbody>
          @for (field of fields(); track field.id) {
            <tr
              ><td dir="auto">{{ field.name }}</td
              ><td>{{ field.kind }}</td
              ><td>{{ field.required ? 'Required' : 'Optional' }}</td
              ><td>{{ field.retired ? 'Retired' : 'Active' }}</td
              ><td
                ><button
                  type="button"
                  class="secondary"
                  (click)="edit(field)"
                  [disabled]="!writable() || !!pending()"
                  >Edit {{ field.name }}</button
                >
                @if (field.kind === 'choice') {
                  <button
                    type="button"
                    class="secondary"
                    (click)="choices(field)"
                    [disabled]="state.busy() || !!pending()"
                    >Options</button
                  >
                }
                @if (field.defaultValue && !field.retired) {
                  <button
                    type="button"
                    class="secondary"
                    (click)="backfill(field)"
                    [disabled]="!writable() || !!pending()"
                    >Fill missing values</button
                  >
                }
              </td></tr
            >
          }
        </tbody></table
      ></div
    >
    @if (cursor()) {
      <button type="button" class="secondary" (click)="load(true)" [disabled]="state.busy()"
        >More fields</button
      >
    }
    @if (open()) {
      <form class="editor" [formGroup]="form" (ngSubmit)="save()"
        ><h2>{{ selected() ? 'Edit field' : 'New field' }}</h2
        ><fieldset [disabled]="state.busy() || !!pending()"
          ><label>Name<input formControlName="name" dir="auto" /></label
          ><label>Stable key<input formControlName="key" [readOnly]="!!selected()" /></label
          ><label
            >Value type<select formControlName="kind" (change)="defaultValue.set(null)"
              ><option value="text">Text</option
              ><option value="number">Decimal number</option
              ><option value="date">Date</option
              ><option value="choice">Choice</option
              ><option value="user">Person</option></select
            ></label
          ><label class="check"
            ><input type="checkbox" formControlName="required" />Required on every issue</label
          ><label class="check"><input type="checkbox" formControlName="retired" />Retired</label>
          <gg-field-value-editor
            [field]="preview()"
            [value]="defaultValue()"
            [disabled]="
              state.busy() || !!pending() || (!selected() && form.controls.kind.value === 'choice')
            "
            (changed)="defaultValue.set($event); remember()"
          /><p class="help"
            >The value above is the creation default. Choice fields need to be saved before adding
            options. Fill missing values in batches before enabling a global requirement. Retired
            fields keep their history.</p
          ></fieldset
        >
        <div class="actions"
          ><button type="submit" [disabled]="state.busy() || conflict() || form.invalid">{{
            pending() ? 'Retry original save' : 'Save field'
          }}</button
          ><button type="button" class="secondary" (click)="cancel()" [disabled]="state.busy()"
            >Cancel</button
          ></div
        ></form
      >
    }
    @if (optionField(); as field) {
      <section class="editor"
        ><h2
          ><bdi>{{ field.name }}</bdi> options</h2
        ><ul>
          @for (option of options(); track option.id) {
            <li
              ><bdi>{{ option.name }}</bdi> · {{ option.retired ? 'Retired' : 'Active' }} · Position
              {{ option.position }}
              <button
                type="button"
                class="secondary"
                (click)="editOption(option)"
                [disabled]="!writable() || !!pending()"
                >Edit option</button
              ></li
            >
          }
        </ul>
        @if (optionCursor()) {
          <button
            type="button"
            class="secondary"
            (click)="choices(field, true)"
            [disabled]="state.busy()"
            >More options</button
          >
        }
        <form [formGroup]="optionForm" (ngSubmit)="saveOption()"
          ><fieldset [disabled]="!writable() || !!pending()"
            ><label>Option name<input formControlName="name" dir="auto" /></label
            ><label>Position<input formControlName="position" inputmode="numeric" /></label
            ><label class="check"
              ><input type="checkbox" formControlName="retired" />Retired</label
            ></fieldset
          ><div class="actions"
            ><button type="submit" [disabled]="state.busy() || conflict() || optionForm.invalid">{{
              pending() ? 'Retry original save' : 'Save option'
            }}</button
            ><button
              type="button"
              class="secondary"
              (click)="editOption()"
              [disabled]="state.busy() || !!pending()"
              >New option</button
            ><button type="button" class="secondary" (click)="cancel()" [disabled]="state.busy()"
              >Close options</button
            ></div
          ></form
        ></section
      >
    }
    @if (pending()?.kind === 'backfill') {
      <button type="button" (click)="execute()" [disabled]="state.busy() || conflict()"
        >Retry original batch</button
      >
    }
  `,
  styleUrl: '../project-configuration/project-configuration.page.css',
})
export class ProjectFieldsPage {
  readonly projectId = inject(ActivatedRoute).snapshot.paramMap.get('projectId') ?? '';
  readonly state = new RequestState();
  readonly configuration = signal<ConfigurationView | null>(null);
  readonly fields = signal<FieldDefinition[]>([]);
  readonly options = signal<FieldOptionView[]>([]);
  readonly cursor = signal<string | null>(null);
  readonly optionCursor = signal<string | null>(null);
  readonly selected = signal<FieldDefinition | null>(null);
  readonly optionField = signal<FieldDefinition | null>(null);
  readonly selectedOption = signal<FieldOptionView | null>(null);
  readonly open = signal(false);
  readonly defaultValue = signal<FieldValue>(null);
  readonly pending = signal<Intent | null>(null);
  readonly conflict = signal(false);
  readonly notice = signal('');
  readonly writable = computed(() => !!this.configuration()?.canManage && !this.state.busy());
  readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(60)],
    }),
    key: new FormControl('', {
      nonNullable: true,
      validators: [Validators.pattern(/^[a-z][a-z0-9_]{0,31}$/), Validators.required],
    }),
    kind: new FormControl<FieldDefinition['kind']>('text', { nonNullable: true }),
    required: new FormControl(false, { nonNullable: true }),
    retired: new FormControl(false, { nonNullable: true }),
  });
  readonly optionForm = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(60)],
    }),
    position: new FormControl('1', {
      nonNullable: true,
      validators: [Validators.pattern(/^[1-9][0-9]*$/)],
    }),
    retired: new FormControl(false, { nonNullable: true }),
  });
  private readonly api = inject(ProjectFieldsApi);
  private readonly configurationApi = inject(ProjectConfigurationApi);
  private readonly auth = inject(AuthService);
  private readonly destroyed = inject(DestroyRef);
  private readonly drafts = inject(DraftsService);
  private readonly retry = new RetryIntent<Intent>();
  private editingId: string = crypto.randomUUID();
  private optionId: string = crypto.randomUUID();
  private readonly key = 'fields-settings:' + this.projectId;
  private baseline = '1';
  constructor() {
    void this.load();
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.remember());
    this.optionForm.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.remember());
    this.destroyed.onDestroy(() => this.drafts.release(this.key));
  }
  preview(): FieldDefinition {
    const raw = this.form.getRawValue();
    return {
      ...raw,
      id: this.selected()?.id ?? this.editingId,
      projectId: this.projectId,
      defaultValue: this.defaultValue(),
      name: 'Creation default',
    };
  }
  remember(): void {
    this.drafts.activate(this.key, this.open() || !!this.optionField());
  }
  async load(more = false): Promise<void> {
    const epoch = this.auth.sessionEpoch();
    await this.state.run(async () => {
      const [cfg, page] = await Promise.all([
        this.configurationApi.get(this.projectId),
        this.api.fields(this.projectId, more ? (this.cursor() ?? undefined) : undefined),
      ]);
      if (epoch !== this.auth.sessionEpoch() || this.destroyed.destroyed) return;
      this.configuration.set(cfg);
      this.fields.set(more ? [...this.fields(), ...page.items] : page.items);
      this.cursor.set(page.nextCursor);
      if (!this.open() && !this.optionField() && !this.pending()) this.baseline = cfg.revision;
    });
  }
  edit(field?: FieldDefinition): void {
    this.cancel();
    this.editingId = field?.id ?? crypto.randomUUID();
    this.selected.set(field ?? null);
    this.form.reset(field ?? { name: '', key: '', kind: 'text', required: false, retired: false });
    this.defaultValue.set(field?.defaultValue ?? null);
    this.open.set(true);
    this.baseline = this.configuration()?.revision ?? '1';
    this.remember();
  }
  cancel(): void {
    this.open.set(false);
    this.optionField.set(null);
    this.pending.set(null);
    this.retry.finish();
    this.conflict.set(false);
    this.drafts.release(this.key);
  }
  async choices(field: FieldDefinition, more = false): Promise<void> {
    if (!more) {
      this.cancel();
      this.optionField.set(field);
      this.editOption();
      this.baseline = this.configuration()?.revision ?? '1';
    }
    const epoch = this.auth.sessionEpoch();
    await this.state.run(async () => {
      const p = await this.api.options(
        this.projectId,
        field.id,
        more ? (this.optionCursor() ?? undefined) : undefined,
      );
      if (epoch !== this.auth.sessionEpoch() || this.destroyed.destroyed) return;
      this.options.set(more ? [...this.options(), ...p.items] : p.items);
      this.optionCursor.set(p.nextCursor);
    });
  }
  editOption(option?: FieldOptionView): void {
    this.selectedOption.set(option ?? null);
    this.optionId = option?.id ?? crypto.randomUUID();
    this.optionForm.reset(option ?? { name: '', position: '1', retired: false });
    this.remember();
  }
  async save(): Promise<void> {
    if (!this.pending())
      this.pending.set({
        kind: 'field',
        id: this.editingId,
        body: {
          ...this.form.getRawValue(),
          expectedRevision: this.baseline,
          defaultValue: this.defaultValue(),
        },
      });
    await this.execute();
  }
  async saveOption(): Promise<void> {
    const field = this.optionField();
    if (!field) return;
    if (!this.pending())
      this.pending.set({
        kind: 'option',
        fieldId: field.id,
        id: this.optionId,
        body: { ...this.optionForm.getRawValue(), expectedRevision: this.baseline },
      });
    await this.execute();
  }
  async backfill(field: FieldDefinition): Promise<void> {
    this.pending.set({
      kind: 'backfill',
      id: field.id,
      revision: this.configuration()?.revision ?? '1',
    });
    await this.execute();
  }
  async execute(): Promise<void> {
    const intent = this.pending();
    if (!intent || !this.writable() || this.conflict()) return;
    const epoch = this.auth.sessionEpoch();
    await this.state.run(async () => {
      const ref = this.retry.reference(intent);
      if (intent.kind === 'field') {
        const result = await this.api.save(this.projectId, intent.id, intent.body, ref);
        if (epoch !== this.auth.sessionEpoch()) return;
        this.configuration.set(result.result.configuration);
        this.fields.update(items => [
          ...items.filter(i => i.id !== result.result.field.id),
          result.result.field,
        ]);
        this.notice.set('Field saved.');
      } else if (intent.kind === 'option') {
        const result = await this.api.saveOption(
          this.projectId,
          intent.fieldId,
          intent.id,
          intent.body,
          ref,
        );
        if (epoch !== this.auth.sessionEpoch()) return;
        this.configuration.set(result.result.configuration);
        this.options.update(items => [
          ...items.filter(i => i.id !== result.result.option.id),
          result.result.option,
        ]);
        this.notice.set('Option saved.');
      } else {
        const result = await this.api.backfill(this.projectId, intent.id, intent.revision, ref);
        if (epoch !== this.auth.sessionEpoch()) return;
        this.notice.set(
          result.result.changed +
            ' issues updated; ' +
            result.result.remaining +
            ' still missing this default.',
        );
      }
      this.baseline = this.configuration()?.revision ?? this.baseline;
      this.pending.set(null);
      this.retry.finish();
      if (intent.kind === 'field') {
        this.open.set(false);
        this.drafts.release(this.key);
      }
      if (intent.kind === 'option') this.editOption();
    });
    if (this.state.failure()?.payload.error.code === 'conflict') this.conflict.set(true);
    if (this.state.failure()?.payload.error.code === 'validation_failed') {
      this.pending.set(null);
      this.retry.finish();
    }
  }
  async review(): Promise<void> {
    const epoch = this.auth.sessionEpoch();
    await this.state.run(async () => {
      const cfg = await this.configurationApi.get(this.projectId);
      if (epoch !== this.auth.sessionEpoch()) return;
      this.configuration.set(cfg);
      this.baseline = cfg.revision;
      this.pending.set(null);
      this.retry.finish();
      this.conflict.set(false);
    });
  }
  mayLeave(): boolean {
    return this.drafts.mayLeave();
  }
}
