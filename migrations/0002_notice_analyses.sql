CREATE TABLE IF NOT EXISTS notice_analyses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  application_number TEXT NOT NULL,
  send_number TEXT NOT NULL,
  parser TEXT NOT NULL,
  model TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  markdown_text TEXT NOT NULL,
  summary_json TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, application_number, send_number, source_hash),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS notice_analyses_lookup_idx
  ON notice_analyses(user_id, application_number, send_number, updated_at DESC);
