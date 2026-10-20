import { draftGuard } from '../../core/drafts/drafts.service';
import { Routes } from '@angular/router';
export const issueRoutes: Routes = [
  {
    path: '',
    canDeactivate: [draftGuard],
    loadComponent: () =>
      import('./pages/issue-list/modern-issue-list.page').then(module => module.ModernIssueListPage),
  },
  {
    path: ':issueId',
    canDeactivate: [draftGuard],
    loadComponent: () =>
      import('./pages/issue-detail/modern-issue-detail.page').then(
        module => module.ModernIssueDetailPage,
      ),
  },
];

