import assert from 'node:assert/strict';
import {
  applyAction, canInputResult, caseMethods, caseStatus, createDemoState, getStatistics,
  normalizeEvaluationState, personnelOf, rankingIsCurrent, resultComparisonKey,
  resultFor, resultOwnerId, validEvaluation, visibleState,
} from '../app/lib/evaluation.ts';

const admin = { admin: true };
const first = 'demo-user-2';
const second = 'demo-user-3';
function fixture() {
  let state = createDemoState('2026-11');
  state.cases = state.cases.slice(0, 1);
  const caseId = state.cases[0].id;
  state.results = state.results.filter(result => result.caseId === caseId);
  state.evaluations = state.evaluations.filter(entry => entry.caseId === caseId);
  state.rankings = state.rankings.filter(entry => entry.caseId === caseId);
  const user = state.users.find(user => user.id === second);
  state = applyAction(state, admin, { type: 'saveExaminer', user: { ...user, roles: ['examiner', 'ai'] }, groupId: state.cases[0].groupId, responsibilities: [{ groupId: state.cases[0].groupId, methodId: 'claude' }] });
  return state;
}
const save = (state, userId, documents, publish = false) => applyAction(state, { userId }, { type: 'saveResult', caseId: state.cases[0].id, methodId: 'claude', documents, publish });
const draft = (state, userId, label) => applyAction(state, { userId }, { type: 'saveResultDraft', caseId: state.cases[0].id, methodId: 'claude', editorState: { documents: [{ kind: 'patent', number: label, reportMarkdown: `비공개 보고서 ${label}` }], bulkInput: `미적용 원문 ${label}` } });
function evaluationAction(state) {
  const item = state.cases[0];
  const methods = caseMethods(state, item);
  const ais = methods.filter(method => method.kind === 'ai');
  const claudes = ais.filter(method => method.baseMethodId === 'claude');
  const rankings = Object.fromEntries(methods.map(method => [method.id, 'excluded']));
  rankings[claudes[0].id] = 1; rankings[claudes[1].id] = 2; rankings.baseline = 3;
  return {
    type: 'saveEvaluation', caseId: item.id, finalize: true, rankings,
    versions: Object.fromEntries(ais.map(method => [method.id, resultFor(state, item.id, method.id).publishedVersion])),
    evaluations: ais.map(method => {
      const result = resultFor(state, item.id, method.id);
      const score = resultOwnerId(state, result) === second ? 1 : 5;
      return { methodId: method.id, version: result.publishedVersion, documents: result.publishedDocuments.map(number => ({ number, score, cited: score === 1 ? 'X' : 'O', note: `${resultOwnerId(state, result)}의 별도 평가` })) };
    }),
  };
}

let state = fixture();
const item = state.cases[0];
const examiner = { userId: item.examinerId };
const existing = resultFor(state, item.id, 'claude');
assert.deepEqual(personnelOf(state).assignments.filter(entry => entry.groupId === item.groupId && entry.methodId === 'claude').map(entry => entry.userId).sort(), [first, second]);
assert.equal(resultFor(state, item.id, 'claude', first).id, existing.id);
assert.equal(resultFor(state, item.id, 'claude', second), undefined, 'A new assignee must not inherit a colleague\'s delivery.');
assert.equal(resultComparisonKey(existing), 'claude', 'Existing evaluations retain their original comparison key.');
assert.equal(caseStatus(state, item).inputComplete, false, 'Both assigned people must deliver independently.');
assert.equal(caseStatus(state, item).complete, true, 'An assignment alone does not invalidate completed published evaluations.');
for (const userId of [first, second]) assert(canInputResult(state, { userId }, item, 'claude'));
const duplicate = personnelOf(state).assignments.find(entry => entry.userId === second);
assert.throws(() => applyAction(state, admin, { type: 'savePersonnel', personnel: { ...personnelOf(state), assignments: [...personnelOf(state).assignments, duplicate] } }), /중복/);

