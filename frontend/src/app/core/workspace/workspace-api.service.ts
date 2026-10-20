import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import {
  getBoardV2,
  getInboxSummary,
  getIssueV2,
  getProject,
  listBoards,
  listProjects,
  searchIssuesV2,
} from '../../api/generated/sdk.gen';
import type { IssueFilter } from '../../api/generated/types.gen';
import { AuthService } from '../auth/auth.service';
import { readResult } from '../api/api-result';
import { foregroundRefresh } from '../refresh/foreground-refresh';

// Navigation needs only read operations. Feature editors remain in lazy routes.
@Injectable({ providedIn: 'root' })
export class WorkspaceApi {
  private readonly auth = inject(AuthService);
  private readonly identity = computed(() => this.auth.me()?.userId ?? null);
  private readonly unread = signal<number | null>(null);
  readonly unreadCount = this.unread.asReadonly();

  constructor() {
    foregroundRefresh(
      () => !!this.identity(),
      async () => {
        await this.refreshSummary();
      },
    );
    effect(() => {
      this.identity();
      this.auth.sessionEpoch();
      untracked(() => {
        this.unread.set(null);
        if (this.identity()) void this.refreshSummary().catch(() => undefined);
      });
    });
  }

  projects(includeArchived: boolean, cursor?: string) {
    return readResult(
      listProjects({
        client: this.auth.client,
        query: { limit: 25, includeArchived, ...(cursor ? { cursor } : {}) },
      }),
    );
  }

  project(projectId: string) {
    return readResult(getProject({ client: this.auth.client, path: { projectId } }));
  }

  board(boardId: string) {
    return readResult(
      getBoardV2({
        client: this.auth.client,
        path: { boardId },
        query: { temporaryFilters: '{}' },
      }),
    );
  }

  boards(projectId: string, cursor?: string) {
    return readResult(
      listBoards({
        client: this.auth.client,
        path: { projectId },
        query: { limit: 25, includeArchived: false, ...(cursor ? {cursor} : {}) },
      }),
    );
  }

  issue(issueId: string) {
    return readResult(getIssueV2({ client: this.auth.client, path: { issueId } }));
  }

  search(query: string, signal: AbortSignal) {
    return readResult(
      searchIssuesV2({
        client: this.auth.client,
        signal,
        body: { filters: { query }, page: { limit: 25 } },
      }),
    );
  }

  searchFilters(filters: IssueFilter) {
    return readResult(
      searchIssuesV2({
        client: this.auth.client,
        body: { filters, page: { limit: 25 } },
      }),
    );
  }

  async refreshSummary() {
    const epoch = this.auth.sessionEpoch();
    const user = this.identity();
    try {
      const summary = await readResult(getInboxSummary({ client: this.auth.client }));
      if (epoch === this.auth.sessionEpoch() && user === this.identity()) {
        this.unread.set(summary.unreadCount);
      }
      return summary;
    } catch (error: unknown) {
      if (epoch === this.auth.sessionEpoch() && user === this.identity()) {
        this.unread.set(null);
      }
      throw error;
    }
  }
}
