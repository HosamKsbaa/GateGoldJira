import { expect, type APIRequestContext, type APIResponse } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { test } from './support/browser-test';
import { useCase } from './support/use-case';
import { readinessFixture, readinessCases } from './support/configuration-readiness';
import { restSuccess, restFailure } from './support/coverage-rest';
import { isolatedProject, useModernIssues } from './support/project';
import { localFixturesAvailable, apiOrigin, token } from './support/session';
import { memberId, viewerId, mcpSuccess, callTool } from './support/coverage-access';
import { zConfigurationView, zSavedTypeSaved, zPageTypeView, zSavedPrioritySaved, zPagePriorityView, zSavedFieldSaved, zPageFieldDefinition, zSavedFieldOptionSaved, zPageFieldOptionView, zSavedConfigurationView, zActivationReadiness, zSavedBackfillFieldResult, zSavedModernIssueView, zModernIssueView, zCustomFieldsView, zPageBindingView, zSavedMembershipView, zConfigurationFailureBody, zPageWorkflowView, zPageTransitionView, zSavedTransitionPolicyView, zTransitionPolicyView, zSavedIssueView } from '../src/app/api/generated/zod.gen';
test.skip(!localFixturesAvailable, 'Requires real isolated MCP, PostgreSQL and local identities.');
test.use({ trace: 'off' });
const operation = z.object({ operationId: z.string(), parameters: z.array(z.object({ in: z.string(), name: z.string(), schema: z.object({ type: z.string().optional() }).passthrough().optional() }).passthrough()).optional() }).passthrough();
const document = z.object({ paths: z.record(z.string(), z.record(z.string(), z.unknown())) }).parse(JSON.parse(readFileSync(new URL('../../backend/api/openapi.json', import.meta.url), 'utf8')));
function nativePlan(method: string, path: string, body: object = {}, reference?: string) {
    const url = new URL(path, apiOrigin);
    for (const [template, item] of Object.entries(document.paths)) {
        const definition = item[method.toLowerCase()];
        if (!definition)
            continue;
        const names = [...template.matchAll(/\{([^}]+)\}/g)].map(m => m[1]!);
        const match = new RegExp('^' + template.replace(/\{[^}]+\}/g, '([^/]+)') + '$').exec(url.pathname);
        if (!match)
            continue;
        const parsed = operation.parse(definition), args: Record<string, unknown> = { ...body };
        for (const [i, name] of names.entries())
            args[name] = decodeURIComponent(match[i + 1]!);
        const page: Record<string, unknown> = {};
        for (const [key, value] of url.searchParams) {
            const input = parsed.parameters?.find(p => p.in === 'query' && p.name === key);
            if (!input)
                throw new Error('Undeclared query ' + key);
            const typed = input.schema?.type === 'boolean' ? value === 'true' : input.schema?.type === 'integer' ? Number(value) : value;
            if (key === 'limit' || key === 'cursor')
                page[key] = typed;
            else
                args[key] = typed;
        }
        if (Object.keys(page).length)
            args['page'] = page;
        if (method !== 'GET')
            args['retryReference'] = reference ?? crypto.randomUUID();
        return { name: parsed.operationId, args };
    }
    throw new Error('No published operation for ' + method + ' ' + url.pathname);
}
async function readNative<S extends z.ZodType>(request: APIRequestContext, path: string, schema: S, role = 'owner'): Promise<z.output<S>> {
    const plan = nativePlan('GET', path);
    return mcpSuccess(request, plan.name, plan.args, schema, role);
}
async function saveNative<S extends z.ZodType>(request: APIRequestContext, path: string, body: object, schema: S, options: {
    method?: 'POST' | 'PUT';
    role?: string;
    reference?: string;
} = {}): Promise<z.output<S>> {
    const plan = nativePlan(options.method ?? 'PUT', path, body, options.reference);
    return mcpSuccess(request, plan.name, plan.args, schema, options.role);
}
async function callNative(request: APIRequestContext, method: string, path: string, body: object, role = 'owner') {
    const plan = nativePlan(method, path, body);
    return callTool(request, plan.name, plan.args, await token(role, 'mcp'));
}
async function rejectNative(response: APIResponse, code: string, message?: RegExp) {
    expect(response.status()).toBe(200);
    const reply = z.object({ jsonrpc: z.literal('2.0'), id: z.literal(1), result: z.object({ isError: z.literal(true), structuredContent: z.object({ ok: z.literal(false), data: z.null(), error: z.unknown() }), content: z.array(z.object({ type: z.literal('text'), text: z.string() })).min(1) }) }).parse(await response.json());
    const failure = zConfigurationFailureBody.parse(reply.result.structuredContent.error);
    expect(failure.error.code).toBe(code);
    expect(reply.result.content.map(v => v.text).join('\n')).toContain(failure.error.message);
    if (message)
        expect([failure.error.message, ...failure.error.fieldErrors.map(v => v.field + ': ' + v.message)].join('\n')).toMatch(message);
    return failure;
}
test('MCP taxonomy API lifecycle preserves exact ordering and rejects invalid immutable configuration', async ({ request }) => {
    const projectId = await isolatedProject(request), root = '/api/v2/projects/' + projectId;
    let config = await readNative(request, root + '/configuration', zConfigurationView);
    await useCase('UC-CFG-0001', async () => {
        expect(config.projectId).toBe(projectId);
        expect(config.canManage).toBe(true);
    }, "mcp");
    const typeId = crypto.randomUUID();
    let type = (await saveNative(request, root + '/issue-types/' + typeId, { expectedRevision: config.revision, key: 'story', name: 'قصة الفريق', behavior: 'standard', retired: false }, zSavedTypeSaved, {})).result;
    config = type.configuration;
    await useCase('UC-CFG-0006', async () => {
        expect(type.type.id).toBe(typeId);
        expect(type.type.behavior).toBe('standard');
    }, "mcp");
    await useCase('UC-CFG-0018', async () => {
        expect(type.type.name).toBe('قصة الفريق');
    }, "mcp");
    await useCase('UC-CFG-0008', async () => {
        type = (await saveNative(request, root + '/issue-types/' + typeId, { expectedRevision: config.revision, key: 'story', name: 'Story revised', behavior: 'standard', retired: false }, zSavedTypeSaved)).result;
        config = type.configuration;
        expect(type.type.name).toBe('Story revised');
    }, "mcp");
    await useCase('UC-CFG-0014', async () => {
        const response = await callNative(request, "PUT", apiOrigin + root + '/issue-types/' + typeId, { expectedRevision: config.revision, key: 'new_key', name: 'Story revised', behavior: 'standard', retired: false }, "owner");
        await rejectNative(response, "validation_failed", /stable key/i);
    }, "mcp");
    for (const [id, patch] of [['UC-CFG-0016', { key: 'Bad-key' }], ['UC-CFG-0017', { name: 'x'.repeat(61) }]] as const) {
        await useCase(id, async () => {
            const response = await callNative(request, "PUT", apiOrigin + root + '/issue-types/' + crypto.randomUUID(), { expectedRevision: config.revision, key: 'valid', name: 'Valid', behavior: 'standard', retired: false, ...patch }, "owner");
            await rejectNative(response, "validation_failed");
        }, "mcp");
    }
    await useCase('UC-CFG-0009', async () => {
        type = (await saveNative(request, root + '/issue-types/' + typeId, { expectedRevision: config.revision, key: 'story', name: 'Story revised', behavior: 'standard', retired: true }, zSavedTypeSaved)).result;
        config = type.configuration;
        expect(type.type.retired).toBe(true);
        expect((await readNative(request, root + '/issue-types', zPageTypeView)).items.map(v => v.id)).not.toContain(typeId);
    }, "mcp");
    await useCase('UC-CFG-0003', async () => {
        expect((await readNative(request, root + '/issue-types?includeRetired=true', zPageTypeView)).items.find(v => v.id === typeId)?.retired).toBe(true);
    }, "mcp");
    await useCase('UC-CFG-0013', async () => {
        type = (await saveNative(request, root + '/issue-types/' + typeId, { expectedRevision: config.revision, key: 'story', name: 'Story revised', behavior: 'standard', retired: false }, zSavedTypeSaved)).result;
        config = type.configuration;
        expect(type.type.retired).toBe(false);
    }, "mcp");
    await useCase('UC-CFG-0007', async () => {
        const subtask = await saveNative(request, root + '/issue-types/' + crypto.randomUUID(), { expectedRevision: config.revision, key: 'child', name: 'Child task', behavior: 'subtask', retired: false }, zSavedTypeSaved, {});
        config = subtask.result.configuration;
        expect(subtask.result.type.behavior).toBe('subtask');
    }, "mcp");
    for (const [id, endpoint, schema] of [['UC-CFG-0002', 'issue-types', zPageTypeView], ['UC-CFG-0004', 'priorities', zPagePriorityView]] as const) {
        await useCase(id, async () => {
            const first = await readNative(request, root + '/' + endpoint + '?limit=1', schema);
            expect(first.items).toHaveLength(1);
            expect(first.nextCursor).toBeTruthy();
            const next = await readNative(request, root + '/' + endpoint + '?limit=1&cursor=' + encodeURIComponent(first.nextCursor!), schema);
            expect(next.items[0]?.id).not.toBe(first.items[0]?.id);
        }, "mcp");
    }
    const priorityId = crypto.randomUUID();
    let priority = (await saveNative(request, root + '/priorities/' + priorityId, { expectedRevision: config.revision, key: 'urgent', name: 'Urgent', sortOrder: '9007199254740993', retired: false }, zSavedPrioritySaved, {})).result;
    config = priority.configuration;
    await useCase('UC-CFG-0019', async () => {
        expect(priority.priority.id).toBe(priorityId);
        expect(priority.priority.name).toBe('Urgent');
    }, "mcp");
    await useCase('UC-CFG-0021', async () => {
        expect(priority.priority.sortOrder).toBe('9007199254740993');
    }, "mcp");
    await useCase('UC-CFG-0020', async () => {
        priority = (await saveNative(request, root + '/priorities/' + priorityId, { expectedRevision: config.revision, key: 'urgent', name: 'Very urgent', sortOrder: '9007199254740995', retired: false }, zSavedPrioritySaved)).result;
        config = priority.configuration;
        expect(priority.priority.name).toBe('Very urgent');
    }, "mcp");
    await useCase('UC-CFG-0022', async () => {
        const response = await callNative(request, "PUT", apiOrigin + root + '/priorities/' + priorityId, { expectedRevision: config.revision, key: 'urgent', name: 'Very urgent', sortOrder: '0', retired: false }, "owner");
        await rejectNative(response, "validation_failed");
    }, "mcp");
    await useCase('UC-CFG-0023', async () => {
        const response = await callNative(request, "PUT", apiOrigin + root + '/priorities/' + priorityId, { expectedRevision: config.revision, key: 'renamed', name: 'Very urgent', sortOrder: '4', retired: false }, "owner");
        await rejectNative(response, "validation_failed", /stable key/i);
    }, "mcp");
    await useCase('UC-CFG-0024', async () => {
        priority = (await saveNative(request, root + '/priorities/' + priorityId, { expectedRevision: config.revision, key: 'urgent', name: 'Very urgent', sortOrder: '9007199254740995', retired: true }, zSavedPrioritySaved)).result;
        config = priority.configuration;
        expect(priority.priority.retired).toBe(true);
        expect((await readNative(request, root + '/priorities', zPagePriorityView)).items.map(v => v.id)).not.toContain(priorityId);
    }, "mcp");
    await useCase('UC-CFG-0005', async () => {
        expect((await readNative(request, root + '/priorities?includeRetired=true', zPagePriorityView)).items.find(v => v.id === priorityId)?.retired).toBe(true);
    }, "mcp");
    await useCase('UC-CFG-0027', async () => {
        priority = (await saveNative(request, root + '/priorities/' + priorityId, { expectedRevision: config.revision, key: 'urgent', name: 'Very urgent', sortOrder: '9007199254740995', retired: false }, zSavedPrioritySaved)).result;
        config = priority.configuration;
        expect(priority.priority.retired).toBe(false);
    }, "mcp");
    await useCase('UC-CFG-0075', async () => {
        const response = await callNative(request, "PUT", apiOrigin + root + '/priorities/' + crypto.randomUUID(), { expectedRevision: config.revision, key: 'forbidden', name: 'Forbidden', sortOrder: '5', retired: false }, 'viewer');
        await rejectNative(response, "forbidden", /permission|access|forbidden|reading only/i);
    }, "mcp");
});
test('MCP typed-field definitions, choices and defaults are validated independently through PostgreSQL', async ({ request }) => {
    const projectId = await isolatedProject(request), root = '/api/v2/projects/' + projectId;
    let config = await readNative(request, root + '/configuration', zConfigurationView);
    const ids = new Map<string, string>();
    for (const [caseId, kind] of [
        ['UC-CFG-0033', 'text'], ['UC-CFG-0034', 'number'], ['UC-CFG-0035', 'date'],
        ['UC-CFG-0036', 'choice'], ['UC-CFG-0037', 'user'],
    ] as const) {
        await useCase(caseId, async () => {
            const id = crypto.randomUUID();
            ids.set(kind, id);
            const saved = await saveNative(request, root + '/fields/' + id, { expectedRevision: config.revision, key: 'field_' + kind, name: 'Field ' + kind, kind, required: false, retired: false, defaultValue: null }, zSavedFieldSaved, {});
            config = saved.result.configuration;
            expect(saved.result.field.kind).toBe(kind);
            expect(saved.result.field.id).toBe(id);
            expect(saved.result.field.defaultValue).toBeNull();
        }, "mcp");
    }
    await useCase('UC-CFG-0031', async () => {
        const list = await readNative(request, root + '/fields', zPageFieldDefinition);
        expect(list.items.map(v => v.id).sort()).toEqual([...ids.values()].sort());
    }, "mcp");
    await useCase('UC-CFG-0032', async () => {
        const first = await readNative(request, root + '/fields?limit=2', zPageFieldDefinition);
        expect(first.items).toHaveLength(2);
        expect(first.nextCursor).toBeTruthy();
        const second = await readNative(request, root + '/fields?limit=2&cursor=' + encodeURIComponent(first.nextCursor!), zPageFieldDefinition);
        expect(second.items).toHaveLength(2);
        expect(second.items.every(v => !first.items.some(a => a.id === v.id))).toBe(true);
    }, "mcp");
    const textId = ids.get('text')!, numberId = ids.get('number')!, choiceId = ids.get('choice')!;
    const text = { key: 'field_text', name: 'Field text', kind: 'text', required: false, retired: false, defaultValue: null };
    await useCase('UC-CFG-0038', async () => {
        const saved = await saveNative(request, root + '/fields/' + textId, { ...text, name: 'نص محدث', expectedRevision: config.revision }, zSavedFieldSaved);
        config = saved.result.configuration;
        expect(saved.result.field.name).toBe('نص محدث');
    }, "mcp");
    text.name = 'نص محدث';
    await useCase('UC-CFG-0039', async () => {
        const saved = await saveNative(request, root + '/fields/' + textId, { ...text, expectedRevision: config.revision, defaultValue: { kind: 'text', text: 'قيمة افتراضية' } }, zSavedFieldSaved);
        config = saved.result.configuration;
        expect(saved.result.field.defaultValue).toEqual({ kind: 'text', text: 'قيمة افتراضية' });
    }, "mcp");
    await useCase('UC-CFG-0068', async () => {
        await rejectNative(await callNative(request, "POST", apiOrigin + root + '/fields/' + textId + '/backfill', { expectedRevision: config.revision, limit: 1 }, "owner"), "validation_failed", /native issue model/i);
    }, "mcp");
    await useCase('UC-CFG-0040', async () => {
        const saved = await saveNative(request, root + '/fields/' + textId, { ...text, expectedRevision: config.revision }, zSavedFieldSaved);
        config = saved.result.configuration;
        expect(saved.result.field.defaultValue).toBeNull();
    }, "mcp");
    for (const [caseId, fieldId, patch, message] of [
        ['UC-CFG-0041', textId, { key: 'rename' }, /stable key/i],
        ['UC-CFG-0044', textId, { defaultValue: { kind: 'number', number: '2' } }, /kind/i],
        ['UC-CFG-0047', textId, { required: true, defaultValue: { kind: 'text', text: '   ' } }, /content/i],
        ['UC-CFG-0048', textId, { required: true }, /native/i],
    ] as const) {
        await useCase(caseId, async () => {
            const response = await callNative(request, "PUT", apiOrigin + root + '/fields/' + fieldId, { ...text, expectedRevision: config.revision, ...patch }, "owner");
            await rejectNative(response, "validation_failed", message);
        }, "mcp");
    }
    await useCase('UC-CFG-0042', async () => {
        const saved = await saveNative(request, root + '/fields/' + numberId, { expectedRevision: config.revision, key: 'field_number', name: 'Field number', kind: 'date', required: false, retired: false, defaultValue: null }, zSavedFieldSaved);
        config = saved.result.configuration;
        expect(saved.result.field.kind).toBe('date');
    }, "mcp");
    const optionId = crypto.randomUUID(), secondOption = crypto.randomUUID();
    await useCase('UC-CFG-0057', async () => {
        const saved = await saveNative(request, root + '/fields/' + choiceId + '/options/' + optionId, { expectedRevision: config.revision, name: 'الخيار الأول', position: '9007199254740993', retired: false }, zSavedFieldOptionSaved, {});
        config = saved.result.configuration;
        expect(saved.result.option.name).toBe('الخيار الأول');
        expect(saved.result.option.fieldId).toBe(choiceId);
    }, "mcp");
    await useCase('UC-CFG-0058', async () => {
        const saved = await saveNative(request, root + '/fields/' + choiceId + '/options/' + optionId, { expectedRevision: config.revision, name: 'الخيار المعدل', position: '9007199254740993', retired: false }, zSavedFieldOptionSaved);
        config = saved.result.configuration;
        expect(saved.result.option.name).toBe('الخيار المعدل');
    }, "mcp");
    await useCase('UC-CFG-0059', async () => {
        const saved = await saveNative(request, root + '/fields/' + choiceId + '/options/' + optionId, { expectedRevision: config.revision, name: 'الخيار المعدل', position: '9007199254740995', retired: false }, zSavedFieldOptionSaved);
        config = saved.result.configuration;
        expect(saved.result.option.position).toBe('9007199254740995');
    }, "mcp");
    const extra = await saveNative(request, root + '/fields/' + choiceId + '/options/' + secondOption, { expectedRevision: config.revision, name: 'Another option', position: '9007199254740997', retired: false }, zSavedFieldOptionSaved, {});
    config = extra.result.configuration;
    await useCase('UC-CFG-0055', async () => {
        const list = await readNative(request, root + '/fields/' + choiceId + '/options', zPageFieldOptionView);
        expect(list.items.map(v => v.id)).toEqual([optionId, secondOption]);
    }, "mcp");
    await useCase('UC-CFG-0056', async () => {
        const first = await readNative(request, root + '/fields/' + choiceId + '/options?limit=1', zPageFieldOptionView);
        expect(first.items[0]?.id).toBe(optionId);
        expect(first.nextCursor).toBeTruthy();
        const next = await readNative(request, root + '/fields/' + choiceId + '/options?limit=1&cursor=' + encodeURIComponent(first.nextCursor!), zPageFieldOptionView);
        expect(next.items[0]?.id).toBe(secondOption);
    }, "mcp");
    await useCase('UC-CFG-0043', async () => {
        const response = await callNative(request, "PUT", apiOrigin + root + '/fields/' + choiceId, { expectedRevision: config.revision, key: 'field_choice', name: 'Field choice', kind: 'text', required: false, retired: false, defaultValue: null }, "owner");
        await rejectNative(response, "validation_failed", /value kind/i);
    }, "mcp");
    await useCase('UC-CFG-0061', async () => {
        const field = { key: 'field_choice', name: 'Field choice', kind: 'choice', required: false, retired: false };
        config = (await saveNative(request, root + '/fields/' + choiceId, { ...field, expectedRevision: config.revision, defaultValue: { kind: 'choice', optionId } }, zSavedFieldSaved)).result.configuration;
        await rejectNative(await callNative(request, "PUT", apiOrigin + root + '/fields/' + choiceId + '/options/' + optionId, { expectedRevision: config.revision, name: 'الخيار المعدل', position: '9007199254740995', retired: true }, "owner"), "validation_failed", /default option/i);
        expect((await readNative(request, root + '/fields/' + choiceId + '/options', zPageFieldOptionView)).items.find(option => option.id === optionId)?.retired).toBe(false);
        config = (await saveNative(request, root + '/fields/' + choiceId, { ...field, expectedRevision: config.revision, defaultValue: null }, zSavedFieldSaved)).result.configuration;
    }, "mcp");
    await useCase('UC-CFG-0060', async () => {
        const saved = await saveNative(request, root + '/fields/' + choiceId + '/options/' + optionId, { expectedRevision: config.revision, name: 'الخيار المعدل', position: '9007199254740995', retired: true }, zSavedFieldOptionSaved);
        config = saved.result.configuration;
        expect(saved.result.option.retired).toBe(true);
        expect((await readNative(request, root + '/fields/' + choiceId + '/options', zPageFieldOptionView)).items.map(v => v.id)).not.toContain(optionId);
    }, "mcp");
    await useCase('UC-CFG-0045', async () => {
        const response = await callNative(request, "PUT", apiOrigin + root + '/fields/' + choiceId, { expectedRevision: config.revision, key: 'field_choice', name: 'Field choice', kind: 'choice', required: false, retired: false, defaultValue: { kind: 'choice', optionId } }, "owner");
        await rejectNative(response, "validation_failed", /active option/i);
    }, "mcp");
    await useCase('UC-CFG-0062', async () => {
        const saved = await saveNative(request, root + '/fields/' + choiceId + '/options/' + optionId, { expectedRevision: config.revision, name: 'الخيار المعدل', position: '9007199254740995', retired: false }, zSavedFieldOptionSaved);
        config = saved.result.configuration;
        expect(saved.result.option.retired).toBe(false);
    }, "mcp");
    await useCase('UC-CFG-0063', async () => {
        const response = await callNative(request, "PUT", apiOrigin + root + '/fields/' + textId + '/options/' + crypto.randomUUID(), { expectedRevision: config.revision, name: 'Invalid option', position: '1', retired: false }, "owner");
        await rejectNative(response, "validation_failed", /choice/i);
    }, "mcp");
    await useCase('UC-CFG-0064', async () => {
        const response = await callNative(request, "PUT", apiOrigin + root + '/fields/' + choiceId + '/options/' + crypto.randomUUID(), { expectedRevision: config.revision, name: '', position: '0', retired: false }, "owner");
        await rejectNative(response, "validation_failed");
    }, "mcp");
    await useCase('UC-CFG-0046', async () => {
        await saveNative(request, '/api/v1/projects/' + projectId + '/memberships/' + viewerId + '/remove', { expectedRevision: '1' }, zSavedMembershipView, { method: 'POST' });
        const response = await callNative(request, "PUT", apiOrigin + root + '/fields/' + ids.get('user'), { expectedRevision: config.revision, key: 'field_user', name: 'Field user', kind: 'user', required: false, retired: false, defaultValue: { kind: 'user', userId: viewerId } }, "owner");
        await rejectNative(response, "validation_failed", /active project member|administrator/i);
    }, "mcp");
    await useCase('UC-CFG-0054', async () => {
        const saved = await saveNative(request, root + '/fields/' + textId, { ...text, expectedRevision: config.revision, retired: true }, zSavedFieldSaved);
        config = saved.result.configuration;
        expect(saved.result.field.retired).toBe(true);
        expect((await readNative(request, root + '/fields', zPageFieldDefinition)).items.map(v => v.id)).not.toContain(textId);
    }, "mcp");
});
test('MCP activation uses an explicit unchanged readiness snapshot before enabling current defaults', async ({ request }) => {
    const projectId = await isolatedProject(request), root = '/api/v2/projects/' + projectId;
    let readiness = await readNative(request, root + '/configuration/activation', zActivationReadiness);
    await useCase('UC-CFG-0076', async () => {
        expect(readiness.configuration.mode).toBe('legacy');
        expect(readiness.ready).toBe(true);
        expect(readiness.defaultBoardId).toMatch(/^[a-f0-9-]{36}$/);
        expect(readiness.problems).toEqual([]);
    }, "mcp");
    const body = { expectedRevision: readiness.configuration.revision, expectedProjectRevision: readiness.projectRevision, expectedBoardId: readiness.defaultBoardId, expectedBoardRevision: readiness.defaultBoardRevision, confirm: true };
    await useCase('UC-CFG-0030', async () => {
        const priorities = await readNative(request, root + '/priorities', zPagePriorityView);
        const differentPriority = priorities.items.find(v => v.id !== readiness.configuration.defaults.priorityId)!;
        const response = await callNative(request, "PUT", apiOrigin + root + '/configuration/defaults', { expectedRevision: readiness.configuration.revision, defaults: { ...readiness.configuration.defaults, priorityId: differentPriority.id } }, "owner");
        await rejectNative(response, "validation_failed", /modern issue access/i);
    }, "mcp");
    await useCase('UC-CFG-0085', async () => {
        const response = await callNative(request, "POST", apiOrigin + root + '/configuration/activation', { ...body, confirm: false }, "owner");
        await rejectNative(response, "validation_failed", /confirm/i);
    }, "mcp");
    await useCase('UC-CFG-0086', async () => {
        const response = await callNative(request, "POST", apiOrigin + root + '/configuration/activation', { ...body, expectedProjectRevision: '9999' }, "owner");
        const failure = await rejectNative(response, 'conflict');
        expect((await readNative(request, root + '/configuration', zConfigurationView)).mode).toBe('legacy');
    }, "mcp");
    await useCase('UC-CFG-0084', async () => {
        const saved = await saveNative(request, root + '/configuration/activation', body, zSavedConfigurationView, { method: 'POST' });
        expect(saved.result.mode).toBe('modern');
        expect(saved.receipt.eventId).toBeTruthy();
    }, "mcp");
    readiness = await readNative(request, root + '/configuration/activation', zActivationReadiness);
    await useCase('UC-CFG-0088', async () => {
        const saved = await saveNative(request, root + '/configuration/activation', { ...body, expectedRevision: readiness.configuration.revision, expectedProjectRevision: readiness.projectRevision, expectedBoardRevision: readiness.defaultBoardRevision }, zSavedConfigurationView, { method: 'POST' });
        expect(saved.result.mode).toBe('modern');
        expect(saved.result.revision).toBe(readiness.configuration.revision);
        expect(saved.receipt.eventId).toBeNull();
    }, "mcp");
    await useCase('UC-CFG-0028', async () => {
        const priorities = await readNative(request, root + '/priorities', zPagePriorityView);
        const replacement = priorities.items.find(v => !v.default)!;
        const saved = await saveNative(request, root + '/configuration/defaults', { expectedRevision: readiness.configuration.revision, defaults: { ...readiness.configuration.defaults, priorityId: replacement.id } }, zSavedConfigurationView);
        expect(saved.result.defaults.priorityId).toBe(replacement.id);
    }, "mcp");
});
test('MCP required fields must backfill current issues before enforcement and cannot retire while required', async ({ request }) => {
    const projectId = await isolatedProject(request);
    await useModernIssues(projectId);
    const root = '/api/v2/projects/' + projectId;
    const issueIds: string[] = [];
    for (let n = 0; n < 3; n++)
        issueIds.push((await saveNative(request, root + '/issues', { title: 'Backfill target ' + n }, zSavedModernIssueView, { method: 'POST' })).result.summary.id);
    let config = await readNative(request, root + '/configuration', zConfigurationView);
    const fieldId = crypto.randomUUID(), field = { key: 'readiness', name: 'Readiness evidence', kind: 'text', required: false, retired: false, defaultValue: { kind: 'text', text: 'مطلوب التحقق' } };
    config = (await saveNative(request, root + '/fields/' + fieldId, { ...field, expectedRevision: config.revision }, zSavedFieldSaved, {})).result.configuration;
    await useCase('UC-CFG-0049', async () => {
        await rejectNative(await callNative(request, "PUT", apiOrigin + root + '/fields/' + fieldId, { ...field, expectedRevision: config.revision, required: true }, "owner"), "validation_failed", /backfill/i);
    }, "mcp");
    await useCase('UC-CFG-0067', async () => {
        for (const limit of [0, 101])
            await rejectNative(await callNative(request, "POST", apiOrigin + root + '/fields/' + fieldId + '/backfill', { expectedRevision: config.revision, limit }, "owner"), "validation_failed");
    }, "mcp");
    await useCase('UC-CFG-0065', async () => {
        const batch = await saveNative(request, root + '/fields/' + fieldId + '/backfill', { expectedRevision: config.revision, limit: 1 }, zSavedBackfillFieldResult, { method: 'POST' });
        config = batch.result.configuration;
        expect(batch.result.changed).toBe(1);
        expect(batch.result.remaining).toBe(2n);
    }, "mcp");
    await useCase('UC-CFG-0066', async () => {
        let remaining = 2n;
        while (remaining > 0n) {
            const batch = await saveNative(request, root + '/fields/' + fieldId + '/backfill', { expectedRevision: config.revision, limit: 1 }, zSavedBackfillFieldResult, { method: 'POST' });
            config = batch.result.configuration;
            expect(batch.result.changed).toBe(1);
            expect(batch.result.remaining).toBe(remaining - 1n);
            remaining = batch.result.remaining;
        }
        for (const issueId of issueIds)
            expect((await readNative(request, '/api/v2/issues/' + issueId + '/custom-fields', zCustomFieldsView, 'member')).values.find(v => v.fieldId === fieldId)?.value).toEqual(field.defaultValue);
    }, "mcp");
    await useCase('UC-CFG-0050', async () => {
        const saved = await saveNative(request, root + '/fields/' + fieldId, { ...field, expectedRevision: config.revision, required: true }, zSavedFieldSaved);
        config = saved.result.configuration;
        expect(saved.result.field.required).toBe(true);
    }, "mcp");
    await useCase('UC-CFG-0052', async () => {
        await rejectNative(await callNative(request, "PUT", apiOrigin + root + '/fields/' + fieldId, { ...field, expectedRevision: config.revision, required: true, retired: true }, "owner"), "validation_failed", /requirement|retire|valid field/i);
    }, "mcp");
    await useCase('UC-CFG-0051', async () => {
        const saved = await saveNative(request, root + '/fields/' + fieldId, { ...field, expectedRevision: config.revision, required: false }, zSavedFieldSaved);
        config = saved.result.configuration;
        expect(saved.result.field.required).toBe(false);
    }, "mcp");
    await useCase('UC-CFG-0069', async () => {
        const response = await callNative(request, "PUT", apiOrigin + root + '/fields/' + fieldId, { ...field, expectedRevision: '1' }, "owner");
        const failure = await rejectNative(response, 'conflict');
        expect(zConfigurationView.parse(failure.current).revision).toBe(config.revision);
    }, "mcp");
});
test('MCP default taxonomy retirement requires eligible matching replacements and keeps used behavior stable', async ({ request }) => {
    const projectId = await isolatedProject(request);
    await useModernIssues(projectId);
    const root = '/api/v2/projects/' + projectId;
    const issue = (await saveNative(request, root + '/issues', { title: 'Retained typed issue' }, zSavedModernIssueView, { method: 'POST' })).result;
    let config = await readNative(request, root + '/configuration', zConfigurationView);
    const types = await readNative(request, root + '/issue-types', zPageTypeView), priorities = await readNative(request, root + '/priorities', zPagePriorityView);
    const standard = types.items.find(v => v.id === config.defaults.standardTypeId)!, priority = priorities.items.find(v => v.id === config.defaults.priorityId)!;
    const typeBody = { expectedRevision: config.revision, key: standard.key, name: standard.name, behavior: standard.behavior, retired: true };
    await useCase('UC-CFG-0011', async () => {
        await rejectNative(await callNative(request, "PUT", apiOrigin + root + '/issue-types/' + standard.id, typeBody, "owner"), "validation_failed", /replacement/i);
    }, "mcp");
    await useCase('UC-CFG-0012', async () => {
        await rejectNative(await callNative(request, "PUT", apiOrigin + root + '/issue-types/' + standard.id, { ...typeBody, replacementDefaultId: config.defaults.subtaskTypeId }, "owner"), "validation_failed", /behavior|matching/i);
    }, "mcp");
    await useCase('UC-CFG-0015', async () => {
        await rejectNative(await callNative(request, "PUT", apiOrigin + root + '/issue-types/' + standard.id, { ...typeBody, retired: false, behavior: 'subtask' }, "owner"), "validation_failed", /behavior/i);
    }, "mcp");
    await useCase('UC-CFG-0026', async () => {
        await rejectNative(await callNative(request, "PUT", apiOrigin + root + '/priorities/' + priority.id, { expectedRevision: config.revision, key: priority.key, name: priority.name, sortOrder: priority.sortOrder, retired: true }, "owner"), "validation_failed", /replacement/i);
    }, "mcp");
    const replacementId = crypto.randomUUID();
    config = (await saveNative(request, root + '/issue-types/' + replacementId, { expectedRevision: config.revision, key: 'replacement', name: 'Replacement standard', behavior: 'standard', retired: false }, zSavedTypeSaved, {})).result.configuration;
    const binding = (await readNative(request, root + '/issue-types/' + standard.id + '/workflows', zPageBindingView)).items.find(v => v.default)!;
    config = (await saveNative(request, root + '/issue-types/' + replacementId + '/workflows/' + binding.workflowId, { expectedRevision: config.revision, default: true, acceptsNew: true }, zSavedConfigurationView)).result;
    await useCase('UC-CFG-0010', async () => {
        const saved = await saveNative(request, root + '/issue-types/' + standard.id, { ...typeBody, expectedRevision: config.revision, replacementDefaultId: replacementId }, zSavedTypeSaved);
        config = saved.result.configuration;
        expect(saved.result.type.retired).toBe(true);
        expect(config.defaults.standardTypeId).toBe(replacementId);
        expect((await readNative(request, '/api/v2/issues/' + issue.summary.id, zModernIssueView, 'member')).summary.type.id).toBe(standard.id);
    }, "mcp");
    await useCase('UC-CFG-0025', async () => {
        const replacement = priorities.items.find(v => !v.default)!;
        const saved = await saveNative(request, root + '/priorities/' + priority.id, { expectedRevision: config.revision, key: priority.key, name: priority.name, sortOrder: priority.sortOrder, retired: true, replacementDefaultId: replacement.id }, zSavedPrioritySaved);
        config = saved.result.configuration;
        expect(config.defaults.priorityId).toBe(replacement.id);
        expect(saved.result.priority.retired).toBe(true);
    }, "mcp");
    await useCase('UC-CFG-0029', async () => {
        await rejectNative(await callNative(request, "PUT", apiOrigin + root + '/configuration/defaults', { expectedRevision: config.revision, defaults: { ...config.defaults, priorityId: priority.id } }, "owner"), "validation_failed", /active priority/i);
    }, "mcp");
});
for (const [id, shape, message] of readinessCases)
    test('MCP readiness explains ' + shape + ' and rejects activation without mutating retained work', async ({ request }) => {
        const projectId = await isolatedProject(request);
        if (shape === 'canonical_references')
            await saveNative(request, '/api/v1/projects/' + projectId + '/issues', { title: 'Retained pre-cutover issue' }, zSavedIssueView, { method: 'POST', role: 'member' });
        const restore = await readinessFixture(projectId, shape);
        try {
            const review = await useCase(id, async () => {
                const data = await readNative(request, '/api/v2/projects/' + projectId + '/configuration/activation', zActivationReadiness);
                expect(data.ready).toBe(false);
                expect(data.problems).toContainEqual({ code: shape, message });
                expect(data.configuration.mode).toBe('legacy');
                return data;
            }, 'mcp');
            if (shape === 'default_filters')
                await useCase('UC-CFG-0087', async () => {
                    await rejectNative(await callNative(request, 'POST', '/api/v2/projects/' + projectId + '/configuration/activation', { expectedRevision: review.configuration.revision, expectedProjectRevision: review.projectRevision, expectedBoardId: review.defaultBoardId, expectedBoardRevision: review.defaultBoardRevision, confirm: true }), 'validation_failed', /Resolve the readiness problems/);
                    const current = await readNative(request, '/api/v2/projects/' + projectId + '/configuration', zConfigurationView);
                    expect(current.mode).toBe('legacy');
                    expect(current.revision).toBe(review.configuration.revision);
                }, 'mcp');
        }
        finally {
            await restore();
        }
    });
