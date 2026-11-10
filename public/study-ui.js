import {escapeHTML as h,roundLabel,deadlineLabel,historyDeadline} from './core.js';
import {DEFAULT_RULES,isFree,rulesLabel} from './rules.js';

export function modeTag({rules=DEFAULT_RULES,historyOnly=false}={}){
 const mode=historyOnly?'history':rules.mode;
 return `<span class="mode-tag mode-${mode}">${historyOnly?'지난 회차 문제 기록':mode==='free'?'자율 목표형':'공통 문제형'}</span>`;
}
export function workspaceHeading({title,kicker='',description='',mode,context='',actions='',back=''}={}){
 return `${back?`<div class="workspace-back">${back}</div>`:''}<header class="workspace-heading"><div class="workspace-heading-main"><div class="workspace-eyebrow">${mode?modeTag(mode):''}${kicker?`<span>${h(kicker)}</span>`:''}</div><h1>${h(title)}</h1>${description?`<p class="workspace-description">${h(description)}</p>`:''}${context?`<div class="workspace-context">${context}</div>`:''}</div>${actions?`<div class="workspace-actions">${actions}</div>`:''}</header>`;
}
export function periodContext(r,{name=true}={}){
 if(!r)return '';
 const deadline=r.historyOnly?historyDeadline(r):r.deadlineDate?`${r.deadlineDate} ${deadlineLabel(r)}`:'마감일 선택 전';
 return `<div class="period-context">${name&&r.number?`<span>${h(roundLabel(r))}</span>`:''}<span>${h(r.startDate||'시작일 선택 전')}부터</span><span class="context-deadline">마감 ${h(deadline)}</span><span class="context-timezone">한국 시간</span></div>`;
}
export function metricStrip(items){
 return `<dl class="workspace-metrics">${items.map(item=>`<div><dt>${h(item.label)}</dt><dd>${h(item.value)}</dd>${item.note?`<p>${h(item.note)}</p>`:''}</div>`).join('')}</dl>`;
}
export function methodTabs(method,icon=()=> ''){
 return `<div class="method-tabs" role="tablist" aria-label="인증 방법">${[['github','GitHub 인증','github'],['photo','사진 인증','photo']].map(([id,label,glyph])=>`<button type="button" role="tab" id="${id}-tab" aria-controls="method-panel" aria-selected="${method===id}" tabindex="${method===id?'0':'-1'}" class="${method===id?'active':''}" data-action="method" data-method="${id}">${icon(glyph)}${label}</button>`).join('')}</div>`;
}
export function registrationRules(rules=DEFAULT_RULES){
 return `<div class="registration-rules">${modeTag({rules})}<span>${h(rulesLabel(rules))}</span><a class="text-button" href="#study-settings">기본 규칙 보기 →</a></div>`;
}
export function modeNoun(r){return isFree(r)?'목표 기간':'회차';}
