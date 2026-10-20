import { draftGuard } from '../../core/drafts/drafts.service';
import type { Routes } from '@angular/router';
export const boardRoutes: Routes = [
  {
    path: 'project/:projectId',
    canDeactivate: [draftGuard],
    loadComponent: () =>
      import('./pages/modern-board-settings/modern-board-settings.page').then(
        m => m.ModernBoardSettingsPage,
      ),
  },
  {
    path: ':boardId/settings',
    canDeactivate: [draftGuard],
    loadComponent: () =>
      import('./pages/modern-board-settings/modern-board-settings.page').then(
        m => m.ModernBoardSettingsPage,
      ),
  },
  {
    path: ':boardId',
    canDeactivate: [draftGuard],
    loadComponent: () =>
      import('./pages/modern-kanban/modern-kanban.page').then(m => m.ModernKanbanPage),
  },
];

