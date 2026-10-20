import {fileURLToPath} from 'node:url';

function applicationSource(relative) {
  return relative.startsWith('src/') && relative.endsWith('.ts') && !relative.endsWith('.spec.ts') &&
    !relative.startsWith('src/app/api/generated/') && !relative.startsWith('src/app/api/fixture-generated/') &&
    !relative.split('/').some(part => !part || part === '.' || part === '..');
}

/** Derive the complete source authority from the captured repository inventory. */
export function capturedFrontendSources(captured) {
  const sources = {};
  for (const [path, hash] of Object.entries(captured)) {
    if (!path.startsWith('frontend/src/')) continue;
    const relative = path.slice('frontend/'.length);
    if (applicationSource(relative)) sources[relative] = hash;
  }
  if (!Object.keys(sources).length) throw new Error('Captured frontend source denominator is empty.');
  return sources;
}

/** Resolve only captured application members, never a third-party /src/main.ts. */
export function frontendSourcePath(source, captured, frontendRoots, sourceMapRoot = '') {
  if (typeof sourceMapRoot !== 'string' || sourceMapRoot.startsWith('angular:') || sourceMapRoot.replaceAll('\\', '/').split('/').includes('node_modules')) return null;
  let mapRoot = sourceMapRoot.replaceAll('\\', '/');
  if (mapRoot.startsWith('file:')) {
    try { mapRoot = fileURLToPath(mapRoot).replaceAll('\\', '/'); }
    catch { return null; }
  }
  if (mapRoot !== '/') mapRoot = mapRoot.replace(/\/$/, '');
  if (mapRoot && mapRoot !== '.' && !frontendRoots.some(root => root.replaceAll('\\', '/').replace(/\/$/, '') === mapRoot)) return null;
  if (typeof source !== 'string' || source.startsWith('angular:')) return null;
  let path = source.replaceAll('\\', '/');
  if (path.split('/').includes('node_modules')) return null;
  if (path.startsWith('file:')) {
    try { path = fileURLToPath(path).replaceAll('\\', '/'); }
    catch { return null; }
  }
  if (path.split('/').includes('node_modules')) return null;
  if (path.startsWith('./')) path = path.slice(2);
  let relative = path.startsWith('src/') ? path : path.startsWith('frontend/src/') ? path.slice('frontend/'.length) : null;
  if (relative === null) {
    for (const root of frontendRoots) {
      const prefix = root.replaceAll('\\', '/').replace(/\/$/, '') + '/';
      if (path.startsWith(prefix)) { relative = path.slice(prefix.length); break; }
    }
  }
  return relative !== null && applicationSource(relative) && Object.hasOwn(captured, relative) ? relative : null;
}

/** A full-source denominator must include every current handwritten source file.
 * Validate unloaded files too: their old unit counters must never receive credit
 * merely because the browser did not load the changed file.
 */
export function validateUnitCoverageSources(unitManifest, capturedManifest, unitPaths) {
  const expected = Object.keys(capturedManifest).sort();
  if (JSON.stringify(Object.keys(unitManifest).sort()) !== JSON.stringify(expected)) {
    throw new Error('Unit coverage source files differ from the captured application.');
  }
  if (JSON.stringify([...unitPaths].sort()) !== JSON.stringify(expected)) {
    throw new Error('Unit coverage is missing files from its full source denominator.');
  }
  for (const path of expected) {
    if (unitManifest[path] !== capturedManifest[path]) {
      throw new Error('Unit coverage source hashes differ from the captured application.');
    }
  }
}
