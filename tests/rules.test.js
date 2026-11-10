import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_RULES,validateRules,blankProblems,nextDeadlineDate,goalCount} from '../public/rules.js';
import {EXAMPLES,validateRound,isOnTime,deadlineExclusive,deadlineLabel,roundSummary,memberCount,kstDate} from '../public/core.js';
import {dashboard} from '../public/dashboard.js';
import {pendingSummary,pendingByMember} from '../public/pending.js';
const custom={...DEFAULT_RULES,problemCount:3,leetcodeCount:0,schedule:'custom',deadlineTime:'20:30'};
const problems=EXAMPLES.slice(1,4),round={id:'variable',number:1,title:'세 문제',startDate:'2026-11-05',deadlineDate:'2026-11-08',deadlineTime:'20:30',rules:custom,problems};
test('legacy defaults remain five problems, LC one plus PG four, Tuesday 23:59',()=>{
 assert.deepEqual(DEFAULT_RULES,{mode:'common',problemCount:5,leetcodeCount:1,platform:'all',schedule:'weekly',weekday:2,deadlineTime:'23:59'});
 assert.equal(blankProblems(DEFAULT_RULES).length,5);assert.equal(nextDeadlineDate('2026-11-05'),'2026-11-10');
 assert.equal(validateRound({title:'기존',startDate:'2026-11-05',deadlineDate:'2026-11-10',problems:EXAMPLES}).valid,true);
});
test('rule validation rejects invalid counts, platform splits, days, times and unknown fields',()=>{
 for(const change of [{problemCount:0},{problemCount:31},{problemCount:2,leetcodeCount:3},{problemCount:1.5},{weekday:7},{deadlineTime:'24:00'},{deadlineTime:'9:00'},{mode:'mixed'},{platform:'unknown'},{schedule:'daily'},{owner:true}])assert.throws(()=>validateRules({...DEFAULT_RULES,...change}));
 assert.equal(validateRules({...custom,problemCount:30,leetcodeCount:30}).problemCount,30);
});
test('common problem count and platform allocation are rule-specific; custom dates accept any day',()=>{
 assert.equal(validateRound(round,{rules:custom}).valid,true);
 assert.equal(validateRound({...round,problems:problems.slice(0,2)},{rules:custom}).valid,false);
 assert.equal(validateRound({...round,problems:[EXAMPLES[0],...problems.slice(1)]},{rules:custom}).valid,false);
 const weekly={...custom,schedule:'weekly',weekday:0};assert.equal(validateRound(round,{rules:weekly}).valid,true);
 assert.equal(validateRound({...round,deadlineDate:'2026-11-09'},{rules:weekly}).valid,false);
});
test('the full configured deadline minute is accepted and the next minute is late',()=>{
 assert.equal(deadlineLabel(round),'일요일 20:30');assert.equal(isOnTime('2026-11-08T20:30:59.999+09:00',round),true);assert.equal(isOnTime('2026-11-08T20:31:00+09:00',round),false);
 assert.equal(+deadlineExclusive(round),Date.parse('2026-11-08T20:31:00+09:00'));assert.match(roundSummary(round),/일요일 20:30/);
});
test('free goals count distinct on-time certified problems, excluding pending and late evidence',()=>{
 const r={...round,rules:{...custom,mode:'free',problemCount:2}},state={rounds:[r],certificates:{variable:{me:{[problems[0].id]:{at:'2026-11-06T10:00:00+09:00'},[problems[1].id]:{at:'2026-11-08T20:31:00+09:00'}}}}};
 assert.equal(memberCount(state,r,'me'),1);assert.equal(goalCount(r),2);assert.deepEqual(pendingByMember(state,r,[{id:'me'}]),[]);
 assert.match(pendingSummary(state,r,[{id:'me',name:'나'}]),/1\/2문제 인증, 1문제 남음/);assert.match(roundSummary(r),/각자 원하는 문제 2개/);
 assert.equal(validateRound({...r,problems:[]},{rules:r.rules}).valid,true);
});
test('common dashboard renders the actual column count and free goals use per-member progress',()=>{
 const r={...round,startDate:kstDate(),deadlineDate:kstDate()},state={rounds:[r],activeRoundId:r.id,certificates:{},rules:custom},context={state,members:[{id:'me',name:'나'}],icon:()=>'',avatar:()=>''};
 const common=dashboard(context);assert.match(common,/출제 문제 <span>3<\/span>/);assert.equal((common.match(/title="모의고사"/g)||[]).length,1);assert.ok(!common.includes('전체 5'));
 r.rules={...custom,mode:'free',problemCount:2};const free=dashboard(context);assert.match(free,/팀원별 목표 현황/);assert.match(free,/0 \/ 2문제/);assert.ok(!free.includes('팀원별 미인증 문제'));
});


test('the default weekly deadline advances a week after the configured closing minute',()=>{
 const r={...DEFAULT_RULES,weekday:0,deadlineTime:'20:30'};
 assert.equal(nextDeadlineDate('2026-11-08',r,Date.parse('2026-11-08T20:30:59+09:00')),'2026-11-08');
 assert.equal(nextDeadlineDate('2026-11-08',r,Date.parse('2026-11-08T20:31:00+09:00')),'2026-11-15');
});
