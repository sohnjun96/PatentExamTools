import { parseBureau, type Bureau } from './bureaus';
import { canInputResult, caseMethods, literatureDetailsFor, resultFor, type EvaluationState } from './evaluation';

export type TaskRequest = { kind: 'result' | 'evaluation'; userId: string; caseId: string; monthId: string; methodId: string; bureau?: Bureau };
export const TASK_UPDATE_CHANNEL = 'simsadesk-task-updates';

export function parseTaskRequest(params: Record<string, unknown>): TaskRequest | null {
  const bureau = params.bureau === undefined ? undefined : parseBureau(params.bureau);
  if (bureau === null || typeof params.kind !== 'string' || !['result', 'evaluation'].includes(params.kind)) return null;
  for (const key of ['userId', 'caseId', 'monthId']) if (typeof params[key] !== 'string' || !params[key] || String(params[key]).length > 200) return null;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(params.monthId))) return null;
  if (params.kind === 'result' && (typeof params.methodId !== 'string' || !params.methodId || params.methodId.length > 200)) return null;
  return { kind: params.kind as TaskRequest['kind'], userId: String(params.userId), caseId: String(params.caseId), monthId: String(params.monthId), methodId: params.kind === 'result' ? String(params.methodId) : '', bureau };
}

export function taskWindowUrl(request: TaskRequest) {
  const params = new URLSearchParams({ kind: request.kind, userId: request.userId, caseId: request.caseId, monthId: request.monthId });
  if (request.methodId) params.set('methodId', request.methodId);
  if (request.bureau) params.set('bureau', request.bureau);
  return `/evaluation/task?${params}`;
}

/** Resolve against the API's actor-filtered state, never against URL labels. */
export function resolveTask(state: EvaluationState, request: TaskRequest) {
  const user = state.users.find(entry => entry.id === request.userId && entry.active);
  const item = state.cases.find(entry => entry.id === request.caseId && entry.monthId === request.monthId && entry.status === 'confirmed');
  const month = state.months.find(entry => entry.id === request.monthId && !entry.archived);
  if (!user || !item || !month || request.bureau && (user.bureau !== request.bureau || item.bureau !== request.bureau)) return null;
  if (request.kind === 'evaluation') return user.roles.includes('examiner') && item.examinerId === user.id ? { user, item, month, method: undefined } : null;
  const method = state.methods.find(entry => entry.id === request.methodId && entry.kind === 'ai');
  return method && canInputResult(state, { userId: user.id }, item, method.id) ? { user, item, month, method } : null;
}

/** A clean window can refresh phase/permission data without resetting its selected document. */
export function taskContentKey(state: EvaluationState, request: TaskRequest) {
  if (request.kind === 'result') {
    const result = resultFor(state, request.caseId, request.methodId);
    return JSON.stringify({ draft: literatureDetailsFor(result, 'draft'), publishedVersion: result?.publishedVersion || 0 });
  }
  const item = state.cases.find(entry => entry.id === request.caseId);
  return JSON.stringify({
    methods: item ? caseMethods(state, item).map(method => method.id) : [],
    results: state.results.filter(result => result.caseId === request.caseId).map(result => ({ methodId: result.methodId, version: result.publishedVersion, documents: literatureDetailsFor(result) })),
    evaluations: state.evaluations.filter(entry => entry.caseId === request.caseId),
    ranking: state.rankings.find(entry => entry.caseId === request.caseId),
  });
}

/** Opening the blank window synchronously keeps the user gesture; links provide a tab fallback. */
export function openTaskWindow(event: React.MouseEvent<HTMLAnchorElement>) {
  if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  const child = window.open('about:blank', '_blank', 'popup,width=1440,height=1000,resizable=yes,scrollbars=yes');
  if (!child) return;
  child.opener = null;
  child.location.replace(event.currentTarget.href);
  event.preventDefault();
}
