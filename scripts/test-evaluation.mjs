import assert from 'node:assert/strict';
import { applyAction, caseStatus, createDemoState, createInitialState, emptyMonth, getStatistics, rankingComplete, resultFor, validEvaluation, visibleState } from '../app/lib/evaluation.ts';

const monthId = '2026-10';
let state = createDemoState(monthId);
let stats = getStatistics(state, monthId);
assert.equal(stats.summary.participants, 10);
assert.equal(stats.summary.cases, 20);
assert.equal(stats.summary.complete, 20);
assert.equal(stats.rows.length, 280);
for (const method of stats.methods.filter((entry) => ['chatgpt', 'claude'].includes(entry.id))) {
  assert.equal(method.documents, 140);
  assert.equal(method.averageScore.toFixed(2), '2.86');
  assert.equal((method.citationRate * 100).toFixed(1), '28.6');
}
assert.equal(stats.methods.find((entry) => entry.id === 'chatgpt').firstPlace, 20);
assert.equal(stats.methods.find((entry) => entry.id === 'baseline').documents, 0);
assert.equal(stats.methods.find((entry) => entry.id === 'baseline').pending, 0);
for (const id of ['gemini', 'perplexity', 'grok']) {
  const method = stats.methods.find((entry) => entry.id === id);
  assert.equal(method.documents, 0, 'Inactive presets must not create sample search results.');
  assert.equal(method.averageScore, null);
}
assert.equal(getStatistics(state, monthId, 'group-a').rows.length, 140);
assert.equal(getStatistics(state, monthId, '', 'demo-user-1').rows.length, 28);
assert.equal(getStatistics(state, '2026-11').summary.inputRate, null);
assert.equal(getStatistics(state, '2026-11').summary.participants, 0);
assert.equal(getStatistics(state, '2026-11').rows.length, 0);

const item = state.cases[0];
const initialResult = resultFor(state, item.id, 'chatgpt');
const firstReview = validEvaluation(state, item.id, 'chatgpt');
const zeroDocument = firstReview.documents.find((document) => document.score === 0);
assert.equal(zeroDocument.cited, 'X');
firstReview.documents.find((document) => document.number === zeroDocument.number).score = null;
assert.equal(caseStatus(state, item).complete, false);
assert.equal(getStatistics(state, monthId).rows.find((row) => row.caseId === item.id && row.number === zeroDocument.number).score, null);
firstReview.documents.find((document) => document.number === zeroDocument.number).score = 0;
assert.equal(caseStatus(state, item).complete, true);
firstReview.documents[0].cited = null;
assert.equal(caseStatus(state, item).complete, false);
firstReview.documents[0].cited = 'O';

// A private edit must leave the published documents and valid reviews intact.
state = applyAction(state, { userId: 'demo-user-1' }, { type: 'saveResult', caseId: item.id, methodId: 'chatgpt', documents: ['KR1020999999999A'], publish: false });
assert.equal(resultFor(state, item.id, 'chatgpt').publishedVersion, 1);
assert.equal(caseStatus(state, item).complete, true);
assert.equal(visibleState(state, { userId: 'demo-user-2' }).results.find((entry) => entry.caseId === item.id && entry.methodId === 'chatgpt'), undefined);
const ownActor = { userId: 'demo-user-1' };
assert.equal(visibleState(state, ownActor).results.filter((entry) => entry.caseId === item.id).length, 2);
assert.equal(visibleState(state, ownActor).results.find((entry) => entry.caseId === item.id && entry.methodId === 'claude').draftDocuments.length, 0);
assert.equal(visibleState(state, ownActor).results.filter((entry) => state.cases.find((candidate) => candidate.id === entry.caseId)?.examinerId !== 'demo-user-1').every((entry) => entry.methodId === 'chatgpt'), true);
assert.equal(visibleState(state, {}).cases.length, 0);

// Reordering the same literature retains identity and never moves one score to another.
state = applyAction(state, { userId: 'demo-user-1' }, { type: 'saveResult', caseId: item.id, methodId: 'chatgpt', documents: [...initialResult.publishedDocuments].reverse(), publish: true });
assert.equal(resultFor(state, item.id, 'chatgpt').publishedVersion, 1);
assert.equal(validEvaluation(state, item.id, 'chatgpt').documents.find((document) => document.number === zeroDocument.number).score, 0);

