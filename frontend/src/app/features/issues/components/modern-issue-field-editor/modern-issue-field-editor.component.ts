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
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import type {
  ModernEditable,
  ModernIssueView,
  UserSummary,
  ModernPatchFields,
  PriorityView,
} from '../../../../api/generated/types.gen';
import { zModernEditable, zModernIssueView } from '../../../../api/generated/zod.gen';
import { AuthService } from '../../../../core/auth/auth.service';
import { RetryIntent } from '../../../../core/api/api-result';
import { DraftsService } from '../../../../core/drafts/drafts.service';
import { positionAnchoredPopup } from '../../../../shared/ui/position-anchored-popup';
import { RequestState } from '../../../../shared/ui/request-state';
import { RequestStatusComponent } from '../../../../shared/ui/request-status.component';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { ModernIssuesApi } from '../../modern-issues.api';
import { IssuesApi } from '../../issues.api';
import { modernEditable } from '../../issue-model';
import { ProjectConfigurationApi } from '../../../projects/project-configuration.api';
import { DateLabelFieldsComponent } from '../date-label-fields/date-label-fields.component';
import { DescriptionEditorComponent } from '../description-editor/description-editor.component';

export type ModernEditableField =
  | 'title'
  | 'description'
  | 'assigneeId'
  | 'priorityId'
  | 'dueDate'
  | 'labelIds';
interface FieldChoice {
  value: string;
  label: string;
}
interface AssigneePage {
  items: UserSummary[];
  nextCursor: string | null;
}
interface FieldSaveIntent {
  id: string;
  revision: string;
  editable: ModernEditable;
  patch?: ModernPatchFields;
}

