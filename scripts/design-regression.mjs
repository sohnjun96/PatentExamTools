import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Expose private views only inside this in-memory test bundle, not in production.
const bundle = await build({
  stdin: { resolveDir: root, contents: `
    export { OverviewView, TechnologyView, StrategyView, demoCase } from './app/exam-workspace';
    export { default as CaseActionsMenu } from './app/case-actions-menu';
    export { analyzeClaims } from './app/lib/examination-model';
  ` },
  bundle: true, write: false, platform: 'node', format: 'esm', target: 'es2022',
  external: ['react', 'react/*', 'react-dom', 'react-dom/*', 'next', 'next/*'],
  plugins: [{
    name: 'test-private-workspace-views',
    setup(builder) {
      builder.onLoad({ filter: /[\\/]app[\\/]exam-workspace\.tsx$/ }, async ({ path: file }) => ({
        contents: `${await readFile(file, 'utf8')}\nexport { OverviewView, TechnologyView, StrategyView, demoCase };`,
        loader: 'tsx', resolveDir: path.dirname(file),
      }));
    },
  }],
});
// Resolve React from this repository even though the bundle itself has no file.
const bundledText = bundle.outputFiles[0].text.replace(/from "(react(?:-dom)?(?:\/[^" ]+)?)"/g, (_, module) => `from ${JSON.stringify(import.meta.resolve(module))}`);
const ui = await import('data:text/javascript;base64,' + Buffer.from(bundledText).toString('base64'));
const render = (Component, props) => renderToStaticMarkup(createElement(Component, props));
const noop = () => {};
const data = {
  ...ui.demoCase, isDemo: false, fullTextHash: 'fixture-hash', claimStructureSource: 'fulltext',
  sources: [{ name: 'bibliography', ok: true, message: '' }],
  history: Array.from({ length: 8 }, (_, index) => ({
    documentNumber: `doc-${index}`, date: `2026.09.${String(index + 1).padStart(2, '0')}`,
    title: index === 0 ? '의견서' : `접수 서류 ${index}`, status: '수리',
  })),
};
const readiness = { technology: false, notices: true, amendments: true, complete: false };
const progress = { phase: 'idle', currentStep: 'case', completedSteps: [], noticeDone: 0, noticeTotal: 0, error: '' };
const overviewProps = {
  step: '1', data, rounds: [], summary: null, noticeAnalyses: {}, amendmentResolutions: {},
  claimChangeSummary: null, preReview: progress, readiness, onRun: noop, onView: noop, onResource: noop,
};
let html = render(ui.OverviewView, overviewProps);
assert(html.indexOf('AI 분석 시작') < html.indexOf('서지사항'), 'AI action must precede long case/document lists');
assert(!/<details class="dashboard-task-details"[^>]*\bopen/.test(html), 'idle detail rows must start folded');
assert(!/<details class="dashboard-material-details"[^>]*\bopen/.test(html), 'normal material rows must start folded');
assert(html.includes('원문 미확보 · 주장 분석 제외'), 'missing opinion warning must remain visible');
assert(html.indexOf('원문 미확보') < html.indexOf('dashboard-material-details'), 'exceptions must not be hidden in the normal-material fold');
assert(html.includes('OpenAI API 사용'), 'AI usage warning must remain next to the action');
assert(html.includes('최근 서류 더보기') && html.includes('전체 이력 · 8건'));
assert(!html.includes('전체 접수 이력') && !html.includes('자료 기준'), 'duplicate history and date UI should be removed');
html = render(ui.OverviewView, { ...overviewProps, preReview: { ...progress, phase: 'running' } });
assert(/<details class="dashboard-task-details"[^>]*\bopen/.test(html), 'actual progress must be visible while running');
assert(/disabled=""[^>]*>분석 중…/.test(html));

const ai = {
  oneLine: '영상의 판정 정확도를 평가하는 인식 시스템', technicalProblem: '오인식 감소', solution: '신뢰도가 낮으면 불명 처리',
  keyElements: ['카메라', '판정 장치'], effects: ['오판 감소'], independentClaimSummary: '카메라와 평가 장치의 조합',
  dependentClaimGroups: [], claimOverview: '', examinationPoints: [], searchKeywords: [], cautions: [],
};
const summary = { summary: ai, cached: true, reviewItems: [] };
html = render(ui.OverviewView, { ...overviewProps, summary });
assert(html.includes('추가 분석 필요') && html.includes('미완료 분석 실행'));
assert(/<details class="dashboard-task-details"[^>]*\bopen/.test(html), 'stale analysis must not appear complete or be hidden');
html = render(ui.OverviewView, { ...overviewProps, summary, readiness: { ...readiness, technology: true, complete: true } });
assert(html.includes('기술 이해 보기') && !html.includes('AI 분석 시작'));
assert(!/<details class="dashboard-task-details"[^>]*\bopen/.test(html));

