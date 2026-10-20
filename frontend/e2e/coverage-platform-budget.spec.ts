import { expect } from '@playwright/test';
import { test } from './support/browser-test';
import { useCase } from './support/use-case';
import { localFixturesAvailable } from './support/session';
import { coverageProject, coverageCreate, coverageComment } from './support/coverage-issues';
import { read, mcpSuccess } from './support/coverage-access';
import { zPageCommentView } from '../src/app/api/generated/zod.gen';

test.skip(!localFixturesAvailable, 'Requires disposable real Go/PostgreSQL fixtures.');
test.use({ trace: 'off' });
test.describe.configure({ timeout: 120000 });

for (const surface of ['rest', 'mcp'] as const) test(surface + ' byte-budget comment pagination never skips an inspected but unreturned row', async ({ request }) => {
  const project = await coverageProject(request), issue = await coverageCreate(request, project), expected: string[] = [];
  // Both Unicode and typed-client lengths remain valid; HTML plus retained plain
  // text makes the requested100-row page exceed its actual1MiB byte budget.
  for (let index = 0; index < 65; index++) expected.push((await coverageComment(request, issue.summary.id, '<p>Budget ' + index + ' ' + '😀'.repeat(1900) + 'ع'.repeat(1000) + '</p>')).id);
  await useCase('UC-SYS-0023', async () => {
    const seen: string[] = [], cursors = new Set<string>(); let cursor: string | undefined;
    do {
      const page = surface === 'rest'
        ? await read(request, `/api/v1/issues/${issue.summary.id}/comments?limit=100` + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''), zPageCommentView, 'member')
        : await mcpSuccess(request, 'list_comments', { issueId: issue.summary.id, page: { limit: 100, ...(cursor ? { cursor } : {}) } }, zPageCommentView, 'member');
      expect(page.totalMatching).toBe(expected.length); expect(page.items.length).toBeGreaterThan(0);
      expect(Buffer.byteLength(JSON.stringify(page), 'utf8')).toBeLessThan(1024 * 1024);
      if (seen.length === 0) { expect(page.items.length).toBeLessThan(expected.length); expect(page.nextCursor).not.toBeNull(); }
      for (const comment of page.items) { expect(seen).not.toContain(comment.id); seen.push(comment.id); }
      cursor = page.nextCursor ?? undefined;
      if (cursor) { expect(cursors.has(cursor)).toBe(false); cursors.add(cursor); }
      expect(cursors.size).toBeLessThan(5);
    } while (cursor);
    expect(seen).toHaveLength(expected.length); expect(seen.slice().sort()).toEqual(expected.slice().sort());
  }, surface);
});
