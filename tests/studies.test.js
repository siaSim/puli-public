import test,{before,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {build} from 'esbuild';
import {Miniflare,createFetchMock} from 'miniflare';
import {hash,seal} from '../server/crypto.js';
import {joinFromInvite} from '../server/invites.js';
import {syncRepository} from '../server/sync.js';
import {EXAMPLES,kstDate,nextTuesday} from '../public/core.js';
import {parseInviteURL} from '../public/studies.js';
import {generateKeyPairSync} from 'node:crypto';

const base='https://studies.test',secret=Buffer.alloc(32,61).toString('base64');
const pem=generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs1',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}}).privateKey;
let script,mf,db,env,snapshot;
const request=(path,{user='1',study='study',method='GET',body,origin=base,cookie}={})=>mf.dispatchFetch(base+path,{method,redirect:'manual',headers:{...(cookie?{Cookie:cookie}:user?{Cookie:'puli_session=study-'+user}:{}),...(study===null?{}:{'X-Puli-Study':study}),...(method==='GET'?{}:{Origin:origin,'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
const state=async(user='1',study='study')=>{const r=await request('/api/state',{user,study});assert.equal(r.status,200,await r.clone().text());return r.json();};
const newStudy=async(user='1',capacity=5,name='새 스터디')=>{const r=await request('/api/studies',{user,method:'POST',body:{name,description:'독립된 스터디',capacity}});assert.equal(r.status,201,await r.clone().text());return (await r.json()).study;};
const invite=async(id,user='1')=>{const r=await request('/api/invites',{user,study:id,method:'POST',body:{revision:0}});assert.equal(r.status,201,await r.clone().text());const link=await r.json();return {...link,token:link.url.split('/#join/')[1]};};
const publish=async(id,user='1')=>{const r=await request('/api/rounds',{user,study:id,method:'POST',body:{title:'독립 회차',startDate:kstDate(),deadlineDate:nextTuesday(),problems:EXAMPLES}});assert.equal(r.status,201,await r.clone().text());return (await r.json()).id;};
const snapshotTables=async()=>{
 const result={};for(const table of ['members','sessions','config','rounds','repositories','certificates','photos','photo_submissions','solution_shares','invite_links'])result[table]=(await db.prepare('SELECT * FROM '+table+' ORDER BY 1').all()).results;return result;
};
before(async()=>{script=(await build({entryPoints:['server/index.js'],bundle:true,format:'esm',platform:'browser',write:false})).outputFiles[0].text;});
beforeEach(async()=>{
 const mock=createFetchMock();mock.disableNetConnect();
 mock.get('https://github.com').intercept({method:'POST',path:'/login/oauth/access_token'}).reply(200,JSON.stringify({access_token:'local-oauth'}),{headers:{'content-type':'application/json'}}).persist();
 mock.get('https://api.github.com').intercept({method:'GET',path:'/user'}).reply(200,JSON.stringify({id:2,login:'member2',name:'Member 2',type:'User'}),{headers:{'content-type':'application/json'}}).persist();
 mf=new Miniflare({modules:true,script,compatibilityDate:'2026-05-22',d1Databases:['DB'],cf:false,fetchMock:mock,bindings:{APP_ORIGIN:base,ENCRYPTION_KEY:secret,OWNER_GITHUB_ID:'1'}});
 db=await mf.getD1Database('DB');env={DB:db,ENCRYPTION_KEY:secret};
 const migrations=(await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort();
 for(const file of migrations.filter(f=>f<'0008'))for(const sql of(await readFile('migrations/'+file,'utf8')).split(';').filter(s=>s.trim()))await db.prepare(sql).run();
 for(const [id,role,slot]of [['1','owner',0],['2','member',1]]){
  await db.prepare('INSERT INTO members(id,login,name,role,slot,joined_at) VALUES (?,?,?,?,?,?)').bind(id,'member'+id,'Member '+id,role,slot,'2026-01-01T00:00:00Z').run();
  await db.prepare('INSERT INTO sessions VALUES (?,?,?,?)').bind(await hash('study-'+id),id,await seal({token:'local-user-'+id},secret),Date.now()+3600000).run();
 }
 await db.prepare('INSERT INTO config VALUES (?,?)').bind('github',await seal({id:42,slug:'local-app',client_id:'local-client',client_secret:'local-secret',pem},secret)).run();
 await db.prepare('INSERT INTO rounds(id,number,title,start_date,deadline_date,setter,problems,created_at,registered_by) VALUES (?,?,?,?,?,?,?,?,?)').bind('original-round',1,'기존 회차',kstDate(),nextTuesday(),'1',JSON.stringify(EXAMPLES),'2026-01-01T00:00:00Z','1').run();
 await db.prepare("INSERT INTO repositories(member_id,platform,repo_id,full_name,installation_id,branch,checked_at,sync_cursor) VALUES ('1','leetcode','99','member1/leetcode','77','main',?,?)").bind('2026-01-01T00:00:00Z','{"old":"cursor"}').run();
 await db.prepare('INSERT INTO photos VALUES (?,?,?,?,?)').bind('original-photo','1',3,[1,2,3],'2026-01-01T00:00:00Z').run();
 await db.prepare('INSERT INTO certificates VALUES (?,?,?,?,?,?,?)').bind('original-round','1',EXAMPLES[0].id,'photo','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z',JSON.stringify({photoId:'original-photo',note:'기존 인증 메모'})).run();
 await db.prepare("INSERT INTO photo_submissions(id,round_id,member_id,problem_id,photo_id,submitted_at,assessment,status) VALUES ('original-submission','original-round','1',?,'original-photo','2026-01-01T00:00:00Z','{}','pending')").bind(EXAMPLES[1].id).run();
 await db.prepare('INSERT INTO solution_shares VALUES (?,?,?,?,?,?,?,?,?)').bind('original-round','1',EXAMPLES[0].id,'PRIVATE ORIGINAL CODE','풀이 메모','python',1,4,'2026-01-01T00:00:00Z').run();
 await db.prepare('INSERT INTO invite_links VALUES (?,?,?,?,?,?,?)').bind('study',await hash('q'.repeat(43)),await seal('q'.repeat(43),secret),'1',Date.now(),Date.now()+86400000,3).run();
 snapshot=await snapshotTables();
 for(const sql of(await readFile('migrations/0008_multiple_studies.sql','utf8')).split(';').filter(s=>s.trim()))await db.prepare(sql).run();
 for(const file of migrations.filter(f=>f>'0008_multiple_studies.sql'))for(const sql of(await readFile('migrations/'+file,'utf8')).split(';').filter(s=>s.trim()))await db.prepare(sql).run();
 // A newly registered account has no memberships, regardless of a legacy role field.
 await db.prepare("INSERT INTO members(id,login,name,role) VALUES ('3','member3','Member 3','owner')").run();
 await db.prepare('INSERT INTO sessions VALUES (?,?,?,?)').bind(await hash('study-3'),'3',await seal({token:'local-user-3'},secret),Date.now()+3600000).run();
});
afterEach(async()=>mf?.dispose());

test('migration preserves all original rows, evidence bytes, sessions, shared code and active invitation',async()=>{
 const after=await snapshotTables();
 for(const [table,rows]of Object.entries(snapshot)){
  const ids=new Set(rows.map(r=>Object.values(r)[0]));
  const actual=after[table].filter(r=>ids.has(Object.values(r)[0])).map(r=>Object.fromEntries(Object.keys(rows[0]||{}).map(k=>[k,r[k]])));
  assert.deepEqual(actual,rows,table);
 }
 assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results,[]);
 assert.equal((await state()).members.length,2);assert.equal((await state()).rounds[0].id,'original-round');
 const oldInvite=await(await request('/api/invites')).json();assert.equal(oldInvite.url,base+'/#join/'+'q'.repeat(43));assert.equal(oldInvite.revision,3);
 assert.equal((await request('/api/photos/original-photo',{user:'2'})).status,200);
 assert.deepEqual(await (await request('/api/solution-shares?round=original-round&problem='+EXAMPLES[0].id,{user:'2'})).json(),{share:null});
 assert.equal((await request('/api/solution-shares?round=original-round&problem='+EXAMPLES[0].id+'&member=1',{user:'2'})).status,200);
});

test('accounts without membership can create a study but cannot read the original study',async()=>{
 assert.deepEqual((await(await request('/api/studies',{user:'3'})).json()).studies,[]);
 assert.equal((await request('/api/state',{user:'3'})).status,403);
 assert.equal((await request('/api/state',{user:'3',study:null})).status,403);
 const own=await newStudy('3');assert.equal(own.role,'owner');assert.equal(own.memberCount,1);
 const fresh=await state('3',own.id);assert.deepEqual(fresh.rounds,[]);assert.deepEqual(fresh.certificates,{});assert.equal(fresh.members.length,1);assert.equal(fresh.user.role,'owner');
 assert.equal((await request('/api/studies',{user:'',method:'POST',body:{name:'anonymous',capacity:5}})).status,401);
 assert.equal((await request('/api/studies',{user:'3',origin:'https://evil.test',method:'POST',body:{name:'cross-site',capacity:5}})).status,403);
});

test('one account can own multiple studies; names, capacity, roles and rounds are independent',async()=>{
 const b=await newStudy('1',12,'두 번째 스터디'),c=await newStudy('2',4,'다른 운영자');
 const rb=await publish(b.id),rc=await publish(c.id,'2');
 for(const [user,id,roundId]of [['1',b.id,rb],['2',c.id,rc]]){
  const s=await state(user,id);assert.equal(s.rounds.length,1);assert.equal(s.rounds[0].number,1);assert.equal(s.rounds[0].id,roundId);assert.equal(s.members.length,1);
 }
 assert.equal((await state()).rounds[0].id,'original-round');
 assert.equal((await request('/api/state',{user:'2',study:b.id})).status,403);
 assert.equal((await request('/api/invites',{user:'2',study:'study'})).status,403);
 assert.equal((await request('/api/state',{study:'unknown'})).status,403);
 assert.equal((await request('/api/state',{study:'x'.repeat(81)})).status,400);
});

test('even an owner in both studies cannot read or edit another study resource through the selected study',async()=>{
 const b=await newStudy();await publish(b.id);
 for(const path of ['/api/photos/original-photo','/api/solution-shares?round=original-round&problem='+EXAMPLES[0].id+'&member=1','/api/solution-code?round=original-round&problem='+EXAMPLES[0].id])assert.equal((await request(path,{study:b.id})).status,404,path);
 assert.equal((await request('/api/rounds/original-round',{study:b.id,method:'PATCH',body:{revision:0,title:'다른 스터디에서 수정'}})).status,404);
 assert.equal((await request('/api/photo-submissions/original-submission/review',{study:b.id,method:'POST',body:{decision:'reject',note:'cross-study'}})).status,404);
 assert.equal((await request('/api/solution-shares',{study:b.id,method:'POST',body:{round:'original-round',problem:EXAMPLES[0].id,revision:4,shared:false}})).status,404);
 const s=await state('1',b.id);assert.deepEqual(s.certificates,{});assert.deepEqual(s.solutionShares,[]);assert.deepEqual(s.photoSubmissions,[]);
 assert.equal((await state()).rounds[0].title,'기존 회차');
});

test('an already registered account can join another study and receives its own member role',async()=>{
 const b=await newStudy('3',3),link=await invite(b.id,'3');
 const r=await request('/api/studies/join',{method:'POST',user:'1',body:{token:link.token,role:'owner',studyId:'study'}});assert.equal(r.status,201);assert.equal((await r.json()).studyId,b.id);
 const s=await state('1',b.id);assert.equal(s.user.role,'member');assert.equal(s.members.length,2);
 assert.equal((await request('/api/invites',{study:b.id})).status,403);
 assert.equal((await request('/api/studies/join',{method:'POST',user:'1',body:{token:link.token}})).status,201);
 assert.equal((await state('1',b.id)).members.length,2);
 assert.equal((await state()).user.role,'owner');
});

test('existing accounts also join during OAuth instead of silently bypassing the invite',async()=>{
 const b=await newStudy(),link=await invite(b.id);
 const start=await mf.dispatchFetch(base+'/auth/github',{method:'POST',redirect:'manual',headers:{Origin:base,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({invite:link.token}).toString()});
 const flow=new URL(start.headers.get('location')).searchParams.get('state'),cookie=start.headers.getSetCookie().find(c=>c.startsWith('puli_flow=')).split(';')[0];
 const done=await request('/auth/github/callback?'+new URLSearchParams({state:flow,code:'local-code'}),{user:'',cookie});assert.equal(done.status,303);
 assert.equal((await state('2',b.id)).user.role,'member');assert.equal((await state('2','study')).members.length,2);
});

test('capacity and invitation invalidation are per study and joining the final seat is atomic',async()=>{
 const b=await newStudy('1',2),link=await invite(b.id),tokenHash=await hash(link.token);
 const results=await Promise.allSettled([joinFromInvite(env,tokenHash,{id:'2',login:'member2',type:'User'}),joinFromInvite(env,tokenHash,{id:'3',login:'member3',type:'User'})]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'INVITE_FULL');
 assert.equal((await state('1',b.id)).members.length,2);assert.equal((await state()).members.length,2);
 const old=await(await request('/api/invites')).json();
 assert.equal((await request('/api/invites',{study:b.id,method:'POST',body:{revision:1}})).status,201);
 assert.equal((await(await request('/api/invites')).json()).url,old.url);
 assert.equal((await request('/api/studies/join',{user:'2',method:'POST',body:{token:link.token}})).status,410);
});

test('study creation validates bounded input, rejects forged roles, and enforces ownership quota atomically',async()=>{
 for(const data of [{name:'',capacity:5},{name:'x',capacity:0},{name:'x',capacity:21},{name:'x',capacity:1.5},{name:'x',capacity:5,role:'owner'}])assert.equal((await request('/api/studies',{method:'POST',body:data})).status,400);
 for(let i=0;i<4;i++)await newStudy();
 assert.equal((await request('/api/studies',{method:'POST',body:{name:'over-limit',capacity:5}})).status,409);
 assert.equal((await(await request('/api/studies')).json()).studies.length,5);
});

test('shared repository sync scans once and certifies only joined studies with independent evidence',async()=>{
 const b=await newStudy(),rb=await publish(b.id),unjoined=await newStudy('3'),ru=await publish(unjoined.id,'3');
 const repo=await db.prepare('SELECT * FROM repositories WHERE member_id=?').bind('1').first(),at=new Date(Date.now()-1000).toISOString();
 // Remove the old photo proof to exercise both target studies using the same commit.
 await db.prepare('DELETE FROM certificates').run();let scans=0,details=0,reads=0;
 const result=await syncRepository(env,repo,{fetcher:async url=>{
  if(url.includes('/access_tokens'))return Response.json({token:'scoped-local-token'});
  if(url.includes('/commits?')){scans++;return Response.json([{sha:'a'.repeat(40)}]);}
  if(url.includes('/commits/')){details++;return Response.json({sha:'a'.repeat(40),author:{id:1,login:'member1'},parents:[{}],commit:{committer:{date:at}},files:[{filename:'0001-two-sum/solution.py',status:'added',additions:3,deletions:0}]});}
  reads++;return Response.json({encoding:'base64',size:100,content:Buffer.from(EXAMPLES[0].url).toString('base64')});
 }});
 assert.equal(result.count,2);assert.equal(scans,1);assert.equal(details,1);assert.equal(reads,1);
 assert.ok((await state()).certificates['original-round']['1'][EXAMPLES[0].id]);assert.ok((await state('1',b.id)).certificates[rb]['1'][EXAMPLES[0].id]);
 assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM certificates WHERE round_id=?').bind(ru).first()).n,0);
});

test('invitation paste accepts only this deployment and a valid fragment token',()=>{
 const token='a'.repeat(43);assert.equal(parseInviteURL(base+'/#join/'+token,base),token);
 for(const url of ['https://evil.test/#join/'+token,base+'/?invite='+token,base+'/#join/short','javascript:alert(1)'])assert.equal(parseInviteURL(url,base),null);
});


test('completed shared scans do not report pending work during cooldown and foreign setters cannot be assigned',async()=>{
 await db.prepare('UPDATE repositories SET updated_at=?,sync_cursor=?').bind(Date.now(),JSON.stringify({done:true})).run();
 const synced=await request('/api/sync',{method:'POST',body:{platform:'leetcode'}});assert.equal(synced.status,200);assert.equal((await synced.json()).more,false);
 await db.prepare('UPDATE repositories SET sync_cursor=?').bind(JSON.stringify({done:false})).run();
 assert.equal((await(await request('/api/sync',{method:'POST',body:{platform:'leetcode'}})).json()).more,true);
 const b=await newStudy();
 const refused=await request('/api/rounds',{study:b.id,method:'POST',body:{title:'잘못된 출제자',startDate:kstDate(),deadlineDate:nextTuesday(),setter:'2',problems:EXAMPLES}});assert.equal(refused.status,400);
 assert.equal((await request('/api/photo?round=original-round&problem='+EXAMPLES[0].id,{study:b.id,method:'POST',body:{}})).status,404);
});
