import type { BoardWorkflow, WorkflowColumn } from '../../api/generated/types.gen';
import type { Status } from './boards.api';
export type StageCategory = 'todo' | 'in_progress' | 'review' | 'done';
export const workflowStatuses: StageCategory[] = ['todo', 'in_progress', 'review', 'done'];
export function statusCategory(status: Status): StageCategory {
  const category = status.split(':')[0];
  return category === 'todo' || category === 'review' || category === 'done'
    ? category
    : 'in_progress';
}
export function statusName(status: Status): string {
  return { todo: 'To do', in_progress: 'In progress', review: 'Review', done: 'Done' }[
    statusCategory(status)
  ];
}
export function defaultWorkflow(): BoardWorkflow {
  return {
    columns: workflowStatuses.map(status => ({
      status,
      name: statusName(status),
      allowedTargets: workflowStatuses.filter(target => target !== status),
    })),
  };
}
export function workflowName(workflow: BoardWorkflow | undefined, status: Status): string {
  return workflow?.columns.find(column => column.status === status)?.name ?? statusName(status);
}
export function allowsMove(
  workflow: BoardWorkflow | undefined,
  source: Status,
  target: Status,
): boolean {
  return (
    source === target ||
    (workflow ?? defaultWorkflow()).columns
      .find(column => column.status === source)
      ?.allowedTargets.includes(target) === true
  );
}
export function copyColumns(workflow: BoardWorkflow): WorkflowColumn[] {
  return workflow.columns.map(column => ({
    ...column,
    allowedTargets: [...column.allowedTargets],
  }));
}
export function workflowFromColumns(columns: WorkflowColumn[]): BoardWorkflow {
  if (
    columns.length < 2 ||
    !columns.some(column => statusCategory(column.status) === 'todo') ||
    !columns.some(column => statusCategory(column.status) === 'done')
  )
    throw new Error('Retain an unstarted and a completed stage.');
  return {
    columns: columns.map(column => ({ ...column, allowedTargets: [...column.allowedTargets] })),
  };
}
