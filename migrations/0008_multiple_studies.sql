PRAGMA defer_foreign_keys = ON;

CREATE TABLE accounts_next (
 id TEXT PRIMARY KEY, login TEXT NOT NULL UNIQUE COLLATE NOCASE, name TEXT NOT NULL,
 role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('owner','member')),
 slot INTEGER, joined_at TEXT
);
INSERT INTO accounts_next SELECT id,login,name,role,slot,joined_at FROM members;
CREATE TABLE studies (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
 capacity INTEGER NOT NULL CHECK(capacity BETWEEN 1 AND 20),
 created_by TEXT REFERENCES accounts_next(id), created_at TEXT NOT NULL
);
INSERT INTO studies VALUES ('study','우리 코테 스터디','매주 LeetCode 1문제와 프로그래머스 4문제를 함께 풉니다.',5,
 (SELECT id FROM accounts_next WHERE role='owner' ORDER BY slot LIMIT 1),strftime('%Y-%m-%dT%H:%M:%fZ','now'));
CREATE TABLE study_memberships (
 study_id TEXT NOT NULL REFERENCES studies(id), member_id TEXT NOT NULL REFERENCES accounts_next(id),
 role TEXT NOT NULL CHECK(role IN ('owner','member')), slot INTEGER NOT NULL, joined_at TEXT NOT NULL,
 PRIMARY KEY(study_id,member_id), UNIQUE(study_id,slot)
);
INSERT INTO study_memberships SELECT 'study',id,role,slot,COALESCE(joined_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')) FROM accounts_next;
CREATE INDEX membership_account ON study_memberships(member_id,study_id);

CREATE TABLE sessions_next (
 hash TEXT PRIMARY KEY, member_id TEXT NOT NULL REFERENCES accounts_next(id) ON DELETE CASCADE,
 sealed_token TEXT NOT NULL, expires_at INTEGER NOT NULL
);
INSERT INTO sessions_next SELECT * FROM sessions;
CREATE TABLE rounds_next (
 id TEXT PRIMARY KEY, number INTEGER NOT NULL, title TEXT NOT NULL,
 start_date TEXT NOT NULL, deadline_date TEXT NOT NULL,
 setter TEXT NOT NULL REFERENCES accounts_next(id), problems TEXT NOT NULL, created_at TEXT NOT NULL,
 history_only INTEGER NOT NULL DEFAULT 0 CHECK(history_only IN (0,1)), history_meta TEXT, history_key TEXT,
 registered_by TEXT REFERENCES accounts_next(id), setter_name TEXT,
 setter_unlinked INTEGER NOT NULL DEFAULT 0 CHECK(setter_unlinked IN (0,1)), revision INTEGER NOT NULL DEFAULT 0,
 updated_by TEXT REFERENCES accounts_next(id), updated_at TEXT,
 study_id TEXT NOT NULL DEFAULT 'study' REFERENCES studies(id), UNIQUE(study_id,number)
);
INSERT INTO rounds_next SELECT id,number,title,start_date,deadline_date,setter,problems,created_at,
 history_only,history_meta,history_key,registered_by,setter_name,setter_unlinked,revision,updated_by,updated_at,'study' FROM rounds;
CREATE TABLE repositories_next (
 member_id TEXT NOT NULL REFERENCES accounts_next(id) ON DELETE CASCADE,
 platform TEXT NOT NULL CHECK(platform IN ('leetcode','programmers')),
 repo_id TEXT NOT NULL, full_name TEXT NOT NULL, installation_id TEXT NOT NULL, branch TEXT NOT NULL,
 private INTEGER NOT NULL DEFAULT 0, checked_at TEXT, sync_cursor TEXT, sync_error TEXT, updated_at INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(member_id,platform)
);
INSERT INTO repositories_next SELECT * FROM repositories;
CREATE TABLE certificates_next (
 round_id TEXT NOT NULL REFERENCES rounds_next(id), member_id TEXT NOT NULL REFERENCES accounts_next(id), problem_id TEXT NOT NULL,
 method TEXT NOT NULL CHECK(method IN ('github','photo')), at TEXT NOT NULL, observed_at TEXT NOT NULL, evidence TEXT NOT NULL,
 PRIMARY KEY(round_id,member_id,problem_id)
);
INSERT INTO certificates_next SELECT * FROM certificates;
CREATE TABLE photos_next (
 id TEXT PRIMARY KEY, member_id TEXT NOT NULL REFERENCES accounts_next(id), size INTEGER NOT NULL,
 bytes BLOB NOT NULL, created_at TEXT NOT NULL, study_id TEXT NOT NULL DEFAULT 'study' REFERENCES studies(id)
);
INSERT INTO photos_next SELECT id,member_id,size,bytes,created_at,'study' FROM photos;
CREATE TABLE photo_submissions_next (
 id TEXT PRIMARY KEY, round_id TEXT NOT NULL REFERENCES rounds_next(id), member_id TEXT NOT NULL REFERENCES accounts_next(id),
 problem_id TEXT NOT NULL, photo_id TEXT NOT NULL, submitted_at TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
 ocr_text TEXT NOT NULL DEFAULT '', ocr_confidence REAL NOT NULL DEFAULT 0, assessment TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected','superseded')),
 reviewed_by TEXT REFERENCES accounts_next(id), reviewed_at TEXT, review_note TEXT NOT NULL DEFAULT ''
);
INSERT INTO photo_submissions_next SELECT * FROM photo_submissions;
CREATE TABLE solution_shares_next (
 round_id TEXT NOT NULL REFERENCES rounds_next(id), member_id TEXT NOT NULL REFERENCES accounts_next(id), problem_id TEXT NOT NULL,
 code TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', language TEXT NOT NULL DEFAULT '', shared INTEGER NOT NULL CHECK(shared IN (0,1)),
 revision INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL, PRIMARY KEY(round_id,member_id,problem_id)
);
INSERT INTO solution_shares_next SELECT * FROM solution_shares;
CREATE TABLE invite_links_next (
 id TEXT PRIMARY KEY REFERENCES studies(id), token_hash TEXT NOT NULL UNIQUE, sealed_token TEXT NOT NULL,
 created_by TEXT NOT NULL REFERENCES accounts_next(id), created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1
);
INSERT INTO invite_links_next SELECT * FROM invite_links;

DROP TABLE solution_shares;
DROP TABLE photo_submissions;
DROP TABLE certificates;
DROP TABLE sessions;
DROP TABLE repositories;
DROP TABLE invite_links;
DROP TABLE photos;
DROP TABLE rounds;
DROP TABLE members;
ALTER TABLE accounts_next RENAME TO members;
ALTER TABLE sessions_next RENAME TO sessions;
ALTER TABLE rounds_next RENAME TO rounds;
ALTER TABLE repositories_next RENAME TO repositories;
ALTER TABLE certificates_next RENAME TO certificates;
ALTER TABLE photos_next RENAME TO photos;
ALTER TABLE photo_submissions_next RENAME TO photo_submissions;
ALTER TABLE solution_shares_next RENAME TO solution_shares;
ALTER TABLE invite_links_next RENAME TO invite_links;
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE INDEX repository_match ON repositories(repo_id);
CREATE INDEX rounds_study ON rounds(study_id,history_only,start_date);
CREATE UNIQUE INDEX rounds_history_key ON rounds(study_id,history_key) WHERE history_key IS NOT NULL;
CREATE INDEX photos_study ON photos(study_id,id);
CREATE INDEX photo_submissions_lookup ON photo_submissions(round_id,member_id,problem_id,submitted_at);
CREATE UNIQUE INDEX photo_submissions_pending ON photo_submissions(round_id,member_id,problem_id) WHERE status='pending';
PRAGMA defer_foreign_keys = OFF;
