import {createHash} from 'node:crypto';

/** Consume repeated, already source-validated scripts before expensive AST mapping.
 * Code, original maps, URL paths and the complete V8 counter shape must match.
 * Different function/block granularity stays separate: combining those records
 * could discard observed branches. Only corresponding observed counters add;
 * no source locations or denominator entries are inferred here. Callers must
 * retain every input validation failure separately.
 */
export class BrowserCounterGroups {
  #groups=new Map();
  add(entry,sourceMap,context) {
    if(entry.mapError||typeof entry.source!=='string'||!Array.isArray(entry.functions)||!entry.functions.length)
      throw new Error('Only validated, nonempty browser script counters can be grouped.');
    const path=new URL(entry.url).pathname;
    const shape=entry.functions.map(fn=>[fn.functionName,fn.isBlockCoverage,fn.ranges.map(range=>{
      if(!Number.isSafeInteger(range.count)||range.count<0)throw new Error('Invalid browser execution counter.');
      return [range.startOffset,range.endOffset];
    })]);
    const key=createHash('sha256').update(path).update('\0').update(entry.source)
      .update('\0').update(JSON.stringify(sourceMap)).update('\0').update(JSON.stringify(shape)).digest('hex');
    const previous=this.#groups.get(key);
    if(previous) {
      for(let fn=0;fn<entry.functions.length;fn++)for(let range=0;range<entry.functions[fn].ranges.length;range++){
        const target=previous.coverage.functions[fn].ranges[range];
        const count=target.count+entry.functions[fn].ranges[range].count;
        if(!Number.isSafeInteger(count))throw new Error('Browser counter overflow.');
        target.count=count;
      }
      previous.occurrences++;
    } else this.#groups.set(key,{
      source:entry.source,url:entry.url,sourceMap,context,
      coverage:{functions:structuredClone(entry.functions)},occurrences:1,
    });
  }
  values(){return this.#groups.values();}
  get size(){return this.#groups.size;}
}
