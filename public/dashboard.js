import {workspaceHeading,periodContext,metricStrip,modeTag} from './study-ui.js';
import {isFree,goalCount,rulesLabel,scheduleLabel,DEFAULT_RULES} from './rules.js';
import {solutionOverview} from './solutions.js';
import {escapeHTML as h, kstDate, deadlineExclusive, deadlineLabel, isOnTime, memberCount, getCertificate,roundLabel,historyDeadline,setterLabel} from './core.js';
import {dailyActivityPanel} from './activity.js';
import {pendingPanel} from './pending.js';
import {photoSubmission} from './ocr-match.js';
import {photoReviewPanel} from './photo-review.js';

const platformName = value => value === 'leetcode' ? 'LeetCode' : '프로그래머스';
const shortDate = value => value.slice(5).replace('-', '.');
const status = (proof, round, submission) => !proof ? submission?.status==='pending'?{label:'사진 확인 대기',className:'review'}:{label:'미인증', className:'pending'} : isOnTime(proof.at, round) ? {label:'인증 완료', className:'done'} : {label:'지각 인증', className:'late'};
const proofFor = (state, round, member, problem) => getCertificate(state, round.id, member.id, problem.id);

function roundOptions(state, selected) {
 return `<select id="round-select" class="round-select" aria-label="회차 선택">${state.rounds.map(r=>`<option value="${h(r.id)}" ${r.id===selected.id?'selected':''}>${h(roundLabel(r))}${r.historyOnly?' (문제 기록)':', '+shortDate(r.deadlineDate)+' 마감'}</option>`).join('')}</select>`;
}

function problemTable({state, members, filter, icon}, round) {
 const visible=round.problems.filter(p=>filter!=='pending'||!getCertificate(state,round.id,'me',p.id));
 const mine=memberCount(state,round,'me');
 return `<section class="problem-section" aria-labelledby="problem-list-title">
  <div class="section-head"><h2 id="problem-list-title">출제 문제 <span>${round.problems.length}</span></h2><div class="filters" aria-label="문제 필터"><button data-action="filter" data-value="all" class="${filter==='all'?'active':''}" aria-pressed="${filter==='all'}">전체 ${round.problems.length}</button><button data-action="filter" data-value="pending" class="${filter==='pending'?'active':''}" aria-pressed="${filter==='pending'}">내 미인증 ${round.problems.length-mine}</button></div></div>
  <div class="problem-table-wrap"><table class="problem-table"><thead><tr><th scope="col">문제</th><th scope="col" class="platform-col">플랫폼</th><th scope="col" class="difficulty-col">난이도</th><th scope="col">내 인증</th><th scope="col" class="team-count-col">팀</th></tr></thead><tbody>
  ${visible.map(p=>{
   const proof=getCertificate(state,round.id,'me',p.id), submission=photoSubmission(state,round.id,'me',p.id),s=status(proof,round,submission);
   const count=members.filter(m=>proofFor(state,round,m,p)).length;
   const index=round.problems.indexOf(p)+1;
   return `<tr><td><div class="problem-name-row"><span class="problem-index">${String(index).padStart(2,'0')}</span><div><a class="problem-title" href="${h(p.url)}" target="_blank" rel="noopener noreferrer">${h(p.title)} ${icon('external')}</a><div class="problem-subtitle"><span class="mobile-platform">${platformName(p.platform)}, </span>${h(p.tag)}, <a href="#solutions/${h(p.id)}">팀 풀이 ${(state.solutionShares||[]).filter(s=>s.roundId===round.id&&s.problemId===p.id&&s.shared).length}</a></div></div></div></td><td class="platform-col"><span class="platform-label ${p.platform==='leetcode'?'lc':'pg'}">${p.platform==='leetcode'?'LC':'PG'}</span></td><td class="difficulty-col"><span class="difficulty-label">${h(p.difficulty)}</span></td><td>${proof?`<button class="status-button ${s.className}" data-action="open-proof" data-member="me" data-problem="${h(p.id)}">${icon(s.className==='late'?'clock':'check')}${s.label}</button><small class="proof-method">${proof.method==='github'?'GitHub':'사진'}</small>`:submission?.status==='pending'?`<button class="status-button review" data-action="review-photo" data-submission="${h(submission.id)}">${icon('clock')}확인 대기</button>`:`<a class="status-button pending" href="#verify/${h(p.id)}">${submission?.status==='rejected'?'다시 인증':'인증하기'} ${icon('chevron')}</a>`}</td><td class="team-count-col"><span class="tabular">${count}<span class="muted">/${members.length}</span></span></td></tr>`;
  }).join('')||'<tr><td colspan="5" class="table-empty">출제된 모든 문제를 인증했습니다.</td></tr>'}
  </tbody></table></div><p class="table-note">출제된 문제만 집계합니다. 이전 풀이 기록은 제외하며, 이번 회차에 다시 풀어야 합니다.</p>
 </section>`;
}

