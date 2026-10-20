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
import type { AssigneeFilter, UserSummary } from '../../../../api/generated/types.gen';
import { AuthService } from '../../../../core/auth/auth.service';
import {
  SearchablePickerComponent,
  type PickerOption,
} from '../../../../shared/ui/searchable-picker.component';
import { RequestState } from '../../../../shared/ui/request-state';
import { RequestStatusComponent } from '../../../../shared/ui/request-status.component';
import { IssuesApi } from '../../../issues/issues.api';
import { IssueChoiceCache } from '../../../issues/issue-choice-cache.service';

@Component({
  selector: 'gg-board-assignee-picker',
  imports: [SearchablePickerComponent, RequestStatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gg-searchable-picker
      [label]="label()"
      placeholder="Find any project teammate"
      [value]="selectedIds()"
      [selected]="selectedOptions()"
      [options]="options()"
      [loading]="pending() || state.busy()"
      [hasMore]="!!cursor()"
      [disabled]="disabled()"
      (searched)="search($event)"
      (changed)="choose($event)"
      (more)="find(true)"
    />
    <gg-request-status [state]="state" />
    @if (state.message()) {
      <button
        type="button"
        class="secondary"
        (click)="find()"
        [disabled]="pending() || state.busy()"
        >Retry teammate search</button
      >
    }
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    button {
      font-size: 12px;
      margin-block-start: 6px;
    }
  `,
})
export class BoardAssigneePickerComponent {
  readonly projectId = input.required<string>();
  readonly value = input<AssigneeFilter | undefined>();
  readonly label = input('Assignee');
  readonly disabled = input(false);
  readonly changed = output<AssigneeFilter | null>();
  readonly state = new RequestState();
  readonly pending = signal(false);
  readonly people = signal<UserSummary[]>([]);
  readonly cursor = signal<string | null>(null);
  private readonly api = inject(IssuesApi);
  private readonly auth = inject(AuthService);
  private readonly cache = inject(IssueChoiceCache);
  private readonly destroy = inject(DestroyRef);
  private generation = 0;
  private query = '';
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly presets: PickerOption[] = [
    { id: 'any', label: 'Anyone' },
    { id: 'self', label: 'Assigned to me' },
    { id: 'unassigned', label: 'Unassigned' },
  ];
  readonly options = computed(() => [
    ...this.presets,
    ...this.people().map(person => ({ id: person.id, label: person.displayName })),
  ]);
  readonly selectedIds = computed(() => {
    const value = this.value();
    return [value?.kind === 'user' ? (value.userId ?? 'any') : (value?.kind ?? 'any')];
  });
  readonly selectedOptions = computed(() =>
    this.selectedIds().map(
      id =>
        this.options().find(option => option.id === id) ?? {
          id,
          label: this.cache.users.get(id)?.displayName ?? 'Specific teammate',
        },
    ),
  );

  constructor() {
    this.destroy.onDestroy(() => this.cancel());
    effect(() => {
      const project = this.projectId();
      this.auth.sessionEpoch();
      untracked(() => {
        this.cancel();
        this.people.set([]);
        this.cursor.set(null);
        this.query = '';
        this.state.clear();
        if (project) void this.find();
      });
    });
  }
  private cancel(): void {
    this.generation++;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.pending.set(false);
    this.state.busy.set(false);
  }
  search(value: string): void {
    this.cancel();
    this.query = value.trim();
    this.people.set([]);
    this.cursor.set(null);
    this.state.clear();
    if (Array.from(this.query).length > 100) {
      this.state.message.set('Use a teammate name of at most 100 characters.');
      return;
    }
    this.pending.set(true);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.find();
    }, 120);
  }
  async find(more = false): Promise<void> {
    if (!more) {
      this.cancel();
      this.cursor.set(null);
    }
    const projectId = this.projectId(),
      query = this.query,
      generation = this.generation,
      epoch = this.auth.sessionEpoch();
    if (!projectId) return;
    const current = () =>
      !this.destroy.destroyed &&
      generation === this.generation &&
      epoch === this.auth.sessionEpoch() &&
      projectId === this.projectId() &&
      query === this.query;
    await this.state.run(async () => {
      const page = await this.api.assignees(
        projectId,
        query,
        more ? (this.cursor() ?? undefined) : undefined,
      );
      if (!current()) return;
      for (const person of page.items) this.cache.users.set(person.id, person);
      this.people.set([
        ...new Map(
          (more ? [...this.people(), ...page.items] : page.items).map(person => [
            person.id,
            person,
          ]),
        ).values(),
      ]);
      this.cursor.set(page.nextCursor);
    }, current);
  }
  choose(ids: string[]): void {
    if (this.disabled()) return;
    const id = ids[0] ?? 'any';
    if (id === 'any') this.changed.emit(null);
    else if (id === 'self' || id === 'unassigned') this.changed.emit({ kind: id });
    else if (this.people().some(person => person.id === id))
      this.changed.emit({ kind: 'user', userId: id });
  }
}
