import type {
  ModernIssueSummary,
  PriorityView,
  StageView,
} from '../../../../api/generated/types.gen';

type ScopedIssue = Pick<ModernIssueSummary, 'projectId'> & {
  workflow: Pick<ModernIssueSummary['workflow'], 'id'>;
};

export function bulkWorkflowId(projectId: string, selected: readonly ScopedIssue[]): string | null {
  const workflow = selected[0]?.workflow.id;
  if (
    !workflow ||
    selected.some(issue => issue.projectId !== projectId || issue.workflow.id !== workflow)
  )
    return null;
  return workflow;
}

export function selectableBulkStage(
  id: string,
  stages: readonly Pick<StageView, 'id' | 'retired' | 'acceptsEntries'>[],
): boolean {
  return stages.some(stage => stage.id === id && !stage.retired && stage.acceptsEntries);
}

export function selectableBulkPriority(
  id: string,
  priorities: readonly Pick<PriorityView, 'id' | 'retired'>[],
): boolean {
  return priorities.some(priority => priority.id === id && !priority.retired);
}
