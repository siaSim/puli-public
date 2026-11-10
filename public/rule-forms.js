import {escapeHTML as h} from './core.js';
import {DEFAULT_RULES,WEEKDAYS,rulesLabel,scheduleLabel} from './rules.js';

export function rulesFields(r=DEFAULT_RULES){
 return `<div class="rule-fields"><div class="field"><label for="rule-mode">운영 방식</label><select class="input" id="rule-mode" name="ruleMode"><option value="common" ${r.mode==='common'?'selected':''}>공통 문제형 · 모두 같은 문제 풀기</option><option value="free" ${r.mode==='free'?'selected':''}>자율 목표형 · 각자 고른 문제 풀기</option></select></div>
 <div class="field"><label for="rule-count">${r.mode==='free'?'기간당 개인 목표 문제 수':'회차당 공통 문제 수'}</label><input class="input" id="rule-count" name="ruleCount" type="number" min="1" max="30" step="1" required value="${r.problemCount}"><p class="field-note">1~30개 · 같은 문제는 한 기간에 한 번만 집계합니다.</p></div>
 <div class="common-rule-fields ${r.mode==='common'?'':'hidden'}"><div class="field"><label for="rule-leetcode">LeetCode 문제 수</label><input class="input" id="rule-leetcode" name="ruleLeetcode" type="number" min="0" max="${r.problemCount}" step="1" value="${r.leetcodeCount}"><p class="field-note" id="rule-programmers">나머지 ${r.problemCount-r.leetcodeCount}개는 프로그래머스 문제입니다.</p></div></div>
 <div class="free-rule-fields ${r.mode==='free'?'':'hidden'}"><div class="field"><label for="rule-platform">인정할 플랫폼</label><select class="input" id="rule-platform" name="rulePlatform">${[['all','LeetCode + 프로그래머스'],['leetcode','LeetCode만'],['programmers','프로그래머스만']].map(([v,label])=>`<option value="${v}" ${r.platform===v?'selected':''}>${label}</option>`).join('')}</select></div></div>
 <div class="field"><label for="rule-schedule">마감 방식</label><select class="input" id="rule-schedule" name="ruleSchedule"><option value="weekly" ${r.schedule==='weekly'?'selected':''}>정해진 요일에 마감</option><option value="custom" ${r.schedule==='custom'?'selected':''}>기간마다 날짜 직접 지정</option></select></div>
 <div class="field-row"><div class="field weekly-rule-field ${r.schedule==='weekly'?'':'hidden'}"><label for="rule-weekday">마감 요일</label><select class="input" id="rule-weekday" name="ruleWeekday">${WEEKDAYS.map((d,i)=>`<option value="${i}" ${r.weekday===i?'selected':''}>${d}</option>`).join('')}</select></div><div class="field"><label for="rule-time">기본 마감 시각</label><input class="input" id="rule-time" name="ruleTime" type="time" required value="${h(r.deadlineTime)}"><p class="field-note">한국 시간 · 표시한 마감 분이 끝날 때까지 인정합니다.</p></div></div>
 <p class="field-note">회차·목표 기간은 등록 화면에서 시작일과 마감일을 정해 공개합니다.</p></div>`;
}
export function readRules(form){
 const f=form.elements;return {mode:f.ruleMode.value,problemCount:Number(f.ruleCount.value),leetcodeCount:Number(f.ruleLeetcode.value),platform:f.rulePlatform.value,schedule:f.ruleSchedule.value,weekday:Number(f.ruleWeekday.value),deadlineTime:f.ruleTime.value};
}
export function syncRulesFields(form){
 if(!form?.elements.ruleMode)return;
 const r=readRules(form);form.querySelector('.common-rule-fields').classList.toggle('hidden',r.mode!=='common');form.querySelector('.free-rule-fields').classList.toggle('hidden',r.mode!=='free');form.querySelector('.weekly-rule-field').classList.toggle('hidden',r.schedule!=='weekly');
 form.querySelector('label[for="rule-count"]').textContent=r.mode==='free'?'기간당 개인 목표 문제 수':'회차당 공통 문제 수';
 form.elements.ruleLeetcode.max=String(r.problemCount);if(r.leetcodeCount>r.problemCount&&r.problemCount>=1)form.elements.ruleLeetcode.value=String(r.problemCount);
 form.querySelector('#rule-programmers').textContent=`나머지 ${Math.max(0,r.problemCount-Number(form.elements.ruleLeetcode.value))}개는 프로그래머스 문제입니다.`;
}
export function studyRulesPage(study,owner){
 return `<a class="back-link" href="#connect">← 저장소 · 멤버</a><div class="page-heading"><div><h1>스터디 운영 규칙</h1><p>${h(study.name)} · ${h(rulesLabel(study.rules))}</p></div></div><form id="study-rules-form" class="study-create-form"><fieldset ${owner?'':'disabled'}>${rulesFields(study.rules)}<div class="notice"><div><strong>새로 등록하는 회차·목표 기간부터 적용됩니다.</strong><p>기존 문제, 목표, 마감과 인증 기록은 바뀌지 않습니다.</p></div></div><p class="field-error" id="rules-error" role="alert"></p>${owner?'<div class="study-form-actions"><a class="btn" href="#connect">취소</a><button class="btn primary" type="submit">운영 규칙 저장</button></div>':'<p class="field-note">운영 규칙은 스터디 운영자만 변경할 수 있습니다.</p>'}</fieldset></form>`;
}
