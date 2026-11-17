CREATE TABLE slice_awards (
 study_id TEXT NOT NULL REFERENCES studies(id),
 round_id TEXT NOT NULL REFERENCES rounds(id),
 member_id TEXT NOT NULL REFERENCES members(id),
 problem_id TEXT NOT NULL,
 method TEXT NOT NULL CHECK(method IN ('github','photo')),
 certified_at TEXT NOT NULL,
 awarded_at TEXT NOT NULL,
 retroactive INTEGER NOT NULL DEFAULT 0 CHECK(retroactive IN (0,1)),
 PRIMARY KEY(round_id,member_id,problem_id)
);
CREATE INDEX slice_awards_member ON slice_awards(member_id,awarded_at DESC);
CREATE INDEX slice_awards_study ON slice_awards(study_id,awarded_at DESC);
CREATE TRIGGER award_slices_on_certificate AFTER INSERT ON certificates
BEGIN
 INSERT OR IGNORE INTO slice_awards(study_id,round_id,member_id,problem_id,method,certified_at,awarded_at)
 SELECT r.study_id,NEW.round_id,NEW.member_id,NEW.problem_id,NEW.method,NEW.at,NEW.observed_at
 FROM rounds r WHERE r.id=NEW.round_id AND r.history_only=0;
END;
INSERT OR IGNORE INTO slice_awards(study_id,round_id,member_id,problem_id,method,certified_at,awarded_at,retroactive)
SELECT r.study_id,c.round_id,c.member_id,c.problem_id,c.method,c.at,strftime('%Y-%m-%dT%H:%M:%fZ','now'),1
FROM certificates c JOIN rounds r ON r.id=c.round_id WHERE r.history_only=0;
