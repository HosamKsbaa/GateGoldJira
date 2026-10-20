import { Routes } from '@angular/router';
import { draftGuard } from './core/drafts/drafts.service';
import { adminGuard, projectAdminGuard, signedInGuard } from './core/auth/auth.guards';

export const routes: Routes = [
  {
    path: 'account/mcp-authorize',
    canActivate: [signedInGuard],
    loadComponent: () => import('./features/account/mcp-authorize.page').then(module => module.McpAuthorizePage),
  },
  {
    path: 'account/mcp-tokens',
    canActivate: [signedInGuard],
    loadComponent: () => import('./features/account/mcp-tokens.page').then(module => module.McpTokensPage),
  },
  {
    path: 'sign-in',
    loadComponent: () => import('./core/auth/sign-in.page').then((module) => module.SignInPage),
  },
  {
    path: 'projects',
    canActivate: [signedInGuard],
    loadChildren: () =>
      import('./features/projects/projects.routes').then((module) => module.projectRoutes),
  },
  {
    path: 'notifications',
    canActivate: [signedInGuard],
    loadChildren: () =>
      import('./features/notifications/notifications.routes').then(
        (module) => module.notificationRoutes,
      ),
  },
  {
    path: 'backlog/:projectId',
    canActivate: [signedInGuard],
    canDeactivate: [draftGuard],
    loadComponent: () =>
      import('./features/issues/pages/backlog/backlog.page').then((module) => module.BacklogPage),
  },
  {
    path: 'issues',
    canActivate: [signedInGuard],
    loadChildren: () =>
      import('./features/issues/issues.routes').then((module) => module.issueRoutes),
  },
  {
    path: 'boards',
    canActivate: [signedInGuard],
    loadChildren: () =>
      import('./features/boards/boards.routes').then((module) => module.boardRoutes),
  },
  {
    path: 'admin/activity',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./features/administration/pages/activity/activity.page').then(
        (module) => module.ActivityPage,
      ),
  },
  {
    path: 'admin/users',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./features/administration/pages/users/users.page').then((module) => module.UsersPage),
  },
  {
    path: 'admin/projects/:projectId/memberships',
    data: { projectScopedEditor: true },
    canActivate: [projectAdminGuard],
    loadComponent: () =>
      import('./features/administration/pages/memberships/memberships.page').then(
        (module) => module.MembershipsPage,
      ),
  },
  {
    path: '',
    pathMatch: 'full',
    canActivate: [signedInGuard],
    loadComponent: () =>
      import('./core/workspace/workspace.page').then((module) => module.WorkspacePage),
  },
  { path: '**', redirectTo: '' },
];
