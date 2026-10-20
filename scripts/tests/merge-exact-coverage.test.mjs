import {test} from 'node:test';import assert from 'node:assert/strict';import {mergeExactCoverage} from '../lib/merge-exact-coverage.mjs';
const loc={start:{line:1,column:0},end:{line:1,column:10}};
function data(){return {statementMap:{0:loc},s:{0:0},fnMap:{0:{name:'fn',decl:loc,loc}},f:{0:0},branchMap:{0:{type:'if',loc,locations:[loc,{start:{line:2,column:0},end:{line:2,column:5}}]}},b:{0:[0,0]}};}
test('credits identical mapped spans without mutating inputs or growing the denominator',()=>{
 const unit=data(),browser=data();browser.s[0]=2;browser.f[0]=2;browser.b[0]=[1,0];browser.statementMap[1]={start:{line:5,column:0},end:{line:5,column:8}};browser.s[1]=3;
 const merged=mergeExactCoverage(unit,browser);assert.deepEqual(merged.s,{0:2});assert.deepEqual(merged.f,{0:2});assert.deepEqual(merged.b,{0:[1,0]});assert.deepEqual(unit.s,{0:0});
});
test('does not credit a same-line different statement or incompatible branch arms',()=>{
 const unit=data(),browser=data();browser.s[0]=9;browser.statementMap[0]={start:{line:1,column:1},end:{line:1,column:10}};browser.b[0]=[5,5];browser.branchMap[0].locations.reverse();
 const merged=mergeExactCoverage(unit,browser);assert.deepEqual(merged.s,{0:0});assert.deepEqual(merged.b,{0:[0,0]});
});
