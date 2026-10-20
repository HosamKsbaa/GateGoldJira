// Public Angular model plus the actual AuthService/AssetsApi/resumable SDK.
// Fetch is an in-memory typed server; no browser/HTTP integration is claimed.
import '@angular/compiler';
import { provideZonelessChangeDetection, RendererFactory2, signal } from '@angular/core';
import { TestBed, TestComponentRenderer } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssetMetadata, AssetView, ConfigurationView, Me, ModernIssueView, TypeView, UploadSessionView } from '../../../../api/generated/types.gen';
import { zAppendUploadFields, zStartUploadFields } from '../../../../api/generated/zod.gen';
import { AuthService } from '../../../../core/auth/auth.service';
import { SIGN_IN, type SignInProvider } from '../../../../core/auth/sign-in.provider';
import { ConfigService } from '../../../../core/config/config.service';
import { DraftsService } from '../../../../core/drafts/drafts.service';
import { AssetsApi } from '../../../attachments/assets.api';
import { ProjectConfigurationApi } from '../../../projects/project-configuration.api';
import { ProjectWorkflowsApi } from '../../../projects/project-workflows.api';
import { IssuesApi } from '../../issues.api';
import { ModernIssuesApi } from '../../modern-issues.api';
import { ModernIssueFormComponent } from './modern-issue-form.component';

