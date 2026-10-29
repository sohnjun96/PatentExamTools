import { appDatabase } from '@/app/lib/db';
import { applyAction, createInitialState, normalizeEvaluationState, withDefaultOperationMonths, EvaluationError, type EvaluationAction, type EvaluationActor, type EvaluationState, type LiteratureDocument } from '@/app/lib/evaluation';
import { parseBureau, type Bureau } from '@/app/lib/bureaus';
import { demoForBureau, migrateEvaluationBureau } from '@/app/lib/evaluation-bureau';

let ready: Promise<void> | null = null;

async function evaluationDatabase() {
  const db = await appDatabase();
  if (!ready) {
    ready = db.batch([db.prepare(`CREATE TABLE IF NOT EXISTS evaluation_workspace (
      id TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 0,
      payload_json TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`), db.prepare(`CREATE TABLE IF NOT EXISTS evaluation_literature_reports (
      workspace_id TEXT NOT NULL, report_hash TEXT NOT NULL, markdown TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (workspace_id, report_hash)
    )`)]).then(async () => {
      await db.prepare('INSERT OR IGNORE INTO evaluation_workspace (id, revision, payload_json) VALUES (?, 0, ?)')
        .bind('main', JSON.stringify(createInitialState())).run();
    }).catch((error) => { ready = null; throw error; });
  }
  await ready;
  return db;
}

type PersistedLiteratureDocument = LiteratureDocument & { reportRef?: string };

function reportDocuments(state: EvaluationState): PersistedLiteratureDocument[] {
  return state.results.flatMap((result) => [...(result.draftDocumentDetails ?? []), ...(result.publishedDocumentDetails ?? [])]);
}

/** Keep the workspace row small; immutable reports can safely serve in-flight readers. */
async function encodeReports(state: EvaluationState) {
  const persisted = structuredClone(state);
  const documents = reportDocuments(persisted);
  const contents = [...new Set(documents.map((document) => document.reportMarkdown).filter((value): value is string => typeof value === 'string' && value.length > 0))];
  const hashes = new Map(await Promise.all(contents.map(async (markdown): Promise<[string, string]> => {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(markdown));
    const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
    return [markdown, hash];
  })));
  for (const document of documents) {
    if (document.reportMarkdown) {
      document.reportRef = hashes.get(document.reportMarkdown)!;
      delete document.reportMarkdown;
    }
  }
  return { payload: JSON.stringify(persisted), reports: contents.map((markdown) => ({ hash: hashes.get(markdown)!, markdown })) };
}

function reportInserts(db: D1Database, id: string, reports: { hash: string; markdown: string }[]) {
  const statements: D1PreparedStatement[] = [];
  // Three parameters per report keep every statement below D1's parameter limit.
  for (let offset = 0; offset < reports.length; offset += 26) {
    const batch = reports.slice(offset, offset + 26);
    statements.push(db.prepare(`INSERT OR IGNORE INTO evaluation_literature_reports (workspace_id, report_hash, markdown) VALUES ${batch.map(() => '(?, ?, ?)').join(', ')}`)
      .bind(...batch.flatMap((report) => [id, report.hash, report.markdown])));
  }
  return statements;
}

async function hydrateReports(db: D1Database, id: string, state: EvaluationState) {
  const documents = reportDocuments(state);
  const references = documents.filter((document) => Object.prototype.hasOwnProperty.call(document, 'reportRef'));
  if (!references.length) return state; // Existing inline Markdown remains readable.
  if (references.some((document) => typeof document.reportRef !== 'string' || !/^[a-f0-9]{64}$/.test(document.reportRef))) throw new EvaluationError('문헌 보고서 참조를 확인할 수 없습니다. 관리자에게 문의해 주세요.', 500);
  const hashes = [...new Set(references.map((document) => document.reportRef!))];
  const markdownByHash = new Map<string, string>();
  // One workspace parameter plus at most 79 hashes per lookup.
  for (let offset = 0; offset < hashes.length; offset += 79) {
    const batch = hashes.slice(offset, offset + 79);
    const rows = await db.prepare(`SELECT report_hash, markdown FROM evaluation_literature_reports WHERE workspace_id = ? AND report_hash IN (${batch.map(() => '?').join(', ')})`)
      .bind(id, ...batch).all<{ report_hash: string; markdown: string }>();
    for (const row of rows.results) markdownByHash.set(row.report_hash, row.markdown);
  }
  for (const document of references) {
    const markdown = markdownByHash.get(document.reportRef!);
    if (markdown === undefined) throw new EvaluationError('저장된 문헌 보고서를 불러올 수 없습니다. 관리자에게 문의해 주세요.', 500);
    document.reportMarkdown = markdown;
    delete document.reportRef;
  }
  return state;
}

