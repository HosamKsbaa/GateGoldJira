import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {foregroundRefresh} from './foreground-refresh';
const lifecycle=vi.hoisted(()=>({destroy:()=>{}}));
vi.mock('@angular/core',()=>({DestroyRef:class {},inject:()=>({onDestroy:(callback:()=>void)=>{lifecycle.destroy=callback;}})}));
describe('foreground refresh preserves idle, visibility and lifecycle boundaries',()=>{
 let documentState:EventTarget&{visibilityState:string};
 let connection:{onLine:boolean};
 let windowEvents:EventTarget;
 beforeEach(()=>{
  vi.useFakeTimers();documentState=Object.assign(new EventTarget(),{visibilityState:'visible'});connection={onLine:true};windowEvents=new EventTarget();
  vi.stubGlobal('document',documentState);vi.stubGlobal('navigator',connection);vi.stubGlobal('window',windowEvents);
 });
 afterEach(()=>{lifecycle.destroy();vi.useRealTimers();vi.unstubAllGlobals();});
 it('skips hidden, offline and disallowed ticks, then refreshes when visibility or connectivity returns',async()=>{
  let allowed=false;const refresh=vi.fn(async()=>{});foregroundRefresh(()=>allowed,refresh);
  await vi.advanceTimersByTimeAsync(30000);expect(refresh).not.toHaveBeenCalled();
  allowed=true;documentState.visibilityState='hidden';await vi.advanceTimersByTimeAsync(30000);expect(refresh).not.toHaveBeenCalled();
  documentState.visibilityState='visible';connection.onLine=false;documentState.dispatchEvent(new Event('visibilitychange'));await Promise.resolve();expect(refresh).not.toHaveBeenCalled();
  connection.onLine=true;windowEvents.dispatchEvent(new Event('online'));await Promise.resolve();expect(refresh).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(30000);expect(refresh).toHaveBeenCalledTimes(2);
  lifecycle.destroy();await vi.advanceTimersByTimeAsync(60000);documentState.dispatchEvent(new Event('visibilitychange'));windowEvents.dispatchEvent(new Event('online'));await Promise.resolve();expect(refresh).toHaveBeenCalledTimes(2);
 });
 it('does not overlap pending work and retries after an unavailable read without throwing away content',async()=>{
  let release=()=>{};const pending=new Promise<void>(resolve=>{release=resolve;});
  const refresh=vi.fn<()=>Promise<void>>().mockImplementationOnce(()=>pending).mockRejectedValueOnce(new Error('unavailable')).mockResolvedValue(undefined);
  foregroundRefresh(()=>true,refresh);
  await vi.advanceTimersByTimeAsync(30000);await vi.advanceTimersByTimeAsync(60000);windowEvents.dispatchEvent(new Event('online'));expect(refresh).toHaveBeenCalledTimes(1);
  release();await Promise.resolve();await vi.advanceTimersByTimeAsync(30000);expect(refresh).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(30000);expect(refresh).toHaveBeenCalledTimes(3);
 });
});
