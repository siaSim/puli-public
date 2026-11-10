import {randomToken,hash,seal,unseal} from './crypto.js';
import {one,run} from './store.js';
import {githubConfig} from './sync.js';

export const SESSION_SECONDS=8*3600;
export const REMEMBER_SECONDS=30*86400;
export class SessionError extends Error {
 constructor(status,code,message){super(message);this.status=status;this.code=code;}
}
const expired=()=>new SessionError(401,'SESSION_EXPIRED','로그인이 만료됐어요. GitHub로 다시 로그인해 주세요.');
export function returnPath(value){return /^\/#(?:home|studies|new-study|study-settings|connect|register|verify|(?:verify|edit|solutions)\/[a-z0-9-]+)$/i.test(value||'')?value:'/#home';}
export function tokenData(result,remember,now=Date.now()){
 const seconds=Number(result.expires_in),refreshSeconds=Number(result.refresh_token_expires_in);
 return {token:result.access_token,remember:!!remember,
  ...(seconds>0?{expiresAt:now+seconds*1000}:{}),
  ...(result.refresh_token?{refreshToken:result.refresh_token,refreshExpiresAt:now+(refreshSeconds>0?refreshSeconds:180*86400)*1000}:{})};
}
export async function createSession(env,memberId,result,remember,{now=Date.now()}={}){
 const tokens=tokenData(result,remember,now),raw=randomToken();
 let seconds=remember?REMEMBER_SECONDS:SESSION_SECONDS;
 if(tokens.expiresAt&&!tokens.refreshToken)seconds=Math.min(seconds,Math.floor((tokens.expiresAt-now)/1000));
 const expiresAt=now+seconds*1000;
 await run(env,'INSERT INTO sessions(hash,member_id,sealed_token,expires_at) VALUES (?,?,?,?)',await hash(raw),memberId,await seal(tokens,env.ENCRYPTION_KEY),expiresAt);
 return {raw,seconds,expiresAt,remember:!!remember};
}
export async function sessionTokens(env,session,{fetcher=fetch,now=Date.now()}={}){
 let tokens=await unseal(session.sealed_token,env.ENCRYPTION_KEY);
 if(!tokens.expiresAt||tokens.expiresAt>now+60000)return tokens;
 if(!tokens.refreshToken||tokens.refreshExpiresAt<=now){await run(env,'DELETE FROM sessions WHERE hash = ?',session.hash);throw expired();}
 const lockId='session:'+session.hash,until=now+20000;
 const lock=await env.DB.prepare('INSERT INTO sync_locks(id,expires_at) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET expires_at=excluded.expires_at WHERE sync_locks.expires_at <= ? RETURNING id').bind(lockId,until,now).first();
 if(!lock)throw new SessionError(503,'SESSION_REFRESH_BUSY','로그인 정보를 갱신하고 있어요. 잠시 후 다시 시도해 주세요.');
 try{
  // Read again after the lease: another request may have refreshed or logged out.
  const current=await one(env,'SELECT * FROM sessions WHERE hash = ? AND expires_at > ?',session.hash,now);
  if(!current)throw expired();
  tokens=await unseal(current.sealed_token,env.ENCRYPTION_KEY);
  if(!tokens.expiresAt||tokens.expiresAt>now+60000)return tokens;
  const config=await githubConfig(env);
  let response;
  try{response=await fetcher('https://github.com/login/oauth/access_token',{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify({client_id:config.client_id,client_secret:config.client_secret,grant_type:'refresh_token',refresh_token:tokens.refreshToken}),signal:AbortSignal.timeout(12000)});}catch{throw new SessionError(503,'SESSION_REFRESH_UNAVAILABLE','GitHub 연결이 잠시 지연되고 있어요. 다시 시도해 주세요.');}
  let result;try{result=await response.json();}catch{throw new SessionError(503,'SESSION_REFRESH_UNAVAILABLE','GitHub 로그인 갱신에 잠시 실패했어요. 다시 시도해 주세요.');}
  if(response.status>=500||response.status===429)throw new SessionError(503,'SESSION_REFRESH_UNAVAILABLE','GitHub 로그인 갱신에 잠시 실패했어요. 다시 시도해 주세요.');
  if(!response.ok||!result.access_token){
   await run(env,'DELETE FROM sessions WHERE hash = ? AND sealed_token = ?',session.hash,current.sealed_token);
   throw expired();
  }
  const updated=tokenData(result,tokens.remember,now);
  const saved=await run(env,'UPDATE sessions SET sealed_token = ? WHERE hash = ? AND sealed_token = ? AND expires_at > ?',await seal(updated,env.ENCRYPTION_KEY),session.hash,current.sealed_token,now);
  if(!saved.meta.changes)throw expired();
  return updated;
 }finally{await run(env,'DELETE FROM sync_locks WHERE id = ? AND expires_at = ?',lockId,until);}
}
