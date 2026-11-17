import test,{before,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
import {unstable_splitSqlQuery} from 'wrangler';
import {hash,seal} from '../server/crypto.js';
import {EXAMPLES} from '../public/core.js';
import {seedLegacyMemberships} from './fixtures.js';

const base='https://slices.test',secret=Buffer.alloc(32,17).toString('base64');
let script,mf,db;
const run=async(sql,...args)=>db.prepare(sql).bind(...args).run();
const rows=async(sql,...args)=>(await db.prepare(sql).bind(...args).all()).results;
async function apply(file){for(const sql of unstable_splitSqlQuery(await readFile('migrations/'+file,'utf8')).filter(s=>s.trim()))await db.prepare(sql).run();}
async function get(path,actor='1',study='study'){
 return mf.dispatchFetch(base+path,{headers:{...(actor?{Cookie:'puli_session=slice-'+actor}:{}),'X-Puli-Study':study}});
}
async function addProof(round,member,problem,method='github'){
 await run('INSERT INTO certificates VALUES (?,?,?,?,?,?,?)',round,member,problem,method,'2026-01-05T12:00:00Z','2026-01-06T12:00:00Z','{}');
}
before(async()=>{script=(await build({entryPoints:['server/index.js'],bundle:true,format:'esm',platform:'browser',write:false})).outputFiles[0].text;});
beforeEach(async()=>{
 mf=new Miniflare({modules:true,script,compatibilityDate:'2026-05-22',d1Databases:['DB'],cf:false,bindings:{APP_ORIGIN:base,ENCRYPTION_KEY:secret,OWNER_GITHUB_ID:'1'}});db=await mf.getD1Database('DB');
 for(const file of(await readdir('migrations')).filter(f=>f.endsWith('.sql')&&f<'0011').sort())await apply(file);
 for(const [id,role,slot] of [['1','owner',0],['2','member',1]]){
  await run('INSERT INTO members(id,login,name,role,slot) VALUES (?,?,?,?,?)',id,'user'+id,'팀원'+id,role,slot);
  await run('INSERT INTO sessions(hash,member_id,sealed_token,expires_at) VALUES (?,?,?,?)',await hash('slice-'+id),id,await seal({token:'test'},secret),Date.now()+3600000);
 }
 await seedLegacyMemberships(db);
 await run("INSERT INTO studies(id,name,description,capacity,created_by,created_at) VALUES ('other','다른 스터디','',5,'2','2026-01-01')");
 await run("INSERT INTO study_memberships VALUES ('other','2','owner',0,'2026-01-01')");
 for(const [id,study,number,history] of [['normal','study',1,0],['history','study',2,1],['other-round','other',1,0]])
  await run('INSERT INTO rounds(id,study_id,number,title,start_date,deadline_date,setter,problems,created_at,history_only) VALUES (?,?,?,?,?,?,?,?,?,?)',id,study,number,id,'2026-01-01','2026-01-07',study==='other'?'2':'1',JSON.stringify(EXAMPLES),'2026-01-01',history);
 await addProof('normal','1',EXAMPLES[0].id);
 await addProof('history','1',EXAMPLES[1].id);
 await addProof('other-round','2',EXAMPLES[0].id,'photo');
});
afterEach(async()=>{await mf?.dispose();});

test('migration preserves old study data and retroactively credits only actual non-history proofs',async()=>{
 const before=await Promise.all(['studies','members','study_memberships','rounds','certificates'].map(table=>rows('SELECT * FROM '+table+' ORDER BY rowid')));
 await apply('0011_slice_awards.sql');
 const after=await Promise.all(['studies','members','study_memberships','rounds','certificates'].map(table=>rows('SELECT * FROM '+table+' ORDER BY rowid')));
 assert.deepEqual(after,before);
 const awards=await rows('SELECT study_id,round_id,member_id,problem_id,retroactive FROM slice_awards ORDER BY study_id');
 assert.deepEqual(awards.map(a=>[a.study_id,a.round_id,a.member_id,a.retroactive]),[['other','other-round','2',1],['study','normal','1',1]]);
 const first=await(await get('/api/state')).json();assert.deepEqual(first.slices,{personal:1,team:1});
 const second=await(await get('/api/state','2')).json();assert.deepEqual(second.slices,{personal:1,team:1});
 const other=await(await get('/api/state','2','other')).json();assert.deepEqual(other.slices,{personal:1,team:1});
 assert.equal((await get('/api/slices','','study')).status,401);
 assert.equal((await get('/api/slices','1','other')).status,403);
 assert.equal((await get('/api/slices?scope=other')).status,400);
});

test('new certificates credit both scopes once, including late proof, updates and multiple studies',async()=>{
 await apply('0011_slice_awards.sql');
 await addProof('normal','2',EXAMPLES[1].id,'photo');
 await addProof('other-round','2',EXAMPLES[1].id,'github');
 await run("UPDATE certificates SET method='photo',at='2026-01-10T00:00:00Z' WHERE round_id='normal' AND member_id='2'");
 await run("INSERT INTO certificates VALUES (?,?,?,?,?,?,?) ON CONFLICT(round_id,member_id,problem_id) DO UPDATE SET evidence=excluded.evidence",'normal','2',EXAMPLES[1].id,'github','2026-01-11T00:00:00Z','2026-01-11T00:00:00Z','{}');
 await addProof('history','2',EXAMPLES[2].id,'photo');
 assert.deepEqual((await(await get('/api/state','2')).json()).slices,{personal:3,team:2});
 assert.deepEqual((await(await get('/api/state','2','other')).json()).slices,{personal:3,team:2});
 const mine=await(await get('/api/slices?scope=personal','2')).json();assert.equal(mine.items.length,3);assert.equal(mine.items.filter(x=>x.retroactive).length,1);
 const team=await(await get('/api/slices?scope=team','2')).json();assert.equal(team.items.length,2);assert.ok(team.items.every(x=>x.studyName==='우리 코테 스터디'));assert.ok(team.items.some(x=>x.memberName==='팀원1'));
 assert.equal((await rows("SELECT * FROM slice_awards WHERE round_id='normal' AND member_id='2'")).length,1);
});

test('a rolled-back certificate cannot leave a slice behind',async()=>{
 await apply('0011_slice_awards.sql');
 await assert.rejects(db.batch([
  db.prepare('INSERT INTO certificates VALUES (?,?,?,?,?,?,?)').bind('normal','2',EXAMPLES[2].id,'github','2026-01-01','2026-01-01','{}'),
  db.prepare('INSERT INTO members(id,login,name,role,slot) VALUES (?,?,?,?,?)').bind('1','duplicate','duplicate','owner',0)
 ]));
 assert.equal((await rows("SELECT * FROM certificates WHERE round_id='normal' AND member_id='2'")).length,0);
 assert.equal((await rows("SELECT * FROM slice_awards WHERE round_id='normal' AND member_id='2'")).length,0);
});
