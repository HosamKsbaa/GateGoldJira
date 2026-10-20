import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  Injector,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { AdministrationApi } from '../../administration.api';
import type { MembershipView, MembershipCandidateView } from '../../../../api/generated/types.gen';
import { zMembershipView } from '../../../../api/generated/zod.gen';
import { AuthService } from '../../../../core/auth/auth.service';
import { RetryIntent } from '../../../../core/api/api-result';
import { RequestState } from '../../../../shared/ui/request-state';
import { RequestStatusComponent } from '../../../../shared/ui/request-status.component';
import { focusAfterRender } from '../../../../shared/ui/focus-after-render';

type MembershipIntention = {
  projectId: string;
  userId: string;
  role: MembershipView['role'];
  expectedRevision: string;
};
@Component({
  imports: [ReactiveFormsModule, RequestStatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    form > fieldset {
      border: 0;
      padding: 0;
      margin: 0;
      min-width: 0;
      display: grid;
      gap: 0.65rem;
    }
  `,
  template: `
    <header class="page-heading"
      ><div><p class="eyebrow">Administration</p><h1>Project access</h1></div>
      <button type="button" (click)="reload()" [disabled]="state.busy()"
        >Refresh memberships</button
      ></header
    >
    <gg-request-status [state]="state" />
    @if (notice()) {
      <p class="notice" role="status">{{ notice() }}</p>
    }
    <div class="split">
      <section class="panel"
        ><h2>Memberships</h2
        ><p
          >Project admins manage this project’s settings and people. Members edit work. Viewers read
          content.</p
        >
        @if (!memberships().length && !state.busy()) {
          <p>This project has no memberships yet.</p>
        }
        <ul class="records">
          @for (membership of memberships(); track membership.user.id) {
            <li
              ><div
                ><strong dir="auto">{{ membership.user.displayName }}</strong
                ><p
                  >{{ membership.role }} ·
                  {{ membership.removed ? 'Removed' : 'Active membership' }}</p
                ></div
              >
              <button
                type="button"
                (click)="edit(membership)"
                [disabled]="state.busy()"
                [attr.aria-label]="'Change access for ' + membership.user.displayName"
                >Change</button
              >
              @if (!membership.removed) {
                <button
                  type="button"
                  class="secondary"
                  (click)="remove(membership)"
                  [disabled]="state.busy()"
                  [attr.aria-label]="'Remove access for ' + membership.user.displayName"
                  >Remove</button
                >
              }
            </li>
          }
        </ul>
        @if (membershipCursor()) {
          <button type="button" (click)="moreMemberships()" [disabled]="state.busy()"
            >More memberships</button
          >
        }
      </section>
      <section class="panel"
        ><h2>Set project role</h2>
        <form [formGroup]="form" (ngSubmit)="save()"
          ><fieldset [disabled]="state.busy()">
            <label for="membership-user">Approved user</label>
            <select id="membership-user" formControlName="userId" required (change)="selectUser()"
              ><option value="">Choose a user</option>
              @for (user of users(); track user.id) {
                <option [value]="user.id"
                  >{{ user.displayName }}{{ user.active ? '' : ' (disabled)' }}</option
                >
              }
            </select>
            @if (userCursor()) {
              <button
                type="button"
                class="secondary"
                (click)="moreUsers()"
                [disabled]="state.busy()"
                >More approved users</button
              >
            }
            <label for="membership-role">Project role</label
            ><select id="membership-role" formControlName="role"
              ><option value="project_admin">Project admin</option
              ><option value="member">Member</option
              ><option value="viewer">Viewer</option></select
            >
            <button type="submit" [disabled]="form.invalid || state.busy()">Save membership</button>
          </fieldset></form
        >
        @if (currentConflict(); as current) {
          <div class="notice"
            ><p
              >Current access: {{ current.role }} · {{ current.removed ? 'removed' : 'active' }}.</p
            >
            <button type="button" (click)="reviewCurrent(current)"
              >Review current membership</button
            ></div
          >
        }
        <p class="muted"
          >Changing or removing access clears assignments that are no longer eligible.</p
        >
      </section>
    </div>
  `,
})
export class MembershipsPage {
  private readonly api = inject(AdministrationApi);
  private readonly auth = inject(AuthService);
  private readonly injector = inject(Injector);
  private readonly projectId = inject(ActivatedRoute).snapshot.paramMap.get('projectId') ?? '';
  readonly state = new RequestState();
  readonly notice = signal('');
  readonly memberships = signal<MembershipView[]>([]);
  readonly users = signal<MembershipCandidateView[]>([]);
  readonly membershipCursor = signal<string | null>(null);
  readonly userCursor = signal<string | null>(null);
  private readonly selected = signal<MembershipView | null>(null);
  private readonly retry = new RetryIntent<MembershipIntention>();
  private readonly removeRetry = new RetryIntent<{
    projectId: string;
    userId: string;
    expectedRevision: string;
  }>();
  readonly form = new FormGroup({
    userId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    role: new FormControl<MembershipView['role']>('member', { nonNullable: true }),
  });
  constructor() {
    let epoch = this.auth.sessionEpoch();
    effect(() => {
      const current = this.auth.sessionEpoch();
      if (epoch !== current) {
        epoch = current;
        this.memberships.set([]);
        this.users.set([]);
        this.form.reset();
        this.selected.set(null);
        this.notice.set('');
        this.retry.finish();
        this.removeRetry.finish();
      }
    });
    void this.reload();
  }
  private async loadMemberships(cursor?: string): Promise<void> {
    const epoch = this.auth.sessionEpoch();
    const page = await this.api.memberships(this.projectId, cursor);
    if (epoch !== this.auth.sessionEpoch()) return;
    this.memberships.update(items => (cursor ? [...items, ...page.items] : page.items));
    this.membershipCursor.set(page.nextCursor);
  }
  private async loadUsers(cursor?: string): Promise<void> {
    const epoch = this.auth.sessionEpoch();
    const page = await this.api.membershipCandidates(this.projectId, '', cursor);
    if (epoch !== this.auth.sessionEpoch()) return;
    this.users.update(items => (cursor ? [...items, ...page.items] : page.items));
    this.userCursor.set(page.nextCursor);
  }
  async reload(): Promise<void> {
    this.form.reset();
    this.selected.set(null);
    this.retry.finish();
    this.notice.set('');
    await this.state.run(async () => {
      await this.loadMemberships();
      await this.loadUsers();
    });
  }
  async moreMemberships(): Promise<void> {
    const cursor = this.membershipCursor();
    if (cursor) await this.state.run(() => this.loadMemberships(cursor));
  }
  async moreUsers(): Promise<void> {
    const cursor = this.userCursor();
    if (cursor) await this.state.run(() => this.loadUsers(cursor));
  }
  selectUser(): void {
    this.notice.set('');
    this.selected.set(
      this.memberships().find(item => item.user.id === this.form.controls.userId.value) ?? null,
    );
    this.retry.finish();
    this.state.clear();
  }
  edit(membership: MembershipView): void {
    this.notice.set('');
    this.selected.set(membership);
    this.retry.finish();
    this.state.clear();
    this.form.setValue({ userId: membership.user.id, role: membership.role });
    focusAfterRender('membership-role', this.injector);
  }
  currentConflict(): MembershipView | null {
    const parsed = zMembershipView.safeParse(this.state.failure()?.payload.current);
    return parsed.success ? parsed.data : null;
  }
  reviewCurrent(current: MembershipView): void {
    this.memberships.update(items => [
      ...items.filter(item => item.user.id !== current.user.id),
      current,
    ]);
    this.edit(current);
    this.notice.set('Review this current role before saving.');
  }
  async save(): Promise<void> {
    if (this.form.invalid || this.state.busy()) return;
    this.notice.set('');
    const input: MembershipIntention = {
      projectId: this.projectId,
      ...this.form.getRawValue(),
      expectedRevision: this.selected()?.revision ?? '0',
    };
    await this.state.run(async () => {
      await this.api.set(
        input.projectId,
        input.userId,
        input.role,
        input.expectedRevision,
        this.retry.reference(input),
      );
      this.retry.finish();
      this.selected.set(null);
      this.form.reset();
      await this.loadMemberships();
      this.notice.set('Project role saved.');
    });
  }
  async remove(membership: MembershipView): Promise<void> {
    if (this.state.busy()) return;
    this.notice.set('');
    const input = {
      projectId: this.projectId,
      userId: membership.user.id,
      expectedRevision: membership.revision,
    };
    await this.state.run(async () => {
      await this.api.remove(
        input.projectId,
        input.userId,
        input.expectedRevision,
        this.removeRetry.reference(input),
      );
      this.removeRetry.finish();
      await this.loadMemberships();
      this.notice.set('Project access removed.');
    });
  }
}
