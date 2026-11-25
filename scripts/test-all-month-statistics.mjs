import assert from 'node:assert/strict';
import { ALL_OPERATION_MONTHS, createDemoState, emptyMonth, getReportScoreComparison, getStatistics, operationGroups, operationMonthsForScope } from '../app/lib/evaluation.ts';

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

const utilization = sample('2026-11', 5);
const [bothCited, claudeOnlyCited, noneCited, draftRanking, staleRanking] = utilization.cases;
for (const evaluation of utilization.evaluations) {
  if (evaluation.caseId === noneCited.id || (evaluation.caseId === claudeOnlyCited.id && evaluation.methodId === 'chatgpt')) {
    for (const document of evaluation.documents) document.cited = 'X';
  }
}
for (const ranking of utilization.rankings) ranking.values = { baseline: 1, chatgpt: 2, claude: 3 };
utilization.results = utilization.results.filter(result => !(result.caseId === noneCited.id && result.methodId === 'chatgpt'));
utilization.evaluations = utilization.evaluations.filter(entry => !(entry.caseId === noneCited.id && entry.methodId === 'chatgpt'));
const twoWayRank = utilization.rankings.find(ranking => ranking.caseId === noneCited.id);
twoWayRank.versions = { claude: 1 }; twoWayRank.values = { claude: 1, baseline: 2 };
utilization.rankings.find(ranking => ranking.caseId === draftRanking.id).finalized = false;
utilization.results.find(result => result.caseId === staleRanking.id && result.methodId === 'claude').publishedVersion++;
const usage = getStatistics(utilization, ALL_OPERATION_MONTHS);
assert.equal(usage.summary.complete, 3);
assert.equal(usage.methods.find(method => method.id === 'chatgpt').utilizationRate, 1 / 3, 'Two citations in one completed application count once, including cases without GPT in the denominator.');
assert.equal(usage.methods.find(method => method.id === 'claude').utilizationRate, 2 / 3);
assert.equal(usage.summary.utilizationRate, 2 / 3, 'Citations by two methods in one case count once in the total.');
assert.equal(usage.methods.find(method => method.kind === 'baseline').utilizationRate, null);
assert.equal(usage.methods.find(method => method.kind === 'baseline').firstPlace, 2, 'Draft and stale first-place report rankings are excluded.');
assert.equal(getStatistics(utilization, '2026-11', '', bothCited.examinerId).summary.utilizationRate, 1);
assert.equal(getStatistics(utilization, '2026-11', '', staleRanking.examinerId).summary.utilizationRate, null);

assert.equal(all.cases.find(item => item.id === december.cases[0].id).averageScore, 0, 'The same application in another month has independent scores.');
const pending = all.cases.find(item => item.id === 'january-pending');
assert.equal(pending.documentCount, 0); assert.equal(pending.citedCount, 0); assert.equal(pending.averageScore, null);
assert.deepEqual(pending.comparisons.map(method => [method.kind, method.rank]), [['baseline', null]]);

const partial = sample('2026-11', 1);
const claudeResult = partial.results.find(result => result.methodId === 'claude');
claudeResult.publishedDocuments = claudeResult.publishedDocuments.slice(0, 1);
const chatEvaluations = partial.evaluations.find(entry => entry.methodId === 'chatgpt').documents;
chatEvaluations.forEach(document => { document.score = null; document.cited = null; });
Object.assign(chatEvaluations[0], { score: 0, cited: 'O' });
Object.assign(chatEvaluations[1], { score: 2, cited: 'X' });
chatEvaluations[2].cited = 'O';
partial.rankings[0].finalized = false;
const currentCase = () => getStatistics(partial, '2026-11').cases[0];
const progress = currentCase();
assert.equal(progress.complete, false);
assert.equal(progress.documentCount, 8); assert.equal(progress.citedCount, 3);
assert.equal(progress.averageScore, 7 / 3, 'Average only entered scores, including zero, across individual documents.');
assert.deepEqual(progress.comparisons.map(method => [method.id, method.citedCount, method.documentCount, method.averageScore, method.rank]), [
  ['chatgpt', 2, 7, 1, 1], ['claude', 1, 1, 5, 3], ['baseline', 0, 0, null, 2],
]);
const visibleAi = partial.methods.filter(method => ['chatgpt', 'claude', 'gemini'].includes(method.id));
const compare = () => getReportScoreComparison(getStatistics(partial, '2026-11').rows, visibleAi);
assert.deepEqual(compare().methods.map(method => [method.id, method.higher, method.equal, method.lower, method.scored, method.averageScore]), [
  ['chatgpt', 0, 0, 2, 2, 1], ['claude', 1, 0, 0, 1, 5], ['gemini', 0, 0, 0, 0, null],
]);
assert.deepEqual(compare().total, { name: '전체', higher: 1, equal: 0, lower: 2, scored: 3, averageScore: 7 / 3 });
const allBands = getReportScoreComparison(all.rows, visibleAi).total;
assert.deepEqual(allBands, { name: '전체', higher: 12, equal: 4, lower: 26, scored: 42, averageScore: 80 / 42 });
const historicRows = getStatistics(state, ALL_OPERATION_MONTHS, 'historical').rows;
assert.deepEqual(getReportScoreComparison(historicRows, visibleAi).total, { name: '전체', higher: 0, equal: 0, lower: 14, scored: 14, averageScore: 0 });
claudeResult.publishedVersion++;
const stale = currentCase();
assert.equal(stale.averageScore, 1); assert.equal(stale.citedCount, 2); assert.equal(stale.documentCount, 8);
assert(stale.comparisons.every(method => method.rank === null), 'New delivery invalidates every rank in the former comparison.');
assert.equal(stale.comparisons.find(method => method.id === 'claude').averageScore, null);
partial.cases[0].hasPriorArtReport = false;
assert.equal(currentCase().comparisons.at(-1).rank, null);
assert.deepEqual(compare().total, { name: '전체', higher: 0, equal: 0, lower: 2, scored: 2, averageScore: 1 }, 'Current scores still compare to the three-point benchmark when the case has no report.');
console.log('All-month statistics passed: listed and closed month scope, archived exclusion, unique headcounts, weighted document scores, 0/X, drafts, historical groups and filters.');
