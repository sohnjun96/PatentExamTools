import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundle = await build({
  stdin: { resolveDir: root, contents: `
    export { default as PatentText } from './app/patent-text';
    export { OriginalHighlight } from './app/original-document-viewer';
    export * from './app/lib/patent-text';
    export { parseClaimChangeHistoryXml } from './app/lib/claim-changes';
    export { ClaimChangeMarkup } from './app/exam-workspace';
    export { normalizeFullTextXml } from './app/lib/fulltext-xml';
    export { analyzeClaims } from './app/lib/examination-model';
    export { FULLTEXT_PARSER_VERSION } from './app/lib/fulltext-version';
    export { fetchFullText, invalidateFullText } from './app/lib/patent-document-client';
  ` },
  bundle: true, write: false, platform: 'node', format: 'esm', target: 'es2022',
  external: ['react', 'react/*', 'react-dom', 'react-dom/*', 'fast-xml-parser', 'next', 'next/*'],
  plugins: [{ name: 'test-private-diff-view', setup(builder) {
    builder.onLoad({ filter: /[\\/]app[\\/]exam-workspace\.tsx$/ }, async ({ path: file }) => ({
      contents: `${await readFile(file, 'utf8')}\nexport { ClaimChangeMarkup };`, loader: 'tsx', resolveDir: path.dirname(file),
    }));
  } }],
});
const bundledText = bundle.outputFiles[0].text.replace(/from "(react(?:-dom)?(?:\/[^" ]+)?|fast-xml-parser)"/g, (_, name) => `from ${JSON.stringify(import.meta.resolve(name))}`);
const api = await import('data:text/javascript;base64,' + Buffer.from(bundledText).toString('base64'));
const render = (text, extra = {}) => renderToStaticMarkup(createElement(api.PatentText, { text, ...extra }));
const chemical = 'Mg<sup>2+</sup>, Fe<sup>3+</sup>, Fe(OH)<sub>3</sub> 및 Al(OH)<sub>3</sub>를 처리한다.';
assert.equal(api.patentPlainText(chemical), 'Mg2+, Fe3+, Fe(OH)3 및 Al(OH)3를 처리한다.');
assert.equal(render(chemical), `<span class="patent-text">${chemical}</span>`);
for (const text of ['Mg&lt;sup&gt;2+&lt;/sup&gt;', 'Mg&amp;lt;sup&amp;gt;2+&amp;lt;/sup&amp;gt;', 'Mg&#60;SUP&#62;2+&#60;/SUP&#62;', 'Mg<SuP class="fake" onclick="alert(1)">2+</SuP>']) {
  assert.equal(render(text), '<span class="patent-text">Mg<sup>2+</sup></span>');
}
assert.equal(api.patentPlainText('첫 줄<br/>둘째 줄<BR>셋째 줄'), '첫 줄\n둘째 줄\n셋째 줄');
assert.equal(api.patentPlainText('pH < 5 & Ni2+ > 0'), 'pH < 5 & Ni2+ > 0');
assert.equal(api.patentPlainText('Mg<sup>2+ 뒤 문장'), 'Mg<sup>2+ 뒤 문장', 'unclosed formatting must not swallow the remainder');
const unsafe = render('<script>alert(1)</script><img src=x onerror="alert(2)">Mg<sup style="color:red">2+</sup>');
assert(!unsafe.includes('<script>') && !unsafe.includes('<img ') && !unsafe.includes('<sup style'));
assert(unsafe.includes('&lt;script&gt;') && unsafe.includes('Mg<sup>2+</sup>'));
assert.equal((render('<sup>'.repeat(100) + '2+' + '</sup>'.repeat(100)).match(/<sup>/g) || []).length, 16, 'bound presentation depth for untrusted documents');
assert(api.patentTextHtml(chemical).includes('Fe(OH)<sub>3</sub>'));
assert(api.patentTextHtml('&lt;script&gt;alert(1)&lt;/script&gt;').includes('&lt;script&gt;'));

