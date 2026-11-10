import {seedLegacyMemberships} from './fixtures.js';
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {build} from 'esbuild';
import {Miniflare,createFetchMock} from 'miniflare';
import {seal,unseal,hash} from '../server/crypto.js';
import {createSession,sessionTokens,returnPath,REMEMBER_SECONDS,SESSION_SECONDS} from '../server/session.js';

const secret=Buffer.alloc(32,19).toString('base64'),base='https://puli.test';
let mf,db,env;
const tokenReply={access_token:'test-user-access',expires_in:28800,refresh_token:'test-user-refresh',refresh_token_expires_in:15897600};
const renewed={...tokenReply,access_token:'test-renewed-access',refresh_token:'test-renewed-refresh'};
const config={id:42,client_id:'test-client',client_secret:'test-client-secret',slug:'puli-test'};
const request=(path,{cookie='',method='GET',origin=base}={})=>mf.dispatchFetch(base+path,{method,redirect:'manual',headers:{...(cookie?{Cookie:cookie}:{}),...(method==='POST'?{Origin:origin}:{})}});
const cookieOf=(response,name)=>response.headers.getSetCookie().find(c=>c.startsWith(name+'='))?.split(';')[0];
before(async()=>{
 const mock=createFetchMock();mock.disableNetConnect();
 mock.get('https://github.com').intercept({method:'POST',path:'/login/oauth/access_token'}).reply(200,JSON.stringify(tokenReply),{headers:{'content-type':'application/json'}}).persist();
 mock.get('https://api.github.com').intercept({method:'GET',path:'/user'}).reply(200,JSON.stringify({id:101,login:'fixture-owner',name:'테스트 운영자',type:'User'}),{headers:{'content-type':'application/json'}}).persist();
 const bundled=await build({entryPoints:['server/index.js'],bundle:true,format:'esm',platform:'browser',write:false,target:'es2022'});
 mf=new Miniflare({modules:true,script:bundled.outputFiles[0].text,compatibilityDate:'2026-05-22',d1Databases:['DB'],cf:false,fetchMock:mock,bindings:{ENCRYPTION_KEY:secret,OWNER_GITHUB_ID:'101',APP_ORIGIN:base}});
 db=await mf.getD1Database('DB');env={DB:db,ENCRYPTION_KEY:secret};
 for(const file of (await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort())for(const sql of (await readFile('migrations/'+file,'utf8')).split(';').filter(s=>s.trim()))await db.prepare(sql).run();
 await db.prepare('INSERT INTO config VALUES (?,?)').bind('github',await seal(config,secret)).run();
 await db.prepare("INSERT INTO members(id,login,name,role,slot) VALUES ('101','fixture-owner','테스트 운영자','owner',0)").run();
 await seedLegacyMemberships(db);
});
after(async()=>{await mf?.dispose();});
async function login(remember,next='/#home',previous=''){
 const start=await request('/auth/github?'+new URLSearchParams({remember:remember?'1':'0',next}));
 const state=new URL(start.headers.get('location')).searchParams.get('state'),flowCookie=cookieOf(start,'puli_flow');
 const flow=await db.prepare('SELECT sealed FROM flows WHERE hash = ?').bind(await hash(state)).first();
 const result=await request('/auth/github/callback?'+new URLSearchParams({code:'test-code',state,remember:remember?'0':'1'}),{cookie:[flowCookie,previous].filter(Boolean).join('; ')});
 return {result,flow:await unseal(flow.sealed,secret),cookie:cookieOf(result,'puli_session'),raw:cookieOf(result,'puli_session')?.split('=')[1]};
}
async function row(raw){return db.prepare('SELECT * FROM sessions WHERE hash = ?').bind(await hash(raw)).first();}
async function expiring(){
 const session=await createSession(env,'101',tokenReply,true,{now:Date.now()-9*3600000});
 return {...session,row:await row(session.raw)};
}
test('remembered OAuth login stores the signed choice, persistent cookie, encrypted rotating credentials and restores the requested page',async()=>{
 const {result,flow,cookie,raw}=await login(true,'/#register');
 assert.equal(result.status,303);assert.equal(result.headers.get('location'),'/#register');assert.equal(flow.remember,true);
 const sessionCookie=result.headers.getSetCookie().find(c=>c.startsWith('puli_session='));
 for(const value of ['HttpOnly','Secure','SameSite=Lax','Max-Age='+REMEMBER_SECONDS])assert.ok(sessionCookie.includes(value));
 assert.ok(result.headers.getSetCookie().some(c=>c.startsWith('puli_flow=;')&&c.includes('Max-Age=0')));
 const stored=await row(raw);assert.ok(Math.abs(stored.expires_at-Date.now()-REMEMBER_SECONDS*1000)<3000);
 assert.ok(!stored.sealed_token.includes(tokenReply.access_token));assert.ok(!stored.sealed_token.includes(tokenReply.refresh_token));
 const tokens=await unseal(stored.sealed_token,secret);assert.equal(tokens.refreshToken,tokenReply.refresh_token);assert.equal(tokens.remember,true);
 assert.equal((await (await request('/api/status',{cookie})).json()).user.login,'fixture-owner');
 const response=await request('/api/state',{cookie});assert.equal(response.status,200);assert.ok(!(await response.text()).includes(tokenReply.refresh_token));
});
test('unchecked automatic login uses a browser-session cookie, has an eight-hour limit and rotates the previous session',async()=>{
 const first=await login(true);const next=await login(false,'/#connect',first.cookie);
 assert.equal(next.flow.remember,false);assert.equal(next.result.headers.get('location'),'/#connect');
 assert.ok(!next.result.headers.getSetCookie().find(c=>c.startsWith('puli_session=')).includes('Max-Age'));
 assert.ok(Math.abs((await row(next.raw)).expires_at-Date.now()-SESSION_SECONDS*1000)<3000);
 assert.equal(await row(first.raw),null);assert.notEqual(first.raw,next.raw);
});
test('login return paths cannot redirect outside the app or execute a URL',()=>{
 for(const path of ['https://evil.test','//evil.test','/\\evil.test','javascript:alert(1)','/#connect?next=https://evil.test','/#<script>'])assert.equal(returnPath(path),'/#home');
 assert.equal(returnPath('/#verify/pg-42840'),'/#verify/pg-42840');
 for(const route of ['verify','study-settings','edit/round-1','solutions/pg-42840'])assert.equal(returnPath('/#'+route),'/#'+route);
});
test('a revisit after the GitHub token expires refreshes it without extending the thirty-day session',async()=>{
 const session=await expiring(),requests=[];
 const tokens=await sessionTokens(env,session.row,{fetcher:async(url,options)=>{requests.push({url,body:JSON.parse(options.body)});return Response.json(renewed);}});
 assert.equal(requests.length,1);assert.equal(requests[0].body.grant_type,'refresh_token');assert.equal(requests[0].body.refresh_token,tokenReply.refresh_token);
 assert.equal(tokens.token,renewed.access_token);assert.equal(tokens.refreshToken,renewed.refresh_token);
 const stored=await row(session.raw);assert.equal(stored.expires_at,session.expiresAt);assert.notEqual(stored.sealed_token,session.row.sealed_token);
 assert.equal((await unseal(stored.sealed_token,secret)).refreshToken,renewed.refresh_token);
 assert.equal((await request('/api/state',{cookie:'puli_session='+session.raw})).status,200);
});
test('parallel tabs use a single refresh lease and a retry reads the already refreshed token',async()=>{
 const session=await expiring();let release,started,calls=0;
 const began=new Promise(resolve=>{started=resolve;}),gate=new Promise(resolve=>{release=resolve;});
 const first=sessionTokens(env,session.row,{fetcher:async()=>{calls++;started();await gate;return Response.json(renewed);}});
 await began;
 await assert.rejects(sessionTokens(env,session.row,{fetcher:async()=>{calls++;return Response.json(renewed);}}),e=>e.status===503&&e.code==='SESSION_REFRESH_BUSY');
 release();await first;
 const again=await sessionTokens(env,session.row,{fetcher:async()=>{calls++;throw new Error('must not refresh twice');}});
 assert.equal(again.token,renewed.access_token);assert.equal(calls,1);
});
test('temporary GitHub errors retain the session and release the lease for a later retry',async()=>{
 const session=await expiring();
 for(const fetcher of [async()=>{throw new Error('network offline');},async()=>Response.json({}, {status:503}),async()=>Response.json({}, {status:429})]){
  await assert.rejects(sessionTokens(env,session.row,{fetcher}),e=>e.status===503);
  assert.ok(await row(session.raw));assert.equal(await db.prepare('SELECT * FROM sync_locks WHERE id = ?').bind('session:'+session.row.hash).first(),null);
 }
});
test('revoked or expired refresh credentials invalidate the server session and ask for login',async()=>{
 const revoked=await expiring();
 await assert.rejects(sessionTokens(env,revoked.row,{fetcher:async()=>Response.json({error:'bad_refresh_token'})}),e=>e.status===401);
 assert.equal(await row(revoked.raw),null);
 const expired=await expiring(),tokens=await unseal(expired.row.sealed_token,secret);tokens.refreshExpiresAt=Date.now()-1;
 expired.row.sealed_token=await seal(tokens,secret);await db.prepare('UPDATE sessions SET sealed_token = ? WHERE hash = ?').bind(expired.row.sealed_token,expired.row.hash).run();
 await assert.rejects(sessionTokens(env,expired.row,{fetcher:async()=>{throw new Error('must not refresh');}}),e=>e.status===401);
 assert.equal(await row(expired.raw),null);
});
test('logout during refresh cannot recreate a deleted session',async()=>{
 const session=await expiring();
 await assert.rejects(sessionTokens(env,session.row,{fetcher:async()=>{await db.prepare('DELETE FROM sessions WHERE hash = ?').bind(session.row.hash).run();return Response.json(renewed);}}),e=>e.status===401);
 assert.equal(await row(session.raw),null);
});
test('absolute expiration is rejected, logout is idempotent, and cross-origin logout is refused',async()=>{
 const active=await login(true);
 assert.equal((await request('/api/logout',{method:'POST',cookie:active.cookie,origin:'https://evil.test'})).status,403);assert.ok(await row(active.raw));
 await db.prepare('UPDATE sessions SET expires_at = ? WHERE hash = ?').bind(Date.now()-1,await hash(active.raw)).run();
 const expired=await request('/api/state',{cookie:active.cookie});assert.equal(expired.status,401);assert.ok(expired.headers.get('set-cookie').includes('Max-Age=0'));
 const logout=await request('/api/logout',{method:'POST',cookie:active.cookie});assert.equal(logout.status,200);assert.equal(await row(active.raw),null);
 assert.equal((await request('/api/logout',{method:'POST'})).status,200);
});
