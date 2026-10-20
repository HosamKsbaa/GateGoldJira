// Unit-only typed service boundaries; no live provider or browser acceptance claim.
import '@angular/compiler';
import {Injector} from '@angular/core';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {AuthService} from './auth.service';
import {LocalSignIn,SIGN_IN,type SignInProvider} from './sign-in.provider';
import {ConfigService,type PublicConfig} from '../config/config.service';
import type {Me} from '../../api/generated/types.gen';
const settings:PublicConfig={mode:'development',apiBaseUrl:'/api/v1',issuer:'http://localhost:21080/development-identity/',clientId:'local-development',audience:'http://localhost:21080/api',scope:'openid profile email gategoldjira:access'};
const owner:Me={userId:'10000000-0000-4000-8000-000000000001',displayName:'Owner',email:'owner@example.test',administrator:true,companyTimeZone:'Africa/Cairo'};
function make(provider:SignInProvider=new LocalSignIn()){
 vi.stubGlobal('window',{location:{origin:'http://localhost:4200'}});
 return Injector.create({providers:[{provide:ConfigService,useValue:new ConfigService(settings)},{provide:SIGN_IN,useValue:provider},{provide:AuthService,useFactory:()=>new AuthService()}]}).get(AuthService);
}
afterEach(()=>vi.unstubAllGlobals());
const denied=()=>Response.json({error:{code:'authentication_required',message:'Sign in again.',fieldErrors:[],retryable:false,nextAction:'sign_in'},current:null,unfinished:null},{status:401});
describe('local compatibility and current session boundaries',()=>{
 for(const mode of['production','development']as const)it('refuses local compatibility entry when the '+mode+' provider has no token setter',async()=>{
  const provider:SignInProvider={mode,accessToken:async()=>undefined,signIn:async()=>{},signOut:async()=>{}};
  const fetch=vi.fn<typeof globalThis.fetch>();vi.stubGlobal('fetch',fetch);const auth=make(provider);
  await expect(auth.signInLocal('valid.shape.token')).rejects.toThrow('Local sign-in is unavailable.');
  await expect(auth.signInLocalCredentials('owner','password')).rejects.toThrow('Local sign-in is unavailable.');
  expect(fetch).not.toHaveBeenCalled();expect(auth.me()).toBeNull();
 });
 it('keeps an unsigned authority denial separate from an expired existing session',async()=>{
  vi.stubGlobal('fetch',vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(denied()));
  const provider=new LocalSignIn(),auth=make(provider);expect(await auth.refresh()).toBeNull();
  expect(auth.sessionDenied()).toBe(false);expect(auth.me()).toBeNull();expect(await provider.accessToken()).toBeUndefined();
 });
 it('clears an established session and records its denial on an actual typed401 response',async()=>{
  vi.stubGlobal('fetch',vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(Response.json(owner)).mockResolvedValueOnce(denied()));
  const provider=new LocalSignIn(),auth=make(provider);expect(await auth.signInLocal('old.shape.token')).toBe(true);const epoch=auth.sessionEpoch();
  expect(await auth.refresh()).toBeNull();expect(auth.me()).toBeNull();expect(auth.sessionDenied()).toBe(true);expect(auth.sessionEpoch()).toBeGreaterThan(epoch);expect(await provider.accessToken()).toBeUndefined();
 });
 it('invalidates cached authority when the verified user changes even with the same company role',async()=>{
  const replacement:Me={...owner,userId:'10000000-0000-4000-8000-000000000005',displayName:'Replacement',email:'replacement@example.test'};
  vi.stubGlobal('fetch',vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(Response.json(owner)).mockResolvedValueOnce(Response.json(replacement)));
  const auth=make();await auth.signInLocal('old.shape.token');const epoch=auth.sessionEpoch();expect(await auth.refresh()).toEqual(replacement);expect(auth.sessionEpoch()).toBeGreaterThan(epoch);expect(auth.me()?.userId).toBe(replacement.userId);
 });
});