// Republishing changed literature invalidates only that AI review and the case ranking.
state = applyAction(state, { userId: 'demo-user-1' }, { type: 'saveResult', caseId: item.id, methodId: 'chatgpt', documents: ['KR1020999999999A', ...initialResult.publishedDocuments.slice(1)], publish: true });
assert.equal(caseStatus(state, item).evaluationStatus, '재확인 필요');
assert.equal(validEvaluation(state, item.id, 'chatgpt'), undefined);
assert.equal(validEvaluation(state, item.id, 'claude').documents.length, 7);
stats = getStatistics(state, monthId);
assert.equal(stats.summary.complete, 19);
assert.equal(stats.summary.recheck, 1);
assert.equal(stats.methods.find((entry) => entry.id === 'chatgpt').firstPlace, 19);
assert.equal(stats.rows.filter((row) => row.caseId === item.id && row.methodId === 'chatgpt').every((row) => row.score === null && row.cited === null), true);

assert.throws(() => applyAction(state, { userId: 'demo-user-2' }, { type: 'saveResult', caseId: item.id, methodId: 'chatgpt', documents: ['A'], publish: true }), /배정받은/);
assert.throws(() => applyAction(state, { userId: 'demo-user-1' }, { type: 'saveResult', caseId: item.id, methodId: 'chatgpt', documents: [], publish: true }), /한 건 이상/);
assert.throws(() => applyAction(state, { userId: 'demo-user-1' }, { type: 'saveResult', caseId: item.id, methodId: 'chatgpt', documents: Array.from({length: 8}, (_, i) => `DOC${i}`), publish: true }), /최대 7/);
assert.throws(() => applyAction(state, { admin: true }, { type: 'loadDemo' }), /운영 자료/);
assert.equal(rankingComplete(state, item, { chatgpt: 1, claude: 1, baseline: 2 }), false);
assert.equal(rankingComplete(state, item, { chatgpt: 1, claude: 3, baseline: 'excluded' }), false);
assert.equal(rankingComplete(state, item, { chatgpt: 'incomparable', claude: 'excluded', baseline: 'excluded' }), true);

// Assignment changes affect current workload, while past attribution is a snapshot.
const personnel = structuredClone(state.personnel);
personnel.assignments.find((entry) => entry.groupId === 'group-a' && entry.methodId === 'chatgpt').userId = 'demo-user-2';
state = applyAction(state, { admin: true }, { type: 'savePersonnel', personnel });
assert.equal(resultFor(state, item.id, 'chatgpt').publishedBy.id, 'demo-user-1');
assert.equal(getStatistics(state, monthId).accounts.find((entry) => entry.id === 'demo-user-1').aiTarget, 0);
assert.equal(getStatistics(state, monthId).accounts.find((entry) => entry.id === 'demo-user-2').aiTarget, 20);
const reassignedPersonnel = structuredClone(state.personnel);
reassignedPersonnel.memberships = reassignedPersonnel.memberships.filter((participant) => participant.userId !== 'demo-user-1');
state = applyAction(state, { admin: true }, { type: 'savePersonnel', personnel: reassignedPersonnel });
const historicalAccount = getStatistics(state, monthId).accounts.find((entry) => entry.id === 'demo-user-1');
assert.equal(historicalAccount.cases, 2);
assert.equal(historicalAccount.aiTarget, 0);
assert.equal(getStatistics(state, monthId, 'group-a').accounts.find((entry) => entry.id === 'demo-user-1').cases, 2);
assert.equal(getStatistics(state, monthId, 'group-b').accounts.find((entry) => entry.id === 'demo-user-1'), undefined);
assert.equal(getStatistics(state, monthId).summary.cases, 20);
state = applyAction(state, { admin: true }, { type: 'setMonthClosed', monthId, closed: true });
assert.throws(() => applyAction(state, { userId: 'demo-user-2' }, { type: 'saveResult', caseId: item.id, methodId: 'chatgpt', documents: ['A'], publish: false }), /마감한/);
state = applyAction(state, { admin: true }, { type: 'setMonthClosed', monthId, closed: false });

