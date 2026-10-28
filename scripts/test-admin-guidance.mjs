import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as domain from '../app/lib/evaluation.ts';

const module = { exports: {} };
const source = fs.readFileSync(new URL('../app/lib/admin-guidance.ts', import.meta.url), 'utf8');
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
  module, exports: module.exports, require(id) { assert.equal(id, '@/app/lib/evaluation'); return domain; },
});
const { getAdminReadiness } = module.exports;
const { applyAction, createDemoState, createInitialState } = domain;
const state = createDemoState('2026-10');
const snapshot = JSON.stringify(state);
const month = state.months[0];
const ready = getAdminReadiness(state, month);
assert.equal(ready.participantCount, 10);
assert.equal(ready.confirmedUserCount, 10);
assert.equal(ready.confirmedParticipantCount, 10);
assert.equal(ready.groupCount, 2);
assert.equal(ready.selectedAiCount, 2);
assert.equal(ready.assignmentTargetCount, 4);
assert.equal(ready.assignmentReadyCount, 4);
assert.equal(ready.canStart, true);
assert.equal(JSON.stringify(state), snapshot);

const missing = structuredClone(state);
missing.personnel.assignments.pop();
const missingReady = getAdminReadiness(missing, month);
assert.equal(missingReady.missingAssignments.length, 0, 'A group may use only the AI methods actually assigned to it.');
assert.equal(missingReady.assignmentReadyCount, 3);
assert.equal(missingReady.canStart, true);
const unassignedGroup = structuredClone(state);
unassignedGroup.personnel.assignments = unassignedGroup.personnel.assignments.filter(entry => entry.groupId !== 'group-b');
assert.equal(getAdminReadiness(unassignedGroup, month).missingAssignments.length, 1);
assert.equal(getAdminReadiness(unassignedGroup, month).canStart, false);
assert.doesNotThrow(() => applyAction(state, { admin: true }, { type: 'savePersonnel', personnel: missing.personnel }));

const inactive = structuredClone(state);
inactive.users[0].active = false;
const inactiveReady = getAdminReadiness(inactive, month);
assert.equal(inactiveReady.participantCount, 9, 'Inactive examiners are not monthly participation targets.');
assert.equal(inactiveReady.unavailableAssignments.some(entry => entry.reason === 'user_inactive'), true);
assert.equal(inactiveReady.assignmentReadyCount, 3);
assert.equal(inactiveReady.canStart, false);

const removedRole = structuredClone(state);
removedRole.users[0].roles = ['admin'];
const roleReady = getAdminReadiness(removedRole, month);
assert.equal(roleReady.participantCount, 9);
assert.equal(roleReady.unavailableAssignments.some(entry => entry.reason === 'ai_role_missing'), true);

const duplicates = structuredClone(state);
duplicates.personnel.assignments.push({ ...duplicates.personnel.assignments[0] });
duplicates.personnel.memberships.push({ ...duplicates.personnel.memberships[0] });
const duplicateReady = getAdminReadiness(duplicates, month);
assert.equal(duplicateReady.participantCount, 10);
assert.equal(duplicateReady.unavailableAssignments.filter(entry => entry.reason === 'duplicate_assignment').length, 2);
assert.equal(duplicateReady.invalidParticipants.filter(entry => entry.reason === 'duplicate_participant').length, 2);
assert.equal(duplicateReady.assignmentReadyCount, 3);

const historical = structuredClone(state);
historical.personnel.memberships = historical.personnel.memberships.filter(entry => entry.groupId === 'group-a');
const historicReady = getAdminReadiness(historical, month);
assert.equal(historicReady.participantGroupCount, 1);
assert.equal(historicReady.groupCount, 2);
assert.equal(historicReady.assignmentTargetCount, 4);
assert.equal(historicReady.confirmedUserCount, 10);
assert.equal(historicReady.confirmedParticipantCount, 5);
assert.equal(getAdminReadiness(state, { ...month, closed: true }).canStart, false);

const inactiveMethod = structuredClone(state);
inactiveMethod.methods.find(entry => entry.id === 'chatgpt').active = false;
assert.equal(getAdminReadiness(inactiveMethod, month).selectedInactiveMethods.length, 1);
assert.equal(getAdminReadiness(inactiveMethod, month).canStart, true);
assert.equal(getAdminReadiness(inactiveMethod).unavailableAssignments.length, 0, 'An inactive registered AI remains a valid global allocation.');

const invalid = structuredClone(state);
invalid.personnel.memberships.push({ userId: 'unknown-user', groupId: 'unknown-group' });
invalid.personnel.assignments.push({ userId: 'unknown-user', groupId: 'group-a', methodId: 'chatgpt' });
const invalidMonth = { ...month, methodIds: [...month.methodIds, 'unknown-method', 'chatgpt'] };
const invalidReady = getAdminReadiness(invalid, invalidMonth);
assert.equal(invalidReady.invalidParticipants.some(entry => entry.reason === 'user_missing'), true);
assert.equal(JSON.stringify(invalidReady.invalidMethodIds), JSON.stringify([]));
assert.equal(JSON.stringify(invalidReady.duplicateMethodIds), JSON.stringify([]));
assert.equal(invalidReady.canStart, false);

const chatgptOnly = { ...month, methodIds: ['chatgpt', 'baseline'] };
assert.equal(getAdminReadiness(state, chatgptOnly).unavailableAssignments.length, 0);
assert.equal(getAdminReadiness(state, chatgptOnly).assignmentTargetCount, 4, 'Legacy monthly AI selections do not change assignment readiness.');
assert.equal(getAdminReadiness(state).assignmentTargetCount, 4);
const empty = createInitialState('2026-10');
assert.equal(getAdminReadiness(empty, empty.months[0]).canStart, false);
assert.equal(getAdminReadiness({ ...state, months: [] }).assignmentReadyCount, 4);
console.log('Shared personnel/monthly readiness: historical groups, roles, missing/duplicate/inactive assignments, distinct monthly AI selections and independent global configuration passed.');
