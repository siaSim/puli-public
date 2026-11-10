INSERT INTO members (id, login, name, role, slot, joined_at) VALUES
  ('101', 'migration-owner', '가상 운영자', 'owner', 0, '2026-06-01T00:00:00Z'),
  ('102', 'migration-member', '가상 팀원', 'member', 1, '2026-06-02T00:00:00Z'),
  ('103', 'migration-other', '다른 스터디 운영자', 'owner', NULL, '2026-06-03T00:00:00Z');

UPDATE studies SET created_by = '101' WHERE id = 'study';
INSERT INTO studies (id, name, capacity, created_by, created_at) VALUES
  ('migration-study', '별도 가상 스터디', 5, '103', '2026-06-01T00:00:00Z');

INSERT INTO study_memberships (study_id, member_id, role, slot, joined_at) VALUES
  ('study', '101', 'owner', 0, '2026-06-01T00:00:00Z'),
  ('study', '102', 'member', 1, '2026-06-02T00:00:00Z'),
  ('migration-study', '103', 'owner', 0, '2026-06-03T00:00:00Z');

INSERT INTO rounds (id, number, title, start_date, deadline_date, setter, problems, created_at, history_only, registered_by, study_id) VALUES
  ('migration-round', 1, '가상 회차', '2026-06-01', '2026-06-07', '101',
   '[{"id":"lc-two-sum","title":"Two Sum","platform":"leetcode","url":"https://leetcode.com/problems/two-sum/"}]',
   '2026-06-01T00:00:00Z', 0, '101', 'study'),
  ('migration-history', 2, '가상 지난 회차', '2026-05-25', '2026-05-31', '102', '[]',
   '2026-06-02T00:00:00Z', 1, '101', 'study'),
  ('migration-other-round', 1, '다른 스터디의 가상 회차', '2026-06-01', '2026-06-07', '103',
   '[{"id":"lc-two-sum","title":"Two Sum","platform":"leetcode","url":"https://leetcode.com/problems/two-sum/"}]',
   '2026-06-03T00:00:00Z', 0, '103', 'migration-study');

INSERT INTO certificates (round_id, member_id, problem_id, method, at, observed_at, evidence) VALUES
  ('migration-round', '101', 'lc-two-sum', 'github', '2026-06-03T00:00:00Z', '2026-06-03T01:00:00Z',
   '{"sha":"fixture-commit","url":"https://github.com/example/solutions/commit/fixture-commit"}'),
  ('migration-round', '102', 'lc-two-sum', 'photo', '2026-06-04T00:00:00Z', '2026-06-04T01:00:00Z',
   '{"photoId":"migration-photo","reviewedBy":"101"}'),
  ('migration-other-round', '103', 'lc-two-sum', 'github', '2026-06-05T00:00:00Z', '2026-06-05T01:00:00Z',
   '{"sha":"other-fixture-commit"}');

INSERT INTO photos (id, member_id, size, bytes, created_at, study_id) VALUES
  ('migration-photo', '102', 3, X'010203', '2026-06-04T00:00:00Z', 'study');

INSERT INTO photo_submissions (id, round_id, member_id, problem_id, photo_id, submitted_at, assessment, status, reviewed_by, reviewed_at) VALUES
  ('migration-submission', 'migration-round', '102', 'lc-two-sum', 'migration-photo',
   '2026-06-04T00:00:00Z', '{}', 'approved', '101', '2026-06-04T01:00:00Z');
