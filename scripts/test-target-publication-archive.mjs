import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import JSZip from 'jszip';
import { createRequire } from 'node:module';
import * as jobs from '../app/lib/document-jobs.ts';

const source = fs.readFileSync(new URL('../app/lib/target-publication-archive.ts', import.meta.url), 'utf8');
const module = { exports: {} };
vm.runInThisContext(`(function(require,module,exports){${ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText}\n})`)(id => {
  if (id === './document-jobs') return jobs;
  throw new Error('Unexpected dependency: ' + id);
}, module, module.exports);
const { uniquePublicationTargets, collectTargetPublications } = module.exports;
const numbers = ['10-2020-0000001', '1020200000001', '10-2020-0000002', '10-2020-0000003'];
assert.equal(uniquePublicationTargets(numbers).length, 3);
const zip = new JSZip(); const calls = [], progress = [];
const outcomes = await collectTargetPublications({
  applicationNumbers: numbers, signal: new AbortController().signal,
  fetchPdf: async number => { calls.push(number); if (number.endsWith('2')) throw new jobs.DocumentDownloadError('선택한 공개공보 PDF가 제공되지 않습니다.'); return new Blob(['%PDF-1.7\n' + number]); },
  addFile: (name, blob) => zip.file(name, blob.arrayBuffer()),
  onProgress: (completed, total) => progress.push([completed, total]),
});
assert.equal(calls.length, 3); assert.equal(outcomes.filter(item => item.success).length, 2);
assert.equal(outcomes[1].success, false); assert.match(outcomes[1].message, /제공되지/);
assert.deepEqual(progress, [[1, 3], [2, 3], [3, 3]]);
const archive = await JSZip.loadAsync(await zip.generateAsync({ type: 'uint8array' }));
assert.deepEqual(Object.keys(archive.files).sort(), ['1020200000001_공개공보.pdf', '1020200000003_공개공보.pdf']);
assert.match(await archive.file('1020200000003_공개공보.pdf').async('string'), /^%PDF-/);
const cancelled = new AbortController(); let cancelledAdds = 0, cancelledCalls = 0;
await assert.rejects(collectTargetPublications({
  applicationNumbers: numbers, signal: cancelled.signal,
  fetchPdf: async () => { cancelledCalls++; cancelled.abort(); return new Blob(['%PDF-1.7']); },
  addFile: () => cancelledAdds++, onProgress() {},
}), jobs.DocumentTaskCancelled);
assert.equal(cancelledCalls, 1); assert.equal(cancelledAdds, 0);
const preCancelled = new AbortController(); preCancelled.abort();
await assert.rejects(collectTargetPublications({ applicationNumbers: numbers, signal: preCancelled.signal, fetchPdf: async () => { throw new Error('must not fetch'); }, addFile() {}, onProgress() {} }), jobs.DocumentTaskCancelled);
assert.deepEqual(await collectTargetPublications({ applicationNumbers: [], signal: new AbortController().signal, fetchPdf: async () => { throw new Error('must not fetch'); }, addFile() {}, onProgress() {} }), []);

// Exercise the UI's save chooser, refresh option, cancellation and final save wiring.
const require = createRequire(import.meta.url);
async function runComponent({ refresh = false, cancelChoice = false, failures = false } = {}) {
  const calls = [], files = [], writes = [];
  let stateIndex = 0, saved = 0, choiceCalls = 0, done;
  const finished = new Promise(resolve => { done = resolve; });
  class TestZip {
    file(name) { files.push(name); }
    async generateAsync(_, progress) { progress(); return new Blob(['zip']); }
  }
  const source = fs.readFileSync(new URL('../app/components/target-publication-archive.tsx', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const componentModule = { exports: {} };
  vm.runInThisContext(`(function(require,module,exports){${compiled}\n})`)(id => {
    if (id === 'react') return {
      useState(initial) { const index = stateIndex++; return [index === 0 ? refresh : initial, value => { writes.push([index, value]); if (index === 1 && value === 'idle') done(); }]; },
      useEffect() {}, useRef: value => ({ current: value }), useId: () => 'archive-test',
    };
    if (id === 'react/jsx-runtime') return require(id);
    if (id === './pdf-download') return { fetchPdf: async (...args) => { calls.push(args); if (failures) throw new jobs.DocumentDownloadError('공개공보 PDF가 제공되지 않습니다.'); return new Blob(['%PDF-1.7']); } };
    if (id === '../lib/target-publication-archive') return module.exports;
    if (id === '../lib/document-jobs') return jobs;
    if (id === '../lib/save-file') return { cleanFilename: value => value, chooseSaveFile: async () => { choiceCalls++; return cancelChoice ? null : { filename: 'all.zip', handle: null }; }, writeChosenFile: async () => { saved++; return '다운로드 요청 완료'; }, fileErrorMessage: () => '저장 오류', SaveFileError: class extends Error {} };
    if (id === 'jszip') return TestZip;
    if (id.endsWith('.css')) return {};
    throw new Error('Unexpected component import: ' + id);
  }, componentModule, componentModule.exports);
  const tree = componentModule.exports.default({ applicationNumbers: numbers, monthId: '2026-10', bureau: '기획국' });
  const controls = tree.props.children[0].props.children;
  assert.equal(controls[1].props.children[0].props.checked, refresh);
  controls[0].props.onClick();
  await finished;
  return { calls, files, writes, saved, choiceCalls };
}
const cachedBundle = await runComponent();
assert.equal(cachedBundle.calls.length, 3); assert.equal(cachedBundle.saved, 1);
assert(cachedBundle.calls.every(args => args[1] === 'publication' && args[2] === 'application' && args[4] === false));
assert(cachedBundle.files.includes('다운로드 결과.txt'));
assert((await runComponent({ refresh: true })).calls.every(args => args[4] === true));
const cancelledChoice = await runComponent({ cancelChoice: true });
assert.equal(cancelledChoice.calls.length, 0); assert.equal(cancelledChoice.saved, 0);
const unavailableBundle = await runComponent({ failures: true });
assert.equal(unavailableBundle.saved, 0);
assert.equal(unavailableBundle.writes.findLast(([index]) => index === 4)[1].length, 3);
console.log('Target archive passed: all assigned targets, normalized deduplication, actual ZIP entries, partial failures, progress and cancellation without saving.');
