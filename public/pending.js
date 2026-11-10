import {isFree,goalCount} from './rules.js';
import {escapeHTML as h, getCertificate, kstDate, roundLabel,memberCount,deadlineLabel} from './core.js';
import {photoSubmission} from './ocr-match.js';

// Absence of evidence means uncertified, not necessarily unsolved.
export function pendingByMember(state, round, members, {today=kstDate()}={}) {
 if(!round||round.historyOnly||isFree(round)||round.startDate>today)return [];
 return members.map(member=>({member,problems:round.problems.filter(problem=>!getCertificate(state,round.id,member.id,problem.id))}));
}

export function pendingSummary(state, round, members, {now=new Date(),url=''}={}) {
 if(isFree(round)){const target=goalCount(round);return `[풀이 · ${roundLabel(round)} 자율 목표 현황]\n${round.title}\n마감: ${round.deadlineDate} ${deadlineLabel(round)} (한국 시간)\n\n${members.map(m=>{const n=memberCount(state,round,m.id);return `${m.name} · ${n}/${target}문제 인증 · ${Math.max(0,target-n)}문제 남음`;}).join('\n')}\n\n기간 내 인증 기록 기준입니다.${url?'\n스터디 현황: '+url:''}`;}
 const rows=pendingByMember(state,round,members,{today:kstDate(now)});
 if(!rows.length)return '';
 const checked=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(now);
 const total=rows.reduce((sum,row)=>sum+row.problems.length,0);
 return `[풀이 · ${roundLabel(round)} 미인증 문제]\n${round.title}\n마감: ${round.deadlineDate} ${deadlineLabel(round)} (한국 시간)\n조회: ${checked} (한국 시간) · 총 ${total}건\n\n${rows.map(({member,problems})=>`${member.name} · ${problems.length}/${round.problems.length}개 미인증\n${problems.length?problems.map(p=>`- ${p.platform==='leetcode'?'LeetCode':'프로그래머스'} · ${p.title}${photoSubmission(state,round.id,member.id,p.id)?.status==='pending'?' (사진 확인 대기)':''}\n  ${p.url}`).join('\n'):'모두 인증 완료'}`).join('\n\n')}\n\n인증 기록 기준입니다. 아직 인증하지 않은 풀이도 포함될 수 있어요.${url?'\n스터디 현황: '+url:''}`;
}

export function pendingPanel({state,members,icon,avatar,pendingMember='all'},round) {
 const rows=pendingByMember(state,round,members);
 if(!rows.length)return '';
 const selected=pendingMember==='all'||!members.some(m=>m.id===pendingMember)?'all':pendingMember;
 const visible=rows.filter(row=>selected==='all'||row.member.id===selected);
 const total=visible.reduce((sum,row)=>sum+row.problems.length,0);
 return `<section class="pending-section" aria-labelledby="pending-title"><div class="section-head pending-heading"><div><h2 id="pending-title">팀원별 미인증 문제 <span>${total}</span></h2><p class="section-description">선택한 회차의 인증 기록과 자동으로 비교합니다. GitHub·사진 인증이 반영되면 목록에서 빠집니다.</p></div><div class="pending-controls"><select id="pending-member" aria-label="미인증 문제 팀원 선택"><option value="all" ${selected==='all'?'selected':''}>전체 팀원</option>${members.map(m=>`<option value="${h(m.id)}" ${selected===m.id?'selected':''}>${h(m.name)}${m.id==='me'?' · 나':''}</option>`).join('')}</select><button class="btn" data-action="copy-pending" data-member="${h(selected)}">${icon('copy')}${selected==='all'?'전체 목록 복사':'목록 복사'}</button></div></div>
 <div class="pending-table-wrap"><table class="pending-table"><caption class="sr-only">${h(roundLabel(round))} 팀원별로 아직 인증하지 않은 문제와 공유용 목록 복사</caption><thead><tr><th scope="col">팀원</th><th scope="col">미인증 문제</th><th scope="col">공유</th></tr></thead><tbody>${visible.map(({member,problems})=>`<tr><th scope="row"><div class="matrix-member">${avatar(member,'sm')}<span>${h(member.name)}${member.id==='me'?'<small>나</small>':''}</span></div><small class="pending-count ${problems.length?'':'complete'}">${problems.length?`${problems.length}/${round.problems.length}개 미인증`:'모두 인증 완료'}</small></th><td>${problems.length?`<ul class="pending-problems">${problems.map(p=>`<li><a href="${h(p.url)}" target="_blank" rel="noopener noreferrer"><span class="platform-label ${p.platform==='leetcode'?'lc':'pg'}">${p.platform==='leetcode'?'LC':'PG'}</span>${h(p.title)}${icon('external')}</a></li>`).join('')}</ul>`:'<span class="pending-complete">모든 문제를 인증했습니다.</span>'}</td><td><button class="text-button" data-action="copy-pending" data-member="${h(member.id)}" aria-label="${h(member.name)} 미인증 목록 복사">${icon('copy')}복사</button></td></tr>`).join('')}</tbody></table></div><p class="table-note">미인증은 아직 인증 기록이 없다는 뜻입니다. 풀이 여부와 다를 수 있어요. 공유 버튼은 최신 기록을 조회한 뒤 카톡에 붙여넣을 내용을 복사합니다.</p></section>`;
}
