import { expect } from '@playwright/test';
import { test } from './support/browser-test';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { apiOrigin, localFixturesAvailable, token } from './support/session';
import {
  zSavedProjectView,
  zSavedUserView,
  zSavedMembershipView,
} from '../src/app/api/generated/zod.gen';

test.skip(
  !localFixturesAvailable,
  'Use the isolated local browser runner; these accounts are preparation, not human usability results.',
);
test('prepare ten approved employee fixtures and roles for the timed study', async ({
  request,
}) => {
  const headers = {
    Authorization: 'Bearer ' + (await token('owner')),
    'Idempotency-Key': crypto.randomUUID(),
  };
  const created = await request.post(apiOrigin + '/api/v1/projects', {
    headers,
    data: { key: 'UX' + Date.now().toString().slice(-7), name: 'مشروع تجربة الاستخدام' },
  });
  expect(created.status()).toBe(201);
  const rawProject: unknown = await created.json();
  const project = zSavedProjectView.parse(rawProject).result;
  const fixtures: { participant: string; userId: string; projectId: string; role: 'member' }[] = [];
  for (let i = 1; i <= 10; i++) {
    const participant = 'P' + String(i).padStart(2, '0');
    const approved = await request.post(apiOrigin + '/api/v1/admin/users', {
      headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() },
      data: {
        email: participant.toLowerCase() + '-' + project.id.slice(0, 8) + '@usability.example.test',
        displayName: 'مشارك ' + i,
        administrator: false,
      },
    });
    expect(approved.status()).toBe(201);
    const rawUser: unknown = await approved.json();
    const user = zSavedUserView.parse(rawUser).result;
    const membership = await request.put(
      apiOrigin + '/api/v1/projects/' + project.id + '/memberships/' + user.id,
      {
        headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() },
        data: { expectedRevision: '0', role: 'member' },
      },
    );
    expect(membership.status()).toBe(200);
    const rawMember: unknown = await membership.json();
    zSavedMembershipView.parse(rawMember);
    fixtures.push({ participant, userId: user.id, projectId: project.id, role: 'member' });
  }
  expect(fixtures).toHaveLength(10);
  const evidence = process.env['GATEGOLD_E2E_EVIDENCE'];
  if (evidence) {
    await mkdir(evidence, { recursive: true });
    await writeFile(
      join(evidence, 'usability-fixtures.json'),
      JSON.stringify(
        { environment: 'isolated local fixture only', humanSessionsRun: 0, fixtures },
        null,
        2,
      ) + '\n',
      { mode: 0o600 },
    );
  }
});
