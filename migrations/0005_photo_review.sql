CREATE TABLE photo_submissions (
 id TEXT PRIMARY KEY,
 round_id TEXT NOT NULL REFERENCES rounds(id),
 member_id TEXT NOT NULL REFERENCES members(id),
 problem_id TEXT NOT NULL,
 photo_id TEXT NOT NULL,
 submitted_at TEXT NOT NULL,
 note TEXT NOT NULL DEFAULT '',
 ocr_text TEXT NOT NULL DEFAULT '',
 ocr_confidence REAL NOT NULL DEFAULT 0,
 assessment TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected','superseded')),
 reviewed_by TEXT REFERENCES members(id),
 reviewed_at TEXT,
 review_note TEXT NOT NULL DEFAULT ''
);
CREATE INDEX photo_submissions_lookup ON photo_submissions(round_id,member_id,problem_id,submitted_at);
CREATE UNIQUE INDEX photo_submissions_pending ON photo_submissions(round_id,member_id,problem_id) WHERE status = 'pending';