function teamMatrix({state, members, icon, avatar}, round) {
 return `<section class="team-section" aria-labelledby="team-title"><div class="section-head"><h2 id="team-title">팀원 인증 현황</h2><a class="text-button" href="#connect">멤버 ${members.length}/${state.studyCapacity||5} ${icon('chevron')}</a></div>
 <div class="matrix-wrap"><table class="team-matrix" style="min-width:${Math.max(320,180+(round?round.problems.length:state.rules?.problemCount||5)*42)}px"><caption class="sr-only">행은 팀원, 열은 출제 문제입니다. 인증 칸을 누르면 근거를 확인할 수 있습니다.</caption><thead><tr><th scope="col">팀원</th>${Array.from({length:round?round.problems.length:(state.rules?.problemCount||5)},(_,i)=>`<th scope="col" title="${round?h(round.problems[i].title):'문제 등록 전'}">${String(i+1).padStart(2,'0')}</th>`).join('')}<th scope="col">합계</th></tr></thead><tbody>${members.map(m=>`<tr class="${m.id==='me'?'my-row':''}"><th scope="row"><div class="matrix-member">${avatar(m,'sm')}<span>${h(m.name)}${m.id==='me'?'<small>나</small>':''}</span></div></th>${Array.from({length:round?round.problems.length:(state.rules?.problemCount||5)},(_,i)=>{
  if(!round)return '<td><span class="cert-square unavailable" aria-label="회차 등록 전">–</span></td>';
  const p=round.problems[i],proof=proofFor(state,round,m,p),submission=photoSubmission(state,round.id,m.id,p.id),s=status(proof,round,submission);
  const label=`${m.name}, ${p.title}, ${s.label}${proof?', '+(proof.method==='github'?'GitHub':'사진'):''}`;
  return `<td><button class="cert-square ${s.className}" data-action="${!proof&&submission?.status==='pending'?'review-photo':'open-proof'}" data-submission="${h(submission?.id||'')}" data-member="${h(m.id)}" data-problem="${h(p.id)}" aria-label="${h(label)}" title="${h(label)}">${proof?icon(s.className==='late'?'clock':'check'):'<span aria-hidden="true">–</span>'}</button></td>`;
 }).join('')}<td class="matrix-total tabular">${round?memberCount(state,round,m.id):'—'}<span class="muted">${round?'/'+round.problems.length:''}</span></td></tr>`).join('')}</tbody></table></div>
 <div class="matrix-legend"><span><i class="legend-square pending"></i>미인증</span><span><i class="legend-square review"></i>사진 확인 대기</span><span><i class="legend-square done"></i>인증</span><span><i class="legend-square late"></i>지각</span></div><p class="table-note">${round?'칸을 누르면 해당 문제의 GitHub 커밋 또는 인증 사진을 확인합니다.':'회차를 등록하면 문제별 인증 상태가 표시됩니다.'}</p></section>`;
}

