import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { Miniflare } from 'miniflare';
import * as rules from '../app/lib/evaluation.ts';
import * as bureauRules from '../app/lib/bureaus.ts';

const patent = {
  kind: 'patent', number: 'KR20100001234A',
  url: 'https://patents.example.test/KR20100001234A',
  reportMarkdown: '# 대비 보고서\n\n**청구항 1**과 관련된 구성입니다.\n\n| 구성 | 근거 |\n| --- | --- |\n| 검색 | 문단 12 |',
};
const paper = {
  kind: 'non-patent', authors: 'Kim, J.; Lee, S.', title: 'Technical literature retrieval',
  publication: 'Journal of Retrieval', publicationPlace: 'Seoul', publisher: 'Research Press',
  publicationDate: '2020-06', volume: 'Vol. 10', issue: 'No. 2', pages: 'pp. 101–115',
  acquiredDate: '2026-10-30', dateNote: '발행일이 없어 입수일을 함께 기재함',
  url: 'https://example.test/article?id=7&lang=ko', reportMarkdown: '## 관련성\n\n- 검색 구조 설명\n- 인용 근거: 101쪽',
};
const documents = rules.normalizeLiteratureDocuments([patent, paper]);
assert.equal(documents.length, 2);
assert.equal(documents[0].number, patent.number);
assert.equal(documents[1].kind, 'non-patent');
const citation = documents[1].number;
const citationFields = ['authors', 'title', 'publication', 'publicationPlace', 'publisher', 'publicationDate', 'volume', 'issue', 'pages'];
let previous = -1;
for (const field of citationFields) {
  const position = citation.indexOf(paper[field]);
  assert(position > previous, `Citation must preserve the screenshot's order for ${field}.`);
  previous = position;
}
assert.equal(documents[1].acquiredDate, paper.acquiredDate);
assert.equal(documents[1].dateNote, paper.dateNote);
assert.equal(documents[1].reportMarkdown, paper.reportMarkdown);
assert.equal(documents[1].url, paper.url);
assert.deepEqual(rules.normalizeLiteratureDocuments(documents), documents, 'Normalized detail objects must be safe to save again.');
assert.equal(rules.normalizeLiteratureDocuments([{ ...patent, number: ' kr 2010-0001234 a ' }])[0].number, patent.number);
assert.deepEqual(rules.parseLiteratureImport(JSON.stringify({ documents: [patent, paper] })), documents);
assert.deepEqual(rules.parseLiteratureImport(JSON.stringify([patent, paper])), documents);
assert.deepEqual(rules.parseLiteratureImport('```json\n' + JSON.stringify({ documents: [patent, paper] }) + '\n```'), documents);
assert(rules.LITERATURE_FORMAT_PROMPT.includes('reportMarkdown'));
assert(rules.LITERATURE_FORMAT_PROMPT.includes('publicationPlace'));
assert(rules.parseLiteratureImport(rules.LITERATURE_IMPORT_EXAMPLE).length > 0, 'The copyable example must be accepted by the actual importer.');

