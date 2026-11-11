import {workspaceHeading,periodContext,metricStrip,methodTabs,registrationRules,modeTag,modeNoun} from './study-ui.js';
import {githubLoginForm,loginHeading,loginLayout} from './login-ui.js';
import {DEFAULT_RULES,rulesOf,isFree,goalCount,rulesLabel,scheduleLabel,nextDeadlineDate,blankProblems} from './rules.js';
import {readRules,syncRulesFields,studyRulesPage} from './rule-forms.js';
import {studyList,createStudyForm,parseInviteURL} from './studies.js';
import {solutionPage,solutionBody} from './solutions.js';
import {dashboard, emptyDashboard} from './dashboard.js';
import {dailyActivity} from './activity.js';
import {pendingSummary} from './pending.js';
import {recognizePhoto} from './ocr.js';
import {assessPhotoOCR,photoSubmission} from './ocr-match.js';
import {photoStatus} from './photo-review.js';
import { EXAMPLES, escapeHTML as h, kstDate, addDays, nextTuesday, deadlineExclusive, deadlineLabel, isOnTime, parseProblemURL, validateRound, getCertificate, memberCount, roundLabel, historyDeadline, roundSummary, setterLabel } from './core.js';

const KEY = 'puli-draft-v2';
let MEMBERS = [];
let STUDIES=[];
let activeStudyId=null;
let activeStudy=null;
let switchingStudy=false;
const draftKey=()=>KEY+':'+account.id+':'+activeStudyId+(activeStudy?.rulesRevision?':rules-'+activeStudy.rulesRevision:'');
function restoreDraft(){try{state.draft=JSON.parse(localStorage.getItem(draftKey())||(activeStudyId==='study'&&!activeStudy?.rulesRevision?localStorage.getItem(KEY+':'+account.id):null));}catch{state.draft=null;}}
let account = null;
let serviceStatus = null;
let bootError = '';
let availableRepos = [];
let installURL = '';
let repositories = [];
let booting = true;
const app = document.querySelector('#app');
const dialog = document.querySelector('#dialog');
const icons = {
  code: '<path d="m8 5-6 7 6 7m8-14 6 7-6 7"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15l-1 6Z"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  circleCheck: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18m-12 4h.01M15 15h.01"/>',
  people: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M16 3a4 4 0 0 1 0 8"/><circle cx="9" cy="7" r="4"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  down: '<path d="m7 10 5 5 5-5"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  back: '<path d="M19 12H5m6-6-6 6 6 6"/>',
  external: '<path d="M15 3h6v6m0-6L10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/>',
  github: '<path d="M9 19c-4.3 1.3-4.3-2-6-2m12 5v-3.9a3.4 3.4 0 0 0-.9-2.6c3-.3 6.2-1.5 6.2-6.8a5.3 5.3 0 0 0-1.5-3.7 4.9 4.9 0 0 0-.1-3.7s-1.2-.4-3.8 1.4a13 13 0 0 0-7 0C5.3.9 4.1 1.3 4.1 1.3A4.9 4.9 0 0 0 4 5a5.3 5.3 0 0 0-1.5 3.7c0 5.3 3.2 6.5 6.2 6.8A3.4 3.4 0 0 0 8 18v4"/>',
  photo: '<rect x="3" y="5" width="18" height="16" rx="3"/><circle cx="8" cy="10" r="1.5"/><path d="m21 17-5-5-9 9"/>',
  upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>',
  copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  sprout: '<path d="M12 21v-9m0 5c-6 0-9-4-9-9 6 0 9 3 9 9Zm0-6c0-5 4-8 9-8 0 5-3 8-9 8Z"/>',
  settings: '<path d="m9 3-.6 2.2-2 .8L4.4 5 2 9l1.7 1.6v2.8L2 15l2.4 4 2-.9 2 .8L9 21h5l.6-2.2 2-.8 2 .9L21 15l-1.7-1.6v-2.8L21 9l-2.4-4-2 .9-2-.8L14 3Z"/><circle cx="11.5" cy="12" r="3"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>',
  refresh: '<path d="M20 7a9 9 0 0 0-15-1L2 9m0-6v6h6m-4 8a9 9 0 0 0 15 1l3-3m0 6v-6h-6"/>',
  book: '<path d="M12 5C8 2 3 3 2 4v16c3-2 6-2 10 0 4-2 7-2 10 0V4c-1-1-6-2-10 1Zm0 0v15"/>',
  x: '<path d="m6 6 12 12M6 18 18 6"/>',
  minus: '<path d="M7 12h10"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 5v2"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Zm0 0v6h6M8 13h8m-8 4h6"/>'
};
const icon = (name, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.code}</svg>`;
const avatar = (m, cls = '') => `<span class="avatar ${m.color} ${cls}" aria-hidden="true">${h(m.initial)}</span>`;
const platform = p => p === 'leetcode' ? 'LeetCode' : '프로그래머스';
const platformIcon = p => `<span class="platform-icon ${p === 'leetcode' ? 'lc' : 'pg'}" aria-hidden="true">${p === 'leetcode' ? icon('code') : 'P'}</span>`;
let state = { rounds: [], certificates: {}, activeRoundId: null, draft: null, lastChecked: null };
let filter = 'all';
let dailyDays = 365;
let dailyMember = 'all';
let pendingMember = 'all';
let method = 'github';
let candidate = null;
let photoDraft = null;
let freeProblemDraft={roundId:null,platform:'',url:'',title:''};
let photoFormState = { problemId: null, note: '', confirmed: false };
let photoBusy = false;
let photoOCRController = null;
let photoEpoch = 0;
let renderEpoch = 0;
let imageURLs = [];
let formDirty = false;
let pendingRound = null;
let editingDraft = null;
let editingOriginal = null;
let toastTimer;
const solutionDrafts=new Map();
const solutionKey=()=>round()?.id+':'+currentProblem()?.id;
const solutionDraft=()=>{const key=solutionKey();if(!solutionDrafts.has(key))solutionDrafts.set(key,{loaded:false,revision:0,shared:false});return solutionDrafts.get(key);};
let githubBusy = false;
let authEpoch = 0;
let authNotice = '';
let inviteState={loaded:false,busy:false,data:null,error:''};
let joinState={token:null,loaded:false,loading:false,error:''};
const inviteMessages={INVITE_UNAVAILABLE:'초대 링크가 만료되었거나 새로 발급됐어요. 운영자에게 새 링크를 요청해 주세요.',INVITE_FULL:'스터디 정원이 모두 찼어요. 운영자에게 문의해 주세요.',INVITE_PERSONAL_ACCOUNT:'개인 GitHub 계정으로 참여해 주세요.',INVITE_ACCOUNT_CONFLICT:'GitHub 계정 정보를 확인하지 못했어요. 운영자에게 문의해 주세요.'};
const LOGOUT_KEY = 'puli-logout-v1';
const round = () => state.rounds.find(r => r.id === state.activeRoundId) || state.rounds[0];
const certificate = (p, member = 'me') => getCertificate(state, round().id, member, p.id);
const route = () => location.hash.slice(1) || 'home';
const joinToken = () => /^join\/([A-Za-z0-9_-]{43})$/.exec(route())?.[1]||null;
const liveRound = () => state.rounds.find(r=>!r.historyOnly&&r.startDate<=kstDate())||state.rounds.find(r=>!r.historyOnly);
const currentProblem = () => round()?.problems.find(p => p.id === route().split('/')[1]) || round()?.problems.find(p => !certificate(p)) || round()?.problems[0];
const shortDate = date => { const [, m, d] = date.split('-'); return `${Number(m)}.${String(d).padStart(2, '0')}`; };
const dateTime = value => { const d = new Date(value); return Number.isFinite(+d) ? new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(d) : '확인 전'; };
const period = r => r.historyOnly ? `출제 ${r.startDate}, 마감 ${historyDeadline(r)}` : `${shortDate(r.startDate)} — ${shortDate(r.deadlineDate)}`;
const repo = p => repositories.find(r => r.platform === p.platform)?.full_name || '저장소 연결 전';
function save() { try { localStorage.setItem(draftKey(), JSON.stringify(state.draft)); return true; } catch { toast('이 기기에 초안을 저장하지 못했어요.'); return false; } }
async function api(path, options = {}) {
  const requestEpoch=authEpoch,studyHeader=activeStudyId?{'X-Puli-Study':activeStudyId}:{};
  for(let attempt=0;attempt<3;attempt++){
    const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...options, headers: { ...studyHeader, ...(options.body && typeof options.body === 'string' ? {'Content-Type':'application/json'} : {}), ...options.headers } });
    const data = await response.json();
    if(requestEpoch!==authEpoch)throw new Error('스터디가 전환됐어요. 현재 화면에서 다시 시도해 주세요.');
    if(response.status===503&&data.code==='SESSION_REFRESH_BUSY'&&attempt<2){await new Promise(resolve=>setTimeout(resolve,1000*(attempt+1)));continue;}
    if (!response.ok) { if (response.status === 401) { clearAccount('로그인이 만료됐어요. 다시 로그인해 주세요.'); render(); } const error = new Error(data.error || '요청을 처리하지 못했어요.'); error.fields = data.fields; error.status=response.status; throw error; }
    return data;
  }
}
async function reloadState() {
  if(!activeStudyId)return;
  const epoch=authEpoch,data = await api('/api/state');if(epoch!==authEpoch)return false; account = data.user; activeStudy=data.study; repositories = data.repositories;state.studyCapacity=data.study.capacity;state.rules=data.study.rules;
  STUDIES=STUDIES.map(s=>s.id===activeStudyId?{...s,...data.study,memberCount:data.members.length}:s);
  const memberId = id => id === account.id ? 'me' : id;
  const colors = ['sage','peach','blue','lavender','sand'];
  MEMBERS = data.members.map(m => ({...m, id:memberId(m.id), name:m.name || m.login, initial:(m.name || m.login).slice(0,1), color:colors[m.slot%colors.length]}));
  // Keep the current user first only in the sidebar; rotation still follows slot order.
  const oldId = state.activeRoundId;
  state.rounds = data.rounds.map(r => ({...r,setter:memberId(r.setter),registeredBy:memberId(r.registeredBy)}));
  state.activeRoundId = state.rounds.some(r=>r.id===oldId) ? oldId : (liveRound() || state.rounds[0])?.id;
  state.certificates = {};
  for (const [roundId, members] of Object.entries(data.certificates)) {
    state.certificates[roundId] = {};
    for (const [id, certificates] of Object.entries(members)) state.certificates[roundId][memberId(id)] = Object.fromEntries(Object.entries(certificates).map(([problem,c])=>[problem,{...c,reviewedBy:memberId(c.reviewedBy)}]));
  }
  state.solutionShares=(data.solutionShares||[]).map(s=>({...s,memberId:memberId(s.memberId)}));
  state.photoSubmissions=(data.photoSubmissions||[]).map(s=>({...s,memberId:memberId(s.memberId),reviewedBy:memberId(s.reviewedBy)}));
  state.lastChecked = repositories.map(r=>r.checked_at).filter(Boolean).sort().at(-1) || null;
}
async function boot() {
  booting=true;
  bootError='';
  render();
  try {
    const address=new URL(location.href),inviteError=address.searchParams.get('inviteError');
    if(inviteError){authNotice=inviteMessages[inviteError]||'초대 링크를 확인해 주세요.';address.searchParams.delete('inviteError');history.replaceState(null,'',address.pathname+address.search+address.hash);}
    serviceStatus = await api('/api/status'); account = serviceStatus.user;
    if (account) {
      STUDIES=(await api('/api/studies')).studies;
      const joinedStudy=address.searchParams.get('joinedStudy');
      const joined=joinedStudy && STUDIES.find(study=>study.id===joinedStudy);
      const preferenceKey='puli-study:'+account.id;
      let preferred;
      try{preferred=localStorage.getItem(preferenceKey);}catch{}
      activeStudyId=joined?.id || STUDIES.find(study=>study.id===preferred)?.id || STUDIES[0]?.id || null;
      if(await reloadState()===false)return;
      if(activeStudyId)restoreDraft();
      if(joinedStudy){
        address.searchParams.delete('joinedStudy');
        address.hash=joined?'connect':'studies';
        history.replaceState(null,'',address.pathname+address.search+address.hash);
        if(joined){try{localStorage.setItem(preferenceKey,joined.id);}catch{}}
      }
      try {
        const epoch=authEpoch,choices=await api('/api/repositories');
        if(epoch===authEpoch){availableRepos=choices.repositories;installURL=choices.installURL;}
      }catch(e){toast(e.message);}
    }
  } catch(e) { if(e.status!==401)bootError=e.message; }
  finally{booting=false;render();}
}
async function switchStudy(id,destination='home'){
 if(switchingStudy)return;
 if(!STUDIES.some(s=>s.id===id))throw new Error('참여 중인 스터디를 선택해 주세요.');
 if(account&&formDirty&&!route().startsWith('edit/')&&document.querySelector('#round-form')){state.draft=readForm();save();}
 const previous=activeStudyId;switchingStudy=true;authEpoch++;
 resetPhoto();freeProblemDraft={roundId:null,platform:'',url:'',title:''};solutionDrafts.clear();inviteState={loaded:false,busy:false,data:null,error:''};
 if(dialog.open)dialog.close();imageURLs.forEach(URL.revokeObjectURL);imageURLs=[];
 MEMBERS=[];state={rounds:[],certificates:{},activeRoundId:null,draft:null,lastChecked:null};
 pendingRound=null;editingDraft=null;editingOriginal=null;formDirty=false;candidate=null;filter='all';dailyMember='all';pendingMember='all';
 activeStudyId=id;activeStudy=null;app.innerHTML='<main class="content"><p role="status">스터디를 불러오는 중입니다.</p></main>';
 try{
  await reloadState();restoreDraft();try{localStorage.setItem('puli-study:'+account.id,id);}catch{}
  history.replaceState(null,'','/#'+destination);
 }catch(error){activeStudyId=previous;if(previous)await reloadState();throw error;}
 finally{switchingStudy=false;render();}
}
function clearAccount(message='',broadcast=false){
  if(account&&formDirty&&!route().startsWith('edit/')&&document.querySelector('#round-form')){state.draft=readForm();save();}
  solutionDrafts.clear();authEpoch++;STUDIES=[];activeStudyId=null;activeStudy=null;account=null;MEMBERS=[];state={rounds:[],certificates:{},activeRoundId:null,draft:null,lastChecked:null};
  inviteState={loaded:false,busy:false,data:null,error:''};joinState={token:null,loaded:false,loading:false,error:''};
  serviceStatus={...serviceStatus,configured:true,user:null};
  availableRepos=[];repositories=[];installURL='';pendingRound=null;editingDraft=null;editingOriginal=null;candidate=null;dailyMember='all';pendingMember='all';formDirty=false;authNotice=message;bootError='';
  resetPhoto();freeProblemDraft={roundId:null,platform:'',url:'',title:''};if(dialog.open)dialog.close();imageURLs.forEach(URL.revokeObjectURL);imageURLs=[];
  if(broadcast){try{localStorage.setItem(LOGOUT_KEY,String(Date.now())+Math.random());}catch{}}
}
async function syncAll() {
  if (githubBusy) return;
  githubBusy=true;
  try {
    if (!repositories.length) { navigate('connect'); return; }
    let count=0, more=false, waitingForRound=false;
    for (const repo of repositories) { const result=await api('/api/sync',{method:'POST',body:JSON.stringify({platform:repo.platform})}); count+=result.count||0;more ||= result.more;waitingForRound ||= result.waitingForRound; }
    await reloadState(); render(); toast(count ? `${count}문제의 새 풀이를 인증했어요.` : waitingForRound ? '저장소 읽기 권한을 확인했어요. 회차를 등록하면 자동 인증을 시작해요.' : more ? '남은 기록은 자동으로 이어서 확인해요.' : !state.rounds.some(r=>!r.historyOnly&&r.startDate<=kstDate()) ? '공개된 회차가 없어요. 회차를 등록하면 자동 인증을 시작해요.' : '최신 기록을 확인했어요. 조건에 맞는 새 풀이가 있으면 자동으로 인증돼요.');
  } finally {githubBusy=false;}
}
function toast(message) { const el = document.querySelector('#toast'); el.textContent = message; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 3400); }
function navigate(path) { if (route() === path) render(); else location.hash = path; }
function openDialog(title, body, actions = '') {
  dialog.innerHTML = `<button class="dialog-close" aria-label="닫기" data-action="close-dialog">${icon('x')}</button><h2 id="dialog-title">${title}</h2>${body}${actions ? `<div class="dialog-actions">${actions}</div>` : ''}`;
  if (!dialog.open) dialog.showModal();
}
function resetPhoto() { photoEpoch++;photoOCRController?.abort();photoOCRController=null; if (photoDraft?.url) URL.revokeObjectURL(photoDraft.url); photoDraft = null; photoBusy = false; photoFormState = { problemId: null, note: '', confirmed: false }; }
function capturePhotoForm() { const form = document.querySelector('#photo-form'); if (form) { photoFormState.note = form.elements.note.value; photoFormState.confirmed = form.elements.confirmed.checked; } }
function shell(content, active, page = active) {
  const verificationRound=round()?.historyOnly?liveRound():round(),verificationProblem=verificationRound?.problems.find(p=>!getCertificate(state,verificationRound.id,'me',p.id))||verificationRound?.problems[0];
  return `<header class="site-header"><div class="site-header-inner"><a href="#home" class="brand" aria-label="금귤 홈"><span class="brand-mark">${icon('code')}</span><span class="brand-name">금귤</span></a><a class="study-home-link" href="#studies">내 스터디</a>${activeStudyId?`<label class="study-switch"><span class="sr-only">스터디 전환</span><select id="study-select" aria-label="스터디 전환" ${switchingStudy?'disabled':''}>${STUDIES.map(s=>`<option value="${h(s.id)}" ${s.id===activeStudyId?'selected':''}>${h(s.name)}</option>`).join('')}</select></label>`:''}<nav class="site-nav ${activeStudyId?'':'hidden'}" aria-label="주요 메뉴"><a href="#home" class="${active==='home'?'active':''}" ${active==='home'?'aria-current="page"':''}>${isFree(verificationRound)?'목표 현황':'문제 현황'}</a><a href="#register" class="${active==='register'?'active':''}" ${active==='register'?'aria-current="page"':''}>${activeStudy?.rules?.mode==='free'?'목표 기간 등록':'문제 등록'}</a><a href="${isFree(verificationRound)?'#verify':verificationProblem?'#verify/'+verificationProblem.id:'#home'}" ${verificationProblem||isFree(verificationRound)?'':'aria-disabled="true" title="인증할 새 회차가 없습니다."'} class="${active==='verify'?'active':''}" ${active==='verify'?'aria-current="page"':''}>풀이 인증</a><a href="#connect" class="${active==='connect'?'active':''}" ${active==='connect'?'aria-current="page"':''}>저장소 및 멤버</a></nav><button class="account-button" data-action="settings" aria-label="${h(account.login)} 계정 설정">${avatar(MEMBERS.find(m=>m.id==='me')||{initial:(account.name||account.login).slice(0,1),color:'sage'},'sm')}<span>${h(account.login)}</span>${icon('down')}</button></div></header><main id="main-content" class="content content-${page}">${content}<footer class="footer-note"><span>코딩테스트 스터디 금귤</span><span>${activeStudy? h(activeStudy.name):'내 스터디'}</span></footer></main>`;
}
function previewBar() { return ''; }
function home() {
 return shell(dashboard({state,members:MEMBERS,filter,icon,avatar,dailyDays,dailyMember,pendingMember,canEdit:account.role==='owner'}),'home');
}
function emptyDraft() {
 const rules=activeStudy?.rules||DEFAULT_RULES,last=state.rounds.find(r=>!r.historyOnly),startDate=last&&last.deadlineDate>=kstDate()?addDays(last.deadlineDate,1):kstDate();
 return {title:`${Math.max(0,...state.rounds.map(r=>r.number))+1}${rules.mode==='free'?'차 목표 기간':'회차'}`,startDate,deadlineDate:nextDeadlineDate(startDate,rules),deadlineTime:rules.deadlineTime,setter:'me',rulesRevision:activeStudy?.rulesRevision||0,problems:blankProblems(rules)};
}
const formRules=()=>route().startsWith('edit/')?editingOriginal?.rules||DEFAULT_RULES:activeStudy?.rules||DEFAULT_RULES;
function field(label, name, value, type = 'text', note = '', placeholder = '', required = true) {
  return `<div class="field" data-field="${name}"><label for="${name}">${label}${required ? '<span class="required">*</span>' : ''}</label><input class="input" id="${name}" name="${name}" type="${type}" value="${h(value || '')}" ${required ? 'required' : ''} ${type === 'text' ? 'maxlength="120"' : ''} ${type === 'url' ? 'maxlength="2048"' : ''} ${type === 'number' ? 'min="1" max="99999" step="1"' : ''} placeholder="${placeholder}" aria-describedby="${name}-error"><span class="field-error" id="${name}-error"></span>${note ? `<span class="field-note">${note}</span>` : ''}</div>`;
}
function historyFormFields(d){
 if(account.role!=='owner')return '';
 return `<label class="checkbox history-mode"><input type="checkbox" id="history-only" name="historyOnly" ${d.historyOnly?'checked':''}><span>지난 회차 문제만 기록</span></label><p class="field-note">당시 인증은 옮기지 않고 문제 목록만 보관합니다.</p><div id="history-fields" class="${d.historyOnly?'':'hidden'}">${field('지난 회차 번호','number',d.number||'','number','모르면 비워 두세요. 출제 날짜로 보관합니다. 이미 등록한 번호는 사용할 수 없습니다.','선택 사항',false)}<label class="checkbox"><input type="checkbox" id="deadline-unknown" name="deadlineUnknown" ${d.historyMeta?.deadlineKnown===false?'checked':''}><span>당시 마감일 미기재</span></label></div>`;
}
function authorFields(d) {
  if(account.role!=='owner')return `<p class="field-note">출제자 ${h(account.name||account.login)}</p>`;
  const chosen=d.setter===null?'by-name':d.setter==='me'?account.id:d.setter||account.id;
  return `<div class="field-row author-fields"><div class="field" data-field="setter"><label for="setter">출제자<span class="required">*</span></label><select class="input" id="setter" name="setter" aria-describedby="setter-error"><option value="by-name" ${chosen==='by-name'?'selected':''}>이름으로 기록 (계정 미연결)</option>${MEMBERS.map(m=>{const id=m.id==='me'?account.id:m.id;return `<option value="${h(id)}" ${chosen===id?'selected':''}>${h(m.name)} (@${h(m.login)})</option>`;}).join('')}</select><span class="field-error" id="setter-error"></span><span class="field-note">문제를 고른 사람을 선택합니다. 등록자는 별도로 기록됩니다.</span></div><div id="setter-name-field" class="${chosen==='by-name'?'':'hidden'}">${field('출제자 이름','setterName',d.setterName||'','text','팀원 계정이 등록되면 회차 수정에서 연결할 수 있어요.','예: 출제자 이름',chosen==='by-name')}</div></div>`;
}
function editRound() {return state.rounds.find(r=>r.id===route().slice(5));}
function editorDraft() {
  if(!route().startsWith('edit/'))return state.draft||emptyDraft();
  const r=editRound();if(!r)return null;
  if(editingDraft?.id!==r.id){editingOriginal=structuredClone(r);editingDraft=structuredClone(r);if(r.historyMeta?.dateBased)delete editingDraft.number;}
  return editingDraft;
}
function problemInputs(d) {
  return d.problems.map((p,i)=>{
    const kind=d.historyOnly?p.platform:i<formRules().leetcodeCount?'leetcode':'programmers';
    const locked=!!d.id&&Object.values(state.certificates[d.id]||{}).some(proofs=>proofs[p.id]);
    return `<div class="problem-input scroll-target" data-field="problem-${i}" id="problem-${i}"><div class="problem-input-top"><span class="pill ${kind==='leetcode'?'orange':'blue'}" data-platform-badge="${i}">${kind==='leetcode'?'LC':'PG'}</span><span>문제 ${String(i+1).padStart(2,'0')}</span>${locked?'<span class="pill success">인증 기록 있음</span>':''}</div>${d.historyOnly?`<div class="field"><label for="platform-${i}">플랫폼</label><select class="input" id="platform-${i}" name="platform-${i}"><option value="leetcode" ${kind==='leetcode'?'selected':''}>LeetCode</option><option value="programmers" ${kind==='programmers'?'selected':''}>프로그래머스</option></select></div>`:`<input type="hidden" name="platform-${i}" value="${kind}">`}<div class="problem-input-fields">${field('문제 링크','url-'+i,p.url,'url',locked?'인증된 문제는 링크를 유지합니다. 제목은 수정할 수 있어요.':'',kind==='leetcode'?'https://leetcode.com/problems/…':'https://school.programmers.co.kr/learn/courses/30/lessons/…',!d.historyOnly).replace('type="url"',`type="url" ${locked?'readonly':''}`)}${field('문제 제목','name-'+i,p.title,'text','','문제 제목',!d.historyOnly)}</div><span class="field-error" id="problem-${i}-error"></span></div>`;
  }).join('');
}
function register() {
 const editing=route().startsWith('edit/');
 if(editing&&account.role!=='owner')return shell('<h1>회차 수정</h1><p>운영자만 수정할 수 있습니다.</p>','register');
 const draft=editorDraft();if(!draft)return shell('<h1>회차를 찾을 수 없습니다.</h1><a href="#home" class="btn">홈으로</a>','register');
 const rules=formRules(),free=!draft.historyOnly&&rules.mode==='free',count=draft.historyOnly?Math.max(5,draft.problems.length):free?0:rules.problemCount;
 const blanks=blankProblems(rules),d={...draft,rules,deadlineTime:draft.deadlineTime||rules.deadlineTime,problems:Array.from({length:count},(_,i)=>draft.problems[i]||blanks[i]||{platform:i===0?'leetcode':'programmers',title:'',url:''})};
 const historyFields=editing?(d.historyOnly?`<p class="field-note">지난 문제 목록을 수정합니다. 출제일과 기록 종류는 유지됩니다.</p><label class="checkbox"><input type="checkbox" id="deadline-unknown" name="deadlineUnknown" ${d.historyMeta?.deadlineKnown===false?'checked':''}><span>당시 마감일 미기재</span></label>`:''):historyFormFields(d);
 const heading=editing?(free?'목표 기간 수정':'회차 수정'):free?'목표 기간 등록':'문제 등록';
 return shell(`${workspaceHeading({title:heading,kicker:editing?'수정':'새로 등록',mode:{rules,historyOnly:d.historyOnly},description:free?'기간과 개인별 목표를 확인한 뒤 공개합니다.':d.historyOnly?'당시 출제한 문제 목록을 보관합니다.':'회차 정보와 공통 문제 목록을 확인한 뒤 공개합니다.',context:`<span class="registration-author">등록자 ${h(MEMBERS.find(m=>m.id===d.registeredBy)?.name||account.name||account.login)}</span>`,back:'<a href="#home" class="back-link">← 현황으로 돌아가기</a>'})}<form id="round-form" class="registration-workspace" novalidate>${d.historyOnly?'':registrationRules(rules)}<div class="form-layout"><div><section class="card form-card"><div class="form-heading"><div><h2>${free?'목표 기간':'회차 정보'}</h2><p>${editing?'처음 등록한 시작일과 운영 방식은 유지됩니다.':'시작일과 마감일을 정해 공개합니다.'}</p></div></div>${historyFields?`<details class="history-register-options" ${d.historyOnly?'open':''}><summary>지난 문제 기록 ${editing?'안내':'등록'}</summary>${historyFields}</details>`:''}${field(free?'목표 기간 이름':'회차 제목','title',d.title,'text','','이름')}${free?'':authorFields(d)}<div class="field-row registration-dates">${field(free?'시작일':'문제 공개일','startDate',d.startDate,'date',editing?'처음 등록한 시작일을 유지합니다.':'')}${field('마감일','deadlineDate',d.deadlineDate,'date',d.historyOnly?'당시 공지한 날짜':scheduleLabel(rules))}${d.historyOnly?'':field('마감 시각','deadlineTime',d.deadlineTime,'time','한국 시간 기준')}</div></section><section class="card form-card registration-objective"><div class="form-heading"><div style="flex:1"><h2>${free?'개인별 목표':'출제 문제'}</h2><p id="problem-entry-note">${free?'각자 고른 문제를 기간 안에 인증합니다.':d.historyOnly?'당시 출제한 문제만 입력하고 나머지는 비워 두세요.':h(rulesLabel(rules))}</p></div>${editing||free?'':'<button type="button" class="text-button" data-action="fill-examples">예시로 채우기</button>'}</div><div id="form-errors" class="notice yellow form-banner hidden" role="alert"></div>${free?`<div class="notice"><div><strong>팀원마다 ${rules.problemCount}문제</strong><p>${h(rulesLabel(rules))}<br>기간 내 인증한 서로 다른 문제로 집계합니다. GitHub 자동 확인 또는 사진 제출을 사용할 수 있습니다.</p></div></div>`:problemInputs(d)}</section><div class="form-actions"><span class="saved" id="draft-status">${editing?'기존 인증 기록은 유지됩니다.':state.draft?'이 기기에 저장한 초안을 불러왔어요.':'작성한 내용은 초안으로 저장할 수 있어요.'}</span><div class="row">${editing?'<button type="button" class="btn large" data-action="cancel-round-edit">취소</button>':'<button type="button" class="btn large" data-action="save-draft">초안 저장</button>'}<button type="submit" class="btn primary large">${editing?'수정 내용 확인':'등록 내용 확인'} ${icon('arrow')}</button></div></div></div><aside class="card aside-preview registration-preview">${modeTag({rules,historyOnly:d.historyOnly})}<span class="preview-label">${icon('file')}공개 내용 미리보기</span><div class="preview-title" id="preview-title">${h(d.title)}</div><p class="preview-period" id="preview-period">${period(d)}</p><p class="field-note" id="preview-author">${free?'자율 목표형':'출제 '+h(setterLabel({...d,setter:d.setter===account.id?'me':d.setter},MEMBERS))}</p><div class="preview-divider"></div><div id="preview-problems">${d.problems.map((p,i)=>`<div class="preview-problem"><span class="index">${String(i+1).padStart(2,'0')}</span><span>${h(p.title||'문제를 골라 주세요')}</span>${icon(p.url&&p.title?'circleCheck':'minus')}</div>`).join('')}</div><div class="preview-divider"></div><div class="row between"><span class="count-label" id="preview-count-label">${free?'개인별 목표':d.historyOnly?'입력한 문제':h(rulesLabel(rules))}</span><strong class="green" id="preview-count">${free?rules.problemCount+'문제':d.problems.filter(p=>p.url&&p.title).length+(d.historyOnly?'문제':' / '+rules.problemCount)}</strong></div><div class="notice" style="margin-top:22px">${icon('info')}<span id="round-mode-note">${d.historyOnly?'문제 목록만 보관하며 인증 통계와 잔디에는 포함하지 않습니다.':free?'기간 내 인증한 서로 다른 문제 수로 목표 달성을 확인합니다. 지각 인증은 목표 수에서 제외합니다.':'이번 회차에 다시 풀고 인증합니다.'}</span></div></aside></div></form>`,'register');
}
function readForm() {
  const f=document.querySelector('#round-form');if(!f)return editorDraft()||emptyDraft();
  const data=new FormData(f),editing=route().startsWith('edit/'),original=editing?editingOriginal:null;
  const historyOnly=editing?original.historyOnly:data.get('historyOnly')==='on';
  const setter=data.get('setter')||account.id;
  return {...(editing?{id:original.id,revision:original.revision}:{}),historyOnly,rulesRevision:activeStudy?.rulesRevision||0,deadlineTime:String(data.get('deadlineTime')||original?.deadlineTime||formRules().deadlineTime),...(historyOnly?{...(editing?(original.number>0?{number:original.number}:{}):data.get('number')?{number:Number(data.get('number'))}:{}),historyMeta:{...(editing?original.historyMeta||{}:{source:'manual'}),deadlineKnown:data.get('deadlineUnknown')!=='on',dateBased:editing?!!original.historyMeta?.dateBased:!data.get('number')}}:{}),title:String(data.get('title')||''),startDate:editing?original.startDate:String(data.get('startDate')||''),deadlineDate:historyOnly&&data.get('deadlineUnknown')==='on'?null:String(data.get('deadlineDate')||''),setter:setter==='by-name'?null:setter,setterName:setter==='by-name'?String(data.get('setterName')||''):null,problems:Array.from(f.querySelectorAll('.problem-input'),(_,i)=>{const p={platform:String(data.get('platform-'+i)),url:String(data.get('url-'+i)||''),title:String(data.get('name-'+i)||'')};try{const parsed=parseProblemURL(p.url,p.platform),old=original?.problems.find(x=>x.id===parsed.id),example=EXAMPLES.find(x=>x.id===parsed.id);return {...p,...parsed,difficulty:old?.difficulty||example?.difficulty,tag:old?.tag||example?.tag};}catch{return p;}})};
}
function updateFormPreview() {
  const d=readForm();formDirty=true;if(d.id)editingDraft={...editingOriginal,...d};
  const unknown=d.historyOnly&&d.historyMeta?.deadlineKnown===false,deadlineInput=document.querySelector('#deadlineDate');
  deadlineInput.disabled=unknown;deadlineInput.required=!unknown;
  const nameOnly=d.setter===null;document.querySelector('#setter-name-field')?.classList.toggle('hidden',!nameOnly);
  if(document.querySelector('#setterName'))document.querySelector('#setterName').required=nameOnly;
  document.querySelectorAll('.problem-input input[type="url"],.problem-input input[type="text"]').forEach(el=>el.required=!d.historyOnly);
  document.querySelectorAll('.problem-input .required').forEach(el=>el.classList.toggle('hidden',d.historyOnly));
  document.querySelector('#problem-entry-note').textContent=d.historyOnly?'당시 출제한 문제만 입력하세요. 나머지 칸은 비워 두세요.':formRules().mode==='free'?'각자 고른 문제를 기간 안에 인증합니다.':rulesLabel(formRules());
  document.querySelector('#preview-title').textContent=d.title||'새로운 회차';
  document.querySelector('#preview-author').textContent=(!d.historyOnly&&formRules().mode==='free')?'자율 목표형':'출제 '+(d.setter?MEMBERS.find(m=>(m.id==='me'?account.id:m.id)===d.setter)?.name||account.name:d.setterName||'이름을 입력해 주세요');
  document.querySelector('#preview-period').textContent=d.startDate&&(d.deadlineDate||unknown)?period(d):'날짜를 선택해 주세요';
  document.querySelector('#preview-problems').innerHTML=d.problems.map((p,i)=>`<div class="preview-problem"><span class="index">${String(i+1).padStart(2,'0')}</span><span>${h(p.title||'문제를 골라 주세요')}</span>${icon(p.title&&p.url?'circleCheck':'minus')}</div>`).join('');
  document.querySelector('#preview-count-label').textContent=d.historyOnly?'입력한 문제':formRules().mode==='free'?'개인별 목표':rulesLabel(formRules());
  document.querySelector('#preview-count').textContent=!d.historyOnly&&formRules().mode==='free'?formRules().problemCount+'문제':d.problems.filter(p=>p.title&&p.url).length+(d.historyOnly?'문제':' / '+formRules().problemCount);
}
function showFormErrors(errors) {
  document.querySelectorAll('#round-form .field-error').forEach(x=>x.textContent='');
  document.querySelectorAll('#round-form [aria-invalid]').forEach(x=>x.removeAttribute('aria-invalid'));
  document.querySelectorAll('#round-form .error').forEach(x=>x.classList.remove('error'));
  const banner=document.querySelector('#form-errors');banner.textContent=Object.values(errors).join(' ');banner.classList.remove('hidden');
  for(const [key,message] of Object.entries(errors)){const field=document.querySelector(`[data-field="${key}"]`);field?.classList.add('error');const el=document.getElementById(key+'-error');if(el)el.textContent=message;field?.querySelector('input,select')?.setAttribute('aria-invalid','true');}
  const first=document.querySelector('#round-form [aria-invalid="true"]');first?.focus();(first||banner).scrollIntoView({block:'center',behavior:'smooth'});
}
function completedBanner(p) {
  const c = certificate(p); if (!c) return '';
  return `<div class="completed-banner">${icon('circleCheck')}<div><strong>${c.example ? '예시 ' : ''}${c.method === 'photo' ? '사진' : 'GitHub'} 인증을 완료했어요${!isOnTime(c.at, round()) ? ' (지각)' : ''}</strong><p>${dateTime(c.at)}<br>${h(c.note || '이 '+modeNoun(round())+'에 제출한 풀이입니다.')}</p></div></div>`;
}
function githubPanel(p) {
  const linked=repositories.find(r=>r.platform===p.platform);
  const c=certificate(p);
  return `<h2>GitHub 자동 인증</h2><p class="intro">연결한 저장소의 새 코드와 문제 링크를 확인합니다. ${isFree(round())?'목표 기간과 플랫폼 조건에 맞는 풀이를 반영합니다.':'출제 목록과 일치하는 풀이를 반영합니다.'}</p>${linked ? `<div class="repository"><div class="row between"><span class="repo-name">${icon('github')}${h(linked.full_name)}</span><span class="pill success">연결됨 (${linked.private ? '비공개' : '공개'})</span></div><p>대상 브랜치 ${h(linked.branch)}, ${platform(p.platform)}</p></div>${linked.sync_error?`<div class="notice yellow">${h(linked.sync_error)}</div>`:''}<div class="row between"><span class="muted">${linked.checked_at?'최근 확인 '+dateTime(linked.checked_at):'연결 후 첫 확인을 기다리고 있어요.'}</span><button class="btn" data-action="sync" ${githubBusy?'disabled':''}>${icon('refresh')}지금 확인</button></div>${c?.method==='github'?`<div class="repo-result"><h3>${icon('circleCheck')}${modeNoun(round())}의 새 풀이를 확인했습니다.</h3><p>${h(c.path || '')}</p><a href="${h(c.url)}" class="text-button" target="_blank" rel="noopener noreferrer">인증한 커밋 보기 ${icon('external')}</a></div>`:''}` : `<div class="notice">${icon('github')}<span>${platform(p.platform)} 풀이 저장소를 먼저 연결해 주세요.<br>선택한 저장소의 읽기 권한만 사용해요.</span></div><a href="#connect" class="btn primary">저장소 연결하기 ${icon('arrow')}</a>`}<p class="verify-hint">${isFree(round())?'기간 안에 푼 서로 다른 문제로 집계합니다.':'이번 회차에 출제된 문제만 집계합니다.'} 문서나 통계만 바꾼 커밋과 병합 커밋은 제외합니다. 새 코드 변경이 없는 경우 사진으로 제출할 수 있습니다.</p>`;
}
function photoPanel(p) {
 const c=certificate(p),submission=photoSubmission(state,round().id,'me',p.id),assessment=photoDraft?.assessment;
 const submitted=submission?`<div class="notice ${submission.status==='approved'?'':'yellow'} photo-submission-note"><div><strong>${h(photoStatus(submission))}</strong><p>${h(submission.reviewNote||submission.assessment.reason)}</p><button class="text-button" type="button" data-action="review-photo" data-submission="${h(submission.id)}">제출 사진과 확인 결과 보기 ${icon('chevron')}</button></div></div>`:'';
 const ocr=photoDraft?photoBusy?`<div class="ocr-result" aria-live="polite"><strong id="ocr-progress">${h(photoDraft.ocrProgress)}</strong><p>밝기를 보정한 뒤 문제 이름, 주소, 통과 결과를 확대해 읽습니다.</p><button class="text-button" type="button" data-action="stop-ocr">인식을 중지하고 팀원에게 확인 요청</button></div>`:`<div class="ocr-result ${assessment?.verdict==='match'?'matched':'needs-review'}" aria-live="polite"><strong>${assessment?.verdict==='match'?'문제와 최종 통과 문구 확인':'팀원 확인이 필요해요'}</strong><p>${h(assessment?.reason||'사진을 제출하면 다른 팀원이 확인합니다.')}</p><details><summary>인식한 글자 보기</summary><pre>${h(photoDraft.ocr.text||'인식한 글자가 없습니다.')}</pre></details></div>`:'';
 return `<div class="method-heading"><h2>사진 제출</h2><p>문제 이름과 최종 통과 결과가 보이는 캡처를 첨부하세요.</p></div>${submitted}${c?.photoId?'<div id="saved-photo" style="margin-bottom:18px"></div>':''}<form id="photo-form" novalidate><div id="upload-content">${photoDraft?`<div class="photo-preview"><img src="${photoDraft.url}" alt="선택한 풀이 인증 사진"><button class="icon-button remove-photo" type="button" data-action="remove-photo" aria-label="선택한 사진 제거">${icon('x')}</button></div><div class="photo-meta"><span>${h(photoDraft.name)}</span><span>${Math.round(photoDraft.blob.size/1024)}KB (저장할 사진)</span></div>`:`<label class="upload-zone" id="drop-zone" for="photo-file"><span class="upload-icon">${icon('upload')}</span><strong>${photoBusy?'사진을 준비하고 있어요…':'사진을 놓거나 눌러서 첨부하세요'}</strong><p>JPG, PNG 또는 WEBP 1장 (최대 5MB)</p><input type="file" accept="image/jpeg,image/png,image/webp" id="photo-file" aria-label="인증 사진 선택" ${photoBusy?'disabled':''}></label><p class="field-note" style="margin-top:9px">OCR은 이 기기에서 처리합니다. 제출한 사진과 인식 결과는 팀원에게 공유됩니다.</p>`}</div>${ocr}<p class="field-error" id="photo-error" role="alert"></p><div class="field" style="margin-top:21px"><label for="photo-note">풀이 메모 <span class="muted" style="font-weight:400">선택</span></label><textarea id="photo-note" name="note" class="input" rows="3" maxlength="500" placeholder="어떤 접근으로 풀었나요?">${h(photoFormState.note)}</textarea></div><label class="checkbox"><input type="checkbox" name="confirmed" ${photoFormState.confirmed?'checked':''}><span>이 ${modeNoun(round())}에 직접 다시 풀고 제출한 결과입니다.</span></label>${c?'<p class="field-note" style="margin-top:8px">확인 대기나 반려 상태의 새 사진은 기존 인증을 변경하지 않습니다. GitHub 인증은 유지됩니다.</p>':''}<div class="verify-actions"><a class="btn" href="#home">현황으로 돌아가기</a><button class="btn primary" type="submit" id="submit-photo" ${!photoDraft||!photoFormState.confirmed||photoBusy?'disabled':''}>${icon('check')}${assessment?.verdict==='match'?'사진으로 인증하기':'팀원 확인 요청'}</button></div><p class="verify-hint">문제 정보와 통과 문구를 대조하고, 불분명한 사진은 팀원이 확인합니다. 확인 대기 중에는 인증 수에 포함하지 않습니다. 사진은 90일간 보관합니다.</p></form>`;
}

function captureFreeProblem(){
 const form=document.querySelector('#free-problem-form');if(!form)return;
 freeProblemDraft={roundId:round()?.id,platform:form.elements.platform.value,url:form.elements.url.value,title:form.elements.title.value};
}
function freeEntry(){
 const r=round(),rules=rulesOf(r),platforms=['leetcode','programmers'].filter(p=>rules.platform==='all'||rules.platform===p);
 if(freeProblemDraft.roundId!==r.id)freeProblemDraft={roundId:r.id,platform:platforms[0],url:'',title:''};
 const target=goalCount(r),mine=memberCount(state,r,'me'),early=kstDate()<r.startDate;
 const github=`<div class="method-heading"><h2>GitHub 자동 확인</h2><p>연결한 저장소에 올린 새 풀이를 목표 기간과 대조합니다.</p></div><div class="auth-repository-list">${platforms.map(kind=>{const linked=repositories.find(repo=>repo.platform===kind);return `<div class="auth-repository-row">${platformIcon(kind)}<div><strong>${platform(kind)}</strong><p>${linked?h(linked.full_name):'저장소 연결 전'}</p></div><span class="pill ${linked?'success':''}">${linked?'연결됨':'미연결'}</span></div>`;}).join('')}</div><div class="verify-actions"><a class="btn" href="#connect">저장소 설정</a>${repositories.some(repo=>platforms.includes(repo.platform))?`<button class="btn primary" data-action="sync" ${githubBusy?'disabled':''}>${icon('refresh')}기록 확인하기</button>`:'<a class="btn primary" href="#connect">풀이 저장소 연결하기 →</a>'}</div><p class="verify-hint">${h(rulesLabel(rules))}. 같은 문제는 한 기간에 한 번만 집계합니다.</p>`;
 const photo=`<div class="method-heading"><h2>사진으로 인증할 문제</h2><p>문제 정보를 입력한 다음, 최종 통과 결과가 보이는 사진을 첨부합니다.</p></div><ol class="verification-steps" aria-label="사진 인증 순서"><li aria-current="step"><b>1</b>문제 정보</li><li><b>2</b>사진 제출</li><li><b>3</b>인증 확인</li></ol><form id="free-problem-form"><div class="field"><label for="free-platform">플랫폼</label><select class="input" id="free-platform" name="platform">${platforms.map(kind=>`<option value="${kind}" ${freeProblemDraft.platform===kind?'selected':''}>${platform(kind)}</option>`).join('')}</select></div>${field('문제 링크','url',freeProblemDraft.url,'url','','https://…')}${field('문제 제목','title',freeProblemDraft.title,'text','','문제 제목')}<p class="field-error" id="free-problem-error" role="alert"></p><div class="verify-actions"><a class="btn" href="#home">목표 현황으로</a><button class="btn primary" type="submit">사진 첨부로 계속 ${icon('arrow')}</button></div></form>`;
 return shell(`${workspaceHeading({title:'풀이 인증',kicker:r.title,mode:r,description:'GitHub 자동 확인 또는 사진 제출로 풀이를 인증합니다.',context:periodContext(r),back:'<a href="#home" class="back-link">← 목표 현황으로 돌아가기</a>'})}<div class="verify-layout verification-workspace"><aside class="verify-menu goal-verify-menu"><h2>내 목표</h2><div class="verify-goal-count"><strong>${mine}</strong><span>/ ${target}문제</span></div><progress max="${target}" value="${Math.min(target,mine)}" aria-label="내 목표 ${mine}/${target}"></progress><p>${Math.max(0,target-mine)}문제 남음</p><div class="rail-rule">${h(rulesLabel(rules))}</div><a class="text-button" href="#home">팀원 현황 보기 →</a></aside><section class="verify-card">${early?`<div class="notice">${r.startDate}부터 인증을 시작할 수 있습니다.</div>`:`${methodTabs(method,icon)}<div role="tabpanel" id="method-panel" aria-labelledby="${method}-tab">${method==='github'?github:photo}</div>`}</section></div>`,'verify');
}
function verify() {
 const p=currentProblem();if(!p)return isFree(round())?freeEntry():emptyHome();
 if(photoFormState.problemId!==p.id){resetPhoto();photoFormState.problemId=p.id;candidate=null;}
 const r=round(),free=isFree(r),early=kstDate()<r.startDate;
 const menu=r.problems.map((x,i)=>{const proof=certificate(x),submission=photoSubmission(state,r.id,'me',x.id),label=proof?'인증 완료':submission?.status==='pending'?'사진 확인 대기':'미인증';return `<a href="#verify/${h(x.id)}" class="verify-problem ${x.id===p.id?'active':''}" ${x.id===p.id?'aria-current="page"':''}><span class="verify-problem-number">${String(i+1).padStart(2,'0')}</span><span class="v-title">${h(x.title)}<small>${platform(x.platform)} (${label})</small></span>${icon(proof?'circleCheck':submission?.status==='pending'?'clock':'chevron')}</a>`;}).join('');
 return shell(`${workspaceHeading({title:p.title,kicker:'풀이 인증',mode:r,description:platform(p.platform)+', '+p.difficulty+', '+p.tag,context:periodContext(r),actions:`<a class="btn" href="${h(p.url)}" target="_blank" rel="noopener noreferrer">문제 풀러 가기 ${icon('external')}</a>`,back:`<a href="#home" class="back-link">← ${free?'목표':'문제'} 현황으로 돌아가기</a>`})}<div class="verify-layout verification-workspace"><aside class="verify-menu"><div class="rail-heading"><h2>${free?'등록한 문제':'출제 문제'}</h2><span>${r.problems.length}</span></div><nav class="verify-problem-list" aria-label="인증할 문제 선택">${menu}</nav>${free?'<a class="btn rail-add-problem" href="#verify">다른 문제 인증하기 +</a>':''}</aside><section class="verify-card">${completedBanner(p)}${early?`<div class="notice yellow">${r.startDate}부터 인증할 수 있습니다.</div>`:`${Date.now()>=+deadlineExclusive(r)?`<div class="notice yellow deadline-notice">${free?'목표 기간이 마감됐습니다. 지각 인증은 기록에 남으며 목표 수에서는 제외됩니다.':'이 회차는 마감됐습니다. 지금 제출하면 지각 인증으로 표시됩니다.'}</div>`:''}${methodTabs(method,icon)}<div role="tabpanel" id="method-panel" aria-labelledby="${method}-tab">${method==='github'?githubPanel(p):photoPanel(p)}</div>`}</section></div>`,'verify');
}
async function loadJoinInfo(force=false){
 const token=joinToken();
 if(!force&&joinState.token===token&&(joinState.loaded||joinState.loading))return;
 const requestState={token,loaded:false,loading:true,error:''},epoch=authEpoch;joinState=requestState;
 if(force)render();
 try{
  if(token)Object.assign(requestState,await api('/api/invites/check',{method:'POST',body:JSON.stringify({token})}));
  else requestState.error=inviteMessages.INVITE_UNAVAILABLE;
 }catch(error){requestState.error=error.message;requestState.retryable=error.status!==410;}
 finally{requestState.loaded=true;requestState.loading=false;if(epoch===authEpoch&&joinState===requestState&&route().startsWith('join/'))render();}
}
function joinGate(){
 const heading=loginHeading('스터디에 참여');
 const back=`<a class="login-back text-button" href="${account?'#studies':'/#home'}">${account?'내 스터디로 돌아가기':'로그인으로 돌아가기'}</a>`;
 const options={label:'스터디 초대',invite:true};
 if(joinState.loading||!joinState.loaded){
  return loginLayout(heading+'<p class="login-feedback" role="status">초대 링크를 확인하고 있습니다.</p>',options);
 }
 if(joinState.error){
  const retry=joinState.retryable?'<button class="login-submit" data-action="retry-invite">다시 확인</button>':'';
  return loginLayout(heading+`<p class="login-feedback" role="alert">${h(joinState.error)}</p>`+retry+back,options);
 }
 const {studyId,studyName,mode,memberCount,limit,expiresAt}=joinState;
 const aside=`<span class="login-kicker">초대받은 스터디</span>
  <h2>${h(studyName)}</h2>
  <dl class="login-invite-details">
   <div><dt>운영 방식</dt><dd>${mode==='free'?'자율 목표형':'공통 문제형'}</dd></div>
   <div><dt>참여 인원</dt><dd>${h(memberCount)} / ${h(limit)}명</dd></div>
   <div><dt>초대 만료</dt><dd><time datetime="${new Date(expiresAt).toISOString()}">${h(dateTime(expiresAt))}</time> (한국 시간)</dd></div>
  </dl>`;
 let content;
 if(account&&STUDIES.some(study=>study.id===studyId)){
  content=`<p class="login-feedback">이미 참여 중인 스터디입니다.</p>
   <button class="login-submit" data-action="select-study" data-study="${h(studyId)}">스터디로 이동</button>`;
 }else if(joinState.full){
  content='<p class="login-feedback" role="status">스터디 정원이 모두 찼어요. 운영자에게 참여 가능 여부를 확인해 주세요.</p>';
 }else if(account){
  content=`<p class="login-account">GitHub <strong>@${h(account.login)}</strong></p>
   <button class="login-submit" data-action="join-study">이 계정으로 참여하기</button>`;
 }else{
  content='<p class="login-description">GitHub로 로그인하면 이 스터디의 멤버로 등록됩니다.</p>'
   + githubLoginForm({icon,invite:joinState.token});
 }
 const canJoin=!joinState.full&&!STUDIES.some(study=>study.id===studyId);
 const note=canJoin?'<p class="login-note">참여 후 풀이 저장소를 연결할 수 있어요. 연결 전에도 사진 인증을 사용할 수 있습니다.</p>':'';
 return loginLayout(heading+content+note+back,{...options,aside});
}
async function loadInviteInfo(){
 if(account?.role!=='owner'||inviteState.busy)return;
 const epoch=authEpoch;inviteState.busy=true;
 try{const data=await api('/api/invites');if(epoch===authEpoch){inviteState.data=data;inviteState.error='';}}
 catch(error){if(epoch===authEpoch)inviteState.error=error.message;}
 finally{if(epoch===authEpoch){inviteState.loaded=true;inviteState.busy=false;if(route()==='connect')render();}}
}
async function rotateInviteLink(){
 if(account?.role!=='owner'||inviteState.busy||!inviteState.loaded)return;
 const epoch=authEpoch,revision=inviteState.data?.revision??0;inviteState.busy=true;render();
 try{const data=await api('/api/invites',{method:'POST',body:JSON.stringify({revision})});if(epoch===authEpoch){inviteState.data=data;inviteState.error='';toast(revision?'새 링크를 만들었어요. 이전 초대 링크는 만료됐습니다.':'초대 링크를 만들었어요. 링크를 복사해 팀원에게 보내 주세요.');}}
 catch(error){if(epoch===authEpoch){inviteState.error=error.message;inviteState.loaded=false;}}
 finally{if(epoch===authEpoch){inviteState.busy=false;render();}}
}
async function copyInviteLink(){
 const epoch=authEpoch,data=await api('/api/invites');if(epoch!==authEpoch||account?.role!=='owner')return;
 inviteState={loaded:true,busy:false,error:'',data};
 if(!data.active||!data.url){render();throw new Error('초대 링크가 만료됐어요. 새 링크를 만들어 주세요.');}
 if(data.memberCount>=data.limit){render();throw new Error('스터디 정원이 모두 찼어요.');}
 try{await navigator.clipboard.writeText(data.url);toast('초대 링크를 복사했어요. 팀원 카톡방에 붙여넣어 주세요.');}
 catch{openDialog('팀원 초대 링크','<p>아래 주소를 복사해 팀원에게 보내 주세요. 링크는 발급 후 7일 동안 사용할 수 있습니다.</p><input class="input" readonly aria-label="복사할 초대 링크" value="'+h(data.url)+'" style="margin-top:16px">','<button class="btn primary" data-action="close-dialog">닫기</button>');}
 if(route()==='connect')render();
}
function inviteSettings(){
 const {data,busy,error,loaded}=inviteState;
 let content=!loaded?'<p class="field-note" role="status">초대 링크를 불러오는 중입니다.</p>':error?`<p class="field-error" role="alert">${h(error)}</p><button class="btn" data-action="load-invite">다시 확인</button>`:data?.active?`<div class="field"><label for="study-invite-link">팀원 초대 주소</label><input class="input" id="study-invite-link" readonly value="${h(data.url)}"></div><div class="invite-actions"><button class="btn primary" data-action="copy-invite" ${busy||data.memberCount>=data.limit?'disabled':''}>${icon('copy')}링크 복사</button><button class="btn" data-action="rotate-invite" ${busy?'disabled':''}>새 링크 발급</button></div><p class="field-note">${dateTime(data.expiresAt)}까지 유효 (한국 시간)<br>새로 발급하면 이전 링크는 만료되고, 이미 참여한 멤버는 유지됩니다.</p>`:`<button class="btn primary" data-action="rotate-invite" ${busy||MEMBERS.length>=(activeStudy?.capacity||5)?'disabled':''}>${icon('plus')}${busy?'발급 중…':data?.revision?'새 초대 링크 만들기':'초대 링크 만들기'}</button><p class="field-note">발급 후 7일간 사용할 수 있습니다.</p>`;
 return `<div class="settings-invite"><h3>초대 링크로 참여</h3><p class="field-note">아이디를 미리 등록하지 않아도 링크를 받은 사람이 GitHub로 로그인하면 참여할 수 있습니다.</p>${MEMBERS.length>=(activeStudy?.capacity||5)?'<p class="notice invite-capacity">스터디 정원이 모두 찼습니다.</p>':''}${content}</div>`;
}
function gate() {
 if(booting){
  return loginLayout(loginHeading('로그인 확인 중')+`<p class="login-loading" role="status">${icon('refresh','spinner')}스터디 정보를 불러오고 있습니다.</p>`);
 }
 if(bootError){
  return loginLayout(loginHeading('연결을 확인해 주세요')+`<p class="login-feedback" role="alert">${h(bootError)}</p>
   <button class="login-submit" data-action="retry">다시 확인</button>`);
 }
 if(!serviceStatus?.configured){
  return loginLayout(loginHeading('서비스 초기 설정','서버에서 지정한 운영자 계정으로 GitHub 앱을 등록해 주세요.')+`
   <p class="login-feedback">직접 선택한 풀이 저장소의 읽기 권한을 요청합니다.</p>
   <form method="post" action="/setup/start">
    <button class="login-submit" type="submit">${icon('github')}<span data-login-label>GitHub 앱 등록하기</span></button>
    <p class="sr-only" data-login-progress role="status"></p>
   </form>`,{label:'운영자 초기 설정'});
 }
 if(route().startsWith('join/'))return joinGate();
 const aside=`<span class="login-kicker">코딩테스트 스터디</span>
  <h2>스터디 문제와 인증 관리</h2>
  <p class="login-intro-copy">문제를 등록하고 GitHub 기록이나 사진으로 풀이를 인증하세요.</p>
  <dl class="login-modes">
   <div><dt>공통 문제형</dt><dd>회차마다 정한 문제를 함께 풉니다.</dd></div>
   <div><dt>자율 목표형</dt><dd>각자 고른 문제를 풀고 목표를 채웁니다.</dd></div>
  </dl>
  <p class="login-intro-note">팀원 인증 현황과 인증한 풀이 공유</p>`;
 const notice=authNotice?`<p class="login-feedback" role="status">${h(authNotice)}</p>`:'';
 const content=loginHeading('스터디에 로그인','GitHub 계정으로 스터디를 만들거나 참여하세요.')+notice
  +githubLoginForm({icon,next:'/#'+route()})
  +`<div class="login-note"><p>사진 인증만 이용할 경우 풀이 저장소를 연결하지 않아도 됩니다.</p><p>초대받으셨다면 받은 링크를 열어 주세요.</p></div>`;
 return loginLayout(content,{aside});
}

function emptyHome(){return shell(emptyDashboard({state,members:MEMBERS,icon,avatar,dailyDays,dailyMember,canEdit:account.role==='owner'}),'home');}
function connect(){
 const repoForms=['leetcode','programmers'].map(p=>{
  const r=repositories.find(r=>r.platform===p);
  return `<form class="repo-form" data-platform="${p}" aria-labelledby="repo-title-${p}">
   <div class="repo-form-heading"><div class="row">${platformIcon(p)}<h3 id="repo-title-${p}">${platform(p)}</h3></div><span class="pill ${r?'success':''}">${r?'연결됨':'연결 전'}</span></div>
   ${r?`<div class="repo-detail"><p class="repo-connected">${icon('github')}<span>${h(r.full_name)}</span></p><p class="repo-meta">브랜치 ${h(r.branch)} (${r.private?'비공개 저장소':'공개 저장소'})</p>${r.sync_error?`<p class="field-error repo-error" role="status">${h(r.sync_error)}</p>`:''}</div>`:'<p class="repo-empty">자동 인증에 사용할 풀이 저장소를 선택해 주세요.</p>'}
   <div class="field"><label for="repo-${p}">풀이 저장소</label><select class="input" id="repo-${p}" name="repo" required><option value="">저장소를 선택해 주세요</option>${availableRepos.map((repo,i)=>`<option value="${i}">${h(repo.fullName)}${repo.private?' (비공개)':''}</option>`).join('')}</select></div>
   <div class="repo-actions"><button class="btn primary" ${availableRepos.length?'':'disabled'}>연결 저장</button>${r?`<button type="button" class="btn" data-action="disconnect" data-platform="${p}">연결 해제</button>`:''}</div>
  </form>`;
 }).join('');
 return shell(`<div class="page-heading"><div><h1>저장소 및 멤버 설정</h1><p>내 계정의 풀이 저장소와 선택한 스터디의 멤버를 관리합니다.</p></div><button class="btn" data-action="logout">로그아웃</button></div>
  <section class="settings-panel study-rules-summary"><div><h2>운영 규칙</h2><p>${h(rulesLabel(activeStudy.rules))}, ${h(scheduleLabel(activeStudy.rules))}</p></div><a class="btn" href="#study-settings">${account.role==='owner'?'운영 규칙 설정':'운영 규칙 보기'}</a></section><div class="connection-layout">
   <section class="settings-panel settings-repositories" aria-labelledby="repositories-title">
    <div class="form-heading"><div><h2 id="repositories-title">나의 풀이 저장소</h2><p>GitHub 앱에서 선택한 저장소를 플랫폼별로 연결합니다.</p></div></div>
    <div class="settings-repo-tools">${installURL?`<a class="btn" href="${h(installURL)}" target="_blank" rel="noopener noreferrer">${icon('github')}GitHub 저장소 권한 선택 ${icon('external')}</a>`:''}<button class="btn" data-action="load-repos">${icon('refresh')}저장소 목록 새로고침</button></div>
    <p class="field-note settings-access-note">저장소 연결은 내 계정에 적용되며 참여 중인 스터디의 출제 문제를 확인합니다. 앱 설치 화면에서 <strong>Only select repositories</strong>를 선택해 주세요. 선택한 저장소의 코드, README, 커밋만 읽습니다.</p>
    <div class="notice settings-cert-note">${icon('info')}<span><strong>회차와 목표 기간의 규칙에 맞는 새 풀이를 자동 인증합니다.</strong><br>공통 문제형은 출제 목록과 비교하고, 자율 목표형은 기간과 플랫폼 조건을 확인합니다. 코드와 메모는 풀이 공유에서 작성자가 선택해 저장한 내용만 팀원에게 공개됩니다.</span></div>
    ${repoForms}
    <div class="settings-sync"><p class="field-note">새 풀이를 자동으로 확인하며,<br>필요하면 지금 기록을 확인할 수 있습니다.</p><button class="btn" data-action="sync">${icon('refresh')}연결한 기록 지금 확인</button></div>
   </section>
   <aside class="settings-sidebar">
    <section class="settings-panel settings-members" aria-labelledby="settings-members-title">
     <div class="section-head"><h2 id="settings-members-title">스터디 멤버 <span>${MEMBERS.length} / ${activeStudy?.capacity||5}</span></h2></div>
     <div class="member-list">${MEMBERS.map(m=>`<div class="member-entry">${avatar(m)}<div class="member-identity"><strong>${h(m.name)}</strong><p>@${h(m.login)}</p></div><span class="member-role">${m.role==='owner'?'운영자':m.joined_at?'참여 중':'초대됨'}</span></div>`).join('')}</div>
     ${account.role==='owner'?`${inviteSettings()}<details class="manual-member-invite"><summary>GitHub 아이디로 직접 등록 ${icon('down')}</summary><form id="member-form"><label for="invite-login">초대할 GitHub 아이디</label><div class="member-invite-row"><input class="input" id="invite-login" name="login" required maxlength="39" placeholder="예: octocat"><button class="btn primary" ${MEMBERS.length>=(activeStudy?.capacity||5)?'disabled':''}>멤버 등록</button></div><p class="field-note">등록한 GitHub 아이디로 로그인하면 참여할 수 있습니다.</p></form></details>`:'<p class="field-note settings-member-note">멤버 초대는 운영자에게 요청해 주세요.</p>'}
    </section>
    <section class="settings-panel settings-retention"><h2>사진 보관 안내</h2><p>인증 사진은 350KB 이하로 압축해 90일간 보관합니다. 사진이 정리된 뒤에도 인증 여부와 메모는 남습니다.</p><p class="field-note">사진 저장 한도 100MB (자동 유료 전환 없음)</p></section>
   </aside>
  </div>`, 'connect');
}
function render() {
  renderEpoch++; imageURLs.forEach(URL.revokeObjectURL); imageURLs=[];
  const r=route(),invited=r.startsWith('join/');
  if (booting || bootError || !account || invited) {
    if(!booting&&!bootError&&serviceStatus?.configured&&invited)void loadJoinInfo();
    const title=booting?'불러오는 중':bootError?'연결 오류':!serviceStatus?.configured?'초기 설정':invited?'스터디 참여':'로그인';
    document.title=title+' | 금귤';
    app.innerHTML=gate();
    return;
  }
  if(r==='studies'||r==='new-study'||!activeStudyId){app.innerHTML=shell(r==='new-study'?createStudyForm():studyList(STUDIES,activeStudyId),'studies');document.title=(r==='new-study'?'스터디 만들기':'내 스터디')+' | 금귤';return;}
  app.innerHTML=r.startsWith('solutions/')&&round()&&!round().historyOnly&&currentProblem()?shell(solutionPage({state,round:round(),problem:currentProblem(),members:MEMBERS,draft:solutionDraft(),icon,avatar}),'home','solutions'):r==='study-settings'?shell(studyRulesPage(activeStudy,account.role==='owner'),'connect'):r==='verify'&&isFree(round())?freeEntry():r==='connect'?connect():(r==='register'||r.startsWith('edit/'))?register():r.startsWith('verify/')&&round()&&!round().historyOnly?verify():round()?home():emptyHome();
  if(r==='connect'&&account.role==='owner'&&!inviteState.loaded&&!inviteState.busy)void loadInviteInfo();
  if(app.querySelector('#round-form')){const unknown=!!app.querySelector('#deadline-unknown')?.checked;app.querySelector('#deadlineDate').disabled=unknown;app.querySelector('#deadlineDate').required=!unknown;if(r.startsWith('edit/'))app.querySelector('#startDate').disabled=true;}
  const history=app.querySelector('.contribution-scroll');
  if(history){const selected=history.querySelector('.contribution-square.selected-round');history.scrollLeft=selected?Math.max(0,selected.getBoundingClientRect().left-history.getBoundingClientRect().left-history.clientWidth/2+selected.offsetWidth/2):history.scrollWidth;}
  app.querySelectorAll('.daily-scroll').forEach(calendar=>{calendar.scrollLeft=calendar.scrollWidth;});
  const problemRail=app.querySelector('.verify-problem-list'),selectedProblem=problemRail?.querySelector('[aria-current="page"]');if(selectedProblem&&problemRail.scrollWidth>problemRail.clientWidth)problemRail.scrollLeft+=selectedProblem.getBoundingClientRect().left-problemRail.getBoundingClientRect().left-(problemRail.clientWidth-selectedProblem.offsetWidth)/2;
  document.title=`${r.startsWith('solutions/')?'풀이 공유':r==='study-settings'?'스터디 운영 규칙':r==='verify'?'자율 문제 인증':r==='connect'?'저장소 연결':r.startsWith('edit/')?'회차 수정':r==='register'?(formRules().mode==='free'?'목표 기간 등록':'문제 등록'):r.startsWith('verify/')&&currentProblem()?currentProblem().title+' 인증':round()?.historyOnly?roundLabel(round())+' 문제 기록':'이번 회차'} | 금귤`;
  if(r.startsWith('solutions/')&&round()&&!round().historyOnly&&currentProblem()&&certificate(currentProblem()))void loadSolutionDraft();
  if(r.startsWith('verify/')&&method==='photo'&&round())loadSavedPhoto();
}
function loadSavedPhoto() {
  const c = certificate(currentProblem()); const epoch = renderEpoch;
  if (!c?.photoId) return;
  readPhoto(c.photoId).then(blob => { if (!blob || epoch !== renderEpoch) return; const container = document.querySelector('#saved-photo'); if (!container) return; const url = URL.createObjectURL(blob); imageURLs.push(url); container.innerHTML = `<p class="field-note" style="margin-bottom:8px">저장한 인증 사진</p><div class="photo-preview"><img src="${url}" alt="저장된 풀이 인증 사진"></div>`; }).catch(() => { const el = document.querySelector('#saved-photo'); if (el) el.textContent = '사진 보관 기간이 지났거나 사진을 불러올 수 없어요.'; });
}
async function readPhoto(id) { const response=await fetch('/api/photos/'+encodeURIComponent(id),{cache:'no-store',headers:{'X-Puli-Study':activeStudyId}}); if(response.status===401){clearAccount('로그인이 만료됐어요. 다시 로그인해 주세요.');render();} if(!response.ok)throw new Error('사진 보관 기간이 지났거나 사진을 불러올 수 없어요.');return response.blob(); }
async function compressImage(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('JPG, PNG, WEBP 사진만 첨부할 수 있어요.');
  if (file.size > 5 * 1024 * 1024) throw new Error('5MB 이하의 사진을 선택해 주세요.');
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width * bitmap.height > 40000000) throw new Error('사진 해상도가 너무 커요. 크기를 줄여 다시 첨부해 주세요.');
    let scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas'); let blob;
    for (let attempt = 0; attempt < 7; attempt++) {
      canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', Math.max(.6, .88 - attempt * .04)));
      if (!blob) throw new Error('사진을 준비하지 못했어요. 다른 파일을 선택해 주세요.');
      if (blob.size <= 350 * 1024) return blob;
      scale *= .86;
    }
    throw new Error('저장할 사진 용량이 커요. 화면을 잘라 다시 첨부해 주세요.');
  } finally { bitmap.close(); }
}
async function selectPhoto(file) {
  if (!file) return;
  capturePhotoForm();photoOCRController?.abort();const controller=new AbortController();photoOCRController=controller; const epoch = ++photoEpoch; photoBusy = true; render();
  try {
   const blob = await compressImage(file); if (epoch !== photoEpoch) return;
   if (photoDraft?.url) URL.revokeObjectURL(photoDraft.url);
   photoDraft = { blob, name: file.name, url: URL.createObjectURL(blob),ocrStatus:'running',ocrProgress:'글자 인식 준비 중',ocr:{engine:'unavailable',text:'',confidence:0} };render();
   try {const ocr=await recognizePhoto(file,{signal:controller.signal,problem:currentProblem(),assigned:round().problems,onProgress:message=>{if(epoch===photoEpoch&&photoDraft){photoDraft.ocrProgress=message;const el=document.querySelector('#ocr-progress');if(el)el.textContent=message;}}});if(epoch!==photoEpoch||controller.signal.aborted)return;photoDraft.ocr=ocr;}
   catch {if(epoch!==photoEpoch||controller.signal.aborted)return;}
   if(epoch!==photoEpoch)return;photoDraft.ocrStatus='done';photoDraft.assessment=assessPhotoOCR(currentProblem(),photoDraft.ocr,round().problems);photoBusy=false;render();
  }
  catch (error) { if (epoch !== photoEpoch) return; photoBusy = false; render(); const el = document.querySelector('#photo-error'); if (el) el.textContent = error.message || '사진을 읽을 수 없어요. 파일을 확인해 주세요.'; }
}
async function loadSolutionDraft(){
 const draft=solutionDraft(),key=solutionKey(),epoch=authEpoch;if(draft.loaded||draft.loading||draft.error)return;draft.loading=true;
 try{const result=await api('/api/solution-shares?'+new URLSearchParams({round:round().id,problem:currentProblem().id}));if(epoch!==authEpoch)return;Object.assign(draft,result.share||{code:'',note:'',language:'',revision:0,shared:false},{loaded:true,loading:false,consent:false});}
 catch(e){draft.loading=false;draft.error=e.message;}
 if(epoch===authEpoch&&route().startsWith('solutions/')&&key===solutionKey())render();
}
async function importSolutionCode(){
 const draft=solutionDraft(),key=solutionKey(),epoch=authEpoch;draft.busy=true;draft.error='';render();
 try{const result=await api('/api/solution-code?'+new URLSearchParams({round:round().id,problem:currentProblem().id}));if(epoch!==authEpoch)return;draft.code=result.code;draft.language=result.language;draft.dirty=true;draft.consent=false;toast('인증한 코드를 불러왔어요. 내용을 확인한 뒤 공유해 주세요.');}
 catch(e){draft.error=e.message;}finally{draft.busy=false;if(epoch===authEpoch&&key===solutionKey())render();}
}
async function persistSolution(shared){
 const draft=solutionDraft(),key=solutionKey(),epoch=authEpoch;if(draft.busy)return;
 const payload={round:round().id,problem:currentProblem().id,revision:draft.revision,shared,...(shared?{code:draft.code,note:draft.note,language:draft.language,consent:!!draft.consent}:{})};draft.busy=true;draft.error='';render();
 try{const result=await api('/api/solution-shares',{method:'POST',body:JSON.stringify(payload)});if(epoch!==authEpoch)return;Object.assign(draft,result.share,{loaded:true,dirty:false,consent:false});await reloadState();toast(shared?'코드와 메모를 팀원에게 공유했어요.':'공유를 중지했어요. 팀원은 이 풀이를 볼 수 없습니다.');}
 catch(e){draft.error=e.message;}finally{draft.busy=false;if(epoch===authEpoch&&key===solutionKey())render();}
}
async function readSolution(button){
 const epoch=authEpoch,key=solutionKey(),member=button.dataset.member,problem=button.dataset.problem;button.disabled=true;
 try{const result=await api('/api/solution-shares?'+new URLSearchParams({round:round().id,problem,member:member==='me'?account.id:member}));if(epoch!==authEpoch||key!==solutionKey())return;if(!result.share)throw new Error('공유 중인 풀이가 없어요.');openDialog(h((MEMBERS.find(m=>m.id===member)?.name||'팀원')+'님의 풀이'),solutionBody(result.share),'<button class="btn primary" data-action="close-dialog">닫기</button>');}
 finally{button.disabled=false;}
}

async function showProof(problemId, memberId) {
  const p = round().problems.find(x => x.id === problemId); const m = MEMBERS.find(x => x.id === memberId); if (!p || !m) return;
  const c = certificate(p, memberId);
  if(!c){const submission=photoSubmission(state,round().id,memberId,problemId);if(submission?.status==='pending'){await showPhotoReview(submission.id);return;}}
  if (!c && memberId === 'me') { method = 'github'; navigate('verify/' + p.id); return; }
  if (!c) { openDialog('인증 기록 없음', `<p>${h(m.name)}님의 ${h(p.title)} 인증 기록이 없습니다.</p>`, '<button class="btn primary" data-action="close-dialog">확인</button>'); return; }
  const url = c.url || '#',photoLabel=c.reviewedBy?'팀원 확인':c.ocr?'OCR 대조':'사진 제출';
  openDialog('인증 기록', `<div class="row" style="margin-top:20px">${avatar(m)}<strong style="font-size:13px">${h(m.name)}</strong><span class="pill success">${c.example ? '예시 ' : ''}${c.method === 'photo' ? photoLabel : 'GitHub'} 인증</span></div><div class="proof-table"><div><span>문제</span><strong>${h(p.title)}</strong></div><div><span>제출 시각</span><strong>${dateTime(c.at)} (한국 시간)</strong></div><div><span>마감 구분</span><strong>${isOnTime(c.at, round()) ? '정상 인증' : '지각 인증'}</strong></div>${c.note ? `<div><span>풀이 메모</span><strong>${h(c.note)}</strong></div>` : ''}</div>${c.example ? '<div class="notice" style="margin-top:18px">실제 풀이를 검증한 결과가 아닌 화면 시안용 인증이에요.</div>' : ''}${c.photoId ? '<div id="proof-photo"></div>' : ''}${c.method === 'github' ? `<p style="margin-top:17px"><a class="text-button" href="${h(url)}" target="_blank" rel="noopener noreferrer">풀이 저장소 보기 ${icon('external')}</a></p>` : ''}`, `<button class="btn" data-action="open-solutions" data-problem="${h(p.id)}">코드와 메모 공유</button>${memberId === 'me' ? `<button class="btn" data-action="edit-proof" data-problem="${p.id}" data-method="${c.method}">인증 화면으로</button>` : ''}<button class="btn primary" data-action="close-dialog">확인</button>`);
  if (c.photoId) { try { const blob = await readPhoto(c.photoId); const el = document.querySelector('#proof-photo'); if (blob && el && dialog.open) { const objectURL = URL.createObjectURL(blob); imageURLs.push(objectURL); el.innerHTML = `<img class="dialog-photo" src="${objectURL}" alt="${h(p.title)} 인증 사진">`; } } catch { const el = document.querySelector('#proof-photo'); if (el) el.textContent = '사진을 불러오지 못했어요.'; } }
}
function showDailyActivity(date,memberId) {
 const member=MEMBERS.find(m=>m.id===memberId);if(!member)return;
 const entries=dailyActivity(state,memberId,{days:dailyDays}).byDate[date]||[];
 openDialog('일별 인증 내역',`<div class="row daily-detail-heading">${avatar(member)}<strong>${h(member.name)}</strong></div><p>${h(date.replaceAll('-','.'))} (한국 시간), ${entries.length}건 인증</p>${entries.length?`<div class="daily-proof-list">${entries.map(({round:r,problem:p,proof:c})=>`<button class="daily-proof-item" data-action="daily-open-proof" data-round="${h(r.id)}" data-member="${h(memberId)}" data-problem="${h(p.id)}"><span><small>${r.number}회차 (${platform(p.platform)})</small><strong>${h(p.title)}</strong><small>${c.method==='github'?'GitHub':'사진'}, ${dateTime(c.at)}${isOnTime(c.at,r)?'':' (지각)'}</small></span>${icon('chevron')}</button>`).join('')}</div>`:'<div class="daily-no-proofs">이 날짜에 인증한 출제 문제가 없습니다.</div>'}`,'<button class="btn primary" data-action="close-dialog">닫기</button>');
}
async function showPhotoReview(id) {
 const submission=state.photoSubmissions?.find(s=>s.id===id);if(!submission){toast('사진 확인 목록을 새로 불러와 주세요.');return;}
 const member=MEMBERS.find(m=>m.id===submission.memberId),r=state.rounds.find(r=>r.id===submission.roundId),p=r?.problems.find(p=>p.id===submission.problemId),reviewer=MEMBERS.find(m=>m.id===submission.reviewedBy);
 const canReview=submission.status==='pending'&&submission.memberId!=='me';
 openDialog('사진 확인',`<div class="photo-review-meta"><strong>${h(member?.name||'팀원')}, ${h(p?.title||'변경된 문제')}</strong><p>${h(r?roundLabel(r):'')}, 제출 ${dateTime(submission.submittedAt)} (한국 시간)</p>${p?`<a class="text-button" href="${h(p.url)}" target="_blank" rel="noopener noreferrer">출제 문제 보기 ${icon('external')}</a>`:''}</div><div class="notice ${submission.status==='approved'?'':'yellow'}"><div><strong>${h(photoStatus(submission))}</strong><p>${h(submission.assessment.reason)}</p>${submission.reviewNote?`<p>확인 메모: ${h(submission.reviewNote)}</p>`:''}${reviewer?`<p>확인한 팀원: ${h(reviewer.name)}, ${dateTime(submission.reviewedAt)}</p>`:''}</div></div><div id="review-photo-image" data-submission="${h(id)}"><p class="field-note">사진을 불러오고 있어요.</p></div>${submission.note?`<p class="photo-review-memo">풀이 메모: ${h(submission.note)}</p>`:''}<details class="ocr-text"><summary>인식한 글자와 대조 결과</summary><p>문제 식별 ${submission.assessment.problemMatch?'일치':'미확인'}, 최종 통과 ${submission.assessment.passed?'문구 확인':'미확인'}, 인증 글자 인식 점수 ${Math.round(submission.assessment.confidence)}/100${submission.assessment.passes?', '+submission.assessment.passes+'번 대조':''}</p><pre>${h(submission.ocrText||'인식한 글자가 없습니다.')}</pre><p>브라우저 OCR의 보조 결과입니다. 원본에서 문제명과 최종 통과 여부를 확인해 주세요.</p></details>${canReview?'<div class="field"><label for="photo-review-note">확인 메모 <span class="muted">반려 시 필수</span></label><textarea class="input" id="photo-review-note" rows="2" maxlength="500" placeholder="예: 문제 이름이 보이지 않아 다시 제출해 주세요."></textarea></div>':submission.status==='pending'?'<p class="table-note">본인 사진은 승인할 수 없습니다. 다른 팀원이 확인하면 인증에 반영됩니다.</p>':''}<p id="photo-review-error" class="field-error" role="alert"></p>`,canReview?`<button class="btn" data-action="review-decision" data-submission="${h(id)}" data-decision="reject">반려</button><button class="btn primary" data-action="review-decision" data-submission="${h(id)}" data-decision="approve" disabled>문제와 통과 결과 확인 후 승인</button>`:'<button class="btn primary" data-action="close-dialog">닫기</button>');
 try {const blob=await readPhoto(submission.photoId),el=document.querySelector('#review-photo-image');if(!el||el.dataset.submission!==id)return;const url=URL.createObjectURL(blob);imageURLs.push(url);el.innerHTML=`<img class="dialog-photo" src="${url}" alt="${h(p?.title||'풀이')} 제출 원본 사진">`;await el.querySelector('img').decode();if(el.dataset.submission===id)dialog.querySelector('[data-decision="approve"]')?.removeAttribute('disabled');}
 catch {const el=document.querySelector('#review-photo-image');if(el?.dataset.submission===id){el.innerHTML='<p class="field-note">사진을 불러오지 못했어요. 새 사진을 요청해 주세요.</p>';dialog.querySelector('[data-decision="approve"]')?.setAttribute('disabled','');}}
}
async function submitPhotoReview(button) {
 const id=button.dataset.submission,decision=button.dataset.decision,note=document.querySelector('#photo-review-note')?.value.trim()||'';
 if(decision==='reject'&&!note){document.querySelector('#photo-review-error').textContent='반려 이유를 입력해 주세요.';document.querySelector('#photo-review-note')?.focus();return;}
 const buttons=dialog.querySelectorAll('[data-action="review-decision"]');buttons.forEach(b=>b.disabled=true);
 try {await api('/api/photo-submissions/'+encodeURIComponent(id)+'/review',{method:'POST',body:JSON.stringify({decision,note})});dialog.close();await reloadState();render();toast(decision==='approve'?'사진을 승인했어요. 제출 시각으로 인증과 잔디에 반영했습니다.':'사진을 반려했어요. 제출자가 이유를 확인하고 다시 올릴 수 있어요.');}
 catch(error){const el=document.querySelector('#photo-review-error');if(el)el.textContent=error.message;if(error.status===409){dialog.close();await reloadState();render();toast(error.message);}else buttons.forEach(b=>b.disabled=false);}
}
function settings() {navigate('connect');}
async function copySummary() {
  const r = round();
  const text = roundSummary(r,MEMBERS);
  try { await navigator.clipboard.writeText(text); toast('문제 목록과 마감일을 복사했어요. 카톡방에 붙여넣어 주세요.'); } catch { openDialog('이번 회차 공유', `<p>아래 내용을 선택해 복사한 뒤 카톡방에 붙여넣어 주세요.</p><textarea class="input" readonly rows="12" style="margin-top:15px" aria-label="공유할 회차 요약">${h(text)}</textarea>`, '<button class="btn primary" data-action="close-dialog">닫기</button>'); }
}
async function copyPending(button) {
 const roundId=round()?.id,memberId=button.dataset.member,epoch=authEpoch;
 button.disabled=true;
 try {
  if(await reloadState()===false||epoch!==authEpoch)return;
  const selectedRound=state.rounds.find(r=>r.id===roundId);
  const members=MEMBERS.filter(m=>memberId==='all'||m.id===memberId);
  const text=pendingSummary(state,selectedRound,members,{url:location.origin+'/#home'});
  if(!text)throw new Error('공유할 인증 대상 회차나 팀원이 없어요.');
  if(route()==='home')render();
  try {await navigator.clipboard.writeText(text);toast('미인증 목록을 복사했어요. 카톡방에 붙여넣어 주세요.');}
  catch {openDialog('미인증 문제 공유','<p>아래 내용을 선택해 복사한 뒤 카톡방에 붙여넣어 주세요.</p><textarea class="input" readonly rows="12" style="margin-top:15px" aria-label="공유할 미인증 목록">'+h(text)+'</textarea>','<button class="btn primary" data-action="close-dialog">닫기</button>');}
 } finally {button.disabled=false;}
}
app.addEventListener('input', event => {
  if(event.target.closest('#study-create-form,#study-rules-form'))syncRulesFields(event.target.form);
  if(event.target.closest('#solution-form')){const d=solutionDraft(),form=event.target.form;d.code=form.elements.code.value;d.note=form.elements.note.value;d.language=form.elements.language.value;d.consent=form.elements.consent.checked;d.dirty=true;}
  if(event.target.closest('#free-problem-form'))captureFreeProblem();
  if (event.target.closest('#round-form')) updateFormPreview();
  if (event.target.closest('#photo-form')) { capturePhotoForm(); const button = document.querySelector('#submit-photo'); if (button) button.disabled = !photoDraft || !photoFormState.confirmed || photoBusy; }
});
app.addEventListener('change', event => {
  if(event.target.closest('#study-create-form,#study-rules-form'))syncRulesFields(event.target.form);
  if(event.target.closest('#free-problem-form'))captureFreeProblem();
  if(event.target.id==='study-select'){void switchStudy(event.target.value).catch(e=>toast(e.message));return;}
  if(event.target.id==='history-only'){
    const f=document.querySelector('#round-form'),past=event.target.checked;
    document.querySelector('#history-fields').classList.toggle('hidden',!past);f.elements.number.required=false;
    if(past&&f.elements.deadlineDate.value>=kstDate()){const due=addDays(nextTuesday(),-7);f.elements.startDate.value=addDays(due,-6);f.elements.deadlineDate.value=due;}
    if(!past&&f.elements.deadlineDate.value<kstDate()){const fresh=emptyDraft();f.elements.startDate.value=fresh.startDate;f.elements.deadlineDate.value=fresh.deadlineDate;}
    state.draft=readForm();render();updateFormPreview();
  }
  if(['deadline-unknown','setter'].includes(event.target.id)||event.target.name?.startsWith('platform-'))updateFormPreview();
  if(event.target.id==='daily-member'){dailyMember=event.target.value;render();}
  if(event.target.id==='pending-member'){pendingMember=event.target.value;render();document.querySelector('#pending-member')?.focus();}
  if (event.target.id === 'round-select') { state.activeRoundId = event.target.value; candidate = null; filter = 'all'; resetPhoto(); save(); render(); }
  if (event.target.id === 'photo-file') selectPhoto(event.target.files[0]);
  if (event.target.name?.startsWith('url-')) {
    const index = Number(event.target.name.split('-')[1]);
    try { const parsed = parseProblemURL(event.target.value, document.querySelector('#round-form').elements['platform-'+index].value); const ex = EXAMPLES.find(p => p.id === parsed.id); const title = document.querySelector(`[name="name-${index}"]`); if (ex && !title.value.trim()) { title.value = ex.title; updateFormPreview(); } } catch { /* Validation occurs on review. */ }
  }
});
app.addEventListener('dragover', event => { const zone = event.target.closest('#drop-zone'); if (zone) { event.preventDefault(); zone.classList.add('dragging'); } });
app.addEventListener('dragleave', event => event.target.closest('#drop-zone')?.classList.remove('dragging'));
app.addEventListener('drop', event => { const zone = event.target.closest('#drop-zone'); if (zone) { event.preventDefault(); zone.classList.remove('dragging'); selectPhoto(event.dataTransfer.files[0]); } });
document.addEventListener('click', async event => {
  const loginMain=app.querySelector('.login-content');
  if(loginMain&&event.target.closest('.skip-link')){
    event.preventDefault();
    loginMain.focus();
    return;
  }
  const button = event.target.closest('[data-action]'); if (!button || button.disabled) return;
  const action = button.dataset.action;
  try {
  if (button.closest('form') && button.type !== 'submit') event.preventDefault();
  if(action==='select-study')await switchStudy(button.dataset.study);
  else if(action==='join-study'){
    const label=button.textContent;
    button.disabled=true;
    button.textContent='참여하는 중…';
    try{
      const result=await api('/api/studies/join',{method:'POST',body:JSON.stringify({token:joinToken()})});
      STUDIES=(await api('/api/studies')).studies;
      await switchStudy(result.studyId,'connect');
      toast('스터디에 참여했어요.');
    }catch(error){
      if([409,410].includes(error.status))await loadJoinInfo(true);
      throw error;
    }finally{button.disabled=false;button.textContent=label;}
  }
  else if(action==='rotate-invite')await rotateInviteLink();
  else if(action==='copy-invite')await copyInviteLink();
  else if(action==='load-invite')await loadInviteInfo();
  else if(action==='retry-invite')await loadJoinInfo(true);
  else if(action==='read-solution')await readSolution(button);
  else if(action==='load-solution-code')await importSolutionCode();
  else if(action==='unshare-solution')await persistSolution(false);
  else if(action==='retry-solution'){solutionDrafts.delete(solutionKey());render();}
  else if(action==='open-solutions'){dialog.close();navigate('solutions/'+button.dataset.problem);}
  else if (action === 'close-dialog') dialog.close();
  else if (action === 'settings') settings();
  else if (action === 'copy-summary') copySummary();
  else if (action === 'copy-pending') await copyPending(button);
  else if(action==='review-photo')await showPhotoReview(button.dataset.submission);
  else if(action==='review-decision')await submitPhotoReview(button);
  else if(action==='stop-ocr'){if(photoDraft&&photoBusy){photoOCRController?.abort();photoDraft.ocrStatus='done';photoDraft.assessment=assessPhotoOCR(currentProblem(),photoDraft.ocr,round().problems);photoBusy=false;render();}}
  else if (action === 'filter') { filter = button.dataset.value; render(); }
  else if (action === 'history-round') { if(state.rounds.some(r=>r.id===button.dataset.round)){state.activeRoundId=button.dataset.round;filter='all';navigate('home');} }
  else if(action==='daily-range'){const days=Number(button.dataset.days);if([90,365].includes(days)){dailyDays=days;render();}}
  else if(action==='daily-details')showDailyActivity(button.dataset.date,button.dataset.member);
  else if(action==='daily-open-proof'){if(state.rounds.some(r=>r.id===button.dataset.round)){dialog.close();state.activeRoundId=button.dataset.round;filter='all';navigate('home');showProof(button.dataset.problem,button.dataset.member);}}
  else if (action === 'open-proof') showProof(button.dataset.problem, button.dataset.member);
  else if (action === 'edit-proof') { dialog.close(); method = button.dataset.method; navigate('verify/' + button.dataset.problem); }
  else if (action === 'method') { capturePhotoForm();captureFreeProblem(); method = button.dataset.method; render(); document.getElementById(method + '-tab')?.focus(); }
  else if(action==='fill-examples'){const f=document.querySelector('#round-form'),used={leetcode:0,programmers:0};f.querySelectorAll('.problem-input').forEach((_,i)=>{const kind=f.elements['platform-'+i].value,p=EXAMPLES.filter(p=>p.platform===kind)[used[kind]++];if(p){f.elements['url-'+i].value=p.url;f.elements['name-'+i].value=p.title;}});updateFormPreview();toast('플랫폼 구성에 맞는 예시를 채웠어요. 남은 문제는 직접 입력해 주세요.');}
  else if (action === 'save-draft') { const previous = state.draft; state.draft = readForm(); if (save()) { formDirty = false; document.querySelector('#draft-status').textContent = '방금 이 브라우저에 초안을 저장했어요.'; toast('초안을 저장했어요. 나중에 이어서 작성할 수 있어요.'); } else state.draft = previous; }
  else if(action==='cancel-round-edit'){editingDraft=null;editingOriginal=null;pendingRound=null;formDirty=false;navigate('home');}
  else if ((action==='publish-round'||action==='save-round')&&pendingRound) {
    button.disabled=true;const payload=pendingRound,editing=!!payload.id;
    try{const created=await api(editing?'/api/rounds/'+encodeURIComponent(payload.id):'/api/rounds',{method:editing?'PATCH':'POST',body:JSON.stringify(payload)});state.activeRoundId=created.id;if(!editing){state.draft=null;save();}editingDraft=null;editingOriginal=null;pendingRound=null;formDirty=false;await reloadState();state.activeRoundId=created.id;dialog.close();navigate('home');toast(editing?'회차를 수정했어요.'+(created.rescan?' 바뀐 문제의 GitHub 기록을 다시 확인합니다.':''):payload.historyOnly?'지난 회차 문제 목록을 저장했어요.':round()?.rules?.mode==='free'?'목표 기간을 공개했어요.':'새 회차를 공개했어요.');}
    catch(e){button.disabled=false;dialog.close();if(document.querySelector('#round-form'))showFormErrors(e.fields||{form:e.message});throw e;}
  }
  else if (action === 'remove-photo') { capturePhotoForm();const saved={...photoFormState};resetPhoto();photoFormState=saved;render(); }
  else if(action==='sync') await syncAll();
  else if(action==='load-repos') { button.disabled=true;try{const data=await api('/api/repositories');availableRepos=data.repositories;installURL=data.installURL;render();if(!availableRepos.length)toast('GitHub에서 앱을 설치하고 읽을 저장소를 선택해 주세요.');else if(data.truncated)toast('목록 일부만 불러왔어요. 풀이 저장소만 선택해 권한을 좁혀 주세요.');}finally{button.disabled=false;} }
  else if(action==='disconnect'){await api('/api/repositories/disconnect',{method:'POST',body:JSON.stringify({platform:button.dataset.platform})});await reloadState();render();toast('저장소 연결을 해제했어요. GitHub 앱 설치 권한은 GitHub 설정에서 해제할 수 있어요.');}
  else if(action==='logout'){await api('/api/logout',{method:'POST'});clearAccount('로그아웃했어요.',true);render();}
  else if(action==='retry')await boot();

  } catch(e) {toast(e.message);}
});
app.addEventListener('submit', async event => {
  const form=event.target;
  if(form.id==='login-form'||form.getAttribute('action')==='/setup/start'){
    if(form.dataset.submitting){event.preventDefault();return;}
    const label=form.querySelector('[data-login-label]');
    label.dataset.originalLabel=label.textContent;
    label.textContent=form.id==='login-form'?'GitHub로 이동 중…':'등록 준비 중…';
    form.querySelector('[type="submit"]').disabled=true;
    form.querySelector('[data-login-progress]').textContent=label.textContent;
    form.dataset.submitting='true';
    return;
  }
  event.preventDefault();
  try {
  if(event.target.id==='study-create-form'){const form=event.target,button=form.querySelector('button[type=submit]');button.disabled=true;try{const fields=new FormData(form);const result=await api('/api/studies',{method:'POST',body:JSON.stringify({name:fields.get('name'),description:fields.get('description'),capacity:Number(fields.get('capacity')),rules:readRules(form)})});STUDIES=(await api('/api/studies')).studies;await switchStudy(result.study.id);toast('스터디를 만들었어요. 저장소 및 멤버에서 초대 링크를 만들 수 있습니다.');}catch(error){const el=document.querySelector('#study-create-error');if(el)el.textContent=error.message;else toast(error.message);}finally{button.disabled=false;}return;}
  if(event.target.id==='study-invite-form'){const token=parseInviteURL(new FormData(event.target).get('inviteURL'),location.origin);if(!token)throw new Error('이 금귤 사이트에서 발급한 초대 링크를 입력해 주세요.');navigate('join/'+token);return;}
  if(event.target.id==='study-rules-form'){const form=event.target,button=form.querySelector('button[type=submit]');button.disabled=true;try{await api('/api/studies/settings',{method:'PATCH',body:JSON.stringify({revision:activeStudy.rulesRevision,rules:readRules(form)})});await reloadState();state.draft=null;restoreDraft();navigate('study-settings');toast('운영 규칙을 저장했어요. 새로 등록하는 회차와 목표 기간부터 적용됩니다.');}catch(error){const el=document.querySelector('#rules-error');if(el)el.textContent=error.message;else toast(error.message);}finally{button.disabled=false;}return;}
  if(event.target.id==='free-problem-form'){const form=event.target,button=form.querySelector('button[type=submit]');button.disabled=true;try{const f=new FormData(form);const result=await api('/api/free-problems',{method:'POST',body:JSON.stringify({round:round().id,platform:f.get('platform'),url:f.get('url'),title:f.get('title')})});await reloadState();freeProblemDraft={roundId:null,platform:'',url:'',title:''};method='photo';navigate('verify/'+result.problem.id);}catch(error){const el=document.querySelector('#free-problem-error');if(el)el.textContent=error.message;else toast(error.message);}finally{button.disabled=false;}return;}
  if(event.target.id==='solution-form'){await persistSolution(true);return;}
  if(event.target.matches('.repo-form')){const i=Number(new FormData(event.target).get('repo'));const r=availableRepos[i];if(!r)throw new Error('저장소를 선택해 주세요.');await api('/api/repositories',{method:'POST',body:JSON.stringify({platform:event.target.dataset.platform,repoId:r.id,installationId:r.installationId})});await reloadState();render();toast('저장소를 연결했어요. 새 풀이부터 자동 인증돼요.');await syncAll();return;}
  if(event.target.id==='member-form'){const login=new FormData(event.target).get('login');await api('/api/members',{method:'POST',body:JSON.stringify({login})});await reloadState();render();toast('멤버를 등록했어요. 홈페이지 링크를 공유해 주세요.');return;}
  if (event.target.id === 'round-form') {
    const d = readForm(); const result = validateRound(d,{rules:formRules()}); if (!result.valid) { showFormErrors(result.errors); return; }
    pendingRound = { ...d, problems: result.problems };
    const free=!d.historyOnly&&formRules().mode==='free',editing=!!d.id,author=d.setter?MEMBERS.find(m=>(m.id==='me'?account.id:m.id)===d.setter)?.name||account.name:d.setterName;
    openDialog(editing?(free?'목표 기간 수정 확인':'회차 수정 확인'):d.historyOnly?'지난 회차 등록 확인':free?'목표 기간 등록 확인':'회차 등록 확인',`<p>${h(d.title)}<br>${period(d)}${d.historyOnly?'':' '+(d.deadlineTime||formRules().deadlineTime)+' 마감'}<br>${free?'등록':'출제'} ${h(author)}</p><div class="review-list">${result.problems.map(p=>`<div>${platformIcon(p.platform)}<span>${h(p.title)}</span><small style="margin-left:auto">${p.platform==='leetcode'?'LC':'PG'}</small></div>`).join('')}</div><div class="notice">${icon('info')}${editing&&d.historyOnly?'지난 문제 기록만 수정합니다. 인증 통계와 잔디에는 반영하지 않습니다.':editing?'기존 인증을 보존합니다. 수정한 마감일로 지각 여부를 표시하고, 교체한 문제는 회차 시작일부터 GitHub 기록을 다시 확인합니다.':d.historyOnly?'지난 문제 목록만 보관합니다. 인증 통계와 잔디에는 포함하지 않습니다.':free?'팀원마다 기간 내에 인증한 서로 다른 문제 수를 집계합니다.':'출제자와 등록자를 구분하여 저장합니다.'}</div>`,'<button class="btn" data-action="close-dialog">돌아가기</button><button class="btn primary" data-action="'+(editing?'save-round':'publish-round')+'">'+(editing?'수정 저장':d.historyOnly?'문제 목록 저장':free?'목표 기간 시작하기':'회차 공개하기')+'</button>');
  }
  if (event.target.id === 'photo-form') {
    capturePhotoForm();
    if (!photoDraft || !photoFormState.confirmed || photoBusy) { document.querySelector('#photo-error').textContent = '사진을 첨부하고 이번 회차에 다시 풀었다는 확인을 해 주세요.'; return; }
    const p = currentProblem(); const roundId = round().id; const file = photoDraft; const note = photoFormState.note.trim();
    const submit = document.querySelector('#submit-photo'); submit.disabled = true; submit.textContent = '사진을 저장하고 있어요…';
    try {
      const body=new FormData();body.append('photo',file.blob,'proof.jpg');body.append('metadata',JSON.stringify({note,ocr:file.ocr}));
      const result=await api('/api/photo?'+new URLSearchParams({round:roundId,problem:p.id}),{method:'POST',body,headers:{'x-puli-confirmed':'yes'}});
      resetPhoto();await reloadState();render();toast(result.status==='approved'?'문제와 통과 문구가 일치해 사진 인증을 반영했어요.':'사진을 제출했어요. 다른 팀원이 확인하면 인증에 반영됩니다.');
    } catch(e) {const el=document.querySelector('#photo-error');if(el)el.textContent=e.message;if(submit.isConnected){submit.disabled=false;submit.textContent='사진으로 인증하기';}}

  }
  } catch(e) {toast(e.message);}
});
window.addEventListener('pageshow', () => {
  for(const form of app.querySelectorAll('form[data-submitting]')){
    const label=form.querySelector('[data-login-label]');
    label.textContent=label.dataset.originalLabel;
    form.querySelector('[type="submit"]').disabled=false;
    form.querySelector('[data-login-progress]').textContent='';
    delete form.dataset.submitting;
  }
});
window.addEventListener('hashchange', () => { if(!route().startsWith('edit/')){editingDraft=null;editingOriginal=null;}formDirty=false; if(route().startsWith('verify/')&&round()?.historyOnly&&liveRound())state.activeRoundId=liveRound().id; if (!route().startsWith('verify')) { resetPhoto(); candidate = null; } render(); window.scrollTo({ top: 0, behavior: 'instant' }); });
dialog.addEventListener('click', event => { if (event.target === dialog) { const box = dialog.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close(); } });
document.addEventListener('keydown', event => { if (!event.target.closest('.method-tabs')) return; if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); capturePhotoForm();captureFreeProblem(); method = method === 'photo' ? 'github' : 'photo'; render(); document.getElementById(method + '-tab').focus(); } });
boot();
setInterval(async()=>{if(account&&!document.hidden&&!formDirty&&!photoDraft&&!dialog.open&&!(route().startsWith('solutions/')&&(solutionDrafts.get(solutionKey())?.dirty||solutionDrafts.get(solutionKey())?.busy))){try{await reloadState();render();}catch{}}},60000);
window.addEventListener('focus',async()=>{if(account&&!formDirty&&!photoDraft&&!dialog.open&&!(route().startsWith('solutions/')&&(solutionDrafts.get(solutionKey())?.dirty||solutionDrafts.get(solutionKey())?.busy))){try{await reloadState();render();}catch{}}});
window.addEventListener('storage',event=>{if(event.key===LOGOUT_KEY&&event.newValue){clearAccount('다른 탭에서 로그아웃했어요.');render();}});
