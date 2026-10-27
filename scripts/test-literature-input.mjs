import assert from 'node:assert/strict';
import {
  applyAction, createDemoState, getStatistics, LITERATURE_MAX_LENGTH,
  resultFor, validEvaluation, visibleState,
} from '../app/lib/evaluation.ts';

let state = createDemoState('2026-10');
const item = state.cases[0];
const actor = { userId: 'demo-user-1' };
const paper = 'Kim, J.; Lee, S. (2026). A comparative study of retrieval methods for technical literature and patent examination: '
  + 'retrieval quality, reproducibility, multilingual references, evaluation practices, and contextual evidence. Journal of Information Retrieval, 12(3), 101–125.';
assert(paper.length > 120, 'The regression fixture must exceed the former patent-number-only limit.');
const references = [
  'KR1020200000000A',
  paper,
  '10.1000/reference.2026.12345',
  'https://example.com/papers/reference-2026?language=ko&section=results',
];
const publish = (documents, publish = true) => applyAction(state, actor, {
  type: 'saveResult', caseId: item.id, methodId: 'chatgpt', documents, publish,
});

state = publish(references.map(reference => `  ${reference}  `), false);
assert.deepEqual(resultFor(state, item.id, 'chatgpt').draftDocuments, references);
assert.notDeepEqual(resultFor(state, item.id, 'chatgpt').publishedDocuments, references, 'Draft paper references must not replace published results.');
state = publish(references);
const result = resultFor(state, item.id, 'chatgpt');
assert.deepEqual(result.publishedDocuments, references, 'Store raw references, including the Korean rights prefix, without link normalization.');
assert.deepEqual(visibleState(state, actor).results.find(entry => entry.id === result.id).publishedDocuments, references);

const evaluations = references.map((number, index) => ({ number, score: index, cited: index === 0 ? 'X' : 'O', note: `문헌 ${index + 1} 평가` }));
state = applyAction(state, actor, {
  type: 'saveEvaluation', caseId: item.id,
  evaluations: [{ methodId: 'chatgpt', version: result.publishedVersion, documents: evaluations }],
  rankings: {}, versions: {},
});
assert.deepEqual(validEvaluation(state, item.id, 'chatgpt').documents, evaluations);
const version = result.publishedVersion;
state = publish([...references].reverse());
assert.equal(resultFor(state, item.id, 'chatgpt').publishedVersion, version, 'Reordering mixed references must not invalidate their evaluations.');
assert.deepEqual(validEvaluation(state, item.id, 'chatgpt').documents, evaluations, 'Each paper and patent must retain its own score and note.');
const rows = getStatistics(state, '2026-10').rows.filter(row => row.caseId === item.id && row.methodId === 'chatgpt');
for (const reference of evaluations) {
  const row = rows.find(row => row.number === reference.number);
  assert(row, 'Statistics and exports must retain the complete original reference.');
  assert.equal(row.score, reference.score);
  assert.equal(row.note, reference.note);
}

assert.equal(resultFor(publish(['x'.repeat(LITERATURE_MAX_LENGTH)]), item.id, 'chatgpt').publishedDocuments[0].length, LITERATURE_MAX_LENGTH);
for (const value of ['x'.repeat(LITERATURE_MAX_LENGTH + 1), undefined, null, 10, {}]) {
  assert.throws(() => publish([value]), error => error.status === 400 && /문헌.*2,000자/.test(error.message));
}
assert.throws(() => publish([]), /문헌을 한 건 이상/);
assert.throws(() => publish([paper, paper]), /중복 문헌/);
assert.throws(() => publish(Array.from({ length: 8 }, (_, index) => `논문 ${index + 1}`)), /최대 7문헌/);
assert.deepEqual(resultFor(publish(['   '], false), item.id, 'chatgpt').draftDocuments, []);

console.log('Literature input passed: mixed patent/paper/DOI/URL drafts and publication, long citation preservation, evaluation association after reordering, statistics, length/type validation, duplicates and seven-document limit.');
