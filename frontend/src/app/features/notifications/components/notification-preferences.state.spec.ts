// Real public forms/effects with typed API ports; these units do not render UI.
import '@angular/compiler';
import { provideZonelessChangeDetection, RendererFactory2, signal } from '@angular/core';
import { TestBed, TestComponentRenderer } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificationPreferencesView } from '../../../api/generated/types.gen';
import { ApiError } from '../../../core/api/api-result';
import { AuthService } from '../../../core/auth/auth.service';
import { NotificationsApi } from '../notifications.api';
import { NotificationPreferencesComponent } from './notification-preferences.component';

TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
afterAll(() => TestBed.resetTestEnvironment());
const initial: NotificationPreferencesView = {
  revision: '3', emailDeliveryAvailable: false, emailMode: 'off', inAppEnabled: true,
  dueReminders: false, events: ['mention', 'assignment'],
};
const unavailable = () => new ApiError({ error: { code: 'temporarily_unavailable', message: 'Save could not be confirmed.', retryable: true, nextAction: 'retry_same_reference', fieldErrors: [] }, current: null, unfinished: null }, 503);
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  return { promise: new Promise<T>((yes, no) => { resolve = yes; reject = no; }), resolve: (value: T) => resolve(value), reject: (error: unknown) => reject(error) };
}

