import { appDatabase } from '@/app/lib/db';
import { applyAction, createInitialState, normalizeEvaluationState, EvaluationError, type EvaluationAction, type EvaluationActor, type EvaluationState } from '@/app/lib/evaluation';
import { parseBureau, type Bureau } from '@/app/lib/bureaus';
import { demoForBureau, migrateEvaluationBureau } from '@/app/lib/evaluation-bureau';

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
    await db.prepare('INSERT OR IGNORE INTO evaluation_workspace (id, revision, payload_json) VALUES (?, 0, ?)')
      .bind(id, JSON.stringify(state)).run();
    row = await db.prepare('SELECT revision, payload_json FROM evaluation_workspace WHERE id = ?')
      .bind(id).first<{ revision: number; payload_json: string }>();
  }
  if (!row) throw new EvaluationError('평가 업무 저장소를 초기화하지 못했습니다.', 500);
  return { revision: row.revision, state: normalizeEvaluationState(JSON.parse(row.payload_json) as EvaluationState) };
}

export async function mutateEvaluationState(revision: number, actor: EvaluationActor, action: EvaluationAction, bureau?: Bureau) {
  const id = workspaceId(bureau);
  const current = await readEvaluationState(bureau);
  assertBureauActor(current.state, actor, bureau);
  if (revision !== current.revision) throw new EvaluationError('다른 화면에서 업무 자료가 변경되었습니다. 입력내용을 보관한 뒤 최신 자료를 불러와 다시 저장해 주세요.', 409);
  if (bureau && action.type === 'saveUser') {
    const requestedUser = action.user;
    if (requestedUser.bureau !== bureau) throw new EvaluationError('사용자의 심사국은 현재 선택한 심사국과 같아야 합니다.');
    if (requestedUser.id && !current.state.users.some((user) => user.id === requestedUser.id)) throw new EvaluationError('선택한 심사국에 해당 사용자가 없습니다.', 404);
    action = { ...action, user: { ...requestedUser, bureau } };
  }
  let state = applyAction(current.state, actor, action);
  if (bureau && action.type === 'loadDemo') state = demoForBureau(state, bureau);
  const db = await evaluationDatabase();
  const result = await db.prepare(`UPDATE evaluation_workspace SET payload_json = ?, revision = revision + 1,
      updated_at = CURRENT_TIMESTAMP WHERE id = ? AND revision = ?`)
    .bind(JSON.stringify(state), id, revision).run();
  if (result.meta.changes !== 1) throw new EvaluationError('다른 화면의 저장과 충돌했습니다. 입력내용을 유지하고 최신 자료를 불러와 다시 저장해 주세요.', 409);
  return { state, revision: revision + 1 };
}
