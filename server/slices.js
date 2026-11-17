import {many,one} from './store.js';

// Each award represents one personal slice and a separate slice for its study.
export async function sliceSummary(env,memberId,studyId){
 const row=await one(env,`SELECT
  (SELECT COUNT(*) FROM slice_awards WHERE member_id=?) AS personal,
  (SELECT COUNT(*) FROM slice_awards WHERE study_id=?) AS team`,memberId,studyId);
 return {personal:row.personal,team:row.team};
}
export async function sliceHistory(env,memberId,studyId,scope,offset){
 const team=scope==='team';
 const rows=await many(env,`SELECT a.round_id,a.member_id,a.problem_id,a.method,a.certified_at,a.awarded_at,a.retroactive,
  r.title AS round_title,s.name AS study_name,m.name AS member_name,
  COALESCE(f.title,(SELECT json_extract(j.value,'$.title') FROM json_each(r.problems) j WHERE json_extract(j.value,'$.id')=a.problem_id LIMIT 1),'문제') AS problem_title
  FROM slice_awards a JOIN rounds r ON r.id=a.round_id JOIN studies s ON s.id=a.study_id
  JOIN members m ON m.id=a.member_id LEFT JOIN free_problems f ON f.round_id=a.round_id AND f.problem_id=a.problem_id
  WHERE ${team?'a.study_id=?':'a.member_id=?'}
  ORDER BY a.awarded_at DESC,a.round_id DESC,a.member_id DESC,a.problem_id DESC LIMIT 26 OFFSET ?`,team?studyId:memberId,offset);
 return {scope,offset,hasMore:rows.length>25,items:rows.slice(0,25).map(r=>({roundId:r.round_id,memberId:r.member_id,problemId:r.problem_id,method:r.method,certifiedAt:r.certified_at,awardedAt:r.awarded_at,retroactive:!!r.retroactive,roundTitle:r.round_title,studyName:r.study_name,memberName:r.member_name,problemTitle:r.problem_title}))};
}
