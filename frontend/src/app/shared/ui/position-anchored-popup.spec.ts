import {afterEach,describe,expect,it,vi} from 'vitest';
import {positionAnchoredPopup} from './position-anchored-popup';
function fixture(rect:{left:number;right:number;top:number;bottom:number},direction='ltr',height=300){
 const panel={style:{} as CSSStyleDeclaration,scrollHeight:height} as HTMLElement;
 const anchor={getBoundingClientRect:()=>rect} as HTMLElement;
 vi.stubGlobal('getComputedStyle',()=>({direction}));
 return {panel,anchor};
}
afterEach(()=>vi.unstubAllGlobals());
describe('anchored popup placement',()=>{
 it('stays below the trigger without changing page layout when there is room',()=>{
  vi.stubGlobal('window',{innerWidth:1000,innerHeight:800});const {panel,anchor}=fixture({left:100,right:200,top:100,bottom:140});positionAnchoredPopup(panel,anchor,320);
  expect(panel.style).toMatchObject({position:'fixed',inset:'auto',margin:'0',width:'320px',left:'100px',top:'146px',maxHeight:'320px'});
 });
 it('flips above near the lower boundary and clamps wide content to the viewport',()=>{
  vi.stubGlobal('window',{innerWidth:390,innerHeight:844});const {panel,anchor}=fixture({left:350,right:385,top:780,bottom:820});positionAnchoredPopup(panel,anchor,500);
  expect(parseFloat(panel.style.width)).toBe(374);expect(parseFloat(panel.style.left)).toBe(8);
  expect(parseFloat(panel.style.top)+300).toBeLessThan(780);expect(parseFloat(panel.style.maxHeight)).toBe(320);
 });
 it('aligns RTL to the right edge and follows a zoomed or panned visual viewport',()=>{
  vi.stubGlobal('window',{innerWidth:1200,innerHeight:900,visualViewport:{width:400,height:350,offsetLeft:100,offsetTop:200}});
  const {panel,anchor}=fixture({left:250,right:450,top:280,bottom:320},'rtl',80);positionAnchoredPopup(panel,anchor,240,100);
  expect(panel.style.left).toBe('210px');expect(panel.style.top).toBe('326px');expect(panel.style.width).toBe('240px');
  expect(parseFloat(panel.style.left)+240).toBeLessThanOrEqual(492);
 });
 it('never positions a panel outside the visible top-left boundary when its trigger is clipped',()=>{
  vi.stubGlobal('window',{innerWidth:390,innerHeight:200});const {panel,anchor}=fixture({left:-200,right:-100,top:-80,bottom:-40});positionAnchoredPopup(panel,anchor,200,90,50);
  expect(panel.style.left).toBe('8px');expect(panel.style.top).toBe('8px');expect(parseFloat(panel.style.maxHeight)).toBeLessThanOrEqual(90);
 });
});

describe('popup edge positions',()=>{
 it('clamps the right edge while retaining the lower trigger position',()=>{
  vi.stubGlobal('window',{innerWidth:1000,innerHeight:800});const {panel,anchor}=fixture({left:900,right:990,top:100,bottom:130});positionAnchoredPopup(panel,anchor,300);
  expect(panel.style.left).toBe('692px');expect(panel.style.top).toBe('136px');
 });
 it('places a short rendered popup immediately above its trigger',()=>{
  vi.stubGlobal('window',{innerWidth:1000,innerHeight:800});const {panel,anchor}=fixture({left:100,right:200,top:700,bottom:730},'ltr',70);positionAnchoredPopup(panel,anchor,300);
  expect(panel.style.top).toBe('624px');expect(panel.style.maxHeight).toBe('320px');
 });
});
