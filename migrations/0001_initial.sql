CREATE TABLE connections (
  browser_hash TEXT PRIMARY KEY,
  code TEXT UNIQUE,
  expires_at INTEGER NOT NULL,
  line_id TEXT
);

CREATE TABLE bottles (
  id TEXT PRIMARY KEY,
  line_id TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  due_at INTEGER NOT NULL,
  next_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  lease_until INTEGER NOT NULL DEFAULT 0,
  delivery_started_at INTEGER,
  reply TEXT,
  state TEXT NOT NULL DEFAULT 'pending'
);
CREATE INDEX bottles_ready ON bottles (state, next_at);
CREATE INDEX bottles_daily ON bottles (line_id, created_at);
CREATE INDEX bottles_created ON bottles (created_at);