state = draft(state, second, 'SECOND-INCOMPLETE');
const secondDraft = resultFor(state, item.id, 'claude', second);
const secondKey = resultComparisonKey(secondDraft);
assert.notEqual(secondKey, 'claude');
assert.equal(secondDraft.methodId, 'claude', 'AI catalog identity remains independent of the comparison slot.');
assert.equal(secondDraft.ownerId, second);
assert.equal(resultFor(state, item.id, secondKey).id, secondDraft.id);
assert.deepEqual(resultFor(state, item.id, 'claude', first).publishedDocuments, existing.publishedDocuments);
assert.equal(caseMethods(state, item).filter(method => method.baseMethodId === 'claude').length, 1, 'An unfinished colleague result stays outside the evaluation scope.');
const firstView = visibleState(state, { userId: first });
assert(!firstView.results.some(result => resultOwnerId(firstView, result) === second), 'A colleague must not receive unpublished result metadata or text.');
const secondView = visibleState(state, { userId: second });
assert.equal(resultFor(secondView, item.id, 'claude', second).draftEditorState.bulkInput, '미적용 원문 SECOND-INCOMPLETE');
assert(!secondView.results.some(result => resultOwnerId(secondView, result) === first), 'AI input does not expose another person\'s result as its own.');
const examinerView = visibleState(state, examiner);
assert(!examinerView.results.some(result => resultComparisonKey(result) === secondKey));
assert.equal(resultFor(examinerView, item.id, 'claude').draftEditorState, undefined);
assert.deepEqual(resultFor(examinerView, item.id, 'claude').draftDocuments, []);

state = save(state, first, ['KR20100001234A'], true);
const firstAfterPublish = structuredClone(resultFor(state, item.id, 'claude', first));
assert.equal(resultFor(state, item.id, 'claude', second).draftEditorState.bulkInput, '미적용 원문 SECOND-INCOMPLETE');
state = save(state, second, ['KR20100001234A'], true);
assert.deepEqual(resultFor(state, item.id, 'claude', first), firstAfterPublish, 'A second delivery must not overwrite the first result, author or version.');
assert.equal(resultFor(state, item.id, 'claude', second).id, secondDraft.id);
const claudeMethods = caseMethods(state, item).filter(method => method.baseMethodId === 'claude');
assert.equal(claudeMethods.length, 2);
assert.equal(new Set(claudeMethods.map(method => method.id)).size, 2);
assert(claudeMethods.every(method => method.name.startsWith('클로드 · ')));
assert.equal(caseStatus(state, item).inputComplete, true);
assert.equal(caseStatus(state, item).stale, true, 'A newly published colleague submission requires comparison review.');
assert.throws(() => applyAction(state, examiner, { type: 'saveEvaluation', caseId: item.id, evaluations: [], rankings: { chatgpt: 1, claude: 2, baseline: 3 }, versions: { chatgpt: 1, claude: 2 } }), error => error.status === 409);
state = applyAction(state, examiner, evaluationAction(state));
assert.equal(caseStatus(state, item).complete, true);
assert.equal(validEvaluation(state, item.id, 'claude').documents[0].score, 5);
assert.equal(validEvaluation(state, item.id, secondKey).documents[0].score, 1, 'The same patent in two submissions must retain independent scores.');
assert.notEqual(validEvaluation(state, item.id, 'claude').documents[0].note, validEvaluation(state, item.id, secondKey).documents[0].note);
let stats = getStatistics(state, item.monthId);
let claudeStats = stats.methods.find(method => method.id === 'claude');
assert.equal(claudeStats.target, 2); assert.equal(claudeStats.completed, 2); assert.equal(claudeStats.pending, 0);
assert.equal(claudeStats.documents, 2); assert.equal(claudeStats.averageScore, 3); assert.equal(claudeStats.firstPlace, 1);
assert.equal(stats.rows.filter(row => row.baseMethodId === 'claude').length, 2);
assert.equal(new Set(stats.rows.filter(row => row.baseMethodId === 'claude').map(row => row.methodId)).size, 2);
for (const userId of [first, second]) {
  assert.equal(stats.accounts.find(account => account.id === userId).aiTarget, 1);
  assert.equal(stats.accounts.find(account => account.id === userId).aiCompleted, 1);
}

