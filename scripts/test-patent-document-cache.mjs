import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { Miniflare } from 'miniflare';
import * as documents from '../app/lib/patent-document.ts';

async function load(path, dependencies) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInThisContext(`(function(require,module,exports){${compiled}\n})`)(id => {
    if (id in dependencies) return dependencies[id];
    throw new Error('Unexpected dependency: ' + id);
  }, module, module.exports);
  return module.exports;
}

const mf = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("test") } }', compatibilityDate: '2026-05-01', d1Databases: { DB: 'pdf-cache-test' }, d1Persist: false });
try {
  const db = await mf.getD1Database('DB');
  const database = await load('../app/lib/db.ts', { '@/app/lib/runtime-env': { database: () => db } });
  const cacheModule = await load('../app/lib/patent-document-cache.ts', { '@/app/lib/db': database, '@/app/lib/patent-document': documents });
  const cache = cacheModule.patentDocumentCache;
  let metadataCalls = 0, fileCalls = 0, keyReads = 0, available = true, payload = '%PDF-1.7\nfirst';
  const upstream = async input => {
    if (!available) throw new Error('test upstream unavailable');
    const url = new URL(String(input));
    if (url.pathname.endsWith('fileToss.jsp')) { fileCalls++; return new Response(payload); }
    metadataCalls++;
    const number = url.searchParams.get('applicationNumber');
    return new Response(`<response><header><resultCode>00</resultCode></header><body><item><applicationNumber>${number}</applicationNumber><path>https://plus.kipris.or.kr/openapi/fileToss.jsp?arg=test</path></item></body></response>`);
  };
  class HttpError extends Error {}
  async function routeFor(patentDocumentCache = cache) {
    return load('../app/api/patent/document/route.ts', {
      'next/server': { NextResponse: { json: (data, options = {}) => new Response(JSON.stringify(data), { ...options, headers: { ...options.headers, 'Content-Type': 'application/json' } }) } },
      '@/app/lib/patent-document': { ...documents, createPatentDocumentService: options => documents.createPatentDocumentService({ ...options, fetcher: upstream }) },
      '@/app/lib/patent-document-cache': { patentDocumentCache },
      '@/app/lib/secrets': { getKiprisKey() { keyReads++; if (!available) throw new Error('test key unavailable'); return 'test-secret'; } },
      '@/app/lib/http': { HttpError }, '@/app/lib/kipris-usage': { recordKiprisApiCall() {} },
      '@/app/lib/db': database, '@/app/lib/runtime-env': { envValue: () => '' },
    });
  }
  let route = await routeFor();
  const request = query => ({ nextUrl: new URL('https://test/api/patent/document?' + query) });
  const query = 'applicationNumber=10-2020-0093844&kind=publication&download=1';
  const first = await route.GET(request(query));
  assert.equal(first.status, 200); assert.equal(first.headers.get('X-Document-Cache'), 'MISS');
  assert.equal(await first.text(), payload);
  assert.equal(metadataCalls, 1); assert.equal(fileCalls, 1);
  assert.equal((await database.getApiUsage(database.WORKSPACE_USER_ID)).total, 1);
  // A fresh cache instance simulates another worker: persistence, not a process-local memo.
  route = await routeFor(cacheModule.createPatentDocumentCache(database.appDatabase));
  available = false;
  const hit = await route.GET(request(query.replace('10-2020-0093844', '1020200093844')));
  assert.equal(hit.status, 200); assert.equal(hit.headers.get('X-Document-Cache'), 'HIT');
  assert.equal(await hit.text(), payload);
  assert.equal(keyReads, 1, 'A hit does not even require upstream credentials.');
  assert.equal(metadataCalls, 1); assert.equal(fileCalls, 1);
  assert.equal((await database.getApiUsage(database.WORKSPACE_USER_ID)).total, 1);
  const metadataHit = await route.GET(request(query + '&metadata=1'));
  assert.equal(metadataHit.status, 200);
  assert(!(JSON.stringify(await metadataHit.json()).includes('test-secret')));
  assert.equal(keyReads, 1);
  const failedRefresh = await route.GET(request(query + '&refresh=1'));
  assert.equal(failedRefresh.status, 502);
  assert.equal(failedRefresh.headers.get('X-Document-Failure-Stage'), 'source');
  assert(!(await failedRefresh.text()).includes('test-secret'), 'Source failures must not expose credential URLs.');
  assert.equal(await (await route.GET(request(query))).text(), payload, 'A failed refresh leaves the previous PDF intact.');
  available = true; payload = '%PDF-1.7\nupdated';
  const refresh = await route.GET(request(query + '&refresh=1'));
  assert.equal(refresh.headers.get('X-Document-Cache'), 'REFRESH'); assert.equal(await refresh.text(), payload);
  assert.equal(metadataCalls, 2); assert.equal(fileCalls, 2);
  assert.equal(await (await route.GET(request(query))).text(), payload);
  const registration = await route.GET(request(query.replace('kind=publication', 'kind=registration')));
  assert.equal(registration.headers.get('X-Document-Cache'), 'MISS'); await registration.arrayBuffer();
  assert.equal(metadataCalls, 3, 'Registration PDFs never collide with publication PDFs.');
  const invalid = await route.GET(request('applicationNumber=../../invalid'));
  assert.equal(invalid.status, 400); assert.equal(metadataCalls, 3);

  // Real D1 round-trip above the per-row size limit, streamed without whole-file reads.
  const bigRequest = { number: '1020200000001', numberType: 'application', kind: 'publication' };
  const bytes = new Uint8Array(3 * 1024 * 1024 + 17); bytes.fill(65); bytes.set(new TextEncoder().encode('%PDF-1.7\n'));
  const file = { applicationNumber: bigRequest.number, kind: bigRequest.kind, fileName: 'large.pdf', bytes };
  let loads = 0;
  const big = await cache.get(bigRequest, async () => { loads++; return file; });
  assert.deepEqual(new Uint8Array(await new Response(big.body()).arrayBuffer()), bytes);
  const counts = await db.prepare('SELECT COUNT(*) AS count, MAX(LENGTH(data_base64)) AS size FROM patent_document_chunks WHERE cache_key = ?').bind('publication:application:' + bigRequest.number).first();
  assert.equal(counts.count, 7); assert(counts.size < 2_000_000);
  const previous = await cache.find(bigRequest);
  const changedBytes = bytes.slice(); changedBytes[100] = 66;
  await cache.get(bigRequest, async () => ({ ...file, bytes: changedBytes }), true);
  assert.deepEqual(new Uint8Array(await new Response(previous.body()).arrayBuffer()), bytes, 'A concurrent refresh must not break a reader of the previous version.');
  const persisted = await cacheModule.createPatentDocumentCache(database.appDatabase).get(bigRequest, async () => { throw new Error('unexpected upstream'); });
  assert.deepEqual(new Uint8Array(await new Response(persisted.body()).arrayBuffer()), changedBytes);
  assert.equal(loads, 1);

  // Concurrent misses in one worker share one upstream download.
  const parallelRequest = { ...bigRequest, number: '1020200000002' };
  let parallelLoads = 0;
  const loader = async () => { parallelLoads++; return { ...file, applicationNumber: parallelRequest.number }; };
  const simultaneous = await Promise.all([cache.get(parallelRequest, loader), cache.get(parallelRequest, loader)]);
  assert.equal(parallelLoads, 1);
  for (const value of simultaneous) assert.equal((await new Response(value.body()).arrayBuffer()).byteLength, bytes.length);
  // A transaction failure must roll back its manifest and preserve an older good document.
  await db.exec("CREATE TRIGGER fail_cache_chunk BEFORE INSERT ON patent_document_chunks WHEN NEW.cache_key = 'publication:application:1020200000003' BEGIN SELECT RAISE(ABORT, 'simulated storage failure'); END");
  const failingRequest = { ...bigRequest, number: '1020200000003' };
  let fallbackLoads = 0;
  const fallbackLoader = async () => { fallbackLoads++; return { ...file, applicationNumber: failingRequest.number }; };
  const fallbacks = await Promise.all([cache.get(failingRequest, fallbackLoader), cache.get(failingRequest, fallbackLoader)]);
  assert.equal(fallbackLoads, 1, 'Cache failures must still share the source download.');
  for (const fallback of fallbacks) {
    assert.equal(fallback.cacheStatus, 'BYPASS');
    assert.deepEqual(new Uint8Array(await new Response(fallback.body()).arrayBuffer()), bytes, 'A failed cache write must deliver the verified original PDF.');
  }
  assert.equal(await cache.find(failingRequest), null);
  const fallbackResponse = await route.GET(request(query.replace('10-2020-0093844', '10-2020-0000003')));
  assert.equal(fallbackResponse.status, 200);
  assert.equal(fallbackResponse.headers.get('X-Document-Cache'), 'BYPASS');
  assert.equal(await fallbackResponse.text(), payload);
  await db.exec("CREATE TRIGGER fail_refresh_chunk BEFORE INSERT ON patent_document_chunks WHEN NEW.cache_key = 'publication:application:1020200000001' BEGIN SELECT RAISE(ABORT, 'simulated refresh failure'); END");
  const freshBytes = changedBytes.slice(); freshBytes[100] = 67;
  const failedWriteRefresh = await cache.get(bigRequest, async () => ({ ...file, bytes: freshBytes }), true);
  assert.equal(failedWriteRefresh.cacheStatus, 'BYPASS');
  assert.deepEqual(new Uint8Array(await new Response(failedWriteRefresh.body()).arrayBuffer()), freshBytes, 'A failed refresh must deliver the new source rather than the stale cache.');
  assert.deepEqual(new Uint8Array(await new Response((await cache.find(bigRequest)).body()).arrayBuffer()), changedBytes, 'A failed refresh must preserve the previous cached version.');
  const unavailableCache = cacheModule.createPatentDocumentCache(async () => { throw new Error('storage unavailable'); });
  const unavailable = await unavailableCache.get(failingRequest, fallbackLoader);
  assert.equal(unavailable.cacheStatus, 'BYPASS');
  assert.deepEqual(new Uint8Array(await new Response(unavailable.body()).arrayBuffer()), bytes);
  await assert.rejects(unavailableCache.get(failingRequest, async () => ({ ...file, applicationNumber: '1020209999999' })), /Invalid PDF cache input/);
  await assert.rejects(unavailableCache.get(failingRequest, async () => { throw new Error('source unavailable'); }), /source unavailable/);
  await assert.rejects(cache.get(bigRequest, async () => ({ ...file, bytes: new TextEncoder().encode('<html>not pdf</html>') }), true), /다른 형식/);
  assert.deepEqual(new Uint8Array(await new Response((await cache.find(bigRequest)).body()).arrayBuffer()), changedBytes);
  console.log('PDF cache passed: real D1 chunked persistence, cross-worker reuse, zero upstream calls on hits, metadata, forced refresh, failure/transaction safety, concurrent readers and separate gazette kinds.');
} finally { await mf.dispose(); }
