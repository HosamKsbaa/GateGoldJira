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
  untracked,
  input,
  output,
  signal,
} from '@angular/core';
import { positionAnchoredPopup } from './position-anchored-popup';

export interface PickerOption {
  id: string;
  label: string;
  detail?: string;
}

/** The parent owns server search and pagination; the picker owns keyboard selection. */
@Component({
  selector: 'gg-searchable-picker',
  host: { '(document:pointerdown)': 'outsidePointer($event)' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ` <div class="picker" (focusout)="leave($event)">
    <label [for]="id">{{ label() }}</label>
    @if (selectedOptions().length) {
      <div class="selected-values">
        @for (option of selectedOptions(); track option.id) {
          <button
            type="button"
            class="selected-chip"
            [disabled]="disabled()"
            (click)="remove(option.id)"
            [attr.aria-label]="'Remove ' + option.label"
            [attr.aria-description]="option.detail || null"
            ><bdi>{{ option.label }}</bdi>
            @if (option.detail) {
              <small dir="auto">{{ option.detail }}</small>
            }
            <span aria-hidden="true">×</span></button
          >
        }
      </div>
    }
    <input
      [id]="id"
      role="combobox"
      aria-autocomplete="list"
      [attr.aria-expanded]="open()"
      [attr.aria-controls]="id + '-options'"
      [attr.aria-busy]="loading()"
      [attr.aria-activedescendant]="open() && active() >= 0 ? id + '-option-' + active() : null"
      [value]="query()"
      [placeholder]="placeholder()"
      [disabled]="disabled()"
      dir="auto"
      autocomplete="off"
      (focus)="expand()"
      (click)="expand()"
      (input)="search($event)"
      (keydown)="key($event)"
    />
    @if (open()) {
      <div class="picker-results" popover="manual">
        <ul
          [id]="id + '-options'"
          role="listbox"
          [attr.aria-label]="label() + ' choices'"
          [attr.aria-multiselectable]="multiple()"
        >
          @for (option of options(); track option.id; let index = $index) {
            <li
              role="option"
              [id]="id + '-option-' + index"
              [attr.aria-label]="option.label"
              [attr.aria-selected]="value().includes(option.id)"
              [class.active]="active() === index"
              ><button
                type="button"
                tabindex="-1"
                [disabled]="disabled() || loading()"
                (pointerdown)="$event.preventDefault()"
                (click)="choose(option.id)"
                ><span class="check" aria-hidden="true">{{
                  value().includes(option.id) ? '✓' : ''
                }}</span
                ><span
                  ><bdi>{{ option.label }}</bdi>
                  @if (option.detail) {
                    <small dir="auto">{{ option.detail }}</small>
                  }
                </span></button
              ></li
            >
          }
        </ul>
        @if (loading()) {
          <p role="status">Searching…</p>
        } @else if (!options().length) {
          <p role="status">No matching choices.</p>
        }
        @if (hasMore()) {
          <button
            type="button"
            class="more"
            (pointerdown)="$event.preventDefault()"
            (click)="loadMore()"
            [disabled]="loading() || disabled()"
            >Load more {{ label().toLowerCase() }} choices</button
          >
        }
        <button type="button" class="close-picker" (click)="close(true)">Done choosing</button>
      </div>
    }
  </div>`,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    .picker {
      position: relative;
    }
    label {
      font-size: 13px;
      margin-top: 8px;
    }
    input {
      min-height: 38px;
      font-size: 14px;
    }
    .selected-values {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      margin: 7px 0;
    }
    .selected-chip {
      display: flex;
      align-items: center;
      gap: 8px;
      min-height: 32px;
      padding: 4px 8px;
      background: #e9f2ff;
      color: #0055cc;
      font-size: 13px;
      border: 1px solid #cce0ff;
    }
    .selected-chip bdi {
      overflow-wrap: anywhere;
    }
    .picker-results {
      position: fixed;
      inset: auto;
      margin: 0;
      box-sizing: border-box;
      z-index: 1100;
      max-height: 320px;
      border: 1px solid var(--color-border);
      border-radius: 5px;
      background: white;
      box-shadow: 0 4px 12px #091e421a;
      overflow: auto;
    }
    .picker-results::backdrop {
      background: transparent;
    }
    ul {
      list-style: none;
      padding: 4px;
      margin: 0;
      max-height: 200px;
      overflow: auto;
    }
    li button {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      text-align: start;
      background: transparent;
      color: var(--color-text);
      padding: 8px;
      font-weight: 400;
      border: 0;
      min-height: 40px;
    }
    li.active,
    li:hover {
      background: #e9f2ff;
    }
    li[aria-selected='true'] {
      background: #f1f5fc;
    }
    .check {
      width: 16px;
      color: #0c66e4;
      flex: none;
    }
    small {
      display: block;
      font-size: 12px;
      color: var(--color-muted);
      margin-top: 2px;
    }
    .picker-results p {
      padding: 8px 12px;
      margin: 0;
      font-size: 13px;
      color: var(--color-muted);
    }
    .more,
    .close-picker {
      width: 100%;
      background: #f7f8f9;
      color: #0055cc;
      border: 0;
      border-top: 1px solid #dfe1e6;
      border-radius: 0;
      font-size: 13px;
      min-height: 36px;
    }
    .close-picker {
      color: var(--color-muted);
    }
    button:focus-visible,
    input:focus-visible {
      outline: 2px solid #2684ff;
      outline-offset: 2px;
    }
  `,
})
export class SearchablePickerComponent {
  readonly id = 'picker-' + crypto.randomUUID();
  private readonly root = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly destroy = inject(DestroyRef);
  private readonly reposition = () => this.positionPopup();
  private restoringFocus = false;
  readonly label = input.required<string>();
  readonly options = input<PickerOption[]>([]);
  readonly value = input<string[]>([]);
  readonly selected = input<PickerOption[]>([]);
  readonly placeholder = input('Search…');
  readonly multiple = input(false);
  readonly disabled = input(false);
  readonly loading = input(false);
  readonly hasMore = input(false);
  readonly changed = output<string[]>();
  readonly searched = output<string>();
  readonly more = output<void>();
  readonly query = signal('');
  readonly open = signal(false);
  readonly active = signal(-1);
  readonly selectedOptions = computed(() => {
    const choices = new Map(
      [...this.selected(), ...this.options()].map(option => [option.id, option]),
    );
    return this.value()
      .map(id => choices.get(id))
      .filter((option): option is PickerOption => !!option);
  });
  constructor() {
    this.destroy.onDestroy(() => this.close());
    effect(() => {
      this.options();
      this.loading();
      this.hasMore();
      untracked(() => afterNextRender(() => this.positionPopup(), { injector: this.injector }));
    });
  }
  expand(): void {
    if (this.disabled() || this.open() || this.restoringFocus) return;
    this.open.set(true);
    afterNextRender(
      () => {
        if (!this.open() || this.destroy.destroyed) return;
        this.panel()?.showPopover();
        this.positionPopup();
        window.addEventListener('resize', this.reposition, { passive: true });
        document.addEventListener('scroll', this.reposition, { capture: true, passive: true });
        window.visualViewport?.addEventListener('resize', this.reposition, { passive: true });
        window.visualViewport?.addEventListener('scroll', this.reposition, { passive: true });
      },
      { injector: this.injector },
    );
  }
  search(event: Event): void {
    if (!(event.target instanceof HTMLInputElement)) return;
    this.query.set(event.target.value);
    this.expand();
    this.active.set(-1);
    this.searched.emit(event.target.value);
  }
  choose(id: string): void {
    if (this.disabled() || this.loading()) return;
    const value = this.value();
    this.changed.emit(
      this.multiple()
        ? value.includes(id)
          ? value.filter(item => item !== id)
          : [...value, id]
        : [id],
    );
    if (!this.multiple()) this.close(true);
  }
  remove(id: string): void {
    if (!this.disabled()) this.changed.emit(this.value().filter(item => item !== id));
  }
  loadMore(): void {
    if (this.disabled() || this.loading()) return;
    document.getElementById(this.id)?.focus();
    this.more.emit();
  }
  leave(event: FocusEvent): void {
    const target = event.currentTarget,
      next = event.relatedTarget;
    if (target instanceof HTMLElement && next instanceof Node && target.contains(next)) return;
    this.close();
  }
  key(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.open()) {
      event.preventDefault();
      event.stopPropagation();
      this.close(true);
      return;
    }
    if (event.key === 'Enter' && this.open()) {
      event.preventDefault();
      const option = this.options()[this.active()];
      if (option) this.choose(option.id);
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    this.expand();
    const last = this.options().length - 1;
    this.active.set(
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? last
          : event.key === 'ArrowDown'
            ? Math.min(last, this.active() + 1)
            : Math.max(0, this.active() - 1),
    );
    queueMicrotask(() => {
      document
        .getElementById(this.id + '-option-' + this.active())
        ?.scrollIntoView({ block: 'nearest' });
      this.positionPopup();
    });
  }
  outsidePointer(event: PointerEvent): void {
    if (
      this.open() &&
      event.target instanceof Node &&
      !this.root.nativeElement.contains(event.target)
    )
      this.close();
  }
  close(restoreFocus = false): void {
    const panel = this.panel();
    if (panel?.matches(':popover-open')) panel.hidePopover();
    this.open.set(false);
    this.active.set(-1);
    window.removeEventListener('resize', this.reposition);
    document.removeEventListener('scroll', this.reposition, true);
    window.visualViewport?.removeEventListener('resize', this.reposition);
    window.visualViewport?.removeEventListener('scroll', this.reposition);
    if (restoreFocus) {
      this.restoringFocus = true;
      document.getElementById(this.id)?.focus();
      this.restoringFocus = false;
    }
  }
  private panel(): HTMLElement | null {
    return this.root.nativeElement.querySelector<HTMLElement>('.picker-results');
  }
  private positionPopup(): void {
    const panel = this.panel(),
      input = document.getElementById(this.id);
    if (!this.open() || !panel?.matches(':popover-open') || !input) return;
    positionAnchoredPopup(panel, input, Math.max(input.getBoundingClientRect().width, 260));
  }
}
