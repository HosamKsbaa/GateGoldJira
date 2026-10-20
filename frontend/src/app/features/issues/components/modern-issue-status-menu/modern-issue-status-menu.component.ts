import { compareStagePosition } from './stage-order';
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
  viewChild,
} from '@angular/core';
import type { ModernIssueView, IssueTransitionOption } from '../../../../api/generated/types.gen';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { ModernIssuesApi } from '../../modern-issues.api';
import { AuthService } from '../../../../core/auth/auth.service';
import { RequestState } from '../../../../shared/ui/request-state';
import { RequestStatusComponent } from '../../../../shared/ui/request-status.component';
import { positionAnchoredPopup } from '../../../../shared/ui/position-anchored-popup';

@Component({
  selector: 'gg-modern-issue-status-menu',
  imports: [IconComponent, RequestStatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './modern-issue-status-menu.component.html',
  styleUrls: [
    '../issue-status-menu/issue-status-menu.component.css',
    './modern-issue-status-menu.component.css',
  ],
  host: {
    '(document:pointerdown)': 'outside($event)',
    '(focusout)': 'focusLeft($event)',
    '(keydown)': 'keyboard($event)',
  },
})
export class ModernIssueStatusMenuComponent {
  readonly issue = input.required<ModernIssueView>();
  readonly disabled = input(false);
  readonly selected = output<string>();
  readonly opened = signal(false);
  readonly optionsPage = signal<IssueTransitionOption[]>([]);
  readonly cursor = signal<string | null>(null);
  readonly state = new RequestState();
  private readonly api = inject(ModernIssuesApi);
  private readonly auth = inject(AuthService);
  private loadGeneration = 0;
  private readonly reposition = () => this.position();
  readonly name = computed(() => this.issue().summary.stage.name);
  readonly menuId = 'issue-status-' + crypto.randomUUID();
  private readonly root = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');
  private intendedStatus: string | null = null;
  private focusGeneration = 0;
  private pendingKeys: string[] = [];

  constructor() {
    effect(() => {
      this.issue().summary.id;
      this.issue().summary.stage.id;
      this.issue().summary.revision;
      this.auth.sessionEpoch();
      this.close();
    });
    effect(() => {
      if (this.disabled()) this.close();
    });
    inject(DestroyRef).onDestroy(() => this.close());
  }

  allowed(status: string): boolean {
    return (
      status === this.issue().summary.stage.id ||
      this.optionsPage().some(
        option => option.stage.id === status && option.canRequest && option.reviewSatisfied,
      )
    );
  }

  toggle(): void {
    if (this.opened()) this.close(true);
    else this.open();
  }

  private open(last = false): void {
    if (this.disabled()) return;
    this.optionsPage.set([]);
    this.cursor.set(null);
    this.state.busy.set(false);
    const statuses = this.availableStatuses();
    const current = statuses.find(status => status === this.issue().summary.stage.id);
    this.intendedStatus = (last ? statuses.at(-1) : (current ?? statuses[0])) ?? null;
    if (last) this.pendingKeys = ['End'];
    const generation = ++this.focusGeneration;
    this.opened.set(true);
    afterNextRender(
      () => {
        if (this.opened() && generation === this.focusGeneration) {
          const panel = this.panel();
          panel?.showPopover();
          this.position();
          this.focusIntended();
        }
      },
      { injector: this.injector },
    );
    window.addEventListener('resize', this.reposition, { passive: true });
    document.addEventListener('scroll', this.reposition, { capture: true, passive: true });
    void this.load();
  }

  choose(status: string): void {
    if (this.disabled() || !this.allowed(status)) return;
    this.close(true);
    if (status !== this.issue().summary.stage.id) this.selected.emit(status);
  }

  close(restoreFocus = false): void {
    const panel = this.panel();
    if (panel?.matches(':popover-open')) panel.hidePopover();
    window.removeEventListener('resize', this.reposition);
    document.removeEventListener('scroll', this.reposition, true);
    this.loadGeneration++;
    this.state.busy.set(false);
    this.state.clear();
    this.opened.set(false);
    this.focusGeneration++;
    this.intendedStatus = null;
    this.pendingKeys = [];
    if (restoreFocus) this.trigger()?.nativeElement.focus();
  }

  outside(event: PointerEvent): void {
    if (
      this.opened() &&
      event.target instanceof Node &&
      !this.root.nativeElement.contains(event.target)
    )
      this.close();
  }

  focusLeft(event: FocusEvent): void {
    // Retrying removes the focused retry button while its request is pending.
    // Outside pointer events and an actual next focus target still close the menu.
    if (event.relatedTarget === null && this.state.busy()) return;
    if (
      this.opened() &&
      (!(event.relatedTarget instanceof Node) ||
        !this.root.nativeElement.contains(event.relatedTarget))
    )
      this.close();
  }

  keyboard(event: KeyboardEvent): void {
    if (!this.opened()) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        event.stopPropagation();
        this.open(event.key === 'ArrowUp');
      }
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.close(true);
      return;
    }
    // Preserve fast keyboard intent while transition choices are arriving.
    // Selection is applied only after the server has returned eligible targets.
    if (
      this.state.busy() &&
      !this.optionsPage().length &&
      ['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(event.key)
    ) {
      event.preventDefault();
      event.stopPropagation();
      this.pendingKeys.push(event.key);
      return;
    }
    const focusedStatus = this.options().find(option => option === document.activeElement)?.dataset[
      'status'
    ];
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      event.stopPropagation();
      const status = focusedStatus ?? this.intendedStatus;
      if (status) this.choose(status);
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const statuses = this.availableStatuses();
    if (!statuses.length) return;
    const index = statuses.findIndex(status => status === (focusedStatus ?? this.intendedStatus));
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? statuses.length - 1
          : (index + (event.key === 'ArrowDown' ? 1 : -1) + statuses.length) % statuses.length;
    this.intendedStatus = statuses[next] ?? null;
    this.focusIntended();
  }

  private availableStatuses(): string[] {
    return [
      this.issue().summary.stage.id,
      ...this.optionsPage()
        .filter(option => option.canRequest && option.reviewSatisfied)
        .map(option => option.stage.id),
    ];
  }

  async load(more = false): Promise<void> {
    const generation = ++this.loadGeneration,
      id = this.issue().summary.id,
      stage = this.issue().summary.stage.id,
      epoch = this.auth.sessionEpoch();
    const current = () =>
      this.opened() &&
      generation === this.loadGeneration &&
      id === this.issue().summary.id &&
      stage === this.issue().summary.stage.id &&
      epoch === this.auth.sessionEpoch();
    await this.state.run(async () => {
      const page = await this.api.transitions(id, more ? (this.cursor() ?? undefined) : undefined);
      if (!current()) return;
      this.optionsPage.set(
        (more ? [...this.optionsPage(), ...page.items] : [...page.items]).sort((left, right) =>
          compareStagePosition(left.stage, right.stage),
        ),
      );
      this.cursor.set(page.nextCursor);
      const queued = this.pendingKeys;
      this.pendingKeys = [];
      for (const key of queued) {
        if (!current()) break;
        if (key === 'Enter' || key === ' ') {
          if (this.intendedStatus) this.choose(this.intendedStatus);
          break;
        }
        const statuses = this.availableStatuses();
        const index = statuses.indexOf(this.intendedStatus ?? '');
        const next =
          key === 'Home'
            ? 0
            : key === 'End'
              ? statuses.length - 1
              : (index + (key === 'ArrowDown' ? 1 : -1) + statuses.length) % statuses.length;
        this.intendedStatus = statuses[next] ?? null;
      }
      afterNextRender(
        () => {
          this.position();
          this.focusIntended();
        },
        { injector: this.injector },
      );
    }, current);
  }
  private panel(): HTMLElement | null {
    return this.root.nativeElement.querySelector<HTMLElement>('.status-popup');
  }
  private position(): void {
    const panel = this.panel(),
      anchor = this.trigger()?.nativeElement;
    if (panel?.matches(':popover-open') && anchor) positionAnchoredPopup(panel, anchor, 300, 420);
  }
  private focusIntended(): void {
    this.options()
      .find(option => option.dataset['status'] === this.intendedStatus)
      ?.focus();
  }

  private options(): HTMLButtonElement[] {
    return Array.from(
      this.root.nativeElement.querySelectorAll<HTMLButtonElement>(
        '[role="menuitemradio"]:not(:disabled)',
      ),
    );
  }
}
