import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import type {
  IssueFilter,
  ModernCreateFields,
  ModernIssueSummary,
  PriorityView,
  ProjectView,
  TypeView,
  UserSummary,
} from '../../../../api/generated/types.gen';
import { AuthService } from '../../../../core/auth/auth.service';
import { ApiError, RetryIntent } from '../../../../core/api/api-result';
import { RequestState } from '../../../../shared/ui/request-state';
import { RequestStatusComponent } from '../../../../shared/ui/request-status.component';
import { ProjectConfigurationApi } from '../../../projects/project-configuration.api';
import { ProjectsApi } from '../../../projects/projects.api';
import { ModernIssuesApi } from '../../modern-issues.api';
import { ModernIssueFormComponent } from '../../components/modern-issue-form/modern-issue-form.component';
import { RelatedIssueRowComponent } from '../../components/related-issue-row/related-issue-row.component';
import { DateLabelFieldsComponent } from '../../components/date-label-fields/date-label-fields.component';
import { SavedSearchesComponent } from '../../components/saved-searches/saved-searches.component';
import { ModernBulkActionsComponent } from '../../components/bulk-actions/modern-bulk-actions.component';
import { ParentFilterComponent } from '../../components/parent-filter/parent-filter.component';
import { IssuesApi } from '../../issues.api';
import { issueFilterStatuses, issueRouteFilters } from '../../issue-route-filters';

