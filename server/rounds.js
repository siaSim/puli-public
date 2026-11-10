import {DEFAULT_RULES} from '../public/rules.js';
import {studyId} from './studies.js';
import {one,many,run,asRound} from './store.js';
import {validateRound,kstDate} from '../public/core.js';

export class RoundError extends Error {
 constructor(status,message,fields){super(message);this.status=status;this.fields=fields;}
}
const fail=(status,message,fields)=>{throw new RoundError(status,message,fields);};
const requireOwner=session=>{if(session.role!=='owner')fail(403,'스터디 운영자만 할 수 있어요.');};
function checkInput(data){
 if(!data||typeof data!=='object'||Array.isArray(data)||typeof data.title!=='string'||!Array.isArray(data.problems)||data.problems.some(p=>!p||typeof p.title!=='string'||typeof p.url!=='string'))fail(400,'회차 입력 형식을 확인해 주세요.');
 if(data.title.length>120||data.problems.length>50||data.problems.some(p=>p.title.length>120||p.url.length>2048||['difficulty','tag'].some(k=>p[k]!==undefined&&(typeof p[k]!=='string'||p[k].length>80))))fail(400,'제목 또는 링크가 너무 길거나 문제 수가 너무 많아요.');
 if(data.historyOnly!==undefined&&typeof data.historyOnly!=='boolean')fail(400,'지난 회차 등록 여부를 확인해 주세요.');
}
function historyMetadata(data){
 if(!data.historyOnly){if(data.historyMeta!==undefined||data.historyKey!==undefined)fail(400,'출처 정보는 지난 문제 기록에만 사용할 수 있어요.');return null;}
 const meta=data.historyMeta??{};
 if(!meta||typeof meta!=='object'||Array.isArray(meta)||Object.entries({author:80,deadlineLabel:80,note:300}).some(([k,n])=>meta[k]!==undefined&&(typeof meta[k]!=='string'||meta[k].length>n))||(meta.source!==undefined&&!['manual','kakao'].includes(meta.source))||(meta.deadlineKnown!==undefined&&typeof meta.deadlineKnown!=='boolean')||(meta.postedAt!==undefined&&(typeof meta.postedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+09:00$/.test(meta.postedAt)||meta.postedAt.slice(0,10)!==data.startDate||!Number.isFinite(Date.parse(meta.postedAt)))))fail(400,'지난 기록의 출처 정보를 확인해 주세요.');
 if(data.historyKey!==undefined&&(typeof data.historyKey!=='string'||!/^kakao:[a-f0-9]{64}$/.test(data.historyKey)||meta.source!=='kakao'))fail(400,'가져오기 식별자를 확인해 주세요.');
 return {source:meta.source||'manual',dateBased:data.number===undefined,deadlineKnown:meta.deadlineKnown!==false,...Object.fromEntries(['postedAt','author','deadlineLabel','note'].filter(k=>meta[k]).map(k=>[k,meta[k]]))};
}
async function author(env,session,data,existing){
 let setter=data.setter==='me'?session.member_id:data.setter,setterName=data.setterName;
 if(setter===undefined){
  if(existing){setter=existing.setter;setterName??=existing.setterName;}
  else if(data.historyOnly&&data.historyMeta?.author){setter=null;setterName=data.historyMeta.author;}
  else setter=session.member_id;
 }
 if(setter===null){
  requireOwner(session);
  if(typeof setterName!=='string'||!setterName.trim()||setterName.trim().length>80)fail(400,'출제자 이름을 입력해 주세요.',{setterName:'출제자 이름을 80자 이내로 입력해 주세요.'});
  return {legacySetter:session.member_id,setterName:setterName.trim(),unlinked:1};
 }
 if(typeof setter!=='string'||!await one(env,'SELECT member_id FROM study_memberships WHERE study_id=? AND member_id=?',studyId(session),setter))fail(400,'등록된 스터디 출제자를 선택해 주세요.',{setter:'등록된 팀원을 선택하거나 이름으로 기록해 주세요.'});
 if(session.role!=='owner'&&setter!==session.member_id)fail(403,'다른 출제자를 지정하는 일은 운영자만 할 수 있어요.');
 return {legacySetter:setter,setterName:null,unlinked:0};
}
function checkedProblems(data,rules=DEFAULT_RULES){
 const result=validateRound(data,{rules});
 if(!result.valid)fail(400,'회차 내용을 확인해 주세요.',result.errors);
 return result.problems.map(({id,title,platform,url,difficulty,tag})=>({id,title,platform,url,difficulty,tag}));
}

