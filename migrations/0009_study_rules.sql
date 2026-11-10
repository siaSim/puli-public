ALTER TABLE studies ADD COLUMN rules TEXT NOT NULL DEFAULT '{"mode":"common","problemCount":5,"leetcodeCount":1,"platform":"all","schedule":"weekly","weekday":2,"deadlineTime":"23:59"}';
ALTER TABLE studies ADD COLUMN rules_revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE rounds ADD COLUMN rules TEXT;
ALTER TABLE rounds ADD COLUMN deadline_time TEXT NOT NULL DEFAULT '23:59';
CREATE TABLE free_problems (
 round_id TEXT NOT NULL REFERENCES rounds(id), problem_id TEXT NOT NULL,
 title TEXT NOT NULL, platform TEXT NOT NULL CHECK(platform IN ('leetcode','programmers')),
 url TEXT NOT NULL, difficulty TEXT NOT NULL, tag TEXT NOT NULL,
 added_by TEXT NOT NULL REFERENCES members(id), created_at TEXT NOT NULL,
 PRIMARY KEY(round_id,problem_id)
);
