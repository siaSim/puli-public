ALTER TABLE rounds ADD COLUMN history_only INTEGER NOT NULL DEFAULT 0 CHECK(history_only IN (0,1));
