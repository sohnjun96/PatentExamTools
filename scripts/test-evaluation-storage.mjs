import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { Miniflare } from 'miniflare';
import * as rules from '../app/lib/evaluation.ts';

// Exercise the real storage module against an isolated, non-persistent D1.
// The module loader only replaces the application's DB entrypoint and alias.
const mf = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("test") } }', compatibilityDate: '2026-05-01', d1Databases: { DB: 'evaluation-storage-test' }, d1Persist: false });
try {
  const db = await mf.getD1Database('DB');
  const source = await readFile(new URL('../app/lib/evaluation-store.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  const load = vm.runInThisContext(`(function(require, module, exports) { ${compiled}\n})`);
  load((id) => {
    if (id === '@/app/lib/db') return { appDatabase: async () => db };
    if (id === '@/app/lib/evaluation') return rules;
    throw new Error(`Unexpected dependency: ${id}`);
  }, module, module.exports);
  const store = module.exports;
  const initial = await store.readEvaluationState();
  assert.equal(initial.revision, 0);
  const attempts = await Promise.allSettled([
    store.mutateEvaluationState(0, { admin: true }, { type: 'saveGroup', group: { name: '그룹 A' } }),
    store.mutateEvaluationState(0, { admin: true }, { type: 'saveGroup', group: { name: '그룹 B' } }),
  ]);
  assert.equal(attempts.filter((attempt) => attempt.status === 'fulfilled').length, 1);
  const rejected = attempts.find((attempt) => attempt.status === 'rejected');
  assert.equal(rejected.reason.status, 409);
  const afterRace = await store.readEvaluationState();
  assert.equal(afterRace.revision, 1);
  assert.equal(afterRace.state.groups.length, 1);
  await assert.rejects(() => store.mutateEvaluationState(1, { admin: false }, { type: 'saveGroup', group: { name: '권한 없음' } }), (error) => error.status === 403);
  assert.equal((await store.readEvaluationState()).revision, 1);
  const retryName = afterRace.state.groups[0].name === '그룹 A' ? '그룹 B' : '그룹 A';
  await store.mutateEvaluationState(1, { admin: true }, { type: 'saveGroup', group: { name: retryName } });
  const final = await store.readEvaluationState();
  assert.equal(final.revision, 2);
  assert.deepEqual(final.state.groups.map((group) => group.name).sort(), ['그룹 A', '그룹 B']);
  console.log('Evaluation storage: isolated D1 persistence, atomic competing writes, 409 conflict, denied-write rollback and reload/retry verified.');
} finally {
  await mf.dispose();
}
