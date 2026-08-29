import { database } from '@/app/lib/runtime-env';
import { REVIEW_SCHEMA_STATEMENTS } from '@/app/lib/review-schema';

export const WORKSPACE_USER_ID = 'single-workspace';

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, email TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS patent_cases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL, application_number TEXT NOT NULL,
    payload_json TEXT NOT NULL, fetched_at TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, application_number),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS patent_summaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL, application_number TEXT NOT NULL,
    summary_type TEXT NOT NULL, model TEXT NOT NULL, source_hash TEXT NOT NULL,
    content_json TEXT NOT NULL, input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, application_number, summary_type, source_hash),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS notice_analyses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL, application_number TEXT NOT NULL,
    send_number TEXT NOT NULL, parser TEXT NOT NULL, model TEXT NOT NULL,
    source_hash TEXT NOT NULL, markdown_text TEXT NOT NULL,
    summary_json TEXT NOT NULL, input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, application_number, send_number, source_hash),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS api_usage_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL, provider TEXT NOT NULL, operation TEXT NOT NULL,
    application_number TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  'CREATE INDEX IF NOT EXISTS patent_cases_user_updated_idx ON patent_cases(user_id, updated_at DESC)',
  'CREATE INDEX IF NOT EXISTS patent_summaries_lookup_idx ON patent_summaries(user_id, application_number, updated_at DESC)',
  'CREATE INDEX IF NOT EXISTS notice_analyses_lookup_idx ON notice_analyses(user_id, application_number, send_number, updated_at DESC)',
  'CREATE INDEX IF NOT EXISTS api_usage_user_provider_idx ON api_usage_events(user_id, provider, created_at DESC)',
  ...REVIEW_SCHEMA_STATEMENTS,
];

let schemaReady: Promise<void> | null = null;

export async function appDatabase() {
  const db = database();
  if (!schemaReady) {
    schemaReady = db
      .batch(SCHEMA_STATEMENTS.map((statement) => db.prepare(statement)))
      .then(() =>
        db
          .prepare(
            `INSERT INTO users (id, email) VALUES (?, ?)
             ON CONFLICT(id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP`,
          )
          .bind(WORKSPACE_USER_ID, 'single-workspace@local')
          .run(),
      )
      .then(() => undefined)
      .catch((error) => {
        schemaReady = null;
        throw error;
      });
  }
  await schemaReady;
  return db;
}

export async function savePatentCase(
  userId: string,
  applicationNumber: string,
  payload: unknown,
  fetchedAt: string,
) {
  const db = await appDatabase();
  await db
    .prepare(
      `INSERT INTO patent_cases (user_id, application_number, payload_json, fetched_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, application_number) DO UPDATE SET
         payload_json = excluded.payload_json,
         fetched_at = excluded.fetched_at,
         updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(userId, applicationNumber, JSON.stringify(payload), fetchedAt)
    .run();
}

export async function getPatentCase<T>(userId: string, applicationNumber: string) {
  const db = await appDatabase();
  const row = await db
    .prepare(
      `SELECT payload_json, fetched_at
       FROM patent_cases WHERE user_id = ? AND application_number = ?`,
    )
    .bind(userId, applicationNumber)
    .first<{ payload_json: string; fetched_at: string }>();
  if (!row) return null;
  return { payload: JSON.parse(row.payload_json) as T, fetchedAt: row.fetched_at };
}

export async function saveClaimChangeHistory(
  userId: string,
  applicationNumber: string,
  sourceHash: string,
  payload: unknown,
  fetchedAt: string,
) {
  const db = await appDatabase();
  await db
    .prepare(
      `INSERT INTO claim_change_histories (
         user_id, application_number, source_hash, payload_json, fetched_at
       ) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id, application_number) DO UPDATE SET
         source_hash = excluded.source_hash,
         payload_json = excluded.payload_json,
         fetched_at = excluded.fetched_at,
         updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(userId, applicationNumber, sourceHash, JSON.stringify(payload), fetchedAt)
    .run();
}

export async function getClaimChangeHistory<T>(userId: string, applicationNumber: string) {
  const db = await appDatabase();
  const row = await db
    .prepare(
      `SELECT source_hash, payload_json, fetched_at
       FROM claim_change_histories
       WHERE user_id = ? AND application_number = ?`,
    )
    .bind(userId, applicationNumber)
    .first<{ source_hash: string; payload_json: string; fetched_at: string }>();
  if (!row) return null;
  return {
    sourceHash: row.source_hash,
    payload: JSON.parse(row.payload_json) as T,
    fetchedAt: row.fetched_at,
  };
}

export async function recordApiUsage(
  userId: string,
  provider: 'kipris' | 'openai',
  operations: string[],
  applicationNumber?: string,
) {
  if (!operations.length) return;
  const db = await appDatabase();
  await db.batch(
    operations.map((operation) =>
      db
        .prepare(
          `INSERT INTO api_usage_events
             (user_id, provider, operation, application_number)
           VALUES (?, ?, ?, ?)`,
        )
        .bind(userId, provider, operation, applicationNumber ?? null),
    ),
  );
}

export type ApiUsageSnapshot = {
  total: number;
  startedAt: string;
  lastCalledAt: string | null;
  byOperation: Record<string, number>;
};

export async function getApiUsage(userId: string, provider = 'kipris') {
  const db = await appDatabase();
  const totals = await db
    .prepare(
      `SELECT COUNT(*) AS total, MIN(created_at) AS started_at,
              MAX(created_at) AS last_called_at
       FROM api_usage_events WHERE user_id = ? AND provider = ?`,
    )
    .bind(userId, provider)
    .first<{ total: number; started_at: string | null; last_called_at: string | null }>();
  const grouped = await db
    .prepare(
      `SELECT operation, COUNT(*) AS count
       FROM api_usage_events WHERE user_id = ? AND provider = ?
       GROUP BY operation ORDER BY operation`,
    )
    .bind(userId, provider)
    .all<{ operation: string; count: number }>();
  return {
    total: Number(totals?.total ?? 0),
    startedAt: totals?.started_at ?? new Date().toISOString(),
    lastCalledAt: totals?.last_called_at ?? null,
    byOperation: Object.fromEntries(
      grouped.results.map((row) => [row.operation, Number(row.count)]),
    ),
  } satisfies ApiUsageSnapshot;
}
