import {rulesFields} from './rule-forms.js';
import {rulesLabel,scheduleLabel} from './rules.js';
import {escapeHTML as h} from './core.js';

export function studyList(studies,selected){
 return `<div class="page-heading"><div><h1>내 스터디</h1><p>참여 중인 스터디를 선택하거나 새로 만들어 보세요.</p></div><a class="btn primary" href="#new-study">스터디 만들기</a></div>
 <section class="study-list" aria-label="참여 중인 스터디">${studies.length?studies.map(s=>`<article class="study-row"><div><div class="study-row-label">${s.role==='owner'?'운영 중':'참여 중'}${s.id===selected?' · 선택한 스터디':''}</div><h2>${h(s.name)}</h2><p>${h(s.description||'등록된 소개가 없습니다.')}</p><p class="field-note">${h(rulesLabel(s.rules))} · ${h(scheduleLabel(s.rules))}</p><span class="field-note">멤버 ${s.memberCount} / ${s.capacity}</span></div><button class="btn" data-action="select-study" data-study="${h(s.id)}" aria-label="${h(s.name)} 열기">스터디 열기</button></article>`).join(''):'<div class="study-empty"><h2>아직 참여한 스터디가 없어요.</h2><p>스터디를 만들거나 팀원에게 받은 초대 링크로 참여하세요.</p></div>'}</section>
 <section class="study-join-section" aria-labelledby="join-study-title"><h2 id="join-study-title">초대 링크로 참여</h2><p class="field-note">운영자에게 받은 풀이 초대 링크를 붙여 넣어 주세요.</p><form id="study-invite-form"><label class="sr-only" for="study-invite-url">스터디 초대 링크</label><div class="study-invite-row"><input class="input" id="study-invite-url" name="inviteURL" type="url" required placeholder="${h(location.origin)}/#join/…"><button class="btn" type="submit">초대 확인</button></div></form></section>`;
}
export function createStudyForm(){
 return `<a class="back-link" href="#studies">← 내 스터디</a><div class="page-heading"><div><h1>스터디 만들기</h1><p>함께 문제를 풀고 인증할 스터디를 만듭니다.</p></div></div><form id="study-create-form" class="study-create-form">
 <div class="field"><label for="study-name">스터디 이름 <span class="required">*</span></label><input class="input" id="study-name" name="name" required maxlength="60" placeholder="예: 화요일 코테 스터디"></div>
 <div class="field"><label for="study-description">소개</label><textarea class="input" id="study-description" name="description" maxlength="300" rows="3" placeholder="어떤 목표로 함께 공부하나요?"></textarea></div>
 <div class="field"><label for="study-capacity">정원 <span class="required">*</span></label><input class="input" id="study-capacity" name="capacity" type="number" min="1" max="20" step="1" required value="5"><p class="field-note">운영자를 포함해 1~20명 · 계정당 최대 5개 운영</p></div>
 ${rulesFields()}
 <p class="field-error" id="study-create-error" role="alert"></p><div class="study-form-actions"><a class="btn" href="#studies">취소</a><button class="btn primary" type="submit">스터디 만들기</button></div></form>`;
}
export function parseInviteURL(value,origin){
 try{const u=new URL(value);return u.origin===origin?/^#join\/([A-Za-z0-9_-]{43})$/.exec(u.hash)?.[1]||null:null;}catch{return null;}
}
