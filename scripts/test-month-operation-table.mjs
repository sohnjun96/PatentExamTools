import assert from 'node:assert/strict';
import { applyAction, createInitialState, defaultOperationDeadlines, emptyMonth, isOperationStageOpen, operationMonthStatus, OPERATION_STAGES, listedOperationMonths, createDemoState, preferredOperationMonth, withDefaultOperationMonths } from '../app/lib/evaluation.ts';

for (const [month, expected] of [
  ['2026-10', ['2026-10-02', '2026-10-09', '2026-10-16']],
  ['2026-11', ['2026-11-06', '2026-11-13', '2026-11-20']],
  ['2026-12', ['2026-12-04', '2026-12-11', '2026-12-18']],
  ['2027-01', ['2027-01-01', '2027-01-08', '2027-01-15']],
]) assert.deepEqual(Object.values(defaultOperationDeadlines(month)), expected);
for (let year = 2024; year <= 2030; year++) for (let month = 1; month <= 12; month++) {
  const id = `${year}-${String(month).padStart(2, '0')}`;
  const dates = Object.values(defaultOperationDeadlines(id));
  dates.forEach((date, index) => {
    const value = new Date(date + 'T00:00:00Z');
    assert.equal(value.getUTCDay(), 5);
    assert(value.getUTCDate() >= 1 + index * 7 && value.getUTCDate() <= 7 + index * 7);
    assert.equal(date.slice(0, 7), id);
  });
}
const legacy = createInitialState('2026-10');
delete legacy.months[0].defaultDeadlineVersion;
Object.assign(legacy.months[0], { selectionDeadline: '2026-10-20', resultDeadline: '', evaluationDeadline: '', closed: true, stages: { selection: 'stopped' } });
const before = structuredClone(legacy);
const upgraded = withDefaultOperationMonths(legacy);
assert.deepEqual(legacy, before);
assert.deepEqual(upgraded.months.map(month => month.id), ['2026-10', '2026-11', '2026-12', '2027-01']);
assert.equal(upgraded.months[0].selectionDeadline, '2026-10-20');
assert.equal(upgraded.months[0].resultDeadline, '2026-10-09');
assert.equal(upgraded.months[0].evaluationDeadline, '2026-10-16');
assert.equal(upgraded.months[0].closed, true);
assert.deepEqual(upgraded.months[0].stages, legacy.months[0].stages);
assert.equal(withDefaultOperationMonths(upgraded), upgraded);
const cleared = applyAction(upgraded, { admin: true }, { type: 'saveMonth', month: { ...upgraded.months.find(month => month.id === '2026-11'), resultDeadline: '' } });
assert.equal(withDefaultOperationMonths(cleared).months.find(month => month.id === '2026-11').resultDeadline, '', 'An explicitly cleared deadline must stay cleared.');
for (const stage of OPERATION_STAGES) {
  const pending = applyAction(createInitialState('2026-10'), { admin: true }, { type: 'setMonthStage', monthId: '2026-10', stage: stage.id, status: 'pending' });
  assert.equal(isOperationStageOpen(pending.months[0], stage.id), false);
  const running = applyAction(pending, { admin: true }, { type: 'setMonthStage', monthId: '2026-10', stage: stage.id, status: 'running' });
  assert.equal(isOperationStageOpen(running.months[0], stage.id), true);
}
assert.deepEqual(Object.values(defaultOperationDeadlines('invalid')), ['', '', '']);
assert.doesNotThrow(() => applyAction(createInitialState(), { admin: true }, { type: 'saveMonth', month: { ...emptyMonth('2027-02'), stages: { selection: 'pending', result: 'pending', evaluation: 'pending' } } }));
const beforeStart = { ...emptyMonth('2026-10'), stages: { selection: 'pending', result: 'pending', evaluation: 'pending' } };
const finished = { ...beforeStart, stages: { selection: 'closed', result: 'closed', evaluation: 'closed' } };
assert.equal(operationMonthStatus(beforeStart), 'pending');
assert.equal(operationMonthStatus(finished), 'closed');
assert.equal(operationMonthStatus({ ...beforeStart, stages: { selection: 'stopped', result: 'closed', evaluation: 'pending' } }), 'pending');
for (const stage of OPERATION_STAGES) assert.equal(operationMonthStatus({ ...finished, stages: { ...finished.stages, [stage.id]: 'running' } }), 'running', 'Any single running phase makes the month operational.');
assert.equal(operationMonthStatus({ ...emptyMonth('2026-10'), closed: true }), 'closed', 'A legacy whole-month closure overrides stored phase states.');
assert.equal(operationMonthStatus({ ...emptyMonth('2026-10'), stages: undefined }), 'running');
const activeNovember = { ...emptyMonth('2026-11'), stages: { selection: 'closed', result: 'running', evaluation: 'pending' } };
assert.equal(preferredOperationMonth([finished, activeNovember], '2026-10'), '2026-11');
assert.equal(preferredOperationMonth([beforeStart, activeNovember], '2026-10'), '2026-11', 'Prefer a truly running month over a month waiting to start.');
const fresh = createInitialState();
assert.deepEqual(fresh.months.map(month => month.id), ['2026-11', '2026-12', '2027-01']);
assert(fresh.months.every(month => OPERATION_STAGES.every(stage => operationMonthStatus(month) === 'pending' && !isOperationStageOpen(month, stage.id))));
const historical = createDemoState('2026-10');
const archived = withDefaultOperationMonths(historical);
assert.equal(historical.months[0].archived, undefined, 'Migration must not mutate the existing snapshot.');
assert.equal(archived.months[0].archived, true);
assert.equal(archived.months[0].closed, true);
assert.deepEqual(listedOperationMonths(archived.months).map(month => month.id), ['2026-11', '2026-12', '2027-01']);
for (const key of ['cases', 'results', 'evaluations', 'rankings', 'personnel']) assert.deepEqual(archived[key], historical[key], 'Removing October from operation must preserve existing work and allocations.');
for (const stage of OPERATION_STAGES) {
  assert.equal(isOperationStageOpen(archived.months[0], stage.id), false);
  assert.throws(() => applyAction(archived, { admin: true }, { type: 'setMonthStage', monthId: '2026-10', stage: stage.id, status: 'running' }), /운영 목록에서 제외/);
}
assert.throws(() => applyAction(archived, { admin: true }, { type: 'setMonthClosed', monthId: '2026-10', closed: false }), /운영 목록에서 제외/);
assert.equal(preferredOperationMonth(archived.months, '2026-10'), '2026-11', 'A remembered October session must move to a listed month.');
const missingStages = createInitialState('2026-11');
delete missingStages.months[0].defaultStageVersion;
delete missingStages.months[0].stages;
assert.equal(operationMonthStatus(withDefaultOperationMonths(missingStages).months[0]), 'pending');
for (const selection of ['pending', 'running']) {
  const legacyDefaults = createInitialState('2026-11');
  delete legacyDefaults.months[0].defaultStageVersion;
  legacyDefaults.months[0].stages = { selection, result: 'stopped', evaluation: 'stopped' };
  const migrated = withDefaultOperationMonths(legacyDefaults);
  assert.deepEqual(migrated.months[0].stages, { selection: 'pending', result: 'pending', evaluation: 'pending' });
  const manuallyStopped = applyAction(migrated, { admin: true }, { type: 'setMonthStage', monthId: '2026-11', stage: 'result', status: 'stopped' });
  assert.equal(withDefaultOperationMonths(manuallyStopped).months[0].stages.result, 'stopped', 'Migration must not reset later manual changes.');
  legacyDefaults.months[0].stages.result = 'running';
  assert.deepEqual(withDefaultOperationMonths(legacyDefaults).months[0].stages, legacyDefaults.months[0].stages, 'Preserve explicitly started workflows.');
}
console.log('Monthly operations: three pending default months, archived October with preserved work, one-time default migration, Friday deadlines and independent stage gates passed.');
