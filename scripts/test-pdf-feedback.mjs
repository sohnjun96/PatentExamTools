import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { extname } from 'node:path';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transferPdf, fetchPdfResponse, PdfTransferFailure } from '../app/lib/pdf-transfer.ts';
import { createErrorToast, errorToastReducer, MAX_ERROR_TOASTS } from '../app/lib/error-toasts.ts';
import { DocumentDownloadError, documentErrorMessage, documentResponseMessage } from '../app/lib/document-jobs.ts';
import { chooseSaveFile, writeChosenFile, fileErrorMessage, SaveFileError } from '../app/lib/save-file.ts';

const requestOptions = {
  responseError: (status, message) => new DocumentDownloadError(documentResponseMessage(status, message, 'publication')),
  invalidPdfError: () => new DocumentDownloadError('PDF 원문을 확인할 수 없습니다. 다시 시도해 주세요. 계속되면 관리자에게 문헌번호를 알려 주세요.'),
};
const destination = { filename: '문헌_공개공보.pdf', handle: {} };
const defaults = { choose: async () => destination, fetch: async () => new Blob(['%PDF-1.7\n']), save: async () => '저장했습니다.', isActive: () => true, onStage: () => {} };
async function withFetch(fetcher, action) {
  const previous = globalThis.fetch; globalThis.fetch = fetcher;
  try { return await action(); } finally { globalThis.fetch = previous; }
}

test('successful verified PDF keeps original bytes and saved/requested statuses', async () => {
  const stages = [];
  const result = await withFetch(async () => new Response('%PDF-1.7\n원문'), () => transferPdf({
    ...defaults, onStage: stage => stages.push(stage), fetch: () => fetchPdfResponse('/local-pdf', requestOptions),
    save: async (chosen, blob) => { assert.equal(chosen.filename, destination.filename); assert.equal(await blob.text(), '%PDF-1.7\n원문'); return '선택한 폴더에 저장했습니다.'; },
  }));
  assert.equal(result.status, 'saved');
  assert.deepEqual(stages, ['choosing', 'loading', 'saving']);
  const requested = await transferPdf({ ...defaults, choose: async () => ({ ...destination, handle: null }) });
  assert.equal(requested.status, 'requested');
});

test('save picker is invoked synchronously in the original click gesture', async () => {
  let chosen = false;
  const work = transferPdf({ ...defaults, choose: () => { chosen = true; return Promise.resolve(null); } });
  assert.equal(chosen, true);
  assert.equal((await work).status, 'cancelled');
});

test('native picker cancellation never fetches, writes or enters the error path', async () => {
  const previous = globalThis.window;
  globalThis.window = { showSaveFilePicker: async () => { throw new DOMException('user cancelled', 'AbortError'); } };
  let fetched = 0; let written = 0; let errors = 0;
  try {
    const result = await transferPdf({ ...defaults,
      choose: () => chooseSaveFile('문헌.pdf', 'application/pdf', 'pdf'),
      fetch: async () => { fetched++; return new Blob(); }, save: async () => { written++; return ''; },
    }).catch(error => { errors++; throw error; });
    assert.equal(result.status, 'cancelled');
    assert.equal(fetched, 0); assert.equal(written, 0); assert.equal(errors, 0);
  } finally { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; }
});

test('a picker AbortError is cancellation even if a picker adapter throws directly', async () => {
  const result = await transferPdf({ ...defaults, choose: async () => { throw new DOMException('cancel', 'AbortError'); } });
  assert.equal(result.status, 'cancelled');
});

test('unavailable PDF preserves the Korean recovery action for the error toast', async () => {
  await withFetch(async () => Response.json({ error: '전문 PDF가 제공되지 않습니다.' }, { status: 404 }), async () => {
    await assert.rejects(transferPdf({ ...defaults, fetch: () => fetchPdfResponse('/pdf', requestOptions) }), error => {
      assert(error instanceof PdfTransferFailure);
      assert.equal(error.stage, 'loading');
      const message = documentErrorMessage(error.originalError);
      assert.match(message, /공개공보 PDF가 제공되지 않습니다.*문헌번호.*문헌 검색/);
      const toast = createErrorToast({ documentNumber: '10-2020-0093844', documentKind: '공개공보', message });
      assert.equal(toast.documentNumber, '10-2020-0093844'); assert.equal(toast.message, message);
      return true;
    });
  });
});

