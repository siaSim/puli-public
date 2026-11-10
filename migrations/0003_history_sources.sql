ALTER TABLE rounds ADD COLUMN history_meta TEXT;
ALTER TABLE rounds ADD COLUMN history_key TEXT;
CREATE UNIQUE INDEX rounds_history_key ON rounds(history_key) WHERE history_key IS NOT NULL;
