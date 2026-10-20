import { Injectable, effect, inject, signal } from '@angular/core';
import type { CanDeactivateFn } from '@angular/router';
import type {
  FieldAssignment,
  ModernEditable,
  ModernCreateFields,
  IssuePlanningFields,
  SaveLayoutFields,
  SaveIssueSearchRequest,
  ActivateFields,
  ModernIssueSummary,
  ModernPatchFields,
  ModernMoveFields,
  OrganizeFields,
} from '../../api/generated/types.gen';
import { AuthService } from '../auth/auth.service';
export interface ModernIssueDraft {
  fields: ModernCreateFields;
  editable: ModernEditable | null;
  revision: string;
  files: DraftFile[];
  createdIssueId?: string;
}
export interface DraftFile {
  id: string;
  file: File;
  state: 'queued' | 'uploaded' | 'failed';
  reference: string;
  pictureId?: string;
  error?: string;
  sessionId?: string;
  checksum?: string;
  finalizeReference?: string;
  chunkReferences?: Record<string, string>;
  receivedBytes?: number;
  cancelReference?: string;
}
export interface PlanningDraft {
  field: 'epicId' | 'releaseId';
  body: IssuePlanningFields;
  reference: string;
  epicName: string | null;
  releaseName: string | null;
}
export type ModernBulkIntent =
  | { kind: 'patch'; body: ModernPatchFields }
  | { kind: 'move'; body: ModernMoveFields }
  | { kind: 'organize'; body: OrganizeFields };
export interface ModernBulkDraft {
  selected: ModernIssueSummary[];
  retries: Map<string, { reference: string; intent: ModernBulkIntent }>;
  action: 'priority' | 'assignee' | 'due' | 'status' | 'archive' | 'restore' | 'backlog' | 'board';
  priorityId: string;
  assigneeId: string;
  dueDate: string;
  stageId: string;
}
export interface SavedSearchDraft {
  name: string;
  selectedId: string;
  pending: { id: string; body: SaveIssueSearchRequest; reference: string } | null;
}
@Injectable({ providedIn: 'root' })
export class DraftsService {
  private readonly auth = inject(AuthService);
  readonly modernBulk = new Map<string, ModernBulkDraft>();
  readonly activations = new Map<string, { body: ActivateFields; reference: string }>();
  readonly savedSearchDrafts = new Map<string, SavedSearchDraft>();
  readonly customFields = new Map<string, { revision: string; values: FieldAssignment[] }>();
  readonly modernBoards = new Map<string, SaveLayoutFields>();
  readonly modernIssues = new Map<string, ModernIssueDraft>();
  readonly uploads = new Map<string, DraftFile[]>();
  readonly comments = new Map<string, { html: string; revision: string | null }>();
  readonly planning = new Map<string, PlanningDraft>();
  private readonly active = new Set<string>();
  readonly dirtyCount = signal(0);
  constructor() {
    let epoch = this.auth.sessionEpoch();
    effect(() => {
      const next = this.auth.sessionEpoch();
      if (next === epoch) return;
      epoch = next;
      this.modernBulk.clear();
      this.activations.clear();
      this.savedSearchDrafts.clear();
      this.customFields.clear();
      this.modernIssues.clear();
      this.modernBoards.clear();
      this.uploads.clear();
      this.comments.clear();
      this.planning.clear();
      this.active.clear();
      this.dirtyCount.set(0);
    });
    window.addEventListener('beforeunload', event => {
      if (this.dirtyCount()) {
        event.preventDefault();
        event.returnValue = '';
      }
    });
  }
  activate(key: string, dirty: boolean): void {
    if (dirty) this.active.add(key);
    else this.active.delete(key);
    this.dirtyCount.set(this.active.size);
  }
  release(key: string): void {
    this.activate(key, false);
  }
  clearModernIssue(key: string): void {
    this.modernIssues.delete(key);
    this.release(key);
  }
  clearComment(key: string): void {
    this.comments.delete(key);
    this.release(key);
  }
  clearPlanning(key: string): void {
    this.planning.delete(key);
    this.release(key);
  }
  mayLeave(): boolean {
    return (
      !this.auth.me() ||
      !this.dirtyCount() ||
      window.confirm(
        'Leave this editor? Your unsaved draft stays in this tab until you sign out or reload.',
      )
    );
  }
}
export const draftGuard: CanDeactivateFn<unknown> = () => inject(DraftsService).mayLeave();
