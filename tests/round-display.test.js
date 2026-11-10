import test from 'node:test';
import assert from 'node:assert/strict';
import {createSeed,roundSummary} from '../public/core.js';
import {dashboard} from '../public/dashboard.js';
const members=[{id:'me',name:'예시 사용자'},{id:'2',name:'실제 출제자'},{id:'3',name:'다음 팀원'}];
test('live dashboard separates author and registrar and only shows editing controls to an owner',()=>{
 const state=createSeed(),r=state.rounds[0];r.setter='2';r.registeredBy='me';
 const context={state,members,icon:()=>'',avatar:()=>''};
 const owner=dashboard({...context,canEdit:true}),viewer=dashboard({...context,canEdit:false});
 assert.ok(owner.includes('출제 실제 출제자'));assert.ok(owner.includes('등록 예시 사용자'));assert.ok(owner.includes('다음 팀원'));assert.ok(owner.includes('#edit/'+r.id));assert.ok(!viewer.includes('#edit/'));
 assert.ok(roundSummary(r,members).includes('출제: 실제 출제자'));
});
test('an author recorded by name never falls back to the registrar or fabricates the next setter',()=>{
 const state=createSeed(),r=state.rounds[0];r.setter=null;r.setterName='출제자 예시';r.registeredBy='me';
 const html=dashboard({state,members,icon:()=>'',avatar:()=>'',canEdit:true});
 assert.ok(html.includes('출제 출제자 예시'));assert.ok(html.includes('등록 예시 사용자'));assert.ok(html.includes('미정'));assert.ok(!html.includes('출제 예시 사용자'));assert.ok(roundSummary(r,members).includes('출제: 출제자 예시'));
});
