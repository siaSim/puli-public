import {seedLegacyMemberships} from './fixtures.js';
import test,{before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {build} from 'esbuild';
import {Miniflare,createFetchMock} from 'miniflare';
import {hash,seal,unseal} from '../server/crypto.js';
import {checkInvite,joinFromInvite,INVITE_DAYS} from '../server/invites.js';

const base='https://invite.test',secret=Buffer.alloc(32,51).toString('base64');
const ownerId='101',ownerCookie='puli_session=invite-owner';
let mf,db,env,actor={id:2001,login:'new-member',name:'새 팀원',type:'User'};
const request=(path,{method='GET',cookie='',body,origin=base,type='application/json'}={})=>mf.dispatchFetch(base+path,{method,redirect:'manual',headers:{...(cookie?{Cookie:cookie}:{}),...(method==='POST'?{Origin:origin,'Content-Type':type}:{})},...(body!==undefined?{body:type==='application/json'?JSON.stringify(body):body}:{})});
const cookieOf=(r,name)=>r.headers.getSetCookie().find(c=>c.startsWith(name+'='))?.split(';')[0];
before(async()=>{
 const mocked=createFetchMock();mocked.disableNetConnect();
 mocked.get('https://github.com').intercept({method:'POST',path:'/login/oauth/access_token'}).reply(200,JSON.stringify({access_token:'invite-test-access',expires_in:28800}),{headers:{'content-type':'application/json'}}).persist();
 mocked.get('https://api.github.com').intercept({method:'GET',path:'/user'}).reply(200,()=>JSON.stringify(actor),{headers:{'content-type':'application/json'}}).persist();
 const bundle=await build({entryPoints:['server/index.js'],bundle:true,format:'esm',platform:'browser',write:false,target:'es2022'});
 mf=new Miniflare({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-05-22',d1Databases:['DB'],cf:false,fetchMock:mocked,bindings:{ENCRYPTION_KEY:secret,OWNER_GITHUB_ID:ownerId,APP_ORIGIN:base}});
 db=await mf.getD1Database('DB');env={DB:db,ENCRYPTION_KEY:secret};
 for(const file of (await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort())for(const sql of (await readFile('migrations/'+file,'utf8')).split(';').filter(s=>s.trim()))await db.prepare(sql).run();
 await db.prepare('INSERT INTO config VALUES (?,?)').bind('github',await seal({id:42,slug:'puli-test',client_id:'test-client',client_secret:'test-secret'},secret)).run();
 await db.prepare("INSERT INTO members(id,login,name,role,slot) VALUES (?,?,'테스트 운영자','owner',0)").bind(ownerId,'fixture-owner').run();
 await seedLegacyMemberships(db);
 await db.prepare('INSERT INTO sessions VALUES (?,?,?,?)').bind(await hash('invite-owner'),ownerId,await seal({token:'owner-test-access'},secret),Date.now()+3600000).run();
});
beforeEach(async()=>{
 await db.prepare('DELETE FROM study_memberships WHERE member_id!=?').bind(ownerId).run();
 await db.prepare('DELETE FROM members WHERE id!=?').bind(ownerId).run();
 actor={id:2001,login:'new-member',name:'새 팀원',type:'User'};
});
after(async()=>mf?.dispose());
async function newLink(){
 const current=await(await request('/api/invites',{cookie:ownerCookie})).json();
 const response=await request('/api/invites',{method:'POST',cookie:ownerCookie,body:{revision:current.revision}});
 assert.equal(response.status,201);const data=await response.json();return {...data,token:data.url.split('/#join/')[1]};
}
async function start(token){
 const response=await request('/auth/github',{method:'POST',type:'application/x-www-form-urlencoded',body:new URLSearchParams({invite:token,remember:'1',next:'https://evil.test',role:'owner'}).toString()});
 assert.equal(response.status,303);const state=new URL(response.headers.get('location')).searchParams.get('state');
 return {response,state,cookie:cookieOf(response,'puli_flow')};
}
const finish=flow=>request('/auth/github/callback?'+new URLSearchParams({state:flow.state,code:'test-code',invite:'attacker-controlled',role:'owner'}),{cookie:flow.cookie});
const memberCount=async()=>(await db.prepare("SELECT COUNT(*) AS n FROM study_memberships WHERE study_id='study'").first()).n;
async function fillSlots(n){for(let i=1;i<=n;i++)await db.prepare("INSERT INTO members(id,login,name,role,slot) VALUES (?,?,'기존 팀원','member',?)").bind(String(3000+i),'member-'+i,i).run();await seedLegacyMemberships(db);}

test('only an authenticated owner may create or read invite secrets; cross-site writes are refused',async()=>{
 await fillSlots(1);await db.prepare('INSERT INTO sessions VALUES (?,?,?,?)').bind(await hash('invite-member'),'3001',await seal({token:'member-access'},secret),Date.now()+3600000).run();
 for(const cookie of ['', 'puli_session=invite-member']){
  const expected=cookie?403:401;
  assert.equal((await request('/api/invites',{cookie})).status,expected);
  assert.equal((await request('/api/invites',{method:'POST',cookie,body:{revision:0}})).status,expected);
 }
 assert.equal((await request('/api/invites',{method:'POST',cookie:ownerCookie,origin:'https://evil.test',body:{revision:0}})).status,403);
});

test('links have 256-bit tokens, seven-day expiration, encrypted recovery and a hash for matching',async()=>{
 const link=await newLink(),stored=await db.prepare("SELECT * FROM invite_links WHERE id='study'").first();
 assert.match(link.token,/^[A-Za-z0-9_-]{43}$/);assert.equal(stored.token_hash,await hash(link.token));
 assert.equal(stored.expires_at-stored.created_at,INVITE_DAYS*86400000);
 assert.ok(!stored.sealed_token.includes(link.token));assert.equal(await unseal(stored.sealed_token,secret),link.token);
 const owner=await(await request('/api/invites',{cookie:ownerCookie})).json();assert.equal(owner.url,link.url);
 const response=await request('/api/invites/check',{method:'POST',body:{token:link.token}}),publicView=await response.json();
 assert.equal(response.status,200);assert.deepEqual(Object.keys(publicView).sort(),['expiresAt','full','limit','memberCount','mode','studyId','studyName']);assert.equal(publicView.limit,5);assert.equal(publicView.mode,'common');
 assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('referrer-policy'),'same-origin');
});

test('a valid link alone never exposes members, certifications, photos or shared code',async()=>{
 const link=await newLink();
 for(const path of ['/api/state','/api/photos/private','/api/solution-shares?round=any&problem=any'])assert.equal((await request(path,{cookie:'invite='+link.token})).status,401);
 assert.equal((await request('/api/invites/check',{method:'POST',origin:'https://evil.test',body:{token:link.token}})).status,403);
 for(const token of ['',link.token+'x','x'.repeat(43),null,{},['x']])assert.equal((await request('/api/invites/check',{method:'POST',body:{token}})).status,410);
 assert.equal(await memberCount(),1);
});

test('invite OAuth uses a same-origin POST, PKCE and encrypted state; GitHub never receives the invite secret',async()=>{
 const link=await newLink(),flow=await start(link.token),location=flow.response.headers.get('location');
 assert.ok(!location.includes(link.token));assert.ok(location.includes('code_challenge_method=S256'));
 const stored=await db.prepare('SELECT sealed FROM flows WHERE hash=?').bind(await hash(flow.state)).first(),data=await unseal(stored.sealed,secret);
 assert.equal(data.inviteHash,await hash(link.token));assert.equal(data.next,'/#studies');assert.equal(data.remember,true);assert.ok(!JSON.stringify(data).includes(link.token));
 assert.equal((await request('/auth/github?invite='+link.token)).status,400);
 assert.equal((await request('/auth/github',{method:'POST',origin:'https://evil.test',type:'application/x-www-form-urlencoded',body:'invite='+link.token})).status,403);
 assert.equal((await request('/auth/github',{method:'POST',body:{invite:link.token}})).status,415);
});

test('a link holder joins through GitHub as a member and can read the private study after login',async()=>{
 const link=await newLink(),flow=await start(link.token),response=await finish(flow);
 assert.equal(response.status,303);assert.equal(response.headers.get('location'),'/?joinedStudy=study#connect');
 const member=await db.prepare("SELECT * FROM study_memberships WHERE study_id='study' AND member_id=?").bind(String(actor.id)).first();assert.equal(member.role,'member');assert.equal(member.slot,1);assert.ok(member.joined_at);
 const cookie=cookieOf(response,'puli_session');assert.ok(cookie);const state=await(await request('/api/state',{cookie})).json();assert.equal(state.user.id,String(actor.id));assert.equal(state.user.role,'member');assert.equal(state.members.length,2);assert.ok(!JSON.stringify(state).includes(link.token));
 assert.equal((await finish(flow)).status,400);
});

test('ordinary GitHub login creates an account without granting any study membership',async()=>{
 const response=await request('/auth/github'),flow={state:new URL(response.headers.get('location')).searchParams.get('state'),cookie:cookieOf(response,'puli_flow')};
 const done=await finish(flow);assert.equal(done.status,303);assert.equal(await memberCount(),1);const cookie=cookieOf(done,'puli_session');assert.deepEqual((await (await request('/api/studies',{cookie})).json()).studies,[]);assert.equal((await request('/api/state',{cookie})).status,403);
});

test('rotating a link rejects both the old link and its pending OAuth callback',async()=>{
 const old=await newLink(),flow=await start(old.token),fresh=await newLink();assert.notEqual(old.token,fresh.token);
 assert.equal((await request('/api/invites/check',{method:'POST',body:{token:old.token}})).status,410);
 const response=await finish(flow);assert.equal(response.status,303);assert.match(response.headers.get('location'),/inviteError=INVITE_UNAVAILABLE/);assert.equal(cookieOf(response,'puli_session'),undefined);assert.equal(await memberCount(),1);
 assert.equal((await request('/api/invites/check',{method:'POST',body:{token:fresh.token}})).status,200);
});

test('expiration is checked at its exact boundary and again after OAuth',async()=>{
 const link=await newLink();await assert.rejects(checkInvite(env,link.token,{now:link.expiresAt}),e=>e.status===410);
 const flow=await start(link.token);await db.prepare("UPDATE invite_links SET expires_at=? WHERE id='study'").bind(Date.now()-1).run();
 const response=await finish(flow);assert.match(response.headers.get('location'),/inviteError=INVITE_UNAVAILABLE/);assert.equal(await memberCount(),1);
 const details=await(await request('/api/invites',{cookie:ownerCookie})).json();assert.equal(details.active,false);assert.equal(details.url,undefined);
});

test('capacity is checked after OAuth and the sixth member cannot register',async()=>{
 const link=await newLink(),flow=await start(link.token);await fillSlots(4);
 const check=await(await request('/api/invites/check',{method:'POST',body:{token:link.token}})).json();assert.equal(check.full,true);
 const response=await finish(flow);assert.match(response.headers.get('location'),/inviteError=INVITE_FULL/);assert.equal(await memberCount(),5);
 assert.equal(await db.prepare("SELECT * FROM study_memberships WHERE study_id='study' AND member_id=?").bind(String(actor.id)).first(),null);
});

test('two people racing for the last slot admit exactly one, with no role escalation',async()=>{
 const link=await newLink();await fillSlots(3);const tokenHash=await hash(link.token);
 const results=await Promise.allSettled([joinFromInvite(env,tokenHash,{id:2002,login:'race-a',name:'A',type:'User'}),joinFromInvite(env,tokenHash,{id:2003,login:'race-b',name:'B',type:'User'})]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'INVITE_FULL');assert.equal(await memberCount(),5);
 assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM members WHERE role='owner'").first()).n,1);
});

test('repeat OAuth for the same person is idempotent and existing members remain after link rotation',async()=>{
 const link=await newLink(),tokenHash=await hash(link.token);
 const results=await Promise.all([joinFromInvite(env,tokenHash,actor),joinFromInvite(env,tokenHash,actor)]);assert.equal(results[0].id,results[1].id);assert.equal(await memberCount(),2);
 await newLink();actor={...actor,name:'이미 참여한 팀원'};
 const response=await request('/auth/github'),flow={state:new URL(response.headers.get('location')).searchParams.get('state'),cookie:cookieOf(response,'puli_flow')};
 assert.equal((await finish(flow)).status,303);assert.equal(await memberCount(),2);
});

test('bot identities cannot join and stale rotations cannot invalidate a newer link',async()=>{
 const link=await newLink(),flow=await start(link.token);actor={...actor,type:'Bot'};
 const response=await finish(flow);assert.equal(response.status,403);assert.equal(await memberCount(),1);
 const requests=await Promise.all([request('/api/invites',{method:'POST',cookie:ownerCookie,body:{revision:link.revision}}),request('/api/invites',{method:'POST',cookie:ownerCookie,body:{revision:link.revision}})]);
 assert.deepEqual(requests.map(r=>r.status).sort(),[201,409]);
 for(const revision of [-1,'1',null])assert.equal((await request('/api/invites',{method:'POST',cookie:ownerCookie,body:{revision}})).status,400);
});
