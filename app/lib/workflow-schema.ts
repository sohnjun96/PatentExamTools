export const WORKFLOW_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS round_document_links (
    user_id TEXT NOT NULL, application_number TEXT NOT NULL, notice_number TEXT NOT NULL,
    links_json TEXT NOT NULL, history_key TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, application_number, notice_number)
  )`,
  `CREATE TABLE IF NOT EXISTS api_budget_counters (
    scope TEXT NOT NULL, window_key TEXT NOT NULL, used INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (scope, window_key)
  )`,
  `CREATE TABLE IF NOT EXISTS api_job_leases (
    job_key TEXT PRIMARY KEY, owner TEXT NOT NULL, expires_at INTEGER NOT NULL,
    last_started_at INTEGER NOT NULL
  )`,
];
