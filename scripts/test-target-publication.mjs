import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
import * as saveFile from '../app/lib/save-file.ts';
import * as documentJobs from '../app/lib/document-jobs.ts';
import * as pdfTransfer from '../app/lib/pdf-transfer.ts';
import { createPatentDocumentService, parseDocumentRequest } from '../app/lib/patent-document.ts';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');
const toasts = [];
let notifyToast = () => {};
let nextId = 0;
let activeHooks = null;
function hookValue(initial) {
  const context = activeHooks;
  if (!context) return [initial, () => {}];
  const index = context.cursor++;
  if (!(index in context.values)) context.values[index] = initial;
  return [context.values[index], next => { context.values[index] = next; }];
}
const hooks = {
  useState: hookValue,
  useEffect: () => {},
  useRef: value => hookValue({ current: value })[0],
  useId: () => `pdf-test-${++nextId}`,
};
const cache = new Map();
function loadComponent(relative) {
  if (cache.has(relative)) return cache.get(relative);
  const filename = path.join(root, relative);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  const localRequire = id => {
    if (id === 'react') return hooks;
    if (id === 'react/jsx-runtime') return require(id);
    if (id === './pdf-download') return loadComponent('app/components/pdf-download.tsx');
    if (id === '../lib/save-file') return saveFile;
    if (id === '../lib/document-jobs') return documentJobs;
    if (id === '../lib/pdf-transfer') return pdfTransfer;
    if (id === './error-toast') return { useErrorToast: () => ({ enabled: true, showError: toast => { toasts.push(toast); notifyToast(toast); } }) };
    if (id.endsWith('.css')) return {};
    throw new Error(`Unexpected product import ${id}`);
  };
  vm.runInNewContext(compiled, { module, exports: module.exports, require: localRequire,
    URLSearchParams, AbortController, AbortSignal, TextDecoder, Blob, Error, console }, { filename });
  cache.set(relative, module.exports);
  return module.exports;
}
const PdfDownloadButton = loadComponent('app/components/pdf-download.tsx').default;
const TargetPublicationDownload = loadComponent('app/components/target-publication-download.tsx').default;

function descendants(element, output = []) {
  if (Array.isArray(element)) { element.forEach(value => descendants(value, output)); return output; }
  if (!element || typeof element !== 'object' || !element.props) return output;
  output.push(element); descendants(element.props.children, output); return output;
}
function targetButton(props) {
  const wrapper = TargetPublicationDownload(props);
  const control = descendants(wrapper).find(element => element.type === PdfDownloadButton);
  assert(control, 'The wrapper must delegate to the real PDF button.');
  const button = descendants(PdfDownloadButton(control.props)).find(element => element.type === 'button');
  return { wrapper, control, button };
}
function deadline(promise) {
  return Promise.race([promise, new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('PDF click did not finish')), 3000); timer.unref(); })]);
}

test('target wrapper fixes application/publication/quick props and includes its own target number', () => {
  for (const [number, context] of [['10-2020-0093844', 'list'], ['10-2021-0000022', 'detail']]) {
    const { wrapper, control, button } = targetButton({ applicationNumber: number, context,
      // Runtime callers cannot override the target with AI result or grant props.
      kind: 'registration', numberType: 'registration', documentNumber: 'KR102345678B1', selectedApplicationNumber: '10-1999-9999999', quickDownload: false });
    assert.equal(control.props.applicationNumber, number);
    assert.equal(control.props.numberType, 'application'); assert.equal(control.props.kind, 'publication');
    assert.equal(control.props.quickDownload, true);
    assert.equal(control.props.label, context === 'list' ? '공개공보 PDF 받기' : '대상 출원 공개공보 PDF');
    assert.equal(button.props['aria-label'], `대상 출원 ${number} 공개공보 PDF 받기`);
    assert(descendants(wrapper).some(element => element.props.className === 'pd-target-publication-context' && element.props.children.join('') === `대상 출원 ${number}`));
  }
});

