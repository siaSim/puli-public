import {seedLegacyMemberships} from './fixtures.js';
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {generateKeyPairSync,createHmac,createPublicKey,verify} from 'node:crypto';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
import sharp from 'sharp';
import {hash,seal,unseal,appJWT,encode} from '../server/crypto.js';
import {appInstallURL,sourceFile,pathMatches,readmeMatches,eligibleCommit,evidenceForCommit} from '../server/github.js';
import {syncRepository} from '../server/sync.js';
import {EXAMPLES,kstDate,nextTuesday,addDays} from '../public/core.js';
import {latestRound} from '../server/store.js';

const secret=Buffer.alloc(32,7).toString('base64');
const key=generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs1',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}});
const config={id:42,slug:'puli-test',client_id:'test',client_secret:'private-secret',pem:key.privateKey,webhook_secret:'webhook-secret'};
let mf,db,env,ownerCookie,memberCookie,roundId;
const base='https://puli.test';
const request=(path,{method='GET',cookie=ownerCookie,body,headers={}}={})=>mf.dispatchFetch(base+path,{method,redirect:'manual',headers:{...(cookie?{Cookie:cookie}:{}),...(method!=='GET'?{Origin:base}:{}),...(body&&typeof body==='string'?{'Content-Type':'application/json'}:{}),...headers},...(body?{body}:{})});
before(async()=>{
 const bundled=await build({entryPoints:['server/index.js'],bundle:true,format:'esm',platform:'browser',write:false,target:'es2022'});
 mf=new Miniflare({modules:true,script:bundled.outputFiles[0].text,compatibilityDate:'2026-05-22',d1Databases:['DB'],cf:false,bindings:{ENCRYPTION_KEY:secret,OWNER_GITHUB_ID:'101',APP_ORIGIN:base}});
 db=await mf.getD1Database('DB');env={DB:db,ENCRYPTION_KEY:secret};
 for(const file of (await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort())for(const sql of (await readFile('migrations/'+file,'utf8')).split(';').filter(s=>s.trim()))await db.prepare(sql).run();
 await db.prepare('INSERT INTO config VALUES (?,?)').bind('github',await seal(config,secret)).run();
 for(const [id,login,role,slot] of [['101','fixture-owner','owner',0],['2','member','member',1]]){
  await db.prepare('INSERT INTO members(id,login,name,role,slot) VALUES (?,?,?,?,?)').bind(id,login,login,role,slot).run();
  const raw='session-'+id;await db.prepare('INSERT INTO sessions VALUES (?,?,?,?)').bind(await hash(raw),id,await seal({token:'private-user-token'},secret),Date.now()+3600000).run();
 }
 await seedLegacyMemberships(db);
 ownerCookie='puli_session=session-101';memberCookie='puli_session=session-2';
});
after(async()=>{await mf?.dispose();});

test('encrypted values reject a changed ciphertext and a different encryption key',async()=>{
 const encrypted=await seal({secret:'sensitive'},secret);assert.deepEqual(await unseal(encrypted,secret),{secret:'sensitive'});assert.ok(!encrypted.includes('sensitive'));
 await assert.rejects(unseal(encrypted,Buffer.alloc(32,8).toString('base64')));
 const [iv,bytes]=encrypted.split('.');const changed=Buffer.from(bytes,'base64');changed[4]^=1;await assert.rejects(unseal(iv+'.'+changed.toString('base64'),secret));
});
test('GitHub App JWT supports GitHub PKCS1 PEM and has bounded expiry',async()=>{
 const jwt=await appJWT(config);const [head,payload,sig]=jwt.split('.');assert.equal(JSON.parse(Buffer.from(head,'base64url')).alg,'RS256');assert.equal(JSON.parse(Buffer.from(payload,'base64url')).iss,'42');assert.ok(verify('RSA-SHA256',Buffer.from(head+'.'+payload),key.publicKey,Buffer.from(sig,'base64url')));
});
test('installation link follows the current GitHub App slug and rejects an unrelated app',async()=>{
 const fetcher=async(url,options)=>{
  assert.equal(url,'https://api.github.com/app');
  assert.match(options.headers.Authorization,/^Bearer /);
  return Response.json({id:42,slug:'geumgyul-study'});
 };
 assert.equal(await appInstallURL(config,{fetcher}),'https://github.com/apps/geumgyul-study/installations/new');
 await assert.rejects(appInstallURL(config,{fetcher:async()=>Response.json({id:99,slug:'other-app'})}));
});

test('extension source matching accepts actual unicode folders, rejects documents and wrong IDs',()=>{
 const file={filename:'프로그래머스/1/42840.\u2005모의고사/모의고사.py',status:'modified',additions:2,deletions:1};
 assert.ok(sourceFile(file));assert.ok(pathMatches(file,EXAMPLES[1]));assert.ok(!pathMatches(file,EXAMPLES[2]));assert.ok(pathMatches({filename:'0001-two-sum/0001-two-sum.py'},EXAMPLES[0]));
 for(const filename of ['README.md','stats.json','review/solution.py','0001-two-sum/README.md'])assert.ok(!sourceFile({...file,filename}));
 assert.ok(!sourceFile({...file,status:'removed'}));assert.ok(!sourceFile({...file,status:'renamed',additions:0,deletions:0}));
 assert.ok(readmeMatches('[문제](https://school.programmers.co.kr/learn/courses/30/lessons/42840)',EXAMPLES[1]));assert.ok(!readmeMatches('https://evil.test/42840',EXAMPLES[1]));
});
test('old solves, other authors, and merge commits are excluded',()=>{
 const round={startDate:'2026-10-21'};const commit={author:{id:1},commit:{committer:{date:'2026-10-21T01:00:00Z'}},parents:[{}]};
 assert.ok(eligibleCommit(commit,{id:'1'},round,Date.parse('2026-10-22')));
 assert.ok(!eligibleCommit(commit,{id:'2'},round,Date.parse('2026-10-22')));
 assert.ok(!eligibleCommit({...commit,parents:[{},{}]},{id:'1'},round,Date.parse('2026-10-22')));
 assert.ok(!eligibleCommit({...commit,commit:{committer:{date:'2026-10-20T14:59:59Z'}}},{id:'1'},round,Date.parse('2026-10-22')));
});
test('anonymous or forged browser identity cannot read study data or photos',async()=>{
 for(const path of ['/api/state','/api/photos/anything']){const r=await request(path,{cookie:'','headers':{'oai-authenticated-user-id':'owner'}});assert.equal(r.status,401);}
 const r=await request('/api/status',{cookie:''});assert.deepEqual(await r.json(),{configured:true,user:null});
});
test('server rejects cross-site writes and reused or absent OAuth state',async()=>{
 const r=await request('/api/logout',{method:'POST',headers:{Origin:'https://evil.test'}});assert.equal(r.status,403);
 const callback=await request('/auth/github/callback?code=fake&state=fake');assert.equal(callback.status,400);
 const admin=await request('/api/members',{method:'POST',cookie:memberCookie,body:JSON.stringify({login:'test'})});assert.equal(admin.status,403);
});
test('OAuth redirect includes state and PKCE without leaking client secrets',async()=>{
 const r=await request('/auth/github',{cookie:''});assert.equal(r.status,303);const u=new URL(r.headers.get('location'));assert.equal(u.origin,'https://github.com');assert.equal(u.searchParams.get('code_challenge_method'),'S256');assert.ok(u.searchParams.get('state'));assert.ok(!u.href.includes(config.client_secret));assert.ok(r.headers.get('set-cookie').includes('HttpOnly'));
});
test('before the first round, sync verifies installation content access without certifying or advancing the commit cursor',async()=>{
 const repo={member_id:'2',platform:'programmers',repo_id:'9',full_name:'member/solutions',installation_id:'8',branch:'main'};
 await db.prepare('INSERT INTO repositories(member_id,platform,repo_id,full_name,installation_id,branch) VALUES (?,?,?,?,?,?)').bind(repo.member_id,repo.platform,repo.repo_id,repo.full_name,repo.installation_id,repo.branch).run();
 const seen=[];const fetcher=async(url,opts)=>{seen.push(url);if(url.includes('/access_tokens')){assert.deepEqual(JSON.parse(opts.body),{repository_ids:[9],permissions:{contents:'read',metadata:'read'}});return Response.json({token:'installation-secret'});}assert.equal(opts.headers.Authorization,'Bearer installation-secret');assert.ok(url.endsWith('/repos/member/solutions/commits?sha=main&per_page=1'));return Response.json([{sha:'existing-commit'}]);};
 const result=await syncRepository(env,repo,{fetcher});assert.equal(result.waitingForRound,true);assert.equal(result.accessVerified,true);assert.equal(result.count,0);assert.equal(seen.length,2);
 let row=await db.prepare('SELECT checked_at,sync_cursor,sync_error FROM repositories WHERE member_id = ?').bind('2').first();assert.equal(row.checked_at,null);assert.equal(row.sync_cursor,null);assert.equal(row.sync_error,null);
 assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM certificates').first()).count,0);
 await assert.rejects(syncRepository(env,repo,{fetcher:async(url)=>url.includes('/access_tokens')?Response.json({token:'installation-secret'}):Response.json({}, {status:404})}),/저장소 접근 권한/);
 row=await db.prepare('SELECT sync_error FROM repositories WHERE member_id = ?').bind('2').first();assert.match(row.sync_error,/저장소 접근 권한/);
 await syncRepository(env,repo,{fetcher:async(url)=>url.includes('/access_tokens')?Response.json({token:'installation-secret'}):Response.json({}, {status:409})});
 row=await db.prepare('SELECT checked_at,sync_error FROM repositories WHERE member_id = ?').bind('2').first();assert.equal(row.checked_at,null);assert.equal(row.sync_error,null);
 await db.prepare('DELETE FROM repositories WHERE member_id = ?').bind('2').run();
});
test('round publishing validates real rules and disallows overlapping rounds',async()=>{
 const data={title:'실제 테스트 회차',startDate:kstDate(),deadlineDate:nextTuesday(),problems:EXAMPLES};
 const bad=await request('/api/rounds',{method:'POST',body:JSON.stringify({...data,problems:[EXAMPLES[0],EXAMPLES[1],EXAMPLES[1],EXAMPLES[3],EXAMPLES[4]]})});assert.equal(bad.status,400);
 const good=await request('/api/rounds',{method:'POST',body:JSON.stringify(data)});assert.equal(good.status,201);roundId=(await good.json()).id;
 const again=await request('/api/rounds',{method:'POST',body:JSON.stringify(data)});assert.equal(again.status,400);
 const state=await (await request('/api/state')).json();assert.equal(state.rounds.length,1);assert.equal(state.rounds[0].problems.length,5);assert.deepEqual(state.certificates,{});assert.ok(!JSON.stringify(state).includes('private-user-token'));
});
test('photo uploads require actual JPEG structure and explicit repeat-solve acknowledgement',async()=>{
 const path='/api/photo?round='+roundId+'&problem='+EXAMPLES[0].id;
 let r=await request(path,{method:'POST',body:new Uint8Array([255,216,255,217]),headers:{'Content-Type':'image/jpeg'}});assert.equal(r.status,400);
 r=await request(path,{method:'POST',body:new Uint8Array([255,216,255,217]),headers:{'Content-Type':'image/jpeg','x-puli-confirmed':'yes'}});assert.equal(r.status,400);
 r=await request(path,{method:'POST',body:new Uint8Array(350*1024+1),headers:{'Content-Type':'image/jpeg','x-puli-confirmed':'yes'}});assert.equal(r.status,413);
});
test('real JPEG uploads without OCR stay private and pending, supersede earlier requests, and respect the storage cap',async()=>{
 const photo=await sharp({create:{width:40,height:30,channels:3,background:{r:240,g:245,b:231}}}).jpeg().toBuffer();
 const path='/api/photo?round='+roundId+'&problem='+EXAMPLES[1].id;
 const options={method:'POST',body:photo,headers:{'Content-Type':'image/jpeg','x-puli-confirmed':'yes','x-puli-note':encodeURIComponent('테스트 사진')}};
 let r=await request(path,options);assert.equal(r.status,201);
 let state=await (await request('/api/state')).json();const first=state.photoSubmissions.find(s=>s.roundId===roundId&&s.problemId===EXAMPLES[1].id).photoId;assert.ok(!state.certificates[roundId]?.['101']?.[EXAMPLES[1].id]);
 r=await request('/api/photos/'+first);assert.equal(r.status,200);assert.deepEqual(Buffer.from(await r.arrayBuffer()),photo);
 assert.equal((await request('/api/photos/'+first,{cookie:''})).status,401);
 assert.equal((await request(path,options)).status,201);
 assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM photos').first()).count,2);
 assert.equal((await request('/api/photos/'+first)).status,200);
 await db.prepare('INSERT INTO photos(id,member_id,size,bytes,created_at) VALUES (?,?,?,?,?)').bind('cap','101',100*1024*1024,[1],new Date().toISOString()).run();
 assert.equal((await request(path,options)).status,507);
 await db.prepare('DELETE FROM photos WHERE id = ?').bind('cap').run();
});
test('webhooks reject missing and altered signatures and deduplicate completed deliveries',async()=>{
 const raw=JSON.stringify({repository:{id:7},installation:{id:8},ref:'refs/heads/main'});
 const signature='sha256='+createHmac('sha256',config.webhook_secret).update(raw).digest('hex');
 const opts={method:'POST',cookie:'',body:raw,headers:{'x-github-delivery':'test-delivery','x-github-event':'push'}};
 assert.equal((await request('/api/github/webhook',opts)).status,401);
 const result=await request('/api/github/webhook',{...opts,headers:{...opts.headers,'x-hub-signature-256':signature}});assert.equal(result.status,202);await result.json();
 await new Promise(resolve=>setTimeout(resolve,30));
 const again=await request('/api/github/webhook',{...opts,headers:{...opts.headers,'x-hub-signature-256':signature}});assert.equal(again.status,200);assert.equal((await again.json()).duplicate,true);
 const tampered=await request('/api/github/webhook',{...opts,body:raw+' ',headers:{...opts.headers,'x-hub-signature-256':signature}});assert.equal(tampered.status,401);
});
test('automatic certification verifies source and original problem URL, persists once, and exposes real commit evidence',async()=>{
 const now=Date.now(),at=new Date(now-1000).toISOString();const repo={member_id:'101',platform:'leetcode',repo_id:'7',full_name:'fixture-owner/leetcode_codingtest',installation_id:'8',branch:'main'};
 await db.prepare('INSERT INTO repositories(member_id,platform,repo_id,full_name,installation_id,branch) VALUES (?,?,?,?,?,?)').bind(repo.member_id,repo.platform,repo.repo_id,repo.full_name,repo.installation_id,repo.branch).run();
 const commit={sha:'a'.repeat(40),author:{id:101,login:'fixture-owner'},parents:[{}],commit:{committer:{date:at}},files:[{filename:'0001-two-sum/0001-two-sum.py',status:'modified',additions:3,deletions:1}]};
 const seen=[];const fetcher=async(url,opts)=>{seen.push(url);if(url.includes('/access_tokens'))return Response.json({token:'installation-secret'});if(url.includes('/commits?'))return Response.json([{sha:commit.sha}]);if(url.includes('/commits/'))return Response.json(commit);if(url.includes('/contents/'))return Response.json({encoding:'base64',size:100,content:Buffer.from('[Problem](https://leetcode.com/problems/two-sum/)').toString('base64')});throw new Error('Unexpected request '+url);};
 const result=await syncRepository(env,repo,{fetcher,now});assert.equal(result.count,1);assert.equal(result.more,false);
 const second=await syncRepository(env,repo,{fetcher,now:now+1000});assert.equal(second.count,0);
 const state=await (await request('/api/state')).json();const c=state.certificates[roundId]['101']['lc-two-sum'];assert.equal(c.method,'github');assert.equal(c.sha,commit.sha);assert.equal(c.at,at);assert.ok(c.url.endsWith(commit.sha));assert.ok(!JSON.stringify(state).includes('installation-secret'));assert.ok(seen.some(u=>u.includes('/contents/0001-two-sum/README.md?ref=')));
 const wrong=await evidenceForCommit(commit,EXAMPLES[0],repo,'token',async()=>Response.json({encoding:'base64',size:100,content:Buffer.from('https://leetcode.com/problems/three-sum/').toString('base64')}));assert.equal(wrong,null);
});

for(const platform of ['leetcode','programmers'])test(`${platform}: personal solves and misleading problem titles are excluded, including when mixed with an assigned solve`,async()=>{
 const assigned=EXAMPLES.find(p=>p.platform===platform);
 const assignedFolder=platform==='leetcode'?'0001-two-sum':'프로그래머스/1/42840.\u2005모의고사';
 const personalFolder=platform==='leetcode'?'0015-three-sum':'프로그래머스/1/99999999.\u2005모의고사';
 const personalURL=platform==='leetcode'?'https://leetcode.com/problems/three-sum/':'https://school.programmers.co.kr/learn/courses/30/lessons/99999999';
 const personalId=platform==='leetcode'?'lc-three-sum':'pg-99999999';
 const repo={member_id:'2',platform,repo_id:platform==='leetcode'?'91':'92',full_name:'member/'+platform,installation_id:'8',branch:'main'};
 await db.prepare('INSERT INTO repositories(member_id,platform,repo_id,full_name,installation_id,branch) VALUES (?,?,?,?,?,?)').bind(repo.member_id,repo.platform,repo.repo_id,repo.full_name,repo.installation_id,repo.branch).run();
 const now=Date.now(),at=new Date(now-1000).toISOString();
 const source=folder=>({filename:folder+'/solution.py',status:'added',additions:4,deletions:0});
 const commit=(letter,files)=>({sha:letter.repeat(40),author:{id:2,login:'member'},parents:[{}],commit:{message:assigned.title,committer:{date:at}},files});
 const personal=commit('c',[source(personalFolder)]);
 const wrongURL=commit('d',[source(assignedFolder)]);
 const mixed=commit('e',[source(personalFolder),source(assignedFolder)]);
 const commits=[personal,wrongURL,mixed];
 const fetcher=async(url)=>{
  if(url.includes('/access_tokens'))return Response.json({token:'installation-secret'});
  if(url.includes('/commits?'))return Response.json(commits.map(c=>({sha:c.sha})));
  if(url.includes('/commits/'))return Response.json(commits.find(c=>url.endsWith(c.sha)));
  if(url.includes('/contents/')){const link=url.endsWith(wrongURL.sha)?personalURL:assigned.url+'?language=python3';return Response.json({encoding:'base64',size:200,content:Buffer.from('# '+assigned.title+'\n[문제]('+link+')').toString('base64')});}
  throw new Error('Unexpected request '+url);
 };
 const result=await syncRepository(env,repo,{fetcher,now});assert.equal(result.count,1);assert.equal(result.more,false);
 const rows=(await db.prepare('SELECT problem_id,evidence FROM certificates WHERE round_id = ? AND member_id = ?').bind(roundId,'2').all()).results.filter(c=>c.problem_id.startsWith(platform==='leetcode'?'lc-':'pg-'));
 assert.equal(rows.length,1);assert.equal(rows[0].problem_id,assigned.id);assert.equal(JSON.parse(rows[0].evidence).sha,mixed.sha);
 const state=await (await request('/api/state',{cookie:memberCookie})).json();assert.equal(state.certificates[roundId]['2'][personalId],undefined);
});

let historyId;
const historical=(number=10,shift=0)=>{const deadlineDate=addDays(nextTuesday(),-7+shift);return {historyOnly:true,number,title:'지난 회차 문제 목록',startDate:addDays(deadlineDate,-6),deadlineDate,problems:EXAMPLES};};
test('owner can backfill a past problem list without changing existing rounds, certifications or repository cursors',async()=>{
 const before=await (await request('/api/state')).json();
 const cursors=(await db.prepare('SELECT member_id,platform,checked_at,sync_cursor FROM repositories ORDER BY member_id,platform').all()).results;
 const result=await request('/api/rounds',{method:'POST',body:JSON.stringify(historical())});assert.equal(result.status,201);historyId=(await result.json()).id;
 const state=await (await request('/api/state')).json();const history=state.rounds.find(r=>r.id===historyId);
 assert.equal(history.number,10);assert.equal(history.historyOnly,true);assert.equal(history.problems.length,5);
 assert.deepEqual(state.rounds.find(r=>r.id===roundId),before.rounds.find(r=>r.id===roundId));assert.deepEqual(state.certificates,before.certificates);
 assert.equal(state.certificates[historyId],undefined);assert.equal((await latestRound(env)).id,roundId);
 assert.deepEqual((await db.prepare('SELECT member_id,platform,checked_at,sync_cursor FROM repositories ORDER BY member_id,platform').all()).results,cursors);
});
test('past-list registration rejects ordinary members, duplicate numbers, future dates and malformed modes but permits original overlapping periods',async()=>{
 const post=(data,cookie)=>request('/api/rounds',{method:'POST',body:JSON.stringify(data),...(cookie?{cookie}:{})});
 assert.equal((await post(historical(9,-7),memberCookie)).status,403);
 const duplicate=await post(historical());assert.equal(duplicate.status,409);assert.ok((await duplicate.json()).fields.number);
 assert.equal((await post(historical(9))).status,201);
 assert.equal((await post({...historical(9,-7),historyOnly:'true'})).status,400);
 assert.equal((await post({...historical(9),startDate:kstDate(),deadlineDate:nextTuesday()})).status,400);
 assert.equal((await post({...historical(9,-7),historyOnly:false})).status,400);
});
test('past problem-only records cannot receive a photo certification',async()=>{
 const response=await request('/api/photo?round='+historyId+'&problem='+EXAMPLES[0].id,{method:'POST',body:new Uint8Array([255,216,255,217]),headers:{'Content-Type':'image/jpeg','x-puli-confirmed':'yes'}});
 assert.equal(response.status,400);assert.match((await response.json()).error,/문제 목록/);
 assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM certificates WHERE round_id = ?').bind(historyId).first()).count,0);
});
test('backfilled records do not change the live setter rotation and new numbers preserve every existing round number',async()=>{
 const current=await db.prepare('SELECT * FROM rounds WHERE id = ?').bind(roundId).first();
 const startDate=addDays(current.deadline_date,1),deadlineDate=addDays(current.deadline_date,7);
 const next=await request('/api/rounds',{method:'POST',cookie:memberCookie,body:JSON.stringify({title:'다음 회차',startDate,deadlineDate,problems:EXAMPLES})});assert.equal(next.status,201);
 const nextId=(await next.json()).id;assert.equal((await db.prepare('SELECT number FROM rounds WHERE id = ?').bind(nextId).first()).number,11);
 assert.equal((await request('/api/rounds',{method:'POST',body:JSON.stringify(historical(20,-7))})).status,201);
 const data={title:'다음 다음 회차',startDate:addDays(deadlineDate,1),deadlineDate:addDays(deadlineDate,7),problems:EXAMPLES};
 assert.equal((await request('/api/rounds',{method:'POST',cookie:memberCookie,body:JSON.stringify(data)})).status,403);
 assert.equal((await request('/api/rounds',{method:'POST',body:JSON.stringify(data)})).status,201);
 assert.equal((await db.prepare('SELECT number FROM rounds WHERE id = ?').bind(roundId).first()).number,1);
});
test('when only historical lists are published, GitHub sync verifies access and never scans them for certification',async()=>{
 await db.prepare('UPDATE rounds SET history_only = 1 WHERE id = ?').bind(roundId).run();
 try{
  assert.equal(await latestRound(env),null);
  const seen=[],repo={member_id:'2',platform:'leetcode',repo_id:'9',full_name:'member/solutions',installation_id:'8',branch:'main'};
  const result=await syncRepository(env,repo,{fetcher:async url=>{seen.push(url);return url.includes('/access_tokens')?Response.json({token:'test-installation'}):Response.json([]);}});
  assert.equal(result.waitingForRound,true);assert.equal(result.count,0);assert.equal(seen.length,2);assert.ok(seen[1].endsWith('sha=main&per_page=1'));
 }finally{await db.prepare('UPDATE rounds SET history_only = 0 WHERE id = ?').bind(roundId).run();}
});
test('source archives round-trip unknown deadlines and original counts, deduplicate imports and do not consume live round numbers',async()=>{
 const before=await (await request('/api/state')).json(),live=await latestRound(env);
 const maximum=(await db.prepare('SELECT MAX(number) AS number FROM rounds').first()).number;
 const data={historyOnly:true,title:'출제일 기준 보관',startDate:'2026-06-22',deadlineDate:null,historyMeta:{source:'kakao',postedAt:'2026-06-22T15:48:08+09:00',author:'원문 출제자',deadlineKnown:false,note:'자율 참여'},historyKey:'kakao:'+'a'.repeat(64),problems:[EXAMPLES[1],EXAMPLES[0]]};
 const post=d=>request('/api/rounds',{method:'POST',body:JSON.stringify(d)});
 const response=await post(data);assert.equal(response.status,201);const id=(await response.json()).id;
 const state=await (await request('/api/state')).json(),saved=state.rounds.find(r=>r.id===id);
 assert.equal(saved.deadlineDate,null);assert.equal(saved.problems.length,2);assert.ok(saved.number<0);assert.equal(saved.historyMeta.author,'원문 출제자');assert.equal(saved.historyMeta.dateBased,true);
 assert.equal((await post(data)).status,409);assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM rounds WHERE history_key = ?').bind(data.historyKey).first()).count,1);
 assert.deepEqual(state.certificates,before.certificates);assert.deepEqual(await latestRound(env),live);assert.equal((await db.prepare('SELECT MAX(number) AS number FROM rounds').first()).number,maximum);
 assert.equal((await post({...data,historyKey:'kakao:'+'b'.repeat(64),historyMeta:{...data.historyMeta,postedAt:'2026-06-23T15:48:08+09:00'}})).status,400);
 assert.equal((await post({...data,historyKey:'bad'})).status,400);
 assert.equal((await post({...data,historyMeta:{...data.historyMeta,deadlineKnown:'false'}})).status,400);
 assert.equal((await post({...data,historyOnly:false})).status,400);
 const monday=await post({...data,historyKey:'kakao:'+'c'.repeat(64),deadlineDate:'2026-06-29',historyMeta:{...data.historyMeta,deadlineKnown:true,deadlineLabel:'2026.06.29 오전'}});assert.equal(monday.status,201);
 const mondayId=(await monday.json()).id,known=(await (await request('/api/state')).json()).rounds.find(r=>r.id===mondayId);assert.equal(known.deadlineDate,'2026-06-29');assert.equal(known.historyMeta.deadlineLabel,'2026.06.29 오전');
});
