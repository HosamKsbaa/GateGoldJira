import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  viewChild,
} from '@angular/core';
import { RequestState } from './request-state';

@Component({
  selector: 'gg-request-status',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (state().busy()) {
      <p role="status">Loading…</p>
    }
    @if (state().message()) {
      <div class="notice error" role="alert" tabindex="-1" #errorSummary>
        <p>{{ state().message() }}</p>
        @if (state().failure(); as failure) {
          @for (field of failure.payload.error.fieldErrors; track $index) {
            <p>{{ field.field }}: {{ field.message }}</p>
          }
          @switch (failure.payload.error.nextAction) {
            @case ('retry_same_reference') {
              <p>You can retry this save with the same values.</p>
            }
            @case ('contact_administrator') {
              <p>Contact a company administrator to check your access.</p>
            }
            @case ('reload_current_state') {
              <p>Reload and review the current record before saving again.</p>
            }
          }
        }
      </div>
    }
  `,
})
export class RequestStatusComponent {
  readonly state = input.required<RequestState>();
  private readonly summary = viewChild<ElementRef<HTMLElement>>('errorSummary');
  constructor() {
    afterRenderEffect(() => {
      if (this.state().message()) this.summary()?.nativeElement.focus();
    });
  }
}