// New-month draft selection is excluded until its whole list is confirmed.
const november = { ...emptyMonth('2026-11'), stages: { selection: 'running', result: 'pending', evaluation: 'pending' } };
state = applyAction(state, { admin: true }, { type: 'savePersonnel', personnel: { ...state.personnel, memberships: [...state.personnel.memberships, { userId: 'demo-user-1', groupId: 'group-a' }] } });
state = applyAction(state, { admin: true }, { type: 'saveMonth', month: november });
const rows = [{ applicationNumber: '10-2020-0093844', cpc: '' }, { applicationNumber: '10-2021-0093844', cpc: 'G06N' }];
assert.throws(() => applyAction(state, { userId: 'demo-user-1' }, { type: 'saveSelection', monthId: november.id, rows: [{ applicationNumber: 'ABC1020200093844', cpc: '' }], confirm: false }), /숫자·공백·하이픈/);
assert.throws(() => applyAction(state, { admin: true }, { type: 'adminAddCase', monthId: november.id, examinerId: 'demo-user-1', row: { applicationNumber: 'KR10-2020-0093844', cpc: '' } }), /숫자·공백·하이픈/);
const spaced = applyAction(state, { userId: 'demo-user-1' }, { type: 'saveSelection', monthId: november.id, rows: [{ applicationNumber: '10 2020 0093844', cpc: '' }], confirm: false });
assert.equal(spaced.cases.find((entry) => entry.monthId === november.id && entry.status === 'draft').applicationNumber, '10 2020 0093844');
state = applyAction(state, { userId: 'demo-user-1' }, { type: 'saveSelection', monthId: november.id, rows, confirm: false });
assert.equal(getStatistics(state, november.id).summary.cases, 0);
assert.equal(getStatistics(state, november.id).summary.unselected, 10);
state = applyAction(state, { userId: 'demo-user-1' }, { type: 'saveSelection', monthId: november.id, rows, confirm: true });
assert.equal(getStatistics(state, november.id).summary.cases, 2);
assert.equal(getStatistics(state, november.id).summary.unselected, 9);
assert.throws(() => applyAction(state, { userId: 'demo-user-1' }, { type: 'saveSelection', monthId: november.id, rows: [], confirm: false }), /선정 확정/);
const invalidPersonnel = { ...state.personnel, memberships: [...state.personnel.memberships, state.personnel.memberships[0]] };
assert.throws(() => applyAction(state, { admin: true }, { type: 'savePersonnel', personnel: invalidPersonnel }), /한 개/);

