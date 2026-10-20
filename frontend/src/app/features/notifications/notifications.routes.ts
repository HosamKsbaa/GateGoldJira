import type { Routes } from '@angular/router';
export const notificationRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/inbox/inbox.page').then(module => module.InboxPage),
  },
];
