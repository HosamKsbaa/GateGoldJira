/** Place a top-layer popup next to its trigger without clipping or moving the page. */
export function positionAnchoredPopup(
  panel: HTMLElement,
  anchor: HTMLElement,
  preferredWidth: number,
  maxHeight = 320,
  minHeight = 220,
): void {
  const viewport = window.visualViewport;
  const leftEdge = viewport?.offsetLeft ?? 0;
  const topEdge = viewport?.offsetTop ?? 0;
  const width = viewport?.width ?? window.innerWidth;
  const height = viewport?.height ?? window.innerHeight;
  const gap = 6,
    edge = 8;
  const rect = anchor.getBoundingClientRect();
  const popupWidth = Math.min(preferredWidth, width - edge * 2);
  const below = Math.max(0, topEdge + height - rect.bottom - gap - edge);
  const above = Math.max(0, rect.top - topEdge - gap - edge);
  const flip = below < minHeight && above > below;
  const popupHeight = Math.max(0, Math.min(maxHeight, flip ? above : below));
  panel.style.position = 'fixed';
  panel.style.inset = 'auto';
  panel.style.margin = '0';
  panel.style.width = popupWidth + 'px';
  panel.style.maxHeight = popupHeight + 'px';
  const preferredLeft =
    getComputedStyle(anchor).direction === 'rtl' ? rect.right - popupWidth : rect.left;
  panel.style.left =
    Math.max(leftEdge + edge, Math.min(preferredLeft, leftEdge + width - popupWidth - edge)) + 'px';
  const renderedHeight = Math.min(panel.scrollHeight, popupHeight);
  const preferredTop = flip ? rect.top - gap - renderedHeight : rect.bottom + gap;
  panel.style.top =
    Math.max(topEdge + edge, Math.min(preferredTop, topEdge + height - renderedHeight - edge)) +
    'px';
}