@Component({
  selector: 'gg-modern-issue-field-editor',
  host: {
    '[class.is-editing]': 'editing() && !isPopup()',
    '(document:pointerdown)': 'outsidePointer($event)',
  },
  imports: [
    ReactiveFormsModule,
    RequestStatusComponent,
    IconComponent,
    DateLabelFieldsComponent,
    DescriptionEditorComponent,
  ],
  templateUrl: './modern-issue-field-editor.component.html',
  styleUrl: '../issue-field-editor/issue-field-editor.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModernIssueFieldEditorComponent {
  readonly issue = input.required<ModernIssueView>();
  readonly field = input.required<ModernEditableField>();
  readonly label = input.required<string>();
  readonly disabled = input(false);
  readonly changed = output<ModernIssueView>();
  readonly editing = signal(false);
  readonly state = new RequestState();
  readonly optionsState = new RequestState();
  readonly searchPending = signal(false);
  readonly assigneeLoading = computed(() => this.searchPending() || this.optionsState.busy());
  readonly value = new FormControl('', { nonNullable: true });
  readonly labels = new FormControl<string[]>([], { nonNullable: true });
  readonly query = new FormControl('', { nonNullable: true });
  readonly assignees = signal<UserSummary[]>([]);
  readonly cursor = signal<string | null>(null);
  readonly isChoice = computed(
    () => this.field() === 'priorityId' || this.field() === 'assigneeId',
  );
  readonly focusedChoice = signal('');
  readonly isPopup = computed(() => this.isChoice() || this.field() === 'dueDate');
  readonly autoSave = computed(() => this.isChoice() || this.field() === 'dueDate');
  readonly reviewReady = signal(false);
  readonly selectionLocked = computed(
    () => this.state.busy() || (this.autoSave() && (!!this.state.message() || this.reviewReady())),
  );
  readonly choices = computed<FieldChoice[]>(() =>
    this.field() === 'priorityId'
      ? [...this.priorityChoices()]
      : [
          { value: '', label: 'Unassigned' },
          ...this.assignees().map(user => ({ value: user.id, label: user.displayName })),
        ],
  );
  readonly priorities = signal<PriorityView[]>([]);
  readonly priorityCursor = signal<string | null>(null);
  private readonly configuration = inject(ProjectConfigurationApi);
  private priorityChoices(): FieldChoice[] {
    const retained = this.issue().summary.priority;
    const choices = this.priorities()
      .filter(item => !item.retired)
      .map(item => ({ value: item.id, label: item.name }));
    if (!choices.some(item => item.value === retained.id))
      choices.unshift({
        value: retained.id,
        label: retained.name + (retained.retired ? ' · Retired' : ''),
      });
    return choices;
  }
  async findPriorities(more = false): Promise<void> {
    const generation = this.generation,
      priorityGeneration = ++this.priorityGeneration,
      epoch = this.auth.sessionEpoch(),
      project = this.issue().summary.projectId;
    const current = () =>
      !this.destroy.destroyed &&
      this.editing() &&
      generation === this.generation &&
      priorityGeneration === this.priorityGeneration &&
      epoch === this.auth.sessionEpoch();
    await this.optionsState.run(async () => {
      const page = await this.configuration.priorities(
        project,
        more ? (this.priorityCursor() ?? undefined) : undefined,
      );
      if (!current()) return;
      this.priorities.set(more ? [...this.priorities(), ...page.items] : page.items);
      this.priorityCursor.set(page.nextCursor);
      afterNextRender(
        () => {
          if (!current()) return;
          const keys = this.pendingPriorityKeys;
          this.pendingPriorityKeys = [];
          if (keys.length) {
            const index = this.choices().findIndex(choice => choice.value === this.focusedChoice());
            this.choiceButtons()[index]?.focus();
          }
          for (const key of keys) {
            if (!current() || this.selectionLocked()) break;
            if (key === 'Enter' || key === ' ') {
              const focused = document.activeElement;
              if (
                focused instanceof HTMLButtonElement &&
                focused.getAttribute('role') === 'option' &&
                this.root.nativeElement.contains(focused)
              )
                focused.click();
              break;
            }
            this.moveChoiceFocus(key);
          }
        },
        { injector: this.injector },
      );
    }, current);
  }
  readonly descriptionInitial = signal('');
  readonly descriptionFormat = signal<'plain' | 'html'>('plain');
  readonly base = signal<ModernIssueView | null>(null);
  readonly revision = signal('');
  readonly controlId = 'inline-field-' + crypto.randomUUID();
  readonly writable = computed(() => this.issue().capabilities.includes('edit'));
  readonly conflict = computed(() => {
    const failure = this.state.failure();
    if (failure?.payload.error.code !== 'conflict') return null;
    const current = zModernIssueView.safeParse(failure.payload.current);
    return current.success ? current.data : null;
  });
  private readonly descriptionEditor = viewChild(DescriptionEditorComponent);
  private readonly destroy = inject(DestroyRef);
  private readonly root = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly api = inject(ModernIssuesApi);
  private readonly peopleApi = inject(IssuesApi);
  private readonly auth = inject(AuthService);
  private readonly drafts = inject(DraftsService);
  private readonly retry = new RetryIntent<FieldSaveIntent>();
  private pendingSave: FieldSaveIntent | null = null;
  private typingDate = false;
  private editable: ModernEditable | null = null;
  private key = '';
  private generation = 0;
  private searchGeneration = 0;
  private searchTimer: ReturnType<typeof setTimeout> | undefined;
  private pendingPriorityKeys: string[] = [];
  private priorityGeneration = 0;
  private readonly assigneePages = new Map<string, AssigneePage>();
  private readonly reposition = () => this.positionPopup();

  constructor() {
    this.value.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.remember());
    this.labels.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.remember());
    this.query.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.scheduleAssignees());
    const issueId = computed(() => this.issue().summary.id);
    effect(() => {
      issueId();
      this.field();
      this.auth.sessionEpoch();
      untracked(() => {
        this.generation++;
        this.stopAssigneeSearch();
        this.closePopup();
        this.assigneePages.clear();
        this.assignees.set([]);
        this.priorities.set([]);
        this.priorityCursor.set(null);
        this.pendingPriorityKeys = [];
        this.cursor.set(null);
        this.query.reset('', { emitEvent: false });
        this.drafts.release(this.key);
        this.key = 'inline:' + this.issue().summary.id + ':' + this.field();
        this.editing.set(false);
        this.base.set(null);
        this.editable = null;
        this.state.clear();
        this.state.busy.set(false);
        this.retry.finish();
        this.pendingSave = null;
        this.typingDate = false;
        this.reviewReady.set(false);
      });
    });
    effect(() => {
      const editing = this.editing();
      this.state.busy();
      this.state.message();
      this.state.failure();
      this.reviewReady();
      if (editing) afterNextRender(() => this.positionPopup(), { injector: this.injector });
    });
    this.destroy.onDestroy(() => {
      this.generation++;
      this.stopAssigneeSearch();
      this.closePopup();
      this.drafts.release(this.key);
    });
  }

  begin(): void {
    if (this.editing()) {
      if (this.isPopup()) this.cancel();
      return;
    }
    if (this.disabled() || !this.writable()) return;
    const current = this.issue(),
      draft = this.drafts.modernIssues.get(this.key);
    this.base.set(current);
    this.revision.set(draft?.revision ?? current.summary.revision);
    this.editable = draft?.editable ?? modernEditable(current);
    this.descriptionInitial.set(this.editable.description);
    this.descriptionFormat.set(this.editable.descriptionFormat ?? 'plain');
    const field = this.field();
    this.value.setValue(field === 'labelIds' ? '' : (this.editable[field] ?? ''), {
      emitEvent: false,
    });
    this.focusedChoice.set(this.value.value);
    this.labels.setValue([...this.editable.labelIds], { emitEvent: false });
    this.state.clear();
    this.retry.finish();
    this.pendingSave = null;
    this.typingDate = false;
    this.reviewReady.set(false);
    this.pendingPriorityKeys = [];
    this.editing.set(true);
    this.drafts.activate(this.key, !!draft);
    if (field === 'assigneeId') {
      this.query.reset('', { emitEvent: false });
      this.restoreAssigneeChoices();
      // An eligible first page is reusable within this issue/project and login session.
      void this.findAssignees();
    }
    if (field === 'priorityId') void this.findPriorities();
    afterNextRender(
      () => {
        if (!this.editing() || this.destroy.destroyed) return;
        if (this.isPopup()) {
          const panel = this.popup();
          panel?.showPopover();
          this.positionPopup();
          window.addEventListener('resize', this.reposition, { passive: true });
          document.addEventListener('scroll', this.reposition, { capture: true, passive: true });
          window.visualViewport?.addEventListener('resize', this.reposition, { passive: true });
          window.visualViewport?.addEventListener('scroll', this.reposition, { passive: true });
        }
        this.root.nativeElement
          .querySelector<HTMLElement>(
            '.inline-editor input,.inline-editor [role="option"][aria-selected="true"],.inline-editor [contenteditable="true"]',
          )
          ?.focus();
      },
      { injector: this.injector },
    );
  }

  choose(choice: FieldChoice): void {
    if (this.selectionLocked() || this.disabled()) return;
    this.focusedChoice.set(choice.value);
    this.value.setValue(choice.value);
    void this.save();
  }

  dateChanged(event: Event): void {
    if (
      this.field() !== 'dueDate' ||
      this.typingDate ||
      this.selectionLocked() ||
      !(event.target instanceof HTMLInputElement)
    )
      return;
    this.commitDate(event.target);
  }

  dateKey(event: KeyboardEvent): void {
    // Native date segments can emit valid intermediate years while being typed.
    if (
      event.key.length === 1 ||
      ['Backspace', 'Delete', 'ArrowUp', 'ArrowDown'].includes(event.key)
    )
      this.typingDate = true;
  }

  datePointer(): void {
    this.typingDate = false;
  }

  clearDueDate(): void {
    if (this.field() !== 'dueDate' || this.selectionLocked() || this.disabled()) return;
    this.value.setValue('');
    void this.save();
  }

  private commitDate(input: HTMLInputElement): void {
    // An incomplete native date can serialize as empty; it must not clear a saved date.
    if (!input.validity.valid || input.validity.badInput || this.selectionLocked()) return;
    this.value.setValue(input.value);
    void this.save();
  }

  private commitDateBeforeClose(): boolean {
    if (this.field() !== 'dueDate' || this.selectionLocked() || this.disabled()) return false;
    const input = this.root.nativeElement.querySelector<HTMLInputElement>('input[type="date"]');
    if (
      !input ||
      !input.validity.valid ||
      input.validity.badInput ||
      input.value === (this.base()?.summary.dueDate ?? '')
    )
      return false;
    // Some native inputs emit change on blur, after the outside pointer event.
    this.commitDate(input);
    return true;
  }

  choiceKey(event: KeyboardEvent): void {
    if (
      this.field() === 'priorityId' &&
      this.optionsState.busy() &&
      !this.priorities().length &&
      ['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(event.key)
    ) {
      event.preventDefault();
      event.stopPropagation();
      this.pendingPriorityKeys.push(event.key);
      return;
    }
    if (event.target instanceof HTMLInputElement && event.key !== 'ArrowDown') return;
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    this.moveChoiceFocus(event.key);
  }

  private moveChoiceFocus(key: string): void {
    const options = this.choiceButtons();
    if (!options.length) return;
    const index = options.findIndex(option => option === document.activeElement);
    const next =
      key === 'Home'
        ? 0
        : key === 'End'
          ? options.length - 1
          : (index + (key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
    options[next]?.focus();
  }

  private choiceButtons(): HTMLButtonElement[] {
    return Array.from(
      this.root.nativeElement.querySelectorAll<HTMLButtonElement>('[role="option"]:not(:disabled)'),
    );
  }

  descriptionClicked(event: MouseEvent): void {
    if (event.target instanceof Element && event.target.closest('a,button,input')) return;
    // Selecting text is not an edit command.
    if (window.getSelection()?.toString()) return;
    this.begin();
  }

  descriptionChanged(html: string): void {
    this.value.setValue(html);
  }
  uploadedRevision(revision: string): void {
    this.revision.set(revision);
    this.remember();
  }

  private fields(): ModernEditable | null {
    if (!this.editable) return null;
    const parsed = zModernEditable.safeParse({
      ...this.editable,
      [this.field()]:
        this.field() === 'labelIds'
          ? this.labels.value
          : this.field() === 'assigneeId' || this.field() === 'dueDate'
            ? this.value.value || null
            : this.value.value,
      ...(this.field() === 'description' ? { descriptionFormat: 'html' } : {}),
    });
    return parsed.success ? parsed.data : null;
  }

  private remember(): void {
    if (!this.editing() || !this.editable) return;
    // Keep invalid intermediate text as a draft too (for example an empty title).
    const editable = {
      ...this.editable,
      [this.field()]:
        this.field() === 'labelIds'
          ? this.labels.value
          : this.field() === 'assigneeId' || this.field() === 'dueDate'
            ? this.value.value || null
            : this.value.value,
      ...(this.field() === 'description' ? { descriptionFormat: 'html' as const } : {}),
    };
    this.drafts.modernIssues.set(this.key, {
      fields: editable,
      editable,
      revision: this.revision(),
      files: [],
    });
    this.drafts.activate(this.key, true);
  }

  cancel(restoreFocus = true): void {
    if (this.state.busy()) return;
    if (this.descriptionEditor()?.uploadPending()) {
      this.state.message.set('Finish or clear the file queue before closing this editor.');
      return;
    }
    this.drafts.clearModernIssue(this.key);
    this.priorityGeneration++;
    this.pendingPriorityKeys = [];
    this.stopAssigneeSearch();
    this.editing.set(false);
    this.closePopup();
    this.state.clear();
    this.retry.finish();
    this.pendingSave = null;
    this.typingDate = false;
    this.reviewReady.set(false);
    if (restoreFocus) this.restoreFocus();
  }

  keyboard(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.cancel();
    } else if (
      event.key === 'Enter' &&
      this.field() !== 'description' &&
      this.field() !== 'labelIds' &&
      event.target instanceof HTMLInputElement &&
      event.target !== this.root.nativeElement.querySelector('[data-assignee-query]')
    ) {
      event.preventDefault();
      if (this.field() === 'dueDate') this.commitDate(event.target);
      else void this.save();
    }
  }

  private fieldPatch(editable: ModernEditable): ModernPatchFields | undefined {
    const base = this.base();
    // A restored old draft lacks its original prior-field snapshot. Let the
    // legacy revision check require explicit review before rebasing that draft.
    if (!base || this.revision() !== base.summary.revision) return undefined;
    const prior = modernEditable(base);
    switch (this.field()) {
      case 'assigneeId':
        return {
          field: 'assigneeId',
          assignee: { prior: prior.assigneeId, value: editable.assigneeId },
        };
      case 'priorityId':
        return {
          field: 'priorityId',
          priority: { prior: prior.priorityId, value: editable.priorityId },
        };
      case 'dueDate':
        return { field: 'dueDate', dueDate: { prior: prior.dueDate, value: editable.dueDate } };
      default:
        return undefined;
    }
  }

  async save(): Promise<void> {
    if (!this.editing() || this.disabled() || this.state.busy()) return;
    if (this.field() === 'description' && !this.descriptionEditor()?.commit()) return;
    const editable = this.fields();
    if (!editable) {
      this.state.message.set(
        'Check this value before saving. Titles need 1–200 characters; descriptions support up to 10,000 characters.',
      );
      return;
    }
    if (this.autoSave() && !this.pendingSave && !this.reviewReady() && !this.state.message()) {
      const confirmed = modernEditable(this.base() ?? this.issue());
      if (editable[this.field()] === confirmed[this.field()]) {
        this.cancel();
        return;
      }
    }
    const generation = this.generation,
      epoch = this.auth.sessionEpoch(),
      id = this.issue().summary.id;
    const current = () =>
      generation === this.generation &&
      epoch === this.auth.sessionEpoch() &&
      id === this.issue().summary.id;
    const intention: FieldSaveIntent =
      this.autoSave() && this.pendingSave
        ? this.pendingSave
        : {
            id,
            revision: this.revision(),
            editable,
            patch: this.autoSave() ? this.fieldPatch(editable) : undefined,
          };
    if (this.autoSave()) this.pendingSave = intention;
    await this.state.run(async () => {
      const reference = this.retry.reference(intention);
      const saved = intention.patch
        ? await this.api.patch(id, intention.patch, reference)
        : await this.api.update(id, intention.revision, intention.editable, reference);
      if (!current()) return;
      this.descriptionEditor()?.saved();
      this.changed.emit(saved.result);
      this.drafts.clearModernIssue(this.key);
      this.retry.finish();
      this.pendingSave = null;
      this.reviewReady.set(false);
      this.stopAssigneeSearch();
      this.editing.set(false);
      this.closePopup();
      this.restoreFocus();
    }, current);
  }

  review(current: ModernIssueView): void {
    // Rebase only the selected field. Keep the user's draft and all unrelated latest values.
    this.base.set(current);
    this.editable = modernEditable(current);
    this.revision.set(current.summary.revision);
    this.changed.emit(current);
    this.retry.finish();
    this.pendingSave = null;
    this.state.clear();
    this.reviewReady.set(this.autoSave());
    this.remember();
    if (!this.autoSave())
      this.state.message.set(
        'Latest issue loaded. Your draft is unchanged. Save when you are ready.',
      );
    else {
      const generation = this.generation;
      afterNextRender(
        () => {
          if (
            generation === this.generation &&
            this.editing() &&
            this.reviewReady() &&
            !this.state.busy() &&
            !this.destroy.destroyed
          ) {
            this.root.nativeElement
              .querySelector<HTMLButtonElement>('[data-autosave-submit]')
              ?.focus({ preventScroll: true });
          }
        },
        { injector: this.injector },
      );
    }
  }

  private stopAssigneeSearch(): void {
    this.searchGeneration++;
    if (this.searchTimer !== undefined) clearTimeout(this.searchTimer);
    this.searchTimer = undefined;
    this.searchPending.set(false);
    this.optionsState.busy.set(false);
    this.optionsState.clear();
  }

  private restoreAssigneeChoices(): void {
    const query = this.query.value.trim(),
      cached = this.assigneePages.get(query);
    const assigned = this.issue().summary.assignee;
    const eligible =
      cached?.items ?? this.assigneePages.get('')?.items ?? (assigned ? [assigned] : []);
    this.assignees.set(
      query
        ? eligible.filter(user =>
            user.displayName.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
          )
        : eligible,
    );
    this.cursor.set(cached?.nextCursor ?? null);
  }

  private scheduleAssignees(): void {
    this.stopAssigneeSearch();
    if (!this.editing() || this.field() !== 'assigneeId') return;
    this.restoreAssigneeChoices();
    this.searchPending.set(true);
    this.searchTimer = setTimeout(() => {
      this.searchTimer = undefined;
      void this.findAssignees();
    }, 120);
  }

  async findAssignees(more = false): Promise<void> {
    if (!this.editing() || this.field() !== 'assigneeId' || this.destroy.destroyed) return;
    if (this.searchTimer !== undefined) clearTimeout(this.searchTimer);
    this.searchTimer = undefined;
    this.searchPending.set(false);
    if (!more) {
      this.searchGeneration++;
      this.optionsState.busy.set(false);
      this.cursor.set(null);
    }
    const generation = this.generation,
      searchGeneration = this.searchGeneration;
    const epoch = this.auth.sessionEpoch(),
      projectId = this.issue().summary.projectId,
      query = this.query.value.trim();
    const current = () =>
      !this.destroy.destroyed &&
      this.editing() &&
      this.field() === 'assigneeId' &&
      generation === this.generation &&
      searchGeneration === this.searchGeneration &&
      epoch === this.auth.sessionEpoch() &&
      projectId === this.issue().summary.projectId &&
      query === this.query.value.trim();
    await this.optionsState.run(async () => {
      const page = await this.peopleApi.assignees(
        projectId,
        query,
        more ? (this.cursor() ?? undefined) : undefined,
      );
      if (!current()) return;
      const users = [...(more ? this.assignees() : []), ...page.items];
      const items = [...new Map(users.map(user => [user.id, user])).values()];
      this.assignees.set(items);
      this.cursor.set(page.nextCursor);
      if (this.assigneePages.size >= 10 && !this.assigneePages.has(query)) {
        const oldest = [...this.assigneePages.keys()].find(key => key !== '');
        if (oldest !== undefined) this.assigneePages.delete(oldest);
      }
      this.assigneePages.set(query, { items, nextCursor: page.nextCursor });
      afterNextRender(() => this.positionPopup(), { injector: this.injector });
    }, current);
  }

  outsidePointer(event: PointerEvent): void {
    if (
      !this.isPopup() ||
      !this.editing() ||
      !(event.target instanceof Node) ||
      this.root.nativeElement.contains(event.target)
    )
      return;
    if (this.commitDateBeforeClose()) return;
    this.cancel(false);
  }

  leavePopup(event: FocusEvent): void {
    if (!this.isPopup() || !this.editing()) return;
    if (
      event.relatedTarget instanceof Node &&
      this.root.nativeElement.contains(event.relatedTarget)
    )
      return;
    // Native calendar controls may temporarily move focus out of the date input.
    if (!event.relatedTarget) return;
    if (this.commitDateBeforeClose()) return;
    this.cancel(false);
  }

  private popup(): HTMLElement | null {
    return this.root.nativeElement.querySelector<HTMLElement>('.field-popup');
  }

  private positionPopup(): void {
    if (!this.editing() || !this.isPopup()) return;
    const panel = this.popup(),
      anchor = this.root.nativeElement.querySelector<HTMLElement>('.field-value');
    if (!panel || !anchor || !panel.matches(':popover-open')) return;
    positionAnchoredPopup(panel, anchor, this.field() === 'assigneeId' ? 320 : 260, 440);
  }

  private closePopup(): void {
    const panel = this.popup();
    if (panel?.matches(':popover-open')) panel.hidePopover();
    window.removeEventListener('resize', this.reposition);
    document.removeEventListener('scroll', this.reposition, true);
    window.visualViewport?.removeEventListener('resize', this.reposition);
    window.visualViewport?.removeEventListener('scroll', this.reposition);
  }

  private restoreFocus(): void {
    afterNextRender(
      () => this.root.nativeElement.querySelector<HTMLButtonElement>('.edit-trigger')?.focus(),
      { injector: this.injector },
    );
  }
}
