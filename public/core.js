import {DEFAULT_RULES,validTime,isFree} from './rules.js';
export const HOUR = 3600000;
export const KST_OFFSET = 9 * HOUR;
export const MEMBERS = [
  { id: 'me', name: '예시 사용자', initial: 'U', color: 'sage', note: '나' },
  { id: 'a', name: '팀원 A', initial: 'A', color: 'peach' },
  { id: 'b', name: '팀원 B', initial: 'B', color: 'blue' },
  { id: 'c', name: '팀원 C', initial: 'C', color: 'lavender' },
  { id: 'd', name: '팀원 D', initial: 'D', color: 'sand' }
];
export const EXAMPLES = [
  { id: 'lc-two-sum', platform: 'leetcode', title: 'Two Sum', difficulty: 'Easy', tag: '해시', url: 'https://leetcode.com/problems/two-sum/' },
  { id: 'pg-42840', platform: 'programmers', title: '모의고사', difficulty: 'Lv. 1', tag: '완전탐색', url: 'https://school.programmers.co.kr/learn/courses/30/lessons/42840' },
  { id: 'pg-134240', platform: 'programmers', title: '푸드 파이트 대회', difficulty: 'Lv. 1', tag: '구현', url: 'https://school.programmers.co.kr/learn/courses/30/lessons/134240' },
  { id: 'pg-1845', platform: 'programmers', title: '폰켓몬', difficulty: 'Lv. 1', tag: '해시', url: 'https://school.programmers.co.kr/learn/courses/30/lessons/1845' },
  { id: 'pg-42576', platform: 'programmers', title: '완주하지 못한 선수', difficulty: 'Lv. 1', tag: '해시', url: 'https://school.programmers.co.kr/learn/courses/30/lessons/42576' }
];
export function escapeHTML(value = '') {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export function kstDate(now = new Date()) { return new Date(+now + KST_OFFSET).toISOString().slice(0, 10); }
export function addDays(date, days) { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
export function weekday(date) { return new Date(date + 'T12:00:00Z').getUTCDay(); }
export function isCalendarDate(date) { return /^\d{4}-\d{2}-\d{2}$/.test(date || '') && Number.isFinite(+new Date(date + 'T12:00:00Z')) && new Date(date + 'T12:00:00Z').toISOString().slice(0, 10) === date; }
export function nextTuesday(now = new Date()) { const date = kstDate(now); return addDays(date, (2 - weekday(date) + 7) % 7); }
export function deadlineExclusive(date,time='23:59') { if(typeof date==='object'){time=date.deadlineTime||date.rules?.deadlineTime||'23:59';date=date.deadlineDate;} return new Date(Date.parse(date+'T'+time+':00+09:00')+60000); }
export function deadlineLabel(round) {const day=new Date(round.deadlineDate+'T12:00:00Z').getUTCDay();return ['일요일','월요일','화요일','수요일','목요일','금요일','토요일'][day]+' '+(round.deadlineTime||round.rules?.deadlineTime||'23:59');}
export function isOnTime(at, round) { return +new Date(at) >= +new Date(round.startDate + 'T00:00:00+09:00') && +new Date(at) < +deadlineExclusive(round); }
export function parseProblemURL(input, platform) {
  let url;
  try { url = new URL(String(input).trim()); } catch { throw new Error('https://로 시작하는 문제 링크를 입력해 주세요.'); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('HTTPS 문제 링크를 입력해 주세요.');
  const host = url.hostname.toLowerCase();
  if (platform === 'leetcode') {
    const match = /^\/problems\/([a-z0-9-]+)(?:\/.*)?$/i.exec(url.pathname);
    if (!['leetcode.com', 'www.leetcode.com'].includes(host) || !match) throw new Error('LeetCode 문제 링크를 확인해 주세요.');
    return { id: 'lc-' + match[1].toLowerCase(), url: 'https://leetcode.com/problems/' + match[1].toLowerCase() + '/' };
  }
  const match = /^\/learn\/courses\/\d+\/lessons\/(\d+)(?:\/.*)?$/.exec(url.pathname);
  if (!['school.programmers.co.kr', 'programmers.co.kr', 'www.programmers.co.kr'].includes(host) || !match) throw new Error('프로그래머스 문제 링크를 확인해 주세요.');
  return { id: 'pg-' + match[1], url: 'https://school.programmers.co.kr/learn/courses/30/lessons/' + match[1] };
}
export function validateRound(draft,{today=kstDate(),rules=DEFAULT_RULES}={}) {
  const errors = {};
  const unknownDeadline = draft.historyOnly && draft.historyMeta?.deadlineKnown === false;
  if (!draft.title?.trim()) errors.title = '회차 제목을 입력해 주세요.';
  if (!isCalendarDate(draft.startDate)) errors.startDate = '문제를 공개할 날짜를 선택해 주세요.';
  if (unknownDeadline) {
    if (draft.deadlineDate) errors.deadlineDate = '마감 미기재 기록에는 마감일을 입력하지 않습니다.';
  } else if (!isCalendarDate(draft.deadlineDate)) errors.deadlineDate = '마감일을 선택해 주세요.';
  else if (!draft.historyOnly && rules.schedule==='weekly' && weekday(draft.deadlineDate) !== rules.weekday) errors.deadlineDate = '스터디 마감은 '+['일요일','월요일','화요일','수요일','목요일','금요일','토요일'][rules.weekday]+'이에요. 설정한 요일을 선택해 주세요.';
  else if (draft.startDate > draft.deadlineDate) errors.deadlineDate = '마감일은 공개일보다 빠를 수 없어요.';
  if(!draft.historyOnly&&!validTime(draft.deadlineTime??rules.deadlineTime))errors.deadlineTime='마감 시각을 입력해 주세요.';
  if(draft.historyOnly){
    if(draft.number!==undefined&&(!Number.isInteger(draft.number)||draft.number<1||draft.number>99999))errors.number='회차 번호는 1~99999의 정수로 입력하거나 비워 주세요.';
    if(isCalendarDate(draft.startDate)&&draft.startDate>=today)errors.startDate='지난 출제일은 오늘 이전이어야 해요.';
    if(isCalendarDate(draft.deadlineDate)&&draft.deadlineDate>=today)errors.deadlineDate='지난 회차의 마감일은 오늘 이전이어야 해요.';
  }
  const ids = new Set();
  const problems = (draft.problems || []).map((p, i) => {
    if(draft.historyOnly&&!p.title?.trim()&&!p.url?.trim())return null;
    const expected = draft.historyOnly ? p.platform : i < rules.leetcodeCount ? 'leetcode' : 'programmers';
    try {
      if(!['leetcode','programmers'].includes(expected))throw new Error('지원하는 플랫폼을 선택해 주세요.');
      if (p.platform !== expected) throw new Error('플랫폼 구성을 확인해 주세요.');
      const normalized = parseProblemURL(p.url, expected);
      if (ids.has(normalized.id)) throw new Error('같은 문제가 이미 등록되어 있어요.');
      ids.add(normalized.id);
      if (!p.title?.trim()) throw new Error('문제 제목을 입력해 주세요.');
      return { ...p, ...normalized, title: p.title.trim(), difficulty: p.difficulty || (expected === 'leetcode' ? '난이도 미정' : '레벨 미정'), tag: p.tag || (draft.historyOnly?'주제 미기재':'자유 주제') };
    } catch (e) { errors['problem-' + i] = e.message; return p; }
  }).filter(Boolean);
  if(draft.historyOnly){if(problems.length<1||problems.length>50)errors.problems='지난 문제는 1~50개까지 보관할 수 있어요.';}
  else if(rules.mode==='free'){if(problems.length)errors.problems='자율 목표 기간에는 공통 문제를 등록하지 않습니다.';}
  else if (problems.length !== rules.problemCount) errors.problems = `LeetCode ${rules.leetcodeCount}개와 프로그래머스 ${rules.problemCount-rules.leetcodeCount}개를 등록해 주세요.`;
  return { errors, problems, valid: Object.keys(errors).length === 0 };
}
export function roundLabel(round) {
  return round.historyOnly&&round.historyMeta?.dateBased ? round.startDate.replaceAll('-','.')+' 출제' : round.number+(isFree(round)?'차 목표':'회차');
}
export function historyDeadline(round) {
  if(round.historyMeta?.deadlineKnown===false||!round.deadlineDate)return '미기재';
  return round.historyMeta?.deadlineLabel||round.deadlineDate.replaceAll('-','.');
}
export function roundSummary(round,members=[]) {
  const schedule=round.historyOnly ? `출제일: ${round.startDate}\n마감: ${historyDeadline(round)}${round.historyMeta?.author?'\n원문 출제: '+round.historyMeta.author:''}${round.historyMeta?.note?'\n'+round.historyMeta.note:''}` : `마감: ${round.deadlineDate} ${deadlineLabel(round)} (한국 시간)${round.setterName||members.length?'\n출제: '+setterLabel(round,members):''}`;
  return `[풀이 ${roundLabel(round)}]\n${round.title}\n${schedule}\n\n${(isFree(round)?`각자 원하는 문제 ${round.rules.problemCount}개를 기간 내 인증해 주세요.`:round.problems.map((p,i)=>`${i+1}. ${p.title}\n${p.url}`).join('\n\n'))}\n\n${round.historyOnly?'지난 문제 목록입니다. 당시 인증 기록은 포함하지 않습니다.':isFree(round)?'같은 문제는 기간당 한 번만 집계합니다.':'다시 풀고 인증해 주세요.'}`;
}
export function setterLabel(round,members=[]) {
  return members.find(m=>m.id===round.setter)?.name||round.setterName||round.historyMeta?.author||'출제자 미지정';
}
export function getCertificate(state, roundId, memberId, problemId) { return state.certificates?.[roundId]?.[memberId]?.[problemId] || null; }
export function memberCount(state, round, memberId) { return round.problems.filter(p => {const c=getCertificate(state, round.id, memberId, p.id);return c&&(!isFree(round)||isOnTime(c.at,round));}).length; }
export function putCertificate(state, roundId, memberId, problemId, certificate) {
  state.certificates[roundId] ??= {}; state.certificates[roundId][memberId] ??= {};
  state.certificates[roundId][memberId][problemId] = certificate;
}
export function createSeed(now = new Date()) {
  const due = nextTuesday(now);
  const round = { id: 'round-8', number: 8, title: '해시와 완전탐색, 차근차근', startDate: addDays(due, -6), deadlineDate: due, setter: 'a', problems: structuredClone(EXAMPLES), createdAt: now.toISOString() };
  const state = { schema: 1, activeRoundId: round.id, rounds: [round], certificates: {}, draft: null, lastChecked: null };
  const methods = { me: ['github', 'github', 'photo', null, null], a: ['github', 'photo', null, null, null], b: ['github', 'github', 'photo', 'github', 'photo'], c: [null, null, 'photo', null, null], d: ['github', null, null, 'github', null] };
  for (const [member, list] of Object.entries(methods)) list.forEach((method, i) => { if (method) putCertificate(state, round.id, member, round.problems[i].id, { method, at: now.toISOString(), note: '화면 구성을 위한 예시 인증입니다.', example: true }); });
  return state;
}