describe('notification preference intentions and current-session results', () => {
  const epoch = signal(1), preferences = vi.fn<NotificationsApi['preferences']>(), update = vi.fn<NotificationsApi['updatePreferences']>();
  let model: NotificationPreferencesComponent;
  beforeEach(() => {
    epoch.set(1); preferences.mockReset().mockResolvedValue(initial);
    update.mockReset().mockImplementation(async body => ({ result: { ...body, revision: '4', emailDeliveryAvailable: false }, receipt: { eventId: null, replayed: false } }));
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(),
      { provide: RendererFactory2, useValue: { createRenderer: () => { throw new Error('No rendered controls are claimed.'); } } },
      { provide: TestComponentRenderer, useValue: { insertRootElement: () => {}, removeAllRootElements: () => {} } },
      { provide: AuthService, useValue: { sessionEpoch: epoch } satisfies Pick<AuthService, 'sessionEpoch'> },
      { provide: NotificationsApi, useValue: { preferences, updatePreferences: update } satisfies Pick<NotificationsApi, 'preferences' | 'updatePreferences'> },
    ] });
    model = TestBed.runInInjectionContext(() => new NotificationPreferencesComponent()); TestBed.tick();
  });
  afterEach(() => TestBed.resetTestingModule());
  async function loaded() { await vi.waitFor(() => expect(model.state.busy()).toBe(false)); }

  it('loads saved channels/events without aliasing the API array and marks forms pristine', async () => {
    await loaded(); expect(preferences).toHaveBeenCalledOnce(); expect(model.current()).toEqual(initial);
    expect(model.form.getRawValue()).toEqual({ inAppEnabled: true, events: initial.events, emailMode: 'off', dueReminders: false });
    expect(model.form.controls.events.value).not.toBe(initial.events); expect(model.form.pristine).toBe(true);
  });
  it('toggles only the requested event and selects every supported event once', async () => {
    await loaded(); model.toggle('mention'); expect(model.form.controls.events.value).toEqual(['assignment']);
    model.toggle('comment'); expect(model.form.controls.events.value).toEqual(['assignment', 'comment']);
    model.selectAll(); expect(model.form.controls.events.value).toEqual(model.events.map(event => event.value));
    expect(new Set(model.form.controls.events.value).size).toBe(10); expect(initial.events).toEqual(['mention', 'assignment']);
  });
  it('writes a sorted frozen intention with the saved revision then adopts the returned settings', async () => {
    await loaded(); model.form.setValue({ inAppEnabled: false, events: ['watching', 'due_date', 'assignment'], emailMode: 'daily', dueReminders: true });
    model.form.markAsDirty(); await model.save();
    expect(update.mock.calls[0]?.[0]).toEqual({ inAppEnabled: false, events: ['assignment', 'due_date', 'watching'], emailMode: 'daily', dueReminders: true, expectedRevision: '3' });
    expect(update.mock.calls[0]?.[1]).toMatch(/^[0-9a-f-]{36}$/); expect(model.current()?.revision).toBe('4');
    expect(model.notice()).toBe('Notification preferences saved.'); expect(model.pending()).toBeNull(); expect(model.form.pristine).toBe(true);
  });
  it('replays the exact original body/reference after an uncertain result despite later form edits', async () => {
    await loaded(); update.mockRejectedValueOnce(unavailable()); model.form.controls.emailMode.setValue('instant'); await model.save();
    const original = update.mock.calls[0]!; expect(model.pending()).toEqual(original[0]); expect(model.state.failure()?.status).toBe(503);
    model.form.controls.emailMode.setValue('daily'); await model.save(); expect(update).toHaveBeenCalledOnce();
    await model.retryPending(); expect(update.mock.calls[1]).toEqual(original); expect(model.current()?.emailMode).toBe('instant');
    expect(model.pending()).toBeNull(); expect(model.state.failure()).toBeNull();
  });
  it('does not dispatch a save before the initial read or a retry without an intention', async () => {
    model.current.set(null); await model.save(); await model.retryPending(); expect(update).not.toHaveBeenCalled(); await loaded();
  });
  it('does not overlap preference reads and writes', async () => {
    await loaded(); const pending = deferred<Awaited<ReturnType<NotificationsApi['updatePreferences']>>>(); update.mockReturnValueOnce(pending.promise);
    const saving = model.save(); await model.reload(); await model.save(); await model.retryPending();
    expect(update).toHaveBeenCalledOnce(); expect(preferences).toHaveBeenCalledOnce();
    pending.resolve({ result: { ...initial, revision: '4' }, receipt: { eventId: null, replayed: false } }); await saving; expect(model.state.busy()).toBe(false);
  });
  it('reload clears an uncertain intention and gives a later edit a new retry reference', async () => {
    await loaded(); update.mockRejectedValueOnce(unavailable()); await model.save(); const reference = update.mock.calls[0]?.[1];
    preferences.mockResolvedValueOnce({ ...initial, revision: '9' }); await model.reload(); expect(model.pending()).toBeNull(); expect(model.notice()).toBe('');
    await model.save(); expect(update.mock.calls[1]?.[0].expectedRevision).toBe('9'); expect(update.mock.calls[1]?.[1]).not.toBe(reference);
  });
  it('keeps the saved form available on read failure and hides unknown transport details', async () => {
    await loaded(); preferences.mockRejectedValueOnce(new Error('private transport details')); await model.reload();
    expect(model.current()).toEqual(initial); expect(model.state.message()).toBe('The request could not be completed. Check your connection and try again.');
    await model.reload(); expect(model.state.message()).toBe('');
  });
  for (const outcome of ['success', 'failure'] as const) {
    it('ignores an old-account save ' + outcome + ' after the replacement account settings have loaded', async () => {
      await loaded(); const pending = deferred<Awaited<ReturnType<NotificationsApi['updatePreferences']>>>(); update.mockReturnValueOnce(pending.promise);
      const saving = model.save(); const next = { ...initial, revision: '20', emailMode: 'daily' as const, events: ['comment' as const] };
      preferences.mockResolvedValueOnce(next); epoch.set(2); TestBed.tick(); await loaded(); expect(model.current()).toEqual(next);
      if (outcome === 'success') pending.resolve({ result: { ...initial, revision: '4' }, receipt: { eventId: null, replayed: false } });
      else pending.reject(unavailable());
      await saving; expect(model.current()).toEqual(next); expect(model.form.controls.events.value).toEqual(['comment']);
      expect(model.pending()).toBeNull(); expect(model.notice()).toBe(''); expect(model.state.message()).toBe(''); expect(model.state.busy()).toBe(false);
    });
    it('ignores an old-account reload ' + outcome + ' while retaining the current read ownership', async () => {
      await loaded(); const pending = deferred<NotificationPreferencesView>(); preferences.mockReturnValueOnce(pending.promise); const reading = model.reload();
      const next = { ...initial, revision: '30', dueReminders: true }; preferences.mockResolvedValueOnce(next); epoch.set(2); TestBed.tick(); await loaded();
      if (outcome === 'success') pending.resolve({ ...initial, revision: '4' }); else pending.reject(unavailable());
      await reading; expect(model.current()).toEqual(next); expect(model.form.controls.dueReminders.value).toBe(true); expect(model.state.message()).toBe('');
    });
  }
});
