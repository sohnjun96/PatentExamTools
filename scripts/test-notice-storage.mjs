import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { Miniflare } from 'miniflare';
import * as rules from '../app/lib/evaluation.ts';
import * as bureauRules from '../app/lib/bureaus.ts';

const now = new Date('2026-10-27T04:05:06.000Z');
const empty = rules.createInitialState('2026-10');
assert.equal(empty.notice, null);
const legacy = structuredClone(empty);
delete legacy.notice;
assert.equal(rules.visibleState(legacy, {}).notice, undefined, 'Existing JSON without a notice remains readable.');
const markdown = '# 업무 안내\n\n**기한**을 확인해 주세요.\n\n- [평가 안내](/기획국)';
const saved = rules.applyAction(legacy, { admin: true }, { type: 'saveNotice', markdown: `  ${markdown}\n\n` }, now);
assert.deepEqual(saved.notice, { markdown, updatedAt: now.toISOString() });
assert.equal(legacy.notice, undefined, 'Saving must not mutate the input.');
assert.deepEqual(rules.visibleState(saved, {}).notice, saved.notice, 'Notice is public before selecting an account.');
assert.equal(rules.visibleState(saved, {}).cases.length, 0);
assert.throws(() => rules.applyAction(saved, { admin: true }, { type: 'loadDemo' }), error => error.status === 400);
assert.deepEqual(saved.notice, { markdown, updatedAt: now.toISOString() }, 'The removed demo action must leave the existing announcement intact.');
for (const actor of [{}, { admin: false }, { userId: 'examiner' }]) {
  assert.throws(() => rules.applyAction(saved, actor, { type: 'saveNotice', markdown: '금지' }), error => error.status === 403);
  assert.throws(() => rules.applyAction(saved, actor, { type: 'saveNotice', markdown: '' }), error => error.status === 403);
}
for (const value of [undefined, null, 5, {}, [], 'x'.repeat(rules.NOTICE_MAX_LENGTH + 1)]) {
  assert.throws(() => rules.applyAction(saved, { admin: true }, { type: 'saveNotice', markdown: value }), error => error.status === 400);
}
assert.equal(rules.applyAction(saved, { admin: true }, { type: 'saveNotice', markdown: 'x'.repeat(rules.NOTICE_MAX_LENGTH) }).notice.markdown.length, rules.NOTICE_MAX_LENGTH);
for (const markdown of ['', ' \n\t ']) {
  assert.equal(rules.applyAction(saved, { admin: true }, { type: 'saveNotice', markdown }).notice, null);
}

async function loadApplicationModule(path, dependencies) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  const load = vm.runInThisContext(`(function(require, module, exports) { ${compiled}\n})`);
  load(id => {
    if (id in dependencies) return dependencies[id];
    throw new Error(`Unexpected dependency: ${id}`);
  }, module, module.exports);
  return module.exports;
}

const migration = await loadApplicationModule('../app/lib/evaluation-bureau.ts', { '@/app/lib/evaluation': rules });
for (const bureau of bureauRules.BUREAUS) {
  assert.equal(migration.migrateEvaluationBureau(saved, bureau).notice, null, 'Legacy shared notices have no bureau ownership and must not be copied.');
}

