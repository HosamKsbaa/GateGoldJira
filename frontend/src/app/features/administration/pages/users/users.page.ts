import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  Injector,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AdministrationApi } from '../../administration.api';
import type {
  ApproveFields,
  UpdateUserFields,
  UserView,
} from '../../../../api/generated/types.gen';
import { zUserView } from '../../../../api/generated/zod.gen';
import { AuthService } from '../../../../core/auth/auth.service';
import { RetryIntent } from '../../../../core/api/api-result';
import { unicodeLength } from '../../../../shared/forms/unicode.validators';
import { RequestState } from '../../../../shared/ui/request-state';
import { RequestStatusComponent } from '../../../../shared/ui/request-status.component';
import { focusAfterRender } from '../../../../shared/ui/focus-after-render';

const nameControl = () =>
  new FormControl('', { nonNullable: true, validators: [Validators.required, unicodeLength(100)] });
const emailControl = () =>
  new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] });

@Component({
  imports: [ReactiveFormsModule, RequestStatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="page-heading"
      ><div><p class="eyebrow">Administration</p><h1>Company users</h1></div>
      <button type="button" (click)="reload()" [disabled]="state.busy()"
        >Refresh users</button
      ></header
    >
    <gg-request-status [state]="state" />
    @if (notice()) {
      <p class="notice" role="status">{{ notice() }}</p>
    }
    <div class="split">
      <section class="panel"
        ><h2>Approved accounts</h2><p>Disabled users keep their history and memberships.</p>
        @if (!users().length && !state.busy()) {
          <p>No accounts to display.</p>
        }
        <ul class="records">
          @for (user of users(); track user.id) {
            <li
              ><div
                ><strong dir="auto">{{ user.displayName }}</strong
                ><p
                  ><bdi>{{ user.email }}</bdi></p
                >
                <span
                  >{{ user.active ? 'Active' : 'Disabled' }} ·
                  {{ user.administrator ? 'Administrator' : 'Project roles' }}</span
                ></div
              >
              <button
                type="button"
                (click)="edit(user)"
                [attr.aria-label]="'Edit ' + user.displayName"
                [disabled]="state.busy()"
                >Edit</button
              ></li
            >
          }
        </ul>
        @if (cursor()) {
          <button type="button" (click)="loadMore()" [disabled]="state.busy()">More users</button>
        }
      </section>
      <section class="panel">
        @if (selected(); as user) {
          <h2>Edit account</h2>
          <form [formGroup]="editForm" (ngSubmit)="saveUser()">
            <label for="edit-name">Display name</label
            ><input
              id="edit-name"
              formControlName="displayName"
              dir="auto"
              required
              aria-describedby="name-help"
            />
            <label for="edit-email">Email</label
            ><input id="edit-email" type="email" formControlName="email" required />
            <label class="checkbox"
              ><input type="checkbox" formControlName="active" /> Active account</label
            >
            <label class="checkbox"
              ><input type="checkbox" formControlName="administrator" /> Company
              administrator</label
            >
            <p
              >Removing access clears assignments the user can no longer work on. Restoring access
              does not restore those assignments.</p
            >
            <div class="actions"
              ><button type="submit" [disabled]="editForm.invalid || state.busy()"
                >Save account</button
              >
              <button type="button" class="secondary" (click)="cancelEdit()">Cancel</button></div
            >
          </form>
          @if (currentConflict(); as current) {
            <div class="notice"
              ><p
                >Current account: <bdi>{{ current.displayName }}</bdi
                >, {{ current.active ? 'active' : 'disabled' }},
                {{ current.administrator ? 'administrator' : 'project roles' }}.</p
              >
              <button type="button" (click)="reviewCurrent(current)"
                >Review current account</button
              ></div
            >
          }
        } @else {
          <h2>Approve a user</h2><p>Only approved users can enter the workspace.</p>
          @if (localDevelopment) {
            <p class="notice"
              >This workspace uses local test accounts. Approval grants company access; it does not
              create a local username or password.</p
            >
          } @else if (passwordSignIn) {
            <p class="notice">Approve the employee's email and grant a project role. Ask the workspace operator to create a username and password for that approved email, then share their sign-in details privately.</p>
          } @else {
            <p class="notice"
              >Approve their company Google email, grant a project role, then share the workspace
              link. They sign in with that same Google account. This form does not send an
              invitation email.</p
            >
          }
          <form [formGroup]="approvalForm" (ngSubmit)="approve()">
            <label for="approve-name">Display name</label
            ><input
              id="approve-name"
              formControlName="displayName"
              dir="auto"
              required
              aria-describedby="name-help"
            />
            <label for="approve-email">Email</label
            ><input id="approve-email" type="email" formControlName="email" required />
            <label class="checkbox"
              ><input type="checkbox" formControlName="administrator" /> Company
              administrator</label
            >
            <button type="submit" [disabled]="approvalForm.invalid || state.busy()"
              >Approve user</button
            >
          </form>
        }
        <p id="name-help" class="muted">Display names support Arabic and up to 100 characters.</p>
      </section>
    </div>
  `,
})
export class UsersPage {
  private readonly api = inject(AdministrationApi);
  private readonly auth = inject(AuthService);
  readonly localDevelopment = this.auth.mode === 'development';
  readonly passwordSignIn = this.auth.mode === 'password';
  private readonly injector = inject(Injector);
  readonly state = new RequestState();
  readonly users = signal<UserView[]>([]);
  readonly cursor = signal<string | null>(null);
  readonly selected = signal<UserView | null>(null);
  readonly notice = signal('');
  readonly approvalForm = new FormGroup({
    displayName: nameControl(),
    email: emailControl(),
    administrator: new FormControl(false, { nonNullable: true }),
  });
  readonly editForm = new FormGroup({
    displayName: nameControl(),
    email: emailControl(),
    administrator: new FormControl(false, { nonNullable: true }),
    active: new FormControl(true, { nonNullable: true }),
  });
  private readonly approvalRetry = new RetryIntent<ApproveFields>();
  private readonly editRetry = new RetryIntent<{ userId: string; body: UpdateUserFields }>();

  constructor() {
    let epoch = this.auth.sessionEpoch();
    effect(() => {
      const current = this.auth.sessionEpoch();
      if (current !== epoch) {
        epoch = current;
        this.users.set([]);
        this.cursor.set(null);
        this.cancelEdit();
        this.approvalForm.reset();
        this.notice.set('');
      }
    });
    void this.reload();
  }
  private async load(cursor?: string): Promise<void> {
    const epoch = this.auth.sessionEpoch();
    const page = await this.api.users(cursor);
    if (epoch !== this.auth.sessionEpoch()) return;
    this.users.update(users => (cursor ? [...users, ...page.items] : page.items));
    this.cursor.set(page.nextCursor);
  }
  async reload(): Promise<void> {
    this.cancelEdit();
    await this.state.run(() => this.load());
  }
  async loadMore(): Promise<void> {
    const cursor = this.cursor();
    if (cursor) await this.state.run(() => this.load(cursor));
  }
  edit(user: UserView): void {
    this.selected.set(user);
    this.editRetry.finish();
    this.state.clear();
    this.notice.set('');
    this.editForm.setValue({
      displayName: user.displayName,
      email: user.email,
      active: user.active,
      administrator: user.administrator,
    });
    focusAfterRender('edit-name', this.injector);
  }
  cancelEdit(): void {
    this.selected.set(null);
    this.editRetry.finish();
    this.editForm.reset();
  }
  currentConflict(): UserView | null {
    const parsed = zUserView.safeParse(this.state.failure()?.payload.current);
    return parsed.success ? parsed.data : null;
  }
  reviewCurrent(current: UserView): void {
    this.edit(current);
    this.notice.set('Review these current values before saving.');
  }
  async approve(): Promise<void> {
    if (this.approvalForm.invalid || this.state.busy()) return;
    this.notice.set('');
    const body = this.approvalForm.getRawValue();
    await this.state.run(async () => {
      await this.api.approve(body, this.approvalRetry.reference(body));
      this.approvalRetry.finish();
      this.approvalForm.reset();
      await this.load();
      this.notice.set('User approved.');
    });
  }
  async saveUser(): Promise<void> {
    const user = this.selected();
    if (!user || this.editForm.invalid || this.state.busy()) return;
    this.notice.set('');
    const body: UpdateUserFields = {
      ...this.editForm.getRawValue(),
      expectedRevision: user.revision,
    };
    await this.state.run(async () => {
      await this.api.update(user.id, body, this.editRetry.reference({ userId: user.id, body }));
      this.cancelEdit();
      await this.auth.refresh();
      if (this.auth.me()?.administrator) await this.load();
      this.notice.set('Account saved.');
    });
  }
}
