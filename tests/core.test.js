import test from 'node:test';
import assert from 'node:assert/strict';
import { EXAMPLES, createSeed, parseProblemURL, validateRound, isOnTime, nextTuesday, kstDate, putCertificate, memberCount, escapeHTML, isCalendarDate } from '../public/core.js';

const draft = () => ({ title: '이번 주 문제', startDate: '2026-10-21', deadlineDate: '2026-10-27', problems: structuredClone(EXAMPLES) });
test('KST switches to Wednesday at 15:00 UTC and picks the next Tuesday', () => {
  assert.equal(kstDate(new Date('2026-10-20T15:00:00Z')), '2026-10-21');
  assert.equal(nextTuesday(new Date('2026-10-20T14:59:59Z')), '2026-10-20');
  assert.equal(nextTuesday(new Date('2026-10-20T15:00:00Z')), '2026-10-27');
});
test('Tuesday entire final minute is accepted; Wednesday midnight is late', () => {
  assert.equal(isOnTime('2026-10-27T23:59:59.999+09:00', draft()), true);
  assert.equal(isOnTime('2026-10-28T00:00:00+09:00', draft()), false);
  assert.equal(isOnTime('2026-10-20T23:59:59+09:00', draft()), false);
});
test('normalizes problem URLs and preserves stable problem identity', () => {
  assert.deepEqual(parseProblemURL('https://leetcode.com/problems/two-sum/description/?envId=x#code', 'leetcode'), { id: 'lc-two-sum', url: 'https://leetcode.com/problems/two-sum/' });
  assert.equal(parseProblemURL('https://school.programmers.co.kr/learn/courses/30/lessons/42840?language=python3', 'programmers').id, 'pg-42840');
});
test('rejects executable URLs, host lookalikes and wrong platforms', () => {
  for (const url of ['javascript:alert(1)', 'http://leetcode.com/problems/two-sum', 'https://leetcode.com.evil.test/problems/two-sum/', 'https://user:pass@leetcode.com/problems/two-sum/']) assert.throws(() => parseProblemURL(url, 'leetcode'));
  assert.throws(() => parseProblemURL(EXAMPLES[0].url, 'programmers'));
});
test('accepts exactly one LeetCode and four Programmers problems', () => {
  assert.equal(validateRound(draft()).valid, true);
  const wrong = draft(); wrong.problems.pop(); assert.equal(validateRound(wrong).valid, false);
  const platform = draft(); platform.problems[2].platform = 'leetcode'; assert.equal(validateRound(platform).valid, false);
});
test('detects duplicate problems even if query parameters differ', () => {
  const d = draft(); d.problems[2].url = d.problems[1].url + '?language=javascript';
  assert.match(validateRound(d).errors['problem-2'], /이미 등록/);
});
test('requires a Tuesday deadline, nonempty titles and valid chronological dates', () => {
  const d = draft(); d.deadlineDate = '2026-10-28'; assert.match(validateRound(d).errors.deadlineDate, /화요일/);
  d.deadlineDate = '2026-10-20'; assert.match(validateRound(d).errors.deadlineDate, /공개일/);
  d.title = ''; assert.ok(validateRound(d).errors.title);
  assert.equal(isCalendarDate('2026-02-31'), false);
  assert.equal(isCalendarDate('2026-10-27'), true);
});
test('photo and GitHub evidence for one problem count once and stay scoped to a round', () => {
  const state = createSeed(new Date('2026-10-21T10:00:00+09:00')); const r = state.rounds[0];
  const target = r.problems[3].id;
  assert.equal(memberCount(state, r, 'me'), 3);
  putCertificate(state, r.id, 'me', target, { method: 'photo' });
  putCertificate(state, r.id, 'me', target, { method: 'github' });
  assert.equal(memberCount(state, r, 'me'), 4);
  assert.equal(memberCount(state, { ...r, id: 'next-round' }, 'me'), 0);
});
test('escapes user supplied titles and notes before HTML rendering', () => {
  assert.equal(escapeHTML('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
});
