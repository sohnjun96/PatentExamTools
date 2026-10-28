import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { applyAction, createDemoState, emptyMonth } from '../app/lib/evaluation.ts';
import { buildSeedPlan, verifySeed } from './seed-planning-bureau.mjs';

const fixture = JSON.parse(await readFile(new URL('./data/planning-bureau-samples.json', import.meta.url), 'utf8'));
const before = createDemoState('2026-10');
before.users.forEach(user => { user.bureau = '기획국'; });
before.cases.forEach(item => { item.bureau = '기획국'; });
before.notice = { markdown: '## 기존 공지 보존', updatedAt: '2026-10-28T00:00:00Z' };
before.months[0].stages = { selection: 'closed', result: 'stopped', evaluation: 'stopped' };
before.months.push(emptyMonth('2026-11'));
before.cases.push({ ...before.cases[0], id: 'existing-real-case', applicationNumber: '10-2023-0012931', monthId: '2026-11' });
before.cases.push({ ...before.cases[0], id: 'custom-case', applicationNumber: '10-2024-0123456' });
const original = structuredClone(before);
const plan = buildSeedPlan(before, fixture);
assert.deepEqual(before, original, 'Preview must not mutate the input state.');
assert.equal(plan.actions.filter(action => action.type === 'saveUser').length, 10);
assert.equal(plan.actions.filter(action => action.type === 'saveGroup').length, 2);
assert.equal(plan.actions.filter(action => action.type === 'adminAddCase').length, 20);
assert.equal(plan.actions.filter(action => action.type === 'cancelCase').length, 20);
assert.ok(plan.actions.findIndex(action => action.type === 'cancelCase') > plan.actions.findLastIndex(action => action.type === 'adminAddCase'));

const after = plan.actions.reduce((state, action) => applyAction(state, { admin: true }, action), before);
verifySeed(before, after, fixture);
assert.equal(buildSeedPlan(after, fixture).actions.length, 0, 'Repeated execution must not duplicate or overwrite records.');
assert.equal(after.cases.filter(item => item.status === 'cancelled').length, 20);
assert.equal(after.cases.filter(item => item.status === 'confirmed').length, 22);

// Interrupted runs resume without duplicating already-added applications.
const halfway = plan.actions.slice(0, 18).reduce((state, action) => applyAction(state, { admin: true }, action), before);
const resumed = buildSeedPlan(halfway, fixture).actions.reduce((state, action) => applyAction(state, { admin: true }, action), halfway);
verifySeed(before, resumed, fixture);
assert.equal(buildSeedPlan(resumed, fixture).actions.length, 0);
const changedExistingCase = structuredClone(after);
changedExistingCase.cases.find(item => item.applicationNumber === fixture.patents[0].applicationNumber).cpc = 'G06N 20/00';
assert.throws(() => buildSeedPlan(changedExistingCase, fixture), 'Existing metadata conflicts must be found before writing.');

assert.throws(() => buildSeedPlan({ ...before, isDemo: false }, fixture));
const closed = structuredClone(before);
closed.months[0].closed = true;
assert.throws(() => buildSeedPlan(closed, fixture));
const changedUser = structuredClone(before);
changedUser.users[0].name = '실제 운영 사용자';
assert.throws(() => buildSeedPlan(changedUser, fixture));
const changedDivision = structuredClone(before);
changedDivision.users[0].division = '사용자 지정 과';
assert.throws(() => buildSeedPlan(changedDivision, fixture));
const changedGroup = structuredClone(before);
changedGroup.groups[0].name = '사용자 지정 그룹';
assert.throws(() => buildSeedPlan(changedGroup, fixture));
const duplicated = structuredClone(fixture);
duplicated.patents[1].applicationNumber = duplicated.patents[0].applicationNumber;
assert.throws(() => buildSeedPlan(before, duplicated));
const badSource = structuredClone(fixture);
badSource.patents[0].sourceUrl = 'https://example.com/fake';
assert.throws(() => buildSeedPlan(before, badSource));
console.log('Planning bureau seed: preservation, real-number fixture, idempotence, resumption, and scope guards passed.');
