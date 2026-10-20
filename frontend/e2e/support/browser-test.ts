import { test as base, expect } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { scriptMapReference } from '../../../scripts/lib/browser-source-map.mjs';

// Compatibility stories seed through V1, then exercise the current canonical UI.
// Native stories own separate projects and activate through the public service.
// A previous story's V2 save must not change the next story's seed contract.
export const test = base.extend<{ compatibilityDemo: void }>({
  page: async ({ page }, use, info) => {
    const runtimeErrors: string[] = [];
    const runtimeDetails: Array<{ kind: string; message: string; stack?: string }> = [];
    page.on('pageerror', error => {
      runtimeErrors.push('uncaught_page_error');
      runtimeDetails.push({ kind: error.name, message: error.message, ...(error.stack ? { stack: error.stack } : {}) });
    });
    page.on('console', message => {
      if (message.type() === 'error' && /^ERROR\b/.test(message.text())) {
        runtimeErrors.push('angular_runtime_error');
        runtimeDetails.push({ kind: 'angular_runtime_error', message: message.text() });
      }
    });
    const assertNoRuntimeErrors = async () => {
      if (runtimeDetails.length) {
        // Details can include private fixture data. Keep them in the owned test
        // output; the public assertion and curated CI upload stay opaque.
        await mkdir(info.outputDir, { recursive: true });
        await writeFile(info.outputPath('runtime-errors.json'), JSON.stringify(runtimeDetails));
      }
      expect(runtimeErrors, 'Unexpected application runtime errors').toEqual([]);
    };
    const directory = process.env['GATEGOLD_JS_COVERAGE_DIRECTORY'];
    if (!directory) {
      try {await use(page);} finally {await assertNoRuntimeErrors();}
      return;
    }
    await page.coverage.startJSCoverage({ resetOnNavigation: false });
    try { await use(page); }
    finally {
      if (!page.isClosed()) {
        const entries = (await page.coverage.stopJSCoverage()).filter(entry => {
          try {
            const path = new URL(entry.url).pathname;
            return !path.includes('node_modules') && !path.includes('/.angular/') && !path.startsWith('/@vite/');
          } catch { return false; }
        });
        const mappedEntries = await Promise.all(entries.map(async entry => {
          // Embedded component CSS can contain its own map. Only the final
          // top-level JavaScript source-map comment describes this script.
          const reference = entry.source ? scriptMapReference(entry.source) : undefined;
          if (!reference || reference.startsWith('data:')) return entry;
          try {
            const mapUrl = new URL(reference, entry.url);
            if (mapUrl.origin !== new URL(entry.url).origin) return {...entry, mapError:true};
            const response = await page.request.get(mapUrl.href);
            if (!response.ok()) return {...entry, mapError:true};
            const sourceMap: unknown = await response.json();
            return {...entry, sourceMap};
          } catch { return {...entry, mapError:true}; }
        }));
        await mkdir(directory, { recursive: true });
        const id = createHash('sha256').update(info.testId + ':' + info.retry).digest('hex');
        await writeFile(resolve(directory, id + '.json.gz'), gzipSync(JSON.stringify(mappedEntries)));
      }
      await assertNoRuntimeErrors();
    }
  },
  compatibilityDemo: [
    async ({}, use) => {
      const database = process.env['GATEGOLD_E2E_DATABASE_NAME'];
      if (!database || !/^gg_browser_[0-9a-f]{32}$/.test(database))
        throw new Error('Browser acceptance requires a disposable gg_browser database.');
      await promisify(execFile)('docker', [
        'compose',
        '-f',
        resolve('../compose.dev.yaml'),
        'exec',
        '-T',
        'postgres',
        'psql',
        '--username=gategoldjira',
        '--dbname=' + database,
        '-v',
        'ON_ERROR_STOP=1',
        '-c',
        "UPDATE projects SET core_mode='legacy' WHERE id='20000000-0000-4000-8000-000000000001' AND key='DEMO';",
      ]);
      await use();
    },
    { auto: true },
  ],
});