const projectId = '20000000-0000-4000-8000-000000000001';
const issueId = '50000000-0000-4000-8000-000000000001';
const standardId = '30000000-0000-4000-8000-000000000001';
const priorityId = '40000000-0000-4000-8000-000000000001';
const workflowId = '80000000-0000-4000-8000-000000000001';
const assetId = 'a0000000-0000-4000-8000-000000000001';
const sessionId = 'b0000000-0000-4000-8000-000000000001';
const person = (second = false): Me => ({ administrator: false, companyTimeZone: 'UTC', displayName: second ? 'Second account' : 'First account', email: second ? 'second@example.test' : 'first@example.test', userId: second ? '10000000-0000-4000-8000-000000000002' : '10000000-0000-4000-8000-000000000001' });
const issueType: TypeView = { id: standardId, projectId, key: 'task', name: 'Task', behavior: 'standard', retired: false, default: true };
const configuration: ConfigurationView = { projectId, revision: '1', mode: 'modern', canManage: false, defaults: { standardTypeId: standardId, subtaskTypeId: standardId, priorityId } };
function issue(): ModernIssueView {
  const actor = { id: person().userId, displayName: person().displayName };
  return { capabilities: ['read', 'edit'], description: '', descriptionFormat: 'plain', graphRevision: '1', links: [], reporter: actor, watching: false,
    summary: { id: issueId, projectId, key: 'GG-1', number: '1', title: 'Created first-account issue', revision: '1', archived: false, backlog: false, blocked: false,
      createdAt: '2026-10-20T00:00:00Z', updatedAt: '2026-10-20T00:00:00Z', dueDate: null, overdue: false, assignee: null, labels: [], parent: null,
      subtaskProgress: { total: 0, done: 0 }, unfinishedBlockerCount: 0, type: issueType,
      priority: { id: priorityId, name: 'Medium', key: 'medium', retired: false, sortOrder: '1' },
      workflow: { id: workflowId, name: 'Delivery', revision: '1', retired: false },
      stage: { id: '90000000-0000-4000-8000-000000000001', name: 'To do', category: 'todo', initial: true, position: '1', retired: false, acceptsEntries: true } } };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const saved = <T>(result: T) => ({ result, receipt: { eventId: null, replayed: false } });

TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
afterAll(() => TestBed.resetTestEnvironment());
describe('issue creation upload transport account ownership', () => {
  let auth: AuthService, form: ModernIssueFormComponent, drafts: DraftsService;
  let token: string | undefined, metadata: AssetMetadata | undefined, received: number;
  let paused: { path: string; ready: () => void; gate: Promise<void> } | null;
  const getIssue = vi.fn<ModernIssuesApi['get']>(), updateIssue = vi.fn<ModernIssuesApi['update']>();
  const calls: Array<{ path: string; method: string; actor: string | null }> = [];
  const session = (): UploadSessionView => ({ assetId, sessionId, issueId, metadata: metadata!, state: 'uploading', expectedBytes: '7', receivedBytes: String(received), maximumBytes: '10485760', chunkBytes: '3', expiresAt: '2026-10-21T00:00:00Z' });
  beforeEach(async () => {
    calls.length = 0; paused = null; token = undefined; received = 0; metadata = undefined; getIssue.mockReset().mockResolvedValue(issue()); updateIssue.mockReset();
    vi.stubGlobal('window', Object.assign(new EventTarget(), { confirm: () => true }));
    vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'hidden' }));
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input, init) => {
      const request = new Request(input, init), path = new URL(request.url).pathname;
      const actor = request.headers.get('Authorization'); calls.push({ path, method: request.method, actor });
      const respond = async (body: unknown, status = 200) => {
        const response = json(body, status);
        if (paused?.path === path) { paused.ready(); await paused.gate; }
        return response;
      };
      if (path === '/api/v1/me') return respond(person(actor === 'Bearer second-account'));
      if (path === '/api/v1/asset-policy') return respond({ maximumFileBytes: '10485760', maximumImageBytes: '10485760', chunkBytes: '3' });
      if (path === `/api/v1/issues/${issueId}/asset-uploads`) {
        metadata = zStartUploadFields.parse(await request.json()).metadata;
        return respond(saved(session()), 201);
      }
      if (path === `/api/v1/asset-uploads/${sessionId}`) return respond(session());
      if (path === `/api/v1/asset-uploads/${sessionId}/chunks`) {
        const chunk = zAppendUploadFields.parse(await request.json());
        received += atob(chunk.dataBase64).length;
        return respond(saved(session()));
      }
      if (path === `/api/v1/asset-uploads/${sessionId}/finalize`) {
        const result: AssetView = { id: assetId, issueId, issueRevision: '2', kind: 'file', filename: 'private.txt', description: '', mimeType: 'text/plain', inPanel: true, state: 'published', byteSize: '7', expiresAt: null, uploadedAt: '2026-10-20T00:00:00Z', uploader: { id: person(actor === 'Bearer second-account').userId, displayName: person(actor === 'Bearer second-account').displayName } };
        return respond(saved(result));
      }
      throw new Error('Unexpected actual SDK request ' + request.method + ' ' + path);
    }));
    const provider: SignInProvider = { mode: 'development', accessToken: async () => token, signIn: async () => {}, signOut: async () => {}, setLocalToken: value => { token = value; }, clearLocalToken: () => { token = undefined; } };
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), AuthService, AssetsApi,
      { provide: ConfigService, useValue: { apiOrigin: 'http://upload.test' } satisfies Pick<ConfigService, 'apiOrigin'> },
      { provide: SIGN_IN, useValue: provider },
      { provide: ProjectConfigurationApi, useValue: { get: async () => configuration, types: async () => ({ items: [issueType], nextCursor: null, totalMatching: 1 }), priorities: async () => ({ items: [], nextCursor: null, totalMatching: 0 }) } satisfies Pick<ProjectConfigurationApi, 'get' | 'types' | 'priorities'> },
      { provide: ProjectWorkflowsApi, useValue: { workflows: async () => ({ items: [], nextCursor: null, totalMatching: 0 }), bindings: async () => ({ items: [], nextCursor: null, totalMatching: 0 }) } satisfies Pick<ProjectWorkflowsApi, 'workflows' | 'bindings'> },
      { provide: IssuesApi, useValue: { assignees: async () => ({ items: [], nextCursor: null, totalMatching: 0 }) } satisfies Pick<IssuesApi, 'assignees'> },
      { provide: ModernIssuesApi, useValue: { get: getIssue, update: updateIssue } satisfies Pick<ModernIssuesApi, 'get' | 'update'> },
      { provide: RendererFactory2, useValue: { createRenderer: () => { throw new Error('No rendered UI is claimed.'); } } },
      { provide: TestComponentRenderer, useValue: { insertRootElement: () => {}, removeAllRootElements: () => {} } },
    ] });
    auth = TestBed.inject(AuthService); expect(await auth.signInLocal('first-account')).toBe(true);
    drafts = TestBed.inject(DraftsService);
    form = TestBed.runInInjectionContext(() => new ModernIssueFormComponent());
    Object.defineProperty(form, 'projectId', { value: signal(projectId).asReadonly() });
    TestBed.tick(); await vi.waitFor(() => expect(form.configurationState.busy()).toBe(false));
  });
  afterEach(() => { TestBed.resetTestingModule(); vi.unstubAllGlobals(); });

  it.each([true, false])('never starts an old queued upload under the next account after delayed file hashing (effects flushed: %s)', async flushEffects => {
    form.form.controls.title.setValue('First-account private intention');
    const file = new File(['PRIVATE'], 'private.txt', { type: 'text/plain' }), bytes = await file.arrayBuffer(), held = deferred<ArrayBuffer>();
    const read = vi.spyOn(file, 'arrayBuffer').mockReturnValue(held.promise);
    form.queueFiles([file]); const item = form.files()[0]!;
    const completion = form.finishUploads(issue()).then(() => null, error => error);
    await vi.waitFor(() => expect(read).toHaveBeenCalledOnce());
    const previousEpoch = auth.sessionEpoch();
    expect(await auth.signInLocal('second-account')).toBe(true); expect(auth.sessionEpoch()).toBeGreaterThan(previousEpoch);
    if (flushEffects) { TestBed.tick(); expect(drafts.modernIssues.size).toBe(0); expect(form.files()).toEqual([]); }
    held.resolve(bytes);
    expect(await completion).toEqual(new Error('Your session changed.'));
    // All subsequent calls use the actual generated SDK/client. A model-only
    // held upload promise cannot establish these transport/credential assertions.
    expect(calls.filter(call => call.path.includes('asset-uploads'))).toEqual([]);
    expect(item.sessionId).toBeUndefined(); expect(received).toBe(0);
    expect(getIssue).not.toHaveBeenCalled(); expect(updateIssue).not.toHaveBeenCalled();
    TestBed.tick(); expect(drafts.modernIssues.size).toBe(0);
  });
  it.each(['start', 'session', 'chunk', 'finalize'] as const)('does not mutate resumable state or continue dispatch after a late %s reply crosses accounts', async boundary => {
    const path = boundary === 'start' ? `/api/v1/issues/${issueId}/asset-uploads` : `/api/v1/asset-uploads/${sessionId}` + (boundary === 'chunk' ? '/chunks' : boundary === 'finalize' ? '/finalize' : '');
    const ready = deferred<void>(), gate = deferred<void>();
    paused = { path, ready: () => ready.resolve(), gate: gate.promise };
    form.queueFiles([new File(['PRIVATE'], 'private.txt', { type: 'text/plain' })]);
    const item = form.files()[0]!, completion = form.finishUploads(issue()).then(() => null, error => error);
    await ready.promise;
    const before = calls.filter(call => call.path.includes('asset-uploads')).map(call => ({ ...call }));
    const receivedBefore = item.receivedBytes;
    expect(before.length).toBeGreaterThan(0); expect(before.every(call => call.actor === 'Bearer first-account')).toBe(true);
    expect(await auth.signInLocal('second-account')).toBe(true); TestBed.tick();
    gate.resolve(); expect(await completion).toEqual(new Error('Your session changed.'));
    expect(calls.filter(call => call.path.includes('asset-uploads'))).toEqual(before);
    expect(item.receivedBytes).toBe(receivedBefore); expect(item.state).toBe('queued');
    if (boundary === 'start') expect(item.sessionId).toBeUndefined();
    expect(getIssue).not.toHaveBeenCalled(); expect(updateIssue).not.toHaveBeenCalled(); expect(drafts.modernIssues.size).toBe(0);
  });

  it('preserves rightful same-account chunks, retry metadata and final publication', async () => {
    form.queueFiles([new File(['PRIVATE'], 'private.txt', { type: 'text/plain' })]);
    const item = form.files()[0]!;
    expect(await form.finishUploads(issue())).toEqual(issue());
    const requests = calls.filter(call => call.path.includes('asset-uploads'));
    expect(requests).toHaveLength(6); expect(requests.every(call => call.actor === 'Bearer first-account')).toBe(true);
    expect(item).toMatchObject({ sessionId, state: 'uploaded', receivedBytes: 7 });
    expect(item.checksum).toMatch(/^[a-f0-9]{64}$/); expect(Object.keys(item.chunkReferences ?? {})).toEqual(['0', '3', '6']);
    expect(item.finalizeReference).toMatch(/^[a-f0-9-]{36}$/); expect(received).toBe(7);
    expect(getIssue).toHaveBeenCalledExactlyOnceWith(issueId); expect(updateIssue).not.toHaveBeenCalled();
  });

  it('pins the asset transport account even if the caller has not yet aborted its transfer', async () => {
    const file = new File(['PRIVATE'], 'private.txt', { type: 'text/plain' }), bytes = await file.arrayBuffer(), held = deferred<ArrayBuffer>();
    const read = vi.spyOn(file, 'arrayBuffer').mockReturnValue(held.promise);
    form.queueFiles([file]); const item = form.files()[0]!;
    const completion = TestBed.inject(AssetsApi).uploadFile(issueId, { filename: 'private.txt', description: '', mimeType: 'text/plain', kind: 'file', publication: 'issue' }, item, () => {}, new AbortController().signal).then(() => null, error => error);
    await vi.waitFor(() => expect(read).toHaveBeenCalledOnce());
    expect(await auth.signInLocal('second-account')).toBe(true);
    held.resolve(bytes);
    expect(await completion).toEqual(new Error('Your session changed.'));
    expect(calls.filter(call => call.path.includes('asset-uploads'))).toEqual([]);
    expect(item.sessionId).toBeUndefined(); expect(received).toBe(0);
  });

});