const badRequest = error => error instanceof rules.EvaluationError && error.status === 400;
for (const input of ['', '{broken', 'null', '{}', '{"documents":{}}', '{"documents":[null]}', '{"documents":["KR20100001234A"]}', '```json\n[]\n```\nadditional prose']) {
  assert.throws(() => rules.parseLiteratureImport(input), badRequest, `Reject malformed bulk input: ${input}`);
}
for (const value of [null, undefined, {}, 7, [null], [{}], [{ kind: 'unknown', number: 'abc' }], [{ kind: 'non-patent', title: '' }], [{ kind: 'non-patent', title: 2020 }], [{ ...patent, number: 'not-a-patent' }], [{ ...patent, reportMarkdown: {} }]]) {
  assert.throws(() => rules.normalizeLiteratureDocuments(value), badRequest);
}
for (const url of ['javascript:alert(1)', 'data:text/html,example', 'file:///C:/secret', '//example.test/article', 'https://user:password@example.test/article', 'https://example.test/\narticle']) {
  assert.throws(() => rules.normalizeLiteratureDocuments([{ ...patent, url }]), badRequest, `Reject unsafe source URL: ${url}`);
}
for (const field of ['authors', 'publication', 'publicationPlace', 'publisher', 'volume', 'issue', 'pages']) {
  assert.throws(() => rules.normalizeLiteratureDocuments([{ ...paper, [field]: [] }]), badRequest, `Reject wrong field type for ${field}.`);
}
assert.throws(() => rules.normalizeLiteratureDocuments([{ ...patent, reportMarkdown: 'x'.repeat(rules.LITERATURE_REPORT_MAX_LENGTH + 1) }]), badRequest);
assert.equal(rules.normalizeLiteratureDocuments([{ ...patent, reportMarkdown: 'x'.repeat(rules.LITERATURE_REPORT_MAX_LENGTH) }])[0].reportMarkdown.length, rules.LITERATURE_REPORT_MAX_LENGTH);
assert.throws(() => rules.normalizeLiteratureDocuments([patent, { ...patent, number: 'kr 2010-0001234 a' }]), badRequest);
assert.throws(() => rules.normalizeLiteratureDocuments(Array.from({ length: 8 }, (_, i) => ({ ...patent, number: `KR2010000123${i}A` }))), badRequest);
assert.deepEqual(rules.normalizeLiteratureDocuments([], true), []);

let state = rules.createDemoState('2026-11');
const item = state.cases[0];
const author = { userId: 'demo-user-1' };
const action = (details, publish) => ({ type: 'saveResult', caseId: item.id, methodId: 'chatgpt', documents: details.map(document => document.number), documentDetails: details, publish });
const publishedBefore = structuredClone(rules.resultFor(state, item.id, 'chatgpt'));
state = rules.applyAction(state, author, action(documents, false));
let result = rules.resultFor(state, item.id, 'chatgpt');
assert.deepEqual(result.draftDocumentDetails, documents);
assert.deepEqual(result.publishedDocuments, publishedBefore.publishedDocuments);
assert.deepEqual(result.publishedDocumentDetails, publishedBefore.publishedDocumentDetails, 'Private report edits must not change the published metadata.');
assert.deepEqual(rules.literatureDetailsFor(result, 'draft'), documents);
state = rules.applyAction(state, author, action(documents, true));
result = rules.resultFor(state, item.id, 'chatgpt');
assert.deepEqual(rules.literatureDetailsFor(result), documents);
const version = result.publishedVersion;
const evaluationDocuments = documents.map(document => ({ number: document.number, score: 4, cited: 'O', note: '평가 메모' }));
state = rules.applyAction(state, author, { type: 'saveEvaluation', caseId: item.id, evaluations: [{ methodId: 'chatgpt', version, documents: evaluationDocuments }], rankings: {}, versions: {} });
state = rules.applyAction(state, author, action([...documents].reverse(), true));
assert.equal(rules.resultFor(state, item.id, 'chatgpt').publishedVersion, version, 'Reordering details must not invalidate scores.');
assert.deepEqual(rules.validEvaluation(state, item.id, 'chatgpt').documents, evaluationDocuments);
const changedReport = documents.map((document, index) => index ? document : { ...document, reportMarkdown: '## 수정된 근거\n\n문단 14.' });
state = rules.applyAction(state, author, action(changedReport, false));
assert.equal(rules.resultFor(state, item.id, 'chatgpt').publishedVersion, version);
assert.deepEqual(rules.literatureDetailsFor(rules.resultFor(state, item.id, 'chatgpt')), [...documents].reverse());
state = rules.applyAction(state, author, action(changedReport, true));
assert.equal(rules.resultFor(state, item.id, 'chatgpt').publishedVersion, version + 1, 'Published report changes must mark evaluations stale.');
assert.equal(rules.validEvaluation(state, item.id, 'chatgpt'), undefined);
const changedUrl = changedReport.map((document, index) => index ? document : { ...document, url: 'https://example.test/corrected-patent' });
state = rules.applyAction(state, author, action(changedUrl, true));
assert.equal(rules.resultFor(state, item.id, 'chatgpt').publishedVersion, version + 2, 'Source URL changes must mark evaluations stale.');
assert.throws(() => rules.applyAction(state, author, { ...action(documents, true), documents: [patent.number] }), badRequest, 'A client may not attach metadata to different document identities.');
assert.throws(() => rules.applyAction(state, { userId: 'demo-user-3' }, action(documents, true)), error => error.status === 403);
const rows = rules.getStatistics(state, '2026-11').rows.filter(row => row.caseId === item.id && row.methodId === 'chatgpt');
assert.equal(rows.find(row => row.number === patent.number).url, changedUrl[0].url);
assert.equal(rows.find(row => row.number === patent.number).reportMarkdown, changedUrl[0].reportMarkdown);

