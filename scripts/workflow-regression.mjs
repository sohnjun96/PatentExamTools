import assert from 'node:assert/strict';
import { analyzeClaims, buildExaminationRounds, classifyAmendmentDocument } from '../app/lib/examination-model.ts';
import { normalizeNoticeMarkdown, stripGuidanceFromSummary, splitTableRow } from '../app/lib/notice-postprocess.ts';
import { createSingleFlight, documentHash, joinDocumentBytes, splitDocumentBytes, DOCUMENT_CHUNK_BYTES } from '../app/lib/document-cache-core.ts';
import { analysisBasisStatus, caseHistoryKey } from '../app/lib/analysis-provenance.ts';
import { canonicalOriginalId, exactEvidenceExpression } from '../app/lib/evidence-location.ts';
import { parseWorkspacePreferences } from '../app/lib/workspace-preferences.ts';

const document = (number, date, title) => ({ documentNumber: number, date, title, status: '수리' });
const liveHistory = [
  document('952025094321912', '2025.09.26', '등록결정서'),
  document('112025100848978', '2025.09.02', '[출원서 등 보완]보정서'),
  document('112025100846628', '2025.09.02', '[거절이유 등 통지에 따른 의견]의견서·답변서·소명서'),
  document('952025083599412', '2025.09.01', '의견제출통지서'),
];
assert.equal(classifyAmendmentDocument(liveHistory[1]), 'procedural');
assert.equal(classifyAmendmentDocument({ title: '[명세서등 보정]보정서' }), 'claims');
assert.equal(classifyAmendmentDocument({ title: '보정서' }), 'unknown');
let rounds = buildExaminationRounds(liveHistory);
assert.equal(rounds[0].amendments.length, 0, 'formalities correction must not be treated as a claims amendment');
assert.equal(rounds[0].otherAmendments.length, 1);
assert.equal(buildExaminationRounds(liveHistory, undefined, new Set(['112025100848978']))[0].amendments.length, 0);
const unclassified = document('112025100800000', '2025.09.02', '보정서');
assert.equal(buildExaminationRounds([...liveHistory, unclassified])[0].amendments.length, 0);
assert.equal(buildExaminationRounds([...liveHistory, unclassified], undefined, new Set([unclassified.documentNumber]))[0].amendments.length, 1);
rounds = buildExaminationRounds([
  document('2', '2026.02.01', '의견제출통지서'), document('1', '2026.01.01', '의견제출통지서'),
  document('3', '2026.01.05', '[명세서등 보정]보정서'), document('4', '2026.01.06', '[청구범위 보정]보정서'),
]);
assert.equal(rounds[0].notice.documentNumber, '1');
assert.equal(rounds[0].connectionStatus, 'needs_confirmation');
assert.equal(rounds[1].amendments.length, 0);

// Actual API bibliography for 10-2024-0093843 has this dependency graph.
const claims = analyzeClaims([
  { number: 1, text: '양방향 스위치와 필터를 포함하는 전압 보상 장치.' },
  { number: 2, text: '제 1 항에 있어서, 제어기를 더 포함하는 장치.' },
  { number: 3, text: '제2항에 있어서, 하드웨어 필터를 포함하는 장치.' },
  { number: 4, text: '제1항 내지 제3항 중 어느 한 항에 있어서, 소프트웨어 필터를 포함하는 장치.' },
  { number: 5, text: '제4항에 있어서, 위상지연을 보상하는 장치.' },
  { number: 6, text: '제5항에 있어서, 계통 전압을 제어하는 장치.' },
  { number: 7, text: '제6항에 있어서, 검출값을 출력하는 장치.' },
]);
assert.deepEqual(claims.map((claim) => claim.directReferences), [[], [1], [2], [1, 2, 3], [4], [5], [6]]);

const brokenNotice = `출원번호 1020240093843\n제출기한 안내\n[심사결과]\n| 구성 | 출원발명 | 인용발명 1 | 비고 |\n|---|---|---:|---|\n| 제1항 구성① | 변압기\n교류 계통과 연계된 제1 변압기(T1) | 실질적 동일 |\n| 제1항 구성② | 컨버터\n제1,2 컨버터 | 차이 |\n\n<< 안내 >>\n1. 지정기간연장 안내: 최대 4개월`;
const cleaned = normalizeNoticeMarkdown(brokenNotice);
assert.equal(cleaned.markdown.startsWith('[심사결과]'), true);
assert.equal(cleaned.markdown.includes('<< 안내 >>'), false);
assert.equal(cleaned.markdown.includes('변압기<br/>교류'), true);
assert.equal(cleaned.warnings.length, 2, 'missing table cells must be flagged, not guessed');
assert.equal(splitTableRow(cleaned.markdown.split('\n')[3]).length, 3);
assert.deepEqual(splitTableRow('| A \\| B | C<br/>D |'), ['A | B', 'C<br/>D']);
assert.equal(normalizeNoticeMarkdown(cleaned.markdown).markdown, cleaned.markdown, 'normalization must be idempotent');
const validTable = normalizeNoticeMarkdown('[심사결과]\n| 구성 | 원문 |\n|---|---|\n| A | 첫 줄\n둘째 줄 |');
assert.equal(validTable.warnings.length, 0);
assert.equal(validTable.markdown.includes('첫 줄<br/>둘째 줄'), true);