function contributionHistory({state,members,avatar}, selected) {
 const rounds=state.rounds.filter(r=>!r.historyOnly&&r.startDate<=kstDate()).slice(0,12).reverse();
 return `<section class="contribution-section" aria-labelledby="contribution-title"><div class="section-head"><div><h2 id="contribution-title">회차별 인증 기록</h2><p class="section-description">한 칸은 한 회차입니다. 해당 회차와 기간의 목표를 달성하면 가장 진한 초록색으로 표시됩니다.</p></div><span class="muted history-range">최근 ${rounds.length}회차</span></div>${rounds.length?`<div class="contribution-scroll"><table class="contribution-table"><caption class="sr-only">팀원별 최근 회차 인증 수. 회차를 선택하면 해당 문제와 인증 현황으로 이동합니다.</caption><thead><tr><th scope="col">팀원</th>${rounds.map(r=>`<th scope="col" class="${r.id===selected?.id?'selected-round':''}">${r.number}<small>${shortDate(r.deadlineDate)}</small></th>`).join('')}</tr></thead><tbody>${members.map(m=>`<tr><th scope="row"><div class="matrix-member">${avatar(m,'sm')}<span>${h(m.name)}</span></div></th>${rounds.map(r=>{const n=memberCount(state,r,m.id);return `<td><button class="contribution-square level-${Math.min(5,Math.ceil(n/Math.max(1,goalCount(r))*5))} ${r.id===selected?.id?'selected-round':''}" data-action="history-round" data-round="${h(r.id)}" aria-label="${h(m.name)}, ${r.number}회차, ${n}/${goalCount(r)} 인증, 회차 보기" title="${h(m.name)}, ${r.number}회차, ${n}/${goalCount(r)} 인증" aria-pressed="${r.id===selected?.id}">${n||'<span aria-hidden="true">–</span>'}</button></td>`;}).join('')}</tr>`).join('')}</tbody></table></div>`:'<div class="history-empty">아직 인증 기록이 없습니다.</div>'}<div class="contribution-footer"><span>회차와 목표 기간에 인정된 인증만 집계</span><div class="contribution-legend"><span>0</span>${Array.from({length:6},(_,i)=>`<i class="legend-square level-${i}" aria-hidden="true"></i>`).join('')}<span>목표 달성</span></div></div></section>`;
}

export function dashboard(context) {
 const {state,members,icon,avatar}=context;
 const r=state.rounds.find(x=>x.id===state.activeRoundId)||state.rounds[0];
 if(r.historyOnly)return historyDashboard(context,r);
 if(isFree(r))return freeDashboard(context,r);
 const mine=memberCount(state,r,'me'),all=members.reduce((n,m)=>n+memberCount(state,r,m.id),0);
 const setter=members.find(m=>m.id===r.setter)||members[0];
 const next=r.setter?members[(members.findIndex(m=>m.id===r.setter)+1)%members.length]:null;
 const registrar=members.find(m=>m.id===r.registeredBy)||setter;
 const phase=kstDate()<r.startDate?'공개 예정':Date.now()>=+deadlineExclusive(r)?'마감':'진행 중';
 const checked=state.lastChecked?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(state.lastChecked)):'확인 전';
 const actions=`${context.canEdit?`<a class="btn" href="#edit/${h(r.id)}">${icon('edit')}회차 수정</a>`:''}<button class="btn" data-action="copy-summary">${icon('copy')}회차 공유</button><button class="btn" data-action="sync">${icon('refresh')}기록 동기화</button><a class="btn primary" href="#verify/${h((r.problems.find(p=>!getCertificate(state,r.id,'me',p.id))||r.problems[0]).id)}">풀이 인증하기 ${icon('arrow')}</a>`;
 return `${workspaceHeading({title:r.title,kicker:'문제 현황',mode:r,context:`<div class="round-context"><span class="round-phase ${phase==='진행 중'?'open':''}">${phase}</span>${roundOptions(state,r)}</div>${periodContext(r,{name:false})}<div class="round-meta"><span>출제 ${h(setterLabel(r,members))}</span><span>등록 ${h(registrar?.name||'운영자')}</span></div>`,actions})}
 ${metricStrip([{label:'내 인증',value:mine+' / '+r.problems.length,note:'출제 문제 기준'},{label:'팀 인증',value:all+' / '+members.length*r.problems.length,note:members.length+'명 참여'},{label:'다음 출제',value:next?.name||'미정'},{label:'최근 동기화',value:checked}])}
 <div class="study-overview">${problemTable(context,r)}${teamMatrix(context,r)}</div>${photoReviewPanel(context)}${solutionOverview(state,r,members)}${pendingPanel(context,r)}${dailyActivityPanel(context)}${contributionHistory(context,r)}`;
}

