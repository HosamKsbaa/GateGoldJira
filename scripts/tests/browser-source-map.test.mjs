import {test} from 'node:test';
import assert from 'node:assert/strict';
import {scriptMapReference,inlineSourceMap} from '../lib/browser-source-map.mjs';
test('extracts only the final top-level JS map, ignoring embedded component CSS maps',()=>{
 const map={version:3,sources:['src/app/example.ts'],sourcesContent:['export const n=1;'],names:[],mappings:''};
 const code='const style="/*# sourceMappingURL=wrong.css.map */";\nconst embedded=`//# sourceMappingURL=wrong.css.map`;\n//# sourceMappingURL=data:application/json;base64,'+Buffer.from(JSON.stringify(map)).toString('base64');
 assert.deepEqual(inlineSourceMap(code),map);
 assert.match(scriptMapReference(code),/^data:application\/json/);
});
test('external, encoded and absent maps remain distinguishable',()=>{
 assert.equal(scriptMapReference('const n=1;\n//# sourceMappingURL=main.js.map'),'main.js.map');
 assert.equal(inlineSourceMap('//# sourceMappingURL=main.js.map'),null);
 assert.deepEqual(inlineSourceMap('//# sourceMappingURL=data:application/json,'+encodeURIComponent('{"version":3}')),{version:3});
 assert.equal(scriptMapReference('const text="sourceMappingURL=untrusted.map";'),undefined);
});
test('malformed map data is rejected rather than counted as unmapped source',()=>{
 assert.throws(()=>inlineSourceMap('//# sourceMappingURL=data:application/json;base64,invalid'));
});
