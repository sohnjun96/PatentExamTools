import assert from 'node:assert/strict';
import { applyAction, createInitialState, defaultOperationDeadlines, emptyMonth, isOperationStageOpen, operationMonthStatus, OPERATION_STAGES, preferredOperationMonth, withDefaultOperationMonths } from '../app/lib/evaluation.ts';

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
const cleared = applyAction(upgraded, { admin: true }, { type: 'saveMonth', month: { ...upgraded.months[0], resultDeadline: '' } });
assert.equal(withDefaultOperationMonths(cleared).months[0].resultDeadline, '', 'An explicitly cleared deadline must stay cleared.');
for (const stage of OPERATION_STAGES) {
  const pending = applyAction(createInitialState(), { admin: true }, { type: 'setMonthStage', monthId: '2026-10', stage: stage.id, status: 'pending' });
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
console.log('Monthly operation table: four default months, first/second/third Fridays across years, additive deadline migration, explicit clearing and pending/running gates passed.');
