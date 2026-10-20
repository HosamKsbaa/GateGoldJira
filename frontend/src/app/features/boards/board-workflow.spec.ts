import { describe, expect, it } from 'vitest';
import {
  allowsMove,
  copyColumns,
  defaultWorkflow,
  workflowFromColumns,
  workflowName,
} from './board-workflow';

describe('board workflow and legacy compatibility', () => {
  it('keeps old boards readable and unrestricted without workflow metadata', () => {
    expect(workflowName(undefined, 'review')).toBe('Review');
    expect(allowsMove(undefined, 'todo', 'done')).toBe(true);
  });
  it('uses the configured source stage, while same-stage ranking remains available', () => {
    const flow = defaultWorkflow();
    flow.columns[0]!.name = 'جاهز';
    flow.columns[0]!.allowedTargets = ['in_progress'];
    expect(workflowName(flow, 'todo')).toBe('جاهز');
    expect(allowsMove(flow, 'todo', 'review')).toBe(false);
    expect(allowsMove(flow, 'todo', 'in_progress')).toBe(true);
    expect(allowsMove(flow, 'todo', 'todo')).toBe(true);
    expect(allowsMove(flow, 'review', 'done')).toBe(true);
  });
  it('keeps unsaved edits separate from the confirmed board', () => {
    const flow = defaultWorkflow(),
      draft = copyColumns(flow);
    draft[0]!.name = 'Draft';
    draft[0]!.allowedTargets.pop();
    expect(flow.columns[0]!.name).toBe('To do');
    expect(flow.columns[0]!.allowedTargets).toHaveLength(3);
    expect(workflowFromColumns(draft).columns[0]!.name).toBe('Draft');
    expect(() => workflowFromColumns(draft.slice(0, 3))).toThrow();
  });
});
