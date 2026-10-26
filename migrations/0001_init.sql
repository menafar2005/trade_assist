-- Trade journal schema (SQLite / Cloudflare D1).
CREATE TABLE IF NOT EXISTS positions (
  id             TEXT PRIMARY KEY,
  status         TEXT NOT NULL,
  symbol         TEXT NOT NULL DEFAULT '',
  direction      TEXT NOT NULL DEFAULT '',
  market         TEXT NOT NULL DEFAULT '',
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL,
  locked_at      INTEGER,
  opened_at      INTEGER,
  closed_at      INTEGER,
  reviewed_at    INTEGER,
  pnl            REAL,
  r              REAL,
  evidence_count INTEGER NOT NULL DEFAULT 0,
  against_count  INTEGER NOT NULL DEFAULT 0,
  mood           TEXT NOT NULL DEFAULT '',
  confidence     INTEGER,
  tags_idx       TEXT NOT NULL DEFAULT '',
  sources_idx    TEXT NOT NULL DEFAULT '',
  search_text    TEXT NOT NULL DEFAULT '',
  doc            TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_positions_created ON positions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_positions_status ON positions (status);

CREATE TABLE IF NOT EXISTS images (
  id           TEXT PRIMARY KEY,
  content_type TEXT NOT NULL,
  size         INTEGER NOT NULL,
  created_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