function historyDashboard(context,r){
 const {state,icon,members}=context,registrar=members.find(m=>m.id===r.registeredBy)||members.find(m=>m.id===r.setter);
 const lc=r.problems.filter(p=>p.platform==='leetcode').length,pg=r.problems.length-lc;
 return `${workspaceHeading({title:r.title,kicker:'문제 기록',mode:r,context:`<div class="round-context">${roundOptions(state,r)}</div>${periodContext(r,{name:false})}<div class="round-meta"><span>출제 ${h(setterLabel(r,members))}</span><span>등록 ${h(registrar?.name||'운영자')}</span>${r.historyMeta?.source==='kakao'?'<span>카카오톡 기록</span>':''}</div>`,actions:`${context.canEdit?`<a class="btn" href="#edit/${h(r.id)}">회차 수정</a>`:''}<button class="btn" data-action="copy-summary">문제 목록 공유</button><a class="btn primary" href="#register">문제 등록</a>`})}<div class="history-record-notice">지난 회차의 문제 목록만 보관한 기록입니다. 당시 인증 여부는 옮기지 않았으며, 인증 통계, 잔디와 출제 순서에 반영하지 않습니다.${r.historyMeta?.note?`<br>${h(r.historyMeta.note)}`:''}</div><section class="problem-section history-problems" aria-labelledby="problem-list-title"><div class="section-head"><h2 id="problem-list-title">지난 회차 문제 <span>${r.problems.length}</span></h2><span class="muted">LeetCode ${lc}문제, 프로그래머스 ${pg}문제</span></div><div class="problem-table-wrap"><table class="problem-table history-problem-table"><thead><tr><th scope="col">문제</th><th scope="col" class="platform-col">플랫폼</th><th scope="col" class="difficulty-col">난이도</th></tr></thead><tbody>${r.problems.map((p,i)=>`<tr><td><div class="problem-name-row"><span class="problem-index">${String(i+1).padStart(2,'0')}</span><div><a class="problem-title" href="${h(p.url)}" target="_blank" rel="noopener noreferrer">${h(p.title)} ${icon('external')}</a><div class="problem-subtitle"><span class="mobile-platform">${platformName(p.platform)}, </span>${h(p.tag)}</div></div></div></td><td class="platform-col"><span class="platform-label ${p.platform==='leetcode'?'lc':'pg'}">${p.platform==='leetcode'?'LC':'PG'}</span></td><td class="difficulty-col"><span class="difficulty-label">${h(p.difficulty)}</span></td></tr>`).join('')}</tbody></table></div></section>${dailyActivityPanel(context)}${contributionHistory(context,r)}`;
}

export function emptyDashboard(context) {
 const {state,members,icon}=context,rules=state.rules||DEFAULT_RULES,free=rules.mode==='free';
 return `${workspaceHeading({title:free?'목표 현황':'문제 현황',kicker:'시작 전',mode:{rules},description:rulesLabel(rules)+', '+scheduleLabel(rules),actions:context.canEdit||!free?`<a class="btn primary" href="#register">${icon('plus')}${free?'목표 기간 등록':'문제 등록'}</a>`:''})}<section class="workspace-empty"><span class="empty-mark" aria-hidden="true">${icon(free?'calendar':'book')}</span><h2>${free?'등록된 목표 기간이 없습니다.':'등록된 회차가 없습니다.'}</h2><p>${free?'운영자가 기간을 등록하면 각자 고른 문제를 인증할 수 있습니다.':'공통 문제를 등록하면 문제 목록과 팀원 인증 현황을 확인할 수 있습니다.'}</p>${context.canEdit||!free?'<a class="text-button" href="#register">'+(free?'첫 목표 기간 등록하기':'첫 회차 등록하기')+' →</a>':''}</section>${free?'':teamMatrix(context,null)}`;
}

