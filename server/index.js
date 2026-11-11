import {addFreeProblem,FreeProblemError} from './free-problems.js';
import {studySession,listStudies,createStudy,updateStudyRules,ensureAccount,StudyError} from './studies.js';
import {asShare,readShare,saveShare,loadCertifiedCode,SolutionError} from './solutions.js';
import {randomToken,hash,seal,unseal,encode,verifySignature} from './crypto.js';
import {github,GitHubError} from './github.js';
import {one,many,run,asRound,hydrateRounds,roundRow} from './store.js';
import {githubConfig,syncRepository} from './sync.js';
import {validateRound,kstDate,escapeHTML as h} from '../public/core.js';
import {jpegDimensions} from './images.js';
import {createRound,updateRound,RoundError} from './rounds.js';
import {createSession,sessionTokens,SessionError,returnPath} from './session.js';
import {savePhotoSubmission,reviewPhoto,asSubmission,PhotoError} from './photos.js';
import {checkInvite,inviteDetails,rotateInvite,joinFromInvite,InviteError} from './invites.js';
import {loginDocument,loginHeading} from '../public/login-ui.js';

const PHOTO_LIMIT=350*1024;
class HttpError extends Error {constructor(status,message){super(message);this.status=status;}}
const fail=(status,message)=>{throw new HttpError(status,message);};
const json=(value,status=200,extra={})=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra}});
const redirect=(location,value)=>{const headers=new Headers({Location:location,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});for(const item of value?[value].flat():[])headers.append('Set-Cookie',item);return new Response(null,{status:303,headers});};
function origin(env,request){const url=new URL(env.APP_ORIGIN||request.url);if(!['https:','http:'].includes(url.protocol))fail(503,'사이트 주소 설정이 필요해요.');return url.origin;}
function cookies(request){return Object.fromEntries((request.headers.get('cookie')||'').split(';').map(v=>v.trim().split('=')));}
function cookie(name,value,seconds,request){return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax${seconds===undefined?'':'; Max-Age='+seconds}${new URL(request.url).protocol==='https:'?'; Secure':''}`;}
function sameOrigin(request,env){if(request.headers.get('Origin')!==origin(env,request))fail(403,'이 사이트에서 직접 요청해 주세요.');}
async function bodyJSON(request,max=16000){if(!request.headers.get('content-type')?.startsWith('application/json'))fail(415,'JSON 요청이 필요해요.');const data=await limitedBody(request,max);try{return JSON.parse(new TextDecoder().decode(data));}catch{fail(400,'입력 내용을 확인해 주세요.');}}
async function limitedBody(request,max){const length=Number(request.headers.get('content-length'));if(length>max)fail(413,'파일 또는 요청이 너무 커요.');const reader=request.body?.getReader();if(!reader)return new Uint8Array();const chunks=[];let lengthRead=0;while(true){const {done,value}=await reader.read();if(done)break;lengthRead+=value.length;if(lengthRead>max){await reader.cancel();fail(413,'파일 또는 요청이 너무 커요.');}chunks.push(value);}const out=new Uint8Array(lengthRead);let offset=0;for(const c of chunks){out.set(c,offset);offset+=c.length;}return out;}
async function currentSession(request,env,required=true){
 const token=cookies(request).puli_session;
 const row=token?await one(env,'SELECT s.*, m.login, m.name FROM sessions s JOIN members m ON m.id = s.member_id WHERE s.hash = ? AND s.expires_at > ?',await hash(token),Date.now()):null;
 if(!row&&required)fail(401,'GitHub 로그인이 필요해요.');
 if(row){const tokens=await sessionTokens(env,row);row.userToken=tokens.token;row.remember=!!tokens.remember;}
 return row;
}
function owner(session){if(session.role!=='owner')fail(403,'스터디 운영자만 할 수 있어요.');}
async function newFlow(env,kind,data){const token=randomToken();await run(env,'INSERT INTO flows(hash,kind,sealed,expires_at) VALUES (?,?,?,?)',await hash(token),kind,await seal(data,env.ENCRYPTION_KEY),Date.now()+(kind==='manifest'?3600000:600000));return token;}
async function consumeFlow(request,env,kind){
 const state=new URL(request.url).searchParams.get('state');if(!state||state!==cookies(request).puli_flow)fail(400,'로그인 요청이 만료됐거나 일치하지 않아요. 다시 시작해 주세요.');
 const row=await env.DB.prepare('DELETE FROM flows WHERE hash = ? AND kind = ? AND expires_at > ? RETURNING sealed').bind(await hash(state),kind,Date.now()).first();
 if(!row)fail(400,'요청이 만료됐어요. 다시 시작해 주세요.');return unseal(row.sealed,env.ENCRYPTION_KEY);
}
function appManifest(base){return {name:'GEUMGYUL '+new URL(base).hostname.split('.')[0],url:base,description:'코딩테스트 스터디에서 선택한 풀이 저장소만 읽고 자동으로 인증합니다.',public:true,redirect_url:base+'/setup/callback',callback_urls:[base+'/auth/github/callback'],setup_url:base+'/#connect',setup_on_update:true,request_oauth_on_install:false,hook_attributes:{url:base+'/api/github/webhook',active:true},default_permissions:{contents:'read'},default_events:['push']};}

async function handle(request,env,ctx){
 const url=new URL(request.url),path=url.pathname,method=request.method;
 if(path==='/api/health')return json({ok:true});
 if(!env.DB||!env.ENCRYPTION_KEY)fail(503,'무료 서버 초기 설정이 필요해요. 배포 안내를 확인해 주세요.');
 if(path==='/api/status'&&method==='GET'){
  const config=await one(env,'SELECT id FROM config WHERE id = ?','github');const s=await currentSession(request,env,false);
  return json({configured:!!config,user:s?{id:s.member_id,login:s.login,name:s.name}:null});
 }
 if(path==='/setup/start'&&method==='POST'){
  sameOrigin(request,env);if(await githubConfig(env))fail(409,'GitHub 앱은 이미 등록되어 있어요.');
  const state=await newFlow(env,'manifest',{});const manifest=JSON.stringify(appManifest(origin(env,request)));
  const content=loginHeading('GitHub 앱 등록','서버에서 지정한 운영자 계정으로 진행해 주세요.')+`
    <p class="login-feedback">GitHub에서 앱 이름과 선택한 저장소의 읽기 권한을 확인합니다.</p>
    <form method="post" action="https://github.com/settings/apps/new?state=${state}">
      <input type="hidden" name="manifest" value="${h(manifest)}">
      <button class="login-submit" type="submit">GitHub에서 등록하기</button>
    </form>
    <a class="login-back text-button" href="/">초기 설정으로 돌아가기</a>`;
  return new Response(loginDocument('GitHub 앱 등록',content,{label:'운영자 초기 설정'}),{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Set-Cookie':cookie('puli_flow',state,3600,request),'Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; form-action https://github.com; base-uri 'none'; frame-ancestors 'none'"}});
 }
 if(path==='/setup/callback'&&method==='GET'){
  await consumeFlow(request,env,'manifest');if(await githubConfig(env))fail(409,'이미 설정했어요.');
  const code=url.searchParams.get('code');if(!/^[a-zA-Z0-9_-]{1,256}$/.test(code||''))fail(400,'앱 등록 코드를 확인해 주세요.');
  const app=await github('/app-manifests/'+encodeURIComponent(code)+'/conversions',null,{method:'POST'});
  if(String(app.owner?.id)!==String(env.OWNER_GITHUB_ID))fail(403,'서버의 OWNER_GITHUB_ID로 지정한 GitHub 계정에서 앱을 등록해 주세요.');
  if(app.permissions?.contents!=='read')fail(400,'저장소 읽기 권한 설정을 확인해 주세요.');
  await run(env,'INSERT INTO config(id,sealed) VALUES (?,?)','github',await seal({id:app.id,slug:app.slug,client_id:app.client_id,client_secret:app.client_secret,pem:app.pem,webhook_secret:app.webhook_secret},env.ENCRYPTION_KEY));
  return redirect('/?setup=done',cookie('puli_flow','',0,request));
 }
 if(path==='/api/invites/check'&&method==='POST'){
  sameOrigin(request,env);const data=await bodyJSON(request,1024);
  const {tokenHash,...view}=await checkInvite(env,data?.token);return json(view);
 }
 if(path==='/auth/github'&&(method==='GET'||method==='POST')){
  const config=await githubConfig(env);if(!config)fail(409,'운영자의 GitHub 앱 등록을 먼저 완료해 주세요.');
  let input=url.searchParams;
  if(method==='POST'){
   sameOrigin(request,env);if(!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded'))fail(415,'로그인 폼을 확인해 주세요.');
   input=new URLSearchParams(new TextDecoder().decode(await limitedBody(request,2048)));
  }
  // Invite secrets stay in the POST body and encrypted OAuth flow, never in GitHub's URL.
  let inviteHash;
  if(input.has('invite')){
   if(method!=='POST')fail(400,'초대 화면에서 참여 버튼을 눌러 주세요.');
   try{inviteHash=(await checkInvite(env,input.get('invite'))).tokenHash;}
   catch(error){if(error instanceof InviteError)return redirect('/?inviteError='+encodeURIComponent(error.code)+'#home');throw error;}
  }
  const verifier=randomToken();const state=await newFlow(env,'oauth',{verifier,remember:input.get('remember')==='1',next:inviteHash?'/#studies':returnPath(input.get('next')),...(inviteHash?{inviteHash}:{})});
  const query=new URLSearchParams({client_id:config.client_id,redirect_uri:origin(env,request)+'/auth/github/callback',state,code_challenge:await hash(verifier),code_challenge_method:'S256'});
  return redirect('https://github.com/login/oauth/authorize?'+query,cookie('puli_flow',state,600,request));
 }
 if(path==='/auth/github/callback'&&method==='GET'){
  const flow=await consumeFlow(request,env,'oauth');
  if(url.searchParams.get('error')==='access_denied')fail(400,'GitHub 로그인을 취소했어요. 다시 시도할 수 있습니다.');
  const config=await githubConfig(env);const code=url.searchParams.get('code');if(!code||code.length>256)fail(400,'GitHub 승인이 필요해요.');
  const response=await fetch('https://github.com/login/oauth/access_token',{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify({client_id:config.client_id,client_secret:config.client_secret,code,redirect_uri:origin(env,request)+'/auth/github/callback',code_verifier:flow.verifier}),signal:AbortSignal.timeout(12000)});
  const token=await response.json();if(!response.ok||!token.access_token)fail(401,'GitHub 로그인에 실패했어요. 다시 시도해 주세요.');
  const user=await github('/user',token.access_token);
  await ensureAccount(env,user);
  if(String(user.id)===String(env.OWNER_GITHUB_ID)){
   await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO study_memberships(study_id,member_id,role,slot,joined_at) SELECT 'study',?,'owner',0,? WHERE EXISTS(SELECT 1 FROM studies WHERE id='study' AND created_by IS NULL) AND NOT EXISTS(SELECT 1 FROM study_memberships WHERE study_id='study')").bind(String(user.id),new Date().toISOString()),
    env.DB.prepare("UPDATE studies SET created_by=? WHERE id='study' AND created_by IS NULL AND EXISTS(SELECT 1 FROM study_memberships WHERE study_id='study' AND member_id=? AND role='owner')").bind(String(user.id),String(user.id))
   ]);
  }
  let destination=returnPath(flow.next);
  if(flow.inviteHash){
   try{
    const membership=await joinFromInvite(env,flow.inviteHash,user);
    destination='/?joinedStudy='+encodeURIComponent(membership.study_id)+'#connect';
   }
   catch(error){if(error instanceof InviteError)return redirect('/?inviteError='+encodeURIComponent(error.code)+'#studies',cookie('puli_flow','',0,request));throw error;}
  }
  const session=await createSession(env,String(user.id),token,flow.remember);
  const previous=cookies(request).puli_session;if(previous)await run(env,'DELETE FROM sessions WHERE hash = ?',await hash(previous));
  return redirect(destination,[cookie('puli_session',session.raw,session.remember?session.seconds:undefined,request),cookie('puli_flow','',0,request)]);
 }
 if(path==='/api/github/webhook'&&method==='POST')return receiveWebhook(request,env,ctx);
 if(!path.startsWith('/api/'))return env.ASSETS.fetch(request);
 if(path==='/api/logout'&&method==='POST'){sameOrigin(request,env);const token=cookies(request).puli_session;if(token)await run(env,'DELETE FROM sessions WHERE hash = ?',await hash(token));return json({ok:true},200,{'Set-Cookie':cookie('puli_session','',0,request)});}
 let s=await currentSession(request,env);if(method!=='GET')sameOrigin(request,env);
 if(path==='/api/studies'&&method==='GET')return json({studies:await listStudies(env,s.member_id)});
 if(path==='/api/studies'&&method==='POST')return json(await createStudy(env,s,await bodyJSON(request,2048)),201);
 if(path==='/api/studies/join'&&method==='POST'){
  const data=await bodyJSON(request,1024),view=await checkInvite(env,data?.token);
  await joinFromInvite(env,view.tokenHash,{id:s.member_id,login:s.login,name:s.name,type:'User'});
  return json({studyId:view.studyId},201);
 }
 // Personal repository connections are account-wide. Every study resource below
 // requires membership in the explicit study, or the account's own first study.
 if(path==='/api/repositories'&&method==='GET')return repositoryChoices(env,s);
 if(path==='/api/repositories'&&method==='POST')return connectRepository(request,env,s);
 if(path==='/api/repositories/disconnect'&&method==='POST'){const data=await bodyJSON(request);await run(env,'DELETE FROM repositories WHERE member_id = ? AND platform = ?',s.member_id,data.platform);return json({ok:true});}
 s=await studySession(env,s,request.headers.get('X-Puli-Study'));
 if(path==='/api/studies/settings'&&method==='PATCH')return json(await updateStudyRules(env,s,await bodyJSON(request,2048)));
 if(path==='/api/free-problems'&&method==='POST')return json(await addFreeProblem(env,s,await bodyJSON(request,4096)),201);
 if(path==='/api/invites'&&method==='GET')return json(await inviteDetails(env,s,origin(env,request)));
 if(path==='/api/invites'&&method==='POST')return json(await rotateInvite(env,s,await bodyJSON(request,1024),origin(env,request)),201);
 if(path==='/api/state'&&method==='GET'){
  const [members,rounds,certificates,repositories,submissions,shares]=await Promise.all([
   many(env,'SELECT m.id,m.login,m.name,sm.role,sm.slot,sm.joined_at FROM study_memberships sm JOIN members m ON m.id=sm.member_id WHERE sm.study_id=? ORDER BY sm.slot',s.study_id),
   many(env,'SELECT * FROM rounds WHERE study_id=? ORDER BY start_date DESC,number DESC',s.study_id),
   many(env,'SELECT c.* FROM certificates c JOIN rounds r ON r.id=c.round_id WHERE r.study_id=? ORDER BY c.observed_at DESC LIMIT 2600',s.study_id),
   many(env,'SELECT platform,full_name,branch,private,checked_at,sync_error,sync_cursor FROM repositories WHERE member_id=?',s.member_id),
   many(env,'SELECT p.* FROM photo_submissions p JOIN rounds r ON r.id=p.round_id WHERE r.study_id=? AND p.rowid IN (SELECT MAX(rowid) FROM photo_submissions GROUP BY round_id,member_id,problem_id) ORDER BY p.submitted_at DESC LIMIT 500',s.study_id),
   many(env,'SELECT ss.round_id,ss.member_id,ss.problem_id,ss.language,ss.shared,ss.revision,ss.updated_at FROM solution_shares ss JOIN rounds r ON r.id=ss.round_id WHERE r.study_id=? AND (ss.shared=1 OR ss.member_id=?)',s.study_id,s.member_id)
  ]);
  const proofs={};for(const c of certificates){proofs[c.round_id]??={};proofs[c.round_id][c.member_id]??={};proofs[c.round_id][c.member_id][c.problem_id]={...JSON.parse(c.evidence),method:c.method,at:c.at,observedAt:c.observed_at,example:false};}
  return json({study:s.study,members,rounds:(await hydrateRounds(env,rounds)).map(asRound),certificates:proofs,photoSubmissions:submissions.map(asSubmission),solutionShares:shares.map(asShare),repositories,user:{id:s.member_id,login:s.login,name:s.name,role:s.role},retentionDays:90});
 }
 if(path==='/api/solution-shares'&&method==='GET')return json(await readShare(env,s,Object.fromEntries(url.searchParams)));
 if(path==='/api/solution-shares'&&method==='POST')return json(await saveShare(env,s,await bodyJSON(request,100000)));
 if(path==='/api/solution-code'&&method==='GET')return json(await loadCertifiedCode(env,s,url.searchParams));
 if(path==='/api/members'&&method==='POST'){
  owner(s);const data=await bodyJSON(request);if(!/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(data.login||''))fail(400,'GitHub 아이디를 확인해 주세요.');
  const user=await github('/users/'+encodeURIComponent(data.login),s.userToken);
  if(user.type!=='User')fail(400,'개인 GitHub 계정을 입력해 주세요.');
  await ensureAccount(env,user);
  const result=await run(env,"INSERT OR IGNORE INTO study_memberships(study_id,member_id,role,slot,joined_at) SELECT ?,?,'member',COALESCE((SELECT MAX(slot)+1 FROM study_memberships WHERE study_id=?),0),? WHERE (SELECT COUNT(*) FROM study_memberships WHERE study_id=?)<(SELECT capacity FROM studies WHERE id=?)",s.study_id,String(user.id),s.study_id,new Date().toISOString(),s.study_id,s.study_id);
  if(!result.meta.changes)fail(409,'이미 참여 중인 멤버이거나 스터디 정원이 찼어요.');return json({ok:true},201);
 }
 if(path==='/api/rounds'&&method==='POST')return json(await createRound(env,s,await bodyJSON(request)),201);
 if(/^\/api\/rounds\/[a-zA-Z0-9_-]+$/.test(path)&&method==='PATCH')return json(await updateRound(env,s,path.split('/').at(-1),await bodyJSON(request)));
 if(path==='/api/sync'&&method==='POST'){
  const data=await bodyJSON(request);const repo=await one(env,'SELECT * FROM repositories WHERE member_id = ? AND platform = ?',s.member_id,data.platform);if(!repo)fail(404,'먼저 풀이 저장소를 연결해 주세요.');
  if(repo.updated_at>Date.now()-10000){let more=false;try{const cursor=JSON.parse(repo.sync_cursor||'null');more=!!cursor&&!cursor.done;}catch{}return json({more,cooldown:10,count:0});}
  return json(await syncRepository(env,repo));
 }
 if(path==='/api/photo'&&method==='POST')return submitPhoto(request,env,s,url);
 if(/^\/api\/photo-submissions\/[a-zA-Z0-9_-]+\/review$/.test(path)&&method==='POST')return json(await reviewPhoto(env,s,path.split('/')[3],await bodyJSON(request)));
 if(path.startsWith('/api/photos/')&&method==='GET'){
  const photo=await one(env,'SELECT bytes FROM photos WHERE id = ? AND study_id=?',decodeURIComponent(path.slice('/api/photos/'.length)),s.study_id);if(!photo)fail(404,'사진 보관 기간(90일)이 지났거나 사진이 없어요.');
  return new Response(new Uint8Array(photo.bytes),{headers:{'Content-Type':'image/jpeg','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'"}});
 }
 fail(404,'요청한 기능을 찾을 수 없어요.');
}

async function repositoryChoices(env,s){
 const config=await githubConfig(env);const userToken=s.userToken;
 const result=await github('/user/installations?per_page=20',userToken);
 const installs=result.installations.filter(i=>String(i.app_id)===String(config.id));const repos=[];
 for(const install of installs.slice(0,5)){
  const r=await github(`/user/installations/${install.id}/repositories?per_page=100`,userToken);
  for(const repo of r.repositories)repos.push({id:String(repo.id),fullName:repo.full_name,private:repo.private,branch:repo.default_branch,installationId:String(install.id)});
 }
 return json({repositories:repos,installURL:`https://github.com/apps/${encodeURIComponent(config.slug)}/installations/new`,truncated:result.total_count>20||repos.length>=100});
}
async function connectRepository(request,env,s){
 const data=await bodyJSON(request);if(!['leetcode','programmers'].includes(data.platform)||!/^\d+$/.test(String(data.repoId))||!/^\d+$/.test(String(data.installationId)))fail(400,'연결할 저장소를 선택해 주세요.');
 const config=await githubConfig(env),userToken=s.userToken;
 const installs=await github('/user/installations?per_page=100',userToken);const install=installs.installations.find(i=>String(i.id)===String(data.installationId)&&String(i.app_id)===String(config.id));if(!install)fail(403,'본인이 설치한 금귤 앱의 저장소만 연결할 수 있어요.');
 const list=await github(`/user/installations/${install.id}/repositories?per_page=100`,userToken);const repo=list.repositories.find(r=>String(r.id)===String(data.repoId));if(!repo)fail(403,'선택한 저장소에 접근할 수 없어요. GitHub 앱 권한을 확인해 주세요.');
 await run(env,'INSERT INTO repositories(member_id,platform,repo_id,full_name,installation_id,branch,private) VALUES (?,?,?,?,?,?,?) ON CONFLICT(member_id,platform) DO UPDATE SET repo_id=excluded.repo_id,full_name=excluded.full_name,installation_id=excluded.installation_id,branch=excluded.branch,private=excluded.private,checked_at=NULL,sync_cursor=NULL,sync_error=NULL,updated_at=0',s.member_id,data.platform,String(repo.id),repo.full_name,String(install.id),repo.default_branch,repo.private?1:0);
 return json({ok:true});
}
async function submitPhoto(request,env,s,url){
 const roundId=url.searchParams.get('round'),problemId=url.searchParams.get('problem');const r=await roundRow(env,roundId,s.study_id);if(!r||!JSON.parse(r.problems).some(p=>p.id===problemId))fail(404,'회차 또는 문제를 확인해 주세요.');
 if(r.history_only)fail(400,'지난 회차는 문제 목록만 보관합니다. 인증 대상이 아닙니다.');
 if(kstDate()<r.start_date)fail(400,'회차 공개일 이후에 인증할 수 있어요.');
 if(request.headers.get('x-puli-confirmed')!=='yes')fail(400,'이번 회차에 다시 풀었다는 확인이 필요해요.');
 let bytes,note='',ocr;
 const type=request.headers.get('content-type')||'';
 if(type.startsWith('multipart/form-data;')){
  const raw=await limitedBody(request,PHOTO_LIMIT+64000);let form;
  try{form=await new Response(raw,{headers:{'Content-Type':type}}).formData();}catch{fail(400,'사진 첨부 내용을 확인해 주세요.');}
  const file=form.get('photo');if(!file||typeof file.arrayBuffer!=='function'||file.type!=='image/jpeg')fail(415,'압축한 JPG 사진을 첨부해 주세요.');
  if(file.size>PHOTO_LIMIT)fail(413,'파일 또는 요청이 너무 커요.');bytes=new Uint8Array(await file.arrayBuffer());
  let meta;try{meta=JSON.parse(form.get('metadata'));}catch{fail(400,'사진 인식 결과를 확인해 주세요.');}
  if(!meta||typeof meta!=='object'||Array.isArray(meta))fail(400,'사진 인식 결과를 확인해 주세요.');
  note=meta.note??'';ocr=meta.ocr;
 } else {
  if(type!=='image/jpeg')fail(415,'압축한 JPG 사진을 첨부해 주세요.');
  bytes=await limitedBody(request,PHOTO_LIMIT);
  try{note=decodeURIComponent(request.headers.get('x-puli-note')||'');}catch{fail(400,'메모 내용을 확인해 주세요.');}
 }
 if(!jpegDimensions(bytes))fail(400,'올바른 JPG 사진을 첨부해 주세요.');
 if(typeof note!=='string'||note.length>500)fail(400,'메모는 500자까지 쓸 수 있어요.');
 return json(await savePhotoSubmission(env,s,{round:r,problemId,bytes,note,ocr}),201);
}
async function receiveWebhook(request,env,ctx){
 const config=await githubConfig(env);if(!config)fail(503,'GitHub 앱 설정이 필요해요.');const bytes=await limitedBody(request,2*1024*1024);
 if(!await verifySignature(bytes,request.headers.get('x-hub-signature-256'),config.webhook_secret))fail(401,'올바르지 않은 GitHub 서명이에요.');
 const delivery=request.headers.get('x-github-delivery');if(!delivery||delivery.length>100)fail(400,'전송 ID를 확인해 주세요.');
 const event=request.headers.get('x-github-event');let payload;try{payload=JSON.parse(new TextDecoder().decode(bytes));}catch{fail(400,'이벤트를 읽지 못했어요.');}
 const existing=await one(env,'SELECT status FROM deliveries WHERE id = ?',delivery);if(existing?.status==='done')return json({ok:true,duplicate:true});
 if(event!=='push')return json({ok:true,ignored:true});
 const repositories=await many(env,'SELECT * FROM repositories WHERE repo_id = ? AND installation_id = ?',String(payload.repository?.id),String(payload.installation?.id));
 const matching=repositories.filter(r=>payload.ref==='refs/heads/'+r.branch&&!payload.deleted);
 await run(env,"INSERT INTO deliveries(id,status,created_at) VALUES (?,'processing',?) ON CONFLICT(id) DO UPDATE SET status='processing'",delivery,Date.now());
 ctx.waitUntil((async()=>{try{for(const repo of matching.slice(0,2)){await run(env,'UPDATE repositories SET updated_at = 0 WHERE member_id = ? AND platform = ?',repo.member_id,repo.platform);await syncRepository(env,repo);}await run(env,"UPDATE deliveries SET status='done' WHERE id = ?",delivery);}catch{await run(env,"UPDATE deliveries SET status='retry' WHERE id = ?",delivery);}})());
 return json({ok:true,queued:matching.length},202);
}
export default {
 async fetch(request,env,ctx){
  try{
   const response=await handle(request,env,ctx),headers=new Headers(response.headers);
   headers.set('Referrer-Policy','same-origin');
   return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
  }catch(error){
   const status=error instanceof HttpError||error instanceof SessionError||error instanceof FreeProblemError||error instanceof StudyError||error instanceof RoundError||error instanceof PhotoError||error instanceof SolutionError||error instanceof InviteError?error.status:error instanceof GitHubError?(error.status===401?401:502):500;
   const message=status===500?'처리 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.':error.message;
   const headers={'Referrer-Policy':'no-referrer',...(status===401?{'Set-Cookie':cookie('puli_session','',0,request)}:{}),...(error.code==='SESSION_REFRESH_BUSY'?{'Retry-After':'1'}:{})};
   const path=new URL(request.url).pathname;
   const setup=path.startsWith('/setup/');
   if((setup||path.startsWith('/auth/github'))&&request.headers.get('Accept')?.includes('text/html')){
    const title=setup?'초기 설정을 확인해 주세요':'로그인을 다시 시도해 주세요';
    const content=loginHeading(title)+`<p class="login-feedback" role="alert">${h(message)}</p>
     <a class="login-submit" href="/">${setup?'초기 설정으로 돌아가기':'로그인으로 돌아가기'}</a>`;
    return new Response(loginDocument(title,content),{status,headers:{...headers,'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'"}});
   }
   return json({error:message,...(error.code?{code:error.code}:{}),...(error instanceof RoundError&&error.fields?{fields:error.fields}:{})},status,headers);
  }
 },
 async scheduled(event,env,ctx){
  // Webhooks handle normal updates; this bounded sweep catches missed deliveries.
  const repos=await many(env,'SELECT * FROM repositories ORDER BY updated_at ASC LIMIT 2');
  for(const repo of repos){try{await syncRepository(env,repo);}catch{/* Error status persists on the repository for the UI. */}}
  const now=Date.now();await env.DB.batch([
   env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now),
   env.DB.prepare('DELETE FROM flows WHERE expires_at < ?').bind(now),
   env.DB.prepare('DELETE FROM deliveries WHERE created_at < ?').bind(now-7*86400000),
   env.DB.prepare('DELETE FROM photos WHERE created_at < ?').bind(new Date(now-90*86400000).toISOString())
  ]);
 }
};
