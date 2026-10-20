import { Injectable, effect, inject } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';

/** The last changed identity is retained; reads fetch current project permissions. */
@Injectable({ providedIn: 'root' })
export class ProjectDirectoryRecents {
  private readonly auth = inject(AuthService);
  id: string | null = null;
  constructor() {
    let epoch = this.auth.sessionEpoch();
    effect(() => {
      const current = this.auth.sessionEpoch();
      if (current !== epoch) {
        epoch = current;
        this.id = null;
      }
    });
  }
  remember(id: string): void {
    this.id = id;
  }
}
