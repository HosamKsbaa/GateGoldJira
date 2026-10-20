import { DestroyRef, inject } from '@angular/core';
/** Poll only while visible and idle; keep request ownership with the caller. */
export function foregroundRefresh(allowed: () => boolean, refresh: () => Promise<void>): void {
  const destroy = inject(DestroyRef);
  let running = false;
  const tick = async () => {
    if (running || document.visibilityState !== 'visible' || !navigator.onLine || !allowed())
      return;
    running = true;
    try {
      await refresh();
    } catch {
      /* Keep confirmed content; the next tick or manual refresh retries. */
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), 30000);
  const visible = () => void tick();
  document.addEventListener('visibilitychange', visible);
  window.addEventListener('online', visible);
  destroy.onDestroy(() => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', visible);
    window.removeEventListener('online', visible);
  });
}
