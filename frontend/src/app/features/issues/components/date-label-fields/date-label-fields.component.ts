import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SearchablePickerComponent } from '../../../../shared/ui/searchable-picker.component';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import type { LabelView } from '../../../../api/generated/types.gen';
import { AuthService } from '../../../../core/auth/auth.service';
import { RetryIntent } from '../../../../core/api/api-result';
import { RequestState } from '../../../../shared/ui/request-state';
import { RequestStatusComponent } from '../../../../shared/ui/request-status.component';
import { unicodeLength } from '../../../../shared/forms/unicode.validators';
import { IssueChoiceCache } from '../../issue-choice-cache.service';
import { IssuesApi } from '../../issues.api';
@Component({
  selector: 'gg-date-label-fields',
  imports: [SearchablePickerComponent, ReactiveFormsModule, RequestStatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './date-label-fields.component.css',
  template: ` @if (dueDateControl(); as date) {
      <label>Due date<input type="date" [formControl]="date" /></label
      ><p class="muted field-hint">Company calendar · leave empty to clear.</p>
    }
    <fieldset
      ><legend>{{ allowCreate() ? 'Labels' : 'Require all selected labels' }}</legend>
      <gg-request-status [state]="state" />
      <gg-searchable-picker
        label="Labels"
        placeholder="Search project labels"
        [options]="pickerOptions()"
        [selected]="selectedOptions()"
        [value]="labelsControl().value"
        [multiple]="true"
        [loading]="searchPending() || state.busy()"
        [hasMore]="!!cursor()"
        [disabled]="disabled() || !projectId()"
        (searched)="query.setValue($event)"
        (changed)="choose($event)"
        (more)="find(cursor() ?? undefined)"
      />
      @if (!projectId()) {
        <p>Select a project to choose its labels.</p>
      }
      @for (id of unlistedSelections(); track id) {
        <p
          >Selected label <bdi>{{ id }}</bdi>
          <button type="button" (click)="remove(id)" [disabled]="disabled()"
            >Remove selected label</button
          ></p
        >
      }
      <p class="muted">{{ labelsControl().value.length }} / 10 labels selected</p>
      @if (allowCreate()) {
        <div class="label-search new-label"
          ><label
            >New label name<input
              [formControl]="name"
              dir="auto"
              placeholder="For example, frontend" /></label
          ><button
            type="button"
            class="secondary"
            (click)="create()"
            [disabled]="disabled() || state.busy() || name.invalid || !name.value.trim()"
            >Create and select label</button
          ></div
        >
      }
    </fieldset>`,
})
export class DateLabelFieldsComponent {
  readonly projectId = input.required<string>();
  readonly labelsControl = input.required<FormControl<string[]>>();
  readonly dueDateControl = input<FormControl<string> | null>(null);
  readonly initialLabels = input<LabelView[]>([]);
  readonly allowCreate = input(true);
  readonly disabled = input(false);
  private readonly cache = inject(IssueChoiceCache);
  private readonly api = inject(IssuesApi);
  private readonly auth = inject(AuthService);
  private generation = 0;
  private readonly destroyRef = inject(DestroyRef);
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  readonly searchPending = signal(false);
  private readonly retry = new RetryIntent<{ projectId: string; name: string }>();
  private readonly selected = new Map<string, LabelView>();
  readonly state = new RequestState();
  readonly choices = signal<LabelView[]>([]);
  readonly cursor = signal<string | null>(null);
  readonly query = new FormControl('', { nonNullable: true, validators: [unicodeLength(40)] });
  readonly name = new FormControl('', { nonNullable: true, validators: [unicodeLength(40)] });
  pickerOptions() {
    return this.choices().map(label => ({ id: label.id, label: label.name }));
  }
  selectedOptions() {
    return [...this.selected.values()]
      .filter(label => this.labelsControl().value.includes(label.id))
      .map(label => ({ id: label.id, label: label.name }));
  }
  choose(ids: string[]): void {
    if (this.disabled()) return;
    if (ids.length > 10) {
      this.state.message.set('An issue or filter can have at most ten labels.');
      return;
    }
    for (const label of this.choices())
      if (ids.includes(label.id)) this.selected.set(label.id, label);
    this.labelsControl().setValue(ids);
    this.labelsControl().markAsDirty();
  }
  constructor() {
    this.query.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.cancelScheduledSearch();
      this.generation++;
      this.state.busy.set(false);
      this.state.clear();
      this.choices.set([]);
      this.cursor.set(null);
      if (this.query.invalid || !this.projectId() || this.disabled()) return;
      this.searchPending.set(true);
      this.searchTimer = setTimeout(() => {
        this.searchTimer = null;
        void this.find();
      }, 120);
    });
    this.destroyRef.onDestroy(() => {
      this.cancelScheduledSearch();
      this.generation++;
    });
    effect(() => {
      const id = this.projectId(),
        initial = this.initialLabels();
      this.auth.sessionEpoch();
      untracked(() => {
        this.cancelScheduledSearch();
        this.generation++;
        this.selected.clear();
        for (const label of initial) this.cache.labels.set(label.id, label);
        for (const id of this.labelsControl().value) {
          const label = this.cache.labels.get(id);
          if (label) this.selected.set(id, label);
        }
        this.choices.set([...this.selected.values()]);
        this.cursor.set(null);
        this.state.busy.set(false);
        this.state.clear();
        this.retry.finish();
        if (id) void this.find();
      });
    });
  }
  private cancelScheduledSearch(): void {
    if (this.searchTimer !== null) {
      clearTimeout(this.searchTimer);
      this.searchTimer = null;
    }
    this.searchPending.set(false);
  }
  unlistedSelections(): string[] {
    const visible = new Set([...this.choices().map(label => label.id), ...this.selected.keys()]);
    return this.labelsControl().value.filter(id => !visible.has(id));
  }
  remove(id: string): void {
    if (this.disabled()) return;
    this.selected.delete(id);
    this.labelsControl().setValue(this.labelsControl().value.filter(value => value !== id));
    this.labelsControl().markAsDirty();
  }
  async find(cursor?: string): Promise<void> {
    this.cancelScheduledSearch();
    if (this.query.invalid || !this.projectId()) return;
    if (!cursor) {
      this.generation++;
      this.state.busy.set(false);
      this.cursor.set(null);
    }
    const query = this.query.value,
      id = this.projectId(),
      generation = this.generation,
      epoch = this.auth.sessionEpoch();
    const current = () =>
      !this.destroyRef.destroyed &&
      id === this.projectId() &&
      generation === this.generation &&
      epoch === this.auth.sessionEpoch() &&
      query === this.query.value;
    await this.state.run(async () => {
      const page = await this.api.labels(id, query, cursor);
      if (!current()) return;
      for (const label of page.items) this.cache.labels.set(label.id, label);
      const selectedIds = new Set(this.labelsControl().value);
      for (const label of this.choices())
        if (selectedIds.has(label.id)) this.selected.set(label.id, label);
      const result = new Map(
        cursor
          ? this.choices().map(label => [label.id, label])
          : [...this.selected].filter(([key]) => selectedIds.has(key)),
      );
      for (const label of page.items) result.set(label.id, label);
      this.choices.set([...result.values()]);
      this.cursor.set(page.nextCursor);
    }, current);
  }
  select(label: LabelView, event: Event): void {
    if (!(event.target instanceof HTMLInputElement) || this.disabled()) return;
    const ids = this.labelsControl().value;
    if (event.target.checked && !ids.includes(label.id)) {
      if (ids.length >= 10) {
        event.target.checked = false;
        this.state.message.set('An issue or filter can have at most ten labels.');
        return;
      }
      this.selected.set(label.id, label);
      this.labelsControl().setValue([...ids, label.id]);
    } else if (!event.target.checked) {
      this.selected.delete(label.id);
      this.labelsControl().setValue(ids.filter(id => id !== label.id));
    }
    this.labelsControl().markAsDirty();
  }
  async create(): Promise<void> {
    if (!this.allowCreate() || this.disabled() || this.name.invalid) return;
    const projectId = this.projectId(),
      name = this.name.value.trim(),
      generation = this.generation,
      epoch = this.auth.sessionEpoch();
    if (!name || !projectId) return;
    const current = () =>
      projectId === this.projectId() &&
      generation === this.generation &&
      epoch === this.auth.sessionEpoch();
    await this.state.run(async () => {
      const saved = await this.api.createLabel(
        projectId,
        name,
        this.retry.reference({ projectId, name }),
      );
      if (!current()) return;
      this.retry.finish();
      this.name.reset();
      const label = saved.result;
      this.cache.labels.set(label.id, label);
      this.selected.set(label.id, label);
      this.choices.update(values =>
        values.some(v => v.id === label.id) ? values : [label, ...values].slice(0, 35),
      );
      const ids = this.labelsControl().value;
      if (!ids.includes(label.id)) {
        if (ids.length === 10) {
          this.state.message.set('Label saved. Remove one selection before adding another.');
          return;
        }
        this.labelsControl().setValue([...ids, label.id]);
        this.labelsControl().markAsDirty();
      }
    }, current);
  }
}
