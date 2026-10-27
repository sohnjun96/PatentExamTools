import { appDatabase } from '@/app/lib/db';
import { applyAction, createInitialState, EvaluationError, type EvaluationAction, type EvaluationActor, type EvaluationState } from '@/app/lib/evaluation';

let ready: Promise<void> | null = null;

async function evaluationDatabase() {
  const db = await appDatabase();
  if (!ready) {
    ready = db.prepare(`CREATE TABLE IF NOT EXISTS evaluation_workspace (
      id TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 0,
      payload_json TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`).run().then(async () => {
      await db.prepare('INSERT OR IGNORE INTO evaluation_workspace (id, revision, payload_json) VALUES (?, 0, ?)')
        .bind('main', JSON.stringify(createInitialState())).run();
    }).catch((error) => { ready = null; throw error; });
  }
  await ready;
  return db;
}

export async function readEvaluationState() {
  const db = await evaluationDatabase();
  const row = await db.prepare('SELECT revision, payload_json FROM evaluation_workspace WHERE id = ?')
    .bind('main').first<{ revision: number; payload_json: string }>();
  if (!row) throw new EvaluationError('평가 업무 저장소를 초기화하지 못했습니다.', 500);
  return { revision: row.revision, state: JSON.parse(row.payload_json) as EvaluationState };
}

export async function mutateEvaluationState(revision: number, actor: EvaluationActor, action: EvaluationAction) {
  const current = await readEvaluationState();
  if (revision !== current.revision) throw new EvaluationError('다른 화면에서 업무 자료가 변경되었습니다. 입력내용을 보관한 뒤 최신 자료를 불러와 다시 저장해 주세요.', 409);
  const state = applyAction(current.state, actor, action);
  const db = await evaluationDatabase();
  const result = await db.prepare(`UPDATE evaluation_workspace SET payload_json = ?, revision = revision + 1,
      updated_at = CURRENT_TIMESTAMP WHERE id = ? AND revision = ?`)
    .bind(JSON.stringify(state), 'main', revision).run();
  if (result.meta.changes !== 1) throw new EvaluationError('다른 화면의 저장과 충돌했습니다. 입력내용을 유지하고 최신 자료를 불러와 다시 저장해 주세요.', 409);
  return { state, revision: revision + 1 };
}
