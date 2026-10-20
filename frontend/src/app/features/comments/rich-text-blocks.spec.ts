import { describe, expect, it } from 'vitest';
import { checklistContentElement } from './rich-text-blocks';

// This Node test exercises content selection without loading a browser/editor.
// The browser round-trip case verifies ProseMirror parses and restores that content.
function element(tagName: string, textContent: string, children: HTMLElement[] = []): HTMLElement {
  return {
    tagName,
    textContent,
    children,
    querySelector: () => null,
    nextElementSibling: null,
  } as unknown as HTMLElement;
}

describe('checklist HTML content boundary', () => {
  it('keeps sibling text, nested table wrappers and nested checklist content in canonical items', () => {
    const table = element('DIV', 'Owner الفريق', [element('TABLE', 'Owner الفريق')]);
    const nested = element('UL', 'Nested review');
    const item = element('LI', 'Before table Owner الفريق After table Nested review', [
      element('P', 'Before table'),
      table,
      element('P', 'After table'),
      nested,
    ]);
    const content = checklistContentElement(item);
    expect(content).toBe(item);
    expect(content.textContent).toContain('Before table');
    expect(content.textContent).toContain('After table');
    expect(content.children).toContain(table);
    expect(content.children).toContain(nested);
  });

  it('uses only the immediate legacy content div after a checkbox label', () => {
    const content = element('DIV', 'Before table Owner الفريق After table', [
      element('P', 'Before table'),
      element('DIV', 'Owner الفريق'),
    ]);
    const label = {
      ...element('LABEL', ''),
      querySelector: () => element('INPUT', ''),
      nextElementSibling: content,
    } as unknown as HTMLElement;
    const item = element('LI', content.textContent ?? '', [label, content]);
    expect(checklistContentElement(item)).toBe(content);
  });

  it('does not treat arbitrary labels or nested checkbox labels as legacy item wrappers', () => {
    const unrelatedLabel = element('LABEL', 'Owner');
    const tableWrapper = element('DIV', 'Nested content');
    const item = element('LI', 'Owner Nested content', [unrelatedLabel, tableWrapper]);
    expect(checklistContentElement(item)).toBe(item);
  });
});
