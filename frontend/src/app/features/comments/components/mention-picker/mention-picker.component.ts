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
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { UserSummary } from '../../../../api/generated/types.gen';
import { AuthService } from '../../../../core/auth/auth.service';
import { RequestState } from '../../../../shared/ui/request-state';
import { RequestStatusComponent } from '../../../../shared/ui/request-status.component';
import { unicodeLength } from '../../../../shared/forms/unicode.validators';
import { CommentsApi } from '../../comments.api';

@Component({
  selector: 'gg-mention-picker',
  imports: [ReactiveFormsModule, RequestStatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './mention-picker.component.css',
  template: ` @if (active()) {
    <fieldset (keydown)="handleKeyDown($event)"
      ><legend>Mention a teammate</legend>
      <p class="muted"
        >Use the arrow keys and Enter to select a person, or Escape to keep your ordinary text.</p
      >
      <label [for]="queryId">Find a teammate</label
      ><input
        [id]="queryId"
        [formControl]="query"
        role="combobox"
        aria-autocomplete="list"
        [attr.aria-controls]="listId"
        [attr.aria-expanded]="true"
        [attr.aria-activedescendant]="activeOption()"
        [attr.aria-busy]="searchPending() || state.busy()"
        placeholder="Search teammates by name"
        autocomplete="off"
        dir="auto"
      />
      @if (searchPending() || state.busy()) {
        <p class="muted" role="status">Searching teammates…</p>
      }
      <gg-request-status [state]="state" />
      <div [id]="listId" role="listbox" aria-label="Mention candidates">
        @for (user of choices(); track user.id; let index = $index) {
          <button
            type="button"
            role="option"
            [id]="listId + '-' + index"
            [attr.aria-selected]="index === highlight()"
            [attr.tabindex]="index === highlight() ? 0 : -1"
            (click)="choose(user)"
            [disabled]="disabled() || searchPending() || state.busy()"
            ><bdi>{{ user.displayName }}</bdi></button
          >
        }
      </div>
      @if (!choices().length && !searchPending() && !state.busy() && !state.message()) {
        <p>No eligible teammates match this page.</p>
      }
      @if (state.message()) {
        <button
          type="button"
          class="secondary"
          (click)="find()"
          [disabled]="disabled() || state.busy() || query.invalid"
          >Retry teammate search</button
        >
      }
      @if (cursor()) {
        <button type="button" (click)="find(cursor() ?? undefined)" [disabled]="disabled() || state.busy()"
          >Next teammates page</button
        >
      }
      <button type="button" class="secondary" (click)="closed.emit()"
        >Close teammate selection</button
      >
    </fieldset>
  }`,
})
export class MentionPickerComponent {
  readonly projectId = input.required<string>();
  readonly triggerQuery = input('');
  readonly active = input(false);
  readonly disabled = input(false);
  readonly selected = output<UserSummary>();
  readonly closed = output<void>();
  private readonly api = inject(CommentsApi);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  private generation = 0;
  private scope = new AbortController();
  private activeQuery = '';
  readonly listId = 'mention-options-' + crypto.randomUUID();
  readonly queryId = this.listId + '-query';
  readonly query = new FormControl('', { nonNullable: true, validators: [unicodeLength(100)] });
  readonly state = new RequestState();
  readonly searchPending = signal(false);
  readonly choices = signal<UserSummary[]>([]);
  readonly cursor = signal<string | null>(null);
  readonly highlight = signal(0);
  constructor() {
    this.query.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.scheduleSearch());
    // Reactive forms own the input disabled state. Toggling write availability
    // cancels the current lookup without overwriting the user's search text.
    effect(() => {
      const disabled = this.disabled();
      untracked(() => {
        if (disabled) this.query.disable({ emitEvent: false });
        else this.query.enable({ emitEvent: false });
        this.scheduleSearch();
      });
    });
    this.destroyRef.onDestroy(() => {
      this.cancelScheduledSearch();
      this.generation++;
      this.scope.abort();
    });
    effect(() => {
      const project = this.projectId(),
        active = this.active(),
        query = this.triggerQuery();
      this.auth.sessionEpoch();
      untracked(() => {
        this.cancelScheduledSearch();
        this.generation++;
        this.scope.abort();
        this.scope = new AbortController();
        this.state.busy.set(false);
        this.state.clear();
        this.choices.set([]);
        this.cursor.set(null);
        this.highlight.set(0);
        this.query.setValue(query, { emitEvent: false });
        if (!active || !project) return;
        this.scheduleSearch();
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
  private scheduleSearch(): void {
    this.cancelScheduledSearch();
    this.generation++;
    this.scope.abort();
    this.scope = new AbortController();
    this.state.busy.set(false);
    this.state.clear();
    this.choices.set([]);
    this.cursor.set(null);
    this.highlight.set(0);
    if (!this.active() || !this.projectId() || this.disabled() || this.query.invalid) return;
    this.searchPending.set(true);
    this.searchTimer = setTimeout(() => {
      this.searchTimer = null;
      void this.find();
    }, 120);
  }
  activeOption(): string | null {
    return this.choices().length ? this.listId + '-' + this.highlight() : null;
  }
  async find(cursor?: string): Promise<void> {
    this.cancelScheduledSearch();
    if (!this.active() || this.query.invalid || this.disabled()) return;
    if (!cursor) {
      this.generation++;
      this.scope.abort();
      this.scope = new AbortController();
      this.state.busy.set(false);
      this.state.clear();
      this.cursor.set(null);
      this.activeQuery = this.query.value.trim();
    }
    const generation = this.generation,
      epoch = this.auth.sessionEpoch(),
      project = this.projectId();
    const current = () =>
      !this.destroyRef.destroyed &&
      generation === this.generation &&
      epoch === this.auth.sessionEpoch() &&
      project === this.projectId() &&
      this.active() &&
      !this.disabled();
    await this.state.run(async () => {
      const page = await this.api.mentionCandidates(
        project,
        this.activeQuery,
        cursor,
        this.scope.signal,
      );
      if (!current()) return;
      this.choices.set(page.items);
      this.cursor.set(page.nextCursor);
      this.highlight.set(0);
    }, current);
  }
  choose(user: UserSummary): void {
    if (!this.disabled() && !this.searchPending() && !this.state.busy()) this.selected.emit(user);
  }
  handleKeyDown(event: KeyboardEvent): boolean {
    if (!this.active() || this.disabled()) return false;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.closed.emit();
      return true;
    }
    if (event.key === 'Enter' && (this.searchPending() || this.state.busy())) {
      event.preventDefault();
      event.stopPropagation();
      return true;
    }
    const users = this.choices();
    if (!users.length) return false;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      this.highlight.update(
        index => (index + (event.key === 'ArrowDown' ? 1 : -1) + users.length) % users.length,
      );
      return true;
    }
    if (event.key === 'Enter') {
      const user = users[this.highlight()];
      if (!user) return false;
      event.preventDefault();
      event.stopPropagation();
      this.choose(user);
      return true;
    }
    return false;
  }
}
