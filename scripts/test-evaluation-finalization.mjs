import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { Miniflare } from 'miniflare';
import * as rules from '../app/lib/evaluation.ts';
import * as bureaus from '../app/lib/bureaus.ts';

const initial = rules.createDemoState('2026-11'), item = initial.cases[0], actor = { userId: item.examinerId };
const ranking = state => state.rankings.find(entry => entry.caseId === item.id);
function action(state, finalize) {
  const saved = ranking(state);
  return { type: 'saveEvaluation', caseId: item.id,
    evaluations: state.evaluations.filter(entry => entry.caseId === item.id).map(({ methodId, version, documents }) => ({ methodId, version, documents: structuredClone(documents) })),
    rankings: { ...saved?.values }, versions: { ...saved?.versions }, overallComment: '출원 전체 피드백', ...(finalize === undefined ? {} : { finalize }) };
}
assert(rules.caseStatus(initial, item).complete, 'Legacy completed evaluations stay completed without a migration.');
let draftAction = action(initial, false);
draftAction.evaluations[0].documents[0] = { ...draftAction.evaluations[0].documents[0], score: 0, cited: 'X' };
const draft = rules.applyAction(initial, actor, draftAction);
assert.equal(ranking(draft).finalized, false);
assert.equal(rules.caseStatus(draft, item).complete, false, 'Full scores and ranks must not finalize an explicit intermediate save.');
assert.equal(rules.caseStatus(draft, item).evaluationStatus, '평가 중');
assert.equal(rules.visibleState(draft, actor).rankings.find(entry => entry.caseId === item.id).finalized, false);
assert.equal(rules.normalizeEvaluationState(JSON.parse(JSON.stringify(draft))).rankings.find(entry => entry.caseId === item.id).finalized, false);
assert.equal(ranking(rules.applyAction(draft, actor, action(draft))).finalized, false, 'Omitted fields cannot accidentally finalize a saved draft.');
assert(rules.caseStatus(rules.applyAction(initial, actor, action(initial)), item).complete, 'Legacy clients retain their existing completion behavior.');
const finished = rules.applyAction(draft, actor, action(draft, true));
assert.equal(ranking(finished).finalized, true); assert(rules.caseStatus(finished, item).complete);
assert.equal(finished.evaluations.find(entry => entry.caseId === item.id && entry.methodId === draftAction.evaluations[0].methodId).documents[0].score, 0);
assert.equal(rules.getStatistics(draft, item.monthId).summary.complete + 1, rules.getStatistics(finished, item.monthId).summary.complete);
const winningMethod = Object.keys(ranking(finished).values).find(id => ranking(finished).values[id] === 1);
assert.equal(rules.getStatistics(draft, item.monthId).methods.find(method => method.id === winningMethod).firstPlace + 1, rules.getStatistics(finished, item.monthId).methods.find(method => method.id === winningMethod).firstPlace);
assert.equal(rules.caseStatus(rules.applyAction(finished, actor, action(finished, false)), item).complete, false, 'Resaving edited work reopens the evaluation until it is finalized again.');

const invalidActions = [];
for (const field of ['score', 'cited']) { const next = action(draft, true); next.evaluations[0].documents[0][field] = null; invalidActions.push(next); }
const noRank = action(draft, true); noRank.rankings[Object.keys(noRank.rankings)[0]] = null; invalidActions.push(noRank);
const allExcluded = action(draft, true); Object.keys(allExcluded.rankings).forEach(id => { allExcluded.rankings[id] = 'excluded'; }); invalidActions.push(allExcluded);
const before = JSON.stringify(draft);
for (const invalid of invalidActions) assert.throws(() => rules.applyAction(draft, actor, invalid), error => error.status === 400 && /평가를 종료/.test(error.message));
assert.equal(JSON.stringify(draft), before, 'Invalid finalization is atomic.');
for (const finalize of ['yes', 1, null, [], {}]) assert.throws(() => rules.applyAction(draft, actor, { ...action(draft), finalize }), error => error.status === 400 && /종료 여부/.test(error.message));
const missingAI = structuredClone(draft); missingAI.evaluations = missingAI.evaluations.filter(entry => entry.caseId !== item.id || entry.methodId !== draftAction.evaluations[0].methodId);
assert.throws(() => rules.applyAction(missingAI, actor, action(missingAI, true)), error => error.status === 400);
for (const status of ['pending', 'stopped', 'closed']) {
  const locked = rules.applyAction(draft, { admin: true }, { type: 'setMonthStage', monthId: item.monthId, stage: 'evaluation', status });
  assert.throws(() => rules.applyAction(locked, actor, action(locked, true)), error => error.status === 409);
}
assert.throws(() => rules.applyAction(draft, { userId: 'demo-user-2' }, action(draft, true)), error => error.status === 403);
const changed = rules.applyAction(draft, actor, { type: 'saveResult', caseId: item.id, methodId: 'chatgpt', documents: ['KR20260012345A'], publish: true });
assert.throws(() => rules.applyAction(changed, actor, action(draft, true)), error => error.status === 409);
assert.equal(ranking(changed).finalized, false);

async function load(relative, dependencies) {
  const source = await fs.readFile(new URL(relative, import.meta.url), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInThisContext(`(function(require,module,exports){${output}\n})`)(id => { if (!(id in dependencies)) throw Error('Unexpected dependency: ' + id); return dependencies[id]; }, module, module.exports);
  return module.exports;
}
const mf = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("test") } }', compatibilityDate: '2026-05-01', d1Databases: { DB: 'evaluation-finalization-test' }, d1Persist: false });
try {
  const db = await mf.getD1Database('DB');
  const migration = await load('../app/lib/evaluation-bureau.ts', { '@/app/lib/evaluation': rules });
  const store = await load('../app/lib/evaluation-store.ts', { '@/app/lib/db': { appDatabase: async () => db }, '@/app/lib/evaluation': rules, '@/app/lib/bureaus': bureaus, '@/app/lib/evaluation-bureau': migration });
  await store.readEvaluationState();
  await db.prepare('UPDATE evaluation_workspace SET payload_json = ?, revision = 0 WHERE id = ?').bind(JSON.stringify(initial), 'main').run();
  await store.mutateEvaluationState(0, actor, draftAction);
  let persisted = await store.readEvaluationState();
  assert.equal(persisted.revision, 1); assert.equal(ranking(persisted.state).finalized, false); assert(!rules.caseStatus(persisted.state, item).complete);
  await assert.rejects(() => store.mutateEvaluationState(1, actor, invalidActions[0]), error => error.status === 400);
  assert.equal((await store.readEvaluationState()).revision, 1, 'Rejected finalization must not write a revision.');
  await store.mutateEvaluationState(1, actor, action(persisted.state, true));
  persisted = await store.readEvaluationState();
  assert.equal(persisted.revision, 2); assert.equal(ranking(persisted.state).finalized, true); assert(rules.caseStatus(persisted.state, item).complete);
  await assert.rejects(() => store.mutateEvaluationState(1, actor, action(persisted.state, false)), error => error.status === 409);
  assert.equal(ranking((await store.readEvaluationState()).state).finalized, true);
} finally { await mf.dispose(); }
console.log('Evaluation finalization passed: explicit intermediate/final saves, legacy compatibility, completion statistics, 0/X, atomic validation, ownership/stage/version guards and real D1 persistence/CAS.');
