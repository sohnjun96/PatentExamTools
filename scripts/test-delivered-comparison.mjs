import assert from 'node:assert/strict';
import {
  DEFAULT_OPERATION_MONTHS, applyAction, assignedCaseMethods, canInputResult, caseMethods, caseStatus,
  createDemoState, createInitialState, emptyMonth, getStatistics, preferredOperationMonth,
  rankingComplete, rankingIsCurrent, resultFor, visibleState, withDefaultOperationMonths,
} from '../app/lib/evaluation.ts';

const admin = { admin: true };
assert.deepEqual(createInitialState().months.map(month => month.id), [...DEFAULT_OPERATION_MONTHS]);
assert.equal(preferredOperationMonth(createInitialState().months, '2026-10'), '2026-11');
assert.equal(preferredOperationMonth(createInitialState().months, '2026-12'), '2026-12');
const existing = createInitialState('2026-10');
existing.months.push({ ...emptyMonth('2026-11'), closed: true, selectionDeadline: '2026-11-03' });
const before = structuredClone(existing);
const seeded = withDefaultOperationMonths(existing);
assert.deepEqual(existing, before, 'Seeding must not mutate an existing snapshot.');
assert.equal(seeded.months.length, 4);
assert.deepEqual(seeded.months.find(month => month.id === '2026-11'), existing.months[1]);
assert.equal(withDefaultOperationMonths(seeded), seeded, 'Default months must not be duplicated.');
assert.deepEqual(seeded.months.find(month => month.id === '2027-01').stages, { selection: 'running', result: 'stopped', evaluation: 'stopped' });
const noAI = createInitialState('2026-10');
noAI.methods = noAI.methods.filter(method => method.kind === 'baseline');
assert.doesNotThrow(() => applyAction(noAI, admin, { type: 'saveMonth', month: emptyMonth('2026-11') }), 'Month settings must not require AI selections.');

let state = createDemoState('2026-10');
state.months[0].methodIds = [];
const item = state.cases[0];
const owner = { userId: item.examinerId };
const claudeAuthor = { userId: 'demo-user-2' };
const undelivered = structuredClone(state);
undelivered.results = undelivered.results.filter(result => result.caseId !== item.id);
assert.equal(rankingComplete(undelivered, item, { baseline: 'incomparable' }), false);
assert.throws(() => applyAction(undelivered, owner, { type: 'saveEvaluation', caseId: item.id, evaluations: [], rankings: { baseline: 'incomparable' }, versions: {} }), /공개된 AI 검색 결과/, 'A report alone is not a delivered AI comparison.');
state.results = state.results.filter(result => !(result.caseId === item.id && result.methodId === 'claude'));
state = applyAction(state, admin, { type: 'saveMethod', method: { id: 'extra', name: '추가 AI', kind: 'ai', active: true } });
assert.deepEqual(caseMethods(state, item).map(method => method.id), ['chatgpt', 'baseline']);
assert.equal(canInputResult(state, claudeAuthor, item, 'claude'), true, 'Group assignments grant input access without monthly AI configuration.');
assert(visibleState(state, claudeAuthor).cases.some(entry => entry.id === item.id), 'AI authors must see assigned cases before delivering a first result.');
assert.equal(assignedCaseMethods(state, item).some(method => method.id === 'extra'), false);
assert.equal(getStatistics(state, item.monthId).methods.find(method => method.id === 'extra').target, 0);

function evaluationAction(current, ranks = { chatgpt: 1, baseline: 2 }) {
  const methods = caseMethods(current, item).filter(method => method.kind === 'ai');
  return {
    type: 'saveEvaluation', caseId: item.id, rankings: ranks,
    versions: Object.fromEntries(methods.map(method => [method.id, resultFor(current, item.id, method.id).publishedVersion])),
    evaluations: methods.map(method => {
      const result = resultFor(current, item.id, method.id);
      return { methodId: method.id, version: result.publishedVersion, documents: result.publishedDocuments.map(number => ({ number, score: 4, cited: 'O', note: '' })) };
    }),
  };
}
state = applyAction(state, owner, evaluationAction(state));
assert.equal(caseStatus(state, item).complete, true, 'Delivered AI and the report can complete evaluation while another assigned AI is pending.');
assert.equal(caseStatus(state, item).inputComplete, false);
state = applyAction(state, admin, { type: 'savePersonnel', personnel: { ...state.personnel, assignments: [...state.personnel.assignments, { userId: 'demo-user-1', groupId: item.groupId, methodId: 'extra' }] } });
assert.equal(caseStatus(state, item).complete, true, 'A new assignment without a delivery must not invalidate an existing comparison.');
const savedBeforeDelivery = evaluationAction(state);
state = applyAction(state, owner, { type: 'saveResult', caseId: item.id, methodId: 'extra', documents: ['New literature'], publish: false });
assert.equal(caseMethods(state, item).some(method => method.id === 'extra'), false, 'Draft results must not become comparison targets.');
state = applyAction(state, owner, { type: 'saveResult', caseId: item.id, methodId: 'extra', documents: ['New literature'], publish: true });
assert.equal(rankingIsCurrent(state, item, state.rankings.find(entry => entry.caseId === item.id)), false);
assert.equal(caseStatus(state, item).evaluationStatus, '재확인 필요');
assert.throws(() => applyAction(state, owner, savedBeforeDelivery), error => error.status === 409, 'A concurrent new delivery must reject old comparison versions.');
state = applyAction(state, owner, evaluationAction(state, { chatgpt: 1, extra: 2, baseline: 3 }));
assert.equal(caseStatus(state, item).complete, true);
assert.equal(caseMethods(state, state.cases[1]).some(method => method.id === 'extra'), false, 'Comparison scope belongs to each case.');
const payload = evaluationAction(state, { chatgpt: 1, extra: 2, baseline: 3, claude: 3 });
assert.throws(() => applyAction(state, owner, payload), /공개된 AI 결과/, 'Undelivered AI cannot be ranked.');
const previousRanking = structuredClone(state.rankings.find(entry => entry.caseId === item.id));
state = applyAction(state, admin, { type: 'deleteMethod', methodId: 'extra' });
assert.deepEqual(state.rankings.find(entry => entry.caseId === item.id), previousRanking);
assert.equal(caseStatus(state, item).complete, true, 'Deleting an AI must preserve already delivered comparisons.');
assert.equal(canInputResult(state, owner, item, 'extra'), true, 'The original assignee can still maintain delivered historical work.');
assert.equal(getStatistics(state, item.monthId).methods.find(method => method.id === 'extra').documents, 1);
console.log('Delivered comparisons passed: additive default months, assignment-based input, per-case published AI and report rankings, partial delivery completion, concurrent delivery conflicts and historical preservation.');
