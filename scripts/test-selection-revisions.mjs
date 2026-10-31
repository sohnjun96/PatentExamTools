import assert from 'node:assert/strict';
import { applyAction, canInputResult, caseMethods, caseStatus, createDemoState, getStatistics, rankingIsCurrent, resultFor, validEvaluation } from '../app/lib/evaluation.ts';

const admin = { admin: true };
const owner = { userId: 'demo-user-1' };
const original = createDemoState('2026-11');
const before = structuredClone(original);
const ownCases = state => state.cases.filter(item => item.monthId === '2026-11' && item.examinerId === owner.userId && item.status === 'confirmed');
const rowsOf = state => ownCases(state).map(({ applicationNumber, cpc }) => ({ applicationNumber, cpc }));
const [retained, removed] = ownCases(original);
const revision = rows => ({ type: 'saveSelection', monthId: '2026-11', rows, confirm: true });
const replacement = { applicationNumber: '10-2024-9900088', cpc: 'G06F 16/00' };
let state = applyAction(original, owner, revision([{ applicationNumber: retained.applicationNumber, cpc: 'G06N 3/00' }, replacement]));
assert.deepEqual(original, before, 'Revising a submission must not mutate the prior state.');
assert.equal(ownCases(state).length, 2);
const kept = state.cases.find(item => item.id === retained.id);
assert.equal(kept.cpc, 'G06N 3/00');
assert.equal(kept.groupId, retained.groupId);
assert.equal(kept.examinerName, retained.examinerName);
assert.equal(state.cases.find(item => item.id === removed.id).status, 'cancelled');
const added = ownCases(state).find(item => item.applicationNumber === replacement.applicationNumber);
assert(added && ![retained.id, removed.id].includes(added.id), 'A replacement is a new task, never a relabelled historical task.');
for (const key of ['results', 'evaluations', 'rankings']) assert.deepEqual(state[key], original[key], 'Old work must be preserved: ' + key);
assert.equal(state.results.some(result => result.caseId === added.id), false);
assert.equal(canInputResult(state, owner, state.cases.find(item => item.id === removed.id), 'chatgpt'), false);
assert.equal(canInputResult(state, owner, added, 'chatgpt'), true);
assert.throws(() => applyAction(state, owner, { type: 'saveResult', caseId: removed.id, methodId: 'chatgpt', documents: ['Historical task'], publish: true }), error => error.status === 400);
assert.equal(getStatistics(state, '2026-11', '', owner.userId).summary.cases, 2);
assert.equal(getStatistics(state, '2026-11', '', owner.userId).rows.some(row => row.caseId === removed.id), false);
assert.deepEqual(state.cases.filter(item => item.examinerId !== owner.userId), original.cases.filter(item => item.examinerId !== owner.userId));

state = applyAction(state, owner, revision(rowsOf(state).reverse().map(row => ({ ...row, applicationNumber: row.applicationNumber.replaceAll('-', ' ') }))));
assert.equal(ownCases(state).find(item => item.applicationNumber.replaceAll(' ', '-') === retained.applicationNumber).id, retained.id, 'Reordering and formatting changes must preserve case identity.');
assert.equal(state.months[0].confirmedUserIds.filter(id => id === owner.userId).length, 1);
assert.throws(() => applyAction(state, owner, { ...revision(rowsOf(state)), confirm: false }), /선정 확정/);
assert.throws(() => applyAction(state, owner, revision([replacement, replacement])), /중복/);

const snapshot = structuredClone(state);
for (const status of ['stopped', 'closed']) {
  const blocked = applyAction(state, admin, { type: 'setMonthStage', monthId: '2026-11', stage: 'selection', status });
  assert.throws(() => applyAction(blocked, owner, revision([replacement])), error => error.status === 409);
  const reopened = applyAction(blocked, admin, { type: 'setMonthStage', monthId: '2026-11', stage: 'selection', status: 'running' });
  assert.doesNotThrow(() => applyAction(reopened, owner, revision(rowsOf(reopened))));
}
const closed = applyAction(state, admin, { type: 'setMonthClosed', monthId: '2026-11', closed: true });
assert.throws(() => applyAction(closed, owner, revision([replacement])), error => error.status === 409);
assert.deepEqual(state, snapshot);

