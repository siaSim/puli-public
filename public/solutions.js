import {isFree} from './rules.js';
import {escapeHTML as h,getCertificate} from './core.js';
export function solutionOverview(state,round,members){
 if(round.historyOnly)return '';
 const shares=state.solutionShares||[];
 return `<section class="solution-section" aria-labelledby="solutions-title"><div class="section-head"><div><h2 id="solutions-title">팀원 풀이 공유</h2><p class="section-description">인증한 문제의 코드와 풀이 메모를 작성자가 선택하여 공유합니다.</p></div></div><div class="solution-overview">${round.problems.map((p,i)=>{
 const rows=shares.filter(s=>s.roundId===round.id&&s.problemId===p.id&&s.shared);
 return `<div class="solution-overview-row"><a href="#solutions/${h(p.id)}"><span class="muted">${String(i+1).padStart(2,'0')}</span> ${h(p.title)}</a><span class="solution-authors">${h(rows.map(s=>members.find(m=>m.id===s.memberId)?.name||'팀원').join(', ')||'공유된 풀이 없음')}</span><a class="text-button" href="#solutions/${h(p.id)}">${getCertificate(state,round.id,'me',p.id)?'풀이 보기 · 작성':'풀이 보기'} (${rows.length}) →</a></div>`;
 }).join('')}</div><p class="table-note">초대된 스터디 멤버만 볼 수 있습니다. 풀이 공유 여부는 인증 수와 잔디에 영향을 주지 않습니다.</p></section>`;
}
export function solutionPage({state,round,problem,members,draft,icon=()=>'',avatar=m=>`<span class="avatar sm" aria-hidden="true">${h((m.name||'팀원').slice(0,1))}</span>`}){
 const proof=getCertificate(state,round.id,'me',problem.id),certified=!!proof;
 const shares=state.solutionShares||[],rows=shares.filter(s=>s.roundId===round.id&&s.problemId===problem.id&&s.shared);
 const problemMenu=round.problems.map((p,i)=>{
  const count=shares.filter(s=>s.roundId===round.id&&s.problemId===p.id&&s.shared).length;
  return `<a href="#solutions/${h(p.id)}" ${p.id===problem.id?'aria-current="page"':''}><span class="solution-problem-index">${String(i+1).padStart(2,'0')}</span><span class="solution-problem-name">${h(p.title)}<small>${p.platform==='leetcode'?'LeetCode':'프로그래머스'}</small></span><span class="solution-problem-count" aria-label="공유된 풀이 ${count}개">${count}</span></a>`;
 }).join('');
 const sharedList=rows.length?`<div class="shared-solution-list">${rows.map(s=>{
  const m=members.find(m=>m.id===s.memberId)||{name:'팀원'};
  return `<div class="shared-solution-row"><div class="shared-solution-author">${avatar(m,'sm')}<div><strong>${h(m.name)}</strong><p>${h(s.language||'코드')}<span aria-hidden="true">·</span>${h(new Date(s.updatedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}))}</p></div></div><button class="btn small" data-action="read-solution" data-member="${h(s.memberId)}" data-problem="${h(problem.id)}">코드·메모 보기 ${icon('chevron')}</button></div>`;
 }).join('')}</div>`:`<div class="solution-empty">${icon('book')}<strong>아직 공유된 풀이가 없습니다.</strong><p>인증한 코드와 메모를 공유하면 이곳에 표시됩니다.</p></div>`;
 let own;
 if(!certified)own=`<div class="solution-certify-notice"><p class="notice">${icon('info')}<span>이 문제를 인증한 뒤 내 풀이를 공유할 수 있습니다.</span></p><a class="btn" href="#verify/${h(problem.id)}">인증하러 가기 ${icon('arrow')}</a></div>`;
 else if(!draft.loaded)own=`<p class="solution-loading" role="status">${h(draft.error||'내 풀이를 불러오는 중입니다.')}</p>${draft.error?'<button class="btn" data-action="retry-solution">다시 불러오기</button>':''}`;
 else own=`<form id="solution-form"><fieldset ${draft.busy?'disabled':''}>
  <p class="field-note solution-editor-intro">${proof.method==='github'?'인증한 커밋의 코드 파일을 불러오거나 직접 입력할 수 있습니다.':'사진으로 인증한 코드와 풀이 메모를 직접 입력해 주세요.'}</p>
  ${proof.method==='github'?`<div class="solution-import"><div><h3>GitHub 인증 코드</h3><p>인증 당시 파일로 현재 입력한 코드를 교체합니다.</p></div><button type="button" class="btn" data-action="load-solution-code">${icon('github')}인증한 GitHub 코드 불러오기</button></div>`:''}
  <div class="solution-fields"><div class="field solution-language-field"><label for="solution-language">언어</label><input class="input" id="solution-language" name="language" maxlength="30" value="${h(draft.language||'')}" placeholder="예: Python, JavaScript"></div>
   <div class="field"><label for="solution-code">코드 <span class="required" aria-hidden="true">*</span><small>24,000자 · 64KB 이내</small></label><textarea class="input solution-code" id="solution-code" name="code" rows="15" required maxlength="24000" spellcheck="false" autocapitalize="off">${h(draft.code||'')}</textarea></div>
   <div class="field"><label for="solution-note">풀이 메모 <small>4,000자 이내</small></label><textarea class="input solution-note" id="solution-note" name="note" rows="5" maxlength="4000" placeholder="접근 방법, 시간 복잡도, 어려웠던 점 등">${h(draft.note||'')}</textarea></div>
  </div>
  <label class="solution-consent"><input type="checkbox" name="consent" ${draft.consent?'checked':''} required><span>이 코드와 메모를 초대된 스터디 팀원에게 공유합니다.</span></label><p id="solution-error" class="field-error" role="alert">${h(draft.error||'')}</p>
  <div class="solution-actions"><p class="field-note">${draft.dirty?'저장하지 않은 변경 사항이 있습니다.':'공유 중지 후에도 내 코드와 메모는 보관됩니다.'}</p><div class="solution-action-buttons">${draft.shared?'<button class="btn" type="button" data-action="unshare-solution">공유 중지</button>':''}<button class="btn primary" type="submit">${draft.busy?'처리 중…':draft.shared?'공유 내용 수정':'팀원에게 공유하기'} ${icon('arrow')}</button></div></div>
 </fieldset></form>`;
 return `<div class="solution-page"><a href="#home" class="back-link">${icon('back')}이번 회차로 돌아가기</a>
  <div class="page-heading"><div><div class="problem-overline">풀이 공유 · ${problem.platform==='leetcode'?'LeetCode':'프로그래머스'}</div><h1>${h(problem.title)}</h1><p>작성자가 공유한 코드와 풀이 메모를 확인합니다.</p></div><a class="btn" href="${h(problem.url)}" target="_blank" rel="noopener noreferrer">문제 보기 ${icon('external')}</a></div>
  <div class="solution-layout"><aside class="solution-menu"><h3>${isFree(round)?'팀원이 등록한 문제':'출제 문제'} <span>${round.problems.length}</span></h3><nav class="solution-problems" aria-label="풀이 공유 문제 선택">${problemMenu}</nav><p class="solution-access">${icon('lock')}초대된 스터디 멤버만 볼 수 있습니다.</p></aside>
   <div class="solution-main"><section class="solution-section solution-published" aria-labelledby="shared-solutions-title"><div class="section-head"><h2 id="shared-solutions-title">공유된 풀이 <span>${rows.length}</span></h2></div>${sharedList}</section>
    <section class="solution-section solution-own" aria-labelledby="my-solution-title"><div class="section-head"><h2 id="my-solution-title">내 풀이</h2>${certified&&draft.loaded?`<span class="pill ${draft.shared?'success':''}">${draft.shared?'공유 중':'공유 전'}</span>`:''}</div>${own}</section>
   </div>
  </div></div>`;
}
export function solutionBody(share){
 return `<div class="shared-solution-meta"><span class="pill">${h(share.language||'코드')}</span><span>초대된 팀원에게 공유된 풀이</span></div><h3 class="shared-section-label">코드</h3><pre class="shared-code" tabindex="0" aria-label="공유된 풀이 코드"><code>${h(share.code)}</code></pre><h3 class="shared-section-label">풀이 메모</h3><div class="shared-note">${h(share.note||'등록된 메모가 없습니다.')}</div>`;
}
