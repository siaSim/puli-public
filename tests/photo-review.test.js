import {seedLegacyMemberships} from './fixtures.js';
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
import sharp from 'sharp';
import {hash,seal} from '../server/crypto.js';
import {savePhotoSubmission} from '../server/photos.js';
import {EXAMPLES,kstDate,nextTuesday,addDays,isOnTime} from '../public/core.js';
const base='https://photos.test',secret=Buffer.alloc(32,43).toString('base64');
let mf,db,image,number=0;
const request=(path,{method='GET',actor='1',body,origin=base,headers={}}={})=>mf.dispatchFetch(base+path,{method,headers:{Cookie:'puli_session=photo-'+actor,...(method!=='GET'?{Origin:origin}:{}),...(typeof body==='string'?{'Content-Type':'application/json'}:{}),...headers},...(body?{body}:{})});
before(async()=>{
 const bundle=await build({entryPoints:['server/index.js'],bundle:true,format:'esm',platform:'browser',write:false});
 mf=new Miniflare({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-05-22',d1Databases:['DB'],cf:false,bindings:{ENCRYPTION_KEY:secret,OWNER_GITHUB_ID:'1',APP_ORIGIN:base}});db=await mf.getD1Database('DB');
 for(const file of (await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort())for(const sql of (await readFile('migrations/'+file,'utf8')).split(';').filter(s=>s.trim()))await db.prepare(sql).run();
 for(const [id,role]of [['1','owner'],['2','member'],['3','member']]){
  await db.prepare('INSERT INTO members(id,login,name,role,slot) VALUES (?,?,?,?,?)').bind(id,'user'+id,'팀원'+id,role,Number(id)-1).run();
  await db.prepare('INSERT INTO sessions(hash,member_id,sealed_token,expires_at) VALUES (?,?,?,?)').bind(await hash('photo-'+id),id,await seal({token:'qa'},secret),Date.now()+3600000).run();
 }
 await seedLegacyMemberships(db);
 image=await sharp({create:{width:80,height:40,channels:3,background:'#f4f5f6'}}).jpeg().toBuffer();
});
after(async()=>{await mf?.dispose();});
async function round(){const id='photo-round-'+(++number);await db.prepare('INSERT INTO rounds(id,number,title,start_date,deadline_date,setter,problems,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(id,number,'사진 확인 테스트',kstDate(),nextTuesday(),'1',JSON.stringify(EXAMPLES),new Date().toISOString()).run();return id;}
async function upload(id,{ocr,actor='1',problem=EXAMPLES[0].id}={}){
 const form=new FormData();form.append('photo',new Blob([image],{type:'image/jpeg'}),'proof.jpg');form.append('metadata',JSON.stringify({note:'테스트 사진',...(ocr?{ocr}:{})}));
 const wire=new Request(base,{method:'POST',body:form});
 return request('/api/photo?'+new URLSearchParams({round:id,problem}),{method:'POST',actor,body:new Uint8Array(await wire.arrayBuffer()),headers:{'Content-Type':wire.headers.get('Content-Type'),'x-puli-confirmed':'yes'}});
}
const review=(id,decision,actor='2',note='')=>request('/api/photo-submissions/'+id+'/review',{method:'POST',actor,body:JSON.stringify({decision,note})});
const count=id=>db.prepare('SELECT COUNT(*) AS n FROM certificates WHERE round_id=?').bind(id).first();
test('confident matching OCR certifies once and exposes the comparison as browser OCR evidence',async()=>{
 const id=await round(),ocr={engine:'tesseract.js-7',text:'Two Sum\nAccepted',confidence:95};
 const response=await upload(id,{ocr});assert.equal(response.status,201);const result=await response.json();assert.equal(result.status,'approved');assert.equal(result.assessment.source,'browser-ocr');assert.equal((await count(id)).n,1);
 const proof=await db.prepare('SELECT evidence FROM certificates WHERE round_id=?').bind(id).first();assert.equal(JSON.parse(proof.evidence).ocr.verdict,'match');
});
test('unclear photos stay pending and cannot be approved by their submitter, including the owner',async()=>{
 const id=await round(),result=await (await upload(id)).json();assert.equal(result.status,'pending');assert.equal((await count(id)).n,0);
 assert.equal((await review(result.id,'approve','1')).status,403);
 const state=await (await request('/api/state',{actor:'2'})).json();assert.equal(state.photoSubmissions.find(s=>s.id===result.id).status,'pending');assert.equal((await count(id)).n,0);
 assert.equal((await review(result.id,'approve','2')).status,200);assert.equal((await count(id)).n,1);
 assert.equal((await review(result.id,'approve','3')).status,409);
});
test('approval preserves original submission time and rejects cross-site review requests',async()=>{
 const id=await round(),result=await (await upload(id)).json(),deadline=addDays(nextTuesday(),-7),at=new Date(deadline+'T23:58:00+09:00').toISOString();
 await db.prepare('UPDATE rounds SET start_date=?,deadline_date=? WHERE id=?').bind(addDays(deadline,-6),deadline,id).run();
 await db.prepare('UPDATE photo_submissions SET submitted_at=? WHERE id=?').bind(at,result.id).run();
 const bad=await request('/api/photo-submissions/'+result.id+'/review',{method:'POST',actor:'2',origin:'https://evil.test',body:JSON.stringify({decision:'approve'})});assert.equal(bad.status,403);
 assert.equal((await review(result.id,'approve')).status,200);
 const proof=await db.prepare('SELECT at,evidence FROM certificates WHERE round_id=?').bind(id).first();assert.equal(proof.at,at);assert.ok(isOnTime(proof.at,{startDate:addDays(deadline,-6),deadlineDate:deadline}));assert.equal(JSON.parse(proof.evidence).reviewedBy,'2');
});
test('rejection requires a reason; resubmitting supersedes a pending photo without duplicating certifications',async()=>{
 const id=await round(),first=await (await upload(id)).json();assert.equal((await review(first.id,'reject')).status,400);
 assert.equal((await review(first.id,'reject','2','문제 이름이 안 보여요.')).status,200);assert.equal((await count(id)).n,0);
 const second=await (await upload(id)).json(),third=await (await upload(id)).json();assert.equal((await review(second.id,'approve')).status,409);
 assert.equal((await review(third.id,'approve')).status,200);assert.equal((await count(id)).n,1);
 const state=await (await request('/api/state')).json();assert.equal(state.photoSubmissions.filter(s=>s.roundId===id).length,1);assert.equal(state.photoSubmissions.find(s=>s.roundId===id).id,third.id);
});
test('simultaneous approval and rejection have one winner and consistent evidence',async()=>{
 const id=await round(),row=await (await upload(id)).json();
 const responses=await Promise.all([review(row.id,'approve','2'),review(row.id,'reject','3','통과 여부를 확인할 수 없어요.')]);assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
 const saved=await db.prepare('SELECT status,reviewed_by FROM photo_submissions WHERE id=?').bind(row.id).first();assert.equal((await count(id)).n,saved.status==='approved'?1:0);
});
test('an unclear replacement and a later approval preserve an existing GitHub certificate',async()=>{
 const id=await round();await db.prepare("INSERT INTO certificates VALUES (?,?,?,'github',?,?,?)").bind(id,'1',EXAMPLES[0].id,new Date().toISOString(),new Date().toISOString(),JSON.stringify({url:'https://github.com/example/proof',sha:'existing'})).run();
 const row=await (await upload(id)).json();assert.equal(row.status,'pending');assert.equal((await count(id)).n,1);assert.equal((await review(row.id,'approve')).status,200);
 const proof=await db.prepare('SELECT method,evidence FROM certificates WHERE round_id=?').bind(id).first();assert.equal(proof.method,'github');assert.equal(JSON.parse(proof.evidence).sha,'existing');
});
test('a round edit during upload leaves no new evidence or orphan photo',async()=>{
 const id=await round(),r=await db.prepare('SELECT * FROM rounds WHERE id=?').bind(id).first(),before=await db.prepare('SELECT COUNT(*) AS n FROM photos').first();
 const env={DB:{prepare:sql=>db.prepare(sql),batch:async statements=>{await db.prepare('UPDATE rounds SET revision=revision+1 WHERE id=?').bind(id).run();return db.batch(statements);}}};
 await assert.rejects(savePhotoSubmission(env,{member_id:'1'},{round:r,problemId:EXAMPLES[0].id,bytes:image,note:'',ocr:undefined}),/회차 내용이 바뀌/);
 assert.equal((await count(id)).n,0);assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM photos').first()).n,before.n);
});
test('missing source photos and changed assigned problems cannot be approved',async()=>{
 const id=await round(),first=await (await upload(id)).json();const row=await db.prepare('SELECT photo_id FROM photo_submissions WHERE id=?').bind(first.id).first();await db.prepare('DELETE FROM photos WHERE id=?').bind(row.photo_id).run();assert.equal((await review(first.id,'approve')).status,410);
 const second=await (await upload(id)).json();await db.prepare('UPDATE rounds SET problems=? WHERE id=?').bind(JSON.stringify(EXAMPLES.slice(1)),id).run();assert.equal((await review(second.id,'approve')).status,409);assert.equal((await count(id)).n,0);
});
test('editing an uncertified assigned problem closes its pending review atomically',async()=>{
 await db.prepare('UPDATE rounds SET history_only=1').run();const id=await round(),submission=await (await upload(id)).json();
 const problems=structuredClone(EXAMPLES);problems[0]={...problems[0],id:'lc-three-sum',title:'3Sum',url:'https://leetcode.com/problems/3sum/'};
 const response=await request('/api/rounds/'+id,{method:'PATCH',body:JSON.stringify({revision:0,problems})});assert.equal(response.status,200);
 assert.equal((await db.prepare('SELECT status FROM photo_submissions WHERE id=?').bind(submission.id).first()).status,'superseded');
 assert.equal((await review(submission.id,'approve')).status,409);assert.equal((await count(id)).n,0);
});
test('dark OCR rereads persist through the upload API and never hide an original failure',async()=>{
 const id=await round(),runs=[{kind:'original',text:'Two Sum\nAccepted',confidence:66},{kind:'enhanced',text:'Two Sum\nAccepted',confidence:75},{kind:'identity',text:'Two Sum',confidence:89},{kind:'result',text:'Accepted',confidence:95}],ocr={engine:'tesseract.js-7',text:runs.map(r=>r.text).join('\n'),confidence:66,runs};
 const result=await(await upload(id,{ocr})).json();assert.equal(result.status,'approved');assert.equal(result.assessment.confidence,89);assert.equal(result.assessment.passes,4);assert.equal((await count(id)).n,1);
 const failed=await round(),rejected=await(await upload(failed,{ocr:{...ocr,text:'Two Sum\nWrong Answer',runs:[{...runs[0],text:'Two Sum\nWrong Answer'},...runs.slice(1)]}})).json();assert.equal(rejected.status,'pending');assert.equal(rejected.assessment.verdict,'mismatch');assert.equal((await count(failed)).n,0);
});
test('invalid extra OCR passes are rejected before storing photos',async()=>{
 const id=await round(),before=await db.prepare('SELECT COUNT(*) AS n FROM photos').first();
 for(const runs of [[],[null],[{kind:'original',text:'Two Sum',confidence:NaN}],[{kind:'original',text:'x'.repeat(2801),confidence:90}]]){
  const response=await upload(id,{ocr:{engine:'tesseract.js-7',text:'Two Sum\nAccepted',confidence:90,runs}});assert.equal(response.status,400);
 }
 assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM photos').first()).n,before.n);
});
