import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {
  classifyDocumentRows, documentFilename, DocumentTaskCancelled, packAndSaveArchive,
  canCancelArchive, documentErrorMessage, documentResponseMessage, DocumentDownloadError,
} from '../app/lib/document-jobs.ts';
import { chooseSaveFile, writeChosenFile, fileErrorMessage } from '../app/lib/save-file.ts';

test('formatted copies of one domestic document produce one request and one ZIP entry', async () => {
  const rows = classifyDocumentRows('10-2020-0093844\n1020200093844\n10 2020 0093844', 'application');
  assert.deepEqual(rows.map(row => row.classification), ['ready', 'duplicate', 'duplicate']);
  const ready = rows.filter(row => row.classification === 'ready');
  assert.equal(ready.length, 1);
  assert.equal(ready[0].original, '10-2020-0093844');
  assert.equal(ready[0].canonical, '1020200093844');
  const zip = new JSZip();
  ready.forEach(row => zip.file(documentFilename(row, 'application', 'publication'), '%PDF-mock'));
  const archive = await JSZip.loadAsync(await zip.generateAsync({ type: 'uint8array' }));
  assert.equal(Object.keys(archive.files).length, 1);
});

test('country prefix, kind-code variants and short/padded grant numbers share identity', () => {
  const publications = classifyDocumentRows('KR10-2022-0014141A\n1020220014141\nKR1020220014141A1', 'publication');
  assert.deepEqual(publications.map(row => row.classification), ['ready', 'duplicate', 'duplicate']);
  const grants = classifyDocumentRows('10-2345678\n1023456780000\nKR102345678B1', 'registration');
  assert.deepEqual(grants.map(row => row.classification), ['ready', 'duplicate', 'duplicate']);
  assert.equal(grants[0].canonical, '1023456780000');
});

test('foreign and malformed rows do not remove valid domestic rows', () => {
  const rows = classifyDocumentRows('KR1020220014141A\nUS20230000001A1\nEP4000000A1\n틀린 번호', 'publication');
  assert.deepEqual(rows.map(row => row.classification), ['ready', 'foreign', 'foreign', 'invalid']);
  assert.equal(rows.filter(row => row.classification === 'ready').length, 1);
});

test('number type is explicit and an incompatible publication code is not guessed', () => {
  assert.equal(classifyDocumentRows('10-2020-0093844', '')[0].classification, 'needs-type');
  assert.equal(classifyDocumentRows('KR1020220014141A1', 'application')[0].classification, 'invalid');
  assert.equal(classifyDocumentRows('KR1020220014141B1', 'publication')[0].classification, 'invalid');
});

test('unique canonical documents have unique stable archive filenames', () => {
  const rows = classifyDocumentRows('10-2020-0093844\n10-2020-0093845', 'application');
  const names = rows.map(row => documentFilename(row, 'application', 'publication'));
  assert.equal(new Set(names).size, 2);
  assert.equal(names[0], '출원번호_1020200093844_공개공보.pdf');
});

test('cancel before packing never packs or saves', async () => {
  const controller = new AbortController(); controller.abort();
  let calls = 0;
  await assert.rejects(packAndSaveArchive({ signal: controller.signal, pack: async () => { calls++; return new Blob(); }, save: async () => { calls++; }, onStage: () => {} }), DocumentTaskCancelled);
  assert.equal(calls, 0);
});

test('cancel while packing prevents the final save even if packing finishes', async () => {
  const controller = new AbortController();
  const stages = []; let saves = 0;
  await assert.rejects(packAndSaveArchive({ signal: controller.signal, pack: async () => { controller.abort(); return new Blob(); }, save: async () => { saves++; }, onStage: stage => stages.push(stage) }), DocumentTaskCancelled);
  assert.equal(saves, 0);
  assert.deepEqual(stages, ['packing']);
});

test('packing progress checks cancellation and final saving is not advertised as cancellable', async () => {
  const controller = new AbortController();
  let saves = 0;
  await assert.rejects(packAndSaveArchive({ signal: controller.signal, pack: async onProgress => { controller.abort(); onProgress(); return new Blob(); }, save: async () => { saves++; }, onStage: () => {} }), DocumentTaskCancelled);
  assert.equal(saves, 0);
  assert.equal(canCancelArchive('collecting'), true);
  assert.equal(canCancelArchive('packing'), true);
  assert.equal(canCancelArchive('saving'), false);
  assert.equal(canCancelArchive('choosing'), false);
  const stages = [];
  const result = await packAndSaveArchive({ signal: new AbortController().signal, pack: async () => new Blob(), save: async () => 'saved', onStage: stage => stages.push(stage) });
  assert.equal(result, 'saved'); assert.deepEqual(stages, ['packing', 'saving']);
});

