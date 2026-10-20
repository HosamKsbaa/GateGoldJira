import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { WorkspaceApi } from '../workspace/workspace-api.service';
import { AuthService } from './auth.service';

export const signedInGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  try {
    return (
      (await auth.refresh()) !== null ||
      router.createUrlTree(['/sign-in'], { queryParams: { returnTo: state.url } })
    );
  } catch {
    return router.createUrlTree(['/sign-in'], { queryParams: { returnTo: state.url } });
  }
};

export const adminGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  try {
    const me = await auth.refresh();
    if (!me) return router.createUrlTree(['/sign-in'], { queryParams: { returnTo: state.url } });
    return me.administrator || router.createUrlTree(['/']);
  } catch {
    return router.createUrlTree(['/sign-in']);
  }
};

export const projectAdminGuard: CanActivateFn = async (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const workspace = inject(WorkspaceApi);
  try {
    const me = await auth.refresh();
    if (!me) return router.createUrlTree(['/sign-in'], { queryParams: { returnTo: state.url } });
    if (me.administrator) return true;
    const project = await workspace.project(route.paramMap.get('projectId') ?? '');
    return (
      (project.effectiveRole === 'project_admin' && !project.archived) ||
      router.createUrlTree(['/projects', project.id])
    );
  } catch {
    return router.createUrlTree(['/']);
  }
};
