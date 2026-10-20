import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { RequestState } from '../../shared/ui/request-state';
import { RequestStatusComponent } from '../../shared/ui/request-status.component';

@Component({
  imports: [ReactiveFormsModule, RequestStatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="panel narrow">
      <p class="eyebrow">Your team workspace</p><h1>Welcome to GateGoldJira</h1>
      <p>Sign in with your approved company account.</p>
      <gg-request-status [state]="state" />
      @if (auth.mode === 'development') {
        <div class="notice"
          >Local development · Test accounts only. Your session ends when you reload or sign
          out.</div
        >
        <form [formGroup]="form" (ngSubmit)="localSignIn()">
          <label for="local-username">Username</label>
          <input
            id="local-username"
            formControlName="username"
            type="text"
            autocomplete="username"
            autocapitalize="none"
            spellcheck="false"
            [attr.aria-invalid]="form.controls.username.hasError('maxlength') ? 'true' : null"
            [attr.aria-describedby]="form.controls.username.hasError('maxlength') ? 'local-username-error' : null"
            required
          />
          @if (form.controls.username.hasError('maxlength')) {
            <p id="local-username-error" class="field-hint error" role="alert">Username must be 64 characters or fewer.</p>
          }
          <label for="local-password">Password</label>
          <input
            id="local-password"
            formControlName="password"
            type="password"
            autocomplete="current-password"
            [attr.aria-invalid]="form.controls.password.hasError('maxlength') ? 'true' : null"
            [attr.aria-describedby]="form.controls.password.hasError('maxlength') ? 'local-password-error' : null"
            required
          />
          @if (form.controls.password.hasError('maxlength')) {
            <p id="local-password-error" class="field-hint error" role="alert">Password must be 72 characters or fewer.</p>
          }
          <button type="submit" [disabled]="form.invalid || state.busy()">Sign in locally</button>
        </form>
      } @else {
        <button type="button" (click)="googleSignIn()" [disabled]="state.busy()"
          >Continue with Google</button
        >
      }
    </section>
  `,
})
export class SignInPage {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly state = new RequestState();
  readonly form = new FormGroup({
    username: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/\S/), Validators.maxLength(64)],
    }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(72)],
    }),
  });
  async localSignIn(): Promise<void> {
    if (this.form.invalid) return;
    await this.state.run(async () => {
      const { username, password } = this.form.getRawValue();
      this.form.controls.password.reset();
      const result = await this.auth.signInLocalCredentials(username, password);
      if (result === 'superseded') return;
      if (result === 'invalid-credentials') {
        this.state.message.set('The username or password is incorrect.');
        return;
      }
      if (result === 'access-denied') {
        this.state.message.set(
          'This account cannot sign in. Contact an administrator to check your access.',
        );
        return;
      }
      if (result === 'unavailable') {
        this.state.message.set(
          'The local sign-in service is unavailable. Check that the backend is running and try again.',
        );
        return;
      }
      const target = this.route.snapshot.queryParamMap.get('returnTo') ?? '/';
      await this.router.navigateByUrl(
        target.startsWith('/') && !target.startsWith('//') && !target.startsWith('/sign-in')
          ? target
          : '/',
      );
    });
  }
  async googleSignIn(): Promise<void> {
    await this.state.run(() => this.auth.signIn());
  }
}