test('HTML advertised as PDF is rejected before any write', async () => {
  let writes = 0;
  await withFetch(async () => new Response('<html>upstream failure</html>', { headers: { 'Content-Type': 'application/pdf' } }), async () => {
    await assert.rejects(transferPdf({ ...defaults, fetch: () => fetchPdfResponse('/pdf', requestOptions), save: async () => { writes++; return ''; } }), error => {
      assert(error instanceof PdfTransferFailure); assert.equal(error.stage, 'loading');
      assert.match(documentErrorMessage(error.originalError), /PDF 원문.*다시 시도/); return true;
    });
  });
  assert.equal(writes, 0);
});

test('network and malformed HTTP errors remain user-facing Korean messages', async () => {
  await withFetch(async () => { throw new TypeError('Failed to fetch https://private.test?accessKey=secret'); }, async () => {
    await assert.rejects(transferPdf({ ...defaults, fetch: () => fetchPdfResponse('/pdf', requestOptions) }), error => {
      const message = documentErrorMessage(error.originalError);
      assert.match(message, /연결 상태.*다시 시도/); assert(!/secret|accessKey|private/.test(message)); return true;
    });
  });
  await withFetch(async () => Response.json({ error: 123 }, { status: 502 }), async () => {
    await assert.rejects(fetchPdfResponse('/pdf', requestOptions), error => error instanceof DocumentDownloadError && /다시 시도/.test(error.message));
  });
});

test('a denied save location reports a saving failure and aborts the incomplete write', async () => {
  let aborts = 0;
  const handle = { name: '문헌.pdf', createWritable: async () => ({
    write: async () => { throw new DOMException('permission revoked', 'NotAllowedError'); },
    close: async () => {}, abort: async () => { aborts++; },
  }) };
  await assert.rejects(transferPdf({ ...defaults, choose: async () => ({ filename: handle.name, handle }), save: writeChosenFile }), error => {
    assert(error instanceof PdfTransferFailure); assert.equal(error.stage, 'saving');
    assert(error.originalError instanceof SaveFileError);
    assert.match(fileErrorMessage(error.originalError), /다른 폴더.*다시 시도/); return true;
  });
  assert.equal(aborts, 1);
});

test('choosing failures are distinguished from network failures', async () => {
  await assert.rejects(transferPdf({ ...defaults, choose: async () => { throw new Error('picker failed'); } }), error => {
    assert.equal(error.stage, 'choosing');
    assert.match(fileErrorMessage(error.originalError), /저장 위치.*공간/); return true;
  });
});

test('leaving the page while a request finishes prevents saving and error feedback', async () => {
  let active = true; let writes = 0;
  const result = await transferPdf({ ...defaults, isActive: () => active,
    fetch: async () => { active = false; return new Blob(['%PDF-']); }, save: async () => { writes++; return ''; },
  });
  assert.equal(result.status, 'cancelled'); assert.equal(writes, 0);
});

test('identical failed retries create distinct alerts; stack stays bounded and dismissible', () => {
  const input = { documentNumber: '10-2020-0093844', documentKind: '공개공보', message: '다시 시도해 주세요.' };
  const first = createErrorToast(input); const second = createErrorToast(input);
  assert.notEqual(first.id, second.id);
  let state = errorToastReducer([], { type: 'add', toast: first });
  state = errorToastReducer(state, { type: 'add', toast: second });
  assert.equal(state.length, 2);
  state = errorToastReducer(state, { type: 'dismiss', id: first.id });
  assert.deepEqual(state.map(toast => toast.id), [second.id]);
  for (let i = 0; i < 12; i++) state = errorToastReducer(state, { type: 'add', toast: createErrorToast(input) });
  assert.equal(state.length, MAX_ERROR_TOASTS);
  assert.equal(new Set(state.map(toast => toast.id)).size, MAX_ERROR_TOASTS);
  for (const toast of state) state = errorToastReducer(state, { type: 'dismiss', id: toast.id });
  assert.deepEqual(state, []);
});

// Node strips .ts, while this small loader lets the same real TSX component be
// server-rendered without adding a DOM test dependency or changing product code.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
      const url = new URL(specifier, context.parentURL);
      if (!extname(fileURLToPath(url))) {
        for (const suffix of ['.ts', '.tsx']) if (existsSync(fileURLToPath(url) + suffix)) return nextResolve(url.href + suffix, context);
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith('.css')) return { format: 'module', source: 'export default {};', shortCircuit: true };
    if (url.endsWith('.tsx')) return { format: 'module', source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText, shortCircuit: true };
    return nextLoad(url, context);
  },
});

