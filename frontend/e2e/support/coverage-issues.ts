import { expect, type APIRequestContext } from '@playwright/test';
import { apiOrigin, token } from './session';
import { isolatedProject, useModernIssues } from './project';
import {
  zConfigurationView,
  zCustomFieldsView,
  zModernIssueView,
  zSavedFieldSaved,
  zSavedModernIssueView,
  zSavedCommentView,
} from '../../src/app/api/generated/zod.gen';
import type { FieldDefinition, ModernCreateFields } from '../../src/app/api/generated/types.gen';

export async function coverageHeaders(role = 'member', reference = crypto.randomUUID()) {
  return { Authorization: 'Bearer ' + (await token(role)), 'Idempotency-Key': reference };
}
export async function coverageProject(request: APIRequestContext) {
  const projectId = await isolatedProject(request);
  await useModernIssues(projectId);
  return projectId;
}
export async function coverageCreate(
  request: APIRequestContext,
  projectId: string,
  fields: Partial<ModernCreateFields> = {},
) {
  const response = await request.post(`${apiOrigin}/api/v2/projects/${projectId}/issues`, {
    headers: await coverageHeaders(),
    data: { title: 'Coverage issue ' + crypto.randomUUID().slice(0, 8), ...fields },
  });
  expect(response.status()).toBe(201);
  return zSavedModernIssueView.parse(await response.json()).result;
}
export async function coverageRead(request: APIRequestContext, issueId: string) {
  const response = await request.get(`${apiOrigin}/api/v2/issues/${issueId}`, {
    headers: await coverageHeaders(),
  });
  expect(response.status()).toBe(200);
  return zModernIssueView.parse(await response.json());
}
export async function coverageFields(request: APIRequestContext, issueId: string) {
  const response = await request.get(`${apiOrigin}/api/v2/issues/${issueId}/custom-fields`, {
    headers: await coverageHeaders(),
  });
  expect(response.status()).toBe(200);
  return zCustomFieldsView.parse(await response.json());
}
export async function coverageDefinition(
  request: APIRequestContext,
  projectId: string,
  definition: Pick<FieldDefinition, 'kind'> & Partial<FieldDefinition>,
) {
  const root = await request.get(`${apiOrigin}/api/v2/projects/${projectId}/configuration`, {
    headers: await coverageHeaders('owner'),
  });
  expect(root.status()).toBe(200);
  const cfg = zConfigurationView.parse(await root.json());
  const id = definition.id ?? crypto.randomUUID();
  const response = await request.put(`${apiOrigin}/api/v2/projects/${projectId}/fields/${id}`, {
    headers: await coverageHeaders('owner'),
    data: {
      expectedRevision: cfg.revision,
      key: definition.key ?? 'f' + id.replaceAll('-', '').slice(0, 20),
      name: definition.name ?? 'Field ' + id.slice(0, 8),
      kind: definition.kind,
      required: definition.required ?? false,
      retired: definition.retired ?? false,
      defaultValue: definition.defaultValue ?? null,
    },
  });
  expect([200, 201]).toContain(response.status());
  return zSavedFieldSaved.parse(await response.json()).result.field;
}
export async function coverageComment(request: APIRequestContext, issueId: string, html: string) {
  const response = await request.post(`${apiOrigin}/api/v1/issues/${issueId}/comments`, {
    headers: await coverageHeaders(),
    data: { body: { html, mentionUserIds: [], pictureIds: [] } },
  });
  expect(response.status()).toBe(201);
  return zSavedCommentView.parse(await response.json()).result;
}

// Only malformed-reference fixtures need states that the public administrator API refuses to create.
export async function coverageIneligiblePeople(projectId: string) {
  const database = process.env['GATEGOLD_E2E_DATABASE_NAME'];
  if (!database || !/^gg_browser_[0-9a-f]{32}$/.test(database) || !/^[0-9a-f-]{36}$/.test(projectId))
    throw new Error('Ineligible people fixtures require a disposable browser database.');
  const unapproved = crypto.randomUUID();
  const disabled = '10000000-0000-4000-8000-000000000004';
  const sql = `INSERT INTO users(id,email,email_key,display_name,approved_at) VALUES('${unapproved}','${unapproved}@example.test','${unapproved}@example.test','Unapproved field fixture',NULL); INSERT INTO project_memberships(project_id,user_id,role) VALUES('${projectId}','${unapproved}','viewer'),('${projectId}','${disabled}','viewer');`;
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const { resolve } = await import('node:path');
  await promisify(execFile)('docker', ['compose', '-f', resolve('../compose.dev.yaml'), 'exec', '-T', 'postgres', 'psql', '--username=gategoldjira', '--dbname=' + database, '-v', 'ON_ERROR_STOP=1', '-c', sql]);
  return { unapproved, disabled };
}

