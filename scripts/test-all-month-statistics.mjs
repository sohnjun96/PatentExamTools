import assert from 'node:assert/strict';
import { ALL_OPERATION_MONTHS, createDemoState, emptyMonth, getStatistics, operationGroups, operationMonthsForScope } from '../app/lib/evaluation.ts';

function sample(monthId, count) {
  const state = createDemoState(monthId);
  state.cases = state.cases.slice(0, count);
  const ids = new Set(state.cases.map(item => item.id));
  for (const key of ['results', 'evaluations', 'rankings']) state[key] = state[key].filter(entry => ids.has(entry.caseId));
  return state;
}
const november = sample('2026-11', 2), december = sample('2026-12', 1), archived = sample('2026-10', 1);
december.months[0].closed = true;
november.months[0].confirmedUserIds = ['demo-user-1'];
december.months[0].confirmedUserIds = ['demo-user-2'];
december.evaluations.forEach(evaluation => evaluation.documents.forEach(document => { document.score = 0; document.cited = 'X'; }));
december.rankings[0].finalized = false;
december.cases[0].groupId = 'historical'; december.cases[0].groupName = '이전 그룹';
const state = { ...november,
  months: [...november.months, ...december.months, emptyMonth('2027-01'), { ...archived.months[0], archived: true, closed: true }],
  groups: [...november.groups, { id: 'historical', name: '이전 그룹', deletedAt: '2026-12-31' }, { id: 'unused', name: '삭제된 빈 그룹', deletedAt: '2026-12-31' }],
  cases: [...november.cases, ...december.cases, ...archived.cases,
    { ...november.cases[0], id: 'january-pending', monthId: '2027-01' },
    { ...november.cases[0], id: 'draft', monthId: '2026-12', status: 'draft' },
    { ...november.cases[0], id: 'cancelled', monthId: '2026-12', status: 'cancelled' },
    { ...november.cases[0], id: 'orphan', monthId: '2025-01' }],
  results: [...november.results, ...december.results, ...archived.results],
  evaluations: [...november.evaluations, ...december.evaluations, ...archived.evaluations],
  rankings: [...november.rankings, ...december.rankings, ...archived.rankings],
};
const before = JSON.stringify(state);
const all = getStatistics(state, ALL_OPERATION_MONTHS);
assert.deepEqual(operationMonthsForScope(state, ALL_OPERATION_MONTHS).map(month => month.id), ['2026-11', '2026-12', '2027-01']);
assert.equal(all.summary.cases, 4, 'Closed months are included; archived, missing, draft and cancelled cases are excluded.');
assert.equal(all.summary.participants, 10, 'The same examiner must not be counted once per month.');
assert.equal(all.summary.unselected, 8);
assert.equal(all.summary.complete, 2); assert.equal(all.summary.inProgress, 1); assert.equal(all.summary.unevaluated, 1);
assert.equal(all.summary.evaluationRate, 0.5); assert.equal(all.summary.inputRate, 0.75);
assert.equal(all.rows.length, 42);
assert.deepEqual([...new Set(all.rows.map(row => row.monthId))], ['2026-11', '2026-12']);
const chatgpt = all.methods.find(method => method.id === 'chatgpt');
assert.equal(chatgpt.documents, 21);
assert.equal(chatgpt.averageScore, 40 / 21, 'Aggregate scores are weighted by documents, rather than averaging monthly averages.');
assert.equal(chatgpt.citationRate, 4 / 21); assert.equal(chatgpt.target, 4); assert.equal(chatgpt.completed, 3);
assert.equal(all.accounts.find(account => account.id === 'demo-user-1').cases, 4);
assert.deepEqual(operationGroups(state, ALL_OPERATION_MONTHS).map(group => group.id), ['group-a', 'group-b', 'historical']);
assert.equal(all.groups.find(group => group.id === 'historical').cases, 1);
assert.equal(getStatistics(state, ALL_OPERATION_MONTHS, 'historical').summary.cases, 1);
assert.equal(getStatistics(state, ALL_OPERATION_MONTHS, '', 'demo-user-2').summary.cases, 0);
assert.equal(getStatistics(state, '2026-11').summary.cases, 2);
assert.equal(getStatistics(state, '2026-12').summary.cases, 1);
assert.equal(getStatistics(state, '2027-01').summary.cases, 1);
assert.equal(getStatistics(state, 'invalid').summary.cases, 0);
assert.equal(getStatistics({ ...state, months: [], cases: [] }, ALL_OPERATION_MONTHS).summary.cases, 0);
assert.equal(JSON.stringify(state), before, 'Queries never rewrite months, cases or evaluation data.');
console.log('All-month statistics passed: listed and closed month scope, archived exclusion, unique headcounts, weighted document scores, 0/X, drafts, historical groups and filters.');
