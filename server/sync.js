import {isFree,allowsPlatform} from '../public/rules.js';
import {deadlineExclusive} from '../public/core.js';
import {rememberFreeProblem} from './free-problems.js';
import {github,GitHubError,installationToken,eligibleCommit,evidenceForCommit,discoverCommitProblems} from './github.js';
import {one,many,run,asRound} from './store.js';
import {unseal} from './crypto.js';

export async function githubConfig(env){const row=await one(env,'SELECT sealed FROM config WHERE id=?','github');return row?unseal(row.sealed,env.ENCRYPTION_KEY):null;}
export async function syncRepository(env,repo,{fetcher=fetch,now=Date.now()}={}){
 const lock=repo.member_id+':'+repo.platform;
 await run(env,'DELETE FROM sync_locks WHERE id=? AND expires_at<?',lock,now);
 const claimed=await run(env,'INSERT OR IGNORE INTO sync_locks(id,expires_at) VALUES (?,?)',lock,now+120000);
 if(!claimed.meta.changes)return {busy:true,more:true};
 try{
  const rows=await many(env,`SELECT r.* FROM rounds r JOIN study_memberships m ON m.study_id=r.study_id
   WHERE m.member_id=? AND r.history_only=0 AND r.start_date<=?
   AND (json_extract(r.rules,'$.mode')='free' OR NOT EXISTS(SELECT 1 FROM rounds newer WHERE newer.study_id=r.study_id AND newer.history_only=0 AND newer.start_date<=? AND newer.number>r.number))
   ORDER BY r.study_id`,repo.member_id,new Date(now+32400000).toISOString().slice(0,10),new Date(now+32400000).toISOString().slice(0,10));
  const rounds=rows.map(asRound),signature=JSON.stringify(rows.map(r=>[r.study_id,r.id,r.revision]));
  const member=await one(env,'SELECT * FROM members WHERE id=?',repo.member_id);if(!member)return {count:0};
  const config=await githubConfig(env);if(!config)return {count:0};
  const token=await installationToken(config,repo,fetcher),prefix=`/repos/${repo.full_name.split('/').map(encodeURIComponent).join('/')}`;
  if(!rounds.length){
   try{await github(prefix+'/commits?'+new URLSearchParams({sha:repo.branch,per_page:'1'}),token,{fetcher});}catch(error){if(error.status!==409)throw error;}
   await run(env,'UPDATE repositories SET sync_error=NULL,updated_at=? WHERE member_id=? AND platform=?',now,repo.member_id,repo.platform);
   return {count:0,more:false,waitingForRound:true,accessVerified:true};
  }
  const certified=new Map((await many(env,`SELECT c.round_id,c.problem_id,c.at FROM certificates c JOIN rounds r ON r.id=c.round_id
   JOIN study_memberships m ON m.study_id=r.study_id AND m.member_id=c.member_id WHERE c.member_id=?`,member.id)).map(c=>[c.round_id+':'+c.problem_id,c.at]));
  let cursor;try{cursor=JSON.parse(repo.sync_cursor||'null');}catch{}
  // The completed scan retains its target signature. A new study, round, or edit
  // invalidates it and scans from the earliest relevant start, without new polling.
  const sameTargets=cursor?.signature===signature;
  if(!sameTargets||cursor.done){
   const start=Math.min(...rounds.map(r=>Date.parse(r.startDate+'T00:00:00+09:00')));
   let since=repo.checked_at?Math.max(start,Date.parse(repo.checked_at)-3600000):start;
   if(!sameTargets){
    let previous=[];try{previous=JSON.parse(cursor?.signature||'[]');}catch{}
    const changed=rows.filter(r=>!previous.some(t=>t[0]===r.study_id&&t[1]===r.id&&t[2]===r.revision));
    if(changed.length)since=Math.min(since,...changed.map(r=>Date.parse(r.start_date+'T00:00:00+09:00')));
    if(cursor&&!cursor.done&&cursor.since)since=Math.min(since,Date.parse(cursor.since));
   }
   cursor={signature,since:new Date(since).toISOString(),until:new Date(now).toISOString(),page:1,offset:0};
  }
  const commits=await github(prefix+'/commits?'+new URLSearchParams({sha:repo.branch,since:cursor.since,until:cursor.until,per_page:'10',page:String(cursor.page)}),token,{fetcher});
  let count=0,processed=0;
  for(let i=cursor.offset;i<commits.length&&processed<3;i++,processed++){
   const commit=await github(prefix+'/commits/'+encodeURIComponent(commits[i].sha),token,{fetcher});
   if((commit.files||[]).length>=100)throw new Error('변경 파일이 많은 커밋은 사진으로 인증해 주세요.');
   const evidenceCache=new Map();let discovered;
   for(const round of rounds){
    if(!eligibleCommit(commit,member,round,now))continue;
    let candidates;
    if(isFree(round)){
     if(Date.parse(commit.commit.committer.date)>=+deadlineExclusive(round)||!allowsPlatform(round.rules,repo.platform))continue;
     discovered??=await discoverCommitProblems(commit,repo,token,fetcher);
     candidates=discovered;
    }else candidates=round.problems.filter(p=>p.platform===repo.platform).map(problem=>({problem}));
    for(const candidate of candidates){
     const {problem}=candidate,key=round.id+':'+problem.id,existing=certified.get(key);
     if(existing&&Date.parse(existing)<=Date.parse(commit.commit.committer.date))continue;
     if(isFree(round))await rememberFreeProblem(env,round,problem,member.id);
     if(!evidenceCache.has(problem.id))evidenceCache.set(problem.id,candidate.evidence||await evidenceForCommit(commit,problem,repo,token,fetcher));
     const evidence=evidenceCache.get(problem.id);if(!evidence)continue;
     const result=await run(env,`INSERT INTO certificates(round_id,member_id,problem_id,method,at,observed_at,evidence)
      SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM rounds r JOIN study_memberships m ON m.study_id=r.study_id WHERE r.id=? AND r.revision=? AND m.member_id=?)
      ON CONFLICT(round_id,member_id,problem_id) DO UPDATE SET method=excluded.method,at=excluded.at,observed_at=excluded.observed_at,evidence=excluded.evidence WHERE excluded.at<certificates.at`,round.id,member.id,problem.id,'github',evidence.at,new Date(now).toISOString(),JSON.stringify(evidence),round.id,round.revision,member.id);
     if(!existing)count+=result.meta.changes;certified.set(key,evidence.at);
    }
   }
   cursor.offset=i+1;
  }
  let more=cursor.offset<commits.length;
  if(!more&&commits.length===10){cursor.page++;cursor.offset=0;more=true;}
  if(cursor.page>30)throw new Error('커밋이 너무 많아요. 저장소 범위를 확인하거나 사진으로 인증해 주세요.');
  if(!more)cursor.done=true;
  const updated=more?(repo.checked_at||null):cursor.until;
  const saved=await run(env,`UPDATE repositories SET checked_at=?,sync_cursor=?,sync_error=NULL,updated_at=? WHERE member_id=? AND platform=?
   AND NOT EXISTS(SELECT 1 FROM json_each(?) target WHERE NOT EXISTS(SELECT 1 FROM rounds r WHERE r.study_id=json_extract(target.value,'$[0]') AND r.id=json_extract(target.value,'$[1]') AND r.revision=json_extract(target.value,'$[2]')))`,updated,JSON.stringify(cursor),now,repo.member_id,repo.platform,signature);
  if(!saved.meta.changes)return {count,more:true,roundChanged:true};
  return {count,more,checkedAt:updated};
 }catch(error){
  const message=error instanceof GitHubError||error.message?.includes('커밋')?error.message:'저장소 확인을 마치지 못했어요. 잠시 후 다시 확인해 주세요.';
  await run(env,'UPDATE repositories SET sync_error=?,updated_at=? WHERE member_id=? AND platform=?',message,now,repo.member_id,repo.platform);throw new Error(message,{cause:error});
 }finally{await run(env,'DELETE FROM sync_locks WHERE id=?',lock);}
}