export async function coverageOfficeFile(kind: 'docx' | 'xlsx') {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const program = `import base64,io,sys,zipfile
kind=sys.argv[1]
package='http://schemas.openxmlformats.org/package/2006'
office='http://schemas.openxmlformats.org/officeDocument/2006/relationships'
manifest='<Types xmlns="'+package+'/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
files={}
if kind=='docx':
 main='word/document.xml'
 manifest+='<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
 files[main]='<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Attachment acceptance العربية</w:t></w:r></w:p></w:body></w:document>'
else:
 main='xl/workbook.xml'
 manifest+='<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
 files[main]='<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="'+office+'"><sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets></workbook>'
 files['xl/_rels/workbook.xml.rels']='<Relationships xmlns="'+package+'/relationships"><Relationship Id="rId1" Type="'+office+'/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'
 files['xl/worksheets/sheet1.xml']='<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Attachment acceptance العربية</t></is></c></row></sheetData></worksheet>'
files['[Content_Types].xml']=manifest+'</Types>'
files['_rels/.rels']='<Relationships xmlns="'+package+'/relationships"><Relationship Id="rId1" Type="'+office+'/officeDocument" Target="'+main+'"/></Relationships>'
buffer=io.BytesIO()
with zipfile.ZipFile(buffer,'w',zipfile.ZIP_DEFLATED) as archive:
 for name,body in files.items(): archive.writestr(name,body.encode('utf-8'))
sys.stdout.write(base64.b64encode(buffer.getvalue()).decode('ascii'))`;
  const result = await promisify(execFile)('python3', ['-c', program, kind]);
  return Buffer.from(result.stdout.trim(), 'base64');
}

export async function coverageExpireUpload(projectId: string, assetId: string) {
  const database = process.env['GATEGOLD_E2E_DATABASE_NAME'];
  if (!database || !/^gg_browser_[0-9a-f]{32}$/.test(database) || ![projectId, assetId].every(id => /^[0-9a-f-]{36}$/.test(id)))
    throw new Error('Expiry fixtures require an isolated browser project and upload.');
  const { execFile } = await import('node:child_process'); const { promisify } = await import('node:util'); const { resolve } = await import('node:path');
  await promisify(execFile)('docker', ['compose', '-f', resolve('../compose.dev.yaml'), 'exec', '-T', 'postgres', 'psql', '--username=gategoldjira', '--dbname=' + database, '-v', 'ON_ERROR_STOP=1', '-c', `UPDATE asset_upload_reservations SET state='expired' WHERE project_id='${projectId}' AND asset_id='${assetId}' AND state='uploading';`]);
}

export async function coverageStoredChanges(issueId: string, eventId: string) {
  const database = process.env['GATEGOLD_E2E_DATABASE_NAME'];
  if (!database || !/^gg_browser_[0-9a-f]{32}$/.test(database) || ![issueId, eventId].every(id => /^[0-9a-f-]{36}$/.test(id)))
    throw new Error('Retained audit verification requires an isolated issue event.');
  const { execFile } = await import('node:child_process'); const { promisify } = await import('node:util'); const { resolve } = await import('node:path');
  const result = await promisify(execFile)('docker', ['compose', '-f', resolve('../compose.dev.yaml'), 'exec', '-T', 'postgres', 'psql', '--username=gategoldjira', '--dbname=' + database, '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', `SELECT changes::text FROM activity_events WHERE issue_id='${issueId}' AND id='${eventId}';`]);
  const { z } = await import('zod'); const { zFieldChange } = await import('../../src/app/api/generated/zod.gen');
  const raw: unknown = JSON.parse(result.stdout.trim());
  return z.object({ version: z.literal(1), fields: z.array(zFieldChange) }).parse(raw);
}