test('real PDF button renders with and without a provider; no duplicate initial alert', async () => {
  const { default: PdfDownloadButton } = await import('../app/components/pdf-download.tsx');
  const { ErrorToastProvider } = await import('../app/components/error-toast.tsx');
  const button = React.createElement(PdfDownloadButton, { applicationNumber: '10-2020-0093844' });
  const standalone = renderToStaticMarkup(button);
  assert.match(standalone, /10-2020-0093844 공개공보 PDF 받기/);
  const provided = renderToStaticMarkup(React.createElement(ErrorToastProvider, null, button));
  assert.match(provided, /PDF 받기/);
  assert(!provided.includes('role="alert"'));
});

test('quick list download uses a safe filename and browser download without invoking either picker', async () => {
  const { choosePdfDestination, fetchPdf } = await import('../app/components/pdf-download.tsx');
  const previousWindow = globalThis.window; const previousDocument = globalThis.document;
  const previousCreateUrl = URL.createObjectURL; const previousRevokeUrl = URL.revokeObjectURL;
  let pickers = 0; let prompts = 0; let clicks = 0; let writes = 0; let downloadName = '';
  globalThis.window = {
    showSaveFilePicker: async () => { pickers++; throw new Error('quick download must not open a picker'); },
    prompt: () => { prompts++; throw new Error('quick download must not open a prompt'); },
    setTimeout: callback => { callback(); return 1; },
  };
  globalThis.document = {
    createElement: () => {
      writes++;
      return { href: '', download: '', click() { clicks++; downloadName = this.download; }, remove() {} };
    },
    body: { appendChild() {} },
  };
  URL.createObjectURL = () => 'blob:verified-pdf'; URL.revokeObjectURL = () => {};
  try {
    const choice = await choosePdfDestination('../../10-2020-0093844?bad=<>', 'publication', true);
    assert.equal(choice.handle, null);
    assert.equal(choice.filename, '10-2020-0093844bad_공개공보.pdf');
    assert(!/[<>:"/\\|?*]/.test(choice.filename));
    const result = await withFetch(async () => new Response('%PDF-1.7\n'), () => transferPdf({
      ...defaults, choose: () => choosePdfDestination('10-2020-0093844', 'publication', true),
      fetch: () => fetchPdf('10-2020-0093844', 'publication'), save: writeChosenFile,
    }));
    assert.equal(result.status, 'requested');
    assert.match(result.message, /다운로드를 요청했습니다/);
    assert.equal(downloadName, '10-2020-0093844_공개공보.pdf');
    assert.equal(pickers, 0); assert.equal(prompts, 0); assert.equal(clicks, 1); assert.equal(writes, 1);
  } finally {
    if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
    if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
    URL.createObjectURL = previousCreateUrl; URL.revokeObjectURL = previousRevokeUrl;
  }
});

test('quick download fetch failure performs zero writes and provides Korean toast feedback', async () => {
  const { choosePdfDestination, fetchPdf } = await import('../app/components/pdf-download.tsx');
  let writes = 0;
  await withFetch(async () => Response.json({ error: '등록공고 전문 PDF가 제공되지 않습니다.' }, { status: 404 }), async () => {
    await assert.rejects(transferPdf({ ...defaults,
      choose: () => choosePdfDestination('10-2020-0093844', 'registration', true),
      fetch: () => fetchPdf('10-2020-0093844', 'registration'),
      save: async () => { writes++; return ''; },
    }), error => {
      assert.equal(error.stage, 'loading');
      const message = documentErrorMessage(error.originalError);
      const toast = createErrorToast({ documentNumber: '10-2020-0093844', documentKind: '등록공보', message });
      assert.match(toast.message, /등록공보 PDF가 제공되지 않습니다.*문헌번호/);
      assert.equal(errorToastReducer([], { type: 'add', toast })[0].documentNumber, '10-2020-0093844');
      return true;
    });
  });
  assert.equal(writes, 0);
});

test('ordinary PDF buttons retain the chosen save location by default', async () => {
  const { choosePdfDestination } = await import('../app/components/pdf-download.tsx');
  const previous = globalThis.window;
  const handle = { name: '사용자가 선택한 파일.pdf' };
  let pickers = 0;
  globalThis.window = { showSaveFilePicker: async options => { pickers++; assert.equal(options.suggestedName, '10-2020-0093844_공개공보.pdf'); return handle; } };
  try {
    const chosen = await choosePdfDestination('10-2020-0093844', 'publication');
    assert.equal(chosen.handle, handle); assert.equal(chosen.filename, handle.name); assert.equal(pickers, 1);
  } finally { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; }
});
