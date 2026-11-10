const compact=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
const lines=value=>String(value||'').split(/\r?\n/).map(compact).filter(Boolean);

function assessSingle(problem,ocr={},assigned=[]) {
 const text=typeof ocr.text==='string'?ocr.text.slice(0,6000):'',confidence=Number(ocr.confidence);
 const base={problemMatch:false,passed:false,confidence:Number.isFinite(confidence)?confidence:0,source:'browser-ocr'};
 if(ocr.engine!=='tesseract.js-7'||!text.trim())return {...base,verdict:'unavailable',reason:'글자를 인식하지 못했어요. 팀원이 사진을 확인해 주세요.'};
 const identityText=text.split(/(?:more|next|related)\s+challenges|추천\s*문제|다음\s*문제/i)[0];
 const items=lines(identityText),title=compact(problem.title);
 const id=problem.id.replace(/^pg-/,'');
 const links=[...identityText.matchAll(/(?:https?:\/\/)?(?:www\.)?(?:leetcode\.com\/problems\/([a-z0-9-]+)|(?:school\.)?programmers\.co\.kr\/learn\/courses\/\d+\/lessons\/(\d+))/gi)];
 const linkId=match=>match[1]?'lc-'+match[1].toLowerCase():'pg-'+match[2];
 const numberMatch=problem.platform==='programmers'&&items.includes('문제번호'+id);
 const problemMatch=!!(numberMatch||links.some(match=>linkId(match)===problem.id)||title.length>=3&&items.some(line=>line===title||line==='문제'+title||line==='문제설명'+title||line===title+'프로그래머스'||/^\d+$/.test(line.slice(0,-title.length))&&line.endsWith(title)));
 const conflicting=links.some(match=>linkId(match)!==problem.id)||assigned.some(other=>other.id!==problem.id&&compact(other.title).length>=3&&items.includes(compact(other.title)));
 const sampleCounts=[...compact(text).matchAll(/(\d+)개중(\d+)개성공/g)],acceptedCounts=[...text.matchAll(/accepted\s+(\d+)\s*\/\s*(\d+)\s+test\s*cases?\s+passed/gi)];
 const failed=acceptedCounts.some(m=>Number(m[1])!==Number(m[2])||Number(m[1])===0)||sampleCounts.some(m=>Number(m[2])<Number(m[1]))||/기댓값[^\n]*다릅니다/.test(compact(text))||/\b(wrong answer|runtime error|time limit exceeded|memory limit exceeded|compile error|compilation error)\b/i.test(text)||/(오답|실패|시간\s*초과|런타임\s*(에러|오류)|컴파일\s*(에러|오류))/.test(text)||/실행한\s*결[괏과]값[^\n]*기댓값[^\n]*다릅니다/.test(text);
 const passed=problem.platform==='leetcode'?text.split(/\r?\n/).some(line=>{const match=line.match(/^\s*[^\p{L}\p{N}]*accepted(?:\s+(\d+)\s*\/\s*(\d+)\s+test\s*cases?\s+passed)?(?:\s*$|\s*[\[|©@]\s*(?:[©+]\s*)?(?:editorial|solution)\b)/iu);return !!match&&(!match[1]||Number(match[1])>0&&match[1]===match[2]);}):lines(text).includes('정답입니다')||/모든\s*테스트(?:를)?\s*통과(?:했습니다|하였습니다)/.test(text)||/합계\s*[:：;]?\s*100(?:\.0+)?\s*\/\s*100(?:\.0+)?(?![\d.])/.test(text);
 const result={...base,problemMatch,passed:passed&&!failed};
 if(failed||conflicting)return {...result,verdict:'mismatch',reason:failed?'실패 또는 오답 문구가 보여요. 팀원이 원본을 확인해 주세요.':'선택한 문제와 다른 문제의 주소나 이름이 보여요. 팀원이 원본을 확인해 주세요.'};
 if(problemMatch&&passed&&confidence>=80)return {...result,verdict:'match',reason:'문제 식별 정보와 최종 통과 문구가 일치해요.'};
 return {...result,verdict:'unclear',reason:!problemMatch?'선택한 문제의 이름이나 번호를 확인하지 못했어요.':!passed?'최종 통과 결과를 확인하지 못했어요. 테스트 실행 결과만으로는 인증하지 않아요.':'글자 인식이 불분명해요. 팀원이 원본을 확인해 주세요.'};
}

export function validOCRRuns(ocr){
 if(ocr.runs===undefined)return true;
 return Array.isArray(ocr.runs)&&ocr.runs.length>=1&&ocr.runs.length<=4&&ocr.runs.every(r=>r&&['original','enhanced','identity','result'].includes(r.kind)&&typeof r.text==='string'&&r.text.length<=2800&&typeof r.confidence==='number'&&Number.isFinite(r.confidence)&&r.confidence>=0&&r.confidence<=100)&&ocr.runs[0].kind==='original'&&new Set(ocr.runs.map(r=>r.kind)).size===ocr.runs.length&&new TextEncoder().encode(JSON.stringify(ocr)).length<=58000;
}
export function assessPhotoOCR(problem,ocr={},assigned=[]){
 if(!validOCRRuns(ocr))return {...assessSingle(problem,{},assigned),reason:'인식 결과가 불분명해요. 팀원이 원본을 확인해 주세요.'};
 if(!ocr.runs||ocr.engine!=='tesseract.js-7')return assessSingle(problem,ocr,assigned);
 const runs=ocr.runs.map(r=>({...r,assessment:assessSingle(problem,{...r,engine:ocr.engine},assigned)}));
 const base={...assessSingle(problem,ocr,assigned),passes:runs.length,enhanced:runs.some(r=>r.kind==='enhanced'),overallConfidence:ocr.confidence};
 // A second pass must never erase a failure or a conflicting problem seen in the original.
 if(base.verdict==='mismatch')return base;
 const conflict=runs.find(r=>r.assessment.verdict==='mismatch');if(conflict)return {...base,...conflict.assessment,passes:runs.length,enhanced:base.enhanced,overallConfidence:ocr.confidence};
 const complete=runs.filter(r=>['original','enhanced'].includes(r.kind)),match=complete.find(r=>r.assessment.verdict==='match');
 if(match)return {...base,...match.assessment,passes:runs.length,enhanced:base.enhanced,overallConfidence:ocr.confidence};
 const identity=runs.find(r=>['identity','original','enhanced'].includes(r.kind)&&r.assessment.problemMatch&&r.confidence>=80),passed=runs.find(r=>['result','original','enhanced'].includes(r.kind)&&r.assessment.passed&&r.confidence>=80);
 if(identity&&passed)return {...base,problemMatch:true,passed:true,confidence:Math.min(identity.confidence,passed.confidence),identityConfidence:identity.confidence,resultConfidence:passed.confidence,verdict:'match',reason:'문제 식별 정보와 최종 통과 문구를 확대하여 확인했어요.'};
 const best=complete.map(r=>r.assessment).sort((a,b)=>Number(b.problemMatch)-Number(a.problemMatch)||Number(b.passed)-Number(a.passed)||b.confidence-a.confidence)[0];
 const problemMatch=runs.some(r=>['identity','original','enhanced'].includes(r.kind)&&r.assessment.problemMatch),passedText=runs.some(r=>['result','original','enhanced'].includes(r.kind)&&r.assessment.passed);
 return {...base,...best,problemMatch,passed:passedText,passes:runs.length,enhanced:base.enhanced,overallConfidence:ocr.confidence,reason:!problemMatch?'선택한 문제의 이름이나 번호를 확인하지 못했어요.':!passedText?'최종 통과 결과를 확인하지 못했어요. 테스트 실행 결과만으로는 인증하지 않아요.':'문제 또는 통과 글자의 인식 점수가 부족해요. 팀원이 원본을 확인해 주세요.'};
}

export function photoSubmission(state,roundId,memberId,problemId) {
 return state.photoSubmissions?.find(s=>s.roundId===roundId&&s.memberId===memberId&&s.problemId===problemId)||null;
}
