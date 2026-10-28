import assert from 'node:assert/strict';
import { applyAction, canInputResult, createDemoState, createInitialState, emptyMonth, getStatistics, normalizeEvaluationState, personnelOf, preferredOperationMonth, resultFor } from '../app/lib/evaluation.ts';

const admin = { admin: true };
const selection = (monthId, number = '10-2020-0093844') => ({ type: 'saveSelection', monthId, rows: [{ applicationNumber: number, cpc: 'G06N' }], confirm: true });
let state = createDemoState('2026-10');
const history = JSON.stringify({ cases: state.cases, results: state.results, evaluations: state.evaluations, rankings: state.rankings });
const legacy = structuredClone(state);
legacy.months[0].participants = structuredClone(legacy.personnel.memberships);
legacy.months[0].assignments = structuredClone(legacy.personnel.assignments);
delete legacy.personnel;
legacy.months.unshift({ ...emptyMonth('2026-11'), closed: true, participants: [{ userId: 'demo-user-1', groupId: 'group-b' }], assignments: [{ userId: 'demo-user-2', groupId: 'group-a', methodId: 'chatgpt' }] });
const original = JSON.stringify(legacy);
const normalized = normalizeEvaluationState(legacy);
assert.equal(JSON.stringify(legacy), original);
assert.equal(personnelOf(normalized).memberships.find(entry => entry.userId === 'demo-user-1').groupId, 'group-b');
assert.equal(personnelOf(normalized).assignments.find(entry => entry.groupId === 'group-a' && entry.methodId === 'chatgpt').userId, 'demo-user-2');
assert.equal(normalized.personnel.memberships.length, 10, 'Older entries absent from the latest month must not disappear.');
assert.equal(normalized.personnel.assignments.length, 4);
assert.equal(JSON.stringify({ cases: normalized.cases, results: normalized.results, evaluations: normalized.evaluations, rankings: normalized.rankings }), history);
const emptied = applyAction(normalized, admin, { type: 'savePersonnel', personnel: { memberships: [], assignments: [] } });
assert.deepEqual(personnelOf(emptied), { memberships: [], assignments: [] }, 'Clearing a shared allocation must never revive legacy month data.');
assert.equal(JSON.stringify(emptied.months), JSON.stringify(legacy.months));
assert.throws(() => applyAction(legacy, admin, { type: 'saveMonth', month: { ...legacy.months[1], participants: [] } }), /심사관 관리/);
assert.throws(() => applyAction(state, { userId: 'demo-user-1' }, { type: 'savePersonnel', personnel: state.personnel }), error => error.status === 403);

// An examiner registered after the periods were opened can work in both.
state = createInitialState('2026-10');
for (const monthId of ['2026-11', '2026-12']) state = applyAction(state, admin, { type: 'saveMonth', month: emptyMonth(monthId) });
for (const id of ['g1', 'g2']) state = applyAction(state, admin, { type: 'saveGroup', group: { id, name: id } });
for (const id of ['one', 'two']) state = applyAction(state, admin, { type: 'saveUser', user: { id, name: id, bureau: '기획국', division: '기획과', roles: ['examiner', 'ai'], active: true } });
state = applyAction(state, admin, { type: 'savePersonnel', personnel: { memberships: [{ userId: 'one', groupId: 'g1' }, { userId: 'two', groupId: 'g1' }], assignments: [{ groupId: 'g1', methodId: 'chatgpt', userId: 'one' }, { groupId: 'g1', methodId: 'claude', userId: 'two' }, { groupId: 'g2', methodId: 'chatgpt', userId: 'one' }] } });
assert(state.months.every(month => !month.closed && !month.participants.length && !month.assignments.length));
state = applyAction(state, { userId: 'one' }, selection('2026-10'));
state = applyAction(state, { userId: 'one' }, selection('2026-11'));
const october = state.cases.find(item => item.monthId === '2026-10');
const november = state.cases.find(item => item.monthId === '2026-11');
for (const item of [october, november]) {
  state = applyAction(state, admin, { type: 'setMonthStage', monthId: item.monthId, stage: 'result', status: 'running' });
  state = applyAction(state, { userId: 'one' }, { type: 'saveResult', caseId: item.id, methodId: 'chatgpt', documents: [item.monthId], publish: true });
}
assert.equal(resultFor(state, october.id, 'chatgpt').publishedDocuments[0], '2026-10');
assert.equal(resultFor(state, november.id, 'chatgpt').publishedDocuments[0], '2026-11');
state = applyAction(state, admin, { type: 'setMonthClosed', monthId: '2026-10', closed: true });
assert.throws(() => applyAction(state, { userId: 'one' }, { type: 'saveResult', caseId: october.id, methodId: 'chatgpt', documents: ['closed'], publish: true }), /마감한/);
assert.doesNotThrow(() => applyAction(state, { userId: 'one' }, { type: 'saveResult', caseId: november.id, methodId: 'chatgpt', documents: ['still open'], publish: true }));
assert.equal(state.months.find(month => month.id === '2026-11').closed, false);

