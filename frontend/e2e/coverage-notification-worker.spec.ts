// These are real local SMTP protocol/queue checks, not intended-provider email acceptance.
import { expect, type APIRequestContext, type TestInfo } from '@playwright/test';
import { z } from 'zod';
import { createServer, type AddressInfo, type Socket } from 'node:net';
import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { access, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { test } from './support/browser-test';
import { useCase } from './support/use-case';
import { isolatedProject, useModernIssues } from './support/project';
import { localFixturesAvailable } from './support/session';
import { memberId, read, save } from './support/coverage-access';
import { zNotificationPreferencesView, zSavedNotificationPreferencesView, zSavedModernIssueView, zModernIssueView, zPageMembershipView, zSavedMembershipView, zInboxSummary } from '../src/app/api/generated/zod.gen';

test.skip(!localFixturesAvailable || !process.env['GATEGOLD_E2E_SERVER_BINARY'], 'Requires an exported captured server binary, isolated PostgreSQL and loopback SMTP permission.');
test.use({ trace: 'off' });

const uuid = z.uuid();
const deliverySchema = z.object({ id: uuid, issueId: uuid, recipientId: uuid, notificationId: uuid,
  state: z.enum(['pending', 'sent', 'cancelled', 'failed']), attempts: z.number().int().min(0).max(8),
  availableAt: z.iso.datetime({ offset: true }), completedAt: z.iso.datetime({ offset: true }).nullable(),
});
type Delivery = z.infer<typeof deliverySchema>;

function fixtureDatabase() {
  const database = process.env['GATEGOLD_E2E_DATABASE_NAME'];
  if (!database || !/^gg_browser_[0-9a-f]{32}$/.test(database)) throw new Error('Mail queue inspection is restricted to an isolated browser fixture database.');
  let databaseURL: URL;
  try { databaseURL = new URL(process.env['DATABASE_URL'] ?? 'invalid:'); }
  catch { throw new Error('The worker database must be an explicit disposable loopback fixture database.'); }
  if (!['postgres:', 'postgresql:'].includes(databaseURL.protocol) || databaseURL.hostname !== '127.0.0.1' || databaseURL.port !== '54329' || databaseURL.pathname !== '/' + database) throw new Error('The worker database must be this exact disposable loopback fixture database.');
  if (process.env['SMTP_ADDRESS']) throw new Error('The primary browser-test server must have SMTP disabled before this coordinated batch.');
  return database;
}

async function query(sql: string) {
  const database = fixtureDatabase();
  const result = await promisify(execFile)('docker', ['compose', '-f', resolve('../compose.dev.yaml'), 'exec', '-T', 'postgres', 'psql', '--username=gategoldjira', '--dbname=' + database, '-v', 'ON_ERROR_STOP=1', '-A', '-t', '-c', sql]);
  return result.stdout.trim();
}

async function deliveries(issueId: string, action: 'assignment' | 'reminder' = 'assignment'): Promise<Delivery[]> {
  uuid.parse(issueId); uuid.parse(memberId);
  const condition = action === 'reminder' ? "e.action='schedule_due_reminder'" : "'assignment'=ANY(n.reasons)";
  const sql = "SELECT coalesce(json_agg(json_build_object('id',d.id,'issueId',d.issue_id,'recipientId',d.recipient_id,'notificationId',d.notification_id,'state',d.state,'attempts',d.attempts,'availableAt',d.available_at,'completedAt',d.completed_at) ORDER BY d.id),'[]'::json) FROM notification_deliveries d JOIN notifications n ON n.id=d.notification_id JOIN activity_events e ON e.id=n.event_id WHERE d.issue_id='" + issueId + "' AND d.recipient_id='" + memberId + "' AND " + condition + ';';
  return z.array(deliverySchema).parse(JSON.parse(await query(sql)));
}

async function dueNow(delivery: Delivery) {
  for (const value of [delivery.id, delivery.issueId, delivery.recipientId]) uuid.parse(value);
  // Only the owning test's pending schedule changes; attempt/state progression remains real.
  const result = await query("UPDATE notification_deliveries SET available_at=now()-interval '1 second' WHERE id='" + delivery.id + "' AND issue_id='" + delivery.issueId + "' AND recipient_id='" + delivery.recipientId + "' AND state='pending';");
  expect(result).toBe('UPDATE 1');
}

type SMTPAttempt = { deliveryId: string; recipient: string; accepted: boolean };
class LocalSMTP {
  readonly attempts: SMTPAttempt[] = [];
  mode: 'accept' | 'temporary' = 'accept';
  holdQuitFor: string | undefined;
  onHeldQuit: ((deliveryId: string) => void) | undefined;
  private readonly heldQuits = new Map<string, Socket>();
  private readonly sockets = new Set<Socket>();
  private readonly server = createServer(socket => {
    this.sockets.add(socket); socket.setEncoding('utf8'); socket.setTimeout(15_000, () => socket.destroy());
    socket.on('error', () => {}); socket.on('close', () => this.sockets.delete(socket));
    let buffer = '', recipient = '', data = '', receivingData = false, lastDeliveryId: string | undefined;
    socket.write('220 GateGoldJira local protocol sink\r\n');
    socket.on('data', chunk => {
      buffer += String(chunk);
      let boundary: number;
      while ((boundary = buffer.indexOf('\r\n')) >= 0) {
        const line = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
        if (receivingData) {
          if (line !== '.') { data += (line.startsWith('..') ? line.slice(1) : line) + '\r\n'; continue; }
          const identity = /^Message-ID: <([0-9a-f-]{36})@gategoldjira>\r?$/mi.exec(data)?.[1];
          if (!identity || !uuid.safeParse(identity).success) { socket.write('554 Missing stable delivery identity\r\n'); socket.end(); return; }
          lastDeliveryId = identity;
          const accepted = this.mode === 'accept';
          this.attempts.push({ deliveryId: identity, recipient, accepted });
          socket.write(accepted ? '250 Message accepted by local test sink\r\n' : '451 Temporary local SMTP refusal\r\n');
          receivingData = false; data = ''; continue;
        }
        if (/^(EHLO|HELO) /i.test(line)) socket.write('250 localhost\r\n');
        else if (/^MAIL FROM:/i.test(line)) socket.write('250 Sender accepted\r\n');
        else if (/^RCPT TO:/i.test(line)) { recipient = line.slice('RCPT TO:'.length).trim().replace(/^<|>$/g, ''); socket.write('250 Recipient accepted\r\n'); }
        else if (/^DATA$/i.test(line)) { receivingData = true; data = ''; socket.write('354 End with a single period\r\n'); }
        else if (/^QUIT$/i.test(line)) {
          if (lastDeliveryId && this.holdQuitFor === lastDeliveryId) {
            this.heldQuits.set(lastDeliveryId, socket);
            this.onHeldQuit?.(lastDeliveryId);
          } else socket.end('221 Closing local session\r\n');
        }
        else if (/^RSET$/i.test(line)) socket.write('250 Reset\r\n');
        else socket.write('500 Unsupported SMTP command\r\n');
      }
    });
  });
  async listen() {
    this.server.listen(0, '127.0.0.1'); await once(this.server, 'listening');
    return '127.0.0.1:' + (this.server.address() as AddressInfo).port;
  }
  async close() {
    for (const socket of this.sockets) socket.destroy();
    if (!this.server.listening) return;
    await new Promise<void>((resolve, reject) => this.server.close(error => error ? reject(error) : resolve()));
  }
  forDelivery(id: string) { return this.attempts.filter(attempt => attempt.deliveryId === id); }
  observedHeldQuit(id: string) { return this.heldQuits.has(id); }
  releaseQuit(id: string) {
    const socket = this.heldQuits.get(id);
    if (socket && !socket.destroyed) socket.end('221 Closing local session\r\n');
    this.heldQuits.delete(id);
    if (this.holdQuitFor === id) this.holdQuitFor = undefined;
    this.onHeldQuit = undefined;
  }
}

async function reservePort() {
  const reservation = createServer(); reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
  const port = (reservation.address() as AddressInfo).port;
  await new Promise<void>((resolve, reject) => reservation.close(error => error ? reject(error) : resolve())); return port;
}

class SecondaryWorker {
  private process: ChildProcess | undefined;
  private readonly logs: string[] = [];
  private serial = 0;
  constructor(private readonly smtpAddress: string, private readonly info: TestInfo) {}
  async start() {
    if (this.process) throw new Error('Stop the previous owned worker before restarting it.');
    const database = fixtureDatabase(); const binary = process.env['GATEGOLD_E2E_SERVER_BINARY'];
    if (!binary || !binary.includes('/' + database.slice('gg_browser_'.length) + '/') || !binary.endsWith('/gategoldjira')) throw new Error('The secondary worker must use this run’s captured Go binary.');
    await access(binary, constants.X_OK);
    const configuredPort = process.env['GATEGOLD_E2E_NOTIFICATION_PORT'];
    const port = configuredPort ? z.coerce.number().int().min(1).max(65535).parse(configuredPort) : await reservePort();
    const child = spawn(binary, [], { env: { ...process.env, PORT: String(port), SMTP_ADDRESS: this.smtpAddress, SMTP_FROM: 'gategoldjira@local.fixture.test', SMTP_USERNAME: '', SMTP_PASSWORD: '', SMTP_ALLOW_LOCAL_PLAINTEXT: 'true', NOTIFICATION_WORKER_INTERVAL_SECONDS: '10' }, stdio: ['ignore', 'pipe', 'pipe'] });
    this.process = child; child.on('error', () => {});
    for (const stream of [child.stdout, child.stderr]) stream?.on('data', chunk => this.logs.push(String(chunk)));
    await expect.poll(async () => {
      if (child.exitCode !== null) throw new Error('The owned notification worker exited before readiness; inspect its private fixture log.');
      try { return (await fetch('http://127.0.0.1:' + port + '/readyz')).status; } catch { return 0; }
    }, { timeout: 20_000 }).toBe(200);
  }
  async crash() {
    const child = this.process;
    if (!child || child.exitCode !== null || child.signalCode !== null) throw new Error('The owned secondary must be running before its intentional crash.');
    this.process = undefined; const closed = once(child, 'close');
    child.kill('SIGKILL'); await closed;
    expect(child.signalCode).toBe('SIGKILL');
    await writeFile(this.info.outputPath('secondary-crash-' + (++this.serial) + '.private.log'), this.logs.join(''), { mode: 0o600 }); this.logs.length = 0;
  }
  async stop() {
    const child = this.process;
    if (!child) return;
    this.process = undefined;
    if (child.exitCode === null && child.signalCode === null) {
      const closed = once(child, 'close'); child.kill('SIGTERM');
      const timeout = setTimeout(() => child.kill('SIGKILL'), 12_000);
      try { await closed; } finally { clearTimeout(timeout); }
    }
    await writeFile(this.info.outputPath('secondary-worker-' + (++this.serial) + '.private.log'), this.logs.join(''), { mode: 0o600 }); this.logs.length = 0;
  }
}

async function preferences(request: APIRequestContext, emailMode: 'off' | 'instant' | 'daily', reminder = false) {
  const current = await read(request, '/api/v1/notifications/preferences', zNotificationPreferencesView, 'member');
  return (await save(request, '/api/v1/notifications/preferences', { expectedRevision: current.revision, inAppEnabled: true, emailMode, dueReminders: reminder, events: reminder ? ['due_date'] : ['assignment'] }, zSavedNotificationPreferencesView, { role: 'member' })).result;
}

async function restorePreferences(request: APIRequestContext, original: z.infer<typeof zNotificationPreferencesView>) {
  const current = await read(request, '/api/v1/notifications/preferences', zNotificationPreferencesView, 'member');
  await save(request, '/api/v1/notifications/preferences', { expectedRevision: current.revision, inAppEnabled: original.inAppEnabled, emailMode: original.emailMode, dueReminders: original.dueReminders, events: original.events }, zSavedNotificationPreferencesView, { role: 'member' });
}

async function ownedIssue(request: APIRequestContext, projectId: string, title: string, dueDate?: string) {
  return (await save(request, '/api/v2/projects/' + projectId + '/issues', { title, assigneeId: memberId, ...(dueDate ? { dueDate } : {}) }, zSavedModernIssueView, { method: 'POST', status: 201 })).result;
}

async function waitForDelivery(issueId: string, action: 'assignment' | 'reminder' = 'assignment') {
  await expect.poll(async () => (await deliveries(issueId, action)).length, { timeout: 20_000 }).toBe(1);
  return (await deliveries(issueId, action))[0]!;
}

test('obsolete queued reminders are cancelled by current due-date eligibility before SMTP', async ({ request }, info) => {
  test.setTimeout(90_000);
  const original = await read(request, '/api/v1/notifications/preferences', zNotificationPreferencesView, 'member');
  const projectId = await isolatedProject(request); await useModernIssues(projectId);
  const sink = new LocalSMTP(); const worker = new SecondaryWorker(await sink.listen(), info);
  try {
    await preferences(request, 'daily', true);
    const today = (await read(request, '/api/v1/notifications/summary', zInboxSummary, 'member')).companyToday;
    const issue = await ownedIssue(request, projectId, 'Obsolete queued local reminder ' + crypto.randomUUID(), today);
    const control = await ownedIssue(request, projectId, 'Still current queued local reminder ' + crypto.randomUUID(), today);
    await worker.start(); const queued = await waitForDelivery(issue.summary.id, 'reminder'); const eligible = await waitForDelivery(control.summary.id, 'reminder'); await worker.stop();
    expect(queued).toMatchObject({ state: 'pending', attempts: 0 }); expect(Date.parse(queued.availableAt)).toBeGreaterThan(Date.now());
    expect(eligible).toMatchObject({ state: 'pending', attempts: 0 }); expect(Date.parse(eligible.availableAt)).toBeGreaterThan(Date.now());
    const current = await read(request, '/api/v2/issues/' + issue.summary.id, zModernIssueView);
    await save(request, '/api/v2/issues/' + issue.summary.id, { expectedRevision: current.summary.revision, editable: { title: current.summary.title, description: current.description, descriptionFormat: current.descriptionFormat, typeId: current.summary.type.id, priorityId: current.summary.priority.id, assigneeId: memberId, dueDate: '2099-01-01', labelIds: current.summary.labels.map(label => label.id) } }, zSavedModernIssueView);
    await preferences(request, 'instant', true); await dueNow(queued); await dueNow(eligible);
    await useCase('UC-NTF-0064', async () => {
      await worker.start();
      await expect.poll(async () => (await deliveries(issue.summary.id, 'reminder'))[0]?.state, { timeout: 20_000 }).toBe('cancelled');
      const cancelled = (await deliveries(issue.summary.id, 'reminder'))[0]!;
      expect(cancelled).toMatchObject({ id: queued.id, attempts: 1, state: 'cancelled' }); expect(cancelled.completedAt).not.toBeNull();
      expect(sink.forDelivery(queued.id)).toEqual([]);
      expect((await read(request, '/api/v2/issues/' + issue.summary.id, zModernIssueView)).summary.dueDate).toBe('2099-01-01');
      await expect.poll(async () => (await deliveries(control.summary.id, 'reminder'))[0]?.state, { timeout: 20_000 }).toBe('sent');
      expect((await deliveries(control.summary.id, 'reminder'))[0]).toMatchObject({ id: eligible.id, attempts: 1, state: 'sent' });
      expect(sink.forDelivery(eligible.id)).toEqual([{ deliveryId: eligible.id, recipient: 'member@example.test', accepted: true }]);
    }, 'background');
  } finally { await worker.stop(); await sink.close(); await restorePreferences(request, original); }
});

test('revoked project access cancels an already queued local delivery before SMTP', async ({ request }, info) => {
  test.setTimeout(90_000);
  const original = await read(request, '/api/v1/notifications/preferences', zNotificationPreferencesView, 'member');
  const projectId = await isolatedProject(request); await useModernIssues(projectId);
  const accessibleProjectId = await isolatedProject(request); await useModernIssues(accessibleProjectId);
  const sink = new LocalSMTP(); const worker = new SecondaryWorker(await sink.listen(), info);
  try {
    await preferences(request, 'daily');
    const issue = await ownedIssue(request, projectId, 'Revoked queued local delivery ' + crypto.randomUUID());
    const control = await ownedIssue(request, accessibleProjectId, 'Still accessible queued local delivery ' + crypto.randomUUID());
    await worker.start(); const queued = await waitForDelivery(issue.summary.id); const eligible = await waitForDelivery(control.summary.id); await worker.stop();
    expect(queued).toMatchObject({ state: 'pending', attempts: 0 });
    expect(eligible).toMatchObject({ state: 'pending', attempts: 0 });
    const membership = (await read(request, '/api/v1/projects/' + projectId + '/memberships', zPageMembershipView)).items.find(item => item.user.id === memberId)!;
    await save(request, '/api/v1/projects/' + projectId + '/memberships/' + memberId + '/remove', { expectedRevision: membership.revision }, zSavedMembershipView, { method: 'POST' });
    await preferences(request, 'instant'); await dueNow(queued); await dueNow(eligible);
    await useCase('UC-NTF-0067', async () => {
      await worker.start();
      await expect.poll(async () => (await deliveries(issue.summary.id))[0]?.state, { timeout: 20_000 }).toBe('cancelled');
      const cancelled = (await deliveries(issue.summary.id))[0]!;
      expect(cancelled).toMatchObject({ id: queued.id, state: 'cancelled', attempts: 1 }); expect(cancelled.completedAt).not.toBeNull();
      expect(sink.forDelivery(queued.id)).toEqual([]);
      expect((await read(request, '/api/v1/projects/' + projectId + '/memberships?includeRemoved=true', zPageMembershipView)).items.find(item => item.user.id === memberId)?.removed).toBe(true);
      await expect.poll(async () => (await deliveries(control.summary.id))[0]?.state, { timeout: 20_000 }).toBe('sent');
      expect((await deliveries(control.summary.id))[0]).toMatchObject({ id: eligible.id, state: 'sent', attempts: 1 });
      expect(sink.forDelivery(eligible.id)).toEqual([{ deliveryId: eligible.id, recipient: 'member@example.test', accepted: true }]);
    }, 'background');
  } finally { await worker.stop(); await sink.close(); await restorePreferences(request, original); }
});

test('a real SMTP temporary refusal persists retry state and the next accepted attempt retains Message-ID', async ({ request }, info) => {
  test.setTimeout(90_000);
  const original = await read(request, '/api/v1/notifications/preferences', zNotificationPreferencesView, 'member');
  const projectId = await isolatedProject(request); await useModernIssues(projectId);
  const sink = new LocalSMTP(); sink.mode = 'temporary'; const worker = new SecondaryWorker(await sink.listen(), info);
  try {
    await preferences(request, 'instant');
    const issue = await ownedIssue(request, projectId, 'Temporary SMTP retry ' + crypto.randomUUID());
    await useCase('UC-NTF-0068', async () => {
      await worker.start(); const first = await waitForDelivery(issue.summary.id);
      await expect.poll(async () => (await deliveries(issue.summary.id))[0]?.attempts, { timeout: 20_000 }).toBe(1); await worker.stop();
      const pending = (await deliveries(issue.summary.id))[0]!;
      expect(pending).toMatchObject({ id: first.id, state: 'pending', attempts: 1, completedAt: null }); expect(Date.parse(pending.availableAt)).toBeGreaterThan(Date.now() + 30_000);
      expect(sink.forDelivery(first.id)).toEqual([{ deliveryId: first.id, recipient: 'member@example.test', accepted: false }]);
      await dueNow(pending); await worker.start();
      await expect.poll(async () => (await deliveries(issue.summary.id))[0]?.attempts, { timeout: 20_000 }).toBe(2); await worker.stop();
      const deferredAgain = (await deliveries(issue.summary.id))[0]!;
      expect(deferredAgain).toMatchObject({ id: first.id, state: 'pending', attempts: 2, completedAt: null });
      expect(Date.parse(deferredAgain.availableAt)).toBeGreaterThan(Date.parse(pending.availableAt) + 30_000);
      sink.mode = 'accept'; await dueNow(deferredAgain); await worker.start();
      await expect.poll(async () => (await deliveries(issue.summary.id))[0]?.state, { timeout: 20_000 }).toBe('sent');
      const sent = (await deliveries(issue.summary.id))[0]!; expect(sent).toMatchObject({ id: first.id, attempts: 3, state: 'sent' }); expect(sent.completedAt).not.toBeNull();
      expect(sink.forDelivery(first.id)).toEqual([{ deliveryId: first.id, recipient: 'member@example.test', accepted: false }, { deliveryId: first.id, recipient: 'member@example.test', accepted: false }, { deliveryId: first.id, recipient: 'member@example.test', accepted: true }]);
    }, 'background');
  } finally { await worker.stop(); await sink.close(); await restorePreferences(request, original); }
});

test('eight actual SMTP refusals exhaust retries and later worker progress cannot resend terminal work', async ({ request }, info) => {
  test.setTimeout(180_000);
  const original = await read(request, '/api/v1/notifications/preferences', zNotificationPreferencesView, 'member');
  const projectId = await isolatedProject(request); await useModernIssues(projectId);
  const sink = new LocalSMTP(); sink.mode = 'temporary'; const worker = new SecondaryWorker(await sink.listen(), info);
  try {
    await preferences(request, 'instant');
    const issue = await ownedIssue(request, projectId, 'Exhausted actual SMTP retries ' + crypto.randomUUID());
    await useCase('UC-NTF-0069', async () => {
      let owned: Delivery | undefined;
      for (let attempt = 1; attempt <= 8; attempt++) {
        const previousDeferredAt = owned ? Date.parse(owned.availableAt) : undefined;
        if (owned) await dueNow(owned);
        await worker.start(); if (!owned) owned = await waitForDelivery(issue.summary.id);
        await expect.poll(async () => (await deliveries(issue.summary.id))[0]?.attempts, { timeout: 20_000 }).toBe(attempt); await worker.stop();
        owned = (await deliveries(issue.summary.id))[0]!;
        expect(owned.state).toBe(attempt === 8 ? 'failed' : 'pending');
        if (attempt < 8) {
          expect(Date.parse(owned.availableAt)).toBeGreaterThan(Date.now() + 30_000);
          if (previousDeferredAt !== undefined) expect(Date.parse(owned.availableAt)).toBeGreaterThan(previousDeferredAt + 30_000);
        }
        expect(sink.forDelivery(owned.id)).toHaveLength(attempt); expect(sink.forDelivery(owned.id).every(value => !value.accepted)).toBe(true);
      }
      expect(owned!.completedAt).not.toBeNull(); const terminal = owned!;
      // A separately accepted local control proves another real worker pass ran.
      sink.mode = 'accept'; const control = await ownedIssue(request, projectId, 'SMTP terminal-state control ' + crypto.randomUUID());
      await worker.start();
      await expect.poll(async () => (await deliveries(control.summary.id))[0]?.state, { timeout: 20_000 }).toBe('sent');
      expect((await deliveries(issue.summary.id))[0]).toEqual(terminal); expect(sink.forDelivery(terminal.id)).toHaveLength(8);
      const acceptedControl = (await deliveries(control.summary.id))[0]!; expect(sink.forDelivery(acceptedControl.id)).toEqual([{ deliveryId: acceptedControl.id, recipient: 'member@example.test', accepted: true }]);
    }, 'background');
  } finally { await worker.stop(); await sink.close(); await restorePreferences(request, original); }
});


// Fault boundary: local DATA is acknowledged, then this test-owned process dies
// before Send returns and before the database transaction can commit.
test('SMTP acknowledgement before a worker crash can produce a duplicate with the same Message-ID', async ({ request }, info) => {
  test.setTimeout(90_000);
  const original = await read(request, '/api/v1/notifications/preferences', zNotificationPreferencesView, 'member');
  const projectId = await isolatedProject(request); await useModernIssues(projectId);
  const sink = new LocalSMTP(); const worker = new SecondaryWorker(await sink.listen(), info);
  let crash: Promise<void> | undefined; let deliveryId: string | undefined;
  try {
    await preferences(request, 'daily');
    const issue = await ownedIssue(request, projectId, 'Real acknowledged SMTP crash window ' + crypto.randomUUID());
    await worker.start(); const queued = await waitForDelivery(issue.summary.id); await worker.stop();
    deliveryId = queued.id;
    expect(queued).toMatchObject({ state: 'pending', attempts: 0, completedAt: null });
    expect(Date.parse(queued.availableAt)).toBeGreaterThan(Date.now());
    await preferences(request, 'instant');
    sink.holdQuitFor = queued.id;
    sink.onHeldQuit = id => {
      if (id !== queued.id || crash) return;
      // Signal synchronously when the owned acknowledged connection reaches QUIT,
      // avoiding the SMTP deadline racing a slow test-controller poll.
      crash = worker.crash(); void crash.catch(() => {});
    };
    // Remain scheduled in the future until this secondary is actually ready.
    await worker.start(); await dueNow(queued);
    await useCase('UC-NTF-0070', async () => {
      await expect.poll(() => sink.observedHeldQuit(queued.id), { timeout: 20_000 }).toBe(true);
      expect(sink.forDelivery(queued.id)).toEqual([{ deliveryId: queued.id, recipient: 'member@example.test', accepted: true }]);
      if (!crash) throw new Error('The held target QUIT did not trigger the owned crash.');
      await crash;
      const rolledBack = (await deliveries(issue.summary.id))[0]!;
      expect(rolledBack).toMatchObject({ id: queued.id, notificationId: queued.notificationId, state: 'pending', attempts: 0, completedAt: null });
      sink.releaseQuit(queued.id);
      await worker.start();
      await expect.poll(async () => (await deliveries(issue.summary.id))[0]?.state, { timeout: 20_000 }).toBe('sent');
      const committed = (await deliveries(issue.summary.id))[0]!;
      expect(committed).toMatchObject({ id: queued.id, notificationId: queued.notificationId, state: 'sent', attempts: 1 });
      expect(committed.completedAt).not.toBeNull();
      expect(sink.forDelivery(queued.id)).toEqual([
        { deliveryId: queued.id, recipient: 'member@example.test', accepted: true },
        { deliveryId: queued.id, recipient: 'member@example.test', accepted: true },
      ]);
    }, 'background');
  } finally {
    try { if (crash) await crash; }
    finally {
      if (deliveryId) sink.releaseQuit(deliveryId);
      try { await worker.stop(); }
      finally { try { await sink.close(); } finally { await restorePreferences(request, original); } }
    }
  }
});
