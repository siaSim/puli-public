CREATE TABLE solution_shares (
 round_id TEXT NOT NULL REFERENCES rounds(id),
 member_id TEXT NOT NULL REFERENCES members(id),
 problem_id TEXT NOT NULL,
 code TEXT NOT NULL,
 note TEXT NOT NULL DEFAULT '',
 language TEXT NOT NULL DEFAULT '',
 shared INTEGER NOT NULL CHECK(shared IN (0,1)),
 revision INTEGER NOT NULL DEFAULT 1,
 updated_at TEXT NOT NULL,
 PRIMARY KEY(round_id,member_id,problem_id)
);
