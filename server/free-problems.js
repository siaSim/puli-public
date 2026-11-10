import {one,run,roundRow,asRound} from './store.js';
import {studyId} from './studies.js';
import {isFree,allowsPlatform} from '../public/rules.js';
import {parseProblemURL,kstDate} from '../public/core.js';

export class FreeProblemError extends Error {constructor(status,message){super(message);this.status=status;}}
const fail=(status,message)=>{throw new FreeProblemError(status,message);};
export async function rememberFreeProblem(env,round,problem,memberId){
 // Only the selected goal period's immutable rules/revision may accept a problem.
 const result=await run(env,`INSERT OR IGNORE INTO free_problems(round_id,problem_id,title,platform,url,difficulty,tag,added_by,created_at)
 SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM rounds WHERE id=? AND revision=? AND json_extract(rules,'$.mode')='free')`,
 round.id,problem.id,problem.title,problem.platform,problem.url,problem.difficulty,problem.tag,memberId,new Date().toISOString(),round.id,round.revision||0);
 return result;
}
export async function addFreeProblem(env,s,data){
 if(!data||typeof data!=='object'||Array.isArray(data)||typeof data.round!=='string'||data.round.length>120||!['leetcode','programmers'].includes(data.platform)||typeof data.url!=='string'||data.url.length>2048||typeof data.title!=='string'||!data.title.trim()||data.title.trim().length>120)fail(400,'플랫폼과 문제 링크·제목을 입력해 주세요.');
 const row=await roundRow(env,data.round,studyId(s));if(!row)fail(404,'목표 기간을 찾을 수 없어요.');
 const round=asRound(row);
 if(!isFree(round))fail(400,'자율 목표형 기간에서만 개인 문제를 추가할 수 있어요.');
 if(kstDate()<round.startDate)fail(400,'목표 기간이 시작된 뒤 문제를 추가해 주세요.');
 if(!allowsPlatform(round.rules,data.platform))fail(400,'이 기간에 허용된 플랫폼을 선택해 주세요.');
 let normalized;try{normalized=parseProblemURL(data.url,data.platform);}catch(error){fail(400,error.message);}
 const existing=await one(env,'SELECT problem_id FROM free_problems WHERE round_id=? AND problem_id=?',round.id,normalized.id);
 if(!existing&&(await one(env,'SELECT COUNT(*) AS n FROM free_problems WHERE round_id=? AND added_by=?',round.id,s.member_id)).n>=100)fail(409,'한 기간에 문제는 최대 100개까지 추가할 수 있어요.');
 const problem={...normalized,title:data.title.trim(),platform:data.platform,difficulty:data.platform==='leetcode'?'난이도 미정':'레벨 미정',tag:'자율 풀이'};
 await rememberFreeProblem(env,round,problem,s.member_id);
 if(!await one(env,'SELECT problem_id FROM free_problems WHERE round_id=? AND problem_id=?',round.id,problem.id))fail(409,'목표 기간이 변경됐어요. 새로고침 후 다시 시도해 주세요.');
 return {problem};
}
