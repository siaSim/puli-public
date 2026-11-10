ALTER TABLE rounds ADD COLUMN registered_by TEXT REFERENCES members(id);
ALTER TABLE rounds ADD COLUMN setter_name TEXT;
ALTER TABLE rounds ADD COLUMN setter_unlinked INTEGER NOT NULL DEFAULT 0 CHECK(setter_unlinked IN (0,1));
ALTER TABLE rounds ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE rounds ADD COLUMN updated_by TEXT REFERENCES members(id);
ALTER TABLE rounds ADD COLUMN updated_at TEXT;
UPDATE rounds SET registered_by = setter;
UPDATE rounds SET setter_name = json_extract(history_meta,'$.author'), setter_unlinked = 1
WHERE history_only = 1 AND json_extract(history_meta,'$.author') IS NOT NULL;
