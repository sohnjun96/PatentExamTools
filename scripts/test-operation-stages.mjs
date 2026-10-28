import assert from 'node:assert/strict';
import { applyAction, createDemoState, createInitialState, emptyMonth, isOperationStageOpen, operationStageStatus, OPERATION_STAGES } from '../app/lib/evaluation.ts';
import { saveFailureGuidance } from '../app/lib/workspace-location.ts';

const admin = { admin: true }, monthId = '2026-11';
const afterDeadline = new Date('2027-01-01T00:00:00Z');
let base = applyAction(createDemoState('2026-10'), admin, { type: 'saveMonth', month: { ...emptyMonth(monthId), selectionDeadline: '2026-11-01', resultDeadline: '2026-11-02', evaluationDeadline: '2026-11-03' } });
const newDefaults = { selection: 'running', result: 'stopped', evaluation: 'stopped' };
assert.deepEqual(emptyMonth('2030-01').stages, newDefaults);
assert.deepEqual(createInitialState('2030-01').months[0].stages, newDefaults);
const { stages: _newDefault, ...oldClientNewMonth } = emptyMonth('2030-01');
const oldClientCreated = applyAction(base, admin, { type: 'saveMonth', month: oldClientNewMonth });
assert.deepEqual(oldClientCreated.months.find(month => month.id === '2030-01').stages, newDefaults, 'The backend supplies defaults even when an older client omits them.');
const partialCreated = applyAction(base, admin, { type: 'saveMonth', month: { ...emptyMonth('2030-02'), stages: { selection: 'running' } } });
assert.deepEqual(partialCreated.months.find(month => month.id === '2030-02').stages, newDefaults);
base = applyAction(base, { userId: 'demo-user-1' }, { type: 'saveSelection', monthId, rows: [{ applicationNumber: '10-2020-0000001', cpc: '' }], confirm: true }, afterDeadline);
const item = base.cases.find(entry => entry.monthId === monthId);
const result = { type: 'saveResult', caseId: item.id, methodId: 'chatgpt', documents: ['KR2020000000A'], publish: true };
assert.throws(() => applyAction(base, { userId: 'demo-user-1' }, result), /단계가 중지/);
assert.throws(() => applyAction(base, { userId: 'demo-user-1' }, { type: 'saveEvaluation', caseId: item.id, evaluations: [], rankings: {}, versions: {} }), /단계가 중지/);
base = applyAction(base, admin, { type: 'setMonthStage', monthId, stage: 'result', status: 'running' });
base = applyAction(base, { userId: 'demo-user-1' }, result, afterDeadline);
assert.equal(operationStageStatus(base.months.find(month => month.id === monthId), 'evaluation'), 'stopped', 'Starting AI result entry never starts evaluation automatically.');
base = applyAction(base, admin, { type: 'setMonthStage', monthId, stage: 'evaluation', status: 'running' });
const actions = {
  selection: { actor: { userId: 'demo-user-2' }, action: { type: 'saveSelection', monthId, rows: [{ applicationNumber: '10-2020-0000002', cpc: '' }], confirm: false } },
  result: { actor: { userId: 'demo-user-1' }, action: result },
  evaluation: { actor: { userId: 'demo-user-1' }, action: { type: 'saveEvaluation', caseId: item.id, evaluations: [{ methodId: 'chatgpt', version: 1, documents: [{ number: result.documents[0], score: 3, cited: 'O', note: '' }] }], rankings: {}, versions: {}, overallComment: '단계별 평가' } },
};
const monthOf = state => state.months.find(entry => entry.id === monthId);
const legacyState = structuredClone(base); delete monthOf(legacyState).stages;
for (const stage of OPERATION_STAGES) assert.equal(operationStageStatus(monthOf(legacyState), stage.id), 'running');
const legacyEdited = applyAction(legacyState, admin, { type: 'saveMonth', month: { ...monthOf(legacyState), resultDeadline: '2026-12-01' } });
assert.equal(monthOf(legacyEdited).stages, undefined, 'Existing legacy months are not stopped when ordinary settings are edited.');
for (const stage of OPERATION_STAGES) {
  assert.equal(operationStageStatus(monthOf(base), stage.id), 'running');
  assert.equal(isOperationStageOpen(monthOf(base), stage.id), true);
  for (const status of ['pending', 'stopped', 'closed']) {
    const original = structuredClone(base);
    const controlled = applyAction(base, admin, { type: 'setMonthStage', monthId, stage: stage.id, status });
    assert.deepEqual(base, original, 'A stage action must not mutate the input snapshot.');
    assert.equal(operationStageStatus(monthOf(controlled), stage.id), status);
    assert.equal(isOperationStageOpen(monthOf(controlled), stage.id), false);
    for (const key of ['cases', 'results', 'evaluations', 'rankings', 'personnel']) assert.deepEqual(controlled[key], base[key]);
    assert.deepEqual(controlled.months.find(month => month.id === '2026-10'), base.months[0]);
    const { actor, action } = actions[stage.id];
    assert.throws(() => applyAction(controlled, actor, action, afterDeadline), error => error.status === 409 && error.message.includes(stage.label));
    if (stage.id === 'selection' || stage.id === 'result') {
      const variants = stage.id === 'selection' ? [false, true].map(confirm => ({ ...action, confirm })) : [false, true].map(publish => ({ ...action, publish }));
      for (const variant of variants) assert.throws(() => applyAction(controlled, actor, variant), error => error.status === 409);
    }
    for (const other of OPERATION_STAGES.filter(entry => entry.id !== stage.id)) {
      assert.equal(isOperationStageOpen(monthOf(controlled), other.id), true);
      const allowed = actions[other.id];
      applyAction(controlled, allowed.actor, allowed.action, afterDeadline);
    }
    const reopened = applyAction(controlled, admin, { type: 'setMonthStage', monthId, stage: stage.id, status: 'running' });
    assert.equal(isOperationStageOpen(monthOf(reopened), stage.id), true);
    applyAction(reopened, actor, action, afterDeadline);
    // Date/settings edits from an old or malicious client cannot reset stage controls.
    const edited = applyAction(controlled, admin, { type: 'saveMonth', month: { ...monthOf(controlled), resultDeadline: '2026-12-15', stages: { selection: 'running', result: 'running', evaluation: 'running' } } });
    assert.deepEqual(monthOf(edited).stages, monthOf(controlled).stages);
    const { stages: _ignored, ...oldClientMonth } = monthOf(controlled);
    assert.deepEqual(monthOf(applyAction(controlled, admin, { type: 'saveMonth', month: oldClientMonth })).stages, monthOf(controlled).stages);
    const closedMonth = applyAction(controlled, admin, { type: 'setMonthClosed', monthId, closed: true });
    for (const entry of Object.values(actions)) assert.throws(() => applyAction(closedMonth, entry.actor, entry.action), /마감한 운영월/);
    const selectivelyReopened = applyAction(closedMonth, admin, { type: 'setMonthStage', monthId, stage: stage.id, status: 'running' });
    assert.equal(monthOf(selectivelyReopened).closed, false);
    for (const entry of OPERATION_STAGES) assert.equal(operationStageStatus(monthOf(selectivelyReopened), entry.id), entry.id === stage.id ? 'running' : 'closed');
    const reopenedMonth = applyAction(closedMonth, admin, { type: 'setMonthClosed', monthId, closed: false });
    assert.equal(operationStageStatus(monthOf(reopenedMonth), stage.id), status, 'Reopening a month must retain independently stopped/closed stages.');
    assert.equal(saveFailureGuidance(409, `${stage.label} 단계가 마감되었습니다. 관리자에게 단계 시작을 요청해 주세요.`).conflict, false);
    assert(!saveFailureGuidance(409, `${stage.label} 단계가 중지되었습니다.`).message.includes('운영월은 마감'));
  }
}
for (const actor of [{}, { userId: 'demo-user-1' }, { userId: 'demo-user-2' }]) assert.throws(() => applyAction(base, actor, { type: 'setMonthStage', monthId, stage: 'result', status: 'stopped' }), error => error.status === 403);
for (const invalid of [{ stage: '__proto__', status: 'running' }, { stage: 'toString', status: 'closed' }, { stage: 'result', status: 'invalid' }, { stage: null, status: 'running' }, { stage: 'result', status: null }]) assert.throws(() => applyAction(base, admin, { type: 'setMonthStage', monthId, ...invalid }), error => error.status === 400);
assert.throws(() => applyAction(base, admin, { type: 'setMonthStage', monthId: '2030-01', stage: 'result', status: 'running' }), /운영월/);
assert.throws(() => applyAction(base, admin, { type: 'saveMonth', month: { ...emptyMonth('2030-01'), stages: { result: 'invalid' } } }), /단계 운영 상태/);
const administrativeCorrection = applyAction(base, admin, { type: 'setMonthStage', monthId, stage: 'selection', status: 'closed' });
const corrected = applyAction(administrativeCorrection, admin, { type: 'adminAddCase', monthId, examinerId: 'demo-user-2', row: { applicationNumber: '10-2020-0000003', cpc: '' } });
assert(corrected.cases.some(entry => entry.applicationNumber === '10-2020-0000003'), 'Existing administrator corrections remain available after a selection stage closes.');
console.log('Operation stages passed: independent start/stop/close, late submissions while running, readonly stopped stages, restart, preserved data/settings, legacy compatibility, month precedence, validation and administrator-only control.');