const summary = stripGuidanceFromSummary({
  oneLine: '제29조제2항에 따라 청구항 1–7이 거절 대상이다.',
  rejectionGrounds: [{ provision: '제29조제2항', claimNumbers: [1, 2, 2], reason: '하드웨어 필터와 제어 구성이 인용문헌에 대응한다.' }],
  allowableClaims: [], keyIssues: ['위상지연 보상 구성', '지정기간 연장 신청 가능'], affectedClaims: ['청구항 1–7'],
  citedReferences: ['등록특허 제10-1862615호'], deadlines: ['의견서 또는/및 보정서 제출기한: 2026.01.01.'],
  requiredActions: ['필요시 지정기간연장신청', '별지 제24호 서식으로 의견서를 제출'],
  cautions: ['문서 제출 시 개인정보 주의', '심사청구료 일부 반환 가능', '인용문헌의 전체 구성대비 원문 미확보'],
});
assert.deepEqual(summary.deadlines, []);
assert.deepEqual(summary.requiredActions, []);
assert.deepEqual(summary.cautions, ['인용문헌의 전체 구성대비 원문 미확보']);
assert.deepEqual(summary.rejectionGrounds[0].claimNumbers, [1, 2]);
assert.deepEqual(summary.keyIssues, ['위상지연 보상 구성']);
assert.deepEqual(stripGuidanceFromSummary({ ...summary, keyIssues: ['개인정보 암호화 구성이 인용문헌과 동일함'] }).keyIssues, ['개인정보 암호화 구성이 인용문헌과 동일함'], 'technical subject matter must not be removed as boilerplate');

const bytes = Uint8Array.from({ length: DOCUMENT_CHUNK_BYTES * 2 + 7 }, (_, index) => index % 251);
const chunks = splitDocumentBytes(bytes);
assert.deepEqual(chunks.map((chunk) => chunk.length), [DOCUMENT_CHUNK_BYTES, DOCUMENT_CHUNK_BYTES, 7]);
assert.deepEqual(joinDocumentBytes(chunks, bytes.length), bytes);
assert.throws(() => joinDocumentBytes(chunks.slice(1), bytes.length));
assert.equal(await documentHash(bytes), await documentHash(joinDocumentBytes(chunks, bytes.length)));
const singleFlight = createSingleFlight();
let calls = 0;
const loader = async () => { calls += 1; await new Promise((resolve) => setTimeout(resolve, 10)); return 'XML'; };
assert.deepEqual(await Promise.all([singleFlight('a', loader), singleFlight('a', loader), singleFlight('a', loader)]), ['XML', 'XML', 'XML']);
assert.equal(calls, 1);
await assert.rejects(singleFlight('failure', async () => { throw new Error('upstream'); }));
assert.equal(await singleFlight('failure', async () => 'retry'), 'retry');

const basis = { caseHistoryKey: caseHistoryKey(liveHistory), fullTextHash: 'abc', fullTextFetchedAt: '2026-08-29T00:00:00Z', caseFetchedAt: '2026-08-28T00:00:00Z', sourceFileName: 'application.xml', claimNumbers: [1, 2] };
assert.equal(analysisBasisStatus(basis, [...liveHistory].reverse(), 'abc'), 'current');
assert.equal(analysisBasisStatus(basis, liveHistory, 'new XML'), 'changed');
assert.equal(analysisBasisStatus(basis, [...liveHistory, unclassified]), 'changed');
assert.equal(analysisBasisStatus(undefined, liveHistory), 'unverified');

const original = { claims: [{ number: 4, text: '제1항에 있어서, 하드웨어 필터의 위상 지연을 보상한다.' }], abstract: [], sections: [{ id: 'summary', title: '발명의 내용', paragraphs: [{ number: '0048', text: '위상 지연을 보상한다.' }] }] };
assert.equal(canonicalOriginalId('paragraph-48', original), 'paragraph-0048');
assert.equal(canonicalOriginalId('claim-0004', original), 'claim-4');
assert.ok(exactEvidenceExpression('위상\n지연을 보상한다.', '위상 지연을 보상한다.'));
assert.ok(exactEvidenceExpression('특허법 제29조 제2항에 해당합니다.', '제29조제2항'));
assert.equal(exactEvidenceExpression('위상 지연을 보상한다.', '위상 지연을 보상한다. 하지만 모터가 있다.'), null, 'do not highlight an arbitrary prefix as matching evidence');

const preferences = parseWorkspacePreferences(JSON.stringify({ version: 1, view: 'strategy', selectedClaim: 4, selectedRound: '952025083599412', resourceTab: 'claims', keywords: ['위상 지연'], featureRoles: { '1A': '검색 제외', invalid: '임의 값' }, scrollPositions: { technology: 350, strategy: 150, evil: -1 } }));
assert.equal(preferences.selectedClaim, 4);
assert.deepEqual(preferences.featureRoles, { '1A': '검색 제외' });
assert.deepEqual(preferences.scrollPositions, { technology: 350, strategy: 150 });
assert.equal(parseWorkspacePreferences('malformed'), null);
assert.equal(parseWorkspacePreferences('{"version":1,"view":"notice-draft"}'), null);
console.log('workflow regression: amendment classification, notice tables/guidance, cache/dedup, provenance, evidence, workspace preferences OK');
