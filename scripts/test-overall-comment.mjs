import assert from 'node:assert/strict';
import { applyAction, caseStatus, createDemoState, OVERALL_COMMENT_MAX_LENGTH, rankingIsCurrent, visibleState } from '../app/lib/evaluation.ts';

const initial = createDemoState('2026-10');
const item = initial.cases[0];
const actor = { userId: item.examinerId };
const rankingFor = state => state.rankings.find(entry => entry.caseId === item.id);
function evaluationAction(state) {
  const ranking = rankingFor(state);
  return {
    type: 'saveEvaluation', caseId: item.id,
    evaluations: state.evaluations.filter(entry => entry.caseId === item.id).map(({ methodId, version, documents }) => ({ methodId, version, documents })),
    rankings: { ...ranking.values }, versions: { ...ranking.versions },
  };
}
const comment = '관련 문헌을 찾는 데 도움이 되었습니다.\n검색 범위와 문헌의 관련성을 함께 검토했습니다.';
const originalAction = evaluationAction(initial);
let state = applyAction(initial, actor, { ...originalAction, overallComment: `  ${comment}\n ` });
assert.equal(rankingFor(state).overallComment, comment);
assert.equal(rankingFor(initial).overallComment, undefined, 'Old records need no migration, and the input state stays unchanged.');
assert.equal(caseStatus(state, item).complete, true);
assert.equal(visibleState(state, actor).rankings.find(entry => entry.caseId === item.id).overallComment, comment);
assert.equal(visibleState(state, { admin: true }).rankings.find(entry => entry.caseId === item.id).overallComment, comment);
assert(!visibleState(state, { userId: 'demo-user-2' }).rankings.some(entry => entry.caseId === item.id), 'Another examiner or assigned AI must not see the comment.');
assert.equal(state.rankings.find(entry => entry.caseId !== item.id).overallComment, undefined, 'Comments belong to one case.');

state = applyAction(state, actor, evaluationAction(state));
assert.equal(rankingFor(state).overallComment, comment, 'A legacy client omitting the field must preserve an existing comment.');
for (const overallComment of ['', ' \n\t ']) {
  const cleared = applyAction(state, actor, { ...evaluationAction(state), overallComment });
  assert.equal(rankingFor(cleared).overallComment, '');
  assert.equal(caseStatus(cleared, item).complete, true, 'A comment is never required for evaluation completion.');
}
const legacySaved = applyAction(initial, actor, originalAction);
assert.equal(rankingFor(legacySaved).overallComment, '');
assert.equal(caseStatus(legacySaved, item).complete, true);
for (const overallComment of [null, 12, {}, [], '가'.repeat(OVERALL_COMMENT_MAX_LENGTH + 1)]) {
  assert.throws(() => applyAction(state, actor, { ...evaluationAction(state), overallComment }), error => error.status === 400 && /총평/.test(error.message));
}
assert.equal(rankingFor(applyAction(state, actor, { ...evaluationAction(state), overallComment: '가'.repeat(OVERALL_COMMENT_MAX_LENGTH) })).overallComment.length, OVERALL_COMMENT_MAX_LENGTH);
assert.throws(() => applyAction(state, { userId: 'demo-user-2' }, { ...evaluationAction(state), overallComment: '다른 심사관의 변경' }), error => error.status === 403);

const newResults = applyAction(state, actor, { type: 'saveResult', caseId: item.id, methodId: 'chatgpt', documents: ['KR20260012345A'], publish: true });
assert.equal(rankingIsCurrent(newResults, item, rankingFor(newResults)), false);
assert.equal(rankingFor(newResults).overallComment, comment, 'Republishing AI results must preserve the existing comment for review.');
assert.throws(() => applyAction(newResults, actor, { ...originalAction, overallComment: '오래된 화면의 변경' }), error => error.status === 409);
assert.equal(rankingFor(newResults).overallComment, comment);
const closed = applyAction(state, { admin: true }, { type: 'setMonthClosed', monthId: item.monthId, closed: true });
assert.throws(() => applyAction(closed, actor, { ...evaluationAction(closed), overallComment: '마감 후 변경' }), error => error.status === 409);
assert.equal(rankingFor(closed).overallComment, comment);

console.log('Overall comments passed: optional/legacy fields, multiline save, clearing, length/type limits, ownership/visibility, case isolation, stale results and closed months.');
