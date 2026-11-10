import {DEFAULT_RULES,validateRules} from '../public/rules.js';
import {one,many,run} from './store.js';

export const DEFAULT_STUDY='study';
export const studyId=s=>s.study_id||DEFAULT_STUDY;
export class StudyError extends Error {constructor(status,message){super(message);this.status=status;}}
const fail=(status,message)=>{throw new StudyError(status,message);};
export const studyView=r=>({id:r.id,name:r.name,description:r.description,capacity:r.capacity,role:r.role,memberCount:r.member_count,createdAt:r.created_at,rules:r.rules?JSON.parse(r.rules):{...DEFAULT_RULES},rulesRevision:r.rules_revision||0});
export async function listStudies(env,memberId){
 return (await many(env,`SELECT s.*,m.role,(SELECT COUNT(*) FROM study_memberships WHERE study_id=s.id) AS member_count
 FROM studies s JOIN study_memberships m ON m.study_id=s.id WHERE m.member_id=? ORDER BY s.created_at,s.id`,memberId)).map(studyView);
}
export async function studySession(env,session,requested){
 if(requested!==null&&requested!==undefined&&(typeof requested!=='string'||!requested||requested.length>80))fail(400,'스터디를 선택해 주세요.');
 const row=await one(env,`SELECT s.*,m.role,m.slot FROM study_memberships m JOIN studies s ON s.id=m.study_id
 WHERE m.member_id=? ${requested?'AND m.study_id=?':''} ORDER BY CASE WHEN s.id='study' THEN 0 ELSE 1 END,s.created_at,s.id LIMIT 1`,session.member_id,...(requested?[requested]:[]));
 if(!row)fail(403,'참여 중인 스터디를 선택해 주세요.');
 return {...session,study_id:row.id,role:row.role,slot:row.slot,study:{id:row.id,name:row.name,description:row.description,capacity:row.capacity,rules:row.rules?JSON.parse(row.rules):{...DEFAULT_RULES},rulesRevision:row.rules_revision||0}};
}
export async function createStudy(env,session,data){
 if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).some(k=>!['name','description','capacity','rules'].includes(k))||
 typeof data.name!=='string'||!data.name.trim()||data.name.trim().length>60||typeof(data.description??'')!=='string'||(data.description||'').length>300||
 !Number.isInteger(data.capacity)||data.capacity<1||data.capacity>20)fail(400,'이름은 60자, 소개는 300자 이내로 입력하고 정원은 1~20명으로 선택해 주세요.');
 let rules;try{rules=validateRules(data.rules===undefined?DEFAULT_RULES:data.rules);}catch(error){fail(400,error.message);}
 const id=crypto.randomUUID(),now=new Date().toISOString();
 const result=await env.DB.batch([
  env.DB.prepare(`INSERT INTO studies(id,name,description,capacity,created_by,created_at,rules)
   SELECT ?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM study_memberships WHERE member_id=? AND role='owner')<5`).bind(id,data.name.trim(),(data.description||'').trim(),data.capacity,session.member_id,now,JSON.stringify(rules),session.member_id),
  env.DB.prepare(`INSERT INTO study_memberships(study_id,member_id,role,slot,joined_at)
   SELECT ?,?,'owner',0,? WHERE EXISTS(SELECT 1 FROM studies WHERE id=?)`).bind(id,session.member_id,now,id)
 ]);
 if(!result[0].meta.changes)fail(409,'현재는 계정당 최대 5개의 스터디를 운영할 수 있어요.');
 return {study:(await listStudies(env,session.member_id)).find(s=>s.id===id)};
}
export async function ensureAccount(env,user){
 if(user.type!=='User'||!/^\d+$/.test(String(user.id))||typeof user.login!=='string'||!user.login)fail(403,'개인 GitHub 계정으로 로그인해 주세요.');
 await run(env,`INSERT INTO members(id,login,name,role,joined_at) VALUES (?,?,?,'member',?)
 ON CONFLICT(id) DO UPDATE SET login=excluded.login,name=excluded.name,joined_at=COALESCE(members.joined_at,excluded.joined_at)`,String(user.id),user.login,user.name||user.login,new Date().toISOString());
 return one(env,'SELECT * FROM members WHERE id=?',String(user.id));
}

export async function updateStudyRules(env,session,data){
 if(session.role!=='owner')fail(403,'운영 규칙은 스터디 운영자만 변경할 수 있어요.');
 if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).some(k=>!['revision','rules'].includes(k))||!Number.isInteger(data.revision)||data.revision<0)fail(400,'운영 규칙과 저장 버전을 확인해 주세요.');
 let rules;try{rules=validateRules(data.rules);}catch(error){fail(400,error.message);}
 const result=await run(env,'UPDATE studies SET rules=?,rules_revision=rules_revision+1 WHERE id=? AND rules_revision=?',JSON.stringify(rules),studyId(session),data.revision);
 if(!result.meta.changes)fail(409,'다른 곳에서 운영 규칙을 변경했어요. 새로고침 후 다시 저장해 주세요.');
 return {rules,revision:data.revision+1};
}
