import { signal } from '@angular/core';
import { ApiError } from '../../core/api/api-result';

export class RequestState {
  readonly busy = signal(false);
  readonly message = signal('');
  readonly failure = signal<ApiError | null>(null);
  clear(): void {
    this.message.set('');
    this.failure.set(null);
  }
  async run(action: () => Promise<void>, isCurrent: () => boolean = () => true): Promise<void> {
    if (this.busy() || !isCurrent()) return;
    this.clear();
    this.busy.set(true);
    try {
      await action();
    } catch (error: unknown) {
      if (!isCurrent()) return;
      if (error instanceof ApiError) {
        this.failure.set(error);
        this.message.set(error.message);
      } else
        this.message.set(
          'The request could not be completed. Check your connection and try again.',
        );
    } finally {
      if (isCurrent()) this.busy.set(false);
    }
  }
}
