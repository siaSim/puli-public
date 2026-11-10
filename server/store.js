import {DEFAULT_RULES} from '../public/rules.js';
export const one = (env,sql,...args) => env.DB.prepare(sql).bind(...args).first();
export const run = (env,sql,...args) => env.DB.prepare(sql).bind(...args).run();
export async function many(env,sql,...args) {return (await env.DB.prepare(sql).bind(...args).all()).results;}
export function asRound(row) {const historyMeta=row.history_meta?JSON.parse(row.history_meta):null;return {id:row.id,number:row.number,title:row.title,startDate:row.start_date,deadlineTime:row.deadline_time||'23:59',rules:row.rules?JSON.parse(row.rules):{...DEFAULT_RULES},deadlineDate:historyMeta?.deadlineKnown===false?null:row.deadline_date,setter:row.setter_unlinked?null:row.setter,setterName:row.setter_name||null,registeredBy:row.registered_by||row.setter,revision:row.revision??0,updatedBy:row.updated_by||null,updatedAt:row.updated_at||null,problems:JSON.parse(row.problems),createdAt:row.created_at,historyOnly:!!row.history_only,historyMeta};}
export async function latestRound(env,studyId='study') {const r=await one(env,"SELECT * FROM rounds WHERE study_id=? AND history_only = 0 AND start_date <= ? ORDER BY number DESC LIMIT 1",studyId,new Date(Date.now()+32400000).toISOString().slice(0,10));return r?asRound((await hydrateRounds(env,[r]))[0]):null;}

export async function hydrateRounds(env,rows){
 if(!rows.some(r=>r.rules&&JSON.parse(r.rules).mode==='free'))return rows;
 const ids=JSON.stringify(rows.filter(r=>r.rules&&JSON.parse(r.rules).mode==='free').map(r=>r.id));
 const problems=await many(env,'SELECT * FROM free_problems WHERE round_id IN (SELECT value FROM json_each(?)) ORDER BY created_at,problem_id',ids);
 return rows.map(row=>row.rules&&JSON.parse(row.rules).mode==='free'?{...row,problems:JSON.stringify(problems.filter(p=>p.round_id===row.id).map(({problem_id:id,title,platform,url,difficulty,tag})=>({id,title,platform,url,difficulty,tag})))}:row);
}
export async function roundRow(env,id,studyId){
 const row=await one(env,'SELECT * FROM rounds WHERE id=?'+(studyId?' AND study_id=?':''),id,...(studyId?[studyId]:[]));
 return row?(await hydrateRounds(env,[row]))[0]:null;
}
