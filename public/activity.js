import {addDays, weekday, kstDate, escapeHTML as h} from './core.js';

// Count current certification records, never raw commits or unrelated problems.
export function dailyActivity(state, memberId, {days=365, now=Date.now()}={}) {
 const endDate=kstDate(new Date(now)),startDate=addDays(endDate,1-days),byDate={};
 const seen=new Set();
 for(const round of state.rounds||[]){
  if(round.historyOnly)continue;
  if(round.startDate>endDate)continue;
  const proofs=state.certificates?.[round.id]?.[memberId];if(!proofs)continue;
  for(const problem of round.problems){
   const key=round.id+':'+problem.id,proof=proofs[problem.id];
   if(!proof||seen.has(key))continue;seen.add(key);
   const instant=Date.parse(proof.at);
   if(!Number.isFinite(instant)||instant>now||instant<Date.parse(round.startDate+'T00:00:00+09:00'))continue;
   const date=kstDate(new Date(instant));if(date<startDate||date>endDate)continue;
   (byDate[date]??=[]).push({round,problem,proof});
  }
 }
 for(const entries of Object.values(byDate))entries.sort((a,b)=>Date.parse(b.proof.at)-Date.parse(a.proof.at));
 return {startDate,endDate,byDate,total:Object.values(byDate).reduce((sum,entries)=>sum+entries.length,0),activeDays:Object.keys(byDate).length};
}

export function activityCalendar(startDate,endDate) {
 const first=addDays(startDate,-weekday(startDate)),last=addDays(endDate,6-weekday(endDate));
 const weeks=[];
 for(let date=first;date<=last;date=addDays(date,7)){
  weeks.push(Array.from({length:7},(_,day)=>{const value=addDays(date,day);return value<startDate||value>endDate?null:value;}));
 }
 const months=[];let previous='';
 weeks.forEach((week,column)=>{const date=week.find(Boolean);if(date&&date.slice(0,7)!==previous){previous=date.slice(0,7);months.push({column:column+1,label:Number(date.slice(5,7))+'월'});}});
 return {weeks,months};
}

export function dailyActivityPanel({state,members,avatar,dailyDays=365,dailyMember='all'}) {
 const now=Date.now(),visible=members.filter(m=>dailyMember==='all'||m.id===dailyMember);
 const end=kstDate(new Date(now)),start=addDays(end,1-dailyDays),calendar=activityCalendar(start,end);
 return `<section class="daily-section" aria-labelledby="daily-title"><div class="section-head daily-section-heading"><div><h2 id="daily-title">팀원별 일별 인증</h2><p class="section-description">한국 시간 기준으로 인증 기록을 집계합니다. 날짜를 누르면 인증 내역을 볼 수 있습니다.</p></div><div class="daily-controls"><div class="daily-period" aria-label="일별 인증 조회 기간"><button data-action="daily-range" data-days="90" class="${dailyDays===90?'active':''}" aria-pressed="${dailyDays===90}">최근 90일</button><button data-action="daily-range" data-days="365" class="${dailyDays===365?'active':''}" aria-pressed="${dailyDays===365}">최근 1년</button></div><select id="daily-member" aria-label="일별 잔디 팀원 선택"><option value="all" ${dailyMember==='all'?'selected':''}>전체 팀원</option>${members.map(m=>`<option value="${h(m.id)}" ${dailyMember===m.id?'selected':''}>${h(m.name)}${m.id==='me'?' (나)':''}</option>`).join('')}</select></div></div>
 <div class="daily-date-range">${start.replaceAll('-','.')} — ${end.replaceAll('-','.')}</div><div class="daily-members">${visible.map(member=>{
  const activity=dailyActivity(state,member.id,{days:dailyDays,now});
  return `<section class="daily-member" aria-label="${h(member.name)} 일별 인증 잔디"><div class="daily-member-heading"><div class="matrix-member">${avatar(member,'sm')}<strong>${h(member.name)}</strong>${member.id==='me'?'<span class="daily-me">나</span>':''}<span class="daily-login">@${h(member.login)}</span></div><p><strong>${activity.total}</strong>건 인증 <span>(${activity.activeDays}일 활동)</span></p></div><div class="daily-scroll" tabindex="0" aria-label="${h(member.name)} 날짜별 인증 기록, 가로 스크롤 가능"><div class="daily-calendar" style="--week-count:${calendar.weeks.length}"><div class="daily-months" aria-hidden="true">${calendar.months.map(month=>`<span style="grid-column:${month.column}">${month.label}</span>`).join('')}</div><div class="daily-weekdays" aria-hidden="true">${['','월','','수','','금',''].map(label=>`<span>${label}</span>`).join('')}</div><div class="daily-grid" role="group" aria-label="${h(member.name)} 날짜별 인증">${calendar.weeks.flatMap(week=>week.map(date=>{
   if(!date)return '<span class="day-square outside" aria-hidden="true"></span>';
   const count=activity.byDate[date]?.length||0,label=`${member.name}, ${date.replaceAll('-','.')}, ${count}건 인증${date===end?' (오늘)':''}`;
   return `<button class="day-square level-${Math.min(5,count)} ${date===end?'today':''}" data-action="daily-details" data-member="${h(member.id)}" data-date="${date}" data-count="${count}" aria-label="${h(label)}" title="${h(label)}"></button>`;
  })).join('')}</div></div></div></section>`;
 }).join('')}</div><div class="contribution-footer"><span>GitHub는 커밋 시각, 사진은 제출 시각을 기준으로 집계합니다. 같은 회차의 같은 문제는 한 건입니다.</span><div class="contribution-legend"><span>0</span>${Array.from({length:6},(_,i)=>`<i class="legend-square level-${i}" aria-hidden="true"></i>`).join('')}<span>5건 이상</span></div></div></section>`;
}
