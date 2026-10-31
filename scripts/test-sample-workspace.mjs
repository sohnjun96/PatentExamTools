import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { Miniflare } from 'miniflare';
import * as rules from '../app/lib/evaluation.ts';
import * as bureaus from '../app/lib/bureaus.ts';

async function loadModule(file, dependencies) {
  const source = await readFile(new URL(file, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInThisContext(`(function(require,module,exports){${compiled}\n})`)(id => {
    if (id in dependencies) return dependencies[id];
    throw new Error(`Unexpected dependency: ${id}`);
  }, module, module.exports);
  return module.exports;
}
const migration = await loadModule('../app/lib/evaluation-bureau.ts', { '@/app/lib/evaluation': rules });
const mf = new Miniflare({ modules: true, script: 'export default { fetch(){return new Response("test")} }', compatibilityDate: '2026-05-01', d1Databases: { DB: 'sample-workspace-test' }, d1Persist: false });
try {
  const db = await mf.getD1Database('DB');
  const dependencies = { '@/app/lib/db': { appDatabase: async () => db }, '@/app/lib/evaluation': rules, '@/app/lib/bureaus': bureaus, '@/app/lib/evaluation-bureau': migration };
  const store = await loadModule('../app/lib/evaluation-store.ts', dependencies);
  await store.readEvaluationState();
  const originals = new Map();
  for (const [index, bureau] of bureaus.BUREAUS.entries()) {
    const state = migration.demoForBureau(rules.createDemoState('2026-11'), bureau);
    state.notice = { markdown: `${bureau} 공지`, updatedAt: '2026-10-31T00:00:00Z' };
    originals.set(bureau, { state, revision: 40 + index });
  }
  const planning = originals.get('기획국');
  const markdown = '# 보존할 보고서\n\n기획국의 문헌별 조사 내용';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(markdown));
  const hash = Buffer.from(digest).toString('hex');
  const document = { kind: 'patent', number: planning.state.results[0].publishedDocuments[0], reportRef: hash };
  planning.state.results[0].draftDocumentDetails = [structuredClone(document)];
  planning.state.results[0].publishedDocumentDetails = [structuredClone(document)];
  planning.state.results[0].draftEditorState = { documents: [structuredClone(document)], bulkInputRef: hash };
  await db.prepare('INSERT INTO evaluation_literature_reports (workspace_id, report_hash, markdown) VALUES (?, ?, ?)').bind('bureau:기획국', hash, markdown).run();
  for (const [bureau, original] of originals) {
    await db.prepare('INSERT INTO evaluation_workspace (id, revision, payload_json) VALUES (?, ?, ?)').bind(`bureau:${bureau}`, original.revision, JSON.stringify(original.state)).run();
  }
  // Shared legacy records must never repopulate any reset bureau.
  await db.prepare('UPDATE evaluation_workspace SET payload_json = ? WHERE id = ?').bind(JSON.stringify(planning.state), 'main').run();
  const reset = await Promise.all(bureaus.BUREAUS.map(bureau => store.readEvaluationState(bureau)));
  for (const [index, current] of reset.entries()) {
    const bureau = bureaus.BUREAUS[index];
    assert.deepEqual(current.state, rules.createInitialState());
    assert.equal(current.revision, originals.get(bureau).revision + 1);
    await assert.rejects(() => store.mutateEvaluationState(originals.get(bureau).revision, { admin: true }, { type: 'saveNotice', markdown: '초기화 전 화면의 저장' }, bureau), error => error.status === 409);
    const archived = await db.prepare('SELECT revision, payload_json FROM evaluation_workspace WHERE id = ?').bind(`bureau:${bureau}`).first();
    assert.equal(archived.revision, originals.get(bureau).revision);
    assert.deepEqual(JSON.parse(archived.payload_json), originals.get(bureau).state);
  }
  // A failed insert rolls back externalized report copies and leaves the archive intact.
  const sampleId = store.evaluationWorkspaceId(bureaus.SAMPLE_BUREAU);
  await db.exec(`CREATE TRIGGER sample_insert_failure BEFORE INSERT ON evaluation_workspace WHEN NEW.id = '${sampleId}' BEGIN SELECT RAISE(ABORT, 'test failure'); END`);
  await assert.rejects(() => store.readEvaluationState(bureaus.SAMPLE_BUREAU));
  assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM evaluation_literature_reports WHERE workspace_id = ?').bind(sampleId).first()).count, 0);
  await db.exec('DROP TRIGGER sample_insert_failure');
  const secondStore = await loadModule('../app/lib/evaluation-store.ts', dependencies);
  const [sample, simultaneousSample] = await Promise.all([store.readEvaluationState(bureaus.SAMPLE_BUREAU), secondStore.readEvaluationState(bureaus.SAMPLE_BUREAU)]);
  assert.deepEqual(sample, simultaneousSample);
  const expected = migration.demoForBureau(structuredClone(planning.state), bureaus.SAMPLE_BUREAU);
  const result = expected.results[0];
  for (const entry of [result.draftDocumentDetails[0], result.publishedDocumentDetails[0], result.draftEditorState.documents[0]]) { delete entry.reportRef; entry.reportMarkdown = markdown; }
  delete result.draftEditorState.bulkInputRef;
  result.draftEditorState.bulkInput = markdown;
  assert.deepEqual(sample.state, rules.withDefaultOperationMonths(rules.normalizeEvaluationState(expected)));
  assert.equal(sample.revision, planning.revision + 1);
  assert.equal((await db.prepare('SELECT markdown FROM evaluation_literature_reports WHERE workspace_id = ? AND report_hash = ?').bind(sampleId, hash).first()).markdown, markdown);
  assert.equal((await db.prepare('SELECT markdown FROM evaluation_literature_reports WHERE workspace_id = ? AND report_hash = ?').bind('bureau:기획국', hash).first()).markdown, markdown);
  const editedSample = await store.mutateEvaluationState(sample.revision, { admin: true }, { type: 'saveNotice', markdown: '샘플에서만 수정' }, bureaus.SAMPLE_BUREAU);
  const newPlanning = await store.mutateEvaluationState(reset[0].revision, { admin: true }, { type: 'saveUser', user: { name: '새 심사관', bureau: '기획국', division: '새 심사과', active: true, roles: ['examiner'] } }, '기획국');
  const reloaded = await loadModule('../app/lib/evaluation-store.ts', dependencies);
  assert.deepEqual(await reloaded.readEvaluationState('기획국'), newPlanning);
  assert.deepEqual(await reloaded.readEvaluationState(bureaus.SAMPLE_BUREAU), editedSample);
  assert.equal((await reloaded.readEvaluationState('전기국')).state.users.length, 0);
  assert.equal(editedSample.state.users.some(user => user.name === '새 심사관'), false);
  console.log('Sample migration passed: six clean bureaus, complete planning snapshot and report preservation, stale-write rejection, rollback, concurrent initialization, independent edits and no repeated reset.');
} finally { await mf.dispose(); }
