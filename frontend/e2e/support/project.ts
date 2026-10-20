import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { expect, type APIRequestContext } from '@playwright/test';
import { apiOrigin, token } from './session';
import {
  zActivationReadiness,
  zSavedConfigurationView,
  zSavedProjectView,
} from '../../src/app/api/generated/zod.gen';
export async function isolatedProject(request: APIRequestContext): Promise<string> {
  const headers = {
    Authorization: 'Bearer ' + (await token('owner')),
    'Idempotency-Key': crypto.randomUUID(),
  };
  const response = await request.post(apiOrigin + '/api/v1/projects', {
    headers,
    data: {
      key: 'T' + crypto.randomUUID().replaceAll('-', '').slice(0, 7).toUpperCase(),
      name: 'Isolated workflow ' + crypto.randomUUID().slice(0, 8),
    },
  });
  expect(response.status()).toBe(201);
  const project = zSavedProjectView.parse(await response.json()).result;
  for (const [userId, role] of [
    ['10000000-0000-4000-8000-000000000002', 'member'],
    ['10000000-0000-4000-8000-000000000003', 'viewer'],
  ]) {
    const membership = await request.put(
      apiOrigin + '/api/v1/projects/' + project.id + '/memberships/' + userId,
      {
        headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() },
        data: { expectedRevision: '0', role },
      },
    );
    expect(membership.status()).toBe(200);
  }
  return project.id;
}

// Exercise the real administrator transition in disposable browser fixtures.
export async function useModernIssues(projectId: string): Promise<void> {
  const database = process.env['GATEGOLD_E2E_DATABASE_NAME'];
  if (
    !database ||
    !/^gg_browser_[0-9a-f]{32}$/.test(database) ||
    !/^[0-9a-f-]{36}$/.test(projectId)
  )
    throw new Error('Requires an isolated browser fixture database and project.');
  const headers = {
    Authorization: 'Bearer ' + (await token('owner')),
    'Content-Type': 'application/json',
  };
  const response = await fetch(
    apiOrigin + '/api/v2/projects/' + projectId + '/configuration/activation',
    { headers },
  );
  expect(response.status).toBe(200);
  const review = zActivationReadiness.parse(await response.json());
  expect(review.ready).toBe(true);
  const activated = await fetch(
    apiOrigin + '/api/v2/projects/' + projectId + '/configuration/activation',
    {
      method: 'POST',
      headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify({
        expectedRevision: review.configuration.revision,
        expectedProjectRevision: review.projectRevision,
        expectedBoardId: review.defaultBoardId,
        expectedBoardRevision: review.defaultBoardRevision,
        confirm: true,
      }),
    },
  );
  expect(activated.status).toBe(200);
  expect(zSavedConfigurationView.parse(await activated.json()).result.mode).toBe('modern');
}

export async function coverWorkflowInFixture(projectId: string, workflowId: string): Promise<void> {
  const database = process.env['GATEGOLD_E2E_DATABASE_NAME'];
  if (
    !database ||
    !/^gg_browser_[0-9a-f]{32}$/.test(database) ||
    ![projectId, workflowId].every(id => /^[0-9a-f-]{36}$/.test(id))
  )
    throw new Error('Requires an isolated browser fixture workflow.');
  const sql = `UPDATE boards b SET workflow=jsonb_set(b.workflow,'{columns}',(b.workflow->'columns')||(SELECT jsonb_agg(jsonb_build_object('status',s.legacy_status,'name',s.name,'allowedTargets',(SELECT jsonb_agg(t.legacy_status) FROM workflow_stages t WHERE t.workflow_id=s.workflow_id AND t.id<>s.id))) FROM workflow_stages s WHERE s.project_id='${projectId}' AND s.workflow_id='${workflowId}')) WHERE b.project_id='${projectId}' AND b.is_default; INSERT INTO board_column_stages(project_id,board_id,column_id,stage_id) SELECT s.project_id,b.id,c.id,s.id FROM workflow_stages s JOIN boards b ON b.project_id=s.project_id AND b.is_default JOIN board_columns c ON c.board_id=b.id AND c.legacy_status=s.category WHERE s.workflow_id='${workflowId}' ON CONFLICT(board_id,stage_id) DO NOTHING;`;
  await promisify(execFile)('docker', [
    'compose',
    '-f',
    resolve('../compose.dev.yaml'),
    'exec',
    '-T',
    'postgres',
    'psql',
    '--username=gategoldjira',
    '--dbname=' + database,
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    sql,
  ]);
}