export async function createRound(env,session,data){
 checkInput(data);
 const study=await one(env,'SELECT rules,rules_revision FROM studies WHERE id=?',studyId(session)),rules=JSON.parse(study.rules);
 if(data.rulesRevision!==undefined&&data.rulesRevision!==study.rules_revision)fail(409,'운영 규칙이 바뀌었어요. 새로고침 후 새 규칙으로 등록해 주세요.');
 if(data.historyOnly||rules.mode==='free')requireOwner(session);
 const meta=historyMetadata(data),problems=checkedProblems(data,rules),setter=await author(env,session,data);
 const members=await many(env,'SELECT member_id AS id FROM study_memberships WHERE study_id=? ORDER BY slot',studyId(session)),last=await one(env,'SELECT * FROM rounds WHERE study_id=? AND history_only = 0 ORDER BY number DESC LIMIT 1',studyId(session));
 const lastSetter=last?asRound(last).setter:null;
 const next=last?(lastSetter?members[(members.findIndex(m=>m.id===lastSetter)+1)%members.length].id:null):session.member_id;
 if(!data.historyOnly){
  if(rules.mode!=='free'&&session.role!=='owner'&&session.member_id!==next)fail(403,'이번 출제 차례 또는 운영자만 등록할 수 있어요.');
  if(data.startDate<kstDate())fail(400,'새 회차의 공개일은 오늘 이후로 정해 주세요. 지난 문제는 지난 회차 등록을 선택해 주세요.');
  if(last&&data.startDate<=last.deadline_date)fail(400,'회차 기간이 겹치지 않게 공개일을 정해 주세요.');
 }
 const bounds=await one(env,'SELECT COALESCE(MAX(number),0) AS maximum,COALESCE(MIN(number),0) AS minimum FROM rounds WHERE study_id=?',studyId(session));
 const number=data.historyOnly?(data.number??Math.min(0,bounds.minimum)-1):Math.max(0,bounds.maximum)+1;
 if(await one(env,'SELECT id FROM rounds WHERE study_id=? AND number = ?',studyId(session),number))fail(409,'이미 사용한 회차 번호입니다.',{number:'이미 등록된 회차 번호예요. 기존 회차는 덮어쓰지 않습니다.'});
 const key=data.historyKey??null;
 if(key&&await one(env,'SELECT id FROM rounds WHERE study_id=? AND history_key = ?',studyId(session),key))fail(409,'이미 가져온 출제글입니다. 기존 기록은 덮어쓰지 않습니다.');
 if(!data.historyOnly&&await one(env,'SELECT id FROM rounds WHERE study_id=? AND history_only = 0 AND start_date <= ? AND deadline_date >= ?',studyId(session),data.deadlineDate,data.startDate))fail(409,'이미 등록한 회차와 기간이 겹쳐요. 날짜를 확인해 주세요.');
 const id=crypto.randomUUID(),endDate=meta?.deadlineKnown===false?data.startDate:data.deadlineDate;
 // Legacy setter stays non-null in storage; setter_unlinked prevents treating the registrar as a named author's GitHub identity.
 const result=await run(env,'INSERT INTO rounds(id,number,title,start_date,deadline_date,setter,problems,created_at,history_only,history_meta,history_key,registered_by,setter_name,setter_unlinked,study_id,rules,deadline_time) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM rounds WHERE study_id=? AND (number = ? OR (? IS NOT NULL AND history_key = ?) OR (? = 0 AND history_only = 0 AND start_date <= ? AND deadline_date >= ?))) AND EXISTS (SELECT 1 FROM studies WHERE id=? AND rules_revision=?)',id,number,data.title.trim(),data.startDate,endDate,setter.legacySetter,JSON.stringify(problems),new Date().toISOString(),data.historyOnly?1:0,meta?JSON.stringify(meta):null,key,session.member_id,setter.setterName,setter.unlinked,studyId(session),data.historyOnly?null:JSON.stringify(rules),data.deadlineTime||rules.deadlineTime,studyId(session),number,key,key,data.historyOnly?1:0,endDate,data.startDate,studyId(session),study.rules_revision);
 if(!result.meta.changes)fail(409,'같은 회차 번호 또는 기간이 방금 등록됐어요. 새로고침해 주세요.');
 return {id};
}