function workspaceId(bureau?: Bureau) {
  if (bureau !== undefined && !parseBureau(bureau)) throw new EvaluationError('심사국을 확인해 주세요.');
  return bureau ? `bureau:${bureau}` : 'main';
}

export function assertBureauActor(state: EvaluationState, actor: EvaluationActor, bureau?: Bureau) {
  if (bureau && actor.userId && !state.users.some((user) => user.id === actor.userId && user.active)) throw new EvaluationError('선택한 심사국의 활성 사용자를 선택해 주세요.', 403);
}

export async function readEvaluationState(bureau?: Bureau) {
  const id = workspaceId(bureau);
  const db = await evaluationDatabase();
  let row = await db.prepare('SELECT revision, payload_json FROM evaluation_workspace WHERE id = ?')
    .bind(id).first<{ revision: number; payload_json: string }>();
  if (!row && bureau) {
    const legacy = await readEvaluationState();
    const state = migrateEvaluationBureau(legacy.state, bureau);
    const encoded = await encodeReports(state);
    await db.batch([...reportInserts(db, id, encoded.reports), db.prepare('INSERT OR IGNORE INTO evaluation_workspace (id, revision, payload_json) VALUES (?, 0, ?)')
      .bind(id, encoded.payload)]);
    row = await db.prepare('SELECT revision, payload_json FROM evaluation_workspace WHERE id = ?')
      .bind(id).first<{ revision: number; payload_json: string }>();
  }
  if (!row) throw new EvaluationError('평가 업무 저장소를 초기화하지 못했습니다.', 500);
  const state = await hydrateReports(db, id, JSON.parse(row.payload_json) as EvaluationState);
  return { revision: row.revision, state: withDefaultOperationMonths(normalizeEvaluationState(state)) };
}

export async function mutateEvaluationState(revision: number, actor: EvaluationActor, action: EvaluationAction, bureau?: Bureau) {
  const id = workspaceId(bureau);
  const current = await readEvaluationState(bureau);
  assertBureauActor(current.state, actor, bureau);
  if (revision !== current.revision) throw new EvaluationError('다른 화면에서 업무 자료가 변경되었습니다. 입력내용을 보관한 뒤 최신 자료를 불러와 다시 저장해 주세요.', 409);
  if (bureau && (action.type === 'saveUser' || action.type === 'saveExaminer')) {
    const requestedUser = action.user;
    if (requestedUser.bureau !== bureau) throw new EvaluationError('사용자의 심사국은 현재 선택한 심사국과 같아야 합니다.');
    if (requestedUser.id && !current.state.users.some((user) => user.id === requestedUser.id)) throw new EvaluationError('선택한 심사국에 해당 사용자가 없습니다.', 404);
    action = { ...action, user: { ...requestedUser, bureau } };
  }
  let state = withDefaultOperationMonths(applyAction(current.state, actor, action));
  if (bureau && action.type === 'loadDemo') state = demoForBureau(state, bureau);
  const db = await evaluationDatabase();
  const encoded = await encodeReports(state);
  const results = await db.batch([...reportInserts(db, id, encoded.reports), db.prepare(`UPDATE evaluation_workspace SET payload_json = ?, revision = revision + 1,
      updated_at = CURRENT_TIMESTAMP WHERE id = ? AND revision = ?`)
    .bind(encoded.payload, id, revision)]);
  const result = results[results.length - 1];
  if (result.meta.changes !== 1) throw new EvaluationError('다른 화면의 저장과 충돌했습니다. 입력내용을 유지하고 최신 자료를 불러와 다시 저장해 주세요.', 409);
  return { state, revision: revision + 1 };
}
