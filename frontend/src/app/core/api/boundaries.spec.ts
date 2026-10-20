import {describe,expect,it,vi} from 'vitest';
import {ApiError,readResult} from './api-result';
import {createApiClient} from './client';
describe('typed client transport boundaries',()=>{
 it('retains a typed service failure without inventing an HTTP status when no Response exists',async()=>{
  const payload={error:{code:'temporarily_unavailable',message:'Retry the same reference.',fieldErrors:[],retryable:true,nextAction:'retry_same_reference'},current:null,unfinished:null};
  const outcome=readResult(Promise.resolve({error:payload}));
  await expect(outcome).rejects.toBeInstanceOf(ApiError);await expect(outcome).rejects.toMatchObject({status:0,payload});
 });
 it('permits the explicit low-level SDK boundary without an optional request validator and preserves real headers',async()=>{
  const fetch=vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json({ok:true}));
  const client=createApiClient({baseUrl:'https://fixture.example',fetch});
  const outcome=await client.post<{ok:boolean}>({url:'/probe',headers:{'X-Trace-Reference':'owned-probe'}});
  expect(outcome.data).toEqual({ok:true});expect(fetch).toHaveBeenCalledTimes(1);
  const request=fetch.mock.calls[0]?.[0];expect(request).toBeInstanceOf(Request);if(!(request instanceof Request))throw new Error('Expected a real Fetch Request.');
  expect(request.url).toBe('https://fixture.example/probe');expect(request.method).toBe('POST');expect(request.headers.get('X-Trace-Reference')).toBe('owned-probe');
 });
});
