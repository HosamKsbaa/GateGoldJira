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
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { ModernIssueSummary } from '../../../../api/generated/types.gen';
import { AuthService } from '../../../../core/auth/auth.service';
import { RequestState } from '../../../../shared/ui/request-state';
import { RequestStatusComponent } from '../../../../shared/ui/request-status.component';
import { unicodeLength } from '../../../../shared/forms/unicode.validators';
import { ModernIssuesApi } from '../../modern-issues.api';
type ParentSummary = ModernIssueSummary;

@Component({
  selector: 'gg-parent-filter',
  imports: [ReactiveFormsModule, RequestStatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ` <fieldset
    ><legend>Parent issue filter</legend>
    <gg-request-status [state]="selectedState" />
    @if (selected(); as parent) {
      <p
        >Subtasks of <bdi>{{ parent.key }}</bdi> · <bdi>{{ parent.title }}</bdi></p
      >
    }
    @if (control().value) {
      <button type="button" (click)="clear()" [disabled]="disabled()">Clear parent filter</button>
    }
    <label
      >Find a parent by title or issue key<input
        type="search"
        [formControl]="query"
        dir="auto"
        placeholder="Issue number, key or title"
        [attr.aria-busy]="pending() || state.busy()"
        (focus)="find()"
        (keydown.enter)="$event.preventDefault(); find()"
    /></label>
    @if (pending() || state.busy()) {
      <p class="field-hint" role="status">Searching parents…</p>
    }
    <gg-request-status [state]="state" />
    @if (searched() && !pending() && !state.busy()) {
      <ul class="records">
        @for (parent of candidates(); track parent.id) {
          <li
            ><div
              ><bdi>{{ parent.key }}</bdi> · <bdi>{{ parent.title }}</bdi></div
            >
            <button
              type="button"
              (click)="choose(parent)"
              [disabled]="disabled()"
              [attr.aria-label]="'Filter by parent ' + parent.key"
              >Select parent</button
            ></li
          >
        } @empty {
          <li>No matching parent issues.</li>
        }
      </ul>
    }
    @if (cursor()) {
      <button
        type="button"
        (click)="find(cursor() ?? undefined)"
        [disabled]="disabled() || state.busy()"
        >Next parents page</button
      >
    }
  </fieldset>`,
})
export class ParentFilterComponent {
  readonly projectId = input('');
  readonly control = input.required<FormControl<string>>();
  readonly disabled = input(false);
  private readonly native = inject(ModernIssuesApi);
  private readonly auth = inject(AuthService);
  private readonly destroyed = inject(DestroyRef);
  private generation = 0;
  private searchGeneration = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  readonly pending = signal(false);
  private activeQuery = '';
  readonly query = new FormControl('', { nonNullable: true, validators: [unicodeLength(200)] });
  readonly selected = signal<ParentSummary | null>(null);
  readonly candidates = signal<ParentSummary[]>([]);
  readonly cursor = signal<string | null>(null);
  readonly searched = signal(false);
  readonly state = new RequestState();
  readonly selectedState = new RequestState();
  constructor() {
    this.destroyed.onDestroy(() => {
      this.generation++;
      this.cancelSearch();
    });
    this.query.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.cancelSearch();
      this.state.busy.set(false);
      this.state.clear();
      this.candidates.set([]);
      this.cursor.set(null);
      this.searched.set(false);
      this.pending.set(true);
      this.timer = setTimeout(() => void this.find(), 120);
    });
    effect(onCleanup => {
      this.projectId();
      this.auth.sessionEpoch();
      const control = this.control();
      untracked(() => {
        this.generation++;
        this.cancelSearch();
        this.candidates.set([]);
        this.cursor.set(null);
        this.searched.set(false);
        this.state.busy.set(false);
        this.state.clear();
        const subscription = control.valueChanges.subscribe(() => void this.readSelected());
        onCleanup(() => subscription.unsubscribe());
        void this.readSelected();
      });
    });
  }
  private async readSelected(): Promise<void> {
    const id = this.control().value,
      generation = this.generation,
      epoch = this.auth.sessionEpoch();
    this.selected.set(null);
    this.selectedState.busy.set(false);
    this.selectedState.clear();
    if (!id) return;
    const current = () =>
      !this.destroyed.destroyed &&
      id === this.control().value &&
      generation === this.generation &&
      epoch === this.auth.sessionEpoch();
    await this.selectedState.run(async () => {
      const parent = await this.native.get(id);
      if (current()) this.selected.set(parent.summary);
    }, current);
  }
  async find(cursor?: string): Promise<void> {
    if (!cursor) {
      this.cancelSearch();
      this.state.busy.set(false);
      this.activeQuery = this.query.value.trim();
    }
    if (this.query.invalid) return;
    const project = this.projectId(),
      generation = this.generation,
      searchGeneration = this.searchGeneration,
      epoch = this.auth.sessionEpoch();
    const current = () =>
      !this.destroyed.destroyed &&
      searchGeneration === this.searchGeneration &&
      project === this.projectId() &&
      generation === this.generation &&
      epoch === this.auth.sessionEpoch();
    await this.state.run(async () => {
      const filters = {
        ...(project ? { projectIds: [project] } : {}),
        ...(this.activeQuery ? { query: this.activeQuery } : {}),
      };
      const page = await this.native.search(filters, cursor, undefined, 'standard');
      if (!current()) return;
      this.candidates.set(page.items);
      this.cursor.set(page.nextCursor);
      this.searched.set(true);
    }, current);
  }
  private cancelSearch(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.searchGeneration++;
    this.pending.set(false);
  }
  choose(parent: ParentSummary): void {
    if (this.disabled()) return;
    this.control().setValue(parent.id);
    this.control().markAsDirty();
    this.selected.set(parent);
  }
  clear(): void {
    if (this.disabled()) return;
    this.control().reset();
    this.control().markAsDirty();
  }
}