const claimAnalysis = ui.analyzeClaims(data.claims);
const technologyProps = {
  step: '2', data, claimAnalysis, summary, summaryBusy: false, summaryError: '',
  onOpenClaimTree: noop, onEvidence: noop, onOpenReview: noop,
};
html = render(ui.TechnologyView, technologyProps);
assert.equal((html.match(/인용관계 보기/g) || []).length, 1, 'there must be only one claim-tree launch');
assert(!html.includes('모달에서') && !html.includes('청구항 트리 전체 보기'));
assert(html.includes('해결하고자 하는 과제') && html.includes('핵심 해결수단') && html.includes('주요 효과'));
assert(/<details class="technical-core-elements">/.test(html), 'duplicate component list should be available on demand');
assert.equal((html.match(/전문 XML 기준/g) || []).length, 1);
assert(!html.includes('operation-flow-panel'), 'empty operation flow should not render a placeholder');

// Long Korean/chemical text and multiple references reproduce the reported card overflow.
const flowSteps = Array.from({ length: 6 }, (_, index) => `${index + 1}단계: 슬러지를 0.3~0.6 M 황산 수용액에 투입·교반해 금속 이온을 포함하는 침출액을 준비하고 Fe(OH)3 및 Al(OH)3를 침전·제거한다.`);
for (let count = 1; count <= 5; count += 1) {
  html = render(ui.TechnologyView, {
    ...technologyProps,
    summary: {
      ...summary, summary: { ...ai, operationFlow: flowSteps.slice(0, count) },
      reviewItems: flowSteps.slice(0, count - 1 || 1).map((text, index) => ({
        entityId: `operationFlow.${index}`,
        sourceRefs: [
          { sourceType: 'specification', sourceId: `paragraph-${index}`, locator: '[0031]', excerpt: text },
          { sourceType: 'claim', sourceId: 'claim-2', locator: '청구항 2', excerpt: text },
        ],
      })),
    },
  });
  const cards = html.match(/<li class="operation-flow-step"[^>]*>[\s\S]*?<\/li>/g) || [];
  assert.equal(cards.length, count);
  assert(html.includes(`operation-flow flow-count-${count}`), 'container layout must know the actual step count');
  cards.forEach((card, index) => {
    assert(card.includes(`class="operation-flow-number" aria-hidden="true">${index + 1}</span>`));
    assert(card.includes(`${index + 1}단계: 슬러지`));
    assert(!card.includes('class="operation-flow-number">근거'), 'evidence must not use a circular-number wrapper');
  });
  assert(cards[0].includes('class="technical-evidence"') && cards[0].includes('[0031]') && cards[0].includes('청구항 2'));
  if (count > 1) assert(cards.at(-1).includes('근거 부족'), 'missing evidence must remain a normal text warning');
}
html = render(ui.TechnologyView, { ...technologyProps, summary: { ...summary, summary: { ...ai, operationFlow: flowSteps } } });
assert.equal((html.match(/class="operation-flow-number"/g) || []).length, 5, 'keep the existing five-step limit');

const strategyProps = {
  step: '4', data, mode: 'initial', claimAnalysis, selectedClaim: data.claims[0].number,
  targetLabel: '전문 XML', features: [], approvedKeywords: [], suggestedKeywords: [], selectedDraftKeywords: [],
  claimChangeSummary: null, candidates: [], searchRan: false, hasAiAnalysis: false, analysisBusy: false,
  analysisError: '', onSelectClaim: noop, onOpenClaim: noop, onOpenEvidence: noop, onAnalyze: noop,
  onToggleKeyword: noop, onChangeRole: noop, onCopy: noop, onRunDemo: noop, onOpenResource: noop,
  searchOptions: { includeTitle: false, cpcCodes: [], customExpression: '', useCustomExpression: false },
  onSearchOptions: noop, onAddCandidate: noop, onRemoveCandidate: noop,
};
html = render(ui.StrategyView, strategyProps);
assert(html.includes('구성 분석 전') && html.includes('구성 분석 실행') && html.includes('비용 발생'));
assert(!html.includes('기술 분석 갱신 · OpenAI 호출'));
assert(html.includes('ai-feature-empty-action'));
html = render(ui.StrategyView, { ...strategyProps, analysisError: '원문이 없습니다.' });
assert(html.includes('원문이 없습니다.'), 'errors must survive concise empty-state copy');
html = render(ui.CaseActionsMenu, { children: createElement('button', {}, '최신 자료 조회') });
assert(html.includes('aria-expanded="false"') && html.includes('aria-haspopup="dialog"'));
assert(!html.includes('최신 자료 조회'), 'closed actions should not be in the tab order');

