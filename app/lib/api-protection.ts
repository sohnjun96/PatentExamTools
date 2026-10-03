import { appDatabase } from './db';
import { envValue } from './runtime-env';
import { HttpError } from './http';

export type ApiProvider = 'openai' | 'kipris';
const pending = new Map<string, Promise<unknown>>();
function configured(name: 'OPENAI_DAILY_LIMIT' | 'KIPRIS_DAILY_LIMIT' | 'AI_REANALYZE_COOLDOWN_SECONDS', fallback: number) {
  const raw = envValue(name);
  const value = raw ? Number(raw) : fallback;
  return Number.isInteger(value) && value >= 0 && value <= 100_000 ? value : fallback;
}
function dayKey() { return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10); }
async function reserve(scope: string, window: string, limit: number, message: string) {
  const db = await appDatabase();
  if (limit === 0) throw new HttpError(429, message, 'API_BUDGET_EXCEEDED');
  const result = await db.prepare(`INSERT INTO api_budget_counters (scope, window_key, used) VALUES (?, ?, 1)
    ON CONFLICT(scope, window_key) DO UPDATE SET used = used + 1 WHERE used < ?`)
    .bind(scope, window, limit).run();
  if (!result.meta.changes) throw new HttpError(429, message, 'API_BUDGET_EXCEEDED');
}
export async function reserveProviderCall(provider: ApiProvider) {
  const label = provider === 'openai' ? 'OpenAI' : 'KIPRIS';
  await reserve(`${provider}:minute`, String(Math.floor(Date.now() / 60_000)), provider === 'openai' ? 12 : 60,
    `${label} 요청이 많습니다. 잠시 후 다시 실행해 주세요.`);
  await reserve(`${provider}:day`, dayKey(), configured(provider === 'openai' ? 'OPENAI_DAILY_LIMIT' : 'KIPRIS_DAILY_LIMIT', provider === 'openai' ? 80 : 500),
    `${label} 일일 호출 상한에 도달했습니다. 저장된 자료는 계속 열람할 수 있습니다.`);
}
export async function protectedProviderFetch(provider: ApiProvider, input: string | URL, init?: RequestInit) {
  await reserveProviderCall(provider);
  return fetch(input, init);
}
export function assertSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (request.headers.get('sec-fetch-site') === 'cross-site' || (origin && origin !== new URL(request.url).origin)) {
    throw new HttpError(403, '이 사이트에서 요청을 실행해 주세요.', 'CROSS_ORIGIN_REQUEST');
  }
}
/** D1 lease prevents duplicate paid requests across Worker isolates. */
export function withApiJob<T>(key: string, timeoutMs: number, work: () => Promise<T>): Promise<T> {
  const shared = pending.get(key);
  if (shared) return shared as Promise<T>;
  const task = (async () => {
    const db = await appDatabase();
    const owner = crypto.randomUUID();
    const now = Date.now();
    const cooldown = configured('AI_REANALYZE_COOLDOWN_SECONDS', 30) * 1000;
    const lease = await db.prepare(`INSERT INTO api_job_leases (job_key, owner, expires_at, last_started_at)
      VALUES (?, ?, ?, ?) ON CONFLICT(job_key) DO UPDATE SET
      owner = excluded.owner, expires_at = excluded.expires_at, last_started_at = excluded.last_started_at
      WHERE expires_at < ? AND last_started_at <= ?`)
      .bind(key, owner, now + timeoutMs, now, now, now - cooldown).run();
    if (!lease.meta.changes) throw new HttpError(409, '같은 분석이 실행 중이거나 방금 실행되었습니다. 잠시 후 저장된 결과를 확인해 주세요.', 'ANALYSIS_ALREADY_RUNNING');
    try { return await work(); }
    finally {
      // A lease-release error must not replace a completed result or the original failure.
      await db.prepare('UPDATE api_job_leases SET expires_at = 0 WHERE job_key = ? AND owner = ?').bind(key, owner).run().catch(() => undefined);
    }
  })();
  pending.set(key, task);
  void task.finally(() => { if (pending.get(key) === task) pending.delete(key); }).catch(() => undefined);
  return task;
}
export async function apiProtectionSnapshot() {
  const db = await appDatabase();
  const rows = await db.prepare('SELECT scope, used FROM api_budget_counters WHERE window_key = ?').bind(dayKey()).all<{ scope: string; used: number }>();
  const used = Object.fromEntries(rows.results.map((row) => [row.scope, row.used]));
  return {
    date: dayKey(),
    openai: { used: used['openai:day'] ?? 0, limit: configured('OPENAI_DAILY_LIMIT', 80) },
    kipris: { used: used['kipris:day'] ?? 0, limit: configured('KIPRIS_DAILY_LIMIT', 500) },
    reanalysisCooldownSeconds: configured('AI_REANALYZE_COOLDOWN_SECONDS', 30),
  };
}