const withdrawn = applyAction(state, owner, revision([]));
assert.equal(ownCases(withdrawn).length, 0, 'Before closure, an examiner can withdraw the entire submitted list.');
assert(withdrawn.months[0].confirmedUserIds.includes(owner.userId));
for (const key of ['results', 'evaluations', 'rankings']) assert.deepEqual(withdrawn[key], original[key]);
const restored = applyAction(withdrawn, owner, revision([replacement]));
assert.equal(ownCases(restored).length, 1);
assert.notEqual(ownCases(restored)[0].id, added.id, 'Re-added applications must not inherit cancelled work automatically.');

const reassigned = structuredClone(original);
reassigned.personnel.memberships.find(entry => entry.userId === owner.userId).groupId = 'group-b';
const moved = applyAction(reassigned, owner, revision([...rowsOf(reassigned), replacement]));
assert.equal(moved.cases.find(item => item.id === retained.id).groupId, retained.groupId);
assert.equal(ownCases(moved).find(item => item.applicationNumber === replacement.applicationNumber).groupId, 'group-b');
const aiOnly = structuredClone(original);
aiOnly.users.find(user => user.id === owner.userId).roles = ['ai'];
assert.throws(() => applyAction(aiOnly, owner, revision([replacement])), error => error.status === 403);