@Component({
  selector: 'gg-modern-issue-list',
  imports: [
    RouterLink,
    ReactiveFormsModule,
    RequestStatusComponent,
    ModernIssueFormComponent,
    RelatedIssueRowComponent,
    DateLabelFieldsComponent,
    SavedSearchesComponent,
    ModernBulkActionsComponent,
    ParentFilterComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './issue-list.page.css',
  templateUrl: './modern-issue-list.page.html',
})
export class ModernIssueListPage {
  private readonly auth = inject(AuthService);
  private readonly api = inject(ModernIssuesApi);
  private readonly projectsApi = inject(ProjectsApi);
  private readonly configurationApi = inject(ProjectConfigurationApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly destroy = inject(DestroyRef);
  private readonly legacyApi = inject(IssuesApi);
  private readonly initial = issueRouteFilters(this.route.snapshot.queryParamMap);
  readonly filters = new FormGroup({
    query: new FormControl(this.initial.query, { nonNullable: true }),
    projectId: new FormControl(this.initial.projectId, { nonNullable: true }),
    status: new FormControl(this.initial.status, { nonNullable: true }),
    assignee: new FormControl(this.initial.assignee, { nonNullable: true }),
    typeId: new FormControl('', { nonNullable: true }),
    priorityId: new FormControl('', { nonNullable: true }),
    view: new FormControl(this.initial.view, { nonNullable: true }),
    sort: new FormControl(this.initial.sort, { nonNullable: true }),
    blocked: new FormControl(this.initial.blocked, { nonNullable: true }),
    parentId: new FormControl(this.initial.parentId, { nonNullable: true }),
    labelIds: new FormControl<string[]>([], { nonNullable: true }),
    dueFrom: new FormControl('', { nonNullable: true }),
    dueTo: new FormControl('', { nonNullable: true }),
    overdue: new FormControl('', { nonNullable: true }),
  });
  readonly projects = signal<ProjectView[]>([]);
  readonly projectCursor = signal<string | null>(null);
  readonly types = signal<TypeView[]>([]);
  readonly priorities = signal<PriorityView[]>([]);
  readonly typeCursor = signal<string | null>(null);
  readonly priorityCursor = signal<string | null>(null);
  readonly items = signal<ModernIssueSummary[]>([]);
  readonly cursor = signal<string | null>(null);
  readonly total = signal(0);
  readonly state = new RequestState();
  readonly searchState = new RequestState();
  readonly optionsState = new RequestState();
  readonly searchPending = signal(false);
  selectedProject(): ProjectView | undefined {
    return this.projects().find(p => p.id === this.filters.controls.projectId.value);
  }
  readonly creating = signal(false);
  readonly form = viewChild(ModernIssueFormComponent);
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('createDialog');
  readonly pending = signal<{ projectId: string; body: ModernCreateFields } | null>(null);
  private readonly retry = new RetryIntent<{ projectId: string; body: ModernCreateFields }>();
  readonly selected = signal<ModernIssueSummary[]>([]);
  readonly people = signal<UserSummary[]>([]);
  readonly peopleQuery = new FormControl('', { nonNullable: true });
  readonly peopleCursor = signal<string | null>(null);
  readonly peopleState = new RequestState();
  readonly filterSnapshot = signal<IssueFilter>({});
  readonly fullSavedFilter = signal(false);
  readonly bulk = viewChild(ModernBulkActionsComponent);
  private restoredFilter: IssueFilter | null = null;
  private restoredValues: ReturnType<typeof this.filters.getRawValue> | null = null;
  private peopleGeneration = 0;
  private peopleTimer: ReturnType<typeof setTimeout> | undefined;
  private searchGeneration = 0;
  private optionGeneration = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private activeFilter: IssueFilter = {};
  constructor() {
    let firstRoute = true;
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe(params => {
      if (firstRoute) {
        firstRoute = false;
        return;
      }
      const next = issueRouteFilters(params);
      const prevProject = this.filters.controls.projectId.value;
      this.filters.patchValue(
        {
          query: next.query,
          projectId: next.projectId,
          status: next.status,
          assignee: next.assignee,
          view: next.view,
          sort: next.sort,
          blocked: next.blocked,
          parentId: next.parentId,
        },
        { emitEvent: false },
      );
      if (next.projectId !== prevProject) {
        this.filters.controls.typeId.reset('', { emitEvent: false });
        this.filters.controls.priorityId.reset('', { emitEvent: false });
        this.filters.controls.labelIds.reset([], { emitEvent: false });
        this.selected.set([]);
        this.restoredFilter = null;
        this.fullSavedFilter.set(false);
        void this.ensureProjectLoaded(next.projectId);
        void this.loadChoices();
        void this.loadPeople();
      }
      this.schedule();
      if (params.get('create') === 'true' && this.writable()) {
        this.newIssue();
      }
    });
    this.destroy.onDestroy(() => {
      this.stopSearch();
      this.peopleGeneration++;
      if (this.peopleTimer) clearTimeout(this.peopleTimer);
    });
    this.peopleQuery.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.peopleGeneration++;
      if (this.peopleTimer) clearTimeout(this.peopleTimer);
      this.peopleState.busy.set(false);
      this.peopleTimer = setTimeout(() => void this.loadPeople(), 120);
    });
    this.filters.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.schedule());
    this.filters.controls.projectId.valueChanges.pipe(takeUntilDestroyed()).subscribe(id => {
      this.filters.controls.typeId.reset('', { emitEvent: false });
      this.filters.controls.priorityId.reset('', { emitEvent: false });
      this.filters.controls.labelIds.reset([], { emitEvent: false });
      this.selected.set([]);
      this.restoredFilter = null;
      this.fullSavedFilter.set(false);
      void this.ensureProjectLoaded(id);
      void this.loadChoices();
      void this.loadPeople();
    });
    this.authEpoch();
    void this.start();
  }
  private authEpoch() {
    let epoch = this.auth.sessionEpoch();
    effect(() => {
      this.auth.sessionEpoch();
      if (epoch === this.auth.sessionEpoch()) return;
      epoch = this.auth.sessionEpoch();
      this.stopSearch();
      this.optionGeneration++;
      this.items.set([]);
      this.selected.set([]);
      this.people.set([]);
      this.peopleGeneration++;
      this.restoredFilter = null;
      this.fullSavedFilter.set(false);
      this.projects.set([]);
      this.types.set([]);
      this.priorities.set([]);
      this.pending.set(null);
      this.retry.finish();
      this.dialog()?.nativeElement.close();
      this.state.busy.set(false);
      this.state.clear();
      this.creating.set(false);
      if (this.auth.me()) void this.start();
    });
  }
  private async start() {
    const epoch = this.auth.sessionEpoch();
    const searching = this.search();
    await this.state.run(
      async () => {
        await Promise.all([this.loadProjects(), this.loadChoices(), this.loadPeople()]);
      },
      () => epoch === this.auth.sessionEpoch(),
    );
    if (
      epoch === this.auth.sessionEpoch() &&
      this.route.snapshot.queryParamMap.get('create') === 'true' &&
      this.writable()
    )
      this.newIssue();
    await searching;
  }
  private async ensureProjectLoaded(id: string) {
    if (!id || this.projects().some(p => p.id === id)) return;
    const epoch = this.auth.sessionEpoch();
    try {
      const project = await this.projectsApi.get(id);
      if (epoch === this.auth.sessionEpoch() && !this.projects().some(p => p.id === id)) {
        this.projects.update(p => [...p, project]);
      }
    } catch {
      // Handled by main search/project state if invalid
    }
  }
  async loadProjects(more = false) {
    const epoch = this.auth.sessionEpoch();
    const page = await this.projectsApi.list(
      true,
      more ? (this.projectCursor() ?? undefined) : undefined,
    );
    if (epoch !== this.auth.sessionEpoch()) return;
    const projects = more ? [...this.projects(), ...page.items] : page.items;
    // The selected project can be retained before its directory cursor page arrives.
    this.projects.set([...new Map(projects.map(project => [project.id, project])).values()]);
    this.projectCursor.set(page.nextCursor);
    const id = this.filters.controls.projectId.value;
    if (id && !this.projects().some(p => p.id === id)) {
      const project = await this.projectsApi.get(id);
      if (epoch === this.auth.sessionEpoch() && !this.projects().some(p => p.id === id)) {
        this.projects.update(p => [...p, project]);
      }
    }
  }
  async loadChoices() {
    const generation = ++this.optionGeneration,
      epoch = this.auth.sessionEpoch(),
      id = this.filters.controls.projectId.value;
    this.optionsState.busy.set(false);
    this.types.set([]);
    this.priorities.set([]);
    this.typeCursor.set(null);
    this.priorityCursor.set(null);
    if (!id) return;
    const current = () =>
      !this.destroy.destroyed &&
      generation === this.optionGeneration &&
      epoch === this.auth.sessionEpoch();
    await this.optionsState.run(async () => {
      const [types, priorities] = await Promise.all([
        this.configurationApi.types(id),
        this.configurationApi.priorities(id),
      ]);
      if (!current()) return;
      this.types.set(types.items);
      this.typeCursor.set(types.nextCursor);
      this.priorities.set(priorities.items);
      this.priorityCursor.set(priorities.nextCursor);
    }, current);
  }
  async moreChoices(kind: 'types' | 'priorities') {
    const generation = this.optionGeneration,
      epoch = this.auth.sessionEpoch(),
      id = this.filters.controls.projectId.value;
    const current = () =>
      !this.destroy.destroyed &&
      generation === this.optionGeneration &&
      epoch === this.auth.sessionEpoch();
    await this.optionsState.run(async () => {
      if (kind === 'types' && this.typeCursor()) {
        const p = await this.configurationApi.types(id, this.typeCursor()!);
        if (current()) {
          this.types.update(v => [...v, ...p.items]);
          this.typeCursor.set(p.nextCursor);
        }
      }
      if (kind === 'priorities' && this.priorityCursor()) {
        const p = await this.configurationApi.priorities(id, this.priorityCursor()!);
        if (current()) {
          this.priorities.update(v => [...v, ...p.items]);
          this.priorityCursor.set(p.nextCursor);
        }
      }
    }, current);
  }
  private filter(): IssueFilter {
    const f = this.filters.getRawValue();
    const current: IssueFilter = {
      query: f.query.trim(),
      ...(f.projectId ? { projectIds: [f.projectId] } : {}),
      ...(f.status && f.status !== '__saved' ? { statuses: issueFilterStatuses(f.status) } : {}),
      ...(f.typeId && f.typeId !== '__saved' ? { typeIds: [f.typeId] } : {}),
      ...(f.priorityId && f.priorityId !== '__saved' ? { priorityIds: [f.priorityId] } : {}),
      ...(f.parentId ? { parentId: f.parentId } : {}),
      ...(f.labelIds.length ? { labelIds: f.labelIds } : {}),
      ...(f.dueFrom ? { dueFrom: f.dueFrom } : {}),
      ...(f.dueTo ? { dueTo: f.dueTo } : {}),
      ...(f.overdue ? { overdue: f.overdue === 'true' } : {}),
      assignee:
        f.assignee === 'self' || f.assignee === 'unassigned' || f.assignee === 'any'
          ? { kind: f.assignee }
          : { kind: 'user', userId: f.assignee },
      sort:
        f.sort === 'priority'
          ? 'priority'
          : f.sort === 'created'
            ? 'created'
            : f.sort === 'due'
              ? 'due'
              : 'updated',
      archived: f.view === 'archived',
      ...(f.view === 'backlog' ? { backlog: true } : {}),
      ...(f.blocked ? { blocked: f.blocked === 'true' } : {}),
    };
    const baseline = this.restoredValues,
      saved = this.restoredFilter;
    if (!baseline || !saved) return current;
    const merged = structuredClone(saved);
    if (f.query !== baseline.query) merged.query = current.query;
    if (f.projectId !== baseline.projectId) merged.projectIds = current.projectIds;
    if (f.status !== baseline.status) merged.statuses = current.statuses;
    if (f.typeId !== baseline.typeId) {
      delete merged.types;
      merged.typeIds = current.typeIds;
    }
    if (f.priorityId !== baseline.priorityId) {
      delete merged.priorities;
      merged.priorityIds = current.priorityIds;
    }
    if (f.assignee !== baseline.assignee) merged.assignee = current.assignee;
    if (f.parentId !== baseline.parentId) merged.parentId = current.parentId;
    if (JSON.stringify(f.labelIds) !== JSON.stringify(baseline.labelIds))
      merged.labelIds = current.labelIds;
    if (f.dueFrom !== baseline.dueFrom) merged.dueFrom = current.dueFrom;
    if (f.dueTo !== baseline.dueTo) merged.dueTo = current.dueTo;
    if (f.overdue !== baseline.overdue) merged.overdue = current.overdue;
    if (f.blocked !== baseline.blocked) merged.blocked = current.blocked;
    if (f.sort !== baseline.sort) merged.sort = current.sort;
    if (f.view !== baseline.view) {
      merged.archived = current.archived;
      merged.backlog = current.backlog;
    }
    return merged;
  }

  private stopSearch() {
    this.searchGeneration++;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.searchPending.set(false);
  }
  private schedule() {
    this.filterSnapshot.set(structuredClone(this.filter()));
    if (!this.bulk()?.frozen()) this.selected.set([]);
    this.stopSearch();
    this.searchState.busy.set(false);
    this.cursor.set(null);
    this.searchPending.set(true);
    this.timer = setTimeout(() => void this.search(), 120);
  }
  async search(more = false) {
    if (!more) {
      this.stopSearch();
      this.searchState.busy.set(false);
      this.activeFilter = this.filter();
      this.filterSnapshot.set(structuredClone(this.activeFilter));
    }
    const generation = this.searchGeneration,
      epoch = this.auth.sessionEpoch(),
      cursor = more ? this.cursor() : null,
      filter = this.activeFilter;
    const current = () =>
      !this.destroy.destroyed &&
      generation === this.searchGeneration &&
      epoch === this.auth.sessionEpoch();
    await this.searchState.run(async () => {
      const page = await this.api.search(filter, cursor ?? undefined);
      if (current()) {
        this.items.set(more ? [...this.items(), ...page.items] : page.items);
        this.cursor.set(page.nextCursor);
        this.total.set(page.totalMatching);
      }
    }, current);
  }
  reset() {
    if (this.bulk()?.frozen()) return;
    this.restoredFilter = null;
    this.restoredValues = null;
    this.fullSavedFilter.set(false);
    this.filters.reset({
      query: '',
      projectId: '',
      status: '',
      assignee: 'any',
      typeId: '',
      priorityId: '',
      view: 'active',
      sort: 'updated',
      blocked: '',
      parentId: '',
      labelIds: [],
      dueFrom: '',
      dueTo: '',
      overdue: '',
    });
  }
  writable() {
    return (
      !!this.selectedProject() &&
      !this.selectedProject()?.archived &&
      this.selectedProject()?.effectiveRole !== 'viewer'
    );
  }
  chosen(id: string) {
    return this.selected().some(item => item.id === id);
  }
  toggle(issue: ModernIssueSummary) {
    if (!this.writable() || this.bulk()?.frozen()) return;
    this.bulk()?.clearReport();
    this.selected.update(items =>
      items.some(item => item.id === issue.id)
        ? items.filter(item => item.id !== issue.id)
        : items.length < 100
          ? [...items, issue]
          : items,
    );
  }
  selectVisible() {
    if (!this.writable() || this.bulk()?.frozen()) return;
    this.bulk()?.clearReport();
    const ids = new Set(this.items().map(i => i.id));
    const all = this.items().every(i => this.chosen(i.id));
    this.selected.update(selected =>
      all
        ? selected.filter(i => !ids.has(i.id))
        : [...selected.filter(i => !ids.has(i.id)), ...this.items()].slice(0, 100),
    );
  }
  async loadPeople(more = false) {
    const generation = ++this.peopleGeneration,
      epoch = this.auth.sessionEpoch(),
      id = this.filters.controls.projectId.value;
    if (!id) {
      this.people.set([]);
      return;
    }
    if (!more) {
      this.peopleCursor.set(null);
      this.peopleState.busy.set(false);
    }
    const current = () =>
      !this.destroy.destroyed &&
      generation === this.peopleGeneration &&
      epoch === this.auth.sessionEpoch();
    await this.peopleState.run(async () => {
      const p = await this.legacyApi.assignees(
        id,
        this.peopleQuery.value.trim(),
        more ? (this.peopleCursor() ?? undefined) : undefined,
      );
      if (current()) {
        this.people.set(more ? [...this.people(), ...p.items] : p.items);
        this.peopleCursor.set(p.nextCursor);
      }
    }, current);
  }
  async applySaved(f: IssueFilter) {
    if (this.bulk()?.frozen()) return;
    this.stopSearch();
    this.searchState.busy.set(false);
    this.selected.set([]);
    this.filters.reset(
      {
        query: f.query ?? '',
        projectId: f.projectIds?.length === 1 ? (f.projectIds[0] ?? '') : '',
        status: (f.statuses?.length ?? 0) > 1 ? '__saved' : (f.statuses?.[0] ?? ''),
        assignee:
          f.assignee?.kind === 'user' ? (f.assignee.userId ?? 'any') : (f.assignee?.kind ?? 'any'),
        typeId:
          (f.types?.length ?? 0) > 0 || (f.typeIds?.length ?? 0) > 1
            ? '__saved'
            : (f.typeIds?.[0] ?? ''),
        priorityId:
          (f.priorities?.length ?? 0) > 0 || (f.priorityIds?.length ?? 0) > 1
            ? '__saved'
            : (f.priorityIds?.[0] ?? ''),
        view: f.archived ? 'archived' : f.backlog ? 'backlog' : 'active',
        sort: f.sort ?? 'updated',
        blocked: f.blocked === undefined ? '' : String(f.blocked),
        parentId: f.parentId ?? '',
        labelIds: f.labelIds ?? [],
        dueFrom: f.dueFrom ?? '',
        dueTo: f.dueTo ?? '',
        overdue: f.overdue === undefined ? '' : String(f.overdue),
      },
      { emitEvent: false },
    );
    this.restoredFilter = structuredClone(f);
    this.filterSnapshot.set(structuredClone(f));
    this.restoredValues = structuredClone(this.filters.getRawValue());
    this.fullSavedFilter.set(true);
    await Promise.all([this.loadChoices(), this.loadPeople(), this.search()]);
  }
  myIssues() {
    if (this.bulk()?.frozen()) return;
    this.filters.controls.assignee.setValue('self');
  }
  newIssue() {
    if (this.state.busy() || !this.writable()) return;
    this.creating.set(true);
    // Consume the navigation command so the global Create link can be used
    // again after closing this dialog on the same issue-list route.
    if (this.route.snapshot.queryParamMap.has('create'))
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { create: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    afterNextRender(
      () => {
        this.dialog()?.nativeElement.showModal();
        document.getElementById('issue-title')?.focus();
      },
      { injector: this.injector },
    );
  }
  cancel(event?: Event) {
    event?.preventDefault();
    if (this.state.busy() || !this.form()?.confirmClose()) return;
    this.dialog()?.nativeElement.close();
    this.creating.set(false);
    this.pending.set(null);
    this.retry.finish();
  }
  async create(fields: ModernCreateFields) {
    const projectId = this.filters.controls.projectId.value;
    const intent = this.pending() ?? {
      projectId,
      body: {
        ...fields,
        ...(this.filters.controls.view.value === 'backlog' ? { backlog: true } : {}),
      },
    };
    this.pending.set(intent);
    await this.retryCreate();
  }
  async retryCreate() {
    const intent = this.pending();
    if (!intent) return;
    const epoch = this.auth.sessionEpoch(),
      form = this.form();
    if (!form) return;
    const owner = () => !this.destroy.destroyed && epoch === this.auth.sessionEpoch();
    const current = () => owner() && form === this.form() &&
      intent.projectId === this.filters.controls.projectId.value;
    await this.state.run(
      async () => {
        try {
          const existing = form.createdIssueId();
          const saved = existing
            ? { result: await this.api.get(existing) }
            : await this.api.create(intent.projectId, intent.body, this.retry.reference(intent));
          if (!current()) return;
          await form.finishUploads(saved.result);
          if (!current()) return;
          form.saved();
          this.pending.set(null);
          this.retry.finish();
          this.dialog()?.nativeElement.close();
          this.creating.set(false);
          await this.router.navigate(['/issues', saved.result.summary.id]);
        } catch (error: unknown) {
          if (
            current() &&
            error instanceof ApiError &&
            !error.payload.error.retryable
          ) {
            this.pending.set(null);
            this.retry.finish();
          }
          throw error;
        }
      },
      owner,
    );
  }
}
