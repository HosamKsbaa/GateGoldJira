import { expect } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { z } from 'zod';
import { test } from './support/browser-test';
import { useCase } from './support/use-case';
import { LocalAuthServer } from './support/isolated-local-identity';
import { localFixturesAvailable } from './support/session';
import { save, ownerId } from './support/coverage-access';
import { zSavedProjectView, zFailureBody } from '../src/app/api/generated/zod.gen';
test.skip(!localFixturesAvailable, 'Requires a captured local Go server and disposable PostgreSQL.');
test.use({ trace: 'off' });
test('configured real maintenance denies missing credentials through REST and operator curl without running cleanup', async ({ request }, info) => {
    const database = process.env['GATEGOLD_E2E_DATABASE_NAME'];
    if (!database || !/^gg_browser_[0-9a-f]{32}$/.test(database))
        throw new Error('Maintenance probes require the exact disposable database.');
    const reference = crypto.randomUUID();
    z.uuid().parse(reference);
    const key = ('Q' + crypto.randomUUID().replaceAll('-', '').slice(0, 8)).toUpperCase();
    await save(request, '/api/v1/projects', { key, name: 'Owned maintenance no-run sentinel ' + key }, zSavedProjectView, { method: 'POST', status: 201, reference });
    const run = async (sql: string) => {
        const result = await promisify(execFile)('docker', ['compose', '-f', resolve('../compose.dev.yaml'), 'exec', '-T', 'postgres', 'psql', '--username=gategoldjira', '--dbname=' + database, '-v', 'ON_ERROR_STOP=1', '-A', '-t', '-c', sql]);
        return result.stdout.trim();
    };
    const condition = "actor_id='" + ownerId + "' AND retry_reference='" + reference + "' AND operation='create_project'";
    const timestamps = z.object({createdAt:z.iso.datetime({offset:true}),expiresAt:z.iso.datetime({offset:true})}).strict();
    const currentTimestamps = async () => timestamps.parse(JSON.parse(await run('SELECT json_build_object(\'createdAt\',created_at,\'expiresAt\',expires_at) FROM idempotency_records WHERE ' + condition + ';')));
    const original = await currentTimestamps();
    expect(await run('SELECT cleanup_paused FROM company_settings WHERE singleton=true;')).toBe('f');
    const sentinel = async () => {
        expect(await run('SELECT count(*) FROM idempotency_records WHERE ' + condition + " AND created_at='1969-12-30T00:00:00Z'::timestamptz AND expires_at='1970-01-01T00:00:00Z'::timestamptz AND expires_at>=created_at+interval '48 hours' AND expires_at<now();")).toBe('1');
    };
    const server = new LocalAuthServer(info);
    try {
        // Preserve the real >=48h retry-retention CHECK. Only this owned receipt's
        // two clock fields move together, with exact microsecond timestamps saved
        // for restoration; no constraint, trigger or business payload is changed.
        expect(await run("UPDATE idempotency_records SET created_at='1969-12-30T00:00:00Z',expires_at='1970-01-01T00:00:00Z' WHERE " + condition + ';')).toBe('UPDATE 1');
        await sentinel();
        await server.prepare();
        await server.start({ maintenanceWithoutCredentialProbe: true });
        await useCase('UC-SYS-0029', async () => {
            const response = await request.post(server.origin + '/internal/maintenance/pictures');
            expect(response.status()).toBe(401);
            expect(zFailureBody.parse(await response.json()).error).toMatchObject({ code: 'authentication_required', nextAction: 'sign_in', retryable: false, fieldErrors: [] });
            await sentinel();
        }, 'rest');
        await useCase('UC-SYS-0029', async () => {
            const result = await promisify(execFile)('curl', ['--silent', '--show-error', '--output', '/dev/null', '--write-out', '%{http_code}', '--request', 'POST', server.origin + '/internal/maintenance/pictures']);
            expect(result.stdout).toBe('401');
            await sentinel();
        }, 'operator');
    }
    finally {
        try { await server.stop(); }
        finally {
            expect(await run("UPDATE idempotency_records SET created_at='" + original.createdAt + "'::timestamptz,expires_at='" + original.expiresAt + "'::timestamptz WHERE " + condition + ';')).toBe('UPDATE 1');
            expect(await currentTimestamps()).toEqual(original);
        }
    }
});
