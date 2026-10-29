-- Immutable Markdown bodies keep the workspace JSON below D1's per-row size limit.
-- Workspace scoping prevents one bureau from resolving another bureau's reports.
CREATE TABLE IF NOT EXISTS evaluation_literature_reports (
  workspace_id TEXT NOT NULL,
  report_hash TEXT NOT NULL,
  markdown TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (workspace_id, report_hash)
);
