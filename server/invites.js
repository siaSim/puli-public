import {randomToken,hash,seal,unseal} from './crypto.js';
import {one,run} from './store.js';
import {studyId,ensureAccount} from './studies.js';

export const INVITE_DAYS=7;
export const MEMBER_LIMIT=5;
export class InviteError extends Error {
 constructor(status,code,message){super(message);this.status=status;this.code=code;}
}
const unavailable=()=>new InviteError(410,'INVITE_UNAVAILABLE','초대 링크가 만료되었거나 새로 발급됐어요. 운영자에게 새 링크를 요청해 주세요.');
const owner=session=>{if(session.role!=='owner')throw new InviteError(403,'INVITE_OWNER_ONLY','초대 링크는 운영자만 관리할 수 있어요.');};
const countMembers=async(env,id)=>(await one(env,'SELECT COUNT(*) AS count FROM study_memberships WHERE study_id=?',id)).count;
async function activeInvite(env,tokenHash,now){
 if(typeof tokenHash!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(tokenHash))throw unavailable();
 const row=await one(env,'SELECT i.*,s.name,s.capacity,s.rules FROM invite_links i JOIN studies s ON s.id=i.id WHERE i.token_hash=? AND i.expires_at>?',tokenHash,now);
 if(!row)throw unavailable();
 return row;
}
export async function checkInvite(env,token,{now=Date.now()}={}){
 if(typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(token))throw unavailable();
 const tokenHash=await hash(token),row=await activeInvite(env,tokenHash,now),memberCount=await countMembers(env,row.id);
 const mode=row.rules&&JSON.parse(row.rules).mode==='free'?'free':'common';
 return {tokenHash,studyId:row.id,studyName:row.name,mode,expiresAt:row.expires_at,memberCount,limit:row.capacity,full:memberCount>=row.capacity};
}
export async function inviteDetails(env,session,base,{now=Date.now()}={}){
 owner(session);const id=studyId(session);
 const row=await one(env,'SELECT * FROM invite_links WHERE id=?',id),study=await one(env,'SELECT capacity FROM studies WHERE id=?',id),memberCount=await countMembers(env,id);
 const active=!!row&&row.expires_at>now;
 return {revision:row?.revision||0,active,expiresAt:row?.expires_at||null,days:INVITE_DAYS,memberCount,limit:study.capacity,
  ...(active?{url:base+'/#join/'+await unseal(row.sealed_token,env.ENCRYPTION_KEY)}:{})};
}
export async function rotateInvite(env,session,data,base,{now=Date.now()}={}){
 owner(session);const id=studyId(session);
 if(!data||typeof data!=='object'||Array.isArray(data)||!Number.isSafeInteger(data.revision)||data.revision<0||Object.keys(data).some(k=>k!=='revision'))throw new InviteError(400,'INVITE_INPUT','초대 링크 요청을 확인해 주세요.');
 const token=randomToken(),tokenHash=await hash(token),sealed=await seal(token,env.ENCRYPTION_KEY),expiresAt=now+INVITE_DAYS*86400000;
 const result=data.revision===0
  ?await run(env,'INSERT OR IGNORE INTO invite_links(id,token_hash,sealed_token,created_by,created_at,expires_at,revision) VALUES (?,?,?,?,?,?,1)',id,tokenHash,sealed,session.member_id,now,expiresAt)
  :await run(env,'UPDATE invite_links SET token_hash=?,sealed_token=?,created_by=?,created_at=?,expires_at=?,revision=revision+1 WHERE id=? AND revision=?',tokenHash,sealed,session.member_id,now,expiresAt,id,data.revision);
 if(!result.meta.changes)throw new InviteError(409,'INVITE_CHANGED','다른 곳에서 초대 링크를 변경했어요. 새로고침 후 다시 확인해 주세요.');
 return inviteDetails(env,session,base,{now});
}
export async function joinFromInvite(env,tokenHash,user,{now=Date.now()}={}){
 if(user.type!=='User'||!/^\d+$/.test(String(user.id))||typeof user.login!=='string'||!user.login)throw new InviteError(403,'INVITE_PERSONAL_ACCOUNT','개인 GitHub 계정으로 참여해 주세요.');
 const row=await activeInvite(env,tokenHash,now),id=row.id,memberId=String(user.id);
 const existing=await one(env,'SELECT * FROM study_memberships WHERE study_id=? AND member_id=?',id,memberId);
 if(existing)return {...await one(env,'SELECT * FROM members WHERE id=?',memberId),...existing,study_id:id};
 await ensureAccount(env,user);
 const result=await run(env,`INSERT OR IGNORE INTO study_memberships(study_id,member_id,role,slot,joined_at)
 SELECT ?,?,'member',COALESCE((SELECT MAX(slot)+1 FROM study_memberships WHERE study_id=?),0),?
 WHERE (SELECT COUNT(*) FROM study_memberships WHERE study_id=?)<(SELECT capacity FROM studies WHERE id=?)
 AND EXISTS(SELECT 1 FROM invite_links WHERE id=? AND token_hash=? AND expires_at>?)`,id,memberId,id,new Date(now).toISOString(),id,id,id,tokenHash,now);
 const member=await one(env,'SELECT * FROM study_memberships WHERE study_id=? AND member_id=?',id,memberId);
 if(member){
  if(result.meta.changes)await run(env,'UPDATE repositories SET checked_at=NULL,sync_cursor=NULL,updated_at=0 WHERE member_id=?',memberId);
  return {...await one(env,'SELECT * FROM members WHERE id=?',memberId),...member,study_id:id};
 }
 await activeInvite(env,tokenHash,now);
 if(await countMembers(env,id)>=row.capacity)throw new InviteError(409,'INVITE_FULL','스터디 정원이 모두 찼어요. 운영자에게 문의해 주세요.');
 throw new InviteError(409,'INVITE_ACCOUNT_CONFLICT','GitHub 계정 정보를 확인하지 못했어요. 운영자에게 문의해 주세요.');
}
