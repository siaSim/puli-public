import {studyId} from './studies.js';
import {one,run,roundRow} from './store.js';
import {assessPhotoOCR,validOCRRuns} from '../public/ocr-match.js';

export class PhotoError extends Error {constructor(status,message){super(message);this.status=status;}}
const fail=(status,message)=>{throw new PhotoError(status,message);};
export function asSubmission(row) {
 return {id:row.id,roundId:row.round_id,memberId:row.member_id,problemId:row.problem_id,photoId:row.photo_id,submittedAt:row.submitted_at,note:row.note,ocrText:row.ocr_text,assessment:JSON.parse(row.assessment),status:row.status,reviewedBy:row.reviewed_by,reviewedAt:row.reviewed_at,reviewNote:row.review_note};
}
const certificateSQL=(guard='')=>`INSERT INTO certificates(round_id,member_id,problem_id,method,at,observed_at,evidence)
 SELECT round_id,member_id,problem_id,'photo',submitted_at,?,? FROM photo_submissions WHERE id = ? AND status = 'approved' ${guard}
 ON CONFLICT(round_id,member_id,problem_id) DO UPDATE SET at=excluded.at,observed_at=excluded.observed_at,evidence=excluded.evidence
 WHERE certificates.method = 'photo' AND excluded.at >= certificates.at`;

export async function savePhotoSubmission(env,s,{round,problemId,bytes,note,ocr}) {
 if(ocr!==undefined&&(typeof ocr!=='object'||ocr===null||Array.isArray(ocr)||typeof ocr.text!=='string'||ocr.text.length>6000||typeof ocr.confidence!=='number'||!Number.isFinite(ocr.confidence)||ocr.confidence<0||ocr.confidence>100||!validOCRRuns(ocr)))fail(400,'사진 인식 결과를 확인해 주세요.');
 const problems=JSON.parse(round.problems),problem=problems.find(p=>p.id===problemId);
 const assessment=assessPhotoOCR(problem,ocr,problems),now=new Date().toISOString(),id=crypto.randomUUID(),photoId=crypto.randomUUID();
 const inserted=await run(env,'INSERT INTO photos(id,member_id,size,bytes,created_at,study_id) SELECT ?,?,?,?,?,? WHERE COALESCE((SELECT SUM(size) FROM photos),0) + ? <= ?',photoId,s.member_id,bytes.length,Array.from(bytes),now,studyId(s),bytes.length,100*1024*1024);
 if(!inserted.meta.changes)fail(507,'무료 사진 보관 한도에 도달했어요. 운영자가 오래된 사진을 정리한 뒤 다시 시도해 주세요.');
 const status=assessment.verdict==='match'?'approved':'pending';
 const evidence=JSON.stringify({photoId,note,submissionId:id,ocr:assessment,reviewedBy:null,reviewedAt:status==='approved'?now:null});
 try {
  const results=await env.DB.batch([
   env.DB.prepare("UPDATE photo_submissions SET status='superseded',review_note='새 사진을 제출하여 이전 확인 요청을 종료했어요.' WHERE round_id=? AND member_id=? AND problem_id=? AND status='pending' AND EXISTS (SELECT 1 FROM rounds WHERE id=? AND revision=?)").bind(round.id,s.member_id,problemId,round.id,round.revision),
   env.DB.prepare(`INSERT INTO photo_submissions(id,round_id,member_id,problem_id,photo_id,submitted_at,note,ocr_text,ocr_confidence,assessment,status,reviewed_at)
    SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM rounds WHERE id=? AND revision=?)`).bind(id,round.id,s.member_id,problemId,photoId,now,note,ocr?.text||'',assessment.confidence,JSON.stringify(assessment),status,status==='approved'?now:null,round.id,round.revision),
   env.DB.prepare(certificateSQL()).bind(now,evidence,id)
  ]);
  if(!results[1].meta.changes)fail(409,'회차 내용이 바뀌었어요. 새로고침 후 문제를 확인하고 다시 제출해 주세요.');
 } catch(error){await run(env,'DELETE FROM photos WHERE id=?',photoId);throw error;}
 return {ok:true,id,status,assessment};
}

export async function reviewPhoto(env,s,id,data) {
 if(!data||!['approve','reject'].includes(data.decision)||typeof(data.note??'')!=='string'||(data.note||'').length>500)fail(400,'승인 또는 반려와 확인 메모를 입력해 주세요.');
 if(data.decision==='reject'&&!data.note?.trim())fail(400,'반려 이유를 입력해 주세요.');
 const row=await one(env,'SELECT p.* FROM photo_submissions p JOIN rounds r ON r.id=p.round_id WHERE p.id=? AND r.study_id=?',id,studyId(s));if(!row)fail(404,'사진 제출 기록이 없어요.');
 if(row.member_id===s.member_id)fail(403,'본인이 제출한 사진은 다른 팀원이 확인해야 해요.');
 if(row.status!=='pending')fail(409,'이미 처리했거나 새 사진으로 바뀐 요청이에요. 목록을 새로 확인해 주세요.');
 const round=await roundRow(env,row.round_id,studyId(s));
 if(!round||round.history_only||!JSON.parse(round.problems).some(p=>p.id===row.problem_id))fail(409,'출제 문제가 바뀌었어요. 새 문제에 다시 제출해 주세요.');
 if(data.decision==='approve'&&!await one(env,'SELECT id FROM photos WHERE id=?',row.photo_id))fail(410,'원본 사진의 보관 기간이 지났어요. 새 사진을 요청해 주세요.');
 const now=new Date().toISOString(),status=data.decision==='approve'?'approved':'rejected';
 const evidence=JSON.stringify({photoId:row.photo_id,note:row.note,submissionId:id,ocr:JSON.parse(row.assessment),reviewedBy:s.member_id,reviewedAt:now});
 const batch=[env.DB.prepare("UPDATE photo_submissions SET status=?,reviewed_by=?,reviewed_at=?,review_note=? WHERE id=? AND status='pending' AND EXISTS (SELECT 1 FROM rounds WHERE id=? AND revision=?)").bind(status,s.member_id,now,(data.note||'').trim(),id,round.id,round.revision)];
 if(status==='approved')batch.push(env.DB.prepare(certificateSQL('AND reviewed_by = ? AND reviewed_at = ?')).bind(now,evidence,id,s.member_id,now));
 const results=await env.DB.batch(batch);
 if(!results[0].meta.changes)fail(409,'다른 팀원이 먼저 처리했거나 회차가 바뀌었어요. 목록을 새로 확인해 주세요.');
 return {ok:true,status};
}
