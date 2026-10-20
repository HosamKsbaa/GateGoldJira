import { readFile, mkdir, cp, readdir, rm, writeFile, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { parsePublicConfig } from '../frontend/src/app/core/config/config.service.ts';

const [configPath, frontendOrigin, siteId] = process.argv.slice(2);
if (!configPath || !frontendOrigin || !siteId || !/^[a-z0-9][a-z0-9-]{2,29}$/.test(siteId)) {
  throw new Error('Usage: prepare-frontend-release.ts PUBLIC_CONFIG FRONTEND_ORIGIN FIREBASE_SITE_ID');
}
const input: unknown = JSON.parse(await readFile(configPath, 'utf8'));
const config = parsePublicConfig(input, frontendOrigin);
if (config.mode !== 'production' || new URL(frontendOrigin).origin !== frontendOrigin) throw new Error('Choose production public configuration and its exact origin.');
const root = resolve(import.meta.dirname, '..');
const source = join(root, 'frontend/dist/gategoldjira/browser');
await stat(join(source, 'index.html'));
const files: { path: string; sha256: string; bytes: number }[] = [];
async function manifest(directory: string, prefix = ''): Promise<void> {
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a,b)=>a.name.localeCompare(b.name))) {
    const path = prefix + entry.name;
    if (entry.isDirectory()) await manifest(join(directory, entry.name), path + '/');
    else if (entry.isFile()) { const bytes=await readFile(join(directory,entry.name)); files.push({path,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length}); }
    else throw new Error('Release artifact contains a nonregular file.');
  }
}
const buildId = createHash('sha256').update(await readFile(join(source, 'index.html'))).update(JSON.stringify(config)).digest('hex').slice(0,16);
const destination = join(root, '.local/releases/frontend-' + buildId);
await mkdir(destination, { recursive: true });
await cp(source,join(destination,'site'),{recursive:true});
for (const name of ['config.local.json','config.example.json','config.production.example.json']) await rm(join(destination,'site',name),{force:true});
await writeFile(join(destination,'site/config.production.json'),JSON.stringify(config,null,2)+'\n');
const template: unknown = JSON.parse(await readFile(join(root,'infra/firebase/firebase.json'),'utf8'));
// The versioned template has a stable known shape. Only origins from the public
// configuration above enter the generated Content Security Policy.
const hosting = {
  site: siteId, public: 'site', ignore: ['**/.*'], rewrites: [{source:'**',destination:'/index.html'}],
  headers: [
    { source:'**', headers:[
      {key:'Cache-Control',value:'no-cache'}, {key:'X-Content-Type-Options',value:'nosniff'},
      {key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},
      {key:'Permissions-Policy',value:'camera=(), microphone=(), geolocation=()'},
      {key:'X-Frame-Options',value:'DENY'}, {key:'Strict-Transport-Security',value:'max-age=31536000'},
      {key:'Content-Security-Policy',value:`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob:; connect-src 'self' ${new URL(config.apiBaseUrl).origin} ${new URL(config.issuer).origin}; frame-src ${new URL(config.issuer).origin}; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self' ${new URL(config.issuer).origin}`},
    ] },
    {source:'/config.production.json',headers:[{key:'Cache-Control',value:'no-store'}]},
    {source:'**/*-*.@(js|css)',headers:[{key:'Cache-Control',value:'public,max-age=31536000,immutable'}]},
  ],
};
if (typeof template !== 'object' || template === null || !('hosting' in template)) throw new Error('Hosting template missing.');
await manifest(join(destination,'site'));
await writeFile(join(destination,'firebase.json'),JSON.stringify({hosting},null,2)+'\n');
await writeFile(join(destination,'manifest.json'),JSON.stringify({buildId,createdAt:new Date().toISOString(),frontendOrigin,siteId,files},null,2)+'\n');
console.log('Prepared independent static frontend artifact: '+destination);
console.log('Public config and CSP included; preview/production deployment has not run.');