const css = await readFile(path.join(root, 'app/workspace-design.css'), 'utf8');
const legacyCss = await readFile(path.join(root, 'app/globals.css'), 'utf8');
const layout = await readFile(path.join(root, 'app/layout.tsx'), 'utf8');
assert(layout.indexOf('workspace-design.css') > layout.indexOf('workspace-evidence.css'));
assert(css.includes('--exam-reading-size: 17px') && css.includes('--exam-reading-size: 16px'));
assert(css.includes('.recent-documents:not(.expanded) > li:nth-child(n + 4)'));
assert(css.includes('overflow-y: auto') && css.includes('env(safe-area-inset-bottom)'));
assert(/\.ai-feature-empty \{[^}]*grid-template-columns: minmax\(0, 1fr\) auto/.test(legacyCss));
assert(!/\.ai-feature-empty \{[^}]*grid-template-columns: 46px/.test(legacyCss));
assert(!/\.operation-flow-step\s*>\s*span\b/.test(legacyCss + css), 'number styling must never target evidence spans');
assert(css.includes('container: operation-flow / inline-size'));
assert(css.includes('--flow-columns: 1') && css.includes('content: var(--flow-arrow)'));
assert(/\.operation-flow-step > \.technical-evidence \{[^}]*flex-wrap: wrap/.test(css));
for (const [count, width] of [[2, 600], [3, 880], [4, 1160], [5, 1440]]) {
  assert(css.includes(`@container operation-flow (min-width: ${width}px)`));
  assert(css.includes(`.operation-flow.flow-count-${count} { --flow-columns: ${count};`));
}
console.log('Design regression passed: compact dashboard, warnings/progress, single claim-tree launch, readable mobile styles, closed-menu accessibility, and 1–5 flow cards with long text/multiple or missing evidence.');

// Optional visual fixture: compiled production CSS + the real technology view,
// with synthetic summaries only. No browser-side script, API or production data.
if (process.argv.includes('--preview')) {
  const { createServer } = await import('node:http');
  const cssDirectory = path.join(root, 'dist/client/_next/static/css');
  const cssName = (await readdir(cssDirectory)).find((name) => name.startsWith('index.') && name.endsWith('.css'));
  assert(cssName, 'run npm run build before starting the visual fixture');
  const compiledCss = await readFile(path.join(cssDirectory, cssName), 'utf8');
  const fixture = createServer((request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    if (url.pathname === '/style.css') { response.writeHead(200, { 'content-type': 'text/css; charset=utf-8' }); response.end(compiledCss); return; }
    if (url.pathname !== '/') { response.writeHead(404); response.end(); return; }
    const count = Math.max(1, Math.min(5, Number(url.searchParams.get('count')) || 5));
    const width = url.searchParams.get('layout') === 'wide' ? 'none' : '1200px';
    const content = render(ui.TechnologyView, {
      ...technologyProps,
      summary: {
        ...summary, summary: { ...ai, operationFlow: flowSteps.slice(0, count) },
        reviewItems: flowSteps.slice(0, count - 1).map((text, index) => ({ entityId: `operationFlow.${index}`, sourceRefs: [
          { sourceType: 'specification', sourceId: `paragraph-${index}`, locator: '[0031]', excerpt: text },
          { sourceType: 'claim', sourceId: 'claim-2', locator: '청구항 2', excerpt: text },
        ] })),
      },
    });
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    response.end(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>작동 흐름 UI 검증 · 모의자료</title><link rel="stylesheet" href="/style.css"><style>.flow-fixture{width:calc(100% - 32px);max-width:${width};margin:0 auto;padding:20px 0}.flow-fixture-nav{display:flex;gap:12px;flex-wrap:wrap;margin:0 0 20px;padding:12px;background:white}.flow-fixture-nav a{padding:8px;color:#0b50d0}</style></head><body><div class="exam-app"><main class="flow-fixture"><nav class="flow-fixture-nav" aria-label="검증 설정"><strong>모의자료 · API 미사용</strong><a href="/?layout=wide&count=5">넓은 영역 · 5단계</a><a href="/?count=5">일반 영역 · 5단계</a><a href="/?count=2">2단계</a></nav>${content}</main></div></body></html>`);
  });
  fixture.listen(0, '127.0.0.1', () => console.log(`Flow visual fixture: http://127.0.0.1:${fixture.address().port}/`));
}