const firstEvaluation = structuredClone(validEvaluation(state, item.id, 'claude'));
state = applyAction(state, { userId: second }, { type: 'saveResult', caseId: item.id, methodId: 'claude', ownerId: first, documents: ['KR20100001234A', 'KR20100001235A'], publish: true });
assert.deepEqual(resultFor(state, item.id, 'claude', first), firstAfterPublish, 'An actor-supplied owner field cannot redirect a write to someone else.');
assert.deepEqual(validEvaluation(state, item.id, 'claude'), firstEvaluation);
assert.equal(validEvaluation(state, item.id, secondKey), undefined);
assert.equal(caseStatus(state, item).stale, true);
state = applyAction(state, examiner, evaluationAction(state));
const publishedBeforeRemoval = structuredClone(state.results);
const removedUser = state.users.find(user => user.id === second);
state = applyAction(state, admin, { type: 'saveExaminer', user: removedUser, groupId: item.groupId, responsibilities: [] });
assert.equal(canInputResult(state, { userId: second }, item, 'claude'), false);
assert.throws(() => save(state, second, ['not allowed'], false), error => error.status === 403);
assert.deepEqual(state.results, publishedBeforeRemoval);
assert.equal(caseMethods(state, item).filter(method => method.baseMethodId === 'claude').length, 2, 'Unassignment retains historical deliveries and evaluations.');
assert.equal(caseStatus(state, item).complete, true);
assert.equal(visibleState(state, { userId: second }).results.length, 0);
const priorRanking = structuredClone(state.rankings[0]);
state = applyAction(state, admin, { type: 'deleteMethod', methodId: 'claude' });
assert.deepEqual(state.results, publishedBeforeRemoval);
assert.deepEqual(state.rankings[0], priorRanking);
assert.equal(caseStatus(state, item).complete, true);
stats = getStatistics(state, item.monthId);
claudeStats = stats.methods.find(method => method.id === 'claude');
assert.equal(claudeStats.target, 2); assert.equal(claudeStats.completed, 2); assert.equal(claudeStats.documents, 3);
assert.equal(canInputResult(state, { userId: first }, item, 'claude'), true, 'The remaining assignee may maintain deleted-catalog historical work.');

// A legacy transfer could leave an old delivery alongside a different author's unfinished edit.
const mixed = fixture();
const mixedItem = mixed.cases[0];
const sharedLegacy = resultFor(mixed, mixedItem.id, 'claude');
const legacyId = sharedLegacy.id;
const legacyPublished = structuredClone(sharedLegacy.publishedDocuments);
sharedLegacy.draftAuthorId = second; sharedLegacy.draftDocuments = ['PRIVATE-LEGACY-DRAFT'];
sharedLegacy.draftEditorState = { documents: [{ kind: 'patent', number: 'PARTIAL-OLD-INPUT', reportMarkdown: '이전 담당자 비공개' }], bulkInput: '이전 미적용 JSON' };
const mixedBefore = JSON.stringify(mixed);
const normalized = normalizeEvaluationState(mixed);
assert.equal(JSON.stringify(mixed), mixedBefore, 'Reading the migration must not mutate the stored input.');
assert.equal(normalizeEvaluationState(normalized), normalized, 'Ownership migration is idempotent.');
const oldDelivery = resultFor(normalized, mixedItem.id, 'claude', first);
const recoveredDraft = resultFor(normalized, mixedItem.id, 'claude', second);
assert.equal(oldDelivery.id, legacyId); assert.equal(resultComparisonKey(oldDelivery), 'claude');
assert.deepEqual(oldDelivery.publishedDocuments, legacyPublished);
assert.deepEqual(oldDelivery.draftDocuments, legacyPublished, 'The previous author must not inherit another person\'s draft.');
assert.equal(oldDelivery.draftEditorState, undefined);
assert.equal(recoveredDraft.publishedVersion, 0);
assert.deepEqual(recoveredDraft.draftDocuments, ['PRIVATE-LEGACY-DRAFT']);
assert.equal(recoveredDraft.draftEditorState.bulkInput, '이전 미적용 JSON');
assert.equal(validEvaluation(normalized, mixedItem.id, 'claude').version, oldDelivery.publishedVersion);
assert(rankingIsCurrent(normalized, mixedItem, normalized.rankings[0]));
assert.equal(resultFor(mixed, mixedItem.id, 'claude', second).draftEditorState.bulkInput, '이전 미적용 JSON', 'Direct legacy lookup also isolates the transferred draft.');
assert.equal(resultFor(visibleState(normalized, { userId: first }), mixedItem.id, 'claude', second), undefined);
assert.equal(resultFor(visibleState(normalized, { userId: second }), mixedItem.id, 'claude', second).draftEditorState.bulkInput, '이전 미적용 JSON');
const roundTrip = normalizeEvaluationState(JSON.parse(JSON.stringify(normalized)));
assert.equal(resultFor(roundTrip, mixedItem.id, 'claude', second).comparisonKey, recoveredDraft.comparisonKey);
assert.equal(resultFor(roundTrip, mixedItem.id, 'claude', first).id, legacyId);

