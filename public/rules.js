export const DEFAULT_RULES=Object.freeze({mode:'common',problemCount:5,leetcodeCount:1,platform:'all',schedule:'weekly',weekday:2,deadlineTime:'23:59'});
export const WEEKDAYS=['일요일','월요일','화요일','수요일','목요일','금요일','토요일'];
export const validTime=value=>typeof value==='string'&&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
export function validateRules(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!Object.hasOwn(DEFAULT_RULES,k)))throw new Error('스터디 운영 규칙을 확인해 주세요.');
 const r={...DEFAULT_RULES,...value};
 if(!['common','free'].includes(r.mode)||!Number.isInteger(r.problemCount)||r.problemCount<1||r.problemCount>30||!Number.isInteger(r.leetcodeCount)||r.leetcodeCount<0||r.leetcodeCount>r.problemCount||!['all','leetcode','programmers'].includes(r.platform)||!['weekly','custom'].includes(r.schedule)||!Number.isInteger(r.weekday)||r.weekday<0||r.weekday>6||!validTime(r.deadlineTime))throw new Error('문제 수는 1~30개로, 플랫폼 구성과 마감 요일과 시각을 올바르게 입력해 주세요.');
 return r;
}
export const rulesOf=round=>round?.rules||DEFAULT_RULES;
export const isFree=round=>!round?.historyOnly&&rulesOf(round).mode==='free';
export const goalCount=round=>isFree(round)?rulesOf(round).problemCount:(round?.problems?.length??rulesOf(round).problemCount);
export const allowsPlatform=(rules,platform)=>rules.platform==='all'||rules.platform===platform;
export function rulesLabel(r=DEFAULT_RULES){
 return r.mode==='free'?`자율 목표 ${r.problemCount}문제, ${r.platform==='all'?'플랫폼 자유':r.platform==='leetcode'?'LeetCode':'프로그래머스'}`:`공통 ${r.problemCount}문제, LeetCode ${r.leetcodeCount} / 프로그래머스 ${r.problemCount-r.leetcodeCount}`;
}
export const scheduleLabel=(r=DEFAULT_RULES)=>`${r.schedule==='weekly'?WEEKDAYS[r.weekday]:'날짜 직접 지정'} ${r.deadlineTime} (한국 시간)`;
export function nextDeadlineDate(start,r=DEFAULT_RULES,now=Date.now()){
 const date=new Date(start+'T12:00:00Z');
 date.setUTCDate(date.getUTCDate()+(r.schedule==='weekly'?(r.weekday-date.getUTCDay()+7)%7:6));
 const day=date.toISOString().slice(0,10);
 if(r.schedule==='weekly'&&day===new Date(now+9*3600000).toISOString().slice(0,10)&&Date.parse(day+'T'+r.deadlineTime+':00+09:00')+60000<=now)date.setUTCDate(date.getUTCDate()+7);
 return date.toISOString().slice(0,10);
}
export const blankProblems=r=>r.mode==='free'?[]:Array.from({length:r.problemCount},(_,i)=>({platform:i<r.leetcodeCount?'leetcode':'programmers',title:'',url:''}));