function freeDashboard(context,r){
 const {state,members,icon,avatar}=context,target=goalCount(r),mine=memberCount(state,r,'me'),completed=members.filter(m=>memberCount(state,r,m.id)>=target).length;
 const phase=kstDate()<r.startDate?'공개 예정':Date.now()>=+deadlineExclusive(r)?'마감':'진행 중';
 const actions=`${context.canEdit?`<a class="btn" href="#edit/${h(r.id)}">${icon('edit')}목표 기간 수정</a>`:''}<button class="btn" data-action="copy-summary">${icon('copy')}기간 공유</button><button class="btn" data-action="sync">${icon('refresh')}기록 동기화</button><a class="btn primary" href="#verify">문제 인증하기 ${icon('arrow')}</a>`;
 return `${workspaceHeading({title:r.title,kicker:'목표 현황',mode:r,context:`<div class="round-context"><span class="round-phase ${phase==='진행 중'?'open':''}">${phase}</span>${roundOptions(state,r)}</div>${periodContext(r,{name:false})}`,actions})}
 ${metricStrip([{label:'내 인증',value:mine+' / '+target,note:'기간 내 서로 다른 문제'},{label:'남은 목표',value:Math.max(0,target-mine)+'문제',note:mine>=target?'목표 달성':'내 목표 기준'},{label:'목표 달성',value:completed+' / '+members.length+'명',note:'팀원별 목표 기준'},{label:'인정 플랫폼',value:r.rules.platform==='all'?'LeetCode와 프로그래머스':r.rules.platform==='leetcode'?'LeetCode':'프로그래머스'}])}
 <section class="free-goals" aria-labelledby="free-goals-title"><div class="section-head"><h2 id="free-goals-title">팀원별 목표 현황</h2><button class="btn" data-action="copy-pending" data-member="all">목표 현황 복사</button></div><div class="free-goal-members">${members.map(m=>{
  const count=memberCount(state,r,m.id),solved=r.problems.filter(p=>getCertificate(state,r.id,m.id,p.id)),remaining=Math.max(0,target-count);
  return `<article class="free-goal-member ${m.id==='me'?'my-goal':''}"><div class="free-goal-heading"><div class="matrix-member">${avatar(m,'sm')}<strong>${h(m.name)}</strong>${m.id==='me'?'<small>나</small>':''}</div><progress max="${target}" value="${Math.min(target,count)}" aria-label="${h(m.name)} 목표 달성 ${count}/${target}"></progress><div class="free-goal-count"><strong>${count} / ${target}문제</strong><span class="pill ${remaining?'':'success'}">${remaining?remaining+'문제 남음':'목표 달성'}</span></div></div><details class="free-goal-records"><summary>인증 내역 ${solved.length}개<span>문제, 인증 근거, 풀이 공유</span></summary><div class="free-solve-list">${solved.map(p=>{const c=getCertificate(state,r.id,m.id,p.id);return `<div class="free-solve-row"><a href="${h(p.url)}" target="_blank" rel="noopener noreferrer"><span class="platform-label ${p.platform==='leetcode'?'lc':'pg'}">${p.platform==='leetcode'?'LC':'PG'}</span>${h(p.title)}</a><button class="text-button" data-action="open-proof" data-member="${h(m.id)}" data-problem="${h(p.id)}">${isOnTime(c.at,r)?'인증 기록':'지각 (목표에서 제외)'}</button><a class="text-button" href="#solutions/${h(p.id)}">풀이 공유</a></div>`;}).join('')||'<p class="field-note">아직 인증한 문제가 없습니다.</p>'}</div></details></article>`;
 }).join('')}</div><p class="table-note">확인 대기 사진은 목표 수에 포함하지 않습니다. 마감 후 인증은 지각으로 보관하며 목표 수에서 제외합니다.</p></section>${photoReviewPanel(context)}${solutionOverview(state,r,members)}${dailyActivityPanel(context)}${contributionHistory(context,r)}`;
}
