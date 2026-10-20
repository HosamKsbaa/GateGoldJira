import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import type {
  IssueFilter,
  SavedSearch,
  SaveIssueSearchRequest,
} from '../../../../api/generated/types.gen';
import { AuthService } from '../../../../core/auth/auth.service';
import { ApiError } from '../../../../core/api/api-result';
import { DraftsService, type SavedSearchDraft } from '../../../../core/drafts/drafts.service';
import { RequestState } from '../../../../shared/ui/request-state';
import { RequestStatusComponent } from '../../../../shared/ui/request-status.component';
import { IssuesApi } from '../../issues.api';

@Component({
  selector: 'gg-saved-searches',
  imports: [FormsModule, RequestStatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<details class="saved-search-disclosure">
    <summary>
      Saved searches <span class="badge">{{ items().length }}</span>
    </summary>
    <p class="muted">Private to you. Save the complete search, including multiple values.</p>
    <gg-request-status [state]="state" />
    <div class="actions">
      <label
        >Saved search<select
          aria-label="Saved search"
          [ngModel]="selectedId()"
          (ngModelChange)="choose($event)"
          [disabled]="state.busy() || !!pending() || reviewRequired()"
        >
          <option value="">New saved search</option>
          @for (item of items(); track item.id) {
            <option [value]="item.id">{{ item.name }}</option>
          }
        </select></label
      >
      <label
        >Search name<input
          aria-label="Saved search name"
          maxlength="80"
          dir="auto"
          [ngModel]="name()"
          (ngModelChange)="editName($event)"
          [disabled]="state.busy() || !!pending()"
      /></label>
      <button type="button" class="secondary" (click)="save('create')" [disabled]="!canSave()">
        Save as new search
      </button>
      @if (selected()) {
        <button type="button" class="secondary" (click)="save('update')" [disabled]="!canSave()">
          Update saved search</button
        ><button type="button" class="secondary" (click)="save('rename')" [disabled]="!canSave()">
          Rename saved search</button
        ><button
          type="button"
          class="secondary"
          (click)="save('remove')"
          [disabled]="state.busy() || !!pending() || reviewRequired()"
        >
          Remove saved search
        </button>
      }
    </div>
    @if (pending()) {
      <p class="notice">
        The save outcome is uncertain. Retry the original name and filters before making another
        saved-search change.
      </p>
      <button type="button" (click)="retry()" [disabled]="state.busy()">
        Retry original saved search
      </button>
    }
    @if (reviewRequired()) {
      <p class="notice">
        Your draft is preserved. Review the current saved search before saving again.
      </p>
      <button type="button" (click)="review()" [disabled]="state.busy()">
        Review latest saved searches
      </button>
    }
    @if (notice()) {
      <p role="status">{{ notice() }}</p>
    }
  </details>`,
  styles: `
    :host {
      display: block;
      margin-bottom: 1rem;
    }
    details {
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      padding: 0.75rem 1rem;
    }
    summary {
      cursor: pointer;
      font-weight: 600;
    }
    .actions {
      display: flex;
      gap: 0.6rem;
      align-items: end;
      flex-wrap: wrap;
    }
    label {
      display: grid;
      gap: 0.35rem;
      min-width: 12rem;
    }
    button {
      min-height: 2.5rem;
    }
  `,
})
export class SavedSearchesComponent {
  readonly filters = input.required<IssueFilter>();
  readonly applied = output<IssueFilter>();
  private readonly api = inject(IssuesApi);
  private readonly auth = inject(AuthService);
  private readonly drafts = inject(DraftsService);
  private readonly destroy = inject(DestroyRef);
  private readonly key = 'native-saved-search';
  readonly items = signal<SavedSearch[]>([]);
  readonly selectedId = signal('');
  readonly name = signal('');
  readonly state = new RequestState();
  readonly notice = signal('');
  readonly reviewRequired = signal(false);
  readonly pending = signal<SavedSearchDraft['pending']>(null);
  constructor() {
    const draft = this.drafts.savedSearchDrafts.get(this.key);
    if (draft) {
      this.name.set(draft.name);
      this.selectedId.set(draft.selectedId);
      this.pending.set(draft.pending);
    }
    let epoch = this.auth.sessionEpoch();
    effect(() => {
      const next = this.auth.sessionEpoch();
      if (next === epoch) return;
      epoch = next;
      this.items.set([]);
      this.selectedId.set('');
      this.name.set('');
      this.pending.set(null);
      this.reviewRequired.set(false);
      this.state.clear();
      this.state.busy.set(false);
    });
    effect(() => {
      const name = this.name(),
        selectedId = this.selectedId(),
        pending = this.pending();
      this.drafts.savedSearchDrafts.set(this.key, { name, selectedId, pending });
      this.drafts.activate(this.key, !!pending || (name !== this.selected()?.name && !!name));
    });
    this.destroy.onDestroy(() => this.drafts.release(this.key));
    void this.load();
  }
  selected() {
    return this.items().find(item => item.id === this.selectedId());
  }
  canSave() {
    return !!this.name().trim() && !this.state.busy() && !this.pending() && !this.reviewRequired();
  }
  editName(value: string) {
    this.name.set(value);
  }
  async load() {
    const epoch = this.auth.sessionEpoch();
    await this.state.run(
      async () => {
        const list = await this.api.savedSearches();
        if (epoch === this.auth.sessionEpoch()) this.items.set(list.items);
      },
      () => epoch === this.auth.sessionEpoch(),
    );
  }
  choose(id: string) {
    if (this.pending() || this.state.busy() || this.reviewRequired()) return;
    this.selectedId.set(id);
    const saved = this.selected();
    this.name.set(saved?.name ?? '');
    this.notice.set('');
    if (saved) this.applied.emit(structuredClone(saved.filters));
  }
  async save(kind: 'create' | 'update' | 'rename' | 'remove') {
    if (
      (!this.canSave() && kind !== 'remove') ||
      this.pending() ||
      this.state.busy() ||
      this.reviewRequired()
    )
      return;
    const selected = this.selected();
    if (kind !== 'create' && !selected) return;
    const id = kind === 'create' ? crypto.randomUUID() : selected?.id;
    if (!id) return;
    const body: SaveIssueSearchRequest = {
      name: kind === 'remove' ? (selected?.name ?? '') : this.name().trim(),
      expectedRevision: kind === 'create' ? '0' : (selected?.revision ?? '0'),
      filters: structuredClone(
        (kind === 'rename' || kind === 'remove') && selected ? selected.filters : this.filters(),
      ),
      ...(kind === 'remove' ? { removed: true } : {}),
    };
    this.pending.set({ id, body, reference: crypto.randomUUID() });
    await this.retry();
  }
  async retry() {
    const pending = this.pending();
    if (!pending) return;
    this.notice.set('');
    const epoch = this.auth.sessionEpoch();
    await this.state.run(
      async () => {
        try {
          const saved = await this.api.saveSearch(pending.id, pending.body, pending.reference);
          if (epoch !== this.auth.sessionEpoch()) return;
          this.pending.set(null);
          this.selectedId.set(saved.result.removed ? '' : saved.result.id);
          this.name.set(saved.result.removed ? '' : saved.result.name);
          this.items.update(items =>
            saved.result.removed
              ? items.filter(item => item.id !== saved.result.id)
              : [...items.filter(item => item.id !== saved.result.id), saved.result].sort((a, b) =>
                  a.name.localeCompare(b.name),
                ),
          );
          this.notice.set(saved.result.removed ? 'Saved search removed.' : 'Saved search saved.');
        } catch (error: unknown) {
          if (
            epoch === this.auth.sessionEpoch() &&
            error instanceof ApiError &&
            !error.payload.error.retryable
          ) {
            this.pending.set(null);
            this.reviewRequired.set(
              error.status === 409 ||
                error.payload.error.nextAction === 'reload_current_state' ||
                error.payload.error.fieldErrors.some(field => field.field === 'expectedRevision'),
            );
          }
          throw error;
        }
      },
      () => epoch === this.auth.sessionEpoch(),
    );
  }
  async review() {
    await this.load();
    if (!this.state.message()) {
      this.reviewRequired.set(false);
      this.notice.set(
        'Latest saved searches loaded. Your name and current filter draft are preserved.',
      );
    }
  }
}