const mf = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("test") } }', compatibilityDate: '2026-05-01', d1Databases: { DB: 'notice-storage-test' }, d1Persist: false });
try {
  const db = await mf.getD1Database('DB');
  const dependencies = {
    '@/app/lib/db': { appDatabase: async () => db },
    '@/app/lib/evaluation': rules,
    '@/app/lib/bureaus': bureauRules,
    '@/app/lib/evaluation-bureau': migration,
  };
  const store = await loadApplicationModule('../app/lib/evaluation-store.ts', dependencies);
  await store.readEvaluationState();
  await db.prepare('UPDATE evaluation_workspace SET payload_json = ? WHERE id = ?').bind(JSON.stringify(saved), 'main').run();
  for (const bureau of bureauRules.BUREAUS) assert.equal((await store.readEvaluationState(bureau)).state.notice, null);
  const before = await store.readEvaluationState('기획국');
  const written = await store.mutateEvaluationState(before.revision, { admin: true }, { type: 'saveNotice', markdown }, '기획국');
  assert.equal(written.revision, 1);
  assert.equal(written.state.notice.markdown, markdown);
  assert.deepEqual((await store.readEvaluationState('기획국')).state.notice, written.state.notice);
  // A new module instance must still read D1, rather than retaining notice state in memory.
  const reloadedStore = await loadApplicationModule('../app/lib/evaluation-store.ts', dependencies);
  assert.deepEqual((await reloadedStore.readEvaluationState('기획국')).state.notice, written.state.notice);
  for (const bureau of bureauRules.BUREAUS.filter(bureau => bureau !== '기획국')) {
    const other = await store.readEvaluationState(bureau);
    assert.equal(other.revision, 0);
    assert.equal(other.state.notice, null);
  }
  await assert.rejects(() => store.mutateEvaluationState(0, { admin: true }, { type: 'saveNotice', markdown: '오래된 수정' }, '기획국'), error => error.status === 409);
  await assert.rejects(() => store.mutateEvaluationState(1, {}, { type: 'saveNotice', markdown: '무권한 수정' }, '기획국'), error => error.status === 403);
  assert.equal((await store.readEvaluationState('기획국')).revision, 1);
  const races = await Promise.allSettled([
    store.mutateEvaluationState(1, { admin: true }, { type: 'saveNotice', markdown: '동시 수정 A' }, '기획국'),
    store.mutateEvaluationState(1, { admin: true }, { type: 'saveNotice', markdown: '동시 수정 B' }, '기획국'),
  ]);
  assert.equal(races.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(races.find(result => result.status === 'rejected').reason.status, 409);
  const independent = await Promise.all([
    store.mutateEvaluationState(2, { admin: true }, { type: 'saveNotice', markdown: '기획국 새 공지' }, '기획국'),
    store.mutateEvaluationState(0, { admin: true }, { type: 'saveNotice', markdown: '융합국 새 공지' }, '융합국'),
  ]);
  assert.deepEqual(independent.map(result => result.revision), [3, 1]);

  const api = await loadApplicationModule('../app/api/evaluation/route.ts', {
    'next/server': { NextResponse: { json: (data, options = {}) => new Response(JSON.stringify(data), { ...options, headers: { ...options.headers, 'Content-Type': 'application/json' } }) } },
    '@/app/lib/evaluation': rules,
    '@/app/lib/bureaus': bureauRules,
    '@/app/lib/evaluation-store': store,
  });
  const request = (query = '', body) => ({ nextUrl: new URL(`http://localhost/api/evaluation${query}`), text: async () => JSON.stringify(body) });
  const anonymousGet = await api.GET(request('?bureau=기획국'));
  assert.equal(anonymousGet.status, 200);
  assert.match(anonymousGet.headers.get('Cache-Control'), /no-store/);
  assert.equal((await anonymousGet.json()).state.notice.markdown, '기획국 새 공지');
  const nonAdminPost = await api.POST(request('?bureau=기획국', { revision: 3, actor: { admin: 'true' }, action: { type: 'saveNotice', markdown: '거절' } }));
  assert.equal(nonAdminPost.status, 403, 'Only literal true qualifies for the existing admin entrypoint.');
  const invalidPost = await api.POST(request('?bureau=기획국', { revision: 3, actor: { admin: true }, action: { type: 'saveNotice', markdown: null } }));
  assert.equal(invalidPost.status, 400);
  const bodyScopeIgnored = await api.POST(request('?bureau=기획국', { revision: 3, bureau: '융합국', actor: { admin: true }, action: { type: 'saveNotice', markdown: 'URL 소속 공지' } }));
  assert.equal(bodyScopeIgnored.status, 200);
  assert.equal((await bodyScopeIgnored.json()).state.notice.markdown, 'URL 소속 공지');
  assert.equal((await store.readEvaluationState('융합국')).state.notice.markdown, '융합국 새 공지');
  const cleared = await api.POST(request('?bureau=기획국', { revision: 4, actor: { admin: true }, action: { type: 'saveNotice', markdown: '\n ' } }));
  assert.equal(cleared.status, 200);
  assert.equal((await cleared.json()).state.notice, null);
  assert.equal((await store.readEvaluationState('기획국')).state.notice, null);
  assert.equal((await store.readEvaluationState('융합국')).state.notice.markdown, '융합국 새 공지');
  assert.deepEqual((await store.readEvaluationState()).state.notice, saved.notice, 'Bureau edits must leave the shared workspace unchanged.');
  console.log('Notices: admin validation, legacy compatibility, public visibility, clearing, retired-action rejection, D1 persistence/reload, six-bureau isolation, CAS conflicts and API scope verified.');
} finally {
  await mf.dispose();
}
