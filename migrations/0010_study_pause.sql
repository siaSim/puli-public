-- NULL means running, 0 means paused until manually resumed, and a positive value is the end time in milliseconds.
ALTER TABLE studies ADD COLUMN pause_until INTEGER CHECK(pause_until >= 0);
ALTER TABLE studies ADD COLUMN pause_revision INTEGER NOT NULL DEFAULT 0;
