import { afterNextRender, type Injector } from '@angular/core';

export function focusAfterRender(id: string, injector: Injector): void {
  afterNextRender(() => document.getElementById(id)?.focus(), { injector });
}
