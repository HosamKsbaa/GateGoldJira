import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type {
  AssigneeFilter,
  IssueFilter,
  PriorityView,
  TypeView,
} from '../../../../api/generated/types.gen';
import { AuthService } from '../../../../core/auth/auth.service';
import { RequestState } from '../../../../shared/ui/request-state';
import { RequestStatusComponent } from '../../../../shared/ui/request-status.component';
import {
  SearchablePickerComponent,
  type PickerOption,
} from '../../../../shared/ui/searchable-picker.component';
import { DateLabelFieldsComponent } from '../../../issues/components/date-label-fields/date-label-fields.component';
import { ParentFilterComponent } from '../../../issues/components/parent-filter/parent-filter.component';
import { BoardAssigneePickerComponent } from '../board-assignee-picker/board-assignee-picker.component';
import { ProjectConfigurationApi } from '../../../projects/project-configuration.api';
import { zIssueFilter } from '../../../../api/generated/zod.gen';
@Component({
  selector: 'gg-native-board-filters',
  imports: [
    ReactiveFormsModule,
    RequestStatusComponent,
    SearchablePickerComponent,
    DateLabelFieldsComponent,
    ParentFilterComponent,
    BoardAssigneePickerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: '../board-filters/board-filters.component.css',
  styles: '.native-filter-fields{border:0;margin:0;padding:0}',
  template: ` <form [formGroup]="form"
    ><fieldset class="native-filter-fields" [disabled]="disabled()"
      ><div class="filter-grid">
        <label
          >Title, key or number<input
            type="search"
            formControlName="query"
            dir="auto"
            placeholder="Issue number, key or title"
        /></label>
        <label
          >Stage category<select formControlName="category"
            ><option value="">Any stage category</option
            ><option value="todo">To do</option
            ><option value="in_progress">In progress</option
            ><option value="review">Review</option
            ><option value="done">Done</option></select
          ></label
        >
        <gg-searchable-picker
          label="Issue types"
          [multiple]="true"
          [options]="typeOptions()"
          [selected]="retained(typeOptions(), form.controls.typeIds.value)"
          [value]="form.controls.typeIds.value"
          [disabled]="disabled()"
          [hasMore]="!!typeCursor()"
          [loading]="state.busy()"
          (searched)="typeQuery.set($event)"
          (changed)="chooseIds('types', $event)"
          (more)="more('types')"
        />
        <gg-searchable-picker
          label="Priorities"
          [multiple]="true"
          [options]="priorityOptions()"
          [selected]="retained(priorityOptions(), form.controls.priorityIds.value)"
          [value]="form.controls.priorityIds.value"
          [disabled]="disabled()"
          [hasMore]="!!priorityCursor()"
          [loading]="state.busy()"
          (searched)="priorityQuery.set($event)"
          (changed)="chooseIds('priorities', $event)"
          (more)="more('priorities')"
        />
        <label
          >Assignment filter<select formControlName="assignee"
            ><option value="any">Anyone</option
            ><option value="self">Assigned to me</option
            ><option value="unassigned">Unassigned</option
            ><option value="user">Specific teammate</option></select
          ></label
        >
        <label
          >Blocked filter<select formControlName="blocked"
            ><option value="">Any blocked state</option
            ><option value="true">Blocked</option
            ><option value="false">Unblocked</option></select
          ></label
        >
        <label>Due from<input type="date" formControlName="dueFrom" /></label
        ><label>Due through<input type="date" formControlName="dueTo" /></label>
        <label
          >Overdue filter<select formControlName="overdue"
            ><option value="">Any due state</option
            ><option value="true">Overdue</option
            ><option value="false">Not overdue</option></select
          ></label
        >
      </div>
      @if (form.controls.assignee.value === 'user') {
        <gg-board-assignee-picker
          label="Project teammate"
          [projectId]="projectId()"
          [value]="selectedAssignee()"
          [disabled]="disabled()"
          (changed)="chooseAssignee($event)"
        />
      }
      <gg-parent-filter
        [projectId]="projectId()"
        [control]="form.controls.parentId"
        [disabled]="disabled()"
      />
      <gg-date-label-fields
        [projectId]="projectId()"
        [labelsControl]="form.controls.labelIds"
        [allowCreate]="false"
        [disabled]="disabled()"
      />
      <gg-request-status [state]="state" />
      @if (error()) {
        <p class="notice error" role="alert">{{ error() }}</p>
      }
    </fieldset></form
  >`,
})
export class NativeBoardFiltersComponent {
  readonly projectId = input.required<string>();
  readonly initial = input<IssueFilter>({});
  readonly disabled = input(false);
  readonly changed = output<IssueFilter>();
  private readonly api = inject(ProjectConfigurationApi);
  private readonly auth = inject(AuthService);
  private generation = 0;
  private applying = false;
  private queryTimer: ReturnType<typeof setTimeout> | undefined;
  private lastQuery = "";
  readonly state = new RequestState();
  readonly error = signal('');
  readonly types = signal<TypeView[]>([]);
  readonly priorities = signal<PriorityView[]>([]);
  readonly typeCursor = signal<string | null>(null);
  readonly priorityCursor = signal<string | null>(null);
  readonly typeQuery = signal('');
  readonly priorityQuery = signal('');
  readonly form = new FormGroup({
    query: new FormControl('', { nonNullable: true }),
    category: new FormControl<'todo' | 'in_progress' | 'review' | 'done' | ''>('', {
      nonNullable: true,
    }),
    typeIds: new FormControl<string[]>([], { nonNullable: true }),
    priorityIds: new FormControl<string[]>([], { nonNullable: true }),
    assignee: new FormControl<'any' | 'self' | 'unassigned' | 'user'>('any', { nonNullable: true }),
    userId: new FormControl('', { nonNullable: true }),
    parentId: new FormControl('', { nonNullable: true }),
    labelIds: new FormControl<string[]>([], { nonNullable: true }),
    dueFrom: new FormControl('', { nonNullable: true }),
    dueTo: new FormControl('', { nonNullable: true }),
    blocked: new FormControl<'' | 'true' | 'false'>('', { nonNullable: true }),
    overdue: new FormControl<'' | 'true' | 'false'>('', { nonNullable: true }),
  });
  constructor() {
    inject(DestroyRef).onDestroy(() => this.cancelQuery());
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      if (this.applying || this.disabled()) return;
      const queryChanged = this.form.controls.query.value !== this.lastQuery;
      this.lastQuery = this.form.controls.query.value;
      this.cancelQuery();
      const emit = () => {
        this.queryTimer = undefined;
        if (this.disabled()) return;
        const value = this.value();
        if (value) this.changed.emit(value);
      };
      if (queryChanged) this.queryTimer = setTimeout(emit, 120);
      else emit();
    });
    effect(() => {
      const filter = this.initial();
      untracked(() => {
        this.cancelQuery();
        this.lastQuery = filter.query ?? '';
        this.applying = true;
        const category = filter.statuses?.length === 1 ? filter.statuses[0] : '';
        this.form.reset(
          {
            query: filter.query ?? '',
            category:
              category === 'todo' ||
              category === 'in_progress' ||
              category === 'review' ||
              category === 'done'
                ? category
                : '',
            typeIds: filter.typeIds ?? [],
            priorityIds: filter.priorityIds ?? [],
            assignee: filter.assignee?.kind ?? 'any',
            userId: filter.assignee?.userId ?? '',
            parentId: filter.parentId ?? '',
            labelIds: filter.labelIds ?? [],
            dueFrom: filter.dueFrom ?? '',
            dueTo: filter.dueTo ?? '',
            blocked: filter.blocked === undefined ? '' : filter.blocked ? 'true' : 'false',
            overdue: filter.overdue === undefined ? '' : filter.overdue ? 'true' : 'false',
          },
          { emitEvent: false },
        );
        this.applying = false;
      });
    });
    effect(() => {
      const project = this.projectId();
      this.auth.sessionEpoch();
      untracked(() => {
        this.generation++;
        // The old request no longer owns this state's busy flag or failure.
        this.state.busy.set(false);
        this.state.clear();
        this.types.set([]);
        this.priorities.set([]);
        this.typeCursor.set(null);
        this.priorityCursor.set(null);
        if (project && this.auth.me()) void this.load();
      });
    });
  }
  private cancelQuery(): void {
    if (this.queryTimer) clearTimeout(this.queryTimer);
    this.queryTimer = undefined;
  }
  chooseIds(kind: 'types' | 'priorities', ids: string[]): void {
    const control = kind === 'types' ? this.form.controls.typeIds : this.form.controls.priorityIds;
    control.markAsDirty();
    control.setValue(ids);
  }
  selectedAssignee(): AssigneeFilter | undefined {
    const id = this.form.controls.userId.value;
    return id ? { kind: 'user', userId: id } : undefined;
  }
  chooseAssignee(filter: AssigneeFilter | null): void {
    this.form.controls.assignee.setValue(filter?.kind ?? 'any', { emitEvent: false });
    this.form.controls.userId.setValue(filter?.userId ?? '');
  }
  typeOptions(): PickerOption[] {
    return this.types()
      .map(type => ({
        id: type.id,
        label: type.name,
        detail: type.retired ? 'Retired' : type.behavior,
      }))
      .filter(option =>
        option.label.toLocaleLowerCase().includes(this.typeQuery().trim().toLocaleLowerCase()),
      );
  }
  priorityOptions(): PickerOption[] {
    return this.priorities()
      .map(priority => ({
        id: priority.id,
        label: priority.name,
        detail: priority.retired ? 'Retired' : undefined,
      }))
      .filter(option =>
        option.label.toLocaleLowerCase().includes(this.priorityQuery().trim().toLocaleLowerCase()),
      );
  }
  retained(options: PickerOption[], ids: string[]): PickerOption[] {
    return ids.map(
      id =>
        options.find(option => option.id === id) ?? {
          id,
          label: id,
          detail: 'Retained saved choice',
        },
    );
  }
  value(): IssueFilter | null {
    const fields = this.form.getRawValue();
    const {
      query,
      statuses,
      types,
      priorities,
      typeIds,
      priorityIds,
      assignee,
      parentId,
      labelIds,
      dueFrom,
      dueTo,
      blocked,
      overdue,
      ...retained
    } = this.initial();
    const next: IssueFilter = {
      ...retained,
      ...(statuses && this.form.controls.category.pristine && !fields.category ? { statuses } : {}),
      ...(types && this.form.controls.typeIds.pristine && !fields.typeIds.length ? { types } : {}),
      ...(priorities && this.form.controls.priorityIds.pristine && !fields.priorityIds.length
        ? { priorities }
        : {}),
      ...(fields.query.trim() ? { query: fields.query.trim() } : {}),
      ...(fields.category ? { statuses: [fields.category] } : {}),
      ...(fields.typeIds.length ? { typeIds: fields.typeIds } : {}),
      ...(fields.priorityIds.length ? { priorityIds: fields.priorityIds } : {}),
      ...(fields.assignee === 'user'
        ? { assignee: { kind: 'user', userId: fields.userId } }
        : fields.assignee === 'any'
          ? {}
          : { assignee: { kind: fields.assignee } }),
      ...(fields.parentId ? { parentId: fields.parentId } : {}),
      ...(fields.labelIds.length ? { labelIds: fields.labelIds } : {}),
      ...(fields.dueFrom ? { dueFrom: fields.dueFrom } : {}),
      ...(fields.dueTo ? { dueTo: fields.dueTo } : {}),
      ...(fields.blocked ? { blocked: fields.blocked === 'true' } : {}),
      ...(fields.overdue ? { overdue: fields.overdue === 'true' } : {}),
    };
    const result = zIssueFilter.safeParse(next);
    if (!result.success || (fields.dueFrom && fields.dueTo && fields.dueFrom > fields.dueTo)) {
      this.error.set('Check the filters and use a valid due range.');
      return null;
    }
    this.error.set('');
    return result.data;
  }
  async load(): Promise<void> {
    const generation = this.generation,
      project = this.projectId(),
      epoch = this.auth.sessionEpoch();
    await this.state.run(
      async () => {
        const [types, priorities] = await Promise.all([
          this.api.types(project),
          this.api.priorities(project),
        ]);
        if (generation !== this.generation || epoch !== this.auth.sessionEpoch()) return;
        this.types.set(types.items);
        this.priorities.set(priorities.items);
        this.typeCursor.set(types.nextCursor);
        this.priorityCursor.set(priorities.nextCursor);
      },
      () => generation === this.generation && epoch === this.auth.sessionEpoch(),
    );
  }
  async more(kind: 'types' | 'priorities'): Promise<void> {
    const generation = this.generation,
      epoch = this.auth.sessionEpoch(),
      cursor = kind === 'types' ? this.typeCursor() : this.priorityCursor();
    if (!cursor) return;
    await this.state.run(
      async () => {
        if (kind === 'types') {
          const page = await this.api.types(this.projectId(), cursor);
          if (generation !== this.generation || epoch !== this.auth.sessionEpoch()) return;
          this.types.update(items => [...items, ...page.items]);
          this.typeCursor.set(page.nextCursor);
        } else {
          const page = await this.api.priorities(this.projectId(), cursor);
          if (generation !== this.generation || epoch !== this.auth.sessionEpoch()) return;
          this.priorities.update(items => [...items, ...page.items]);
          this.priorityCursor.set(page.nextCursor);
        }
      },
      () => generation === this.generation && epoch === this.auth.sessionEpoch(),
    );
  }
}