test('real button clicks for two rows request their own target publications and keep matching filenames', async () => {
  const previousFetch = globalThis.fetch; const previousWindow = globalThis.window; const previousDocument = globalThis.document;
  const previousCreate = URL.createObjectURL; const previousRevoke = URL.revokeObjectURL;
  const requests = []; const filenames = []; let onWrite = () => {}; let pickers = 0;
  globalThis.fetch = async input => { requests.push(String(input)); return new Response('%PDF-1.7\noriginal published gazette'); };
  globalThis.window = { showSaveFilePicker: () => { pickers++; throw new Error('target download must be direct'); },
    prompt: () => { pickers++; throw new Error('target download must be direct'); }, setTimeout: callback => { callback(); return 1; } };
  globalThis.document = { body: { appendChild() {} }, createElement: () => ({ href: '', download: '', remove() {}, click() { filenames.push(this.download); onWrite(); } }) };
  URL.createObjectURL = () => 'blob:target-publication'; URL.revokeObjectURL = () => {};
  try {
    const numbers = ['10-2020-0093844', '10-2021-0000022'];
    for (const number of numbers) {
      const written = new Promise(resolve => { onWrite = resolve; });
      const { button } = targetButton({ applicationNumber: number, context: 'list' });
      button.props.onClick();
      await deadline(written);
    }
    assert.equal(requests.length, 2); assert.equal(pickers, 0);
    for (let index = 0; index < numbers.length; index++) {
      const url = new URL(requests[index], 'http://local.test');
      assert.equal(url.pathname, '/api/patent/document');
      assert.equal(url.searchParams.get('applicationNumber'), numbers[index]);
      assert.equal(url.searchParams.get('numberType'), 'application');
      assert.equal(url.searchParams.get('kind'), 'publication');
      assert.equal(url.searchParams.get('download'), '1');
      assert.equal(url.searchParams.has('documentNumber'), false);
      assert.equal(filenames[index], `${numbers[index]}_공개공보.pdf`);
      const parsed = parseDocumentRequest(url.searchParams);
      assert.equal(parsed.number, numbers[index].replace(/-/g, ''));
      assert.equal(parsed.numberType, 'application'); assert.equal(parsed.kind, 'publication');
    }
    assert.deepEqual(toasts, []);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
    if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
    URL.createObjectURL = previousCreate; URL.revokeObjectURL = previousRevoke;
  }
});

test('a target-publication click keeps the existing error toast for that target without writing a file', async () => {
  const previous = globalThis.fetch; let writes = 0;
  const previousDocument = globalThis.document;
  globalThis.document = { createElement: () => { writes++; throw new Error('an unavailable PDF must not be saved'); } };
  globalThis.fetch = async input => {
    const params = new URL(String(input), 'http://local.test').searchParams;
    assert.equal(params.get('applicationNumber'), '10-2021-0000022');
    assert.equal(params.get('kind'), 'publication');
    return Response.json({ error: '공개 전문 PDF가 제공되지 않습니다.' }, { status: 404 });
  };
  const reported = new Promise(resolve => { notifyToast = resolve; });
  try {
    targetButton({ applicationNumber: '10-2021-0000022', context: 'detail' }).button.props.onClick();
    const toast = await deadline(reported);
    assert.equal(toast.documentNumber, '10-2021-0000022'); assert.equal(toast.documentKind, '공개공보');
    assert.match(toast.message, /공개공보 PDF가 제공되지 않습니다.*문헌번호/);
    assert.equal(writes, 0);
  } finally {
    globalThis.fetch = previous; notifyToast = () => {};
    if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
  }
});

