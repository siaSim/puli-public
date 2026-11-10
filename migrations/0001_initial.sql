CREATE TABLE config (id TEXT PRIMARY KEY, sealed TEXT NOT NULL);
CREATE TABLE members (
 id TEXT PRIMARY KEY, login TEXT NOT NULL UNIQUE COLLATE NOCASE,
 name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('owner','member')),
 slot INTEGER NOT NULL UNIQUE CHECK(slot BETWEEN 0 AND 4), joined_at TEXT
);
CREATE TABLE sessions (
 hash TEXT PRIMARY KEY, member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
 sealed_token TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE flows (hash TEXT PRIMARY KEY, kind TEXT NOT NULL, sealed TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE rounds (
 id TEXT PRIMARY KEY, number INTEGER NOT NULL UNIQUE, title TEXT NOT NULL,
 start_date TEXT NOT NULL, deadline_date TEXT NOT NULL,
 setter TEXT NOT NULL REFERENCES members(id), problems TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE repositories (
 member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
 platform TEXT NOT NULL CHECK(platform IN ('leetcode','programmers')),
 repo_id TEXT NOT NULL, full_name TEXT NOT NULL, installation_id TEXT NOT NULL,
 branch TEXT NOT NULL, private INTEGER NOT NULL DEFAULT 0,
 checked_at TEXT, sync_cursor TEXT, sync_error TEXT, updated_at INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(member_id, platform)
);
CREATE INDEX repository_match ON repositories(repo_id);
CREATE TABLE certificates (
 round_id TEXT NOT NULL REFERENCES rounds(id), member_id TEXT NOT NULL REFERENCES members(id),
 problem_id TEXT NOT NULL, method TEXT NOT NULL CHECK(method IN ('github','photo')),
 at TEXT NOT NULL, observed_at TEXT NOT NULL, evidence TEXT NOT NULL,
 PRIMARY KEY(round_id, member_id, problem_id)
);
CREATE TABLE photos (
 id TEXT PRIMARY KEY, member_id TEXT NOT NULL REFERENCES members(id),
 size INTEGER NOT NULL, bytes BLOB NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE deliveries (id TEXT PRIMARY KEY, status TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE sync_locks (id TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
