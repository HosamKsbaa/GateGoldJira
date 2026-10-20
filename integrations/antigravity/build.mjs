import { build } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const output = join(root, 'dist', 'gategoldjira');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(join(root, 'plugin'), output, { recursive: true });
const result = await build({ entryPoints: ['sidecar', 'bridge'].map(name => join(root, 'src', name + '.ts')),
  outdir: output, outExtension: { '.js': '.mjs' }, bundle: true, platform: 'node', target: 'node22', format: 'esm',
  external: ['sidecar_sdk'], mainFields: ['module', 'main'], metafile: true, absWorkingDir: root,
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
});
await build({ entryPoints: [join(root, 'src', 'ui.ts')], outfile: join(output, 'sidecars', 'studio', 'app.js'), bundle: true, platform: 'browser', target: 'es2022', minify: true });
await cp(join(root, '..', '..', 'backend', 'api', 'mcp-tools.json'), join(output, 'mcp-tools.json'));
await cp(join(root, 'README.md'), join(output, 'README.md'));
const notices = [];
const dependencies = new Map();
for (const input of Object.keys(result.metafile.inputs)) {
  const absolute = resolve(root, input).replaceAll('\\', '/');
  const matches = [...absolute.matchAll(/\/node_modules\/((?:@[^/]+\/)?[^/]+)/g)];
  const match = matches.at(-1);
  if (match) dependencies.set(absolute.slice(0, match.index + match[0].length), match[1]);
}
for (const [directory, name] of [...dependencies].sort()) {
  for (const filename of ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENSE-MIT']) {
    try { notices.push(name + '\n' + await readFile(join(directory, filename), 'utf8')); break; } catch {}
  }
}
await writeFile(join(output, 'THIRD-PARTY-NOTICES.txt'), notices.join('\n\n---\n\n'));
console.log('Built credential-free GateGoldJira plugin in dist/gategoldjira.');
