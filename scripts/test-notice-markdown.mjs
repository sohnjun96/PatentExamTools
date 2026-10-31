import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Markdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ts from 'typescript';
import { literatureLink } from '../app/lib/literature-link.ts';
import { LITERATURE_REPORT_TABLE_TEMPLATE } from '../app/lib/evaluation.ts';

const require = createRequire(import.meta.url);
const filename = path.resolve(import.meta.dirname, '../app/components/notice-markdown.tsx');
const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  fileName: filename,
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
});
const moduleRecord = { exports: {} };
const localRequire = id => {
  if (id === 'react-markdown') return { __esModule: true, default: Markdown, defaultUrlTransform };
  if (id === 'remark-gfm') return { __esModule: true, default: remarkGfm };
  if (id.endsWith('.css')) return {};
  return require(id);
};
vm.runInNewContext(outputText, { module: moduleRecord, exports: moduleRecord.exports, require: localRequire }, { filename });
const { default: NoticeMarkdown, noticeUrlTransform } = moduleRecord.exports;
const render = markdown => renderToStaticMarkup(React.createElement(NoticeMarkdown, { markdown }));

const html = render(`# 업무 공지

## 대상 선정

**중요** 내용을 *확인*하고 ~~이전 안내~~ 대신 \`새 안내\`를 따르세요.

- 첫 번째 안내
- 두 번째 안내

1. 출원 선정
2. 결과 등록

> 운영 기한을 확인해 주세요.

---

| 업무 | 기한 |
| --- | --- |
| 선정 | 10월 30일 |

\`\`\`text
긴 안내문
\`\`\`

- [x] 안내 확인
- [ ] 결과 등록

[운영 안내](https://example.com/guide) · [내부 링크](/기획국) · [문의](mailto:help@example.com)
`);
for (const expected of ['<h1>업무 공지</h1>', '<h2>대상 선정</h2>', '<strong>중요</strong>', '<em>확인</em>', '<del>이전 안내</del>', '<ul>', '<ol>', '<blockquote>', '<hr/>', '<table>', '<th>업무</th>', '<td>10월 30일</td>', '<pre><code class="language-text">긴 안내문', 'type="checkbox"']) {
  assert(html.includes(expected), `Expected markdown output: ${expected}`);
}
assert(html.includes('href="https://example.com/guide"'));
assert(html.includes('target="_blank" rel="noopener noreferrer"'));
assert(html.includes(' (새 창)'));
assert(html.includes(`href="/${encodeURIComponent('기획국')}"`));
assert(html.includes('href="mailto:help@example.com"'));
assert(html.includes('role="region" aria-label="공지사항 표" tabindex="0"'));

for (const url of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html;base64,AA==', 'vbscript:evil', 'file:///C:/private.txt', 'ftp://example.com', 'https://example.com/\u0001']) {
  assert.equal(noticeUrlTransform(url), '', `Unsafe link must be removed: ${url}`);
}
for (const url of ['https://example.com', 'http://example.com', 'mailto:help@example.com', '/기획국', '#section', './guide']) {
  assert.equal(noticeUrlTransform(url), url);
}
const unsafe = render(`[실행](javascript:alert%281%29)

[데이터](data:text/html;base64,AA==)

<script>alert('xss')</script>

<img src="https://tracking.example/pixel" onerror="alert(1)">

![업무 흐름](https://tracking.example/pixel.png)

[![첨부](https://tracking.example/nested.png)](https://example.com/guide)

\`<script>escaped</script>\`
`);
assert(!unsafe.includes('<script>'));
assert(!unsafe.includes('onerror='));
assert(!unsafe.includes('<img'));
assert(!unsafe.includes('tracking.example'));
assert(!unsafe.includes('href="javascript:'));
assert(!unsafe.includes('href="data:'));
assert(unsafe.includes('업무 흐름'));
assert(unsafe.includes('&lt;script&gt;escaped&lt;/script&gt;'));
assert.equal((unsafe.match(/<a /g) || []).length, 1, 'Image alt text inside a link must not create nested links.');
assert.equal(render('').includes('<div class="notice-markdown"></div>'), true);

function loadComponent(relative, dependencies) {
  const componentPath = path.resolve(import.meta.dirname, relative);
  const compiled = ts.transpileModule(fs.readFileSync(componentPath, 'utf8'), {
    fileName: componentPath,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const componentRecord = { exports: {} };
  vm.runInNewContext(compiled, { module: componentRecord, exports: componentRecord.exports, require(id) {
    if (id in dependencies) return dependencies[id];
    if (id.endsWith('.css')) return {};
    return require(id);
  } }, { filename: componentPath });
  return componentRecord.exports.default;
}
const AppIcon = loadComponent('../app/components/app-icon.tsx', {});
const LiteratureLink = loadComponent('../app/components/literature-link.tsx', { '@/app/lib/literature-link': { literatureLink }, './app-icon': { __esModule: true, default: AppIcon } });
const LiteratureReader = loadComponent('../app/evaluation/task/literature-reader.tsx', {
  '@/app/components/notice-markdown': { __esModule: true, default: NoticeMarkdown },
  '@/app/components/literature-link': { __esModule: true, default: LiteratureLink },
});
const reportTable = String.raw`## 구성 대비표

| 청구항 구성 | 선행문헌 대응 내용 | 근거 위치 |
| :--- | :---: | ---: |
| **검색 단계** | 검색 \| 판별 후 *결과 출력* | 문단 12 |
| 저장 단계 | [원문 근거](https://example.test/evidence) | 15쪽 |

기존 보고서의 마지막 문단입니다.`;
const document = { kind: 'patent', number: 'KR20100001234A', url: 'https://example.test/patent', reportMarkdown: reportTable };
for (const preview of [true, false]) {
  const rendered = renderToStaticMarkup(React.createElement(LiteratureReader, { document, preview }));
  assert(rendered.includes('<table>'), `The ${preview ? 'live preview' : 'published report'} must render a real table.`);
  assert(rendered.includes('<thead>'));
  assert(rendered.includes('<tbody>'));
  assert(rendered.includes('<th style="text-align:left">청구항 구성</th>'));
  assert(rendered.includes('<th style="text-align:center">선행문헌 대응 내용</th>'));
  assert(rendered.includes('<th style="text-align:right">근거 위치</th>'));
  assert(rendered.includes('<strong>검색 단계</strong>'));
  assert(rendered.includes('검색 | 판별 후 <em>결과 출력</em>'), 'An escaped pipe must remain inside its table cell.');
  assert(rendered.includes('href="https://example.test/evidence"'));
  assert(rendered.includes('role="region" aria-label="AI 검색 문헌 보고서 표" tabindex="0"'), 'Report tables must keep their own accessible scroll region label.');
  assert(rendered.includes('기존 보고서의 마지막 문단입니다.'));
  assert(!rendered.includes('| :--- |'), 'Markdown delimiter syntax must not leak into the report text.');
}
const templateReport = renderToStaticMarkup(React.createElement(LiteratureReader, { document: { ...document, reportMarkdown: LITERATURE_REPORT_TABLE_TEMPLATE }, preview: true }));
assert(templateReport.includes('<table>'), 'The editor\'s inserted table template must be accepted by the actual shared renderer.');
assert(templateReport.includes('구성요소 1'));
assert(templateReport.includes('구성요소 2'));
console.log('Markdown passed: CommonMark/GFM, safe links, escaped code, blocked HTML, accessible tables and real report preview/publication with alignment, Korean labels and inline formatting.');
