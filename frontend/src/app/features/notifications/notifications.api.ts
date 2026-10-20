import { Injectable, inject } from '@angular/core';
import {
  getNotification,
  getNotificationPreferences,
  listNotifications,
  markAllNotificationsRead,
  setNotificationRead,
  updateNotificationPreferences,
} from '../../api/generated/sdk.gen';
import type {
  SetReadFields,
  UpdateNotificationPreferencesFields,
} from '../../api/generated/types.gen';
import { readResult } from '../../core/api/api-result';
import { AuthService } from '../../core/auth/auth.service';
import { WorkspaceApi } from '../../core/workspace/workspace-api.service';

@Injectable({ providedIn: 'root' })
export class NotificationsApi {
  private readonly auth = inject(AuthService);
  private readonly workspace = inject(WorkspaceApi);
  readonly unreadCount = this.workspace.unreadCount;

  list(unreadOnly: boolean, cursor?: string) {
    return readResult(
      listNotifications({
        client: this.auth.client,
        query: { unreadOnly, limit: 25, ...(cursor ? { cursor } : {}) },
      }),
    );
  }

  get(notificationId: string) {
    return readResult(getNotification({ client: this.auth.client, path: { notificationId } }));
  }

  setRead(notificationId: string, body: SetReadFields, reference: string) {
    return readResult(
      setNotificationRead({
        client: this.auth.client,
        path: { notificationId },
        body,
        headers: { 'Idempotency-Key': reference },
      }),
    );
  }

  markAll(reference: string) {
    return readResult(
      markAllNotificationsRead({
        client: this.auth.client,
        headers: { 'Idempotency-Key': reference },
      }),
    );
  }

  preferences() {
    return readResult(getNotificationPreferences({ client: this.auth.client }));
  }

  updatePreferences(body: UpdateNotificationPreferencesFields, reference: string) {
    return readResult(
      updateNotificationPreferences({
        client: this.auth.client,
        body,
        headers: { 'Idempotency-Key': reference },
      }),
    );
  }

  refreshSummary() {
    return this.workspace.refreshSummary();
  }
}
