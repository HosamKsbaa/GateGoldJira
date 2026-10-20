import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { LayoutColumn, ModernIssueSummary } from '../../../../api/generated/types.gen';
import { IconComponent } from '../../../../shared/ui/icon.component';
@Component({
  selector: 'gg-native-issue-card',
  host: { '[attr.data-issue-id]': 'issue().id' },
  imports: [RouterLink, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './native-issue-card.component.html',
  styleUrl: '../issue-card/issue-card.component.css',
})
export class NativeIssueCardComponent {
  readonly issue = input.required<ModernIssueSummary>();
  readonly columnId = input.required<string>();
  readonly columns = input<LayoutColumn[]>([]);
  readonly neighbors = input<ModernIssueSummary[]>([]);
  readonly writable = input(false);
  readonly busy = input(false);
  readonly dragging = input(false);
  readonly neighborChoice = signal('');
  readonly preview = output<string>();
  readonly move = output<string>();
  readonly reorder = output<{ neighbor: string; placement: 'before' | 'after' }>();
  openBody(event: MouseEvent): void {
    if (
      !(event.target instanceof Element) ||
      event.target.closest('a,button,input,select,textarea,summary,details,[contenteditable]')
    )
      return;
    this.open(event);
  }
  open(event: MouseEvent): void {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0)
      return;
    event.preventDefault();
    if (!this.dragging()) this.preview.emit(this.issue().id);
  }
  initials(name: string): string {
    return name
      .trim()
      .split(/\s+/u)
      .slice(0, 2)
      .map(part => Array.from(part)[0] ?? '')
      .join('')
      .toLocaleUpperCase();
  }
}
