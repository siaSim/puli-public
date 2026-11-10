import {studyId} from './studies.js';
import {one,run,roundRow} from './store.js';
import {github,installationToken,sourceFile,pathMatches} from './github.js';
import {githubConfig} from './sync.js';
import {unbase64} from './crypto.js';
export class SolutionError extends Error {constructor(status,message){super(message);this.status=status;}}
const fail=(status,message)=>{throw new SolutionError(status,message);};
export const asShare=row=>({roundId:row.round_id,memberId:row.member_id,problemId:row.problem_id,language:row.language,shared:!!row.shared,revision:row.revision,updatedAt:row.updated_at});
async function context(env,s,roundId,problemId){
 if(typeof roundId!=='string'||typeof problemId!=='string'||roundId.length>120||problemId.length>160)fail(400,'회차와 문제를 선택해 주세요.');
 const round=await roundRow(env,roundId,studyId(s));
 const problem=round&&JSON.parse(round.problems).find(p=>p.id===problemId);
 if(!problem||round.history_only)fail(404,'인증 대상 회차와 문제를 선택해 주세요.');
 return {round,problem};
}
export async function readShare(env,s,{round,problem,member}){
 await context(env,s,round,problem);
 const row=await one(env,'SELECT * FROM solution_shares WHERE round_id=? AND member_id=? AND problem_id=?',round,member||s.member_id,problem);
 if(!row){if(!member||member===s.member_id)return {share:null};fail(404,'공유 중인 풀이가 없어요.');}
 if(!row.shared&&row.member_id!==s.member_id)fail(404,'공유 중인 풀이가 없어요.');
 return {share:{...asShare(row),code:row.code,note:row.note}};
}
export async function saveShare(env,s,data){
 if(!data||typeof data!=='object'||Array.isArray(data))fail(400,'풀이 입력 내용을 확인해 주세요.');
 if(data.member!==undefined||data.memberId!==undefined)fail(400,'본인의 풀이만 수정할 수 있어요.');
 const {round}=await context(env,s,data.round,data.problem);
 if(!Number.isInteger(data.revision)||data.revision<0)fail(400,'풀이 버전을 확인해 주세요.');
 if(data.shared!==true&&data.shared!==false)fail(400,'공유 여부를 확인해 주세요.');
 const old=await one(env,'SELECT revision FROM solution_shares WHERE round_id=? AND member_id=? AND problem_id=?',data.round,s.member_id,data.problem);
 if((old?.revision||0)!==data.revision)fail(409,'다른 창에서 풀이가 바뀌었어요. 새로고침한 뒤 다시 저장해 주세요.');
 if(!data.shared){
  if(!old)fail(404,'공유한 풀이가 없어요.');
  const result=await run(env,'UPDATE solution_shares SET shared=0,revision=revision+1,updated_at=? WHERE round_id=? AND member_id=? AND problem_id=? AND revision=?',new Date().toISOString(),data.round,s.member_id,data.problem,data.revision);
  if(!result.meta.changes)fail(409,'풀이가 바뀌었어요. 새로고침해 주세요.');
  return readShare(env,s,{round:data.round,problem:data.problem});
 }
 if(data.consent!==true)fail(400,'초대된 팀원에게 코드와 메모를 공유한다는 확인이 필요해요.');
 const code=typeof data.code==='string'?data.code:'',note=typeof data.note==='string'?data.note:'',language=typeof data.language==='string'?data.language.trim():'';
 if(!code.trim()||code.length>24000||new TextEncoder().encode(code).length>65536||note.length>4000||language.length>30)fail(400,'코드는 24,000자·64KB, 메모는 4,000자 이내로 입력해 주세요.');
 const proof=await one(env,'SELECT method FROM certificates WHERE round_id=? AND member_id=? AND problem_id=?',data.round,s.member_id,data.problem);
 if(!proof)fail(403,'이 문제의 인증을 완료한 뒤 풀이를 공유할 수 있어요.');
 const result=await run(env,`INSERT INTO solution_shares(round_id,member_id,problem_id,code,note,language,shared,revision,updated_at)
 SELECT ?,?,?,?,?,?,1,1,? WHERE EXISTS(SELECT 1 FROM certificates WHERE round_id=? AND member_id=? AND problem_id=?) AND EXISTS(SELECT 1 FROM rounds WHERE id=? AND revision=?)
 ON CONFLICT(round_id,member_id,problem_id) DO UPDATE SET code=excluded.code,note=excluded.note,language=excluded.language,shared=1,revision=solution_shares.revision+1,updated_at=excluded.updated_at WHERE solution_shares.revision=?`,data.round,s.member_id,data.problem,code,note,language,new Date().toISOString(),data.round,s.member_id,data.problem,round.id,round.revision||0,data.revision);
 if(!result.meta.changes)fail(409,'회차 또는 풀이가 바뀌었어요. 새로고침해 주세요.');
 return readShare(env,s,{round:data.round,problem:data.problem});
}
export async function loadCertifiedCode(env,s,query,{fetcher=fetch,tokenFor=installationToken,configFor=githubConfig}={}){
 if([...query.keys()].some(k=>!['round','problem'].includes(k)))fail(400,'인증한 본인 코드만 불러올 수 있어요.');
 const round=query.get('round'),problemId=query.get('problem'),{problem}=await context(env,s,round,problemId);
 const proof=await one(env,'SELECT * FROM certificates WHERE round_id=? AND member_id=? AND problem_id=?',round,s.member_id,problemId);
 if(proof?.method!=='github')fail(403,'GitHub로 인증한 본인 코드만 불러올 수 있어요. 사진 인증은 코드를 직접 입력해 주세요.');
 const e=JSON.parse(proof.evidence),repo=await one(env,'SELECT * FROM repositories WHERE member_id=? AND platform=?',s.member_id,problem.platform);
 const file={filename:e.path||'',status:'added',additions:1,deletions:0};
 if(!repo||repo.full_name!==e.repo||!/^\w[\w.-]*\/[\w.-]+$/.test(e.repo||'')||!/^[a-f0-9]{40}$/i.test(e.sha||'')||file.filename.split('/').some(p=>!p||p==='..'||p==='.')||!sourceFile(file)||!pathMatches(file,problem))fail(409,'인증한 파일과 연결 저장소를 확인해 주세요. 코드를 직접 입력할 수도 있어요.');
 const prefix='/repos/'+repo.full_name.split('/').map(encodeURIComponent).join('/'),path=file.filename.split('/').map(encodeURIComponent).join('/');
 const token=await tokenFor(await configFor(env),repo,fetcher),result=await github(`${prefix}/contents/${path}?ref=${encodeURIComponent(e.sha)}`,token,{fetcher});
 if(result.type!=='file'||result.encoding!=='base64'||!Number.isInteger(result.size)||result.size>65536||typeof result.content!=='string'||result.content.length>100000)fail(413,'64KB 이하 코드 파일만 불러올 수 있어요.');
 const bytes=unbase64(result.content.replace(/\s/g,''));if(bytes.byteLength>65536)fail(413,'코드 파일이 너무 커요.');
 const code=new TextDecoder('utf-8',{fatal:true}).decode(bytes);if(code.length>24000)fail(413,'24,000자 이하 코드만 공유할 수 있어요.');
 return {code,language:file.filename.split('.').at(-1),sourceURL:`https://github.com/${repo.full_name}/blob/${e.sha}/${path}`};
}
