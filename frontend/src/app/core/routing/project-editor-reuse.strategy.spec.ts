import '@angular/compiler';
import { convertToParamMap, type Route } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { ProjectEditorReuseStrategy } from './project-editor-reuse.strategy';

const editor: Route = { path: ':projectId/settings', data: { projectScopedEditor: true } };
function snapshot(projectId: string, routeConfig: Route = editor) {
  return { routeConfig, paramMap: convertToParamMap({ projectId }) };
}
describe('project-scoped editor lifetime', () => {
  const strategy = new ProjectEditorReuseStrategy();
  it('recreates an editor before a different project can reuse its drafts or request target', () => {
    expect(strategy.shouldReuseRoute(snapshot('B'), snapshot('A'))).toBe(false);
  });
  it('preserves the editor and uncertain retry when the project is unchanged', () => {
    expect(strategy.shouldReuseRoute(snapshot('A'), snapshot('A'))).toBe(true);
  });
  it('preserves reactive project views using the normal reuse policy', () => {
    const overview: Route = { path: ':projectId' };
    expect(strategy.shouldReuseRoute(snapshot('B', overview), snapshot('A', overview))).toBe(true);
  });
  it('never reuses different editor routes even within one project', () => {
    const fields: Route = { path: ':projectId/fields', data: { projectScopedEditor: true } };
    expect(strategy.shouldReuseRoute(snapshot('A', fields), snapshot('A'))).toBe(false);
  });
});
