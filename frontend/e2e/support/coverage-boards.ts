import { expect, type APIRequestContext, type APIResponse, type Page } from '@playwright/test';
import type { ZodType } from 'zod';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { apiOrigin, token, fillCredentials } from './session';
import { isolatedProject, useModernIssues } from './project';
import { zConfigurationView, zLayoutView, zModernIssueView, zSavedLayoutView, zSavedModernIssueView, } from '../../src/app/api/generated/zod.gen';
import type { LayoutView, ModernCreateFields, SaveLayoutFields } from '../../src/app/api/generated/types.gen';
export async function coverageHeaders(role = 'owner', reference = crypto.randomUUID()) {
    return { Authorization: 'Bearer ' + (await token(role)), 'Idempotency-Key': reference };
}
export async function coverageGet<T>(request: APIRequestContext, path: string, schema: ZodType<T>, role = 'owner'): Promise<T> {
    const response = await request.get(apiOrigin + path, { headers: await coverageHeaders(role) });
    expect(response.status(), path).toBe(200);
    return schema.parse(await response.json());
}
export async function coverageWrite<T>(request: APIRequestContext, method: 'POST' | 'PUT' | 'PATCH', path: string, data: unknown, schema: ZodType<T>, status = 200, role = 'owner', reference = crypto.randomUUID()): Promise<T> {
    const response = await request.fetch(apiOrigin + path, { method, headers: await coverageHeaders(role, reference), data });
    expect(response.status(), path + ': ' + await response.text()).toBe(status);
    return schema.parse(await response.json());
}
export async function coverageFailure(response: APIResponse, status = 422, code = 'validation_failed') {
    expect(response.status(), await response.text()).toBe(status);
    expect(await response.json()).toMatchObject({ error: { code } });
}
export async function coverageProject(request: APIRequestContext) {
    const projectId = await isolatedProject(request);
    await useModernIssues(projectId);
    return projectId;
}
export async function coverageConfiguration(request: APIRequestContext, projectId: string) {
    return coverageGet(request, '/api/v2/projects/' + projectId + '/configuration', zConfigurationView);
}
export async function coverageIssue(request: APIRequestContext, projectId: string, fields: ModernCreateFields = { title: 'Coverage issue' }) {
    return (await coverageWrite(request, 'POST', '/api/v2/projects/' + projectId + '/issues', fields, zSavedModernIssueView, 201, 'member')).result;
}
export async function coverageReadIssue(request: APIRequestContext, issueId: string) {
    return coverageGet(request, '/api/v2/issues/' + issueId, zModernIssueView, 'member');
}
export async function coverageBoard(request: APIRequestContext, projectId: string, name = 'Coverage board') {
    return (await coverageWrite(request, 'POST', '/api/v2/projects/' + projectId + '/boards', { name, savedFilters: {} }, zSavedLayoutView, 201, 'member')).result;
}
export async function coverageLayout(request: APIRequestContext, boardId: string) {
    return coverageGet(request, '/api/v2/boards/' + boardId, zLayoutView, 'member');
}
export function coverageLayoutDraft(view: LayoutView): SaveLayoutFields {
    return {
        expectedRevision: view.board.revision,
        name: view.board.name,
        savedFilters: view.board.savedFilters,
        columns: view.columns.map(column => ({
            id: column.id, name: column.name, stageIds: column.stages.map(mapping => mapping.stage.id), wipLimit: column.wipLimit, wipMode: column.wipMode,
        })),
    };
}
export function coverageSaveLayout(request: APIRequestContext, boardId: string, data: SaveLayoutFields, role = 'member') {
    return coverageWrite(request, 'PUT', '/api/v2/boards/' + boardId + '/layout', data, zSavedLayoutView, 200, role).then(saved => saved.result);
}
/** Reproduce a retained pre-invariant state in this run's disposable project only. */
export async function coverageRetireHistoricalStage(projectId: string, stageId: string) {
    const database = process.env['GATEGOLD_E2E_DATABASE_NAME'];
    if (!database || !/^gg_browser_[0-9a-f]{32}$/.test(database) || ![projectId, stageId].every(value => /^[0-9a-f-]{36}$/.test(value)) || projectId === '20000000-0000-4000-8000-000000000001') {
        throw new Error('Historical stage fixtures require a dedicated disposable project and browser database.');
    }
    await promisify(execFile)('docker', ['compose', '-f', resolve('../compose.dev.yaml'), 'exec', '-T', 'postgres', 'psql', '--username=gategoldjira', '--dbname=' + database, '-v', 'ON_ERROR_STOP=1', '-c', `UPDATE workflow_stages SET retired=true,accepts_entries=false,is_initial=false WHERE project_id='${projectId}' AND id='${stageId}';`]);
}
/** A bounded size fixture for the 2,000-row rank-maintenance guard. */
export async function coverageDenseBacklog(projectId: string, templateId: string) {
    const database = process.env['GATEGOLD_E2E_DATABASE_NAME'];
    if (!database || !/^gg_browser_[0-9a-f]{32}$/.test(database) || ![projectId, templateId].every(value => /^[0-9a-f-]{36}$/.test(value)) || projectId === '20000000-0000-4000-8000-000000000001') {
        throw new Error('Dense backlog fixtures require a dedicated disposable project and browser database.');
    }
    const sql = `BEGIN; INSERT INTO issue_records(id,project_id,number,title,description,reporter_id,assignee_id,due_date,parent_id,revision,description_format,archived,backlog,backlog_rank,type_id,priority_id,workflow_id,stage_id,legacy_rank) SELECT gen_random_uuid(),i.project_id,i.number+g,'Dense retained '||g,i.description,i.reporter_id,NULL,NULL,NULL,1,i.description_format,false,true,g,i.type_id,i.priority_id,i.workflow_id,i.stage_id,1024 FROM issue_records i CROSS JOIN generate_series(1,2000) g WHERE i.project_id='${projectId}' AND i.id='${templateId}' AND i.backlog AND i.parent_id IS NULL; UPDATE issue_records SET backlog_rank=2001 WHERE project_id='${projectId}' AND id='${templateId}'; COMMIT;`;
    await promisify(execFile)('docker', ['compose', '-f', resolve('../compose.dev.yaml'), 'exec', '-T', 'postgres', 'psql', '--username=gategoldjira', '--dbname=' + database, '-v', 'ON_ERROR_STOP=1', '-c', sql]);
}

/** Switch real local accounts through visible controls while retaining one SPA document. */
export async function coverageSwitchAccount(page: Page, user: string, path: string) {
 const timeOrigin=await page.evaluate(()=>performance.timeOrigin);
 page.once('dialog',dialog=>dialog.accept());
 await page.getByRole('button',{name:'Sign out',exact:true}).click();
 await expect(page.getByLabel('Username',{exact:true})).toBeVisible();
 await fillCredentials(page,user);
 await page.getByRole('button',{name:'Sign in locally',exact:true}).click();
 await expect(page.getByRole('button',{name:'Sign out',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>performance.timeOrigin)).toBe(timeOrigin);
 await page.evaluate(next=>{history.pushState({},'',next);dispatchEvent(new PopStateEvent('popstate',{state:history.state}));},path);
}
