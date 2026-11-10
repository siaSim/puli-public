import test from 'node:test';
import assert from 'node:assert/strict';
import {dailyActivity,activityCalendar} from '../public/activity.js';

const round={id:'r1',number:1,startDate:'2026-10-01',problems:[{id:'lc-two-sum',title:'Two Sum'},{id:'pg-42840',title:'모의고사'}]};
const now=Date.parse('2026-10-22T04:00:00+09:00');

test('daily grass groups commit and photo certification times at Korean midnight, independent of observation time',()=>{
 const state={rounds:[round],certificates:{r1:{me:{'lc-two-sum':{method:'github',at:'2026-10-20T14:59:59Z',observedAt:'2026-10-21T04:00:00Z'},'pg-42840':{method:'photo',at:'2026-10-20T15:00:00Z'}}}}};
 const result=dailyActivity(state,'me',{days:90,now});
 assert.deepEqual(Object.keys(result.byDate),['2026-10-20','2026-10-21']);
 assert.equal(result.byDate['2026-10-20'][0].proof.method,'github');
 assert.equal(result.byDate['2026-10-21'][0].proof.method,'photo');
 assert.equal(result.total,2);assert.equal(result.activeDays,2);
});
test('daily grass excludes personal problems, other members, unknown rounds, invalid and future evidence',()=>{
 const state={rounds:[round,{...round,id:'future',startDate:'2026-11-01'}],certificates:{r1:{me:{'lc-two-sum':{at:'invalid'},'pg-42840':{at:'2026-10-23T00:00:00+09:00'},'lc-three-sum':{at:'2026-10-21T01:00:00+09:00'}},other:{'lc-two-sum':{at:'2026-10-21T01:00:00+09:00'}}},unknown:{me:{'lc-two-sum':{at:'2026-10-21T01:00:00+09:00'}}},future:{me:{'lc-two-sum':{at:'2026-10-21T01:00:00+09:00'}}}}};
 assert.equal(dailyActivity(state,'me',{now}).total,0);
 assert.equal(dailyActivity(state,'other',{now}).total,1);
});
test('daily grass counts a round/problem only once, includes late certification and keeps separate assigned repeats across rounds',()=>{
 const at='2026-10-21T01:00:00+09:00';
 const state={rounds:[{...round,problems:[...round.problems,round.problems[0]],deadlineDate:'2026-10-06'},{...round,id:'r2',number:2}],certificates:{r1:{me:{'lc-two-sum':{method:'github',at}}},r2:{me:{'lc-two-sum':{method:'photo',at}}}}};
 const result=dailyActivity(state,'me',{now});assert.equal(result.total,2);assert.equal(result.activeDays,1);assert.equal(result.byDate['2026-10-21'].length,2);
});
test('daily grass uses an inclusive selected date range and excludes a solve before its round opened',()=>{
 const state={rounds:[{...round,startDate:'2026-01-01'}],certificates:{r1:{me:{'lc-two-sum':{at:'2026-07-25T00:00:00+09:00'},'pg-42840':{at:'2026-07-24T23:59:59+09:00'}}}}};
 const result=dailyActivity(state,'me',{days:90,now});assert.equal(result.startDate,'2026-07-25');assert.equal(result.endDate,'2026-10-22');assert.equal(result.total,1);
 assert.equal(dailyActivity({...state,rounds:[{...round,startDate:'2026-08-01'}]},'me',{now}).total,0);
});
test('daily calendar spans Sunday to Saturday, preserves leap day, and leaves dates outside the selected range blank',()=>{
 const calendar=activityCalendar('2024-02-28','2024-03-02');
 assert.equal(calendar.weeks.length,1);assert.deepEqual(calendar.weeks[0],[null,null,null,'2024-02-28','2024-02-29','2024-03-01','2024-03-02']);
 const full=activityCalendar('2025-10-22','2026-10-21');const days=full.weeks.flat().filter(Boolean);
 assert.equal(days.length,365);assert.equal(new Set(days).size,365);assert.equal(full.weeks[0].length,7);
});
