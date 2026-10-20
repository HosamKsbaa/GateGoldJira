import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type {
  ActivateFields,
  ActivationReadiness,
  ConfigurationView,
} from '../../../../api/generated/types.gen';
import { AuthService } from '../../../../core/auth/auth.service';
import { ApiError } from '../../../../core/api/api-result';
import { DraftsService } from '../../../../core/drafts/drafts.service';
import { RequestState } from '../../../../shared/ui/request-state';
import { RequestStatusComponent } from '../../../../shared/ui/request-status.component';
import { ProjectConfigurationApi } from '../../project-configuration.api';

@Component({
  selector: 'gg-project-activation',
  imports: [FormsModule, RouterLink, RequestStatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<section class="activation" aria-labelledby="activation-heading"
    ><h2 id="activation-heading">New issue mode</h2>
    @if (configuration().mode === 'modern') {
      <p role="status"
        >New issue mode is active. Custom choices, workflows and independent boards are
        available.</p
      ><a [routerLink]="['/issues']" [queryParams]="{ projectId: projectId() }">Open issues</a>
    } @else {
      <p
        >Enable custom types and priorities, workflow rules and independent board layouts. Existing
        work, discussions, files and history retain their identities.</p
      >
      <button
        type="button"
        class="secondary"
        (click)="review()"
        [disabled]="state.busy() || !!pending() || disabled()"
        >Review activation</button
      >
      @if (readiness(); as review) {
        <div class="review" aria-label="Activation review"
          ><p
            ><strong>{{ review.issueCount }} existing issues</strong> will keep their current
            values. Readiness is checked again when you activate.</p
          >
          @if (review.ready) {
            <p role="status"
              >Creation defaults, workflow completion paths and default-board coverage are ready.</p
            >
          } @else {
            <ul>
              @for (problem of review.problems; track $index) {
                <li>{{ problem.message }}</li>
              }
            </ul>
          }
          <p class="muted"
            >This enables the new editor for the whole project. Returning to the old editor requires
            checking that new configuration can be represented there.</p
          >
          <label class="check"
            ><input
              type="checkbox"
              aria-label="Confirm new issue mode"
              [(ngModel)]="confirmed"
              [disabled]="state.busy() || !!pending() || !review.ready"
            />I reviewed the project and want to enable new issue mode.</label
          >
          <button
            type="button"
            (click)="activate()"
            [disabled]="state.busy() || !!pending() || disabled() || !confirmed || !review.ready"
            >Activate new issue mode</button
          ></div
        >
      }
    }
    <gg-request-status [state]="state" />
    @if (pending()) {
      <p class="notice">The activation outcome is uncertain. Retry the same reviewed activation.</p
      ><button type="button" (click)="retry()" [disabled]="state.busy()"
        >Retry original activation</button
      >
    }
  </section>`,
  styles: `
    .activation {
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      padding: 1rem 1.25rem;
      margin-block: 1rem;
      background: #f7f9fc;
    }
    h2 {
      font-size: 1rem;
      margin-top: 0;
    }
    .review {
      margin-top: 1rem;
      border-top: 1px solid var(--color-border);
      padding-top: 1rem;
    }
    .check {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-block: 1rem;
    }
    .check input {
      width: auto;
    }
  `,
})
export class ProjectActivationComponent {
  readonly projectId = input.required<string>();
  readonly configuration = input.required<ConfigurationView>();
  readonly disabled = input(false);
  readonly activated = output<ConfigurationView>();
  private readonly api = inject(ProjectConfigurationApi);
  private readonly auth = inject(AuthService);
  private readonly drafts = inject(DraftsService);
  private readonly destroy = inject(DestroyRef);
  readonly readiness = signal<ActivationReadiness | null>(null);
  readonly state = new RequestState();
  readonly pending = signal<{ body: ActivateFields; reference: string } | null>(null);
  confirmed = false;
  private generation = 0;
  private restoredProject = '';
  constructor() {
    let epoch = this.auth.sessionEpoch();
    effect(() => {
      const next = this.auth.sessionEpoch();
      if (next === epoch) return;
      epoch = next;
      this.generation++;
      this.readiness.set(null);
      this.pending.set(null);
      this.confirmed = false;
      this.state.clear();
      this.state.busy.set(false);
    });
    effect(() => {
      const id = this.projectId();
      if (this.restoredProject === id) return;
      this.restoredProject = id;
      this.pending.set(this.drafts.activations.get(id) ?? null);
    });
    effect(() => {
      const id = this.projectId(),
        pending = this.pending();
      if (pending) this.drafts.activations.set(id, pending);
      else this.drafts.activations.delete(id);
      this.drafts.activate('activation:' + id, !!pending);
    });
    this.destroy.onDestroy(() => {
      this.generation++;
      this.drafts.release('activation:' + this.projectId());
    });
  }
  async review() {
    if (this.pending() || this.disabled()) return;
    const generation = ++this.generation,
      epoch = this.auth.sessionEpoch();
    this.confirmed = false;
    this.readiness.set(null);
    await this.state.run(
      async () => {
        const review = await this.api.activation(this.projectId());
        if (generation === this.generation && epoch === this.auth.sessionEpoch())
          this.readiness.set(review);
      },
      () =>
        !this.destroy.destroyed &&
        generation === this.generation &&
        epoch === this.auth.sessionEpoch(),
    );
  }
  async activate() {
    const review = this.readiness();
    if (!review?.ready || !this.confirmed || this.disabled() || this.pending() || this.state.busy())
      return;
    this.pending.set({
      body: {
        expectedRevision: review.configuration.revision,
        expectedProjectRevision: review.projectRevision,
        expectedBoardId: review.defaultBoardId,
        expectedBoardRevision: review.defaultBoardRevision,
        confirm: true,
      },
      reference: crypto.randomUUID(),
    });
    await this.retry();
  }
  async retry() {
    const pending = this.pending();
    if (!pending) return;
    const epoch = this.auth.sessionEpoch();
    await this.state.run(
      async () => {
        try {
          const saved = await this.api.activate(this.projectId(), pending.body, pending.reference);
          if (epoch !== this.auth.sessionEpoch()) return;
          this.pending.set(null);
          this.readiness.set(null);
          this.activated.emit(saved.result);
        } catch (error: unknown) {
          if (
            epoch === this.auth.sessionEpoch() &&
            error instanceof ApiError &&
            !error.payload.error.retryable
          ) {
            this.pending.set(null);
            this.readiness.set(null);
            this.confirmed = false;
          }
          throw error;
        }
      },
      () => !this.destroy.destroyed && epoch === this.auth.sessionEpoch(),
    );
  }
}
