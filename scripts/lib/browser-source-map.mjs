/** Embedded Angular CSS maps are not JavaScript source-map comments. */
export function scriptMapReference(code) {
 return [...code.matchAll(/^\/\/[#@]\s*sourceMappingURL=([^\s]+)\s*$/gm)].at(-1)?.[1];
}
export function inlineSourceMap(code) {
 const reference=scriptMapReference(code);
 if(!reference?.startsWith('data:'))return null;
 const comma=reference.indexOf(',');
 if(comma<0)throw new Error('Invalid inline source map.');
 return JSON.parse(reference.slice(0,comma).includes(';base64')?Buffer.from(reference.slice(comma+1),'base64').toString('utf8'):decodeURIComponent(reference.slice(comma+1)));
}
