import { ChangeDetectionStrategy, Component, input } from '@angular/core';

const paths = {
  home: 'M3 10 12 3l9 7v10h-6v-7H9v7H3Z',
  board: 'M3 4h18v16H3ZM9 4v16M15 4v16M6 8v4M12 8v7M18 8v2',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  grid: 'M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3ZM14 14h7v7h-7Z',
  folder: 'M3 6h7l2 2h9v12H3ZM3 6V4h7l2 2h9v2',
  search: 'M20 20l-5-5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0',
  plus: 'M12 5v14M5 12h14',
  close: 'M6 6l12 12M18 6 6 18',
  check: 'M5 12l4 4L19 6',
  'check-square': 'M4 4h16v16H4ZM8 12l3 3 5-6',
  bug: 'M9 5V3M15 5V3M8 8h8v8a4 4 0 0 1-8 0ZM4 10h4M16 10h4M4 15h4M16 15h4M6 20l3-3M15 17l3 3M12 8v12',
  subtask: 'M4 3h8v8H4ZM12 11v6h8M16 13h5v8h-5Z',
  'chevron-down': 'M6 9l6 6 6-6',
  'chevron-right': 'M9 6l6 6-6 6',
  'arrow-right': 'M4 12h16M14 6l6 6-6 6',
  'arrow-left': 'M20 12H4M10 6l-6 6 6 6',
  'arrow-up': 'M12 20V4M6 10l6-6 6 6',
  'arrow-down': 'M12 4v16M6 14l6 6 6-6',
  settings:
    'M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  bell: 'M5 17h14l-2-3V9a5 5 0 0 0-10 0v5ZM10 21h4',
  users:
    'M16 21v-3a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v3M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M17 3a4 4 0 0 1 0 8M22 21v-3a4 4 0 0 0-4-4',
  activity: 'M3 12h4l3-9 4 18 3-9h4',
  filter: 'M3 5h18l-7 8v6l-4 2v-8Z',
  refresh: 'M20 7v5h-5M4 17v-5h5M5 7a8 8 0 0 1 13-2l2 3M4 16l2 3a8 8 0 0 0 13-2',
  calendar: 'M4 5h16v16H4ZM4 10h16M8 3v4M16 3v4M8 14h2M14 14h2M8 18h2',
  flag: 'M5 21V3h14l-2 5 2 5H5',
  link: 'M10 13l4-4M8 15l-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0M16 9l2-2a4 4 0 0 0-6-6l-4 4a4 4 0 0 0 0 6',
  comment: 'M3 4h18v13H8l-5 4Z',
  image: 'M3 3h18v18H3ZM3 17l6-6 5 5 3-3 4 4M16 7h.01',
  clock: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M12 7v5l3 2',
  help: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4M12 17h.01',
  logout: 'M9 3H3v18h6M9 12h12M16 7l5 5-5 5',
  menu: 'M3 6h18M3 12h18M3 18h18',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  paperclip:
    'M21 11.5 12 20.5a6 6 0 0 1-8.5-8.5l10-10a4 4 0 0 1 5.7 5.7l-10 10a2 2 0 0 1-2.8-2.8L15 6',
  code: 'M8 5 1 12l7 7M16 5l7 7-7 7M14 3l-4 18',
  quote: 'M4 6h6v7H5c0 3 1 4 3 5M14 6h6v7h-5c0 3 1 4 3 5',
  'list-ordered': 'M9 6h12M9 12h12M9 18h12M3 3v6M2 3h1M2 13c2-2 4 0 2 2l-2 3h3',
  'corner-down-left': 'M20 4v7H4M9 6l-5 5 5 5',
  'at-sign': 'M16 8v7c0 3 6 2 6-3a10 10 0 1 0-4 8M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  circle: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  grip: 'M8 5h.01M16 5h.01M8 12h.01M16 12h.01M8 19h.01M16 19h.01',
} satisfies Record<string, string>;

export type IconName = keyof typeof paths;

@Component({
  selector: 'gg-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.75"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path [attr.d]="path()" />
  </svg>`,
  styles: `
    :host {
      display: inline-flex;
      flex: none;
      width: 18px;
      height: 18px;
      align-items: center;
      justify-content: center;
      vertical-align: middle;
    }
    svg {
      display: block;
      width: 100%;
      height: 100%;
    }
  `,
})
export class IconComponent {
  readonly name = input<IconName>('circle');
  path(): string {
    return paths[this.name()];
  }
}