// Prior-art report availability changes the comparison scope without discarding completed AI work.
const legacyCase = ownCases(original)[0];
assert.equal(legacyCase.hasPriorArtReport, undefined);
assert(caseMethods(original, legacyCase).some(method => method.kind === 'baseline'), 'Historical cases with unknown report availability keep their original comparison scope.');
assert.equal(caseStatus(original, legacyCase).complete, true);
const legacyReported = applyAction(original, owner, revision(rowsOf(original).map(row => ({ ...row, hasPriorArtReport: true }))));
assert.equal(caseStatus(legacyReported, legacyReported.cases.find(item => item.id === legacyCase.id)).complete, true, 'Confirming an already available legacy report must keep the existing comparison valid.');
const reportRows = rowsOf(original).map(row => row.applicationNumber === legacyCase.applicationNumber ? { ...row, hasPriorArtReport: false } : row);
const noReport = applyAction(original, owner, revision(reportRows));
const noReportCase = noReport.cases.find(item => item.id === legacyCase.id);
assert.equal(noReportCase.hasPriorArtReport, false);
assert.equal(noReportCase.id, legacyCase.id);
assert(!caseMethods(noReport, noReportCase).some(method => method.kind === 'baseline'), 'A case marked without a report must not rank an unavailable baseline.');
assert.deepEqual(noReport.results, original.results, 'Changing report presence must retain AI results and draft reports.');
assert.deepEqual(noReport.evaluations, original.evaluations, 'Changing report presence must retain document scores and comments.');
assert.deepEqual(validEvaluation(noReport, legacyCase.id, 'chatgpt'), validEvaluation(original, legacyCase.id, 'chatgpt'));
assert.equal(rankingIsCurrent(noReport, noReportCase, noReport.rankings.find(entry => entry.caseId === legacyCase.id)), false);
assert.equal(caseStatus(noReport, noReportCase).evaluationStatus, '재확인 필요');
const versionsWithoutReport = Object.fromEntries(caseMethods(noReport, noReportCase).filter(method => method.kind === 'ai').map(method => [method.id, resultFor(noReport, noReportCase.id, method.id).publishedVersion]));
assert.throws(() => applyAction(noReport, owner, { type: 'saveEvaluation', caseId: noReportCase.id, evaluations: [], rankings: { chatgpt: 1, claude: 2, baseline: 3 }, versions: versionsWithoutReport }), error => error.status === 400, 'Unavailable baseline rankings must be rejected by the server.');
const rerankedWithoutReport = applyAction(noReport, owner, { type: 'saveEvaluation', caseId: noReportCase.id, evaluations: [], rankings: { chatgpt: 1, claude: 2 }, versions: versionsWithoutReport });
assert.equal(rankingIsCurrent(rerankedWithoutReport, noReportCase, rerankedWithoutReport.rankings.find(entry => entry.caseId === legacyCase.id)), true);
assert.equal(caseStatus(rerankedWithoutReport, noReportCase).complete, true, 'Only currently available investigation methods are required for a complete ranking.');
const omittedReportFlag = applyAction(rerankedWithoutReport, owner, revision(rowsOf(rerankedWithoutReport)));
assert.equal(omittedReportFlag.cases.find(item => item.id === legacyCase.id).hasPriorArtReport, false, 'Older clients omitting the new field must preserve a known stored value.');
const withReport = applyAction(rerankedWithoutReport, owner, revision(rowsOf(rerankedWithoutReport).map(row => ({ ...row, hasPriorArtReport: row.applicationNumber === legacyCase.applicationNumber ? true : undefined }))));
const withReportCase = withReport.cases.find(item => item.id === legacyCase.id);
assert.equal(withReportCase.hasPriorArtReport, true);
assert(caseMethods(withReport, withReportCase).some(method => method.kind === 'baseline'));
assert.equal(caseStatus(withReport, withReportCase).evaluationStatus, '재확인 필요', 'Adding a report to an already ranked case requires comparing it again.');
assert.deepEqual(withReport.results, original.results);
assert.deepEqual(withReport.evaluations, original.evaluations);
for (const flag of ['있음', 'false', 0, 1, null, {}]) {
  assert.throws(() => applyAction(original, owner, revision(rowsOf(original).map(row => ({ ...row, hasPriorArtReport: flag })))), error => error.status === 400);
  assert.throws(() => applyAction(original, admin, { type: 'adminAddCase', monthId: '2026-11', examinerId: owner.userId, row: { ...replacement, hasPriorArtReport: flag } }), error => error.status === 400);
}
for (const flag of [true, false]) {
  const createdByAdmin = applyAction(original, admin, { type: 'adminAddCase', monthId: '2026-11', examinerId: owner.userId, row: { ...replacement, hasPriorArtReport: flag } });
  assert.equal(ownCases(createdByAdmin).find(item => item.applicationNumber === replacement.applicationNumber).hasPriorArtReport, flag);
  const draftSource = structuredClone(original);
  draftSource.cases = draftSource.cases.filter(item => item.examinerId !== owner.userId);
  draftSource.months[0].confirmedUserIds = draftSource.months[0].confirmedUserIds.filter(id => id !== owner.userId);
  const drafted = applyAction(draftSource, owner, { type: 'saveSelection', monthId: '2026-11', rows: [{ ...replacement, hasPriorArtReport: flag }], confirm: false });
  assert.equal(drafted.cases.find(item => item.examinerId === owner.userId && item.status === 'draft').hasPriorArtReport, flag);
  const redraftedWithoutFlag = applyAction(drafted, owner, { type: 'saveSelection', monthId: '2026-11', rows: [replacement], confirm: false });
  assert.equal(redraftedWithoutFlag.cases.find(item => item.examinerId === owner.userId && item.status === 'draft').hasPriorArtReport, flag, 'Legacy autosaves must retain a known report value in an existing draft.');
  const confirmedWithoutFlag = applyAction(redraftedWithoutFlag, owner, { type: 'saveSelection', monthId: '2026-11', rows: [replacement], confirm: true });
  assert.equal(ownCases(confirmedWithoutFlag)[0].hasPriorArtReport, flag, 'Confirming a previously saved draft must not lose its report availability.');
}
console.log('Selection revisions passed: stable submitted identities, report availability persistence/validation, preserved AI work, comparison-scope rechecks, legacy clients, scoped permissions and closure.');
