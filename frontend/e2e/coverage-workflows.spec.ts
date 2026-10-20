import { expect, type APIRequestContext } from '@playwright/test';
import { test } from './support/browser-test';
import { useCase } from './support/use-case';
import { apiOrigin, localFixturesAvailable, signIn } from './support/session';
import { coverageConfiguration, coverageFailure, coverageGet, coverageHeaders, coverageProject, coverageWrite, coverageLayout, coverageLayoutDraft, coverageSaveLayout, coverageIssue, coverageReadIssue } from './support/coverage-boards';
import { zPageBindingView, zPageStageView, zPageTransitionView, zPageTypeView, zPageWorkflowView, zSavedStageSaved, zSavedTransitionSaved, zSavedTransitionPolicyView, zSavedWorkflowSaved, zTransitionPolicyView, zPageBoardSummary, zSavedConfigurationView, zSavedFieldSaved, zSavedMigrationResult, zSavedTypeSaved, zSavedAutomationRuleView, zSavedModernIssueView, } from '../src/app/api/generated/zod.gen';
import type { SaveStageFields, SaveTransitionFields, StageView, TransitionPolicy, TransitionView } from '../src/app/api/generated/types.gen';
test.skip(!localFixturesAvailable, 'Requires isolated Go/PostgreSQL fixtures.');
test.use({ trace: 'off' });
async function saveWorkflow(request: APIRequestContext, projectId: string, id: string, name: string, retired = false) {
    return (await coverageWrite(request, 'PUT', `/api/v2/projects/${projectId}/workflows/${id}`, {
        expectedRevision: (await coverageConfiguration(request, projectId)).revision, name, retired,
    }, zSavedWorkflowSaved)).result.workflow;
}
async function saveStage(request: APIRequestContext, projectId: string, workflowId: string, id: string, fields: Omit<SaveStageFields, 'expectedRevision'>) {
    return (await coverageWrite(request, 'PUT', `/api/v2/projects/${projectId}/workflows/${workflowId}/stages/${id}`, {
        ...fields, expectedRevision: (await coverageConfiguration(request, projectId)).revision,
    }, zSavedStageSaved)).result.stage;
}
function stageFields(stage: StageView): Omit<SaveStageFields, 'expectedRevision'> {
    return { name: stage.name, category: stage.category, position: stage.position, initial: stage.initial, acceptsEntries: stage.acceptsEntries, retired: stage.retired };
}
async function saveTransition(request: APIRequestContext, projectId: string, workflowId: string, id: string, fields: Omit<SaveTransitionFields, 'expectedRevision'>) {
    return (await coverageWrite(request, 'PUT', `/api/v2/projects/${projectId}/workflows/${workflowId}/transitions/${id}`, {
        ...fields, expectedRevision: (await coverageConfiguration(request, projectId)).revision,
    }, zSavedTransitionSaved)).result.transition;
}
async function customWorkflow(request: APIRequestContext, projectId: string) {
    const workflow = await saveWorkflow(request, projectId, crypto.randomUUID(), 'Coverage workflow ' + crypto.randomUUID().slice(0, 6));
    const stages: StageView[] = [];
    for (const [index, category] of (['todo', 'in_progress', 'review', 'done'] as const).entries()) {
        stages.push(await saveStage(request, projectId, workflow.id, crypto.randomUUID(), {
            name: 'Coverage ' + category, category, position: String(index + 1), initial: category === 'todo', acceptsEntries: true, retired: false,
        }));
    }
    const first = stages[0], last = stages[3];
    if (!first || !last)
        throw new Error('Missing custom stages');
    const transition = await saveTransition(request, projectId, workflow.id, crypto.randomUUID(), { fromStageId: first.id, toStageId: last.id, requiredPermission: null, retired: false });
    return { workflow, stages, first, last, transition };
}
const emptyPolicy: TransitionPolicy = { requiredSystemFields: [], requiredFieldIds: [], approvalsRequired: 0, approverRole: null, excludeIssueReporter: false };
test('workflow lifecycle and every base stage category persist exact identities and positions', async ({ request }) => {
    const projectId = await coverageProject(request), workflowId = crypto.randomUUID();
    let workflow = await useCase('UC-WFL-0011', async () => {
        const saved = await saveWorkflow(request, projectId, workflowId, 'Coverage lifecycle');
        expect(saved).toMatchObject({ id: workflowId, name: 'Coverage lifecycle', retired: false });
        return saved;
    }, 'rest');
    workflow = await useCase('UC-WFL-0012', async () => {
        const saved = await saveWorkflow(request, projectId, workflowId, 'Renamed lifecycle');
        expect(saved.name).toBe('Renamed lifecycle');
        return saved;
    }, 'rest');
    await useCase('UC-WFL-0001', async () => {
        const list = await coverageGet(request, `/api/v2/projects/${projectId}/workflows`, zPageWorkflowView, 'viewer');
        expect(list.items.some(value => value.id === workflowId && value.name === workflow.name)).toBe(true);
    }, 'rest');
    await useCase("UC-WFL-0091", async () => {
        const first = await coverageGet(request, `/api/v2/projects/${projectId}/workflows?limit=1`, zPageWorkflowView);
        expect(first.items).toHaveLength(1);
        expect(first.nextCursor).not.toBeNull();
        const next = await coverageGet(request, `/api/v2/projects/${projectId}/workflows?limit=1&cursor=${encodeURIComponent(first.nextCursor!)}`, zPageWorkflowView);
        expect(next.items).toHaveLength(1);
        expect(next.items[0]?.id).not.toBe(first.items[0]?.id);
    }, 'rest');
    for (const [index, category, id] of [[0, 'todo', 'UC-WFL-0018'], [1, 'in_progress', 'UC-WFL-0019'], [2, 'review', 'UC-WFL-0020'], [3, 'done', 'UC-WFL-0021']] as const) {
        await useCase(id, async () => {
            const saved = await saveStage(request, projectId, workflowId, crypto.randomUUID(), { name: category, category, initial: category === 'todo', acceptsEntries: true, retired: false, position: String(index + 1) });
            expect(saved).toMatchObject({ category, initial: category === 'todo', acceptsEntries: true, retired: false });
        }, 'rest');
    }
    let stage = await useCase('UC-WFL-0015', async () => {
        const saved = await saveStage(request, projectId, workflowId, crypto.randomUUID(), { name: 'Ready for QA', category: 'review', initial: false, acceptsEntries: true, retired: false, position: '5' });
        expect(saved.name).toBe('Ready for QA');
        return saved;
    }, 'rest');
    stage = await useCase('UC-WFL-0017', async () => {
        const saved = await saveStage(request, projectId, workflowId, stage.id, { ...stageFields(stage), name: 'QA renamed' });
        expect(saved.name).toBe('QA renamed');
        return saved;
    }, 'rest');
    stage = await useCase('UC-WFL-0016', async () => {
        const saved = await saveStage(request, projectId, workflowId, crypto.randomUUID(), { ...stageFields(stage), name: 'جاهز للمراجعة', position: '6' });
        expect(saved.name).toBe('جاهز للمراجعة');
        return saved;
    }, 'rest');
    stage = await useCase('UC-WFL-0022', async () => {
        const saved = await saveStage(request, projectId, workflowId, stage.id, { ...stageFields(stage), position: '9007199254740993' });
        expect(saved.position).toBe('9007199254740993');
        return saved;
    }, 'rest');
    await test.step('service precondition for UC-WFL-0089', async () => {
        const list = await coverageGet(request, `/api/v2/projects/${projectId}/workflows/${workflowId}/stages`, zPageStageView);
        expect(list.items.find(value => value.id === stage.id)?.position).toBe('9007199254740993');
    });
    await useCase('UC-WFL-0003', async () => {
        const list = await coverageGet(request, `/api/v2/projects/${projectId}/workflows/${workflowId}/stages`, zPageStageView, 'viewer');
        expect(list.items).toHaveLength(6);
        expect(list.items.map(value => value.id)).toContain(stage.id);
    }, 'rest');
    await useCase("UC-WFL-0092", async () => {
        const first = await coverageGet(request, `/api/v2/projects/${projectId}/workflows/${workflowId}/stages?limit=2`, zPageStageView);
        expect(first.items).toHaveLength(2);
        expect(first.nextCursor).not.toBeNull();
        const second = await coverageGet(request, `/api/v2/projects/${projectId}/workflows/${workflowId}/stages?limit=2&cursor=${encodeURIComponent(first.nextCursor!)}`, zPageStageView);
        expect(second.items).toHaveLength(2);
        expect(second.items.some(value => first.items.some(prior => prior.id === value.id))).toBe(false);
    }, 'rest');
    stage = await useCase('UC-WFL-0025', async () => {
        const saved = await saveStage(request, projectId, workflowId, stage.id, { ...stageFields(stage), acceptsEntries: false });
        expect(saved.acceptsEntries).toBe(false);
        return saved;
    }, 'rest');
    stage = await useCase('UC-WFL-0024', async () => {
        const saved = await saveStage(request, projectId, workflowId, stage.id, { ...stageFields(stage), acceptsEntries: true });
        expect(saved.acceptsEntries).toBe(true);
        return saved;
    }, 'rest');
    stage = await saveStage(request, projectId, workflowId, stage.id, { ...stageFields(stage), acceptsEntries: false });
    stage = await useCase('UC-WFL-0026', async () => {
        const saved = await saveStage(request, projectId, workflowId, stage.id, { ...stageFields(stage), retired: true });
        expect(saved).toMatchObject({ retired: true, acceptsEntries: false });
        const active = await coverageGet(request, `/api/v2/projects/${projectId}/workflows/${workflowId}/stages`, zPageStageView);
        expect(active.items.some(value => value.id === stage.id)).toBe(false);
        return saved;
    }, 'rest');
    stage = await useCase('UC-WFL-0027', async () => {
        const saved = await saveStage(request, projectId, workflowId, stage.id, { ...stageFields(stage), retired: false, acceptsEntries: true });
        expect(saved).toMatchObject({ retired: false, acceptsEntries: true });
        return saved;
    }, 'rest');
    workflow = await useCase('UC-WFL-0013', async () => {
        const saved = await saveWorkflow(request, projectId, workflowId, workflow.name, true);
        expect(saved.retired).toBe(true);
        return saved;
    }, 'rest');
    await useCase('UC-WFL-0014', async () => {
        const saved = await saveWorkflow(request, projectId, workflowId, workflow.name, false);
        expect(saved.retired).toBe(false);
    }, 'rest');
});
test('type workflow bindings enforce board coverage and retain safe migration paths', async ({ request, page }) => {
    const projectId = await coverageProject(request), f = await customWorkflow(request, projectId);
    const types = await coverageGet(request, `/api/v2/projects/${projectId}/issue-types`, zPageTypeView), type = types.items.find(value => value.key === 'task');
    if (!type)
        throw new Error('Missing task type');
    const bindPath = `/api/v2/projects/${projectId}/issue-types/${type.id}/workflows/${f.workflow.id}`;
    const initialBindings = await coverageGet(request, `/api/v2/projects/${projectId}/issue-types/${type.id}/workflows`, zPageBindingView), priorDefault = initialBindings.items.find(value => value.default);
    if (!priorDefault)
        throw new Error('Missing initial workflow');
    const retainedIssue = await coverageIssue(request, projectId, { title: 'Keeps its original creation workflow', typeId: type.id });
    expect(retainedIssue.summary.workflow.id).toBe(priorDefault.workflowId);
    for (const stage of f.stages.slice(1, 3)) {
        await saveTransition(request, projectId, f.workflow.id, crypto.randomUUID(), { fromStageId: stage.id, toStageId: f.last.id, requiredPermission: null, retired: false });
    }
    const nextInitial = await saveStage(request, projectId, f.workflow.id, crypto.randomUUID(), { name: 'Next intake', category: 'todo', position: '5', initial: false, acceptsEntries: true, retired: false });
    await saveTransition(request, projectId, f.workflow.id, crypto.randomUUID(), { fromStageId: nextInitial.id, toStageId: f.last.id, requiredPermission: null, retired: false });
    await saveTransition(request, projectId, f.workflow.id, crypto.randomUUID(), { fromStageId: nextInitial.id, toStageId: f.stages[2]!.id, requiredPermission: null, retired: false });
    await useCase('UC-WFL-0023', async () => {
        const saved = await saveStage(request, projectId, f.workflow.id, nextInitial.id, { ...stageFields(nextInitial), initial: true });
        expect(saved.initial).toBe(true);
        const stages = await coverageGet(request, `/api/v2/projects/${projectId}/workflows/${f.workflow.id}/stages`, zPageStageView);
        expect(stages.items.filter(value => value.initial).map(value => value.id)).toEqual([nextInitial.id]);
        expect(stages.items.find(value => value.id === f.first.id)?.initial).toBe(false);
    }, 'rest');
    await useCase('UC-WFL-0070', async () => {
        await coverageFailure(await request.put(apiOrigin + bindPath, { headers: await coverageHeaders(), data: { expectedRevision: (await coverageConfiguration(request, projectId)).revision, default: false, acceptsNew: true } }));
        expect((await coverageGet(request, `/api/v2/projects/${projectId}/issue-types/${type.id}/workflows`, zPageBindingView)).items.some(value => value.workflowId === f.workflow.id)).toBe(false);
    }, 'rest');
    const boards = await coverageGet(request, `/api/v1/projects/${projectId}/boards`, zPageBoardSummary), defaultBoard = boards.items.find(value => value.default);
    if (!defaultBoard)
        throw new Error('Missing default board');
    const layout = await coverageLayout(request, defaultBoard.id), body = coverageLayoutDraft(layout);
    for (const stage of [...f.stages, nextInitial]) {
        const target = layout.columns.find(column => column.stages.some(mapping => mapping.stage.category === stage.category));
        if (!target)
            throw new Error('Missing category column');
        body.columns.find(column => column.id === target.id)!.stageIds.push(stage.id);
    }
    await useCase('UC-BRD-0012', async () => {
        const saved = await coverageSaveLayout(request, defaultBoard.id, body, 'owner');
        expect(new Set(saved.columns.flatMap(column => column.stages.map(mapping => mapping.workflow.id))).size).toBe(2);
        expect(saved.columns.flatMap(column => column.stages.map(mapping => mapping.stage.id))).toEqual(expect.arrayContaining([...f.stages, nextInitial].map(stage => stage.id)));
    }, 'rest');
    await useCase('UC-WFL-0034', async () => {
        await coverageWrite(request, 'PUT', bindPath, { expectedRevision: (await coverageConfiguration(request, projectId)).revision, default: false, acceptsNew: true }, zSavedConfigurationView);
        expect((await coverageGet(request, `/api/v2/projects/${projectId}/issue-types/${type.id}/workflows`, zPageBindingView)).items.find(value => value.workflowId === f.workflow.id)).toMatchObject({ default: false, acceptsNew: true });
    }, 'rest');
    await useCase("UC-WFL-0094", async () => {
        const path = `/api/v2/projects/${projectId}/issue-types/${type.id}/workflows?limit=1`, first = await coverageGet(request, path, zPageBindingView);
        expect(first.items).toHaveLength(1);
        expect(first.nextCursor).not.toBeNull();
        const next = await coverageGet(request, path + '&cursor=' + encodeURIComponent(first.nextCursor!), zPageBindingView);
        expect(next.items).toHaveLength(1);
        expect(next.items[0]?.workflowId).not.toBe(first.items[0]?.workflowId);
    }, 'rest');
    await useCase('UC-WFL-0066', async () => {
        await coverageFailure(await request.put(apiOrigin + bindPath, { headers: await coverageHeaders(), data: { expectedRevision: (await coverageConfiguration(request, projectId)).revision, default: true, acceptsNew: false } }));
    }, 'rest');
    await useCase('UC-WFL-0035', async () => {
        await coverageWrite(request, 'PUT', bindPath, { expectedRevision: (await coverageConfiguration(request, projectId)).revision, default: true, acceptsNew: true }, zSavedConfigurationView);
        const created = await coverageIssue(request, projectId, { title: 'Uses new creation workflow', typeId: type.id });
        expect(created.summary.workflow.id).toBe(f.workflow.id);
        expect(created.summary.stage.id).toBe(nextInitial.id);
        const retained = await coverageReadIssue(request, retainedIssue.summary.id);
        expect(retained.summary.workflow).toEqual(retainedIssue.summary.workflow);
        expect(retained.summary.stage).toEqual(retainedIssue.summary.stage);
        expect(retained.summary.revision).toBe(retainedIssue.summary.revision);
    }, 'rest');
    await useCase('UC-WFL-0067', async () => {
        await coverageFailure(await request.put(apiOrigin + bindPath, { headers: await coverageHeaders(), data: { expectedRevision: (await coverageConfiguration(request, projectId)).revision, default: false, acceptsNew: false } }));
    }, 'rest');
    await useCase('UC-WFL-0071', async () => {
        await coverageFailure(await request.put(apiOrigin + `/api/v2/projects/${projectId}/workflows/${f.workflow.id}`, { headers: await coverageHeaders(), data: { expectedRevision: (await coverageConfiguration(request, projectId)).revision, name: f.workflow.name, retired: true } }));
    }, 'rest');
    await useCase('UC-WFL-0065', async () => {
        const current = await coverageGet(request, `/api/v2/projects/${projectId}/workflows/${f.workflow.id}/stages`, zPageStageView), initial = current.items.find(value => value.initial);
        if (!initial)
            throw new Error('Missing initial stage');
        await coverageFailure(await request.put(apiOrigin + `/api/v2/projects/${projectId}/workflows/${f.workflow.id}/stages/${initial.id}`, { headers: await coverageHeaders(), data: { ...stageFields(initial), initial: false, acceptsEntries: false, expectedRevision: (await coverageConfiguration(request, projectId)).revision } }));
    }, 'rest');
    await useCase('UC-WFL-0064', async () => {
        await coverageFailure(await request.put(apiOrigin + `/api/v2/projects/${projectId}/workflows/${f.workflow.id}/transitions/${f.transition.id}`, { headers: await coverageHeaders(), data: { expectedRevision: (await coverageConfiguration(request, projectId)).revision, fromStageId: f.transition.fromStageId, toStageId: f.transition.toStageId, requiredPermission: null, retired: true } }));
        expect((await coverageGet(request, `/api/v2/projects/${projectId}/workflows/${f.workflow.id}/transitions`, zPageTransitionView)).items.some(value => value.id === f.transition.id && !value.retired)).toBe(true);
    }, 'rest');
    const oldBindPath = `/api/v2/projects/${projectId}/issue-types/${type.id}/workflows/${priorDefault.workflowId}`;
    await useCase('UC-WFL-0036', async () => {
        await coverageWrite(request, 'PUT', oldBindPath, { expectedRevision: (await coverageConfiguration(request, projectId)).revision, default: false, acceptsNew: false }, zSavedConfigurationView);
        expect((await coverageGet(request, `/api/v2/projects/${projectId}/issue-types/${type.id}/workflows`, zPageBindingView)).items.find(value => value.workflowId === priorDefault.workflowId)).toMatchObject({ acceptsNew: false, default: false });
    }, 'rest');
    await signIn(page, 'owner', `/projects/${projectId}/workflows`, /^Workflows$/);
    await useCase('UC-WFL-0010', async () => {
        await page.getByRole('combobox', { name: 'Issue type', exact: true }).selectOption(type.id);
        await expect(page.locator('.binding-list')).toContainText('Coverage workflow');
        await expect(page.locator('.binding-list')).toContainText('Creation default');
    }, 'web');
    const source = f.stages[2];
    if (!source)
        throw new Error('Missing Review');
    const issueA = await coverageIssue(request, projectId, { title: 'Migration A', typeId: type.id, workflowId: f.workflow.id }), issueB = await coverageIssue(request, projectId, { title: 'Migration B', typeId: type.id, workflowId: f.workflow.id });
    for (const issue of [issueA, issueB])
        await coverageWrite(request, 'POST', `/api/v2/issues/${issue.summary.id}/move`, { expectedRevision: issue.summary.revision, targetStageId: source.id }, zSavedModernIssueView, 200, 'member');
    const target = await saveStage(request, projectId, priorDefault.workflowId, crypto.randomUUID(), { name: 'Inactive migration target', category: 'review', position: '10', initial: false, acceptsEntries: false, retired: false });
    // The old default workflow is still used by other types; give the new closed stage a completion path before opening intake.
    const oldStages = await coverageGet(request, `/api/v2/projects/${projectId}/workflows/${priorDefault.workflowId}/stages`, zPageStageView), oldDone = oldStages.items.find(value => value.category === 'done');
    if (!oldDone)
        throw new Error('Missing original Done');
    await saveTransition(request, projectId, priorDefault.workflowId, crypto.randomUUID(), { fromStageId: target.id, toStageId: oldDone.id, requiredPermission: null, retired: false });
    const updatedLayout = await coverageLayout(request, defaultBoard.id), mapped = coverageLayoutDraft(updatedLayout), reviewColumn = updatedLayout.columns.find(column => column.stages.some(value => value.stage.category === 'review'));
    if (!reviewColumn)
        throw new Error('Missing review mapping');
    mapped.columns.find(column => column.id === reviewColumn.id)!.stageIds.push(target.id);
    await coverageSaveLayout(request, defaultBoard.id, mapped, 'owner');
    await saveStage(request, projectId, priorDefault.workflowId, target.id, { ...stageFields(target), acceptsEntries: true });
    await saveStage(request, projectId, f.workflow.id, source.id, { ...stageFields(source), acceptsEntries: false });
    await useCase('UC-WFL-0059', async () => {
        await coverageFailure(await request.put(apiOrigin + `/api/v2/projects/${projectId}/workflows/${f.workflow.id}/stages/${source.id}`, { headers: await coverageHeaders(), data: { ...stageFields(source), acceptsEntries: false, retired: true, expectedRevision: (await coverageConfiguration(request, projectId)).revision } }));
    }, 'rest');
    await useCase('UC-WFL-0074', async () => {
        await coverageFailure(await request.post(apiOrigin + `/api/v2/projects/${projectId}/workflow-migrations`, { headers: await coverageHeaders(), data: { expectedRevision: (await coverageConfiguration(request, projectId)).revision, sourceStageId: source.id, targetStageId: f.last.id, limit: 1 } }));
    }, 'rest');
    const incompatible = await customWorkflow(request, projectId), incompatibleReview = incompatible.stages[2];
    if (!incompatibleReview)
        throw new Error('Missing incompatible stage');
    await useCase('UC-WFL-0076', async () => {
        await coverageFailure(await request.post(apiOrigin + `/api/v2/projects/${projectId}/workflow-migrations`, { headers: await coverageHeaders(), data: { expectedRevision: (await coverageConfiguration(request, projectId)).revision, sourceStageId: source.id, targetStageId: incompatibleReview.id, limit: 1 } }));
    }, 'rest');
    await coverageWrite(request, 'PUT', oldBindPath, { expectedRevision: (await coverageConfiguration(request, projectId)).revision, default: false, acceptsNew: true }, zSavedConfigurationView);
    for (const [id, remaining] of [['UC-WFL-0038', 1], ['UC-WFL-0039', 0]] as const) {
        await useCase(id, async () => {
            const migrated = await coverageWrite(request, 'POST', `/api/v2/projects/${projectId}/workflow-migrations`, { expectedRevision: (await coverageConfiguration(request, projectId)).revision, sourceStageId: source.id, targetStageId: target.id, limit: 1 }, zSavedMigrationResult);
            expect(migrated.result).toMatchObject({ moved: 1n, remaining: BigInt(remaining) });
            const issues = await Promise.all([coverageReadIssue(request, issueA.summary.id), coverageReadIssue(request, issueB.summary.id)]);
            expect(issues.filter(value => value.summary.stage.id === target.id)).toHaveLength(2 - remaining);
        }, 'rest');
    }
});
test('transition custom-field requirements reject foreign and retired definitions', async ({ request }) => {
    const projectId = await coverageProject(request), f = await customWorkflow(request, projectId), otherProject = await coverageProject(request);
    async function field(project: string, key: string) {
        return (await coverageWrite(request, 'PUT', `/api/v2/projects/${project}/fields/${crypto.randomUUID()}`, { expectedRevision: (await coverageConfiguration(request, project)).revision, key, name: key, kind: 'text', required: false, retired: false, defaultValue: null }, zSavedFieldSaved, 201)).result.field;
    }
    const own = await field(projectId, 'own_required'), foreign = await field(otherProject, 'foreign_required');
    const path = `/api/v2/projects/${projectId}/workflows/${f.workflow.id}/transitions/${f.transition.id}/policy`;
    await useCase('UC-WFL-0043', async () => {
        const policy = { ...emptyPolicy, requiredFieldIds: [own.id] }, saved = await coverageWrite(request, 'PUT', path, { expectedRevision: (await coverageConfiguration(request, projectId)).revision, policy }, zSavedTransitionPolicyView);
        expect(saved.result.policy.requiredFieldIds).toEqual([own.id]);
    }, 'rest');
    await useCase('UC-WFL-0080', async () => {
        await coverageFailure(await request.put(apiOrigin + path, { headers: await coverageHeaders(), data: { expectedRevision: (await coverageConfiguration(request, projectId)).revision, policy: { ...emptyPolicy, requiredFieldIds: [foreign.id] } } }));
        expect((await coverageGet(request, path, zTransitionPolicyView)).policy.requiredFieldIds).toEqual([own.id]);
    }, 'rest');
    await coverageWrite(request, 'PUT', path, { expectedRevision: (await coverageConfiguration(request, projectId)).revision, policy: emptyPolicy }, zSavedTransitionPolicyView);
    await coverageWrite(request, 'PUT', `/api/v2/projects/${projectId}/fields/${own.id}`, { expectedRevision: (await coverageConfiguration(request, projectId)).revision, key: own.key, name: own.name, kind: 'text', required: false, retired: true, defaultValue: null }, zSavedFieldSaved);
    await useCase('UC-WFL-0081', async () => {
        await coverageFailure(await request.put(apiOrigin + path, { headers: await coverageHeaders(), data: { expectedRevision: (await coverageConfiguration(request, projectId)).revision, policy: { ...emptyPolicy, requiredFieldIds: [own.id] } } }));
        expect((await coverageGet(request, path, zTransitionPolicyView)).policy.requiredFieldIds).toEqual([]);
    }, 'rest');
});
test('retired configuration cannot reopen bindings or invalidate retained assignment rules', async ({ request }) => {
    const projectId = await coverageProject(request), f = await customWorkflow(request, projectId), other = await customWorkflow(request, projectId);
    const typeId = crypto.randomUUID();
    await coverageWrite(request, 'PUT', `/api/v2/projects/${projectId}/issue-types/${typeId}`, { expectedRevision: (await coverageConfiguration(request, projectId)).revision, key: 'retained_type', name: 'Retained type', behavior: 'standard', retired: false }, zSavedTypeSaved, 201);
    await coverageWrite(request, 'PUT', `/api/v2/projects/${projectId}/issue-types/${typeId}`, { expectedRevision: (await coverageConfiguration(request, projectId)).revision, key: 'retained_type', name: 'Retained type', behavior: 'standard', retired: true }, zSavedTypeSaved);
    await useCase('UC-WFL-0068', async () => {
        await coverageFailure(await request.put(apiOrigin + `/api/v2/projects/${projectId}/issue-types/${typeId}/workflows/${f.workflow.id}`, { headers: await coverageHeaders(), data: { expectedRevision: (await coverageConfiguration(request, projectId)).revision, default: false, acceptsNew: true } }));
        expect((await coverageGet(request, `/api/v2/projects/${projectId}/issue-types/${typeId}/workflows`, zPageBindingView)).items.some(value => value.workflowId === f.workflow.id)).toBe(false);
    }, 'rest');
    await saveWorkflow(request, projectId, other.workflow.id, other.workflow.name + ' retired', true);
    const task = (await coverageGet(request, `/api/v2/projects/${projectId}/issue-types`, zPageTypeView)).items.find(value => value.key === 'task');
    if (!task)
        throw new Error('Missing task');
    await useCase('UC-WFL-0069', async () => {
        await coverageFailure(await request.put(apiOrigin + `/api/v2/projects/${projectId}/issue-types/${task.id}/workflows/${other.workflow.id}`, { headers: await coverageHeaders(), data: { expectedRevision: (await coverageConfiguration(request, projectId)).revision, default: false, acceptsNew: true } }));
        expect((await coverageGet(request, `/api/v2/projects/${projectId}/issue-types/${task.id}/workflows`, zPageBindingView)).items.some(value => value.workflowId === other.workflow.id)).toBe(false);
    }, 'rest');
    const stage = f.stages[2];
    if (!stage)
        throw new Error('Missing Review');
    const closed = await saveStage(request, projectId, f.workflow.id, stage.id, { ...stageFields(stage), acceptsEntries: false });
    await coverageWrite(request, 'PUT', `/api/v1/projects/${projectId}/automation-rules/${crypto.randomUUID()}`, { expectedRevision: '0', name: 'Retained rule reference', stageId: closed.id, assigneeId: '10000000-0000-4000-8000-000000000002', enabled: false }, zSavedAutomationRuleView, 201);
    await useCase('UC-WFL-0060', async () => {
        await coverageFailure(await request.put(apiOrigin + `/api/v2/projects/${projectId}/workflows/${f.workflow.id}/stages/${closed.id}`, { headers: await coverageHeaders(), data: { ...stageFields(closed), retired: true, expectedRevision: (await coverageConfiguration(request, projectId)).revision } }));
        expect((await coverageGet(request, `/api/v2/projects/${projectId}/workflows/${f.workflow.id}/stages`, zPageStageView)).items.find(value => value.id === closed.id)?.retired).toBe(false);
    }, 'rest');
    const inactive = await customWorkflow(request, projectId), target = inactive.stages[2];
    if (!target)
        throw new Error('Missing target Review');
    await saveStage(request, projectId, inactive.workflow.id, target.id, { ...stageFields(target), acceptsEntries: false });
    await saveStage(request, projectId, inactive.workflow.id, target.id, { ...stageFields(target), acceptsEntries: false, retired: true });
    await useCase('UC-WFL-0075', async () => {
        await coverageFailure(await request.post(apiOrigin + `/api/v2/projects/${projectId}/workflow-migrations`, { headers: await coverageHeaders(), data: { expectedRevision: (await coverageConfiguration(request, projectId)).revision, sourceStageId: closed.id, targetStageId: target.id, limit: 1 } }));
    }, 'rest');
});
test('directed transition lifecycle and policy requirements persist separately', async ({ request }) => {
    const projectId = await coverageProject(request), f = await customWorkflow(request, projectId);
    const review = f.stages[2];
    if (!review)
        throw new Error('Missing Review');
    let transition: TransitionView = await useCase('UC-WFL-0028', async () => {
        const saved = await saveTransition(request, projectId, f.workflow.id, crypto.randomUUID(), { fromStageId: f.first.id, toStageId: review.id, retired: false, requiredPermission: null });
        expect(saved).toMatchObject({ fromStageId: f.first.id, toStageId: review.id, retired: false });
        return saved;
    }, 'rest');
    const path = `/api/v2/projects/${projectId}/workflows/${f.workflow.id}/transitions`;
    await useCase('UC-WFL-0005', async () => {
        const list = await coverageGet(request, path, zPageTransitionView, 'viewer');
        expect(list.items.map(value => value.id)).toEqual(expect.arrayContaining([f.transition.id, transition.id]));
    }, 'rest');
    await useCase("UC-WFL-0093", async () => {
        const first = await coverageGet(request, path + '?limit=1', zPageTransitionView);
        expect(first.items).toHaveLength(1);
        expect(first.nextCursor).not.toBeNull();
        const second = await coverageGet(request, path + '?limit=1&cursor=' + encodeURIComponent(first.nextCursor!), zPageTransitionView);
        expect(second.items).toHaveLength(1);
        expect(second.items[0]?.id).not.toBe(first.items[0]?.id);
    }, 'rest');
    for (const [id, requiredPermission] of [['UC-WFL-0029', 'member'], ['UC-WFL-0030', 'project_admin'], ['UC-WFL-0031', null]] as const) {
        transition = await useCase(id, async () => {
            const saved = await saveTransition(request, projectId, f.workflow.id, transition.id, { fromStageId: transition.fromStageId, toStageId: transition.toStageId, retired: false, requiredPermission });
            expect(saved.requiredPermission).toBe(requiredPermission);
            return saved;
        }, 'rest');
    }
    for (const [id, retired] of [['UC-WFL-0032', true], ['UC-WFL-0033', false]] as const) {
        transition = await useCase(id, async () => {
            const saved = await saveTransition(request, projectId, f.workflow.id, transition.id, { fromStageId: transition.fromStageId, toStageId: transition.toStageId, retired, requiredPermission: null });
            expect(saved.retired).toBe(retired);
            return saved;
        }, 'rest');
    }
    const policyPath = path + '/' + transition.id + '/policy';
    await useCase('UC-WFL-0090', async () => {
        const current = await coverageGet(request, policyPath, zTransitionPolicyView, 'viewer');
        expect(current.transitionId).toBe(transition.id);
        expect(current.policy).toEqual(emptyPolicy);
    }, 'rest');
    for (const [id, policy] of [
        ['UC-WFL-0040', { ...emptyPolicy, requiredSystemFields: ['assignee'] }],
        ['UC-WFL-0041', { ...emptyPolicy, requiredSystemFields: ['due_date'] }],
        ['UC-WFL-0042', { ...emptyPolicy, requiredSystemFields: ['description'] }],
        ['UC-WFL-0044', emptyPolicy],
        ['UC-WFL-0045', { ...emptyPolicy, approvalsRequired: 1, approverRole: 'member' }],
        ['UC-WFL-0046', { ...emptyPolicy, approvalsRequired: 2, approverRole: 'project_admin' }],
        ['UC-WFL-0047', { ...emptyPolicy, approvalsRequired: 1, approverRole: 'member', excludeIssueReporter: true }],
        ["UC-WFL-0095", emptyPolicy],
    ] as const) {
        await useCase(id, async () => {
            const saved = await coverageWrite(request, 'PUT', policyPath, { expectedRevision: (await coverageConfiguration(request, projectId)).revision, policy }, zSavedTransitionPolicyView);
            expect(saved.result.policy).toEqual(policy);
            const persisted = await coverageGet(request, policyPath, zTransitionPolicyView);
            expect(persisted.policy).toEqual(policy);
        }, 'rest');
    }
});
test('workflow validation rejects malformed fields and retains unchanged configuration', async ({ request }) => {
    const projectId = await coverageProject(request), f = await customWorkflow(request, projectId);
    const base = `/api/v2/projects/${projectId}/workflows/${f.workflow.id}`;
    const before = await coverageConfiguration(request, projectId);
    const invalids: Array<{
        id: string;
        path: string;
        data: unknown;
    }> = [
        { id: 'UC-WFL-0050', path: base, data: { name: '  ', retired: false } },
        { id: 'UC-WFL-0051', path: base, data: { name: 'w'.repeat(101), retired: false } },
        { id: 'UC-WFL-0052', path: base + '/stages/' + f.first.id, data: { ...stageFields(f.first), name: '  ' } },
        { id: 'UC-WFL-0053', path: base + '/stages/' + f.first.id, data: { ...stageFields(f.first), name: 's'.repeat(61) } },
        { id: 'UC-WFL-0054', path: base + '/stages/' + f.first.id, data: { ...stageFields(f.first), position: '0' } },
        { id: 'UC-WFL-0055', path: base + '/stages/' + f.first.id, data: { ...stageFields(f.first), category: 'review', initial: false } },
        { id: 'UC-WFL-0056', path: base + '/stages/' + f.last.id, data: { ...stageFields(f.last), initial: true } },
        { id: 'UC-WFL-0057', path: base + '/stages/' + f.first.id, data: { ...stageFields(f.first), acceptsEntries: false } },
        { id: 'UC-WFL-0058', path: base + '/stages/' + f.last.id, data: { ...stageFields(f.last), acceptsEntries: false, retired: true } },
        { id: 'UC-WFL-0061', path: base + '/transitions/' + crypto.randomUUID(), data: { fromStageId: f.first.id, toStageId: f.first.id, requiredPermission: null, retired: false } },
        { id: 'UC-WFL-0063', path: base + '/transitions/' + f.transition.id, data: { fromStageId: f.last.id, toStageId: f.first.id, requiredPermission: null, retired: false } },
    ];
    for (const invalid of invalids) {
        await useCase(invalid.id, async () => {
            await coverageFailure(await request.put(apiOrigin + invalid.path, { headers: await coverageHeaders(), data: { ...invalid.data as object, expectedRevision: before.revision } }));
            expect((await coverageConfiguration(request, projectId)).revision).toBe(before.revision);
        }, 'rest');
    }
    await useCase('UC-WFL-0049', async () => {
        await coverageFailure(await request.put(apiOrigin + base, { headers: await coverageHeaders('member'), data: { expectedRevision: before.revision, name: 'Forbidden member edit', retired: false } }), 403, 'forbidden');
        expect((await coverageConfiguration(request, projectId)).revision).toBe(before.revision);
    }, 'rest');
    const other = await customWorkflow(request, projectId);
    await useCase('UC-WFL-0062', async () => {
        await coverageFailure(await request.put(apiOrigin + base + '/transitions/' + crypto.randomUUID(), { headers: await coverageHeaders(), data: { expectedRevision: (await coverageConfiguration(request, projectId)).revision, fromStageId: f.first.id, toStageId: other.last.id, requiredPermission: null, retired: false } }));
    }, 'rest');
    const policyPath = base + '/transitions/' + f.transition.id + '/policy';
    for (const [id, policy] of [
        ['UC-WFL-0079', { ...emptyPolicy, requiredSystemFields: ['assignee', 'assignee'] }],
        ['UC-WFL-0082', { ...emptyPolicy, approvalsRequired: 101, approverRole: 'member' }],
        ['UC-WFL-0083', { ...emptyPolicy, approvalsRequired: -1, approverRole: 'member' }],
        ['UC-WFL-0084', { ...emptyPolicy, approvalsRequired: 1, approverRole: null }],
    ] as const) {
        await useCase(id, async () => {
            await coverageFailure(await request.put(apiOrigin + policyPath, { headers: await coverageHeaders(), data: { expectedRevision: (await coverageConfiguration(request, projectId)).revision, policy } }));
            expect((await coverageGet(request, policyPath, zTransitionPolicyView)).policy).toEqual(emptyPolicy);
        }, 'rest');
    }
    for (const [id, data] of [
        ['UC-WFL-0072', { sourceStageId: f.first.id, targetStageId: other.first.id, limit: 1 }],
        ['UC-WFL-0073', { sourceStageId: f.first.id, targetStageId: f.first.id, limit: 1 }],
        ['UC-WFL-0077', { sourceStageId: f.first.id, targetStageId: other.first.id, limit: 101 }],
        ['UC-WFL-0078', { sourceStageId: f.first.id, targetStageId: other.first.id, limit: 0 }],
    ] as const) {
        await useCase(id, async () => {
            await coverageFailure(await request.post(apiOrigin + `/api/v2/projects/${projectId}/workflow-migrations`, { headers: await coverageHeaders(), data: { expectedRevision: (await coverageConfiguration(request, projectId)).revision, ...data } }));
        }, 'rest');
    }
});
test('workflow and type selectors show independent current contexts in the browser', async ({ page, request }) => {
    const projectId = await coverageProject(request), f = await customWorkflow(request, projectId);
    const types = await coverageGet(request, `/api/v2/projects/${projectId}/issue-types`, zPageTypeView);
    const type = types.items.find(value => value.key === 'task' && !value.retired);
    if (!type) throw new Error('Missing active task type');
    const bindingsPath = `/api/v2/projects/${projectId}/issue-types/${type.id}/workflows`;
    await coverageWrite(request, 'PUT', `${bindingsPath}/${f.workflow.id}`, { expectedRevision: (await coverageConfiguration(request, projectId)).revision, default: false, acceptsNew: false }, zSavedConfigurationView);
    await saveWorkflow(request, projectId, f.workflow.id, f.workflow.name, true);
    const workflows = (await coverageGet(request, `/api/v2/projects/${projectId}/workflows?includeRetired=true`, zPageWorkflowView)).items;
    await signIn(page, 'owner', `/projects/${projectId}/workflows`, /^Workflows$/);
    await useCase('UC-WFL-0009', async () => {
        await page.getByRole('navigation', { name: 'Workflows', exact: true }).getByRole('button').filter({ hasText: f.workflow.name }).click();
        await expect(page.getByRole('heading', { name: f.workflow.name, exact: true })).toBeVisible();
        await expect(page.getByRole('heading', { name: f.first.name, exact: true })).toBeVisible();
    }, 'web');
    await useCase('UC-WFL-0007', async () => {
        const received = page.waitForResponse(response => response.request().method() === 'GET' && new URL(response.url()).pathname === bindingsPath);
        await page.getByRole('combobox', { name: 'Issue type', exact: true }).selectOption(type.id);
        const response = await received;
        expect(response.status()).toBe(200);
        const bindings = zPageBindingView.parse(await response.json());
        expect(bindings.items).toHaveLength(2);
        expect(bindings.nextCursor).toBeNull();
        expect(bindings.items.find(value => value.workflowId === f.workflow.id)).toEqual({ projectId, typeId: type.id, workflowId: f.workflow.id, default: false, acceptsNew: false });
        expect(bindings.items.some(value => value.default && value.acceptsNew)).toBe(true);
        await expect(page.getByRole('combobox', { name: 'Issue type', exact: true })).toHaveValue(type.id);
        const rows = page.locator('.binding-list li');
        await expect(rows).toHaveCount(2);
        await expect(rows.locator('strong')).toHaveText(bindings.items.map(binding => workflows.find(workflow => workflow.id === binding.workflowId)!.name));
        await expect(page.getByRole('button', { name: 'More bindings', exact: true })).toHaveCount(0);
        for (const [index, binding] of bindings.items.entries()) {
            const row = rows.nth(index);
            await expect(row.locator('span')).toHaveText((binding.default ? 'Creation default · ' : '') + (binding.acceptsNew ? 'Accepts new issues' : 'Existing issues only'));
            await row.getByRole('button', { name: 'Edit binding', exact: true }).click();
            const editor = page.locator('form.editor');
            await expect(editor.getByRole('combobox', { name: 'Workflow', exact: true })).toHaveValue(binding.workflowId);
            await expect(editor.getByRole('checkbox', { name: 'Default for new issues of this type', exact: true })).toBeChecked({ checked: binding.default });
            await expect(editor.getByRole('checkbox', { name: 'Accept new assignments', exact: true })).toBeChecked({ checked: binding.acceptsNew });
            await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
            await expect(editor).toHaveCount(0);
        }
        await expect(page.getByRole('navigation', { name: 'Workflows', exact: true }).getByRole('button').filter({ hasText: f.workflow.name })).toContainText('Retired');
    }, 'web');
});