test('target feedback keeps independent progress, duplicate-click protection, failure and retry messages', async () => {
  const previousFetch = globalThis.fetch, previousWindow = globalThis.window, previousDocument = globalThis.document;
  const previousCreate = URL.createObjectURL, previousRevoke = URL.revokeObjectURL;
  const requests = [], writes = [];
  globalThis.fetch = input => new Promise(resolve => { requests.push({ input: String(input), resolve }); });
  globalThis.window = { setTimeout: callback => { callback(); return 1; } };
  globalThis.document = { body: { appendChild() {} }, createElement: () => ({ remove() {}, click() { writes.push(this.download); } }) };
  URL.createObjectURL = () => 'blob:target-feedback'; URL.revokeObjectURL = () => {};
  function instance(number) {
    const wrapper = TargetPublicationDownload({ applicationNumber: number, showContext: false });
    assert(!descendants(wrapper).some(element => element.props.className === 'pd-target-publication-context'));
    const control = descendants(wrapper).find(element => element.type === PdfDownloadButton);
    assert.equal(control.props.feedback, 'notice');
    const context = { values: [], cursor: 0 };
    let resolveStatus;
    const statuses = [];
    const props = { ...control.props, onStatusChange: (status, message) => { statuses.push({ status, message }); if (status !== 'loading') resolveStatus?.(); } };
    return {
      statuses, done: () => new Promise(resolve => { resolveStatus = resolve; }),
      render() {
        activeHooks = context; context.cursor = 0;
        try {
          const tree = PdfDownloadButton(props), nodes = descendants(tree);
          return { button: nodes.find(element => element.type === 'button'), message: nodes.find(element => element.props.id && element.type === 'span') };
        } finally { activeHooks = null; }
      },
    };
  }
  const tick = () => new Promise(resolve => setImmediate(resolve));
  try {
    const first = instance('10-2023-0012931'), second = instance('10-2026-0123981');
    const originalButton = first.render().button;
    originalButton.props.onClick(); originalButton.props.onClick();
    let view = first.render();
    assert.equal(view.button.props.disabled, true); assert.equal(view.button.props['aria-busy'], true);
    assert.equal(view.message.props.role, 'status'); assert.match(view.message.props.children, /준비하고 있습니다/);
    assert.equal(second.render().message, undefined, 'An unrelated row must stay quiet.');
    second.render().button.props.onClick(); await tick();
    assert.equal(requests.length, 2, 'Repeated clicks must not create a second transfer for one row.');
    assert.match(first.render().message.props.children, /불러오고 있습니다/);
    assert.match(second.render().message.props.children, /불러오고 있습니다/);
    const firstDone = first.done(); requests[0].resolve(new Response('%PDF-1.7\nfirst')); await deadline(firstDone);
    view = first.render();
    assert.match(view.message.props.className, /is-success/); assert.match(view.message.props.children, /다운로드를 요청했습니다/);
    assert(!view.message.props.children.includes('10-2023-0012931'), 'Visible feedback must not repeat the application number.');
    assert(!view.message.props.children.includes('저장했습니다'), 'Browser handoff is not a confirmed disk save.');
    assert.equal(view.button.props.disabled, false); assert.match(second.render().message.props.children, /불러오고 있습니다/);
    const secondDone = second.done(); requests[1].resolve(Response.json({ error: '공개 전문 PDF가 제공되지 않습니다.' }, { status: 404 })); await deadline(secondDone);
    view = second.render(); assert.match(view.message.props.className, /is-error/); assert.match(view.message.props.children, /다시 시도|문헌번호/);
    assert.equal(view.button.props.disabled, false); assert.equal(toasts.at(-1).documentNumber, '10-2026-0123981');
    second.render().button.props.onClick(); await tick();
    assert.match(second.render().message.props.className, /is-info/); assert.match(second.render().message.props.children, /불러오고 있습니다/);
    const retried = second.done(); requests[2].resolve(new Response('%PDF-1.7\nsecond')); await deadline(retried);
    assert.match(second.render().message.props.className, /is-success/);
    assert.deepEqual(writes, ['10-2023-0012931_공개공보.pdf', '10-2026-0123981_공개공보.pdf']);
    assert.deepEqual(first.statuses.map(entry => entry.status), ['loading', 'requested']);
    assert.deepEqual(second.statuses.map(entry => entry.status), ['loading', 'error', 'loading', 'requested']);
  } finally {
    activeHooks = null; globalThis.fetch = previousFetch;
    if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
    if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
    URL.createObjectURL = previousCreate; URL.revokeObjectURL = previousRevoke;
  }
});

test('fictional targets stay disabled and public PDF proxy keeps the verified getPub operation', async () => {
  const { control, button } = targetButton({ applicationNumber: '10-2024-9000000', disabled: true });
  assert.equal(control.props.disabled, true); assert.equal(button.props.disabled, true);
  let metadataRequest;
  const service = createPatentDocumentService({ accessKey: 'test-rest', serviceKey: 'test-service', fetcher: async input => {
    metadataRequest = new URL(String(input));
    return new Response('<response><header><resultCode>00</resultCode></header><body><item><docName>1020200093844.pdf</docName><path>https://plus.kipris.or.kr/kiprisplusws/fileToss.jsp?arg=official</path></item></body></response>');
  } });
  const request = parseDocumentRequest(new URLSearchParams({ applicationNumber: '10-2020-0093844', numberType: 'application', kind: 'publication' }));
  await service.metadata(request);
  assert.equal(metadataRequest.pathname, '/kipo-api/kipi/patUtiModInfoSearchSevice/getPubFullTextInfoSearch');
  assert.equal(metadataRequest.searchParams.get('applicationNumber'), '1020200093844');
  assert.equal(metadataRequest.searchParams.get('ServiceKey'), 'test-service');
});