// A colleague is an examiner for a different case in the same AI assignee's group.
const colleague = state.cases.find(entry => entry.examinerId === 'demo-user-3');
const privateDetails = rules.normalizeLiteratureDocuments([{ ...patent, reportMarkdown: '비공개 수정 초안' }]);
state = rules.applyAction(state, author, { ...action(documents, true), caseId: colleague.id });
state = rules.applyAction(state, author, { ...action(privateDetails, false), caseId: colleague.id });
const colleagueResult = rules.visibleState(state, { userId: colleague.examinerId }).results.find(entry => entry.caseId === colleague.id && entry.methodId === 'chatgpt');
assert.deepEqual(colleagueResult.draftDocuments, []);
assert.deepEqual(colleagueResult.draftDocumentDetails ?? [], [], 'Examiners must not receive unpublished report or URL edits.');
assert.deepEqual(colleagueResult.publishedDocumentDetails, documents);
const legacyResult = { ...publishedBefore };
delete legacyResult.draftDocumentDetails;
delete legacyResult.publishedDocumentDetails;
assert.deepEqual(rules.literatureDetailsFor(legacyResult).map(entry => entry.number), legacyResult.publishedDocuments, 'Legacy citations must remain visible without a schema migration.');

async function loadModule(relative, dependencies) {
  const source = await readFile(new URL(relative, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const moduleRecord = { exports: {} };
  vm.runInThisContext(`(function(require, module, exports) { ${compiled}\n})`)(id => {
    if (id in dependencies) return dependencies[id];
    throw new Error(`Unexpected dependency: ${id}`);
  }, moduleRecord, moduleRecord.exports);
  return moduleRecord.exports;
}
const migration = await loadModule('../app/lib/evaluation-bureau.ts', { '@/app/lib/evaluation': rules });
const scopedSource = structuredClone(state);
scopedSource.users.forEach(user => { user.bureau = '기획국'; });
scopedSource.cases.forEach(entry => { entry.bureau = '기획국'; });
scopedSource.users.push({ id: 'foreign-author', name: '다른 국 담당자', bureau: '전기국', division: '전기과', roles: ['ai'], active: true });
const foreignDraft = rules.resultFor(scopedSource, item.id, 'chatgpt');
foreignDraft.draftAuthorId = 'foreign-author';
foreignDraft.draftDocumentDetails = privateDetails;
foreignDraft.draftDocuments = privateDetails.map(document => document.number);
const migrated = migration.migrateEvaluationBureau(scopedSource, '기획국');
const migratedResult = rules.resultFor(migrated, item.id, 'chatgpt');
assert.deepEqual(migratedResult.draftDocuments, []);
assert.deepEqual(migratedResult.draftDocumentDetails ?? [], [], 'Bureau migration must not leak another bureau\'s private reports.');
assert.deepEqual(migratedResult.publishedDocumentDetails, foreignDraft.publishedDocumentDetails);

// Round-trip the real JSON payload through the real store in an isolated D1 database.
const mf = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("test") } }', compatibilityDate: '2026-05-01', d1Databases: { DB: 'structured-literature-test' }, d1Persist: false });
try {
  const db = await mf.getD1Database('DB');
  const store = await loadModule('../app/lib/evaluation-store.ts', {
    '@/app/lib/db': { appDatabase: async () => db }, '@/app/lib/evaluation': rules,
    '@/app/lib/bureaus': bureauRules, '@/app/lib/evaluation-bureau': migration,
  });
  await store.readEvaluationState();
  await db.prepare('UPDATE evaluation_workspace SET payload_json = ? WHERE id = ?').bind(JSON.stringify(state), 'main').run();
  const inlineLegacy = await store.readEvaluationState();
  assert.equal(rules.literatureDetailsFor(rules.resultFor(inlineLegacy.state, item.id, 'chatgpt'))[0].reportMarkdown, changedUrl[0].reportMarkdown, 'Existing inline Markdown must remain readable before externalization.');
  const persisted = await store.mutateEvaluationState(0, author, action(documents, true));
  const reloaded = await store.readEvaluationState();
  assert.equal(reloaded.revision, persisted.revision);
  assert.deepEqual(rules.literatureDetailsFor(rules.resultFor(reloaded.state, item.id, 'chatgpt')), documents);
  assert.deepEqual(rules.literatureDetailsFor(rules.resultFor(reloaded.state, item.id, 'chatgpt'), 'draft'), documents);

  const reportRowCount = async () => (await db.prepare('SELECT COUNT(*) AS count FROM evaluation_literature_reports WHERE workspace_id = ?').bind('main').first()).count;
  const storedBefore = await reportRowCount();
  let current = reloaded;
  const largeCases = current.state.cases.slice(0, 12);
  const expectedReports = new Map();
  for (const [caseIndex, largeCase] of largeCases.entries()) {
    const largeDocuments = rules.normalizeLiteratureDocuments(Array.from({ length: 7 }, (_, documentIndex) => ({
      kind: 'patent', number: `KR2020${String(caseIndex * 10 + documentIndex).padStart(7, '0')}A`,
      url: `https://example.test/large/${caseIndex}/${documentIndex}`,
      reportMarkdown: `# 한글 보고서 ${caseIndex}-${documentIndex}\n\n${'가'.repeat(9000)}`,
    })));
    const largeActor = { userId: largeCase.groupId === 'group-a' ? 'demo-user-1' : 'demo-user-6' };
    current = await store.mutateEvaluationState(current.revision, largeActor, {
      type: 'saveResult', caseId: largeCase.id, methodId: 'chatgpt',
      documents: largeDocuments.map(document => document.number), documentDetails: largeDocuments, publish: true,
    });
    expectedReports.set(largeCase.id, largeDocuments);
  }
  const hydrated = await store.readEvaluationState();
  const hydratedBytes = Buffer.byteLength(JSON.stringify(hydrated.state), 'utf8');
  assert(hydratedBytes > 2 * 1024 * 1024, 'The fixture must exceed D1\'s single text value limit after hydration.');
  for (const [caseId, expected] of expectedReports) {
    const hydratedResult = rules.resultFor(hydrated.state, caseId, 'chatgpt');
    assert.deepEqual(rules.literatureDetailsFor(hydratedResult), expected, 'Every published Korean report must survive a workspace larger than 2 MiB.');
    assert.deepEqual(rules.literatureDetailsFor(hydratedResult, 'draft'), expected);
    assert(!JSON.stringify(hydratedResult).includes('reportRef'), 'Persistence hashes must not leak into the application state.');
  }
  const rawRow = await db.prepare('SELECT payload_json FROM evaluation_workspace WHERE id = ?').bind('main').first();
  assert(Buffer.byteLength(rawRow.payload_json, 'utf8') < 2 * 1024 * 1024, 'The persisted workspace must retain small references rather than duplicate reports.');
  const rawPayload = JSON.parse(rawRow.payload_json);
  const refs = rawPayload.results.flatMap(result => [...(result.draftDocumentDetails ?? []), ...(result.publishedDocumentDetails ?? [])]).map(document => document.reportRef).filter(Boolean);
  assert(new Set(refs).size >= 84, 'Hydration must span multiple reference lookup batches.');
  assert(refs.every(ref => /^[a-f0-9]{64}$/.test(ref)), 'Report references must be content hashes.');
  assert(!rawRow.payload_json.includes('가'.repeat(200)), 'Long report bodies must not be embedded in the workspace row.');
  assert.equal(await reportRowCount(), storedBefore + 84, 'Draft and published snapshots must share the same immutable report rows.');

  const privacyCase = largeCases.find(entry => entry.examinerId === 'demo-user-3');
  const originalPrivacyDocuments = expectedReports.get(privacyCase.id);
  const updatedPrivacyDocuments = originalPrivacyDocuments.map((document, index) => index ? document : { ...document, reportMarkdown: '## 비공개 초안\n\n심사관에게 공개하기 전의 보고서' });
  const draftSaved = await store.mutateEvaluationState(hydrated.revision, author, {
    type: 'saveResult', caseId: privacyCase.id, methodId: 'chatgpt', documents: updatedPrivacyDocuments.map(document => document.number), documentDetails: updatedPrivacyDocuments, publish: false,
  });
  const hydratedPrivate = await store.readEvaluationState();
  const examinerResult = rules.visibleState(hydratedPrivate.state, { userId: privacyCase.examinerId }).results.find(entry => entry.caseId === privacyCase.id && entry.methodId === 'chatgpt');
  assert.deepEqual(rules.literatureDetailsFor(examinerResult), originalPrivacyDocuments, 'Hydration must preserve the published snapshot for examiners.');
  assert.deepEqual(examinerResult.draftDocumentDetails ?? [], [], 'Hydrated private reports must remain hidden from examiners.');
  const countBeforeStale = await reportRowCount();
  await assert.rejects(() => store.mutateEvaluationState(hydrated.revision, author, action(documents, true)), error => error.status === 409);
  assert.equal(await reportRowCount(), countBeforeStale, 'A rejected stale revision must not write report rows.');
  const afterStale = await store.readEvaluationState();
  assert.equal(afterStale.revision, draftSaved.revision);
  assert.deepEqual(rules.literatureDetailsFor(rules.resultFor(afterStale.state, privacyCase.id, 'chatgpt'), 'draft'), updatedPrivacyDocuments, 'A stale write must not corrupt a newer private draft.');
  const api = await loadModule('../app/api/evaluation/route.ts', {
    'next/server': { NextResponse: { json: (data, options = {}) => new Response(JSON.stringify(data), { ...options, headers: { ...options.headers, 'Content-Type': 'application/json' } }) } },
    '@/app/lib/evaluation': rules, '@/app/lib/bureaus': bureauRules, '@/app/lib/evaluation-store': store,
  });
  const examinerResponse = await api.GET({ nextUrl: new URL(`http://localhost/api/evaluation?userId=${privacyCase.examinerId}`) });
  assert.equal(examinerResponse.status, 200);
  const examinerBody = await examinerResponse.text();
  assert(!examinerBody.includes('reportRef'), 'Internal report references must not appear in API responses.');
  assert(!examinerBody.includes('심사관에게 공개하기 전의 보고서'), 'The API must not expose a hydrated private report to an examiner.');
  const apiExaminerResult = JSON.parse(examinerBody).state.results.find(entry => entry.caseId === privacyCase.id && entry.methodId === 'chatgpt');
  assert.deepEqual(rules.literatureDetailsFor(apiExaminerResult), originalPrivacyDocuments);
  const adminResponse = await api.GET({ nextUrl: new URL('http://localhost/api/evaluation?admin=1') });
  assert.equal(adminResponse.status, 200);
  const adminBody = await adminResponse.text();
  assert(!adminBody.includes('reportRef'), 'Administrative API responses must also contain hydrated reports rather than storage hashes.');
  assert(adminBody.includes('심사관에게 공개하기 전의 보고서'));
  console.log(`Large-report D1 persistence: ${hydratedBytes.toLocaleString('en-US')} hydrated bytes, ${Buffer.byteLength(rawRow.payload_json, 'utf8').toLocaleString('en-US')} persisted workspace bytes, ${new Set(refs).size} unique report references.`);
} finally {
  await mf.dispose();
}

console.log('Structured literature passed: JSON import, citation field order, validation, safe URLs, Markdown limits, draft privacy, version invalidation, legacy records, bureau scoping and D1 persistence.');