test('real JSZip packing stops before write when a progress callback observes cancellation', async () => {
  const controller = new AbortController();
  const zip = new JSZip(); zip.file('원문.pdf', new Uint8Array(1024 * 1024));
  let saves = 0;
  await assert.rejects(packAndSaveArchive({
    signal: controller.signal,
    pack: onProgress => zip.generateAsync({ type: 'blob', compression: 'STORE' }, () => { controller.abort(); onProgress(); }),
    save: async () => { saves++; }, onStage: () => {},
  }), DocumentTaskCancelled);
  assert.equal(saves, 0);
});

test('technical/English errors map to Korean recovery messages without credentials', () => {
  assert.match(documentErrorMessage(new DOMException('signal timed out', 'TimeoutError')), /잠시 후 다시 시도/);
  const secret = documentErrorMessage(new Error('Cloudflare Worker Secret에 KIPRIS_API_KEY를 설정해 주세요.'));
  assert.match(secret, /관리자/); assert(!secret.includes('KIPRIS_API_KEY'));
  const rawUrl = documentErrorMessage(new Error('자료 https://example.com/file?token=private-token 을 확인해 주세요.'));
  assert(!rawUrl.includes('private-token')); assert(!rawUrl.includes('example.com'));
  assert.match(documentErrorMessage(new Error('Failed to fetch')), /연결 상태.*다시 시도/);
  assert.match(fileErrorMessage(new DOMException('denied', 'NotAllowedError')), /다른 폴더/);
});

test('HTTP errors distinguish a missing lookup, unavailable PDF, permission, rate limit and time limit', () => {
  assert.match(documentResponseMessage(404, '문헌번호와 정확히 일치하는 출원을 확인하지 못했습니다.', 'publication'), /출원을 찾지 못했습니다.*번호/);
  assert.match(documentResponseMessage(404, '전문 PDF가 제공되지 않습니다.', 'registration'), /등록공보 PDF.*문헌 검색/);
  assert.match(documentResponseMessage(403, 'Forbidden', 'publication'), /관리자.*권한/);
  assert.match(documentResponseMessage(429, 'Too many requests', 'publication'), /요청이 많습니다.*잠시 후/);
  assert.match(documentResponseMessage(504, 'Gateway timeout', 'publication'), /시간.*다시 시도/);
  for (const status of [400, 401, 403, 404, 408, 413, 429, 500, 502, 503, 504]) {
    const message = documentResponseMessage(status, 'Cloudflare accessKey=secret ServiceKey=private', 'publication');
    assert(!/secret|private|Cloudflare|accessKey|ServiceKey/.test(message));
    assert.match(message, /확인|요청|시도/);
  }
  const safe = new DocumentDownloadError(documentResponseMessage(503, '', 'publication'));
  assert.equal(documentErrorMessage(safe), safe.message, 'classified user error keeps its specific recovery action');
});

test('native picker cancellation makes no file write; unsupported picker can fall back', async () => {
  let writes = 0;
  globalThis.window = { showSaveFilePicker: async () => { throw new DOMException('cancel', 'AbortError'); } };
  assert.equal(await chooseSaveFile('test.pdf', 'application/pdf', 'pdf'), null);
  globalThis.window = { showSaveFilePicker: async () => { throw new DOMException('iframe', 'SecurityError'); }, prompt: () => '새 이름' };
  const destination = await chooseSaveFile('test.pdf', 'application/pdf', 'pdf');
  assert.equal(destination.filename, '새 이름.pdf'); assert.equal(destination.handle, null);
  const handle = { name: 'test.pdf', createWritable: async () => ({ write: async () => { writes++; }, close: async () => {}, abort: async () => {} }) };
  const message = await writeChosenFile({ filename: 'test.pdf', handle }, new Blob(['%PDF-']));
  assert.equal(writes, 1); assert.match(message, /저장했습니다/);
  delete globalThis.window;
});
