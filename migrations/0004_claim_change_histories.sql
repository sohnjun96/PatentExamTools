PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS claim_change_histories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  application_number TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, application_number),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

PRAGMA optimize;
