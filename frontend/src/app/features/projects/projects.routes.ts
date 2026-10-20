import type { Routes, CanDeactivateFn } from '@angular/router';
import { projectAdminGuard } from '../../core/auth/auth.guards';
import type { ProjectPlanningPage } from '../planning/project-planning.page';
const planningDraftGuard: CanDeactivateFn<ProjectPlanningPage> = component => component.mayLeave();
import type { ProjectWorkflowsPage } from './pages/project-workflows/project-workflows.page';
const workflowDraftGuard: CanDeactivateFn<ProjectWorkflowsPage> = (component) =>
  component.mayLeave();
import { draftGuard } from '../../core/drafts/drafts.service';
export const projectRoutes: Routes = [
  {
    path: ':projectId/workflows',
    data: { projectScopedEditor: true },
    canActivate: [projectAdminGuard],
    canDeactivate: [workflowDraftGuard],
    loadComponent: () =>
      import('./pages/project-workflows/project-workflows.page').then(
        (module) => module.ProjectWorkflowsPage,
      ),
  },
  {
    path: ':projectId/fields',
    data: { projectScopedEditor: true },
    canActivate: [projectAdminGuard],
    canDeactivate: [draftGuard],
    loadComponent: () =>
      import('./pages/project-fields/project-fields.page').then(
        (module) => module.ProjectFieldsPage,
      ),
  },
  {
    path: ':projectId/settings',
    data: { projectScopedEditor: true },
    canActivate: [projectAdminGuard],
    canDeactivate: [draftGuard],
    loadComponent: () =>
      import('./pages/project-configuration/project-configuration.page').then(
        (module) => module.ProjectConfigurationPage,
      ),
  },
  {
    path: '',
    loadComponent: () =>
      import('./pages/project-list/project-list.page').then((module) => module.ProjectListPage),
  },
  {
    path: ':projectId/planning',
    data: { projectScopedEditor: true },
    canDeactivate: [planningDraftGuard],
    loadComponent: () =>
      import('../planning/project-planning.page').then((module) => module.ProjectPlanningPage),
  },
  {
    path: ':projectId/reports',
    loadComponent: () =>
      import('../planning/kanban-report.page').then((module) => module.KanbanReportPage),
  },
  {
    path: ':projectId/import-export',
    canDeactivate: [draftGuard],
    loadComponent: () =>
      import('../import-export/pages/import-export/import-export.page').then(
        (module) => module.ImportExportPage,
      ),
  },
  {
    path: ':projectId/automation',
    loadComponent: () =>
      import('../integrations/automation-rules.page').then((module) => module.AutomationRulesPage),
  },
  {
    path: ':projectId',
    loadComponent: () =>
      import('./pages/project-overview/project-overview.page').then(
        (module) => module.ProjectOverviewPage,
      ),
  },
];
