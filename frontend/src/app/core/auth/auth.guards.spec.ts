import '@angular/compiler';
import { Injector, runInInjectionContext } from '@angular/core';
import { ActivatedRouteSnapshot, Router, UrlTree, type NavigationExtras, type RouterStateSnapshot } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service';
import { WorkspaceApi } from '../workspace/workspace-api.service';
import { adminGuard, projectAdminGuard, signedInGuard } from './auth.guards';
import type { Me, ProjectView } from '../../api/generated/types.gen';

const member: Me = { userId: '10000000-0000-4000-8000-000000000002', email: 'member@example.test', displayName: 'عضو', administrator: false, companyTimeZone: 'Africa/Cairo' };
const route = new ActivatedRouteSnapshot();
route.params = { projectId: '20000000-0000-4000-8000-000000000001' };
const state = { url: '/projects/' + route.params['projectId'] + '/workflows?view=rules' } as RouterStateSnapshot;

function setup() {
  const refresh = vi.fn<() => Promise<Me | null>>().mockResolvedValue(member);
  const project = vi.fn<(id: string) => Promise<Pick<ProjectView, 'id' | 'effectiveRole' | 'archived'>>>()
    .mockResolvedValue({ id: route.params['projectId'], effectiveRole: 'project_admin', archived: false });
  const redirect = new UrlTree();
  const createUrlTree = vi.fn<(commands: string[], extras?: NavigationExtras) => UrlTree>().mockReturnValue(redirect);
  const injector = Injector.create({ providers: [
    { provide: AuthService, useValue: { refresh } },
    { provide: WorkspaceApi, useValue: { project } },
    { provide: Router, useValue: { createUrlTree } },
  ] });
  const invoke = (guard: typeof signedInGuard) => runInInjectionContext(injector, () => guard(route, state));
  return { refresh, project, redirect, createUrlTree, invoke };
}

describe('route guards use fresh authority before exposing protected navigation', () => {
  it('allows a refreshed company member and does not load unrelated project data', async () => {
    const f = setup();
    expect(await f.invoke(signedInGuard)).toBe(true);
    expect(f.refresh).toHaveBeenCalledTimes(1);
    expect(f.project).not.toHaveBeenCalled();
    expect(f.createUrlTree).not.toHaveBeenCalled();
  });
  for (const failure of ['signed-out', 'unavailable'] as const) it('retains the complete return destination after ' + failure, async () => {
    const f = setup();
    if (failure === 'signed-out') f.refresh.mockResolvedValue(null);
    else f.refresh.mockRejectedValue(new Error('Identity service unavailable'));
    expect(await f.invoke(signedInGuard)).toBe(f.redirect);
    expect(f.createUrlTree).toHaveBeenCalledExactlyOnceWith(['/sign-in'], { queryParams: { returnTo: state.url } });
    expect(f.project).not.toHaveBeenCalled();
  });
  it('grants company administration only to the current refreshed administrator', async () => {
    const f = setup(); f.refresh.mockResolvedValue({ ...member, administrator: true });
    expect(await f.invoke(adminGuard)).toBe(true);
    expect(f.createUrlTree).not.toHaveBeenCalled();
  });
  it('takes a member away from company administration without querying private project data', async () => {
    const f = setup(); expect(await f.invoke(adminGuard)).toBe(f.redirect);
    expect(f.createUrlTree).toHaveBeenCalledExactlyOnceWith(['/']);
    expect(f.project).not.toHaveBeenCalled();
  });
  it('retains the requested admin destination for an unsigned user', async () => {
    const f = setup(); f.refresh.mockResolvedValue(null);
    expect(await f.invoke(adminGuard)).toBe(f.redirect);
    expect(f.createUrlTree).toHaveBeenCalledExactlyOnceWith(['/sign-in'], { queryParams: { returnTo: state.url } });
  });
  it('fails company administration closed when identity refresh fails', async () => {
    const f = setup(); f.refresh.mockRejectedValue(new Error('Unavailable'));
    expect(await f.invoke(adminGuard)).toBe(f.redirect);
    expect(f.createUrlTree).toHaveBeenCalledExactlyOnceWith(['/sign-in']);
  });
  it('lets a current company administrator enter project settings without a second scoped request', async () => {
    const f = setup(); f.refresh.mockResolvedValue({ ...member, administrator: true });
    expect(await f.invoke(projectAdminGuard)).toBe(true);
    expect(f.project).not.toHaveBeenCalled();
  });
  it('checks the exact project and accepts its active administrator', async () => {
    const f = setup(); expect(await f.invoke(projectAdminGuard)).toBe(true);
    expect(f.project).toHaveBeenCalledExactlyOnceWith(route.params['projectId']);
    expect(f.createUrlTree).not.toHaveBeenCalled();
  });
  for (const [role, archived] of [['viewer', false], ['member', false], ['project_admin', true]] as const) it('returns a ' + role + (archived ? ' of an archived project' : '') + ' to the scoped project', async () => {
    const f = setup(); f.project.mockResolvedValue({ id: route.params['projectId'], effectiveRole: role, archived });
    expect(await f.invoke(projectAdminGuard)).toBe(f.redirect);
    expect(f.createUrlTree).toHaveBeenCalledExactlyOnceWith(['/projects', route.params['projectId']]);
  });
  it('redirects a signed-out project administrator before reading private project metadata', async () => {
    const f = setup(); f.refresh.mockResolvedValue(null);
    expect(await f.invoke(projectAdminGuard)).toBe(f.redirect);
    expect(f.project).not.toHaveBeenCalled();
    expect(f.createUrlTree).toHaveBeenCalledExactlyOnceWith(['/sign-in'], { queryParams: { returnTo: state.url } });
  });
  for (const failure of ['identity', 'project'] as const) it('fails project navigation closed after a rejected ' + failure + ' lookup', async () => {
    const f = setup();
    if (failure === 'identity') f.refresh.mockRejectedValue(new Error('Unavailable'));
    else f.project.mockRejectedValue(new Error('Project is no longer accessible'));
    expect(await f.invoke(projectAdminGuard)).toBe(f.redirect);
    expect(f.createUrlTree).toHaveBeenCalledExactlyOnceWith(['/']);
  });
});
