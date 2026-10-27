import assert from 'node:assert/strict';
import { getAdminReadiness } from '../app/lib/admin-guidance.ts';
import { applyAction, createDemoState, createInitialState } from '../app/lib/evaluation.ts';

const state = createDemoState('2026-10');
const snapshot = JSON.stringify(state);
const month = state.months[0];
const ready = getAdminReadiness(state, month);
assert.equal(ready.participantCount, 10);
assert.equal(ready.confirmedUserCount, 10);
assert.equal(ready.confirmedParticipantCount, 10);
assert.equal(ready.groupCount, 2);
assert.equal(ready.selectedAiCount, 2);
assert.equal(ready.assignmentTargetCount, 4); // Baseline never needs an AI owner.
assert.equal(ready.assignmentReadyCount, 4);
assert.equal(ready.canStart, true);
assert.equal(JSON.stringify(state), snapshot);

const missing = structuredClone(month);
missing.assignments.pop();
const missingReady = getAdminReadiness(state, missing);
assert.equal(missingReady.missingAssignments.length, 1);
assert.equal(missingReady.assignmentReadyCount, 3);
assert.equal(missingReady.canStart, false);
// The helper supplies guidance; it must not quietly add a backend save rule.
assert.doesNotThrow(() => applyAction(state, { admin: true }, { type: 'saveMonth', month: missing }));

const inactive = structuredClone(state);
inactive.users[0].active = false;
const inactiveReady = getAdminReadiness(inactive, inactive.months[0]);
assert.equal(inactiveReady.inactiveParticipants.length, 1);
assert.equal(inactiveReady.unavailableAssignments.some((assignment) => assignment.reason === 'user_inactive'), true);
assert.equal(inactiveReady.assignmentReadyCount, 3);
assert.equal(inactiveReady.canStart, false);

const removedRole = structuredClone(state);
removedRole.users[0].roles = ['admin'];
const roleReady = getAdminReadiness(removedRole, removedRole.months[0]);
assert.equal(roleReady.invalidParticipants.some((participant) => participant.reason === 'examiner_role_missing'), true);
assert.equal(roleReady.unavailableAssignments.some((assignment) => assignment.reason === 'ai_role_missing'), true);

const duplicates = structuredClone(month);
duplicates.assignments.push({ ...duplicates.assignments[0] });
duplicates.participants.push({ ...duplicates.participants[0] });
const duplicateReady = getAdminReadiness(state, duplicates);
assert.equal(duplicateReady.participantCount, 10);
assert.equal(duplicateReady.unavailableAssignments.filter((assignment) => assignment.reason === 'duplicate_assignment').length, 2);
assert.equal(duplicateReady.invalidParticipants.filter((participant) => participant.reason === 'duplicate_participant').length, 2);
assert.equal(duplicateReady.assignmentReadyCount, 3);

// Moving today's participants does not remove yesterday's confirmed-case group.
const historicalGroups = structuredClone(month);
historicalGroups.participants = historicalGroups.participants.filter((participant) => participant.groupId === 'group-a');
const historicReady = getAdminReadiness(state, historicalGroups);
assert.equal(historicReady.participantGroupCount, 1);
assert.equal(historicReady.groupCount, 2);
assert.equal(historicReady.assignmentTargetCount, 4);
assert.equal(historicReady.confirmedUserCount, 10);
assert.equal(historicReady.confirmedParticipantCount, 5);
assert.equal(getAdminReadiness(state, { ...month, closed: true }).canStart, false);

// Global inactive status does not unselect a method from an existing month.
const inactiveMethod = structuredClone(state);
inactiveMethod.methods.find((method) => method.id === 'chatgpt').active = false;
assert.equal(getAdminReadiness(inactiveMethod, month).selectedInactiveMethods.length, 1);
assert.equal(getAdminReadiness(inactiveMethod, month).canStart, true);
const sameNames = structuredClone(state);
sameNames.groups[1].name = sameNames.groups[0].name;
sameNames.methods.find((method) => method.id === 'claude').name = 'ChatGPT';
assert.equal(getAdminReadiness(sameNames, month).assignmentTargetCount, 4);
assert.equal(getAdminReadiness(sameNames, month).assignmentReadyCount, 4);

const invalid = structuredClone(month);
invalid.participants.push({ userId: 'unknown-user', groupId: 'unknown-group' });
invalid.assignments.push({ userId: 'unknown-user', groupId: 'group-a', methodId: 'chatgpt' });
invalid.methodIds.push('unknown-method', 'chatgpt');
const invalidReady = getAdminReadiness(state, invalid);
assert.equal(invalidReady.invalidParticipants.some((participant) => participant.reason === 'user_missing'), true);
assert.deepEqual(invalidReady.invalidMethodIds, ['unknown-method']);
assert.deepEqual(invalidReady.duplicateMethodIds, ['chatgpt']);
assert.equal(invalidReady.canStart, false);

const empty = createInitialState('2026-10');
const emptyReady = getAdminReadiness(empty, empty.months[0]);
assert.equal(emptyReady.participantCount, 0);
assert.equal(emptyReady.assignmentTargetCount, 0);
assert.equal(emptyReady.canStart, false);
console.log('Admin readiness: participation, historical groups, missing/inactive/duplicate assignments, changed roles, baseline exemption, method status and non-mutating draft guidance verified.');
