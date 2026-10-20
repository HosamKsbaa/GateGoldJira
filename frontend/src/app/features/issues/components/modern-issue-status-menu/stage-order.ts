import type { StageChoice } from '../../../../api/generated/types.gen';

type StagePosition = Pick<StageChoice, 'id' | 'position'>;

// Positions are decimal strings: converting them to Number loses ordering above
// 2^53. IDs only break ties; transition-page order must not define the workflow.
export function compareStagePosition(left: StagePosition, right: StagePosition): number {
  const a = BigInt(left.position),
    b = BigInt(right.position);
  return a < b ? -1 : a > b ? 1 : left.id.localeCompare(right.id);
}