let html = render('Mg<sup>2+</sup> 이온과 Fe(OH)<sub>3</sub>를 제거한다.', { excerpt: 'Mg2+ 이온과 Fe(OH)3' });
assert(!html.includes('&lt;sup') && html.includes('<sup><mark class="evidence-highlight">2+</mark></sup>'));
assert(html.includes('<sub><mark class="evidence-highlight">3</mark></sub>'));
html = render(chemical, { excerpt: 'Mg<sup>2+</sup>' });
assert(html.includes('evidence-highlight') && !html.includes('search-highlight'));
html = render('Ni<sup>2+</sup> 및 Ni<sup>2+</sup>', { query: 'Ni2+' });
assert.equal((html.match(/<sup><mark class="search-highlight">2\+<\/mark><\/sup>/g) || []).length, 2);
html = render(chemical, { excerpt: '근거와 불일치', query: 'Fe3+' });
assert(html.includes('search-highlight') && !html.includes('evidence-highlight'));
html = render(chemical, { excerpt: 'Mg2+, Fe3+, Fe(OH)3 및 Al(OH)3를 처리한다. 추가 문언' });
assert(!html.includes('<mark'), 'do not highlight a partial, nonmatching excerpt');
html = renderToStaticMarkup(createElement(api.OriginalHighlight, { text: chemical, excerpt: 'Fe(OH)3' }));
assert(html.includes('<sub><mark class="evidence-highlight">3</mark></sub>'));

// Diff styles and chemical formatting must survive each other, not break tags.
html = renderToStaticMarkup(createElement(api.ClaimChangeMarkup, { segments: [
  { type: 'unchanged', text: 'Ni<sup>' }, { type: 'inserted', text: '2+' }, { type: 'unchanged', text: '</sup>' },
  { type: 'lineBreak', text: '\n' }, { type: 'deleted', text: 'Fe(OH)<sub>3</sub>' },
] }));
assert(html.includes('<sup><ins>2+</ins></sup>') && html.includes('<del>Fe(OH)</del><del><sub>3</sub></del>'));
assert(!html.includes('&lt;sup') && html.includes('\n'));
const changes = api.parseClaimChangeHistoryXml(`<response><body><amendmentHistoryDetailInfo>
  <applicationNumber>1020240093843</applicationNumber><receiptSendSerialNumber>1</receiptSendSerialNumber>
  <receiptSendNumber>112025000000001</receiptSendNumber><petitionclauseNumber>1</petitionclauseNumber><changeTypeCode>I</changeTypeCode>
  <petitionclause>Fe(OH)<sub>3</sub> 및 Ni<sup>2+</sup> 이온</petitionclause>
  <transferPetitionclause>Ni<sup><ins>2+</ins></sup> 및 Fe(OH)<sub>3</sub></transferPetitionclause>
</amendmentHistoryDetailInfo></body></response>`);
assert.equal(changes.documents[0].changes[0].claimText, 'Fe(OH)<sub>3</sub> 및 Ni<sup>2+</sup> 이온');
html = renderToStaticMarkup(createElement(api.ClaimChangeMarkup, { segments: changes.documents[0].changes[0].changeSegments }));
assert(html.includes('<ins><sup>2+</sup></ins>') && html.includes('<sub>3</sub>'));
// Exact public claims from the reported case, read only from the cached original.
const actualXml = await readFile(path.join(root, 'scripts/fixtures/1020230100001-claims.xml'), 'utf8');
const actual = api.normalizeFullTextXml(actualXml, '1020230100001', 'claims.xml');
assert.equal(actual.claims.length, 9);
assert(actual.claims[0].text.startsWith('석유화학 정제공정에서'), 'charges must not be collected before the claim');
assert(actual.claims[0].text.includes('Mg<sup>2+</sup>, Ca<sup>2+</sup>, Fe<sup>3+</sup>'));
assert(actual.claims[0].text.includes('Fe(OH)<sub>3</sub>와 Al(OH)<sub>3</sub>'));
assert.equal((actual.claims[0].text.match(/<sup>/g) || []).length, 14);
assert.equal((actual.claims[0].text.match(/<sub>/g) || []).length, 2);
assert(actual.claims[2].text.startsWith('제 1 항에 있어서,\n'));
const relationship = api.analyzeClaims(actual.claims);
assert.equal(relationship.filter((claim) => claim.isIndependent).length, 1);
assert.equal(relationship.filter((claim) => !claim.isIndependent).length, 8);
assert.deepEqual(relationship[2].directReferences, [1]);
assert.deepEqual(relationship[6].directReferences, [6]);
assert.deepEqual(relationship[7].directReferences, [6]);
const mixed = api.normalizeFullTextXml('<patent><claims><claim num="1"><claim-text>기본 장치.</claim-text></claim><claim num="2"><claim-text>제<claim-ref idref="claim-0001">1</claim-ref>항에 있어서, Fe<sup>2+</sup> 및 Al(OH)<sub>3</sub>를 처리한다.</claim-text></claim></claims></patent>', 'fixture', 'mixed.xml');
assert.equal(mixed.claims[1].text, '제1항에 있어서, Fe<sup>2+</sup> 및 Al(OH)<sub>3</sub>를 처리한다.');
assert.deepEqual(mixed.claims[1].referenceNumbers, [1]);
const namespaced = api.normalizeFullTextXml('<k:patent xmlns:k="urn:test"><k:abstract><k:p num="1">Fe<k:sup>2+</k:sup> 이온<br/>둘째 줄</k:p></k:abstract><k:claims><k:claim num="1"><k:claim-text><![CDATA[Zn<sup>2+</sup>]]></k:claim-text><k:claim-text> 및 Fe(OH)&lt;sub&gt;3&lt;/sub&gt;</k:claim-text></k:claim></k:claims></k:patent>', 'fixture', 'mixed.xml');
assert.equal(namespaced.abstract[0].text, 'Fe<sup>2+</sup> 이온\n둘째 줄');
assert.equal(namespaced.abstract[0].number, '0001');
assert.equal(namespaced.claims[0].text, 'Zn<sup>2+</sup>\n및 Fe(OH)<sub>3</sub>');
console.log('Actual 10-2023-0100001 regression passed: 9 claims, charge positions preserved, 1 independent/8 dependent claims, claims 7–8 depend on claim 6.');
const originalFetch = globalThis.fetch;
const cacheRequests = [];
try {
  globalThis.fetch = async (url) => {
    cacheRequests.push(String(url));
    return Response.json({ ...actual, parserVersion: cacheRequests.length === 1 ? 'fulltext-xml-v2' : api.FULLTEXT_PARSER_VERSION });
  };
  assert.equal((await api.fetchFullText(actual.applicationNumber, false, true)).parserVersion, 'fulltext-xml-v2');
  assert.equal((await api.fetchFullText(actual.applicationNumber, false, true)).parserVersion, api.FULLTEXT_PARSER_VERSION);
  await api.fetchFullText(actual.applicationNumber, false, true);
  assert.equal(cacheRequests.length, 2, 'old client parser cache must be replaced, new parser cache reused');
  assert(cacheRequests.every((url) => url.includes('cachedOnly=true') && !url.includes('refresh=true')));
  globalThis.fetch = async (url) => { cacheRequests.push(String(url)); return Response.json({ error: '저장된 XML 원문이 없습니다.' }, { status: 404 }); };
  await assert.rejects(api.fetchFullText('1020230100002', false, true), /저장된 XML/);
  assert.equal(cacheRequests.length, 3, 'a cache miss must not trigger a second/provider request');
} finally { globalThis.fetch = originalFetch; api.invalidateFullText(actual.applicationNumber); }
console.log('Patent text regression passed: safe raw/encoded sup+sub, breaks, visible-text search/evidence highlights, report HTML and amendment diffs.');

