import { describe, expect, it } from 'vitest';
import { zInboxSummary, zMarkAllResult } from '../../api/generated/zod.gen';

describe('Inbox count contracts', () => {
  it('keeps JSON counts as numbers for badge and empty-state comparisons', () => {
    const inbox = zInboxSummary.parse({ unreadCount: 0, companyToday: '2026-10-12' });
    const result = zMarkAllResult.parse({ changedCount: 2, inbox });
    expect(inbox.unreadCount).toBe(0);
    expect(typeof result.changedCount).toBe('number');
    expect(zInboxSummary.parse({ ...inbox, unreadCount: 50_000 }).unreadCount).toBe(50_000);
  });

  it('rejects negative and fractional counts', () => {
    for (const unreadCount of [-1, 1.5]) {
      expect(zInboxSummary.safeParse({ unreadCount, companyToday: '2026-10-12' }).success).toBe(
        false,
      );
    }
  });
});
