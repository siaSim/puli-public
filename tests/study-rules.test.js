import {discoverCommitProblems} from '../server/github.js';
import test,{before,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {generateKeyPairSync} from 'node:crypto';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
import sharp from 'sharp';
import {seal,hash} from '../server/crypto.js';
import {syncRepository} from '../server/sync.js';
import {DEFAULT_RULES,nextDeadlineDate} from '../public/rules.js';
import {EXAMPLES,kstDate,addDays,memberCount} from '../public/core.js';
const base='https://rules.test',secret=Buffer.alloc(32,81).toString('base64');
const pem=generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs1',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}}).privateKey;
let script,mf,db,env,image;
const request=(path,{user='1',study='study',method='GET',body,origin=base,headers={}}={})=>mf.dispatchFetch(base+path,{method,headers:{...(user?{Cookie:'puli_session=rule-'+user}:{}),'X-Puli-Study':study,...(method==='GET'?{}:{Origin:origin}),...(typeof body==='string'?{'Content-Type':'application/json'}:{}),...headers},...(body===undefined?{}:{body})});
const jsonRequest=(path,body,extra={})=>request(path,{method:'POST',body:JSON.stringify(body),...extra});
const state=async(study='study')=>{const r=await request('/api/state',{study});assert.equal(r.status,200);return r.json();};
const setRules=async(rules,revision=0,extra={})=>jsonRequest('/api/studies/settings',{revision,rules},{method:'PATCH',...extra});
const create=async(extra={})=>{const r=await jsonRequest('/api/rounds',{title:'목표 또는 회차',startDate:kstDate(),deadlineDate:addDays(kstDate(),3),problems:[],...extra});assert.equal(r.status,201,await r.clone().text());return (await r.json()).id;};
const freeRules=(extra={})=>({...DEFAULT_RULES,mode:'free',problemCount:2,leetcodeCount:0,schedule:'custom',...extra});
const freePeriod=async(extra={})=>{assert.equal((await setRules(freeRules(extra))).status,200);return create();};
const addProblem=async(round,p=EXAMPLES[0],extra={})=>jsonRequest('/api/free-problems',{round,platform:p.platform,url:p.url,title:p.title},extra);
async function upload(round,problem,{confidence=95,text,actor='1'}={}){
 const wire=new FormData();wire.append('photo',new Blob([image],{type:'image/jpeg'}),'proof.jpg');wire.append('metadata',JSON.stringify({note:'자율 풀이',ocr:{engine:'tesseract.js-7',text:text??(problem.title+'\nAccepted'),confidence}}));
 const req=new Request(base,{method:'POST',body:wire});return request('/api/photo?'+new URLSearchParams({round,problem:problem.id}),{method:'POST',user:actor,body:new Uint8Array(await req.arrayBuffer()),headers:{'Content-Type':req.headers.get('Content-Type'),'x-puli-confirmed':'yes'}});
}
before(async()=>{script=(await build({entryPoints:['server/index.js'],bundle:true,format:'esm',platform:'browser',write:false})).outputFiles[0].text;image=await sharp({create:{width:80,height:40,channels:3,background:'#fff'}}).jpeg().toBuffer();});
beforeEach(async()=>{
 mf=new Miniflare({modules:true,script,compatibilityDate:'2026-05-22',d1Databases:['DB'],cf:false,bindings:{APP_ORIGIN:base,ENCRYPTION_KEY:secret,OWNER_GITHUB_ID:'1'}});db=await mf.getD1Database('DB');env={DB:db,ENCRYPTION_KEY:secret};
 for(const file of(await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort())for(const sql of(await readFile('migrations/'+file,'utf8')).split(';').filter(s=>s.trim()))await db.prepare(sql).run();
 for(const [id,role,slot]of [['1','owner',0],['2','member',1]]){
  await db.prepare('INSERT INTO members(id,login,name) VALUES (?,?,?)').bind(id,'user'+id,'팀원'+id).run();
  await db.prepare("INSERT INTO study_memberships(study_id,member_id,role,slot,joined_at) VALUES ('study',?,?,?,?)").bind(id,role,slot,new Date().toISOString()).run();
  await db.prepare('INSERT INTO sessions VALUES (?,?,?,?)').bind(await hash('rule-'+id),id,await seal({token:'local'},secret),Date.now()+3600000).run();
 }
 await db.prepare('INSERT INTO config VALUES (?,?)').bind('github',await seal({id:42,pem},secret)).run();
});
afterEach(async()=>mf?.dispose());

test('existing study keeps exact default rules and changing them requires its owner, CSRF and revision',async()=>{
 assert.deepEqual((await state()).study.rules,DEFAULT_RULES);
 for(const opts of [{user:'2'},{user:''},{origin:'https://evil.test'}])assert.equal((await setRules(freeRules(),0,opts)).status,opts.user===''?401:403);
 for(const rules of [{...DEFAULT_RULES,problemCount:0},{...DEFAULT_RULES,deadlineTime:'25:00'},{...DEFAULT_RULES,leetcodeCount:6}])assert.equal((await setRules(rules)).status,400);
 const saves=await Promise.all([setRules(freeRules()),setRules(freeRules({problemCount:3}))]);assert.deepEqual(saves.map(r=>r.status).sort(),[200,409]);assert.equal((await state()).study.rulesRevision,1);
});

test('new studies accept their own rules without changing the existing study',async()=>{
 const r=await jsonRequest('/api/studies',{name:'자율 모임',capacity:4,rules:freeRules({problemCount:3,weekday:0,deadlineTime:'21:00'})});assert.equal(r.status,201);const study=(await r.json()).study;
 assert.equal((await state(study.id)).study.rules.mode,'free');assert.deepEqual((await state()).study.rules,DEFAULT_RULES);
 assert.equal((await setRules(freeRules(),0,{user:'2',study:study.id})).status,403);
});

test('common rounds enforce configured count, platform split and weekday rather than browser-provided rules',async()=>{
 const rules={...DEFAULT_RULES,problemCount:3,leetcodeCount:0,weekday:0,deadlineTime:'21:00'};assert.equal((await setRules(rules)).status,200);
 const draft={title:'세 문제',startDate:kstDate(),deadlineDate:nextDeadlineDate(kstDate(),rules),problems:EXAMPLES.slice(1,4)};
 const r=await jsonRequest('/api/rounds',draft);assert.equal(r.status,201,await r.clone().text());const saved=(await state()).rounds[0];assert.equal(saved.problems.length,3);assert.deepEqual(saved.rules,rules);assert.equal(saved.deadlineTime,'21:00');
 const wrong=await jsonRequest('/api/rounds',{...draft,startDate:addDays(saved.deadlineDate,1),deadlineDate:addDays(saved.deadlineDate,7),problems:EXAMPLES,rules:DEFAULT_RULES});assert.equal(wrong.status,400);
});

test('settings changes apply only to newly created periods; existing snapshots and evidence remain unchanged',async()=>{
 const common={...DEFAULT_RULES,problemCount:1,leetcodeCount:1,schedule:'custom',deadlineTime:'20:00'};assert.equal((await setRules(common)).status,200);
 const id=await create({problems:[EXAMPLES[0]],deadlineTime:'19:00'}),old=(await state()).rounds[0];
 const now=new Date().toISOString();await db.prepare('INSERT INTO certificates VALUES (?,?,?,?,?,?,?)').bind(id,'1',EXAMPLES[0].id,'github',now,now,'{"original":true}').run();
 const proof=(await state()).certificates;assert.equal((await setRules(freeRules(),1)).status,200);
 const after=(await state()).rounds[0];assert.deepEqual(after,old);assert.deepEqual((await state()).certificates,proof);
 const next=await create({startDate:addDays(old.deadlineDate,1),deadlineDate:addDays(old.deadlineDate,7)});assert.equal((await state()).rounds.find(r=>r.id===next).rules.mode,'free');
 assert.equal((await jsonRequest('/api/rounds/'+id,{revision:0,title:'제목만 수정'},{method:'PATCH'})).status,200);assert.equal((await state()).rounds.find(r=>r.id===id).rules.mode,'common');
});

test('free periods accept no assigned list; adding a personal problem is separate from certification and study-scoped',async()=>{
 const id=await freePeriod({platform:'leetcode'});assert.equal((await state()).rounds[0].problems.length,0);
 assert.equal((await addProblem(id)).status,201);assert.equal((await addProblem(id)).status,201);let s=await state();assert.equal(s.rounds[0].problems.length,1);assert.equal(memberCount(s,s.rounds[0],'1'),0);
 assert.equal((await addProblem(id,EXAMPLES[1])).status,400);
 const other=await jsonRequest('/api/studies',{name:'다른 모임',capacity:3});const otherId=(await other.json()).study.id;assert.equal((await addProblem(id,EXAMPLES[0],{study:otherId})).status,404);
 assert.equal((await jsonRequest('/api/rounds',{title:'공통 목록 위조',startDate:addDays(s.rounds[0].deadlineDate,1),deadlineDate:addDays(s.rounds[0].deadlineDate,7),problems:EXAMPLES})).status,400);
});

test('free photo OCR and peer review update goals, do not double count a problem, and allow sharing',async()=>{
 const id=await freePeriod();await addProblem(id);let uploaded=await upload(id,EXAMPLES[0]);assert.equal(uploaded.status,201,await uploaded.clone().text());assert.equal((await uploaded.json()).status,'approved');
 await upload(id,EXAMPLES[0]);let s=await state();assert.equal(memberCount(s,s.rounds[0],'1'),1);
 await addProblem(id,EXAMPLES[1]);uploaded=await upload(id,EXAMPLES[1],{text:'문제 이름이 불분명한 사진',confidence:40});assert.equal((await uploaded.clone().json()).status,'pending');const submission=(await uploaded.json()).id;
 assert.equal((await jsonRequest('/api/photo-submissions/'+submission+'/review',{decision:'approve'})).status,403);
 assert.equal((await jsonRequest('/api/photo-submissions/'+submission+'/review',{decision:'approve'},{user:'2'})).status,200);s=await state();assert.equal(memberCount(s,s.rounds[0],'1'),2);
 const share=await jsonRequest('/api/solution-shares',{round:id,problem:EXAMPLES[0].id,revision:0,shared:true,consent:true,code:'print(1)',note:'자율 풀이',language:'python'});assert.equal(share.status,200);
 const edit=await jsonRequest('/api/rounds/'+id,{revision:0,title:'목표 제목 수정'},{method:'PATCH'});assert.equal(edit.status,200,await edit.clone().text());assert.equal(memberCount(await state(),(await state()).rounds[0],'1'),2);
});

test('GitHub free discovery validates source folders and README identities, author, time and duplicate evidence',async()=>{
 const id=await freePeriod();
 const repo={member_id:'1',platform:'leetcode',repo_id:'9',full_name:'user1/leetcode',installation_id:'8',branch:'main'};await db.prepare('INSERT INTO repositories(member_id,platform,repo_id,full_name,installation_id,branch) VALUES (?,?,?,?,?,?)').bind(...Object.values(repo)).run();
 const now=Date.parse(kstDate()+'T13:00:00+09:00'),at=new Date(now-1000).toISOString();
 const make=(letter,author,folder='0001-two-sum',date=at)=>({sha:letter.repeat(40),author:{id:author,login:'user'+author},parents:[{}],commit:{committer:{date}},files:[{filename:folder+'/solution.py',status:'added',additions:2,deletions:0}]});
 const commits=[make('a',1),make('b',2,'0002-add-two-numbers'),make('c',1,'0003-longest-substring-without-repeating-characters',new Date(now+86400000*4).toISOString()),make('d',1,'0004-median-of-two-sorted-arrays'),make('e',1,'0001-two-sum')];
 const fetcher=async url=>{
  if(url.includes('/access_tokens'))return Response.json({token:'scoped'});
  if(url.includes('/commits?'))return Response.json(commits.map(c=>({sha:c.sha})));
  if(url.includes('/commits/'))return Response.json(commits.find(c=>url.endsWith(c.sha)));
  const link=url.endsWith('d'.repeat(40))?'https://leetcode.com/problems/another-problem/':EXAMPLES[0].url;
  return Response.json({encoding:'base64',size:120,content:Buffer.from('# Two Sum\n[문제]('+link+')').toString('base64')});
 };
 let current=repo,result;do{result=await syncRepository(env,current,{fetcher,now});current=await db.prepare('SELECT * FROM repositories').first();}while(result.more);
 let s=await state();assert.equal(s.rounds[0].problems.length,1);assert.equal(memberCount(s,s.rounds[0],'1'),1);assert.equal(s.certificates[id]['1'][EXAMPLES[0].id].sha,'a'.repeat(40));
 await upload(id,EXAMPLES[0]);s=await state();assert.equal(memberCount(s,s.rounds[0],'1'),1);assert.equal(s.certificates[id]['1'][EXAMPLES[0].id].method,'github');
});


test('stale rule versions cannot publish a period under changed defaults',async()=>{
 assert.equal((await setRules(freeRules())).status,200);
 const r=await jsonRequest('/api/rounds',{title:'오래된 화면',startDate:kstDate(),deadlineDate:addDays(kstDate(),3),problems:[],rulesRevision:0});assert.equal(r.status,409);assert.equal((await state()).rounds.length,0);
});

test('free automatic verification excludes solves after the configured deadline minute',async()=>{
 assert.equal((await setRules(freeRules({deadlineTime:'12:00'}))).status,200);const id=await create({deadlineDate:kstDate()});
 const repo={member_id:'1',platform:'leetcode',repo_id:'9',full_name:'user1/leetcode',installation_id:'8',branch:'main'};await db.prepare('INSERT INTO repositories(member_id,platform,repo_id,full_name,installation_id,branch) VALUES (?,?,?,?,?,?)').bind(...Object.values(repo)).run();
 const now=Date.parse(kstDate()+'T13:00:00+09:00');const result=await syncRepository(env,repo,{now,fetcher:async url=>{
  if(url.includes('/access_tokens'))return Response.json({token:'scoped'});
  if(url.includes('/commits?'))return Response.json([{sha:'a'.repeat(40)}]);
  if(url.includes('/commits/'))return Response.json({sha:'a'.repeat(40),author:{id:1},parents:[{}],commit:{committer:{date:new Date(now-60000).toISOString()}},files:[{filename:'0001-two-sum/solution.py',status:'added',additions:1,deletions:0}]});
  throw new Error('A late solve must not fetch problem evidence');
 }});assert.equal(result.count,0);assert.equal((await state()).certificates[id],undefined);
});


test('BaekjoonHub unicode source folders identify the exact Programmers problem, excluding related links',async()=>{
 const repo={platform:'programmers',full_name:'user1/programmers',branch:'main'};
 const commit={sha:'a'.repeat(40),author:{id:1,login:'user1'},commit:{committer:{date:new Date().toISOString()}},files:[{filename:'프로그래머스/1/42840.\u2005모의고사/모의고사.py',status:'modified',additions:3,deletions:1},{filename:'README.md',status:'modified',additions:1,deletions:0}]};
 const result=await discoverCommitProblems(commit,repo,'scoped',async()=>Response.json({encoding:'base64',size:300,content:Buffer.from('# [level 1] 모의고사 - 42840\n[문제]('+EXAMPLES[1].url+')\n관련 문제: '+EXAMPLES[4].url).toString('base64')}));
 assert.equal(result.length,1);assert.equal(result[0].problem.id,'pg-42840');assert.ok(result[0].evidence.path.endsWith('모의고사.py'));
});

test('late free photo evidence remains visible but does not complete the goal',async()=>{
 const id=await freePeriod();const yesterday=addDays(kstDate(),-1);await db.prepare('UPDATE rounds SET start_date=?,deadline_date=? WHERE id=?').bind(yesterday,yesterday,id).run();
 await addProblem(id);const r=await upload(id,EXAMPLES[0]);assert.equal(r.status,201);assert.equal((await r.json()).status,'approved');
 const s=await state();assert.ok(s.certificates[id]['1'][EXAMPLES[0].id]);assert.equal(memberCount(s,s.rounds[0],'1'),0);
});