// New single-assignee work keeps bare IDs, while punctuation in new owner IDs cannot collide.
let single = createDemoState('2026-11');
const singleItem = single.cases[0];
single.results = single.results.filter(result => !(result.caseId === singleItem.id && result.methodId === 'claude'));
single = save(single, first, ['SINGLE'], true);
assert.equal(resultComparisonKey(resultFor(single, singleItem.id, 'claude', first)), 'claude');
let punctuation = fixture();
punctuation.users.push({ ...punctuation.users.find(user => user.id === second), id: 'other:author/%한글', name: '특수 ID 담당자' });
punctuation = applyAction(punctuation, admin, { type: 'savePersonnel', personnel: { ...personnelOf(punctuation), assignments: [...personnelOf(punctuation).assignments, { groupId: punctuation.cases[0].groupId, methodId: 'claude', userId: 'other:author/%한글' }] } });
punctuation = save(punctuation, second, ['SECOND'], true);
punctuation = save(punctuation, 'other:author/%한글', ['THIRD'], true);
assert.equal(new Set(punctuation.results.map(resultComparisonKey)).size, punctuation.results.length);
assert.deepEqual(resultFor(punctuation, punctuation.cases[0].id, 'claude', 'other:author/%한글').publishedDocuments, ['THIRD']);

let reverse = fixture();
reverse.results = reverse.results.filter(result => result.methodId !== 'claude');
reverse = save(reverse, second, ['SECOND-FIRST'], true);
reverse = save(reverse, first, ['FIRST-LATER'], true);
assert.equal(resultComparisonKey(resultFor(reverse, reverse.cases[0].id, 'claude', second)), 'claude');
assert.notEqual(resultComparisonKey(resultFor(reverse, reverse.cases[0].id, 'claude', first)), 'claude');
assert.deepEqual(resultFor(reverse, reverse.cases[0].id, 'claude', second).publishedDocuments, ['SECOND-FIRST'], 'Submission order does not transfer result ownership.');

const legacyAllocations = fixture();
const allocationMonth = legacyAllocations.months[0];
allocationMonth.assignments = [{ groupId: legacyAllocations.cases[0].groupId, methodId: 'claude', userId: first }, { groupId: legacyAllocations.cases[0].groupId, methodId: 'claude', userId: second }];
delete legacyAllocations.personnel;
assert.deepEqual(personnelOf(legacyAllocations).assignments.map(entry => entry.userId).sort(), [first, second], 'Legacy month allocation migration must not collapse multiple people in the same AI slot.');
legacyAllocations.months.push({ ...allocationMonth, id: '2026-12', assignments: [{ groupId: legacyAllocations.cases[0].groupId, methodId: 'claude', userId: second }] });
assert.deepEqual(personnelOf(legacyAllocations).assignments.map(entry => entry.userId), [second], 'A newer legacy allocation replaces that group/AI set without reviving previous people.');

console.log('Multiple assignees passed: additive assignments, isolated drafts/deliveries, stable legacy and scoped comparison keys, independent same-document evaluations/rankings, privacy, author-safe writes, reassignment/deletion preservation, statistics and mixed-author legacy recovery.');
