import test from 'node:test';
import assert from 'node:assert/strict';
import {EXAMPLES,validateRound,createSeed,roundSummary} from '../public/core.js';
import {dailyActivity} from '../public/activity.js';
import {dashboard} from '../public/dashboard.js';
test('past problem-only records accept original weekdays and optional round numbers but reject future dates',()=>{
 const draft={title:'지난 문제',historyOnly:true,number:1,startDate:'2026-10-14',deadlineDate:'2026-10-20',problems:structuredClone(EXAMPLES)};
 const options={today:'2026-10-21'};
 assert.equal(validateRound(draft,options).valid,true);
 for(const number of [0,-1,1.5,100000,'1'])assert.ok(validateRound({...draft,number},options).errors.number);
 assert.equal(validateRound({...draft,number:undefined},options).valid,true);
 assert.ok(validateRound({...draft,startDate:'2026-10-21',deadlineDate:'2026-10-27'},options).errors.deadlineDate);
 assert.equal(validateRound({...draft,deadlineDate:'2026-10-19'},options).valid,true);
 assert.ok(validateRound({...draft,historyOnly:false,deadlineDate:'2026-10-19'},options).errors.deadlineDate);
});
test('historical sets preserve actual problem counts, tolerate empty unused slots and still validate links and duplicates',()=>{
 const draft={historyOnly:true,title:'자율 참여',startDate:'2026-06-22',deadlineDate:null,historyMeta:{deadlineKnown:false},problems:[EXAMPLES[1],EXAMPLES[0],{platform:'programmers',url:'',title:''}]};
 assert.equal(validateRound(draft).valid,true);assert.equal(validateRound(draft).problems.length,2);
 for(const problems of [[],[EXAMPLES[0],EXAMPLES[0]],[{...EXAMPLES[0],url:'https://evil.test/problems/two-sum/'}],[{...EXAMPLES[0],title:''}],[{...EXAMPLES[0],platform:'unsupported'}],Array(51).fill(EXAMPLES[0])])assert.equal(validateRound({...draft,problems}).valid,false);
 assert.equal(validateRound({...draft,historyOnly:false,deadlineDate:'2026-06-23',problems:[EXAMPLES[0],EXAMPLES[1]]}).valid,false);
 assert.ok(validateRound({...draft,deadlineDate:'2026-06-23'}).errors.deadlineDate);
 assert.ok(validateRound({...draft,startDate:'2026-02-30'}).errors.startDate);
});
test('date-based archives display missing deadlines and source authors without inventing round numbers or Tuesday cutoffs',()=>{
 const r={id:'source',number:-1,title:'2026.06.22 출제 문제',startDate:'2026-06-22',deadlineDate:null,historyOnly:true,historyMeta:{source:'kakao',dateBased:true,deadlineKnown:false,author:'원문 작성자',note:'프로젝트 기간 자율 참여'},problems:[EXAMPLES[1],EXAMPLES[0]]};
 const html=dashboard({state:{rounds:[r],activeRoundId:r.id,certificates:{}},members:[{id:'me',name:'운영자'}],icon:()=>'',avatar:()=>''});
 assert.ok(html.includes('2026.06.22 출제'));assert.ok(html.includes('마감 미기재'));assert.ok(html.includes('출제 원문 작성자'));assert.ok(html.includes('LeetCode 1문제, 프로그래머스 1문제'));assert.ok(html.includes('프로젝트 기간 자율 참여'));
 assert.ok(!html.includes('-1회차'));assert.ok(!html.includes('화요일 23:59'));assert.equal((html.match(/class="problem-title"/g)||[]).length,2);
 const summary=roundSummary(r);assert.match(summary,/출제일: 2026-06-22\n마감: 미기재/);assert.ok(!summary.includes('-1회차'));assert.ok(!summary.includes('화요일'));
 const known=roundSummary({...r,deadlineDate:'2026-06-29',historyMeta:{...r.historyMeta,deadlineKnown:true,deadlineLabel:'2026.06.29 오전 (시각 미기재)'}});assert.ok(known.includes('2026.06.29 오전 (시각 미기재)'));
});
test('problem-only records never add certifications or missed rounds to the grass and have no proof submission controls',()=>{
 const state=createSeed(new Date('2026-10-21T01:00:00+09:00'));state.rounds[0].historyOnly=true;
 assert.equal(dailyActivity(state,'me',{now:Date.parse('2026-10-21T02:00:00+09:00')}).total,0);
 const html=dashboard({state,members:[{id:'me',name:'테스트 운영자',login:'fixture-owner'}],icon:()=>'',avatar:()=>''});
 assert.ok(html.includes('지난 회차 문제 기록'));assert.ok(html.includes('당시 인증 여부는 옮기지 않았으며'));
 assert.ok(!html.includes('data-action="open-proof"'));assert.ok(!html.includes('data-action="sync"'));
 assert.ok(!html.includes('내 미인증'));assert.ok(!html.includes('class="team-matrix"'));assert.ok(!html.includes('class="contribution-square'));
 assert.equal((html.match(/class="problem-title"/g)||[]).length,5);
});
