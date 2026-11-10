import {seedLegacyMemberships} from './fixtures.js';
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
import {hash,seal} from '../server/crypto.js';
import {loadCertifiedCode,saveShare} from '../server/solutions.js';
import {solutionBody,solutionOverview} from '../public/solutions.js';
import {EXAMPLES,kstDate,nextTuesday} from '../public/core.js';
const base='https://solutions.test',secret=Buffer.alloc(32,46).toString('base64');let mf,db,n=0;
const request=(path,{actor='1',method='GET',body,origin=base}={})=>mf.dispatchFetch(base+path,{method,headers:{Cookie:'puli_session=share-'+actor,...(method==='POST'?{Origin:origin,'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
before(async()=>{
 const bundle=await build({entryPoints:['server/index.js'],bundle:true,format:'esm',platform:'browser',write:false});
 mf=new Miniflare({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-05-22',d1Databases:['DB'],cf:false,bindings:{ENCRYPTION_KEY:secret,APP_ORIGIN:base,OWNER_GITHUB_ID:'1'}});db=await mf.getD1Database('DB');
 for(const file of (await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort())for(const sql of (await readFile('migrations/'+file,'utf8')).split(';').filter(s=>s.trim()))await db.prepare(sql).run();
 for(const [id,role]of [['1','owner'],['2','member']]){await db.prepare('INSERT INTO members(id,login,name,role,slot) VALUES (?,?,?,?,?)').bind(id,'user'+id,'팀원'+id,role,Number(id)-1).run();await db.prepare('INSERT INTO sessions VALUES (?,?,?,?)').bind(await hash('share-'+id),id,await seal({token:'qa'},secret),Date.now()+3600000).run();}
 await seedLegacyMemberships(db);
});
after(async()=>mf?.dispose());
async function fixture(cert=true){const id='share-round-'+(++n);await db.prepare('INSERT INTO rounds(id,number,title,start_date,deadline_date,setter,problems,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(id,n,'공유 테스트',kstDate(),nextTuesday(),'1',JSON.stringify(EXAMPLES),new Date().toISOString()).run();if(cert)await db.prepare("INSERT INTO certificates VALUES (?,?,?,'photo',?,?,?)").bind(id,'1',EXAMPLES[0].id,new Date().toISOString(),new Date().toISOString(),'{}').run();return {round:id,problem:EXAMPLES[0].id,revision:0,shared:true,consent:true,code:'print("Hello")',note:'해시를 사용합니다.',language:'Python'};}
const save=(body,options={})=>request('/api/solution-shares',{method:'POST',body,...options});
const query=data=>new URLSearchParams({round:data.round,problem:data.problem});
test('authentication, same-origin, certification and explicit sharing consent are required',async()=>{
 const data=await fixture(false);assert.equal((await request('/api/solution-shares?'+query(data),{actor:'missing'})).status,401);assert.equal((await save(data,{origin:'https://bad.test'})).status,403);assert.equal((await save(data)).status,403);
 const good=await fixture();assert.equal((await save({...good,consent:false})).status,400);assert.equal((await save({...good,memberId:'2'})).status,400);
});
test('team sees only published code; author can update and unshare without changing certification',async()=>{
 const data=await fixture(),result=await(await save(data)).json();assert.equal(result.share.revision,1);
 const url='/api/solution-shares?'+query(data)+'&member=1';assert.equal((await(await request(url,{actor:'2'})).json()).share.code,data.code);
 const state=await(await request('/api/state',{actor:'2'})).json();const meta=state.solutionShares.find(s=>s.roundId===data.round);assert.equal(meta.code,undefined);assert.equal(meta.note,undefined);
 assert.equal((await save({...data,revision:1,code:'replacement'},{actor:'2'})).status,409);
 assert.equal((await save({...data,revision:1,shared:false},{actor:'2'})).status,409);
 const hidden=await(await save({...data,revision:1,shared:false})).json();assert.equal(hidden.share.shared,false);assert.equal(hidden.share.code,data.code);
 assert.equal((await request(url,{actor:'2'})).status,404);assert.equal((await(await request(url)).json()).share.code,data.code);
 assert.ok(!(await(await request('/api/state',{actor:'2'})).json()).solutionShares.some(s=>s.roundId===data.round));
 assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM certificates WHERE round_id=?').bind(data.round).first()).n,1);
});
test('simultaneous edits have one winner and stale edits cannot overwrite newer content',async()=>{
 const data=await fixture();const responses=await Promise.all([save(data),save({...data,code:'other'})]);assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);assert.equal((await save(data)).status,409);
});
test('code limits and escaped rendering prevent executable shared content',async()=>{
 const data=await fixture();assert.equal((await save({...data,code:'한'.repeat(24000)})).status,400);assert.equal((await save({...data,note:'x'.repeat(4001)})).status,400);
 const unsafe={code:'</code><img src=x onerror=alert(1)>',note:'<script>alert(2)</script>',language:'<svg/onload=x>'};const html=solutionBody(unsafe);assert.ok(!html.includes('<img'));assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script&gt;'));
});
test('GitHub import reads only the author’s certified file at its immutable commit, with scoped token',async()=>{
 const data=await fixture(),sha='a'.repeat(40),path='0001-two-sum/two-sum.py';await db.prepare("UPDATE certificates SET method='github',evidence=? WHERE round_id=?").bind(JSON.stringify({repo:'user1/solutions',sha,path}),data.round).run();
 await db.prepare('INSERT OR REPLACE INTO repositories(member_id,platform,repo_id,full_name,installation_id,branch,private) VALUES (?,?,?,?,?,?,1)').bind('1','leetcode','12','user1/solutions','34','main').run();
 let readPath,repoScope;const options={configFor:async()=>({id:'app'}),tokenFor:async(config,repo)=>{repoScope=repo.repo_id;return 'scoped';},fetcher:async(url,init)=>{readPath=url;assert.equal(init.headers.Authorization,'Bearer scoped');return Response.json({type:'file',encoding:'base64',size:10,content:Buffer.from('print(1)').toString('base64')});}};
 const queryData=query(data),result=await loadCertifiedCode({DB:db},{member_id:'1'},queryData,options);assert.equal(result.code,'print(1)');assert.equal(repoScope,'12');assert.ok(readPath.endsWith('/contents/'+path+'?ref='+sha));
 await assert.rejects(loadCertifiedCode({DB:db},{member_id:'2'},queryData,options),e=>e.status===403);
 queryData.set('path','secret.env');await assert.rejects(loadCertifiedCode({DB:db},{member_id:'1'},queryData,options),e=>e.status===400);
 await db.prepare('UPDATE certificates SET evidence=? WHERE round_id=?').bind(JSON.stringify({repo:'user1/solutions',sha,path:'0001-two-sum/../../secret.py'}),data.round).run();await assert.rejects(loadCertifiedCode({DB:db},{member_id:'1'},query(data),options),e=>e.status===409);
});
test('a round edit during save cannot publish stale problem content',async()=>{
 const data=await fixture(),env={DB:{prepare:sql=>{const statement=db.prepare(sql);if(sql.startsWith('INSERT INTO solution_shares'))return {bind:(...args)=>({run:async()=>{await db.prepare('UPDATE rounds SET revision=revision+1 WHERE id=?').bind(data.round).run();return statement.bind(...args).run();}})};return statement;}}};
 await assert.rejects(saveShare(env,{member_id:'1'},data),e=>e.status===409);
});
