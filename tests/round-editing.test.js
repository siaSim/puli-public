import {seedLegacyMemberships} from './fixtures.js';
import test,{before,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {generateKeyPairSync} from 'node:crypto';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
import {seal,hash} from '../server/crypto.js';
import {syncRepository} from '../server/sync.js';
import {updateRound} from '../server/rounds.js';
import {EXAMPLES,kstDate,nextTuesday,addDays,isOnTime} from '../public/core.js';
const base='https://editing.test',secret=Buffer.alloc(32,31).toString('base64');
let script,mf,db,env;
const owner={member_id:'1',role:'owner'};
const request=(path,{method='GET',user='1',body,origin=base}={})=>mf.dispatchFetch(base+path,{method,headers:{...(user?{Cookie:'puli_session=edit-'+user}:{}),...(method!=='GET'?{Origin:origin,'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
const state=async()=>await (await request('/api/state')).json();
const create=async(extra={})=>{const r=await request('/api/rounds',{method:'POST',body:{title:'이번 문제',startDate:kstDate(),deadlineDate:nextTuesday(),problems:EXAMPLES,...extra}});assert.equal(r.status,201,await r.clone().text());return (await r.json()).id;};
const edit=(id,body,extra={})=>request('/api/rounds/'+id,{method:'PATCH',body:{revision:0,...body},...extra});
const replacement={...EXAMPLES[4],id:'pg-12926',title:'시저 암호',url:'https://school.programmers.co.kr/learn/courses/30/lessons/12926'};
const changedProblems=()=>[...structuredClone(EXAMPLES).slice(0,4),replacement];
const config={id:42,pem:generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs1',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}}).privateKey};
before(async()=>{script=(await build({entryPoints:['server/index.js'],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'})).outputFiles[0].text;});
beforeEach(async()=>{
 mf=new Miniflare({modules:true,script,compatibilityDate:'2026-05-22',d1Databases:['DB'],cf:false,bindings:{APP_ORIGIN:base,ENCRYPTION_KEY:secret,OWNER_GITHUB_ID:'1'}});db=await mf.getD1Database('DB');env={DB:db,ENCRYPTION_KEY:secret};
 for(const file of (await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort())for(const sql of (await readFile('migrations/'+file,'utf8')).split(';').filter(s=>s.trim()))await db.prepare(sql).run();
 for(const [id,role,slot] of [['1','owner',0],['2','member',1],['3','member',2]]){
  await db.prepare('INSERT INTO members(id,login,name,role,slot) VALUES (?,?,?,?,?)').bind(id,'member'+id,'팀원'+id,role,slot).run();
  await db.prepare('INSERT INTO sessions VALUES (?,?,?,?)').bind(await hash('edit-'+id),id,await seal({token:'local-test-token'},secret),Date.now()+3600000).run();
 }
 await seedLegacyMemberships(db);
 await db.prepare('INSERT INTO config VALUES (?,?)').bind('github',await seal(config,secret)).run();
});
afterEach(async()=>{await mf?.dispose();});
async function repo(){await db.prepare("INSERT INTO repositories(member_id,platform,repo_id,full_name,installation_id,branch,checked_at,updated_at) VALUES ('1','programmers','9','member1/solutions','8','main',?,?)").bind(new Date().toISOString(),Date.now()).run();return await db.prepare('SELECT * FROM repositories').first();}
async function proof(id,problem=EXAMPLES[0].id){const at=new Date().toISOString();await db.prepare('INSERT INTO certificates VALUES (?,?,?,?,?,?,?)').bind(id,'1',problem,'github',at,at,JSON.stringify({sha:'original-proof'})).run();}

test('registrar and assigned member are separate and actual setter determines the next turn',async()=>{
 const id=await create({setter:'2'}),s=await state(),r=s.rounds.find(x=>x.id===id);
 assert.equal(r.registeredBy,'1');assert.equal(r.setter,'2');assert.equal(r.setterName,null);
 const next={title:'다음 회차',startDate:addDays(r.deadlineDate,1),deadlineDate:addDays(r.deadlineDate,7),problems:EXAMPLES};
 assert.equal((await request('/api/rounds',{method:'POST',user:'2',body:next})).status,403);
 assert.equal((await request('/api/rounds',{method:'POST',user:'3',body:next})).status,201);
 const nextRound=(await state()).rounds.find(x=>x.id!==id);assert.equal(nextRound.setter,'3');assert.equal(nextRound.registeredBy,'3');
});
test('named authors need no new member or access grant and can later be linked without changing the registrar',async()=>{
 const id=await create({setter:null,setterName:'출제자 예시'});let s=await state(),r=s.rounds[0];
 assert.equal(r.setter,null);assert.equal(r.setterName,'출제자 예시');assert.equal(r.registeredBy,'1');assert.equal(s.members.length,3);
 const next={title:'다음',startDate:addDays(r.deadlineDate,1),deadlineDate:addDays(r.deadlineDate,7),problems:EXAMPLES};
 assert.equal((await request('/api/rounds',{method:'POST',user:'2',body:next})).status,403);
 assert.equal((await edit(id,{setter:'2'})).status,200);r=(await state()).rounds[0];assert.equal(r.setter,'2');assert.equal(r.setterName,null);assert.equal(r.registeredBy,'1');
 assert.equal((await request('/api/rounds',{method:'POST',user:'3',body:next})).status,201);
});
test('editing titles and deadlines keeps evidence and author provenance intact and recomputes lateness from the new deadline',async()=>{
 const id=await create({setter:'2'});await proof(id);const before=(await state()).certificates;
 const r=(await state()).rounds[0];
 const updated=await edit(id,{title:'제목 수정',deadlineDate:addDays(r.deadlineDate,7),problems:EXAMPLES.map((p,i)=>i===0?{...p,title:'제목만 수정'}:p)});assert.equal(updated.status,200);assert.equal((await updated.json()).rescan,false);
 const after=await state(),saved=after.rounds[0];assert.deepEqual(after.certificates,before);assert.equal(saved.registeredBy,'1');assert.equal(saved.setter,'2');assert.equal(saved.updatedBy,'1');assert.equal(saved.revision,1);assert.equal(saved.problems[0].id,EXAMPLES[0].id);assert.equal(saved.problems[0].title,'제목만 수정');
 const late=addDays(r.deadlineDate,1)+'T00:00:00+09:00';assert.equal(isOnTime(late,r),false);assert.equal(isOnTime(late,saved),true);
});
test('certified problems cannot be replaced and a failed edit changes neither round nor sync cursor',async()=>{
 const id=await create();await proof(id,EXAMPLES[4].id);await repo();const before=await state();
 const r=await edit(id,{problems:changedProblems()});assert.equal(r.status,409);assert.ok((await r.json()).fields.problems);
 assert.deepEqual(await state(),before);
});
test('replacing an uncertified problem rescans the entire original round and finds a solve predating the old cursor',async()=>{
 const id=await create();const linked=await repo();const r=await edit(id,{problems:changedProblems()});assert.equal(r.status,200);assert.equal((await r.json()).rescan,true);
 const reset=await db.prepare('SELECT * FROM repositories').first();assert.equal(reset.checked_at,null);assert.equal(reset.sync_cursor,null);assert.equal(reset.updated_at,0);
 const at=kstDate()+'T00:00:01+09:00';
 const result=await syncRepository(env,reset,{fetcher:async(url)=>{
  if(url.includes('/access_tokens'))return Response.json({token:'installation-test'});
  if(url.includes('/commits?')){assert.equal(new URL(url).searchParams.get('since'),new Date(kstDate()+'T00:00:00+09:00').toISOString());return Response.json([{sha:'solve-before-edit'}]);}
  if(url.includes('/commits/'))return Response.json({sha:'solve-before-edit',author:{id:1,login:'member1'},parents:[{}],commit:{committer:{date:new Date(at).toISOString()}},files:[{filename:'프로그래머스/1/12926. 시저 암호/풀이.py',status:'added',additions:2,deletions:0}]});
  return Response.json({encoding:'base64',size:100,content:Buffer.from(replacement.url).toString('base64')});
 }});
 assert.equal(result.count,1);assert.ok((await state()).certificates[id]['1'][replacement.id]);assert.ok(linked.checked_at);
});
test('stale saves, non-owner edits, cross-site edits and changes to immutable round properties are rejected',async()=>{
 const id=await create();
 assert.equal((await edit(id,{title:'권한 없음'},{user:'2'})).status,403);
 assert.equal((await edit(id,{title:'익명'},{user:''})).status,401);
 assert.equal((await edit(id,{title:'다른 사이트'},{origin:'https://other.test'})).status,403);
 assert.equal((await edit('missing',{title:'없음'})).status,404);
 for(const change of [{startDate:addDays(kstDate(),-1)},{number:99},{historyOnly:true},{historyKey:'changed'}])assert.equal((await edit(id,change)).status,400);
 assert.equal((await edit(id,{title:'먼저 저장'})).status,200);
 const stale=await edit(id,{title:'늦은 저장'});assert.equal(stale.status,409);assert.ok((await stale.json()).fields.revision);assert.equal((await state()).rounds[0].title,'먼저 저장');
});
test('validation rejects a wrong weekday, duplicate links and unknown author identities, and deadlines may not overlap another live round',async()=>{
 const id=await create(),r=(await state()).rounds[0];
 for(const data of [{deadlineDate:addDays(r.deadlineDate,1)},{problems:[EXAMPLES[0],EXAMPLES[1],EXAMPLES[1],EXAMPLES[3],EXAMPLES[4]]},{setter:'unknown'},{setter:null,setterName:''}])assert.equal((await edit(id,data)).status,400);
 await create({title:'다음',startDate:addDays(r.deadlineDate,1),deadlineDate:addDays(r.deadlineDate,7)});
 const overlap=await edit(id,{deadlineDate:addDays(r.deadlineDate,7)});assert.equal(overlap.status,409);assert.ok((await overlap.json()).fields.deadlineDate);
});
test('historical two-problem records preserve date-based identity and source data while accepting missing or Monday deadlines',async()=>{
 const id=await create({historyOnly:true,title:'지난 기록',startDate:'2026-06-22',deadlineDate:null,historyMeta:{source:'kakao',author:'원문 출제자',deadlineKnown:false},historyKey:'kakao:'+'e'.repeat(64),problems:[EXAMPLES[1],EXAMPLES[0]]});await repo();
 const before=await state(),key=(await db.prepare('SELECT history_key FROM rounds WHERE id = ?').bind(id).first()).history_key;
 assert.equal((await edit(id,{title:'보완한 제목',deadlineDate:'2026-06-29'})).status,200);
 let saved=(await state()).rounds[0];assert.equal(saved.historyOnly,true);assert.equal(saved.problems.length,2);assert.equal(saved.setterName,'원문 출제자');assert.equal(saved.setter,null);assert.equal(saved.registeredBy,'1');assert.equal(saved.historyMeta.dateBased,true);assert.equal(saved.deadlineDate,'2026-06-29');assert.equal(saved.number,before.rounds[0].number);
 assert.deepEqual((await state()).repositories,before.repositories);assert.equal((await edit(id,{revision:1,deadlineDate:null})).status,200);saved=(await state()).rounds[0];assert.equal(saved.deadlineDate,null);assert.equal(saved.historyMeta.deadlineKnown,false);assert.equal((await db.prepare('SELECT history_key FROM rounds WHERE id = ?').bind(id).first()).history_key,key);
});
test('a certification arriving immediately before the atomic edit prevents replacing its problem',async()=>{
 const id=await create();const envWithRace={...env,DB:{prepare:sql=>db.prepare(sql),batch:async statements=>{await proof(id,EXAMPLES[4].id);return db.batch(statements);}}};
 await assert.rejects(updateRound(envWithRace,owner,id,{revision:0,problems:changedProblems()}),e=>e.status===409);
 const s=await state();assert.equal(s.rounds[0].revision,0);assert.ok(s.certificates[id]['1'][EXAMPLES[4].id]);assert.equal(s.rounds[0].problems[4].id,EXAMPLES[4].id);
});
test('in-flight sync cannot certify a replaced problem or overwrite the cursor reset by an edit',async()=>{
 const id=await create();const linked=await repo();
 const result=await syncRepository(env,linked,{fetcher:async url=>{
  if(url.includes('/access_tokens'))return Response.json({token:'installation-test'});
  if(url.includes('/commits?'))return Response.json([{sha:'old-question-solve'}]);
  if(url.includes('/commits/')){
   await updateRound(env,owner,id,{revision:0,problems:changedProblems()});
   return Response.json({sha:'old-question-solve',author:{id:1,login:'member1'},parents:[{}],commit:{committer:{date:new Date().toISOString()}},files:[{filename:'프로그래머스/1/42576. 완주하지 못한 선수/풀이.py',status:'modified',additions:2,deletions:1}]});
  }
  return Response.json({encoding:'base64',size:100,content:Buffer.from(EXAMPLES[4].url).toString('base64')});
 }});
 assert.equal(result.roundChanged,true);assert.equal(result.count,0);const s=await state();assert.equal(s.certificates[id],undefined);const reset=await db.prepare('SELECT * FROM repositories').first();assert.equal(reset.checked_at,null);assert.equal(reset.sync_cursor,null);assert.equal(reset.updated_at,0);
});

test('older clients can still use the self author alias without delegating authorship',async()=>{const id=await create({setter:'me'});const r=(await state()).rounds.find(x=>x.id===id);assert.equal(r.setter,'1');assert.equal(r.registeredBy,'1');});