// Dates are planning targets: submission works on and after the Korean due date.
for (const timestamp of ['2026-10-27T14:59:59.999Z', '2026-10-27T15:00:00Z', '2027-01-01T00:00:00Z']) {
  const now = new Date(timestamp);
  const deadlines = { selectionDeadline: '2026-10-27', resultDeadline: '2026-10-27', evaluationDeadline: '2026-10-27' };
  let deadlineState = applyAction(createDemoState(monthId), { admin: true }, { type: 'saveMonth', month: { ...emptyMonth('2026-11'), ...deadlines } }, now);
  for (const stage of ['selection', 'result', 'evaluation']) deadlineState = applyAction(deadlineState, { admin: true }, { type: 'setMonthStage', monthId: '2026-11', stage, status: 'running' }, now);
  const selection = { type: 'saveSelection', monthId: '2026-11', rows: [rows[0]], confirm: true };
  deadlineState = applyAction(deadlineState, { userId: 'demo-user-1' }, { ...selection, confirm: false }, now);
  deadlineState = applyAction(deadlineState, { userId: 'demo-user-1' }, selection, now);
  const selected = deadlineState.cases.find(entry => entry.monthId === '2026-11' && entry.status === 'confirmed');
  const resultAction = { type: 'saveResult', caseId: selected.id, methodId: 'chatgpt', documents: ['KR2020000000A'], publish: true };
  deadlineState = applyAction(deadlineState, { userId: 'demo-user-1' }, { ...resultAction, publish: false }, now);
  deadlineState = applyAction(deadlineState, { userId: 'demo-user-1' }, resultAction, now);
  const evaluationAction = { type: 'saveEvaluation', caseId: selected.id, evaluations: [{ methodId: 'chatgpt', version: 1, documents: [{ number: 'KR2020000000A', score: 3, cited: 'O', note: '' }] }], rankings: {}, versions: { chatgpt: 1, claude: 0 }, overallComment: '기한 이후 평가도 저장' };
  deadlineState = applyAction(deadlineState, { userId: 'demo-user-1' }, evaluationAction, now);
  assert.equal(validEvaluation(deadlineState, selected.id, 'chatgpt').documents[0].score, 3);
  const prior = deadlineState.months.find(entry => entry.id === '2026-11');
  const revised = { ...prior, selectionDeadline: '2026-11-05', resultDeadline: '2026-11-15', evaluationDeadline: '2026-11-25' };
  deadlineState = applyAction(deadlineState, { admin: true }, { type: 'saveMonth', month: revised }, now);
  assert.deepEqual(deadlineState.months.find(entry => entry.id === prior.id), revised);
  deadlineState = applyAction(deadlineState, { admin: true }, { type: 'setMonthClosed', monthId: prior.id, closed: true }, now);
  const closedMonth = deadlineState.months.find(entry => entry.id === prior.id);
  const closedRevision = { ...closedMonth, selectionDeadline: '', resultDeadline: '2026-12-01', evaluationDeadline: '2026-12-10', closed: false, confirmedUserIds: [] };
  const edited = applyAction(deadlineState, { admin: true }, { type: 'saveMonth', month: closedRevision }, now);
  assert.deepEqual(edited.months.find(entry => entry.id === prior.id), { ...closedMonth, selectionDeadline: '', resultDeadline: '2026-12-01', evaluationDeadline: '2026-12-10' });
  for (const key of ['cases', 'results', 'evaluations', 'rankings', 'personnel']) assert.deepEqual(edited[key], deadlineState[key]);
  assert.throws(() => applyAction(deadlineState, { userId: 'demo-user-1' }, { type: 'saveMonth', month: revised }, now), error => error.status === 403);
  const ignoredLegacyLimit = applyAction(deadlineState, { admin: true }, { type: 'saveMonth', month: { ...closedMonth, caseLimit: 8 } }, now);
  assert.equal(ignoredLegacyLimit.months.find(entry => entry.id === prior.id).caseLimit, undefined);
  const ignoredAISelection = applyAction(deadlineState, { admin: true }, { type: 'saveMonth', month: { ...closedMonth, methodIds: ['chatgpt'] } }, now);
  assert.deepEqual(ignoredAISelection.months.find(entry => entry.id === prior.id).methodIds, closedMonth.methodIds, 'Old monthly AI configuration is ignored and cannot alter comparison scope.');
  for (const invalidDate of ['2026-02-30', '2026-13-01', 'invalid', null, 123]) {
    assert.throws(() => applyAction(deadlineState, { admin: true }, { type: 'saveMonth', month: { ...closedMonth, resultDeadline: invalidDate } }, now), /기한 날짜/);
  }
  for (const action of [selection, resultAction, evaluationAction]) {
    assert.throws(() => applyAction(edited, { userId: 'demo-user-1' }, action, now), /마감한/);
  }
}
// A previously stored per-examiner cap cannot restrict drafts or confirmed selections.
let legacyLimitedState = applyAction(createDemoState(monthId), { admin: true }, { type: 'saveMonth', month: emptyMonth('2026-11') });
legacyLimitedState.months.find(month => month.id === '2026-11').caseLimit = 1;
legacyLimitedState.months.find(month => month.id === '2026-11').stages = { selection: 'running', result: 'stopped', evaluation: 'stopped' };
legacyLimitedState = applyAction(legacyLimitedState, { userId: 'demo-user-1' }, { type: 'saveSelection', monthId: '2026-11', rows, confirm: false });
assert.equal(legacyLimitedState.cases.filter(item => item.monthId === '2026-11' && item.status === 'draft').length, rows.length);
legacyLimitedState = applyAction(legacyLimitedState, { userId: 'demo-user-1' }, { type: 'saveSelection', monthId: '2026-11', rows, confirm: true });
assert.equal(legacyLimitedState.cases.filter(item => item.monthId === '2026-11' && item.status === 'confirmed').length, rows.length);
const legacyMonth = legacyLimitedState.months.find(month => month.id === '2026-11');
const withoutLimit = applyAction(legacyLimitedState, { admin: true }, { type: 'saveMonth', month: { ...legacyMonth, resultDeadline: '2026-11-15' } });
assert.equal('caseLimit' in withoutLimit.months.find(month => month.id === '2026-11'), false);
assert.deepEqual(withoutLimit.cases, legacyLimitedState.cases);
assert.deepEqual(withoutLimit.months.find(month => month.id === '2026-11').stages, legacyMonth.stages);
assert.equal(createInitialState(monthId).users.length, 0);
console.log('Evaluation rules: 20 cases / 40 AI bundles / 280 literature evaluations verified; drafts, 0/X, recheck, scopes, rankings, assignments, deadlines and closure passed.');
