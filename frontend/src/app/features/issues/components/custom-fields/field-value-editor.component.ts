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
  FieldDefinition,
  FieldValueDisplay,
  FieldOptionView,
  UserSummary,
} from '../../../../api/generated/types.gen';
import { SearchablePickerComponent } from '../../../../shared/ui/searchable-picker.component';
import { ProjectFieldsApi } from '../../../projects/project-fields.api';
import { CommentsApi } from '../../../comments/comments.api';
import { AuthService } from '../../../../core/auth/auth.service';
import { RequestState } from '../../../../shared/ui/request-state';
import { RequestStatusComponent } from '../../../../shared/ui/request-status.component';
import { fieldText, fieldValue, type FieldValue } from './field-value';
@Component({
  selector: 'gg-field-value-editor',
  imports: [SearchablePickerComponent, RequestStatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ` @switch (field().kind) {
      @case ('choice') {
        <gg-searchable-picker
          [label]="field().name"
          [options]="choices()"
          [selected]="selected()"
          [value]="ids()"
          [disabled]="disabled()"
          [loading]="state.busy()"
          [hasMore]="!!cursor()"
          (searched)="query.set($event)"
          (more)="load(true)"
          (changed)="choose($event)"
        />
      }
      @case ('user') {
        <gg-searchable-picker
          [label]="field().name"
          [options]="people()"
          [selected]="selected()"
          [value]="ids()"
          [disabled]="disabled()"
          [loading]="state.busy()"
          [hasMore]="!!cursor()"
          (searched)="searchPeople($event)"
          (more)="load(true)"
          (changed)="choose($event)"
        />
      }
      @default {
        <label [for]="id"
          ><bdi>{{ field().name }}</bdi>
          @if (field().required) {
            <span aria-hidden="true"> *</span>
          }</label
        ><input
          [id]="id"
          [attr.aria-label]="field().name"
          [type]="field().kind === 'date' ? 'date' : 'text'"
          [attr.inputmode]="field().kind === 'number' ? 'decimal' : null"
          [attr.maxlength]="field().kind === 'number' ? 40 : 5000"
          [value]="text()"
          [disabled]="disabled()"
          [required]="field().required"
          dir="auto"
          (input)="edit($event)"
        />
      }
    }
    <gg-request-status [state]="state" />`,
  styles: `
    :host {
      display: block;
      margin: 10px 0;
    }
    label {
      font-size: 13px;
    }
    input {
      width: 100%;
      min-height: 36px;
    }
  `,
})
export class FieldValueEditorComponent {
  readonly field = input.required<FieldDefinition>();
  readonly value = input<FieldValue>(null);
  readonly reference = input<FieldValueDisplay | null>(null);
  readonly disabled = input(false);
  readonly changed = output<FieldValue>();
  readonly id = 'field-' + crypto.randomUUID();
  readonly text = computed(() => fieldText(this.value()));
  readonly ids = computed(() => (this.text() ? [this.text()] : []));
  readonly query = signal('');
  readonly options = signal<FieldOptionView[]>([]);
  readonly users = signal<UserSummary[]>([]);
  readonly cursor = signal<string | null>(null);
  readonly state = new RequestState();
  readonly choices = computed(() =>
    this.options()
      .filter(
        o => !o.retired && o.name.toLocaleLowerCase().includes(this.query().toLocaleLowerCase()),
      )
      .map(o => ({ id: o.id, label: o.name })),
  );
  readonly people = computed(() => this.users().map(u => ({ id: u.id, label: u.displayName })));
  readonly selected = computed(() => {
    const text = this.text();
    if (!text) return [];
    const option = this.options().find(o => o.id === text),
      user = this.users().find(u => u.id === text),
      reference = this.reference()?.referenceId === text ? this.reference() : null;
    return [
      {
        id: text,
        label: option?.name ?? user?.displayName ?? reference?.label ?? (this.field().kind === 'user' ? 'Unavailable person' : 'Unavailable option'),
        detail: (option?.retired ?? reference?.retired) ? 'Retired' : '',
      },
    ];
  });
  private readonly fields = inject(ProjectFieldsApi);
  private readonly comments = inject(CommentsApi);
  private readonly auth = inject(AuthService);
  private readonly destroyed = inject(DestroyRef);
  private generation = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor() {
    effect(() => {
      this.field().id;
      this.auth.sessionEpoch();
      untracked(() => {
        this.generation++;
        this.options.set([]);
        this.users.set([]);
        this.cursor.set(null);
        this.state.busy.set(false);
        void this.load();
      });
    });
    this.destroyed.onDestroy(() => {
      this.generation++;
      if (this.timer) clearTimeout(this.timer);
    });
  }
  edit(event: Event): void {
    if (event.target instanceof HTMLInputElement)
      this.changed.emit(fieldValue(this.field().kind, event.target.value));
  }
  choose(ids: string[]): void {
    this.changed.emit(fieldValue(this.field().kind, ids[0] ?? ''));
  }
  searchPeople(query: string): void {
    this.query.set(query);
    this.generation++;
    this.state.busy.set(false);
    this.users.set([]);
    this.cursor.set(null);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.load(), 120);
  }
  async load(more = false): Promise<void> {
    const field = this.field(),
      generation = this.generation,
      epoch = this.auth.sessionEpoch();
    const current = () =>
      !this.destroyed.destroyed &&
      generation === this.generation &&
      epoch === this.auth.sessionEpoch();
    if (field.kind !== 'choice' && field.kind !== 'user') return;
    await this.state.run(async () => {
      const cursor = more ? (this.cursor() ?? undefined) : undefined;
      if (field.kind === 'choice') {
        const p = await this.fields.options(field.projectId, field.id, cursor);
        if (current()) {
          this.options.set(more ? [...this.options(), ...p.items] : p.items);
          this.cursor.set(p.nextCursor);
        }
      } else {
        const p = await this.comments.mentionCandidates(field.projectId, this.query(), cursor);
        if (current()) {
          this.users.set(more ? [...this.users(), ...p.items] : p.items);
          this.cursor.set(p.nextCursor);
        }
      }
    }, current);
  }
}
