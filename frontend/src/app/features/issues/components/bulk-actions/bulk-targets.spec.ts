import { describe, expect, it } from 'vitest';
import { bulkWorkflowId, selectableBulkPriority, selectableBulkStage } from './bulk-targets';

describe('bulk action scope', () => {
  it('allows one project/workflow but rejects empty, mixed workflow and cross-project selections', () => {
    const first = { projectId: 'A', workflow: { id: 'flow-1' } };
    expect(bulkWorkflowId('A', [first, first])).toBe('flow-1');
    expect(bulkWorkflowId('A', [])).toBeNull();
    expect(bulkWorkflowId('A', [first, { ...first, workflow: { id: 'flow-2' } }])).toBeNull();
    expect(bulkWorkflowId('B', [first])).toBeNull();
  });
  it('rejects a previously chosen stage after its workflow choices change', () => {
    const choices = [{ id: 'stage-B', retired: false, acceptsEntries: true }];
    expect(selectableBulkStage('stage-A', choices)).toBe(false);
    expect(selectableBulkStage('stage-B', choices)).toBe(true);
    expect(selectableBulkStage('', choices)).toBe(false);
  });
  it('rejects retired and closed stages and retired priorities', () => {
    expect(selectableBulkStage('A', [{ id: 'A', retired: true, acceptsEntries: true }])).toBe(
      false,
    );
    expect(selectableBulkStage('A', [{ id: 'A', retired: false, acceptsEntries: false }])).toBe(
      false,
    );
    expect(selectableBulkPriority('old-project', [{ id: 'new-project', retired: false }])).toBe(
      false,
    );
    expect(selectableBulkPriority('A', [{ id: 'A', retired: true }])).toBe(false);
    expect(selectableBulkPriority('A', [{ id: 'A', retired: false }])).toBe(true);
  });
});