if (process.argv.includes('--preview')) {
  const { createServer } = await import('node:http');
  const directory = path.join(root, 'dist/client/_next/static/css');
  const name = (await readdir(directory)).find((file) => file.startsWith('index.') && file.endsWith('.css'));
  assert(name, 'run npm run build before starting the visual fixture');
  const css = await readFile(path.join(directory, name), 'utf8');
  const claim = actual.claims[0].text;
  const fixture = createServer((request, response) => {
    if (request.url === '/style.css') { response.writeHead(200, { 'content-type': 'text/css; charset=utf-8' }); response.end(css); return; }
    if (request.url !== '/') { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    response.end(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>10-2023-0100001 · 파싱 검증</title><link rel="stylesheet" href="/style.css"><style>.text-fixture{max-width:960px;margin:24px auto;padding:0 20px}.text-fixture header{margin-bottom:20px}.text-fixture h1{font-size:24px}.text-fixture p{font-size:18px;line-height:1.9}</style></head><body><main class="text-fixture"><header><small>로컬 검증 · 저장된 원문 · API 미사용 · ${api.FULLTEXT_PARSER_VERSION}</small><h1>10-2023-0100001</h1><p>독립항 1개 · 종속항 8개</p></header><div class="original-document-viewer"><section><h3>청구항 1</h3><article class="original-paragraph"><p>${render(claim)}</p></article></section><section><h3>청구항 3 · 제1항 인용</h3><article class="original-paragraph"><p>${render(actual.claims[2].text)}</p></article></section></div></main></body></html>`);
  });
  fixture.listen(0, '127.0.0.1', () => console.log(`Text visual fixture: http://127.0.0.1:${fixture.address().port}/`));
}
