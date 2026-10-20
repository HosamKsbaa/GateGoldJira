import {test} from 'node:test';
import assert from 'node:assert/strict';
import {capturedFrontendSources,frontendSourcePath,validateUnitCoverageSources} from '../lib/coverage-source-provenance.mjs';

test('accepts the exact full source denominator independently of browser loading', () => {
  assert.doesNotThrow(() => validateUnitCoverageSources({a:'one', b:'two'}, {b:'two', a:'one'}, ['b','a']));
});

test('rejects a changed unloaded file and added or removed source files', () => {
  assert.throws(() => validateUnitCoverageSources({a:'old'}, {a:'new'}, ['a']), /hashes differ/);
  assert.throws(() => validateUnitCoverageSources({a:'one'}, {a:'one', b:'two'}, ['a']), /source files differ/);
  assert.throws(() => validateUnitCoverageSources({a:'one', b:'two'}, {a:'one'}, ['a','b']), /source files differ/);
});

test('rejects omitted and duplicate denominator entries even when all hashes match', () => {
  assert.throws(() => validateUnitCoverageSources({a:'one', b:'two'}, {a:'one', b:'two'}, ['a']), /denominator/);
  assert.throws(() => validateUnitCoverageSources({a:'one'}, {a:'one'}, ['a','a']), /denominator/);
});


test('captured frontend inventory includes bootstrap and excludes exactly tests and API generated directories', () => {
  const captured = capturedFrontendSources({
    'frontend/src/main.ts':'bootstrap', 'frontend/src/app/app.ts':'app',
    'frontend/src/features/generated/handwritten.ts':'retained',
    'frontend/src/main.spec.ts':'test', 'frontend/src/app/app.spec.ts':'test',
    'frontend/src/app/api/generated/sdk.ts':'generated', 'frontend/src/app/api/fixture-generated/sdk.ts':'generated',
    'frontend/playwright.config.ts':'tooling', 'backend/main.go':'backend',
  });
  assert.deepEqual(captured, {'src/main.ts':'bootstrap','src/app/app.ts':'app','src/features/generated/handwritten.ts':'retained'});
  assert.throws(() => capturedFrontendSources({'frontend/playwright.config.ts':'tooling'}), /empty/);
});

test('only exact captured source-relative names and known frontend roots can resolve bootstrap', () => {
  const captured = {'src/main.ts':'bootstrap','src/app/app.ts':'app'}, roots = ['/project/frontend','/capture/source/frontend'];
  for (const path of ['src/main.ts','./src/main.ts','frontend/src/main.ts','/project/frontend/src/main.ts','/capture/source/frontend/src/main.ts','file:///capture/source/frontend/src/main.ts']) {
    assert.equal(frontendSourcePath(path,captured,roots),'src/main.ts',path);
  }
  assert.equal(frontendSourcePath('src/app/app.ts',captured,roots),'src/app/app.ts');
  assert.equal(frontendSourcePath('src/new-unrecorded.ts',captured,roots),null);
  assert.equal(frontendSourcePath('src/main.ts',{'src/app/app.ts':'app'},roots),null);
});

test('third-party bootstrap names, Angular extracted resources, and traversal never receive source credit', () => {
  const captured = {'src/main.ts':'bootstrap','src/app/app.ts':'app'}, roots = ['/project/frontend'];
  for (const path of [
    'node_modules/vendor/src/main.ts','/project/frontend/node_modules/vendor/src/main.ts',
    '/third-party/src/main.ts','/another/frontend/src/main.ts','file:///third-party/src/main.ts',
    'angular:jit:style:file;src/main.ts','angular:jit:template:file;/project/frontend/src/app/app.ts',
    'src/app/../../main.ts','src/main.ts?ngResource','src/main.spec.ts','src/app/api/generated/sdk.ts',
  ]) assert.equal(frontendSourcePath(path,captured,roots),null,path);
  assert.equal(frontendSourcePath('src/main.ts',captured,roots,'/project/frontend/node_modules/vendor'),null);
  assert.equal(frontendSourcePath('src/main.ts',captured,roots,'angular:jit:template'),null);
  assert.equal(frontendSourcePath('src/main.ts',captured,roots,'/unrelated/library'),null);
  assert.equal(frontendSourcePath('src/main.ts',captured,roots,'../../unrelated/library'),null);
  assert.equal(frontendSourcePath('src/main.ts',captured,roots,'/'),null);
  assert.equal(frontendSourcePath('src/main.ts',captured,roots,'/project/frontend/'),'src/main.ts');
});

test('bootstrap is mandatory in both the unit source manifest and its actual counter inventory', () => {
  const complete = {'src/main.ts':'bootstrap','src/app/app.ts':'app'};
  assert.throws(() => validateUnitCoverageSources({'src/app/app.ts':'app'},complete,['src/app/app.ts']), /source files differ/);
  assert.throws(() => validateUnitCoverageSources(complete,complete,['src/app/app.ts']), /denominator/);
  assert.throws(() => validateUnitCoverageSources({...complete,'src/main.ts':'stale'},complete,Object.keys(complete)), /hashes differ/);
  assert.doesNotThrow(() => validateUnitCoverageSources(complete,complete,Object.keys(complete)));
});
