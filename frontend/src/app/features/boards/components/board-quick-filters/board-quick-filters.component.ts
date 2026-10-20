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
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import type {
  IssueFilter,
  SavedSearch,
  SaveIssueSearchRequest,
} from '../../../../api/generated/types.gen';
import { zSaveIssueSearchRequest } from '../../../../api/generated/zod.gen';
import { AuthService } from '../../../../core/auth/auth.service';
import { RetryIntent } from '../../../../core/api/api-result';
import { RequestState } from '../../../../shared/ui/request-state';
import { RequestStatusComponent } from '../../../../shared/ui/request-status.component';
import { unicodeLength } from '../../../../shared/forms/unicode.validators';
import { IssuesApi } from '../../../issues/issues.api';
import { boardFilterKey } from '../../board-filter-key';

interface FilterIntent {
  id: string;
  body: SaveIssueSearchRequest;
}
@Component({
  selector: 'gg-board-quick-filters',
  imports: [ReactiveFormsModule, RequestStatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="quick-filter-row" role="group" aria-label="My quick filters">
      <span class="quick-filter-label">My quick filters</span>
      @for (item of items(); track item.id) {
        <button
          type="button"
          class="secondary quick-filter"
          [class.active]="active(item)"
          [attr.aria-pressed]="active(item)"
          [disabled]="disabled()"
          (click)="choose(item)"
          ><bdi>{{ item.name }}</bdi></button
        >
      }
      <details
        #manager
        class="quick-filter-manager"
        (keydown.escape)="closeManager(manager, $event)"
        ><summary>Save or manage filters</summary
        ><div class="quick-filter-editor">
          <p class="field-hint"
            >Personal to you · reusable on all boards in this project. Filters narrow this board’s
            saved view.</p
          >
          <gg-request-status [state]="loadState" /><gg-request-status [state]="state" />
          @if (notice()) {
            <p role="status" class="field-hint">{{ notice() }}</p>
          }
          <form (submit)="$event.preventDefault(); save()"
            ><label
              >Quick filter name<input
                [formControl]="name"
                dir="auto"
                [readOnly]="!!pending()"
                placeholder="For example, Urgent work" /></label
            ><button
              type="submit"
              [disabled]="
                disabled() || state.busy() || !!pending() || name.invalid || !name.value.trim()
              "
              >Save current filters</button
            ></form
          >
          @if (pending()) {
            <div class="actions"
              ><button type="button" (click)="send()" [disabled]="state.busy() || reviewing()">{{
                reviewed()
                  ? 'Apply reviewed filter'
                  : pending()?.body.removed
                    ? 'Retry removal'
                    : 'Retry save'
              }}</button
              ><button
                type="button"
                class="secondary"
                (click)="review()"
                [disabled]="state.busy() || reviewing()"
                >Review latest quick filters</button
              ><button
                type="button"
                class="secondary"
                (click)="discard()"
                [disabled]="state.busy() || reviewing()"
                >Discard filter change</button
              ></div
            >
          }
          <ul>
            @for (item of items(); track item.id) {
              <li
                ><bdi>{{ item.name }}</bdi
                ><button
                  type="button"
                  class="text-button"
                  [attr.aria-label]="'Remove quick filter ' + item.name"
                  [disabled]="state.busy() || !!pending()"
                  (click)="remove(item)"
                  >Remove</button
                ></li
              >
            }
          </ul>
          <button
            type="button"
            class="text-button"
            (click)="load()"
            [disabled]="state.busy() || loadState.busy() || !!pending()"
            >Reload quick filters</button
          >
          <button type="button" class="text-button" (click)="closeManager(manager)"
            >Close quick filter manager</button
          >
        </div></details
      >
    </div>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    .quick-filter-row {
      display: flex;
      gap: 6px;
      align-items: center;
      flex-wrap: wrap;
      margin-block: 0 4px;
    }
    .quick-filter-label {
      font-size: 12px;
      color: var(--color-muted);
      margin-inline-end: 4px;
    }
    .quick-filter {
      font-size: 12px;
      padding: 5px 8px;
    }
    .quick-filter.active {
      background: #e9f2ff;
      color: #0055cc;
      box-shadow: inset 0 0 0 1px #85b8ff;
    }
    .quick-filter-manager {
      position: relative;
      font-size: 12px;
    }
    .quick-filter-manager > summary {
      cursor: pointer;
      padding: 6px 8px;
      color: var(--color-brand);
    }
    .quick-filter-editor {
      position: absolute;
      z-index: 6;
      inset-inline-start: 0;
      width: min(360px, calc(100vw - 48px));
      max-height: 65dvh;
      overflow: auto;
      border: 1px solid var(--color-border);
      border-radius: 6px;
      background: white;
      box-shadow: 0 8px 24px #091e4229;
      padding: 16px;
    }
    .quick-filter-editor form {
      display: flex;
      align-items: flex-end;
      gap: 8px;
      flex-wrap: wrap;
    }
    .quick-filter-editor label {
      flex: 1;
      min-width: 140px;
      font-size: 12px;
      margin: 0;
    }
    .quick-filter-editor input {
      margin-block-start: 4px;
    }
    .quick-filter-editor button {
      font-size: 12px;
    }
    .quick-filter-editor ul {
      padding: 0;
      list-style: none;
    }
    .quick-filter-editor li {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      padding-block: 6px;
      border-bottom: 1px solid var(--color-border);
    }
    .quick-filter-editor .actions {
      margin-block: 10px;
    }
    .quick-filter-editor .field-hint {
      font-size: 12px;
    }
    @media (max-width: 700px) {
      .quick-filter-manager {
        position: static;
      }
      .quick-filter-editor {
        inset-inline: 16px;
        width: auto;
      }
    }
  `,
})
export class BoardQuickFiltersComponent {
  readonly projectId = input.required<string>();
  readonly filters = input<IssueFilter>({});
  readonly disabled = input(false);
  readonly applied = output<IssueFilter>();
  readonly name = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, unicodeLength(80)],
  });
  readonly state = new RequestState();
  readonly loadState = new RequestState();
  readonly all = signal<SavedSearch[]>([]);
  readonly items = computed(() =>
    this.all().filter(
      item =>
        !item.removed &&
        item.filters.projectIds?.length === 1 &&
        item.filters.projectIds[0] === this.projectId(),
    ),
  );
  readonly pending = signal<FilterIntent | null>(null);
  readonly reviewed = signal(false);
  readonly reviewing = signal(false);
  readonly notice = signal('');
  private readonly api = inject(IssuesApi);
  private readonly auth = inject(AuthService);
  private readonly destroy = inject(DestroyRef);
  private readonly retry = new RetryIntent<FilterIntent>();
  private generation = 0;
  constructor() {
    this.destroy.onDestroy(() => this.generation++);
    effect(() => {
      const project = this.projectId();
      this.auth.sessionEpoch();
      untracked(() => {
        this.generation++;
        this.all.set([]);
        this.pending.set(null);
        this.reviewed.set(false);
        this.reviewing.set(false);
        this.notice.set('');
        this.name.reset();
        this.state.clear();
        this.state.busy.set(false);
        this.loadState.clear();
        this.loadState.busy.set(false);
        this.retry.finish();
        if (project) void this.load();
      });
    });
  }
  active(item: SavedSearch): boolean {
    return boardFilterKey(item.filters) === boardFilterKey(this.filters());
  }
  choose(item: SavedSearch): void {
    if (!this.disabled()) this.applied.emit(this.active(item) ? {} : item.filters);
  }
  closeManager(manager: HTMLDetailsElement, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    manager.open = false;
    manager.querySelector('summary')?.focus();
  }
  private current(generation: number, epoch: number, project: string): boolean {
    return (
      !this.destroy.destroyed &&
      generation === this.generation &&
      epoch === this.auth.sessionEpoch() &&
      project === this.projectId()
    );
  }
  async load(): Promise<void> {
    const generation = this.generation,
      epoch = this.auth.sessionEpoch(),
      project = this.projectId();
    await this.loadState.run(
      async () => {
        const page = await this.api.savedSearches();
        if (this.current(generation, epoch, project)) this.all.set(page.items);
      },
      () => this.current(generation, epoch, project),
    );
  }
  async save(): Promise<void> {
    if (this.disabled() || this.name.invalid || this.pending()) return;
    const name = this.name.value.trim(),
      prior = this.items().find(item => item.name === name);
    const parsed = zSaveIssueSearchRequest.safeParse({
      name,
      expectedRevision: prior?.revision ?? '0',
      filters: { ...this.filters(), projectIds: [this.projectId()] },
    });
    if (!parsed.success) {
      this.state.message.set('Use a name of 1–80 characters and valid filters.');
      return;
    }
    this.pending.set({ id: prior?.id ?? crypto.randomUUID(), body: parsed.data });
    this.reviewed.set(false);
    await this.send();
  }
  async remove(item: SavedSearch): Promise<void> {
    if (this.pending() || this.disabled()) return;
    this.pending.set({
      id: item.id,
      body: {
        name: item.name,
        filters: item.filters,
        expectedRevision: item.revision,
        removed: true,
      },
    });
    this.reviewed.set(false);
    await this.send();
  }
  async send(): Promise<void> {
    const intent = this.pending(),
      generation = this.generation,
      epoch = this.auth.sessionEpoch(),
      project = this.projectId();
    if (!intent || this.disabled()) return;
    this.notice.set('');
    await this.state.run(
      async () => {
        const saved = await this.api.saveSearch(
          intent.id,
          intent.body,
          this.retry.reference(intent),
        );
        if (!this.current(generation, epoch, project)) return;
        this.all.update(items => [
          ...items.filter(item => item.id !== saved.result.id),
          saved.result,
        ]);
        this.notice.set(
          saved.result.removed ? 'Personal quick filter removed.' : 'Personal quick filter saved.',
        );
        this.pending.set(null);
        this.reviewed.set(false);
        this.retry.finish();
        this.name.reset();
      },
      () => this.current(generation, epoch, project),
    );
  }
  async review(): Promise<void> {
    const intent = this.pending(),
      generation = this.generation,
      epoch = this.auth.sessionEpoch(),
      project = this.projectId();
    if (!intent || this.state.busy() || this.reviewing()) return;
    this.reviewing.set(true);
    try {
      const page = await this.api.savedSearches();
      if (!this.current(generation, epoch, project)) return;
      this.all.set(page.items);
      const latest = page.items.find(item => item.id === intent.id);
      this.pending.set({
        ...intent,
        body: { ...intent.body, expectedRevision: latest?.revision ?? '0' },
      });
      this.retry.finish();
      this.state.clear();
      this.reviewed.set(true);
      this.notice.set('Latest filters loaded. Apply your reviewed change when ready.');
    } catch {
      if (this.current(generation, epoch, project))
        this.notice.set('The latest quick filters could not be loaded. Retry review.');
    } finally {
      if (this.current(generation, epoch, project)) this.reviewing.set(false);
    }
  }
  discard(): void {
    if (this.state.busy()) return;
    this.pending.set(null);
    this.retry.finish();
    this.reviewed.set(false);
    this.state.clear();
    this.notice.set('Filter change discarded.');
    void this.load();
  }
}
