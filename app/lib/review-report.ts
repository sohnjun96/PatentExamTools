import type { NoticeAnalysis } from './notice-analysis';
import type { AmendmentResolutionPayload } from './amendment-resolution';
import type { ExaminationRound, HistoryLike } from './examination-model';
import type { ClaimChangeHistory } from './claim-changes';
import type { ReviewItem } from './review-model';
import type { CandidateDocument } from './candidate-documents';
import type { BasisStatus } from './analysis-provenance';
import { noticeGroundTarget } from './evidence-location';

type Technical = {
  oneLine: string; technicalProblem: string; solution: string; keyElements: string[];
  effects: string[]; operationFlow?: string[]; independentClaimSummary?: string;
};
export type ReviewReportInput = {
  data: { applicationNumber: string; applicationNumberRaw: string; title: string; applicant: string; applicationDate: string; publicationNumber: string; registrationNumber: string; fetchedAt?: string; updatedAt: string; history: HistoryLike[]; claims: Array<{ number: number; text: string }> };
  lifecycleLabel: string; basisStatus: BasisStatus;
  technical: { summary: Technical | null; generatedAt?: string; model?: string; version?: string } | null;
  rounds: ExaminationRound[]; notices: Record<string, NoticeAnalysis>; resolutions: Record<string, AmendmentResolutionPayload>;
  claimChanges: ClaimChangeHistory | null;
  changeSummary: { oneLine: string; searchRecommendation: { status: string; reason: string } } | null;
  evidenceItems: ReviewItem[]; candidates: CandidateDocument[]; searchExpression: string;
};
const lines = (value: string | string[] | undefined) => (Array.isArray(value) ? value : value?.split(/\n+/) ?? []).filter(Boolean).map((line) => `- ${line.replace(/^\s*[-*•]\s*/, '')}`).join('\n');
export function createReviewReport(input: ReviewReportInput, now = new Date().toISOString()) {
  const { data, technical } = input;
  const output = [
    '# 특허심사 검토보고서', '', `${data.applicationNumber} · ${data.title}`,
    '', '## 사건정보', `- 출원인: ${data.applicant}`, `- 출원일: ${data.applicationDate}`,
    `- 공개번호: ${data.publicationNumber || '미확인'}`, `- 등록번호: ${data.registrationNumber || '미확인'}`,
    `- 사건 상태: ${input.lifecycleLabel}`, `- 사건 조회: ${data.fetchedAt || data.updatedAt}`,
    `- 보고서 작성: ${now}`, `- 분석 기준: ${{ current: '저장된 원문과 일치', changed: '이전 자료 기준 — 현재 판단에 사용하지 않음', unverified: '원문 버전 미확인' }[input.basisStatus]}`,
    '', 'AI 분석은 보조자료이며 심사관의 최종 판단을 대신하지 않습니다.',
    '', '## 기술 이해',
  ];
  if (technical?.summary) {
    const s = technical.summary;
    output.push(s.oneLine, '', '### 해결하고자 하는 과제', lines(s.technicalProblem), '', '### 핵심 해결수단', lines(s.solution), '', '### 주요 효과', lines(s.effects));
    if (s.operationFlow?.length) output.push('', '### 작동 흐름', lines(s.operationFlow));
    if (s.independentClaimSummary) output.push('', '### 독립항 핵심', lines(s.independentClaimSummary));
    output.push('', `분석일: ${technical.generatedAt || '미기록'} · 모델: ${technical.model || '미기록'} · 프롬프트: ${technical.version || '미기록'}`);
  } else output.push('저장된 기술 분석이 없습니다.');
  for (const round of input.rounds) {
    const notice = input.notices[round.notice.documentNumber.replace(/\D/g, '')];
    const resolution = input.resolutions[round.notice.documentNumber.replace(/\D/g, '')];
    output.push('', `## ${round.number}차 통지·보정 검토`, `- 통지일: ${round.notice.date}`, `- 문서 연결: ${round.connectionStatus === 'linked' ? round.connectionOrigin === 'user' ? '사용자 선택' : '문서일자 기준' : '확인 필요'}`,
      `- 의견서: ${round.opinions.length ? round.opinions.map((item) => item.date).join(', ') + ' · 원문 미확보, 주장 분석 제외' : '접수 이력 없음'}`,
      `- 청구항 보정: ${round.amendments.map((item) => item.date + ' / ' + item.documentNumber).join(', ') || '확인된 문서 없음'}`,
      '', '### 통지 요약');
    if (notice) {
      if (notice.basisStatus !== 'current') output.push('주의: 통지서 분석은 PDF 버전이 변경되었거나 미확인인 저장 결과입니다.');
      output.push(...notice.summary.rejectionGrounds.map((ground) => `- ${ground.provision}: 청구항 ${ground.claimNumbers.join(', ')}\n  ${ground.reason}`));
      for (const ground of notice.summary.rejectionGrounds) {
        const target = noticeGroundTarget(notice.markdown, ground.provision, ground.claimNumbers, round.notice.documentNumber);
        output.push(`  근거: ${target.locator} / 통지서 ${round.notice.documentNumber}`);
        if (target.excerpt) output.push(`  원문: ${target.excerpt}`);
      }
      if (notice.summary.allowableClaims.length) output.push(`- 통지 당시 등록가능항: ${notice.summary.allowableClaims.join(', ')}`);
      if (notice.summary.citedReferences.length) output.push('', '### 인용문헌', lines(notice.summary.citedReferences));
      if (notice.tableWarnings?.length) output.push('', '### 원문 추출 주의', lines(notice.tableWarnings));
    } else output.push('통지서 분석 미완료');
    output.push('', '### 보정 판단');
    if (resolution?.summary) output.push(resolution.summary.headline, ...resolution.summary.legalGroundResults.map((ground) => `- ${ground.provision} / 청구항 ${ground.originalClaimNumbers.join(', ')}: ${ground.summary}`), lines(resolution.summary.cautions));
    else output.push(round.amendments.length ? '해소 판단 미완료 또는 이전 자료 기준' : '청구항 보정 없음 — 해소 판단하지 않음');
    const documents = input.claimChanges?.documents.filter((document) => round.amendments.some((item) => item.documentNumber === document.documentNumber)) ?? [];
    for (const document of documents) {
      output.push('', `### 보정서 ${document.documentNumber} 청구항 비교`);
      for (const change of document.changes) output.push('', `#### 청구항 ${change.claimNumber} · ${change.changeTypeName || change.changeTypeCode}`, '보정 전:', change.previousClaimText || '이전 문언 미확보', '', '보정 후:', change.changeTypeCode === 'D' ? '삭제' : change.claimText || '변경 문언 미확보');
    }
  }
  if (input.changeSummary) output.push('', '## 보정 영향', input.changeSummary.oneLine, '', '### 추가 검색 판단', input.changeSummary.searchRecommendation.reason);
  output.push('', '## 원문 근거');
  const references = input.evidenceItems.flatMap((item) => item.sourceRefs.map((ref) => ({ ...ref, label: item.label })));
  output.push(references.length ? references.map((ref) => `- ${ref.label} — ${ref.locator} (${ref.sourceId})\n  ${ref.excerpt}`).join('\n') : '저장된 근거 목록 없음');
  output.push('', '## 검색 방향', input.searchExpression ? '검색식:' : '작성된 검색식 없음', input.searchExpression, '', '## 후보문헌');
  output.push(input.candidates.length ? input.candidates.map((candidate) => `- ${candidate.country} ${candidate.number} · ${candidate.title}\n  공개일 ${candidate.publicationDate || '미확인'} / 공개일 기준 ${candidate.eligible === null ? '판단 보류' : candidate.eligible ? '기준일 이전·동일' : '기준일 이후'}\n  ${candidate.sourceUrl || ''}\n  ${candidate.notes || ''}`).join('\n') : '저장된 후보문헌 없음');
  const markdown = output.join('\n');
  const escape = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));
  const body = markdown.split('\n').map((line) => {
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) return `<h${heading[1].length}>${escape(heading[2])}</h${heading[1].length}>`;
    return line.startsWith('- ') ? `<p class="bullet">• ${escape(line.slice(2))}</p>` : line ? `<p>${escape(line)}</p>` : '';
  }).join('\n');
  const html = `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(data.applicationNumber)} 검토보고서</title><style>body{font:17px/1.8 system-ui,sans-serif;max-width:960px;margin:32px auto;padding:0 24px;color:#172b4d}h1{font-size:30px;border-bottom:3px solid #174b85}h2{font-size:24px;border-top:1px solid #cad5e4;padding-top:24px;margin-top:36px}h3{font-size:20px}p{white-space:pre-wrap;overflow-wrap:anywhere;margin:8px 0}.bullet{padding-left:20px;text-indent:-16px}@media print{body{font-size:11pt;margin:0}h2{break-after:avoid}h3,h4{break-after:avoid}}</style><body>${body}</body></html>`;
  return { markdown, html };
}
