import { BaseRouteReuseStrategy, type ActivatedRouteSnapshot } from '@angular/router';

type EditorRoute = Pick<ActivatedRouteSnapshot, 'routeConfig' | 'paramMap'>;

// Snapshot-based editors own drafts and retry references for exactly one project.
// Recreating them on a project change also runs their existing deactivation guards.
export class ProjectEditorReuseStrategy extends BaseRouteReuseStrategy {
  override shouldReuseRoute(future: EditorRoute, current: EditorRoute): boolean {
    if (future.routeConfig !== current.routeConfig) return false;
    if (future.routeConfig?.data?.['projectScopedEditor'] !== true) return true;
    return future.paramMap.get('projectId') === current.paramMap.get('projectId');
  }
}
