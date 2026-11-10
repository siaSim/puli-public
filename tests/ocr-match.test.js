import test from 'node:test';
import assert from 'node:assert/strict';
import {assessPhotoOCR} from '../public/ocr-match.js';
const lc={id:'lc-array-partition',title:'Array Partition',platform:'leetcode'},pg={id:'pg-42862',title:'체육복',platform:'programmers'};
const ocr=text=>({engine:'tesseract.js-7',text,confidence:94});
test('matches explicit problem identity plus final accepted result in English and Korean',()=>{
 assert.equal(assessPhotoOCR(lc,ocr('561. Array Partition\nAccepted\nRuntime 0 ms')).verdict,'match');
 assert.equal(assessPhotoOCR(pg,ocr('체육복\n채점 결과\n합계: 100.0 / 100.0')).verdict,'match');
 assert.equal(assessPhotoOCR(pg,ocr('https://school.programmers.co.kr/learn/courses/30/lessons/42862\n정답입니다!')).verdict,'match');
});
test('sample execution, partial scores and a bare passing test never certify',()=>{
 for(const text of ['체육복\n테스트 1 통과\n테스트 2 통과','체육복\n정확성: 60.0','체육복\n합계: 100 / 1000','Accepted','Array Partition\nTest Result Passed'])assert.notEqual(assessPhotoOCR(text.includes('체육복')?pg:lc,ocr(text)).verdict,'match');
});
test('low confidence, wrong links and contradictory failures require a teammate',()=>{
 assert.equal(assessPhotoOCR(lc,{...ocr('Array Partition\nAccepted'),confidence:60}).verdict,'unclear');
 assert.equal(assessPhotoOCR(lc,ocr('Array Partition\nhttps://leetcode.com/problems/two-sum/\nAccepted')).verdict,'mismatch');
 assert.equal(assessPhotoOCR(lc,ocr('Array Partition\nAccepted\nWrong Answer')).verdict,'mismatch');
 assert.equal(assessPhotoOCR(pg,ocr('체육복\n정답입니다\n테스트 1 실패')).verdict,'mismatch');
});
test('missing OCR and caller-supplied verdict flags cannot fabricate a match',()=>{
 assert.equal(assessPhotoOCR(lc).verdict,'unavailable');
 assert.equal(assessPhotoOCR(lc,{engine:'unknown',text:'Array Partition\nAccepted',confidence:100,verdict:'match'}).verdict,'unavailable');
 assert.equal(assessPhotoOCR(lc,{...ocr('unrelated picture'),verdict:'match',problemMatch:true,passed:true}).verdict,'unclear');
});
test('real LeetCode status layouts accept icons and inline final counts, never partial or negated status',()=>{
 for(const status of ['© Accepted @ Editorial | + Solution','Accepted 1033 / 1033 testcases passed | © Solution','✓ Accepted'])assert.equal(assessPhotoOCR(lc,ocr('Array Partition\n'+status)).verdict,'match');
 for(const status of ['Not Accepted','Accepted 10 / 12 testcases passed','Accepted 0 / 0 testcases passed','console.log("Accepted")'])assert.notEqual(assessPhotoOCR(lc,ocr('Array Partition\n'+status)).verdict,'match');
});
test('related challenge titles never identify the submitted problem',()=>{
 const actual={id:'lc-linked-list-cycle',title:'Linked List Cycle',platform:'leetcode'},recommended={id:'lc-happy-number',title:'Happy Number',platform:'leetcode'};
 assert.notEqual(assessPhotoOCR(recommended,ocr('Accepted\nMore challenges\nHappy Number')).verdict,'match');
 assert.equal(assessPhotoOCR(recommended,ocr('https://leetcode.com/problems/linked-list-cycle/\nAccepted\nMore challenges\nHappy Number'),[actual,recommended]).verdict,'mismatch');
});
test('real Programmers sample failures and partial success cannot count as a final pass',()=>{
 const failed=ocr('실행한 결괏값 [4,3,0,1,0]이 기댓값 [4,3,1,1,0]과 다릅니다.\n테스트를 통과하였습니다.\n3개 중 1개 성공');
 assert.notEqual(assessPhotoOCR(pg,failed).verdict,'match');
});
test('an incidental numeric input and another problem sharing a URL prefix cannot identify the assigned problem',()=>{
 assert.notEqual(assessPhotoOCR(pg,ocr('배열 뒤집기\nInput 42862\n정답입니다')).verdict,'match');
 assert.equal(assessPhotoOCR(lc,ocr('https://leetcode.com/problems/array-partition-ii/\nAccepted')).verdict,'mismatch');
});
const multi=runs=>({engine:'tesseract.js-7',text:runs.map(r=>r.text).join('\n'),confidence:runs[0]?.confidence||0,runs});
const run=(kind,text,confidence=92)=>({kind,text,confidence});
test('reread problem and final status need independent 80+ evidence; noisy full-screen UI cannot dilute them',()=>{
 const runs=[run('original','https://leetcode.com/problems/array-partition/\n© Accepted @ Editorial',66),run('enhanced','Array Partition\nAccepted',75),run('identity','https://leetcode.com/problems/array-partition/',88),run('result','Accepted',96)];
 const result=assessPhotoOCR(lc,multi(runs));assert.equal(result.verdict,'match');assert.equal(result.confidence,88);assert.equal(result.overallConfidence,66);assert.equal(result.passes,4);
 assert.equal(assessPhotoOCR(lc,multi(runs.map(r=>r.kind==='identity'?{...r,confidence:79}:r))).verdict,'unclear');
});
test('a successful correction never erases original failures, partial status or another problem URL',()=>{
 for(const text of ['Array Partition\nWrong Answer','Array Partition\nAccepted 10 / 12 testcases passed','https://leetcode.com/problems/two-sum/\nAccepted']){
  const result=assessPhotoOCR(lc,multi([run('original',text,50),run('enhanced','Array Partition\nAccepted',99)]));assert.equal(result.verdict,'mismatch');
 }
});
test('dark Programmers corrections must still identify the exact problem and full score',()=>{
 assert.equal(assessPhotoOCR(pg,multi([run('original','체육복\n합계: 160 / 100',65),run('enhanced','체육복\n합계: 100.0 / 100.0',90)])).verdict,'match');
 assert.notEqual(assessPhotoOCR(pg,multi([run('original','타켓 넘버\n합계: 100 / 100',90),run('identity','타켓 넘버',99),run('result','합계: 100 / 100',99)])).verdict,'match');
});
test('malformed run arrays, fabricated run roles, one-sided crops and low-confidence text do not certify',()=>{
 for(const runs of [[],[run('identity','Array Partition'),run('result','Accepted')],[run('original','unclear',50),run('fake','Array Partition\nAccepted')],[run('original','unclear',50),run('identity','Array Partition\nAccepted')],[run('original','unclear',50),run('result','Array Partition\nAccepted')],[run('original','Array Partition\nAccepted',Infinity)]])assert.notEqual(assessPhotoOCR(lc,multi(runs)).verdict,'match');
});
