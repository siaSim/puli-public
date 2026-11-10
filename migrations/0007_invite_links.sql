CREATE TABLE invite_links (
 id TEXT PRIMARY KEY CHECK(id = 'study'),
 token_hash TEXT NOT NULL UNIQUE,
 sealed_token TEXT NOT NULL,
 created_by TEXT NOT NULL REFERENCES members(id),
 created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1
);
