// Model-level unit checks. These do not establish browser or managed-provider acceptance.
import '@angular/compiler';
import {Injector} from '@angular/core';
import {ActivatedRoute,Router,convertToParamMap} from '@angular/router';
import {describe,expect,it,vi} from 'vitest';
import {AuthService,type LocalSignInResult} from './auth.service';
import {SignInPage} from './sign-in.page';
function setup(target:string|null='/'){
 const local=vi.fn<(username:string,password:string)=>Promise<LocalSignInResult>>().mockResolvedValue('signed-in');
 const google=vi.fn<()=>Promise<void>>().mockResolvedValue(undefined);
 const navigate=vi.fn<(target:string)=>Promise<boolean>>().mockResolvedValue(true);
 const model=Injector.create({providers:[
  {provide:AuthService,useValue:{mode:'development',signInLocalCredentials:local,signIn:google} satisfies Pick<AuthService,'mode'|'signInLocalCredentials'|'signIn'>},
  {provide:Router,useValue:{navigateByUrl:navigate}},
  {provide:ActivatedRoute,useValue:{snapshot:{queryParamMap:convertToParamMap(target===null?{}:{returnTo:target})}}},
  {provide:SignInPage,useFactory:()=>new SignInPage()},
 ]}).get(SignInPage);
 return {model,local,google,navigate};
}
describe('sign-in presentation model boundaries',()=>{
 for(const [username,password]of[['','password'],['   ','password'],['x'.repeat(65),'password'],['owner',''],['owner','p'.repeat(73)]] as const)it('rejects invalid form data before any credential exchange '+username.length+'/'+password.length,async()=>{
  const f=setup();f.model.form.setValue({username,password});await f.model.localSignIn();
  expect(f.local).not.toHaveBeenCalled();expect(f.navigate).not.toHaveBeenCalled();expect(f.model.state.busy()).toBe(false);
  expect(f.model.form.getRawValue()).toEqual({username,password});expect(f.model.form.invalid).toBe(true);
 });
 for(const [result,message]of[
  ['invalid-credentials','The username or password is incorrect.'],
  ['access-denied','This account cannot sign in. Contact an administrator to check your access.'],
  ['unavailable','The local sign-in service is unavailable. Check that the backend is running and try again.'],
 ]as const)it('clears the submitted password and displays the exact safe '+result+' outcome',async()=>{
  const f=setup();f.local.mockResolvedValue(result);f.model.form.setValue({username:' owner ',password:' secret with spaces '});await f.model.localSignIn();
  expect(f.local).toHaveBeenCalledExactlyOnceWith(' owner ',' secret with spaces ');
  expect(f.model.form.controls.password.value).toBe('');expect(f.model.state.message()).toBe(message);expect(f.navigate).not.toHaveBeenCalled();expect(f.model.state.busy()).toBe(false);
 });
 it('does not navigate or show a stale login error after its session was superseded',async()=>{
  const f=setup();f.local.mockResolvedValue('superseded');f.model.form.setValue({username:'owner',password:'secret'});await f.model.localSignIn();
  expect(f.navigate).not.toHaveBeenCalled();expect(f.model.state.message()).toBe('');expect(f.model.form.controls.password.value).toBe('');
 });
 for(const target of[null,'https://outside.example/path','//outside.example/path','/sign-in?returnTo=/boards'])it('uses home for an absent/external/sign-in-loop destination '+String(target),async()=>{
  const f=setup(target);f.model.form.setValue({username:'owner',password:'secret'});await f.model.localSignIn();expect(f.navigate).toHaveBeenCalledExactlyOnceWith('/');
 });
 it('retains a complete internal destination including its query',async()=>{
  const f=setup('/boards/owned-board?query=%D8%B9%D8%B1%D8%A8%D9%8A');f.model.form.setValue({username:'owner',password:'secret'});await f.model.localSignIn();
  expect(f.navigate).toHaveBeenCalledExactlyOnceWith('/boards/owned-board?query=%D8%B9%D8%B1%D8%A8%D9%8A');
 });
 it('keeps a failed managed-provider handoff safe without claiming real provider sign-in',async()=>{
  const f=setup();f.google.mockRejectedValue(new Error('Private transport diagnostic'));await f.model.googleSignIn();
  expect(f.google).toHaveBeenCalledTimes(1);expect(f.model.state.message()).toBe('The request could not be completed. Check your connection and try again.');expect(f.model.state.busy()).toBe(false);expect(f.navigate).not.toHaveBeenCalled();
 });
});
