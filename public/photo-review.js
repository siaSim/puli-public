import {escapeHTML as h,roundLabel} from './core.js';

export const photoStatus=s=>s.status==='pending'?'팀원 확인 대기':s.status==='rejected'?'반려 (다시 제출 필요)':s.status==='superseded'?'종료된 요청':s.reviewedBy?'팀원 확인 완료':'OCR 대조 일치';
export function photoReviewPanel({state,members,icon,avatar}) {
 const pending=(state.photoSubmissions||[]).filter(s=>s.status==='pending').sort((a,b)=>a.submittedAt.localeCompare(b.submittedAt));
 if(!pending.length)return '';
 return `<section class="photo-review-section" aria-labelledby="photo-review-title"><div class="section-head"><div><h2 id="photo-review-title">사진 확인 대기 <span>${pending.length}</span></h2><p class="section-description">문제 또는 최종 통과 여부가 불분명한 사진입니다. 제출자 외 팀원 한 명이 확인합니다.</p></div></div><div class="photo-review-list">${pending.map(s=>{
  const member=members.find(m=>m.id===s.memberId),round=state.rounds.find(r=>r.id===s.roundId),problem=round?.problems.find(p=>p.id===s.problemId);
  return `<div class="photo-review-row"><div class="matrix-member">${member?avatar(member,'sm'):''}<strong>${h(member?.name||'팀원')}</strong>${s.memberId==='me'?'<small>나</small>':''}</div><div class="photo-review-problem"><small>${round?h(roundLabel(round)):''}</small><strong>${h(problem?.title||'변경된 문제')}</strong><p>${h(s.assessment.reason)}</p></div><button class="btn" data-action="review-photo" data-submission="${h(s.id)}">${icon('photo')}${s.memberId==='me'?'제출 내용':'사진 확인'}</button></div>`;
 }).join('')}</div><p class="table-note">확인 대기 중에는 인증 수와 잔디에 포함하지 않습니다. 승인 시 사진을 제출한 시각을 기준으로 집계합니다.</p></section>`;
}