test('MCP field retirement respects actual active transition requirements', async ({ request }) => {
    const projectId = await isolatedProject(request);
    await useModernIssues(projectId);
    const root = '/api/v2/projects/' + projectId, fieldId = crypto.randomUUID();
    let config = await readNative(request, root + '/configuration', zConfigurationView);
    const field = { key: 'release_evidence', name: 'Release evidence', kind: 'text', required: false, retired: false, defaultValue: null };
    config = (await saveNative(request, root + '/fields/' + fieldId, { ...field, expectedRevision: config.revision }, zSavedFieldSaved)).result.configuration;
    const workflow = (await readNative(request, root + '/workflows', zPageWorkflowView)).items[0]!, transition = (await readNative(request, root + '/workflows/' + workflow.id + '/transitions', zPageTransitionView)).items[0]!;
    const policy = { requiredSystemFields: [], requiredFieldIds: [fieldId], approvalsRequired: 0, approverRole: null, excludeIssueReporter: false };
    const policySaved = await saveNative(request, root + '/workflows/' + workflow.id + '/transitions/' + transition.id + '/policy', { expectedRevision: config.revision, policy }, zSavedTransitionPolicyView);
    config = policySaved.result.configuration;
    await useCase('UC-CFG-0053', async () => {
        await rejectNative(await callNative(request, 'PUT', root + '/fields/' + fieldId, { ...field, expectedRevision: config.revision, retired: true }), 'validation_failed', /Remove active transition requirements/);
        expect((await readNative(request, root + '/configuration', zConfigurationView)).revision).toBe(config.revision);
        expect((await readNative(request, root + '/fields', zPageFieldDefinition)).items.find(value => value.id === fieldId)?.retired).toBe(false);
        expect((await readNative(request, root + '/workflows/' + workflow.id + '/transitions/' + transition.id + '/policy', zTransitionPolicyView)).policy.requiredFieldIds).toEqual([fieldId]);
    }, 'mcp');
});
for (const channel of ['rest', 'mcp'] as const)
    test(channel + ' configuration service rejects stale state and replays accepted commands exactly once', async ({ request }) => {
        const projectId = await isolatedProject(request), root = '/api/v2/projects/' + projectId;
        const success = channel === 'mcp' ? mcpSuccess : restSuccess, failure = channel === 'mcp' ? async (request: APIRequestContext, name: string, args: object) => {
            const reply = await callTool(request, name, args);
            return rejectNative(reply, 'conflict');
        } : async (request: APIRequestContext, name: string, args: object) => restFailure(request, name, args, zConfigurationFailureBody, 'conflict');
        const config = await success(request, 'get_project_configuration', { projectId }, zConfigurationView), typeId = crypto.randomUUID();
        const body = { projectId, typeId, expectedRevision: config.revision, key: 'replayed_story', name: 'One accepted story', behavior: 'standard', retired: false, retryReference: crypto.randomUUID() };
        const first = await success(request, 'save_issue_type', body, zSavedTypeSaved);
        await useCase('UC-CFG-0090', async () => {
            const replay = await success(request, 'save_issue_type', body, zSavedTypeSaved);
            expect(replay.result).toEqual(first.result);
            expect(replay.receipt).toMatchObject({ replayed: true, eventId: first.receipt.eventId });
            expect((await success(request, 'list_issue_types', { projectId, includeRetired: true }, zPageTypeView)).items.filter(value => value.id === typeId)).toHaveLength(1);
        }, channel);
        await useCase('UC-CFG-0089', async () => {
            const rejected = await failure(request, 'save_issue_type', { ...body, expectedRevision: config.revision, name: 'Stale overwrite', retryReference: crypto.randomUUID() });
            expect(rejected.current?.revision).toBe(first.result.configuration.revision);
            expect((await success(request, 'list_issue_types', { projectId, includeRetired: true }, zPageTypeView)).items.find(value => value.id === typeId)?.name).toBe('One accepted story');
        }, channel);
    });