export async function updateRound(env,session,id,data){
 requireOwner(session);
 if(!data||typeof data!=='object'||Array.isArray(data))fail(400,'수정 내용을 확인해 주세요.');
 const row=await one(env,'SELECT * FROM rounds WHERE id = ? AND study_id=?',id,studyId(session));if(!row)fail(404,'회차를 찾을 수 없어요.');
 if(!Number.isInteger(data.revision)||data.revision!==row.revision)fail(409,'다른 곳에서 회차를 수정했어요. 새로고침 후 다시 수정해 주세요.',{revision:'다른 곳에서 회차를 수정했어요. 새로고침 후 최신 내용을 확인해 주세요.'});
 const original=asRound(row);
 for(const [key,value] of Object.entries({startDate:original.startDate,historyOnly:original.historyOnly,number:original.number}))if(data[key]!==undefined&&data[key]!==value)fail(400,'출제일과 회차 종류·번호는 수정할 수 없어요.');
 if(data.historyKey!==undefined)fail(400,'출처 식별자는 수정할 수 없어요.');
 const merged={...original,...data,startDate:original.startDate,historyOnly:original.historyOnly};
 if(original.historyOnly){
  merged.number=original.historyMeta?.dateBased?undefined:original.number;
  merged.historyMeta={...(original.historyMeta||{source:'manual',dateBased:false}),deadlineKnown:!!merged.deadlineDate};
  if(merged.deadlineDate!==original.deadlineDate)delete merged.historyMeta.deadlineLabel;
 }else delete merged.historyMeta;
 checkInput(merged);const problems=checkedProblems(merged,original.rules),setter=await author(env,session,data,original);
 const serialized=JSON.stringify(problems),ids=JSON.stringify(original.rules.mode==='free'?(await many(env,'SELECT problem_id FROM free_problems WHERE round_id=?',id)).map(p=>p.problem_id):problems.map(p=>p.id));
 const removed=await one(env,'SELECT problem_id FROM certificates WHERE round_id = ? AND problem_id NOT IN (SELECT value FROM json_each(?)) LIMIT 1',id,ids);
 if(removed)fail(409,'이미 인증된 문제는 다른 문제로 교체할 수 없어요. 제목이나 마감일은 수정할 수 있습니다.',{problems:'인증된 문제의 링크를 유지해 주세요. 다른 문제로 교체할 수 없습니다.'});
 if(!original.historyOnly&&await one(env,'SELECT id FROM rounds WHERE study_id=? AND id != ? AND history_only = 0 AND start_date <= ? AND deadline_date >= ?',studyId(session),id,merged.deadlineDate,original.startDate))fail(409,'다른 회차와 마감 기간이 겹쳐요.',{deadlineDate:'다른 회차와 기간이 겹치지 않도록 마감일을 선택해 주세요.'});
 const oldIds=original.problems.map(p=>p.id).sort().join(','),newIds=problems.map(p=>p.id).sort().join(',');
 const rescan=!original.historyOnly&&oldIds!==newIds,now=new Date().toISOString(),endDate=merged.deadlineDate||original.startDate;
 const result=await env.DB.batch([
  env.DB.prepare('UPDATE rounds SET registered_by = COALESCE(registered_by,setter),title = ?,deadline_date = ?,deadline_time = ?,setter = ?,setter_name = ?,setter_unlinked = ?,problems = ?,history_meta = ?,revision = revision + 1,updated_by = ?,updated_at = ? WHERE id = ? AND revision = ? AND NOT EXISTS (SELECT 1 FROM certificates WHERE round_id = ? AND problem_id NOT IN (SELECT value FROM json_each(?))) AND (? = 1 OR NOT EXISTS (SELECT 1 FROM rounds other WHERE other.study_id=rounds.study_id AND other.id != ? AND other.history_only = 0 AND other.start_date <= ? AND other.deadline_date >= ?))').bind(merged.title.trim(),endDate,merged.deadlineTime||original.deadlineTime,setter.legacySetter,setter.setterName,setter.unlinked,serialized,merged.historyOnly?JSON.stringify(merged.historyMeta):null,session.member_id,now,id,data.revision,id,ids,original.historyOnly?1:0,id,endDate,original.startDate),
  env.DB.prepare('UPDATE repositories SET checked_at = NULL,sync_cursor = NULL,updated_at = 0 WHERE ? = 1 AND member_id IN (SELECT member_id FROM study_memberships WHERE study_id=?) AND EXISTS (SELECT 1 FROM rounds WHERE id = ? AND revision = ? AND updated_at = ? AND updated_by = ?)').bind(rescan?1:0,studyId(session),id,data.revision+1,now,session.member_id),
  env.DB.prepare("UPDATE photo_submissions SET status='superseded',review_note='출제 문제가 바뀌어 이 확인 요청을 종료했어요.' WHERE round_id=? AND status='pending' AND problem_id NOT IN (SELECT value FROM json_each(?)) AND EXISTS (SELECT 1 FROM rounds WHERE id=? AND revision=? AND updated_at=? AND updated_by=?)").bind(id,ids,id,data.revision+1,now,session.member_id)
 ]);
 if(!result[0].meta.changes)fail(409,'인증 또는 다른 수정이 먼저 반영됐어요. 새로고침 후 내용을 확인해 주세요.',{revision:'인증이나 다른 수정이 먼저 반영됐어요. 새로고침 후 다시 확인해 주세요.'});
 return {id,revision:data.revision+1,rescan};
}
