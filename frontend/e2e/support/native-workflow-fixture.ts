import type { APIRequestContext } from '@playwright/test';
import { coverageConfiguration, coverageGet, coverageLayout, coverageLayoutDraft, coverageSaveLayout, coverageWrite } from './coverage-boards';
import { zPageBoardSummary, zSavedStageSaved, zSavedTransitionSaved, zSavedWorkflowSaved } from '../../src/app/api/generated/zod.gen';
import type { StageView } from '../../src/app/api/generated/types.gen';

export function nativeStageFields(stage: StageView) {
  return { name: stage.name, category: stage.category, position: stage.position, initial: stage.initial, acceptsEntries: stage.acceptsEntries, retired: stage.retired };
}

/** Public commands prepare a complete unbound workflow; browser actions under test remain native. */
export async function nativeWorkflowFixture(request: APIRequestContext, project: string, name: string) {
  const root = `/api/v2/projects/${project}`;
  const revision = async () => (await coverageConfiguration(request, project)).revision;
  const workflow = (await coverageWrite(request, 'PUT', root + '/workflows/' + crypto.randomUUID(), { expectedRevision: await revision(), name, retired: false }, zSavedWorkflowSaved)).result.workflow;
  const stages: StageView[] = [];
  for (const [index, category] of (['todo', 'review', 'done'] as const).entries()) {
    stages.push((await coverageWrite(request, 'PUT', `${root}/workflows/${workflow.id}/stages/${crypto.randomUUID()}`, { expectedRevision: await revision(), name: name + ' ' + category, category, position: String(index + 1), initial: category === 'todo', acceptsEntries: true, retired: false }, zSavedStageSaved)).result.stage);
  }
  const first = stages[0]!, review = stages[1]!, done = stages[2]!;
  for (const source of [first, review]) await coverageWrite(request, 'PUT', `${root}/workflows/${workflow.id}/transitions/${crypto.randomUUID()}`, { expectedRevision: await revision(), fromStageId: source.id, toStageId: done.id, requiredPermission: null, retired: false }, zSavedTransitionSaved);
  return { project, root, workflow, stages, first, review, done, revision };
}

export async function mapNativeWorkflow(request: APIRequestContext, project: string, stages: StageView[]) {
  const boards = await coverageGet(request, `/api/v1/projects/${project}/boards`, zPageBoardSummary);
  const board = boards.items.find(value => value.default);
  if (!board) throw new Error('Fixture needs the actual default board.');
  const layout = await coverageLayout(request, board.id), body = coverageLayoutDraft(layout);
  for (const stage of stages) {
    const target = layout.columns.find(column => column.stages.some(mapping => mapping.stage.category === stage.category));
    if (!target) throw new Error('Fixture needs an existing category column.');
    const column = body.columns.find(column => column.id === target.id)!;
    if (!column.stageIds.includes(stage.id)) column.stageIds.push(stage.id);
  }
  return coverageSaveLayout(request, board.id, body, 'owner');
}