const settingsBefore = JSON.stringify(state.months);
const changed = structuredClone(state.personnel);
changed.memberships.find(entry => entry.userId === 'two').groupId = 'g2';
changed.assignments.find(entry => entry.groupId === 'g1' && entry.methodId === 'chatgpt').userId = 'two';
state = applyAction(state, admin, { type: 'savePersonnel', personnel: changed });
assert.equal(JSON.stringify(state.months), settingsBefore);
assert.equal(canInputResult(state, { userId: 'two' }, october, 'chatgpt'), true);
assert.equal(canInputResult(state, { userId: 'two' }, november, 'chatgpt'), true);
assert.equal(canInputResult(state, { userId: 'one' }, november, 'chatgpt'), false);
assert.equal(resultFor(state, october.id, 'chatgpt').publishedBy.id, 'one');
state = applyAction(state, { userId: 'two' }, selection('2026-11', '10-2021-0093844'));
assert.equal(state.cases.find(item => item.examinerId === 'two').groupId, 'g2');
assert.equal(october.groupId, 'g1');

const personnelBefore = JSON.stringify(state.personnel);
const octoberBefore = JSON.stringify(state.months.find(month => month.id === '2026-10'));
state = applyAction(state, admin, { type: 'saveMonth', month: { ...state.months.find(month => month.id === '2026-11'), methodIds: ['claude'], resultDeadline: '2026-11-20', caseLimit: 2 } });
assert.equal(JSON.stringify(state.personnel), personnelBefore);
assert.equal(JSON.stringify(state.months.find(month => month.id === '2026-10')), octoberBefore);
assert.equal(canInputResult(state, { userId: 'two' }, november, 'chatgpt'), false);
assert.equal(canInputResult(state, { userId: 'two' }, november, 'claude'), true);
assert.equal(getStatistics(state, '2026-11').accounts.find(entry => entry.id === 'two').aiTarget, 1);
state = applyAction(state, { userId: 'one' }, selection('2026-12'));
assert(state.cases.some(item => item.monthId === '2026-12'));
assert.equal(preferredOperationMonth(state.months, '2026-10'), '2026-12');
assert.equal(preferredOperationMonth(state.months, '2026-11'), '2026-11');
for (const month of state.months) state = applyAction(state, admin, { type: 'setMonthClosed', monthId: month.id, closed: true });
assert.doesNotThrow(() => applyAction(state, admin, { type: 'savePersonnel', personnel: { ...state.personnel, memberships: [] } }));
assert.equal(preferredOperationMonth(state.months, '2026-10'), '2026-12');
assert.equal(preferredOperationMonth([]), '');
console.log('Independent operations: nondestructive legacy migration, shared personnel, concurrent periods, isolated closure/settings/results, historical attribution and permissions passed.');
