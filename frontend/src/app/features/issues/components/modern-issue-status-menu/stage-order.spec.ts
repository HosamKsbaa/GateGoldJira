import { describe, expect, it } from 'vitest';
import { compareStagePosition } from './stage-order';

describe('workflow menu order', () => {
  it('uses workflow positions even when transition identities arrive in another order', () => {
    const stages = [
      { id: 'a-done', position: '3' },
      { id: 'z-doing', position: '1' },
      { id: 'm-review', position: '2' },
    ];
    expect([...stages].sort(compareStagePosition).map(stage => stage.id)).toEqual([
      'z-doing',
      'm-review',
      'a-done',
    ]);
  });
  it('keeps distinct positions above the safe integer range and stable identity ties', () => {
    const stages = [
      { id: 'a', position: '9007199254740993' },
      { id: 'z', position: '9007199254740992' },
      { id: 'b', position: '9007199254740993' },
    ];
    expect([...stages].sort(compareStagePosition).map(stage => stage.id)).toEqual(['z', 'a', 'b']);
  });
});
