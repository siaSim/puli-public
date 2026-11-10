import test from 'node:test';
import assert from 'node:assert/strict';
import {EXAMPLES,putCertificate} from '../public/core.js';
import {pendingByMember,pendingSummary,pendingPanel} from '../public/pending.js';
const members=[{id:'me',name:'예시 사용자'},{id:'other',name:'팀원'}];
const now=new Date('2026-10-22T10:00:00+09:00');
function fixture(){
 const round={id:'current',number:1,title:'이번 회차',startDate:'2026-10-21',deadlineDate:'2026-10-27',problems:structuredClone(EXAMPLES)};
 return {round,state:{rounds:[round],certificates:{}}};
}
test('pending problems are isolated by round, member and assigned problem; both evidence methods count',()=>{
 const {state,round}=fixture();
 putCertificate(state,'previous','me',EXAMPLES[0].id,{method:'github'});
 putCertificate(state,round.id,'other',EXAMPLES[1].id,{method:'photo'});
 putCertificate(state,round.id,'me','lc-unassigned',{method:'github'});
 assert.deepEqual(pendingByMember(state,round,members,{today:'2026-10-22'}).map(r=>r.problems.length),[5,4]);
 putCertificate(state,round.id,'me',EXAMPLES[0].id,{method:'github'});
 putCertificate(state,round.id,'me',EXAMPLES[2].id,{method:'photo'});
 assert.deepEqual(pendingByMember(state,round,members,{today:'2026-10-22'})[0].problems.map(p=>p.id),[EXAMPLES[1].id,EXAMPLES[3].id,EXAMPLES[4].id]);
});
test('archive-only and unreleased rounds are never described as uncertified',()=>{
 const {state,round}=fixture();
 for(const excluded of [{...round,historyOnly:true},{...round,startDate:'2026-10-23'}]){
  assert.deepEqual(pendingByMember(state,excluded,members,{today:'2026-10-22'}),[]);
  assert.equal(pendingSummary(state,excluded,members,{now}),'');
 }
 assert.deepEqual(pendingByMember(state,null,members),[]);
});
test('shared lists update with fresh evidence and never expose another member in an individual share',()=>{
 const {state,round}=fixture();
 const before=pendingSummary(state,round,members,{now});assert.match(before,/총 10건/);assert.match(before,/2026-10-27 화요일 23:59/);
 for(const p of round.problems)putCertificate(state,round.id,'me',p.id,{method:'photo'});
 const mine=pendingSummary(state,round,[members[0]],{now,url:'https://study.example/#home'});
 assert.match(mine,/총 0건/);assert.match(mine,/모두 인증 완료/);assert.ok(!mine.includes('팀원 ('));assert.ok(!mine.includes(EXAMPLES[0].url));
 assert.match(mine,/아직 인증하지 않은 풀이도 포함/);assert.match(mine,/https:\/\/study.example\/#home/);
 assert.match(pendingSummary(state,round,members,{now}),/총 5건/);
});
test('team filtering only changes displayed members; names and problem titles are escaped',()=>{
 const {state,round}=fixture();round.problems[0].title='<img onerror=alert(1)>';
 const context={state,members:[{id:'me',name:'<예시 사용자>'},members[1]],icon:()=>'',avatar:()=>'',pendingMember:'me'};
 const html=pendingPanel(context,round);
 assert.match(html,/&lt;예시 사용자&gt;/);assert.match(html,/&lt;img onerror=alert\(1\)&gt;/);assert.ok(!html.includes('<img'));
 assert.equal((html.match(/data-action="copy-pending"/g)||[]).length,2);
 assert.ok(!html.includes('aria-label="팀원 미인증 목록 복사"'));
});
