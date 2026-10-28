import assert from 'node:assert/strict';
import { applyAction, canInputResult, createDemoState, getStatistics } from '../app/lib/evaluation.ts';

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
console.log('Selection revisions passed: submitted-list edits, stable identities, cancelled history, scoped permissions, group snapshots, closure/reopening and withdrawal.');
