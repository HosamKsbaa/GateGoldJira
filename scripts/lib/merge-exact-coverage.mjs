/** Keep the unit provider's full denominator; credit only identical source spans.
 * The caller must verify source-content hashes before merging a file.
 */
export function mergeExactCoverage(unit,browser) {
 const result=structuredClone(unit);
 const key=location=>JSON.stringify(location);
 const statements=new Map(Object.entries(browser.statementMap).map(([id,loc])=>[key(loc),browser.s[id]]));
 const functions=new Map(Object.entries(browser.fnMap).map(([id,fn])=>[key({decl:fn.decl,loc:fn.loc}),browser.f[id]]));
 const branchKey=branch=>key({type:branch.type,loc:branch.loc,locations:branch.locations});
 const branches=new Map(Object.entries(browser.branchMap).map(([id,branch])=>[branchKey(branch),browser.b[id]]));
 for(const [id,loc] of Object.entries(result.statementMap))result.s[id]=Math.max(result.s[id],statements.get(key(loc))??0);
 for(const [id,fn] of Object.entries(result.fnMap))result.f[id]=Math.max(result.f[id],functions.get(key({decl:fn.decl,loc:fn.loc}))??0);
 for(const [id,branch] of Object.entries(result.branchMap)){
  const counts=branches.get(branchKey(branch));
  if(counts?.length===result.b[id].length)result.b[id]=result.b[id].map((count,index)=>Math.max(count,counts[index]));
 }
 return result;
}
