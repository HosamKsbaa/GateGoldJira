import { expect, type Locator, type Page } from '@playwright/test';

export async function dragBoardCard(page: Page, source: Locator, target: Locator): Promise<void> {
  const draggable = source.locator(
    'xpath=ancestor-or-self::*[contains(concat(" ", normalize-space(@class), " "), " cdk-drag ")][1]',
  );
  await expect(draggable).toHaveCount(1);
  await expect(draggable).not.toHaveClass(/\bcdk-drag-disabled\b/);
  await expect(target).not.toHaveClass(/\bcdk-drop-list-disabled\b/);
  // Keep the origin in view until the one real gesture has actually started.
  // Scrolling a distant destination first can clip the source behind the board.
  await source.scrollIntoViewIfNeeded();
  const from = await source.boundingBox();
  if (!from) throw new Error('Board drag source missing.');
  const start = { x: from.x + 20, y: from.y + from.height / 2 };
  expect(
    await source.evaluate((element, point) => {
      const hit = document.elementFromPoint(point.x, point.y);
      return hit !== null && element.contains(hit);
    }, start),
  ).toBe(true);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 35, from.y + from.height / 2 + 12, { steps: 4 });
  await expect(page.locator('.cdk-drag-preview')).toBeVisible();
  await target.scrollIntoViewIfNeeded();
  // Drag placeholders can change row height and scroll position. Follow the
  // actual destination instead of releasing at its pre-drag coordinates.
  let point = { x: 0, y: 0 };
  for (let attempt = 0; attempt < 4; attempt++) {
    const to = await target.boundingBox();
    if (!to) throw new Error('Board drag destination missing.');
    point = { x: to.x + to.width / 2, y: to.y + Math.min(to.height / 2, 60) };
    await page.mouse.move(point.x, point.y, { steps: attempt ? 4 : 12 });
    await page.evaluate(
      () =>
        new Promise<void>(resolve =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
  }
  expect(
    await target.evaluate((element, point) => {
      const box = element.getBoundingClientRect();
      return (
        point.x >= box.left && point.x <= box.right && point.y >= box.top && point.y <= box.bottom
      );
    }, point),
  ).toBe(true);
  await page.mouse.up();
}
