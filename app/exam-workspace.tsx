'use client';
/* eslint-disable @next/next/no-img-element */

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import demoFullText from '@/app/data/demo-fulltext.json';
import {
  analyzeClaims,
  buildExaminationRounds,
  classifyCaseLifecycle,
  classifyAmendmentDocument,
  amendmentKindLabel,
  type CaseLifecycle,
  type ClaimAnalysis,
  type ExaminationRound,
} from '@/app/lib/examination-model';
import {
  isApprovedReviewStatus,
  type ReviewItem,
} from '@/app/lib/review-model';
import type {
  ClaimChangeDocument,
  ClaimChangeHistory,
  ClaimChangeSegment,
} from '@/app/lib/claim-changes';
import type {
  AmendmentResolutionPayload,
  AmendmentResolutionSummary,
  AmendmentResolutionStatus,
} from '@/app/lib/amendment-resolution';
import type { NoticeAnalysis, NoticeSummary } from '@/app/lib/notice-analysis';
import { useModalBehavior } from '@/app/lib/use-modal-behavior';
import NoticeDialog from '@/app/notice-dialog';
import OriginalDocumentViewer from '@/app/original-document-viewer';
import { fetchFullText, invalidateFullText, type FullTextDocument } from '@/app/lib/patent-document-client';
import { analysisBasisStatus, caseHistoryKey, formatAnalysisDate, type AnalysisBasis, type BasisStatus } from '@/app/lib/analysis-provenance';
import { noticeGroundTarget, type OriginalTarget } from '@/app/lib/evidence-location';
import { buildDocumentClaimVersions, type DocumentClaimVersion } from '@/app/lib/claim-version-model';
import { buildKeywordGroups, buildSearchExpression, allowedSearchKeywords, keywordMatchesFeature, DEFAULT_SEARCH_OPTIONS, type SearchOptions, type SearchRole } from '@/app/lib/search-strategy';
import { amendmentInputKey, claimChangesInputKey, inputIsCurrent } from '@/app/lib/analysis-input-key';
import { reviewReadiness } from '@/app/lib/review-readiness';
import { createReviewReport } from '@/app/lib/review-report';
import type { CandidateDocument as Candidate } from '@/app/lib/candidate-documents';
import type { RoundDocumentLink } from '@/app/lib/examination-model';
import RoundLinkEditor from '@/app/round-link-editor';
import CandidateEditor from '@/app/candidate-editor';
import { parseWorkspacePreferences, WORKSPACE_PREFERENCES_PREFIX, type WorkspacePreferences } from '@/app/lib/workspace-preferences';

type WorkMode = 'initial' | 'response';
type WorkView = 'overview' | 'response-analysis' | 'technology' | 'response-review' | 'strategy' | 'search' | 'candidates' | 'evidence' | 'notice-draft';
type ResourceTab = 'biblio' | 'claims' | 'specification' | 'drawing' | 'history' | 'family' | 'documents';
type Claim = {
  number: number;
  text: string;
  referenceNumbers?: number[];
  multipleDependent?: boolean;
};
type CodeItem = { number: string; date?: string };
type FamilyItem = { applicationNumber: string; countryCode: string; countryName: string; familyKind: string; familyNumber: string; literatureKind: string; literatureNumber: string; publicationNumber: string };
type HistoryItem = { documentNumber: string; date: string; title: string; titleEnglish?: string; status: string; step?: string };
type NoticeItem = HistoryItem & { pdf?: { sendNumber: string; fileName: string; fileUrl: string } | null; pdfError?: string | null };
type SourceStatus = { name: string; ok: boolean; message: string };
type ApiUsage = { total: number; startedAt: string; lastCalledAt: string | null; byOperation: Record<string, number>; limits?: { date: string; openai: { used: number; limit: number }; kipris: { used: number; limit: number } } };
type DependentClaimGroup = { claimNumbers: number[]; addition: string };
type AiClaimFeatureCategory = 'component' | 'relationship' | 'condition' | 'operation' | 'result';
type AiClaimFeatureImportance = 'core' | 'supporting' | 'conventional';
type AiClaimFeatureRole = 'core' | 'combination' | 'general' | 'exclude' | 'review';
type AiClaimFeatureAnalysis = {
  claimNumber: number;
  features: Array<{
    label: string;
    wording: string;
    category: AiClaimFeatureCategory;
    importance: AiClaimFeatureImportance;
    recommendedRole: AiClaimFeatureRole;
    rationale: string;
  }>;
};
type ExaminationSummary = {
  oneLine: string;
  technicalProblem: string;
  solution: string;
  operationFlow?: string[];
  keyElements: string[];
  effects: string[];
  independentClaimSummary?: string;
  dependentClaimGroups?: DependentClaimGroup[];
  claimOverview: string;
  examinationPoints: string[];
  searchKeywords: string[];
  cautions: string[];
  claimFeatureAnalyses?: AiClaimFeatureAnalysis[];
};
type SummaryPayload = { summary: ExaminationSummary | null; reviewItems?: ReviewItem[]; model?: string; version?: string; cached: boolean; generatedAt?: string; sourceHash?: string; sourceBasis?: AnalysisBasis; basisStatus?: BasisStatus };
type ClaimChangePayload = ClaimChangeHistory & { fetchedAt: string; cached: boolean; usage?: ApiUsage; error?: string; versions?: DocumentClaimVersion[] };
type ClaimChangeInsight = { text: string; documentNumber: string; claimNumbers: number[]; evidenceExcerpt: string };
type ClaimChangeSummary = {
  oneLine: string;
  scopeAssessment: 'narrowed' | 'broadened_possible' | 'mixed' | 'uncertain';
  documentSummaries: Array<{ documentNumber: string; summary: string; changedClaims: number[]; addedLimitations: string[]; removedLimitations: string[]; relationshipChanges: string[] }>;
  importantChanges: ClaimChangeInsight[];
  examinationImpact: ClaimChangeInsight[];
  searchRecommendation: { status: 'not_needed' | 'optional' | 'recommended' | 'insufficient'; reason: string; targetFeatures: string[] };
  cautions: string[];
};
type ClaimChangeSummaryPayload = { summary: ClaimChangeSummary | null; sourceDocumentNumbers: string[]; inputKey?: string; model?: string; version?: string; cached: boolean; generatedAt?: string };
type PreReviewPhase = 'idle' | 'running' | 'complete' | 'partial';
type PreReviewStep = 'case' | 'technology' | 'notices' | 'amendments' | 'results';
type PreReviewTaskStatus = 'pending' | 'running' | 'complete' | 'failed' | 'skipped' | 'stale';
type PreReviewTaskState = {
  status: PreReviewTaskStatus;
  detail: string;
  error?: string;
  completedAt?: string;
};
type PreReviewProgress = {
  phase: PreReviewPhase;
  currentStep: PreReviewStep;
  completedSteps: PreReviewStep[];
  noticeDone: number;
  noticeTotal: number;
  error: string;
  completedAt?: string;
  tasks?: Partial<Record<PreReviewStep, PreReviewTaskState>>;
};
type PatentCase = {
  applicationNumber: string; applicationNumberRaw: string; title: string; titleEnglish: string; status: string; updatedAt: string;
  applicant: string; applicantCountry: string; applicationDate: string; publicationNumber: string; publicationDate: string;
  registrationNumber: string; registrationDate: string; registrationStatus: string; examinationRequestDate: string; examinerName: string;
  claimCount: number; inventorCount: number; abstract: string; ipc: CodeItem[]; cpc: CodeItem[]; claims: Claim[]; family: FamilyItem[];
  history: HistoryItem[]; notices: NoticeItem[]; drawing: { fileName: string; thumbnailUrl: string; largeUrl: string } | null;
  fullText: { fileName: string; fileUrl: string } | null; sources: SourceStatus[]; isDemo: boolean; cached: boolean;
  claimStructureSource?: 'bibliography' | 'fulltext';
  fetchedAt?: string;
  fullTextHash?: string;
  fullTextFetchedAt?: string;
};
type StoredWorkspace = { version: 1 | 2; data: PatentCase; summary: SummaryPayload | null; mode?: WorkMode; savedAt: string };
type LivePayload = {
  applicationNumber: string;
  bibliography: null | { applicationNumber: string; applicationDate: string; title: string; titleEnglish: string; publicationNumber: string; publicationDate: string; registrationNumber: string; registrationDate: string; registrationStatus: string; finalDisposal: string; examinationRequestDate: string; examinerName: string; claimCount: number; abstract: string; ipc: CodeItem[]; claims: Claim[]; applicants: Array<{ name: string; englishName: string; country: string }>; inventors: Array<{ name: string; country: string }> };
  cpc: CodeItem[]; family: FamilyItem[]; history: HistoryItem[]; notices: NoticeItem[]; drawing: PatentCase['drawing']; fullText: PatentCase['fullText']; sources: SourceStatus[]; usage: ApiUsage; fetchedAt: string; cached?: boolean;
};
type ClaimFeature = {
  id: string;
  label: string;
  text: string;
  role: SearchRole;
  sourceClaimNumber: number;
  inherited: boolean;
  category: AiClaimFeatureCategory;
  importance: AiClaimFeatureImportance;
  rationale: string;
};

const demoHistory: HistoryItem[] = [
  { documentNumber: '952026056648249', date: '20260623', title: '의견제출통지서', status: '발송처리완료' },
  { documentNumber: '112025135400767', date: '20251201', title: '[거절이유 등 통지에 따른 의견]의견서·답변서·소명서', status: '수리' },
  { documentNumber: '112025135400611', date: '20251201', title: '[명세서등 보정]보정서', status: '보정승인간주' },
  { documentNumber: '952025071682793', date: '20250729', title: '의견제출통지서', status: '발송처리완료' },
  { documentNumber: '112023063864893', date: '20230609', title: '[심사청구]심사청구서·우선심사신청서', status: '수리' },
  { documentNumber: '112020079000192', date: '20200728', title: '[특허출원]특허출원서', status: '수리' },
];
const demoCase: PatentCase = {
  applicationNumber: '10-2020-0093844', applicationNumberRaw: '1020200093844', title: '의류처리장치', titleEnglish: 'CLOTHES TREATING APPARATUS', status: '심사 중', updatedAt: '2026.08.28. 09:30',
  applicant: '삼성전자주식회사', applicantCountry: '대한민국', applicationDate: '2020.07.28.', publicationNumber: '10-2022-0014141', publicationDate: '2022.02.04.', registrationNumber: '', registrationDate: '', registrationStatus: '심사 진행', examinationRequestDate: '2023.06.09.', examinerName: 'API 연동 후 표시', claimCount: 20, inventorCount: 10,
  abstract: demoFullText.abstract.map((paragraph) => paragraph.text).join('\n'), ipc: [{ number: 'D06F 34/26' }], cpc: [{ number: 'D06F 34/26' }, { number: 'D06F 37/06' }], claims: demoFullText.claims, family: [], history: demoHistory,
  notices: demoHistory.filter((item) => item.title === '의견제출통지서').map((item) => ({ ...item, pdf: null })), drawing: { fileName: '1020200093844.jpg', thumbnailUrl: '/demo-drawing.jpg', largeUrl: '/demo-drawing.jpg' }, fullText: { fileName: demoFullText.sourceFileName, fileUrl: '' },
  sources: [{ name: 'bibliography', ok: true, message: '서지·행정처리 반영' }, { name: 'cpc', ok: true, message: 'CPC정보 반영' }, { name: 'drawing', ok: true, message: '대표도면 확인' }, { name: 'family', ok: true, message: '패밀리 없음' }], isDemo: true, cached: false, claimStructureSource: 'fulltext',
};
const demoCandidates: Candidate[] = [
  { id: 'd1', country: 'KR', number: '10-2018-0012345', title: '드럼 내부 상태를 측정하는 이동식 센서 장치', applicationDate: '2016.03.12.', publicationDate: '2018.02.01.', applicant: 'ABC Electronics', relevance: '높음', wording: '직접', eligible: true, matches: ['1D', '1E'], role: 'D1 후보' },
  { id: 'd2', country: 'JP', number: '2017-123456', title: '세탁 장치용 분리식 센서 홀더', applicationDate: '2016.01.19.', publicationDate: '2017.08.03.', applicant: 'Example Industries', relevance: '보통', wording: '유사', eligible: true, matches: ['1E', '2A'], role: 'D2 후보' },
  { id: 'd3', country: 'US', number: '2019/0001234', title: 'Wireless sensing module for laundry appliances', applicationDate: '2018.07.02.', publicationDate: '2021.04.12.', applicant: 'Sample Appliance Corp.', relevance: '보통', wording: '미확인', eligible: false, matches: ['1D'], role: '보류' },
];
const workspaceSteps = [
  ['overview', '사건 대시보드'],
  ['technology', '기술 이해'],
  ['response-analysis', '통지·보정 검토'],
  ['strategy', '검색 방향'],
] as const satisfies ReadonlyArray<readonly [WorkView, string]>;
const preReviewTaskLabels: Record<PreReviewStep, string> = {
  case: '사건자료',
  technology: '발명·청구항',
  notices: '통지서 분석',
  amendments: '보정 영향',
  results: '요약 정리',
};
const preReviewStatusLabels: Record<PreReviewTaskStatus, string> = {
  pending: '대기',
  running: '진행 중',
  complete: '완료',
  failed: '실패',
  skipped: '대상 없음',
  stale: '이전 자료',
};

function digits(value: string) { return value.replace(/\D/g, ''); }
function formatApplicationNumber(value: string) { const number = digits(value); return number.length === 13 ? `${number.slice(0, 2)}-${number.slice(2, 6)}-${number.slice(6)}` : value; }
function formatDate(value: string) { const number = digits(value); return number.length === 8 ? `${number.slice(0, 4)}.${number.slice(4, 6)}.${number.slice(6)}.` : value || '—'; }
function uniqueClaimNumbers(values: number[]) { return [...new Set(values.filter((value) => Number.isInteger(value) && value > 0))].sort((left, right) => left - right); }
function claimNumberRange(values: number[]) {
  const numbers = uniqueClaimNumbers(values);
  const ranges: string[] = [];
  for (let index = 0; index < numbers.length; index += 1) {
    const start = numbers[index];
    let end = start;
    while (index + 1 < numbers.length && numbers[index + 1] === end + 1) {
      index += 1;
      end = numbers[index];
    }
    ranges.push(start === end ? String(start) : `${start}-${end}`);
  }
  return ranges.join(', ');
}
function claimNumbersLabel(values: number[]) { const range = claimNumberRange(values); return range ? `청구항 ${range}` : '청구항 미확인'; }
function conciseProvision(value: string) { return value.replace(/^특허법\s*/u, '').replace(/\s+/g, '') || '법조항 미확인'; }
function summaryBulletItems(value: string | string[], maxItems = 4) {
  const values = Array.isArray(value) ? value : [value];
  const items = values.flatMap((entry) => {
    const normalized = entry
      .replace(/\r/g, '')
      .replace(/(?:^|\n)\s*(?:[-*•▪◦·]|\(?\d+\)?[.)])\s*/g, '\n')
      .trim();
    if (!normalized) return [];
    return normalized
      .split(/\n+/u)
      .flatMap((line) => line.match(/.+?(?:[.!?。;]+(?=\s|$)|$)/gu) ?? [line])
      .map((item) => item.replace(/^\s*(?:[-*•▪◦·]|\(?\d+\)?[.)])\s*/u, '').trim())
      .filter(Boolean);
  });
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.toLocaleLowerCase('ko-KR').replace(/[^0-9a-z가-힣]/giu, '');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, maxItems);
}
function searchRecommendationLabel(status?: ClaimChangeSummary['searchRecommendation']['status']) {
  return ({
    not_needed: '권장하지 않음',
    optional: '심사관 선택',
    recommended: '추가 검색 권장',
    insufficient: '판단 자료 부족',
  } satisfies Record<ClaimChangeSummary['searchRecommendation']['status'], string>)[status ?? 'optional'];
}
function cpcUrl(code: string) { return `https://cls.kipro.or.kr/classification/cpc/search?code=${code.replace(/\s+/g, '')}`; }
function sourceLabel(name: string) { return ({ bibliography: '서지·이력', cpc: 'CPC', drawing: '대표도면', family: '패밀리', fullText: '전문 명세서' } as Record<string, string>)[name] ?? name; }
function defaultWorkMode(patentCase: PatentCase): WorkMode {
  const lifecycle = classifyCaseLifecycle(patentCase);
  const hasResponse = patentCase.history.some((item) => /의견서|답변서|보정서/.test(item.title));
  return ['registered_closed', 'rejected_closed', 'reexamination_after_amendment', 'response_received', 'allowed_pending_registration'].includes(lifecycle.code)
    || (patentCase.notices.length > 0 && hasResponse)
    ? 'response'
    : 'initial';
}
function workModeLabel(mode: WorkMode, lifecycle: CaseLifecycle) {
  if (['registered_closed', 'rejected_closed'].includes(lifecycle.code)) return '심사 이력 검토';
  return mode === 'response' ? '중간서류 검토' : '최초심사 검토';
}
function mapLiveCase(payload: LivePayload): PatentCase {
  const b = payload.bibliography; const applicant = b?.applicants?.[0];
  return { applicationNumber: formatApplicationNumber(b?.applicationNumber || payload.applicationNumber), applicationNumberRaw: payload.applicationNumber, title: b?.title || '발명의 명칭 미수신', titleEnglish: b?.titleEnglish || '', status: b?.finalDisposal || b?.registrationStatus || '심사 진행', updatedAt: new Date(payload.fetchedAt).toLocaleString('ko-KR'), fetchedAt: payload.fetchedAt, applicant: applicant?.name || '출원인 미수신', applicantCountry: applicant?.country || '', applicationDate: formatDate(b?.applicationDate || ''), publicationNumber: b?.publicationNumber || '', publicationDate: formatDate(b?.publicationDate || ''), registrationNumber: b?.registrationNumber || '', registrationDate: formatDate(b?.registrationDate || ''), registrationStatus: b?.registrationStatus || '', examinationRequestDate: formatDate(b?.examinationRequestDate || ''), examinerName: b?.examinerName || '—', claimCount: b?.claimCount || b?.claims.length || 0, inventorCount: b?.inventors.length || 0, abstract: b?.abstract || '초록 데이터가 없습니다.', ipc: b?.ipc || [], cpc: payload.cpc || [], claims: b?.claims || [], family: payload.family || [], history: payload.history || [], notices: payload.notices || [], drawing: payload.drawing, fullText: payload.fullText, sources: payload.sources || [], isDemo: false, cached: Boolean(payload.cached), claimStructureSource: 'bibliography' };
}
const WORKSPACE_STORAGE_KEY = 'patent-exam-workspace:last-case-v1';
const PRE_REVIEW_STORAGE_PREFIX = 'patent-exam-pre-review-v1:';
const AI_SUMMARY_VERSION = 'invention-claim-summary-2026-08-30-v6';
function readStoredWorkspace() {
  try {
    const raw = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as StoredWorkspace;
    if (!((stored.version === 1 || stored.version === 2) && stored.data?.applicationNumberRaw)) return null;
    stored.data.cached = stored.data.isDemo ? false : (stored.data.cached ?? true);
    return stored;
  } catch { return null; }
}
function writeStoredWorkspace(data: PatentCase, summary: SummaryPayload | null = null, mode: WorkMode = 'initial') {
  try { window.localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify({ version: 2, data, summary, mode, savedAt: new Date().toISOString() } satisfies StoredWorkspace)); } catch { /* 브라우저 저장소를 사용할 수 없어도 조회는 계속합니다. */ }
}
function writeStoredSummary(applicationNumber: string, summary: SummaryPayload) {
  const stored = readStoredWorkspace();
  if (stored?.data.applicationNumberRaw !== applicationNumber) return;
  writeStoredWorkspace(stored.data, summary, stored.mode ?? 'initial');
}
function readStoredPreReview(applicationNumber: string): PreReviewProgress | null {
  try {
    const raw = window.localStorage.getItem(`${PRE_REVIEW_STORAGE_PREFIX}${applicationNumber}`);
    if (!raw) return null;
    const stored = JSON.parse(raw) as { version?: number; summaryVersion?: string; progress?: PreReviewProgress };
    if (stored.version !== 2 || stored.summaryVersion !== AI_SUMMARY_VERSION || !stored.progress?.phase) return null;
    if (stored.progress.phase !== 'running') return stored.progress;
    const interruptedStep = stored.progress.currentStep;
    return {
      ...stored.progress,
      phase: 'partial',
      error: '화면을 다시 불러오는 동안 진행 중이던 분석이 중단되었습니다.',
      tasks: {
        ...(stored.progress.tasks ?? {}),
        [interruptedStep]: {
          status: 'failed',
          detail: `${preReviewTaskLabels[interruptedStep]} 분석 중단`,
          error: '다시 시도하면 저장된 결과는 유지하고 이 항목부터 재개합니다.',
        },
      },
    };
  } catch { return null; }
}
function writeStoredPreReview(applicationNumber: string, progress: PreReviewProgress) {
  try {
    window.localStorage.setItem(`${PRE_REVIEW_STORAGE_PREFIX}${applicationNumber}`, JSON.stringify({ version: 2, summaryVersion: AI_SUMMARY_VERSION, progress }));
  } catch { /* 분석 상태 저장 실패가 사건 검토를 막지 않도록 합니다. */ }
}
function syncCaseUrl(applicationNumber: string) {
  const url = new URL(window.location.href);
  url.searchParams.set('applicationNumber', applicationNumber);
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}
async function requestPatentCase(applicationNumber: string, refresh = false) {
  if (applicationNumber === demoCase.applicationNumberRaw) return { data: demoCase, usage: null };
  const parameters = new URLSearchParams({ applicationNumber });
  if (refresh) parameters.set('refresh', 'true');
  const response = await fetch(`/api/patent?${parameters}`, { cache: 'no-store' });
  const payload = (await response.json()) as LivePayload & { error?: string };
  if (!response.ok) throw new Error(payload.error || '사건 조회에 실패했습니다.');
  return { data: mapLiveCase(payload), usage: payload.usage };
}
const aiRoleToSearchRole: Record<AiClaimFeatureRole, SearchRole> = {
  core: '핵심 검색',
  combination: '조합 검색',
  general: '일반 구성',
  exclude: '검색 제외',
  review: '확인 필요',
};

function searchFeatureRows(
  claims: Claim[],
  selectedClaimNumber: number,
  analyses: AiClaimFeatureAnalysis[] = [],
): ClaimFeature[] {
  if (!analyses.length) return [];
  const analysis = analyzeClaims(claims);
  const depthByNumber = new Map(analysis.map((claim) => [claim.number, claim.depth]));
  const ancestorNumbers = [...claimAncestorNumbers(analysis, selectedClaimNumber)]
    .sort((left, right) => (depthByNumber.get(left) ?? 0) - (depthByNumber.get(right) ?? 0) || left - right);
  const lineage = [...ancestorNumbers, selectedClaimNumber];
  const analysesByClaim = new Map(analyses.map((item) => [item.claimNumber, item]));
  const seen = new Set<string>();
  return lineage.flatMap((number) => {
    const inherited = number !== selectedClaimNumber;
    return (analysesByClaim.get(number)?.features ?? []).map((feature, index) => ({
      id: `${number}${String.fromCharCode(65 + index)}`,
      label: feature.label,
      text: feature.wording,
      role: aiRoleToSearchRole[feature.recommendedRole] ?? '확인 필요',
      sourceClaimNumber: number,
      inherited,
      category: feature.category,
      importance: feature.importance,
      rationale: feature.rationale,
    }));
  }).filter((feature) => {
    const key = feature.text.replace(/\s+/g, '').toLocaleLowerCase('ko-KR');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
async function fetchUsage() { const response = await fetch('/api/patent/usage', { cache: 'no-store' }); if (!response.ok) throw new Error('사용량 조회 실패'); return (await response.json()) as ApiUsage; }

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 600px)');
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return isMobile;
}

export default function ExamWorkspace() {
  const [data, setData] = useState<PatentCase>(demoCase); const [query, setQuery] = useState(demoCase.applicationNumber); const [mode, setMode] = useState<WorkMode>('initial'); const [view, setView] = useState<WorkView>('overview');
  const [resourceOpen, setResourceOpen] = useState(false); const [resourceTab, setResourceTab] = useState<ResourceTab>('biblio'); const [loading, setLoading] = useState(false); const [loadingMessage, setLoadingMessage] = useState('사건자료를 불러오는 중입니다.'); const [toast, setToast] = useState(''); const [usage, setUsage] = useState<ApiUsage | null>(null);
  const [summary, setSummary] = useState<SummaryPayload | null>(null); const [summaryBusy, setSummaryBusy] = useState(false); const [summaryError, setSummaryError] = useState(''); const [selectedClaim, setSelectedClaim] = useState(1); const [resourceClaimNumber, setResourceClaimNumber] = useState(1); const [featureRoleOverrides, setFeatureRoleOverrides] = useState<Record<string, SearchRole>>({});
  const [searchRan, setSearchRan] = useState(false); const [candidates, setCandidates] = useState<Candidate[]>([]); const [selectedNotice, setSelectedNotice] = useState<NoticeItem | null>(null); const [drawingOpen, setDrawingOpen] = useState(false); const [packageBusy, setPackageBusy] = useState(false); const [restoring, setRestoring] = useState(true);
  const [claimTreeOpen, setClaimTreeOpen] = useState(false);
  const [originalTarget, setOriginalTarget] = useState<OriginalTarget | null>(null);
  const [noticeTarget, setNoticeTarget] = useState<OriginalTarget | null>(null);
  const [selectedRound, setSelectedRound] = useState('');
  const [claimChanges, setClaimChanges] = useState<ClaimChangePayload | null>(null); const [claimChangesBusy, setClaimChangesBusy] = useState(false); const [claimChangesError, setClaimChangesError] = useState('');
  const [claimChangeSummary, setClaimChangeSummary] = useState<ClaimChangeSummaryPayload | null>(null); const [, setClaimChangeSummaryBusy] = useState(false); const [claimChangeSummaryError, setClaimChangeSummaryError] = useState('');
  const [noticeAnalyses, setNoticeAnalyses] = useState<Record<string, NoticeAnalysis>>({});
  const [amendmentResolutions, setAmendmentResolutions] = useState<Record<string, AmendmentResolutionPayload>>({});
  const [preReview, setPreReview] = useState<PreReviewProgress>({ phase: 'idle', currentStep: 'case', completedSteps: [], noticeDone: 0, noticeTotal: 0, error: '' });
  const [strategyKeywordsByClaim, setStrategyKeywordsByClaim] = useState<Record<string, string[]>>({});
  const [searchOptionsByClaim, setSearchOptionsByClaim] = useState<Record<string, SearchOptions>>({});
  const [roundLinks, setRoundLinks] = useState<RoundDocumentLink[]>([]);
  const [includeOriginals, setIncludeOriginals] = useState(false);
  const strategyDraftKeywords = useMemo(() => strategyKeywordsByClaim[selectedClaim] ?? [], [strategyKeywordsByClaim, selectedClaim]);
  const searchOptions = searchOptionsByClaim[selectedClaim] ?? DEFAULT_SEARCH_OPTIONS;
  const setStrategyDraftKeywords = (update: string[] | ((words: string[]) => string[])) => setStrategyKeywordsByClaim((current) => ({ ...current, [selectedClaim]: typeof update === 'function' ? update(current[selectedClaim] ?? []) : update }));
  function changeSearchOptions(update: Partial<SearchOptions>) { setSearchOptionsByClaim((current) => ({ ...current, [selectedClaim]: { ...(current[selectedClaim] ?? DEFAULT_SEARCH_OPTIONS), ...update } })); }
  const [sourceDetailsOpen, setSourceDetailsOpen] = useState(false); const [caseDetailsOpen, setCaseDetailsOpen] = useState(false);
  const claimChangesAttemptedFor = useRef<string | null>(null);
  const claimChangeSummaryAttemptedFor = useRef<string | null>(null);
  const stepRefs = useRef<Partial<Record<WorkView, HTMLButtonElement | null>>>({});
  const scrollPositions = useRef<Record<string, number>>({});
  const activeCase = useRef(demoCase.applicationNumberRaw);
  const pendingOriginalClaim = useRef<number | null>(null);
  const isMobile = useIsMobile();
  const loadCachedSummary = useCallback(async (applicationNumber: string) => {
    setSummaryError('');
    try {
      const response = await fetch(`/api/patent/summary?${new URLSearchParams({ applicationNumber })}`, { cache: 'no-store' });
      const payload = (await response.json()) as SummaryPayload & { error?: string };
      if (activeCase.current !== applicationNumber) return;
      if (!response.ok) throw new Error(payload.error || '저장된 AI 분석을 확인하지 못했습니다.');
      if (payload.summary && payload.version === AI_SUMMARY_VERSION) {
        setSummary(payload);
        writeStoredSummary(applicationNumber, payload);
      }
      else setSummary(null);
    } catch (error) { if (activeCase.current === applicationNumber) setSummaryError(error instanceof Error ? error.message : '저장된 AI 분석을 확인하지 못했습니다.'); }
  }, []);
  const summaryRunError = useRef('');
  const generateSummary = useCallback(async (applicationNumber: string, force = false): Promise<SummaryPayload | null> => {
    setSummaryBusy(true); setSummaryError(''); summaryRunError.current = '';
    try {
      const fullText = await fetchFullText(applicationNumber);
      if (fullText.usage) setUsage(fullText.usage);
      if (fullText.claims.length > 0 && data.applicationNumberRaw === applicationNumber) {
        const xmlClaims = fullText.claims
          .filter((claim) => Number.isInteger(claim.number) && claim.number > 0 && claim.text.trim())
          .sort((left, right) => left.number - right.number);
        if (xmlClaims.length > 0) {
          const nextData: PatentCase = {
            ...data,
            claims: xmlClaims,
            claimCount: xmlClaims.length,
            claimStructureSource: 'fulltext',
            fullText: { fileName: fullText.sourceFileName, fileUrl: fullText.sourceFileUrl || '' },
            fullTextHash: fullText.sourceHash,
            fullTextFetchedAt: fullText.fetchedAt,
          };
          const nextSelectedClaim =
            xmlClaims.find((claim) => claim.number === selectedClaim) ?? xmlClaims[0];
          setData(nextData);
          setSelectedClaim(nextSelectedClaim.number);
          const stored = readStoredWorkspace();
          writeStoredWorkspace(
            nextData,
            stored?.data.applicationNumberRaw === applicationNumber ? stored.summary : null,
            stored?.data.applicationNumberRaw === applicationNumber
              ? stored.mode ?? mode
              : mode,
          );
        }
      }

      const parameters = new URLSearchParams({ applicationNumber });
      if (force) parameters.set('force', 'true');
      const response = await fetch(`/api/patent/summary?${parameters}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fullText }),
      });
      const payload = (await response.json()) as SummaryPayload & { error?: string };
      if (!response.ok) throw new Error(payload.error || 'AI 분석을 불러오지 못했습니다.');
      setSummary(payload); writeStoredSummary(applicationNumber, payload);
      return payload;
    } catch (error) { summaryRunError.current = error instanceof Error ? error.message : 'AI 분석을 불러오지 못했습니다.'; setSummaryError(summaryRunError.current); return null; }
    finally { setSummaryBusy(false); }
  }, [data, mode, selectedClaim]);
  const loadClaimChanges = useCallback(async (applicationNumber: string, force = false): Promise<ClaimChangePayload | null> => {
    claimChangesAttemptedFor.current = applicationNumber;
    setClaimChangesBusy(true); setClaimChangesError('');
    try {
      const parameters = new URLSearchParams({ applicationNumber });
      if (force) parameters.set('refresh', 'true');
      const response = await fetch(`/api/patent/claim-changes?${parameters}`, { cache: 'no-store' });
      const payload = await response.json() as ClaimChangePayload;
      if (!response.ok) throw new Error(payload.error || '청구항 변동이력을 불러오지 못했습니다.');
      if (activeCase.current !== applicationNumber) return null;
      setClaimChanges(payload);
      if (payload.usage) setUsage(payload.usage);
      return payload;
    } catch (error) {
      if (activeCase.current === applicationNumber) setClaimChangesError(error instanceof Error ? error.message : '청구항 변동이력을 불러오지 못했습니다.');
      return null;
    } finally {
      if (activeCase.current === applicationNumber) setClaimChangesBusy(false);
    }
  }, []);
  const loadCachedClaimChangeSummary = useCallback(async (applicationNumber: string, documentNumbers: string[]) => {
    const signature = `${applicationNumber}:${[...documentNumbers].sort().join(',')}`;
    claimChangeSummaryAttemptedFor.current = signature;
    setClaimChangeSummaryError('');
    try {
      const response = await fetch(`/api/patent/claim-change-summary?${new URLSearchParams({ applicationNumber })}`, { cache: 'no-store' });
      const payload = await response.json() as ClaimChangeSummaryPayload & { error?: string };
      if (!response.ok) throw new Error(payload.error || '저장된 청구항 변동 AI 요약을 확인하지 못했습니다.');
      const expected = [...documentNumbers].map(digits).sort().join(',');
      const received = [...(payload.sourceDocumentNumbers ?? [])].map(digits).sort().join(',');
      if (activeCase.current !== applicationNumber) return;
      setClaimChangeSummary(payload.summary && expected === received ? payload : null);
    } catch (error) {
      if (activeCase.current === applicationNumber) setClaimChangeSummaryError(error instanceof Error ? error.message : '저장된 청구항 변동 AI 요약을 확인하지 못했습니다.');
    }
  }, []);
  const claimAnalysis = analyzeClaims(data.claims);
  const verifiedAmendments = useMemo(() => new Set((claimChanges?.documents ?? []).filter((document) => document.changes.length > 0).map((document) => document.documentNumber)), [claimChanges]);
  const examinationRounds = useMemo(() => buildExaminationRounds<NoticeItem>(data.history, data.notices, verifiedAmendments, roundLinks.filter((link) => link.historyKey === caseHistoryKey(data.history))), [data.history, data.notices, verifiedAmendments, roundLinks]);
  const lifecycle = classifyCaseLifecycle(data);
  const steps = workspaceSteps.filter(([step]) => step !== 'response-analysis' || examinationRounds.length > 0);
  const activeIndex = Math.max(0, steps.findIndex((step) => step[0] === view));
  const activeAvailableIndex = Math.max(0, activeIndex);
  const stepNumber = (target: WorkView) => String(Math.max(1, steps.findIndex(([step]) => step === target) + 1)).padStart(2, '0');
  const targetLabel = `청구항 ${selectedClaim} · ${data.claimStructureSource === 'fulltext' ? '전문 XML' : '서지 API'} · 원문 버전 미확인`;
  const basisStatus = summary?.basisStatus === 'changed' ? 'changed' : summary?.summary ? analysisBasisStatus(summary.sourceBasis, data.history, data.fullTextHash) : 'unverified';
  const failedSources = data.sources.filter((source) => !source.ok);
  const approvedReviewItems = (summary?.reviewItems ?? []).filter((item) => isApprovedReviewStatus(item.reviewStatus));
  const approvedKeywords = approvedReviewItems.filter((item) => item.entityId.startsWith('searchKeywords.')).map((item) => item.text);
  const visibleClaimChanges = claimChanges?.applicationNumber === data.applicationNumberRaw ? claimChanges : null;
  const linkedClaimChangeDocuments = useMemo(() => visibleClaimChanges?.documents.filter((document) => examinationRounds.some((round) => round.amendments.some((item) => digits(item.documentNumber) === digits(document.documentNumber)))) ?? [], [visibleClaimChanges, examinationRounds]);
  const claimChangeDocumentNumbers = useMemo(() => linkedClaimChangeDocuments.map((document) => digits(document.documentNumber)), [linkedClaimChangeDocuments]);
  const claimChangeSignature = `${data.applicationNumberRaw}:${claimChangesInputKey(linkedClaimChangeDocuments)}`;
  const aiStrategySuggestions = [...new Set([...(summary?.summary?.searchKeywords ?? []), ...(inputIsCurrent(claimChangeSummary?.inputKey, claimChangesInputKey(linkedClaimChangeDocuments)) ? claimChangeSummary?.summary?.searchRecommendation.targetFeatures ?? [] : [])].map((item) => item.trim()).filter(Boolean))];
  const strategyKeywords = strategyDraftKeywords;
  const hasAmendmentDocuments = examinationRounds.some((round) => round.amendments.length > 0);
  const failedPreReviewTasks = Object.values(preReview.tasks ?? {}).filter((task) => task?.status === 'failed').length;
  const claimFeatureAnalyses = summary?.summary?.claimFeatureAnalyses;
  const features = searchFeatureRows(data.claims, selectedClaim, basisStatus === 'current' ? claimFeatureAnalyses ?? [] : [])
    .map((feature) => ({ ...feature, role: featureRoleOverrides[feature.id] ?? feature.role }));
  const searchExpression = buildSearchExpression(data, features, strategyKeywords, searchOptions);
  const readiness = reviewReadiness({ history: data.history, fullTextHash: data.fullTextHash, summary, rounds: examinationRounds, notices: noticeAnalyses, resolutions: amendmentResolutions, documents: visibleClaimChanges?.documents ?? [], changeSummary: claimChangeSummary });
  const currentChangeSummary = readiness.changes ? claimChangeSummary : null;
  const currentResolutions = Object.fromEntries(examinationRounds.flatMap((round) => {
    const result = amendmentResolutions[round.notice.documentNumber];
    const notice = noticeAnalyses[round.notice.documentNumber];
    const related = linkedClaimChangeDocuments.filter((document) => round.amendments.some((item) => item.documentNumber === document.documentNumber));
    return related.length === round.amendments.length && notice?.basisStatus === 'current' && result?.summary && round.connectionStatus === 'linked' && inputIsCurrent(result.inputKey, amendmentInputKey(notice.summary, related)) ? [[round.notice.documentNumber, result]] : [];
  }));
  useEffect(() => {
    let cancelled = false;
    const requested = digits(new URLSearchParams(window.location.search).get('applicationNumber') || '');
    const stored = readStoredWorkspace();
    if (stored && (!requested || requested === stored.data.applicationNumberRaw)) {
      window.queueMicrotask(() => {
        if (cancelled) return;
        const restoredSummary = stored.summary?.version === AI_SUMMARY_VERSION ? stored.summary : null;
        const restoredMode = stored.mode ?? defaultWorkMode(stored.data);
        const firstClaimNumber = stored.data.claims[0]?.number || 1;
        setData(stored.data); setQuery(stored.data.applicationNumber); setMode(restoredMode); setView('overview'); setSelectedClaim(firstClaimNumber); setResourceClaimNumber(firstClaimNumber); setSummary(restoredSummary); restorePreferences(stored.data); setPreReview(readStoredPreReview(stored.data.applicationNumberRaw) ?? { phase: 'idle', currentStep: 'case', completedSteps: [], noticeDone: 0, noticeTotal: stored.data.notices.length, error: '' }); setRestoring(false);
        if (!stored.data.isDemo) void loadCachedSummary(stored.data.applicationNumberRaw);
      });
      return () => { cancelled = true; };
    }
    if (!/^(10|20)\d{11}$/.test(requested)) { window.queueMicrotask(() => { if (!cancelled) setRestoring(false); }); return () => { cancelled = true; }; }
    void requestPatentCase(requested).then(({ data: restoredData, usage: restoredUsage }) => {
      if (cancelled) return;
      const restoredMode = defaultWorkMode(restoredData);
      const firstClaimNumber = restoredData.claims[0]?.number || 1;
      setData(restoredData); setQuery(restoredData.applicationNumber); setMode(restoredMode); setView('overview'); setSelectedClaim(firstClaimNumber); setResourceClaimNumber(firstClaimNumber); restorePreferences(restoredData); setPreReview(readStoredPreReview(restoredData.applicationNumberRaw) ?? { phase: 'idle', currentStep: 'case', completedSteps: [], noticeDone: 0, noticeTotal: restoredData.notices.length, error: '' }); if (restoredUsage) setUsage(restoredUsage); writeStoredWorkspace(restoredData, null, restoredMode); syncCaseUrl(restoredData.applicationNumberRaw);
      if (!restoredData.isDemo) void loadCachedSummary(restoredData.applicationNumberRaw);
    }).catch((error) => { if (!cancelled) setToast(error instanceof Error ? error.message : '이전 사건을 불러오지 못했습니다.'); }).finally(() => { if (!cancelled) setRestoring(false); });
    return () => { cancelled = true; };
  }, [loadCachedSummary]);
  useEffect(() => { void fetchUsage().then(setUsage).catch(() => undefined); }, []);
  useEffect(() => {
    if (restoring) return;
    writeStoredWorkspace(data, summary, mode);
  }, [data, summary, mode, restoring]);
  useEffect(() => {
    if (restoring) return;
    const positions = scrollPositions.current;
    const save = () => {
      const preferences = { version: 1, view, selectedClaim, selectedRound, resourceTab,
        keywords: strategyDraftKeywords, claimKeywords: strategyKeywordsByClaim, searchOptions: searchOptionsByClaim, featureRoles: featureRoleOverrides, scrollPositions: positions };
      try { window.localStorage.setItem(WORKSPACE_PREFERENCES_PREFIX + data.applicationNumberRaw, JSON.stringify(preferences)); } catch { /* Browser storage can be disabled. */ }
    };
    let timer: number | undefined;
    const onScroll = () => {
      if (resourceOpen || selectedNotice || claimTreeOpen || drawingOpen) return;
      positions[view] = window.scrollY;
      window.clearTimeout(timer);
      timer = window.setTimeout(save, 200);
    };
    save();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('pagehide', save);
    return () => { window.clearTimeout(timer); window.removeEventListener('scroll', onScroll); window.removeEventListener('pagehide', save); save(); };
  }, [restoring, data.applicationNumberRaw, view, selectedClaim, selectedRound, resourceTab, strategyDraftKeywords, strategyKeywordsByClaim, searchOptionsByClaim, featureRoleOverrides, resourceOpen, selectedNotice, claimTreeOpen, drawingOpen]);
  useEffect(() => {
    if (restoring || data.isDemo) return;
    writeStoredPreReview(data.applicationNumberRaw, preReview);
  }, [data.applicationNumberRaw, data.isDemo, preReview, restoring]);
  useEffect(() => {
    if (data.isDemo) return;
    let cancelled = false;
    void fetch(`/api/patent/claim-changes?${new URLSearchParams({ applicationNumber: data.applicationNumberRaw, cachedOnly: 'true' })}`, { cache: 'no-store' })
      .then(async (response) => { if (response.ok) { const payload = await response.json() as ClaimChangePayload; if (!cancelled) setClaimChanges(payload); } })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [data.applicationNumberRaw, data.isDemo]);
  useEffect(() => {
    if (data.isDemo || !data.notices.length) return;
    let cancelled = false;
    const applicationNumber = data.applicationNumberRaw;
    void Promise.all(data.notices.map(async (notice) => {
      const key = digits(notice.documentNumber);
      const parameters = new URLSearchParams({ applicationNumber, sendNumber: notice.documentNumber });
      const [noticeResponse, resolutionResponse] = await Promise.all([
        fetch(`/api/patent/notice-analysis?${parameters}`, { cache: 'no-store' }),
        fetch(`/api/patent/amendment-resolution?${parameters}`, { cache: 'no-store' }),
      ]);
      if (noticeResponse.ok) {
        const payload = await noticeResponse.json() as NoticeAnalysis;
        if (!cancelled) setNoticeAnalyses((current) => ({ ...current, [key]: payload }));
      }
      if (resolutionResponse.ok) {
        const payload = await resolutionResponse.json() as AmendmentResolutionPayload;
        if (!cancelled && payload.summary) setAmendmentResolutions((current) => ({ ...current, [key]: payload }));
      }
    })).catch(() => undefined);
    return () => { cancelled = true; };
  }, [data.applicationNumberRaw, data.isDemo, data.notices]);
  useEffect(() => {
    const documentNumbers = claimChangeDocumentNumbers;
    if (!documentNumbers.length) return;
    if (claimChangeSummaryAttemptedFor.current === claimChangeSignature) return;
    void loadCachedClaimChangeSummary(data.applicationNumberRaw, documentNumbers);
  }, [claimChangeSignature, claimChangeDocumentNumbers, data.applicationNumberRaw, loadCachedClaimChangeSummary]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 3200); return () => window.clearTimeout(timer); }, [toast]);
  useEffect(() => {
    stepRefs.current[view]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [mode, view]);
  useEffect(() => {
    function handlePopState() {
      if (selectedNotice) { setSelectedNotice(null); return; }
      if (drawingOpen) { setDrawingOpen(false); return; }
      if (claimTreeOpen) {
        setClaimTreeOpen(false);
        const claimNumber = pendingOriginalClaim.current;
        pendingOriginalClaim.current = null;
        if (claimNumber !== null) {
          setResourceClaimNumber(claimNumber);
          setOriginalTarget({ sourceId: `claim-${claimNumber}`, locator: `청구항 ${claimNumber}`, excerpt: '' });
          setResourceTab('claims');
          if (!resourceOpen) window.history.pushState({ ...window.history.state, examOverlay: 'resource' }, '', window.location.href);
          setResourceOpen(true);
        }
        return;
      }
      if (resourceOpen) setResourceOpen(false);
    }
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [claimTreeOpen, drawingOpen, resourceOpen, selectedNotice]);
  useEffect(() => {
    if (restoring || data.isDemo) return;
    let cancelled = false;
    const parameters = new URLSearchParams({ applicationNumber: data.applicationNumberRaw });
    void fetch(`/api/patent/round-links?${parameters}`, { cache: 'no-store' }).then(async (response) => {
      const payload = await response.json() as { links?: RoundDocumentLink[]; error?: string };
      if (!response.ok) throw new Error(payload.error || '문서 연결을 불러오지 못했습니다.');
      if (!cancelled) setRoundLinks(payload.links ?? []);
    }).catch((error) => { if (!cancelled) setToast(error instanceof Error ? error.message : '문서 연결 조회 실패'); });
    void fetch(`/api/patent/candidates?${parameters}`, { cache: 'no-store' }).then(async (response) => {
      const payload = await response.json() as { candidates?: Candidate[]; error?: string };
      if (!response.ok) throw new Error(payload.error || '후보문헌을 불러오지 못했습니다.');
      if (!cancelled) setCandidates(payload.candidates ?? []);
    }).catch((error) => { if (!cancelled) setToast(error instanceof Error ? error.message : '후보문헌 조회 실패'); });
    return () => { cancelled = true; };
  }, [restoring, data.applicationNumberRaw, data.isDemo, data.history]);
  async function saveLinks(link: RoundDocumentLink) {
    const application = data.applicationNumberRaw;
    const response = await fetch(`/api/patent/round-links?${new URLSearchParams({ applicationNumber: application })}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(link),
    });
    const payload = await response.json() as { links?: RoundDocumentLink[]; error?: string };
    if (!response.ok) throw new Error(payload.error || '문서 연결을 저장하지 못했습니다.');
    if (activeCase.current !== application) return;
    setRoundLinks(payload.links ?? []);
    setPreReview((current) => ({ ...current, phase: 'idle', tasks: {}, error: '' }));
    setToast('문서 연결을 저장했습니다. AI 분석은 자동 실행하지 않습니다.');
  }
  async function saveCandidate(input: Partial<Candidate>) {
    const application = data.applicationNumberRaw;
    const response = await fetch(`/api/patent/candidates?${new URLSearchParams({ applicationNumber: application })}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
    });
    const payload = await response.json() as { candidates?: Candidate[]; error?: string };
    if (!response.ok) throw new Error(payload.error || '후보문헌을 저장하지 못했습니다.');
    if (activeCase.current !== application) return;
    setCandidates(payload.candidates ?? []); setToast('후보문헌을 저장했습니다.');
  }
  async function removeCandidate(candidate: Candidate) {
    const application = data.applicationNumberRaw;
    try {
      const response = await fetch(`/api/patent/candidates?${new URLSearchParams({ applicationNumber: application, id: candidate.id })}`, { method: 'DELETE' });
      const payload = await response.json() as { candidates?: Candidate[]; error?: string };
      if (activeCase.current !== application) return;
      if (!response.ok) throw new Error(payload.error || '문헌을 제외하지 못했습니다.');
      setCandidates(payload.candidates ?? []); setToast('후보 목록에서 제외했습니다.');
    } catch (error) { if (activeCase.current === application) setToast(error instanceof Error ? error.message : '문헌을 제외하지 못했습니다.'); }
  }
  function restorePreferences(patentCase: PatentCase) {
    activeCase.current = patentCase.applicationNumberRaw;
    let preferences: WorkspacePreferences | null = null;
    try { preferences = parseWorkspacePreferences(window.localStorage.getItem(WORKSPACE_PREFERENCES_PREFIX + patentCase.applicationNumberRaw)); } catch { /* Storage can be disabled. */ }
    scrollPositions.current = preferences?.scrollPositions ?? {};
    setRoundLinks([]); setCandidates([]); setStrategyKeywordsByClaim({}); setSearchOptionsByClaim({});
    if (!preferences) { setSelectedRound(''); return; }
    const allowed = workspaceSteps.filter(([step]) => step !== 'response-analysis' || patentCase.notices.length > 0).map(([step]) => step);
    setView(allowed.includes(preferences.view) ? preferences.view : 'overview');
    setSelectedClaim(patentCase.claims.some((claim) => claim.number === preferences.selectedClaim) ? preferences.selectedClaim : patentCase.claims[0]?.number || 1);
    setSelectedRound(preferences.selectedRound);
    if (['biblio', 'claims', 'specification', 'drawing', 'history', 'family', 'documents'].includes(preferences.resourceTab)) setResourceTab(preferences.resourceTab as ResourceTab);
    setStrategyKeywordsByClaim(Object.keys(preferences.claimKeywords ?? {}).length ? preferences.claimKeywords! : { [preferences.selectedClaim]: preferences.keywords });
    setSearchOptionsByClaim(preferences.searchOptions ?? {});
    setFeatureRoleOverrides(preferences.featureRoles as Record<string, SearchRole>);
    const scrollTop = preferences.scrollPositions[preferences.view] || 0;
    window.setTimeout(() => window.scrollTo({ top: scrollTop }), 150);
  }
  function go(next: WorkView) {
    scrollPositions.current[view] = window.scrollY;
    setView(next);
    window.requestAnimationFrame(() => window.scrollTo({ top: scrollPositions.current[next] || 0, behavior: 'instant' }));
  }
  function selectMode(next: WorkMode) { setMode(next); setView('overview'); writeStoredWorkspace(data, summary, next); }
  function pushMobileOverlay(name: 'resource' | 'notice' | 'drawing' | 'claim-tree') {
    if (!isMobile) return;
    window.history.pushState({ ...window.history.state, examOverlay: name }, '', window.location.href);
  }
  function openResource(tab: ResourceTab) {
    setResourceTab(tab);
    if (tab !== 'claims' && tab !== 'specification') setOriginalTarget(null);
    if (!resourceOpen) pushMobileOverlay('resource');
    setResourceOpen(true);
  }
  function closeResource() {
    if (isMobile && window.history.state?.examOverlay === 'resource') window.history.back();
    else setResourceOpen(false);
  }
  function openNotice(notice: NoticeItem, target?: OriginalTarget) { setNoticeTarget(target ?? null); setSelectedNotice(notice); pushMobileOverlay('notice'); }
  function closeNotice() {
    if (isMobile && window.history.state?.examOverlay === 'notice') window.history.back();
    else setSelectedNotice(null);
  }
  function openDrawing() { setDrawingOpen(true); pushMobileOverlay('drawing'); }
  function closeDrawing() {
    if (isMobile && window.history.state?.examOverlay === 'drawing') window.history.back();
    else setDrawingOpen(false);
  }
  function openClaimResource(number: number) {
    setResourceClaimNumber(number);
    setOriginalTarget({ sourceId: `claim-${number}`, locator: `청구항 ${number}`, excerpt: '' });
    openResource('claims');
  }
  function openClaimFromTree(number: number) {
    if (isMobile && window.history.state?.examOverlay === 'claim-tree') {
      pendingOriginalClaim.current = number;
      window.history.back();
    } else {
      setClaimTreeOpen(false);
      openClaimResource(number);
    }
  }
  function handleOriginalLoaded(original: FullTextDocument) {
    if (original.usage) setUsage(original.usage);
    setData((current) => current.applicationNumberRaw !== original.applicationNumber ? current : {
      ...current, claims: original.claims.length ? original.claims : current.claims,
      claimCount: original.claims.length || current.claimCount, claimStructureSource: original.claims.length ? 'fulltext' : current.claimStructureSource,
      fullText: { fileName: original.sourceFileName, fileUrl: original.sourceFileUrl || '' },
      fullTextHash: original.sourceHash, fullTextFetchedAt: original.fetchedAt,
    });
  }
  async function copyText(value: string, label: string) { try { await navigator.clipboard.writeText(value); setToast(`${label}을 복사했습니다.`); } catch { setToast(`${label}을 복사하지 못했습니다.`); } }
  async function generateClaimChangeAnalysis(force = false, sourceDocuments: ClaimChangeDocument[] = linkedClaimChangeDocuments): Promise<ClaimChangeSummaryPayload | null> {
    if (!sourceDocuments.length) {
      setToast('보정서와 연결된 청구항 변동이 없어 AI 분석을 실행할 수 없습니다.');
      return null;
    }
    setClaimChangeSummaryBusy(true); setClaimChangeSummaryError('');
    try {
      const parameters = new URLSearchParams({ applicationNumber: data.applicationNumberRaw });
      if (force) parameters.set('force', 'true');
      const response = await fetch(`/api/patent/claim-change-summary?${parameters}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documents: sourceDocuments,
          amendments: examinationRounds.flatMap((round) => round.amendments.map((item) => ({ documentNumber: item.documentNumber, date: item.date, roundNumber: round.number }))),
        }),
      });
      const payload = await response.json() as ClaimChangeSummaryPayload & { error?: string };
      if (!response.ok || !payload.summary) throw new Error(payload.error || '청구항 변동 AI 요약을 생성하지 못했습니다.');
      setClaimChangeSummary(payload);
      claimChangeSummaryAttemptedFor.current = claimChangeSignature;
      void fetchUsage().then(setUsage).catch(() => undefined);
      return payload;
    } catch (error) {
      setClaimChangeSummaryError(error instanceof Error ? error.message : '청구항 변동 AI 요약을 생성하지 못했습니다.');
      return null;
    } finally {
      setClaimChangeSummaryBusy(false);
    }
  }
  async function analyzeNotice(round: ExaminationRound<NoticeItem>, force = false) {
    const key = digits(round.notice.documentNumber);
    if (!force && noticeAnalyses[key]?.basisStatus === 'current') return noticeAnalyses[key];
    const parameters = new URLSearchParams({ applicationNumber: data.applicationNumberRaw, sendNumber: round.notice.documentNumber });
    if (force) parameters.set('force', 'true');
    const response = await fetch(`/api/patent/notice-analysis?${parameters}`, { method: 'POST' });
    const payload = await response.json() as NoticeAnalysis;
    if (!response.ok) throw new Error(payload.error || `${round.number}차 통지서를 분석하지 못했습니다.`);
    setNoticeAnalyses((current) => ({ ...current, [key]: payload }));
    return payload;
  }
  async function analyzeResolution(round: ExaminationRound<NoticeItem>, noticeAnalysis: NoticeAnalysis, documents: ClaimChangeDocument[], force = false) {
    if (round.connectionStatus !== 'linked') throw new Error(`${round.number}차 회차의 문서 연결을 확정할 수 없어 AI 해소 검토를 보류했습니다.`);
    const key = digits(round.notice.documentNumber);
    const expected = documents.map((document) => digits(document.documentNumber)).sort().join(',');
    const cached = amendmentResolutions[key];
    const received = (cached?.sourceDocumentNumbers ?? []).map(digits).sort().join(',');
    if (!force && cached?.summary && expected === received && inputIsCurrent(cached.inputKey, amendmentInputKey(noticeAnalysis.summary, documents))) return cached;
    const parameters = new URLSearchParams({ applicationNumber: data.applicationNumberRaw, sendNumber: round.notice.documentNumber });
    if (force) parameters.set('force', 'true');
    const response = await fetch(`/api/patent/amendment-resolution?${parameters}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ noticeSummary: noticeAnalysis.summary, documents }),
    });
    const payload = await response.json() as AmendmentResolutionPayload;
    if (!response.ok || !payload.summary) throw new Error(payload.error || `${round.number}차 보정 결과를 분석하지 못했습니다.`);
    setAmendmentResolutions((current) => ({ ...current, [key]: payload }));
    return payload;
  }
  async function runPreReview(force = false, requestedStep?: PreReviewStep) {
    if (preReview.phase === 'running') return;
    const noticesAlreadyComplete = readiness.notices;
    const amendmentsAlreadyComplete = readiness.amendments;
    let taskSnapshot: Partial<Record<PreReviewStep, PreReviewTaskState>> = {
      case: { status: data.sources.some((item) => item.name === 'bibliography' && item.ok) ? 'complete' : 'failed', detail: '서지·이력 확인', error: data.sources.find((item) => item.name === 'bibliography' && !item.ok)?.message },
      technology: readiness.technology
        ? { status: 'complete', detail: '저장된 발명 요약 사용' }
        : { status: 'pending', detail: '전문 명세서 분석 대기' },
      notices: examinationRounds.length === 0
        ? { status: 'skipped', detail: '의견제출통지서 없음' }
        : noticesAlreadyComplete
          ? { status: 'complete', detail: `통지서 ${examinationRounds.length}/${examinationRounds.length} 분석 완료` }
          : { status: 'pending', detail: `통지서 0/${examinationRounds.length} 분석 대기` },
      amendments: !hasAmendmentDocuments
        ? { status: 'skipped', detail: '청구항 보정 확인 없음 · 절차 보완·미분류 문서는 제외' }
        : amendmentsAlreadyComplete
          ? { status: 'complete', detail: '청구항 변동과 거절이유 해소 검토 완료' }
          : { status: 'pending', detail: '청구항 변동 분석 대기' },
      results: { status: 'pending', detail: '분석 결과 정리 대기' },

    };
    const shouldRun = (step: PreReviewStep) => requestedStep ? requestedStep === step : force || step === 'case' || step === 'results' || (step === 'technology' ? !readiness.technology : step === 'notices' ? !readiness.notices : !readiness.amendments);
    const reportTask = (step: PreReviewStep, state: PreReviewTaskState) => {
      taskSnapshot = { ...taskSnapshot, [step]: state };
      setPreReview((current) => ({ ...current, currentStep: step, tasks: { ...(current.tasks ?? {}), [step]: state } }));
    };
    const completedSteps = () => (Object.entries(taskSnapshot) as Array<[PreReviewStep, PreReviewTaskState]>)
      .filter(([, task]) => task.status === 'complete' || task.status === 'skipped')
      .map(([step]) => step);

    if (force && !requestedStep) {
      for (const step of ['technology', 'notices', 'amendments', 'results'] as PreReviewStep[]) {
        taskSnapshot[step] = { status: 'pending', detail: `${preReviewTaskLabels[step]} 재분석 대기` };
      }
    } else if (requestedStep) {
      taskSnapshot[requestedStep] = { status: 'pending', detail: `${preReviewTaskLabels[requestedStep]} 다시 시도 대기` };
    }
    setPreReview({
      phase: 'running',
      currentStep: requestedStep ?? 'case',
      completedSteps: completedSteps(),
      noticeDone: noticesAlreadyComplete ? examinationRounds.length : 0,
      noticeTotal: examinationRounds.length,
      error: '',
      tasks: taskSnapshot,
    });

    try {
      if (shouldRun('technology')) {
        reportTask('technology', { status: 'running', detail: '전문 명세서와 청구항을 분석하는 중' });
        const generated = !readiness.technology || force || data.claimStructureSource !== 'fulltext'
          ? await generateSummary(data.applicationNumberRaw, force)
          : summary;
        if (generated?.summary) {
          reportTask('technology', {
            status: 'complete',
            detail: generated?.cached ? '저장된 발명 요약 사용' : '전문 기반 발명 요약 완료',
            completedAt: new Date().toISOString(),
          });
        } else {
          reportTask('technology', { status: 'failed', detail: '발명 요약을 생성하지 못함', error: summaryRunError.current || '전문 분석 응답 없음' });
        }
      }

      const analyses: Record<string, NoticeAnalysis> = { ...noticeAnalyses };
      if (shouldRun('notices')) {
        if (!examinationRounds.length) {
          reportTask('notices', { status: 'skipped', detail: '의견제출통지서 없음' });
        } else {
          reportTask('notices', { status: 'running', detail: `통지서 0/${examinationRounds.length} 분석 중` });
          const noticeErrors: string[] = [];
          let noticeDone = 0;
          for (const round of examinationRounds) {
            try {
              analyses[digits(round.notice.documentNumber)] = await analyzeNotice(round, force);
            } catch (error) {
              noticeErrors.push(error instanceof Error ? error.message : `${round.number}차 통지서 분석 미완료`);
            }
            noticeDone += 1;
            setPreReview((current) => ({ ...current, noticeDone }));
            reportTask('notices', { status: 'running', detail: `통지서 ${noticeDone}/${examinationRounds.length} 분석 중` });
          }
          reportTask('notices', noticeErrors.length
            ? { status: 'failed', detail: `통지서 ${examinationRounds.length - noticeErrors.length}/${examinationRounds.length} 분석 완료`, error: noticeErrors.join(' · ') }
            : { status: 'complete', detail: `통지서 ${examinationRounds.length}/${examinationRounds.length} 분석 완료`, completedAt: new Date().toISOString() });
        }
      }

      if (shouldRun('amendments')) {
        if (!hasAmendmentDocuments) {
          reportTask('amendments', { status: 'skipped', detail: '청구항 보정 없음' });
        } else {
          reportTask('amendments', { status: 'running', detail: '청구항 변동과 거절이유 해소 여부 분석 중' });
          let activeClaimChanges = visibleClaimChanges;
          if (!activeClaimChanges && !data.isDemo) activeClaimChanges = await loadClaimChanges(data.applicationNumberRaw);
          const activeDocuments = activeClaimChanges?.documents.filter((document) => examinationRounds.some((round) => round.amendments.some((item) => digits(item.documentNumber) === digits(document.documentNumber)))) ?? [];
          const amendmentErrors: string[] = [];
          if (!activeClaimChanges) amendmentErrors.push('청구항 변동이력을 불러오지 못했습니다.');
          else if (!activeDocuments.length) amendmentErrors.push('보정서와 연결된 청구항 변동이 없습니다.');
          if (activeDocuments.length && (!claimChangeSummary?.summary || !inputIsCurrent(claimChangeSummary.inputKey, claimChangesInputKey(activeDocuments)) || force)) {
            const changeSummary = await generateClaimChangeAnalysis(force, activeDocuments);
            if (!changeSummary?.summary) amendmentErrors.push('보정 기술변화 분석을 완료하지 못했습니다.');
          }
          for (const round of examinationRounds) {
            const documents = round.amendments.flatMap((item) => {
              const document = activeClaimChanges ? claimChangeDocument(activeClaimChanges, item.documentNumber) : null;
              return document ? [document] : [];
            });
            const noticeAnalysis = analyses[digits(round.notice.documentNumber)] ?? noticeAnalyses[digits(round.notice.documentNumber)];
            if (!round.amendments.length) continue;
            if (documents.length !== round.amendments.length) { amendmentErrors.push(`${round.number}차 보정서의 변동 자료 일부가 미확보입니다.`); continue; }
            if (!noticeAnalysis || noticeAnalysis.basisStatus !== 'current') {
              amendmentErrors.push(`${round.number}차 통지서 분석이 없어 보정 해소 여부를 판단하지 못했습니다.`);
              continue;
            }
            try {
              await analyzeResolution(round, noticeAnalysis, documents, force);
            } catch (error) {
              amendmentErrors.push(error instanceof Error ? error.message : `${round.number}차 보정 검토 미완료`);
            }
          }
          reportTask('amendments', amendmentErrors.length
            ? { status: 'failed', detail: '보정 영향 일부 또는 전체 미완료', error: amendmentErrors.join(' · ') }
            : { status: 'complete', detail: '청구항 변동과 거절이유 해소 검토 완료', completedAt: new Date().toISOString() });
        }
      }

      reportTask('results', { status: 'complete', detail: '분석 결과 정리', completedAt: new Date().toISOString() });
      const failedTasks = (Object.entries(taskSnapshot) as Array<[PreReviewStep, PreReviewTaskState]>)
        .filter(([, task]) => task.status === 'failed');
      const pendingTasks = (Object.entries(taskSnapshot) as Array<[PreReviewStep, PreReviewTaskState]>)
        .filter(([, task]) => task.status === 'pending');
      const completedAt = new Date().toISOString();
      setPreReview((current) => ({
        ...current,
        phase: failedTasks.length || pendingTasks.length ? 'partial' : 'complete',
        currentStep: 'results',
        completedSteps: completedSteps(),
        noticeTotal: examinationRounds.length,
        error: failedTasks.map(([step, task]) => `${preReviewTaskLabels[step]}: ${task.error || task.detail}`).join(' · '),
        completedAt,
        tasks: taskSnapshot,
      }));
      void fetchUsage().then(setUsage).catch(() => undefined);
      setToast(failedTasks.length || pendingTasks.length ? '완료하지 못한 분석 항목을 확인해 주세요.' : 'AI 분석이 완료되었습니다.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI 분석을 완료하지 못했습니다.';
      reportTask(requestedStep ?? 'results', { status: 'failed', detail: '분석 실행 중 오류 발생', error: message });
      setPreReview((current) => ({ ...current, phase: 'partial', currentStep: 'results', error: message, tasks: taskSnapshot }));
    }
  }
  function toggleStrategyKeyword(keyword: string) {
    if (features.some((feature) => (feature.role === '검색 제외' || feature.role === '확인 필요') && keywordMatchesFeature(keyword, feature))) { setToast('제외한 구성의 용어입니다. 검색 역할을 먼저 변경해 주세요.'); return; }
    changeSearchOptions({ customExpression: '', useCustomExpression: false });
    setStrategyDraftKeywords((current) => current.includes(keyword) ? current.filter((item) => item !== keyword) : [...current, keyword]);
  }
  function selectSearchClaim(number: number) { setSelectedClaim(number); }
  function changeFeatureRole(id: string, role: SearchRole) {
    setFeatureRoleOverrides((current) => ({ ...current, [id]: role }));
    changeSearchOptions({ customExpression: '', useCustomExpression: false });
    const feature = features.find((item) => item.id === id);
    if (feature && (role === '검색 제외' || role === '확인 필요')) setStrategyDraftKeywords((words) => words.filter((word) => !keywordMatchesFeature(word, feature)));
  }
  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (loading || preReview.phase === 'running' || summaryBusy || claimChangesBusy) return; const normalized = digits(query); if (!/^(10|20)\d{11}$/.test(normalized)) { setToast('특허·실용신안 출원번호 13자리를 확인해 주세요.'); return; }
    setLoadingMessage('KIPRIS Plus에서 사건자료를 불러오는 중입니다.'); setLoading(true);
    try { const { data: nextData, usage: nextUsage } = await requestPatentCase(normalized); if (nextUsage) setUsage(nextUsage);
      const nextMode = defaultWorkMode(nextData);
      const firstClaimNumber = nextData.claims[0]?.number || 1;
      setData(nextData); setQuery(nextData.applicationNumber); setMode(nextMode); setView('overview'); setSelectedClaim(firstClaimNumber); setResourceClaimNumber(firstClaimNumber); setSummary(null); setSummaryError(''); setClaimChanges(null); setClaimChangesError(''); setClaimChangeSummary(null); setClaimChangeSummaryError(''); setNoticeAnalyses({}); setAmendmentResolutions({}); setPreReview({ phase: 'idle', currentStep: 'case', completedSteps: [], noticeDone: 0, noticeTotal: nextData.notices.length, error: '' }); setStrategyDraftKeywords([]); setFeatureRoleOverrides({}); setSourceDetailsOpen(false); setCaseDetailsOpen(false); setClaimTreeOpen(false); claimChangesAttemptedFor.current = null; claimChangeSummaryAttemptedFor.current = null; setSearchRan(false); setCandidates([]); setOriginalTarget(null); setResourceOpen(false); setSelectedNotice(null); restorePreferences(nextData); writeStoredWorkspace(nextData, null, nextMode); syncCaseUrl(nextData.applicationNumberRaw); if (!nextData.isDemo) void loadCachedSummary(nextData.applicationNumberRaw); setToast('사건을 불러왔습니다. AI 분석은 실행 버튼을 눌렀을 때만 시작합니다.');
    } catch (error) { setToast(error instanceof Error ? error.message : '사건 조회에 실패했습니다.'); } finally { setLoading(false); }
  }
  async function refreshPatentCase() {
    if (loading || preReview.phase === 'running' || summaryBusy || claimChangesBusy) return;
    if (data.isDemo) { setToast('데모 사건은 최신 조회를 지원하지 않습니다.'); return; }
    setLoadingMessage('최신 사건·전문 조회 중입니다. 저장된 AI 분석은 자동 재생성하지 않습니다.'); setLoading(true);
    try {
      const { data: nextData, usage: nextUsage } = await requestPatentCase(data.applicationNumberRaw, true);
      if (nextUsage) setUsage(nextUsage);
      invalidateFullText(data.applicationNumberRaw);
      let refreshedData = nextData;
      let fullTextError = '';
      try {
        const original = await fetchFullText(data.applicationNumberRaw, true);
        if (original.usage) setUsage(original.usage);
        refreshedData = { ...nextData, claims: original.claims.length ? original.claims : nextData.claims,
          claimCount: original.claims.length || nextData.claimCount, claimStructureSource: original.claims.length ? 'fulltext' : 'bibliography',
          fullText: { fileName: original.sourceFileName, fileUrl: original.sourceFileUrl || '' },
          fullTextHash: original.sourceHash, fullTextFetchedAt: original.fetchedAt };
      } catch (reason) {
        fullTextError = reason instanceof Error ? reason.message : '전문 갱신 실패';
        refreshedData = { ...nextData, sources: [...nextData.sources.filter((source) => source.name !== 'fullText'), { name: 'fullText', ok: false, message: fullTextError }] };
      }
      setData(refreshedData); setQuery(nextData.applicationNumber); setClaimChanges(null); setClaimChangesError(''); setClaimChangeSummary(null); setClaimChangeSummaryError(''); claimChangesAttemptedFor.current = null; claimChangeSummaryAttemptedFor.current = null;
      const nextClaim = refreshedData.claims.find((claim) => claim.number === selectedClaim) ?? refreshedData.claims[0];
      const nextClaimNumber = nextClaim?.number || 1;
      setSelectedClaim(nextClaimNumber); setResourceClaimNumber(nextClaimNumber); setFeatureRoleOverrides({});
      setNoticeAnalyses({}); setAmendmentResolutions({}); setPreReview({ phase: 'idle', currentStep: 'case', completedSteps: [], noticeDone: 0, noticeTotal: nextData.notices.length, error: '' });
      writeStoredWorkspace(refreshedData, summary, mode); syncCaseUrl(nextData.applicationNumberRaw);
      setToast(fullTextError ? '서지 갱신 완료 · 전문 조회 실패. 상세 경고를 확인해 주세요.' : '사건자료를 갱신했습니다. AI 분석은 저장된 결과를 유지합니다.');
    } catch (error) { setToast(error instanceof Error ? error.message : '최신 사건자료 조회에 실패했습니다.'); }
    finally { setLoading(false); }
  }
  async function downloadPackage() {
    setPackageBusy(true);
    try {
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      const report = createReviewReport({
        data, lifecycleLabel: lifecycle.label, basisStatus,
        technical: summary, rounds: examinationRounds, notices: noticeAnalyses,
        resolutions: currentResolutions, claimChanges: visibleClaimChanges,
        changeSummary: currentChangeSummary?.summary ?? null,
        evidenceItems: summary?.reviewItems ?? [], candidates, searchExpression,
      });
      zip.file('00_검토보고서.html', report.html);
      zip.file('00_검토보고서.md', report.markdown);
      const snapshots = visibleClaimChanges ? buildDocumentClaimVersions(visibleClaimChanges.documents, data.history.filter((item) => /특허출원서|실용신안등록출원서/.test(item.title)).map((item) => item.documentNumber)) : [];
      zip.file('데이터/사건.json', JSON.stringify({ data, lifecycle, workMode: mode, basisStatus }, null, 2));
      zip.file('데이터/기술요약.json', JSON.stringify(summary, null, 2));
      zip.file('데이터/심사회차.json', JSON.stringify(examinationRounds, null, 2));
      zip.file('데이터/청구항버전.json', JSON.stringify(snapshots, null, 2));
      zip.file('데이터/청구항변동.json', JSON.stringify(visibleClaimChanges, null, 2));
      zip.file('데이터/통지서분석.json', JSON.stringify(noticeAnalyses, null, 2));
      zip.file('데이터/보정판단.json', JSON.stringify(currentResolutions, null, 2));
      zip.file('데이터/보정영향.json', JSON.stringify(currentChangeSummary, null, 2));
      zip.file('데이터/원문근거.json', JSON.stringify(summary?.reviewItems ?? [], null, 2));
      zip.file('데이터/검색구성.json', JSON.stringify(features, null, 2));
      zip.file('검색식.txt', searchExpression);
      zip.file('데이터/후보문헌.json', JSON.stringify(candidates, null, 2));
      for (const [number, analysis] of Object.entries(noticeAnalyses)) zip.file(`통지서/${number}.md`, analysis.markdown);
      const missing: string[] = [];
      if (includeOriginals && !data.isDemo) {
        const originals = [
          { name: '원문/명세서.xml', url: `/api/patent/fulltext?${new URLSearchParams({ applicationNumber: data.applicationNumberRaw, raw: 'true', cachedOnly: 'true' })}` },
          ...data.notices.map((notice) => ({ name: `원문/통지서_${digits(notice.documentNumber)}.pdf`, url: `/api/patent/pdf?${new URLSearchParams({ applicationNumber: data.applicationNumberRaw, sendNumber: notice.documentNumber, cachedOnly: 'true' })}` })),
        ];
        for (const file of originals) {
          try {
            const response = await fetch(file.url, { cache: 'no-store' });
            if (!response.ok) { missing.push(file.name); continue; }
            zip.file(file.name, await response.arrayBuffer());
          } catch { missing.push(file.name); }
        }
      }
      zip.file('포함내역.txt', `AI 분석과 원문 확보 상태는 검토보고서에서 확인하세요.\n원문 포함: ${includeOriginals ? '저장된 파일만 포함 — 추가 KIPRIS 호출 없음' : '선택하지 않음'}\n미확보 파일: ${missing.join(', ') || '없음'}`);
      const url = URL.createObjectURL(await zip.generateAsync({ type: 'blob' }));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `검토결과_${data.applicationNumberRaw}.zip`;
      anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setToast(`검토보고서를 내려받았습니다.${missing.length ? ' 저장되지 않은 원문 ' + missing.length + '건은 포함내역에 표시했습니다.' : ''}`);
    } catch (error) { setToast(error instanceof Error ? error.message : '내려받기에 실패했습니다.'); }
    finally { setPackageBusy(false); }
  }
  function runSearch() { if (!data.isDemo) return; setSearchRan(true); setCandidates(demoCandidates); setToast('데모 후보 3건을 불러왔습니다.'); }
  function pdfUrl(notice: NoticeItem) { return `/api/patent/pdf?${new URLSearchParams({ applicationNumber: data.applicationNumberRaw, sendNumber: notice.documentNumber })}`; }
  function openEvidence(reference: ReviewItem['sourceRefs'][number]) {
    if (reference.sourceType === 'claim' || reference.sourceType === 'specification' || reference.sourceType === 'abstract') {
      setOriginalTarget({ sourceId: reference.sourceId, locator: reference.locator, excerpt: reference.excerpt });
      openResource(reference.sourceType === 'claim' ? 'claims' : 'specification');
      return;
    }
    openResource('documents');
  }
  function openFeatureEvidence(feature: ClaimFeature) {
    openEvidence({
      sourceType: 'claim',
      sourceId: `claim-${feature.sourceClaimNumber}`,
      locator: `청구항 ${feature.sourceClaimNumber}`,
      excerpt: feature.text,
      evidenceLevel: 'explicit',
    });
  }

  if (restoring) return <div className="exam-app"><div className="exam-loading" role="status"><section><span>작업공간 복원</span><h2>이전에 보던 심사 사건을 불러오는 중입니다.</h2></section></div></div>;

  return <div className={`exam-app mode-${mode}`}>
    <a className="skip-link" href="#exam-main">본문 바로가기</a>
    <header className="exam-header" inert={Boolean(selectedNotice || drawingOpen || claimTreeOpen || (isMobile && resourceOpen))}>
      <button className="exam-brand" type="button" onClick={() => go('overview')}><span aria-hidden="true">특허</span><strong>특허심사 지원서비스</strong></button>
      <form className="exam-search" onSubmit={handleSearch}><label htmlFor="case-search">출원번호 검색</label><input id="case-search" value={query} onChange={(event) => setQuery(event.target.value)} inputMode="numeric" placeholder="출원번호 13자리 입력"/><button type="submit" disabled={loading || preReview.phase === 'running'}>검색</button></form>
      <div className="exam-header-actions">
        <button className="exam-secondary mobile-case-materials" type="button" onClick={() => openResource('biblio')}><span className="desktop-label">사건자료</span><span className="mobile-label">자료</span></button>
        <details className="mobile-more-menu"><summary aria-label="더보기">⋮</summary><div role="group" aria-label="사건 작업"><label className="download-original-choice"><input type="checkbox" checked={includeOriginals} onChange={(event) => setIncludeOriginals(event.target.checked)}/>저장된 XML·PDF 포함</label><button type="button" onClick={downloadPackage} disabled={packageBusy}>{packageBusy ? '정리 중…' : '검토결과 내려받기'}</button><button type="button" disabled={data.isDemo || loading || preReview.phase === 'running' || summaryBusy || claimChangesBusy} onClick={() => void refreshPatentCase()}>사건·전문 최신 조회 · KIPRIS 최대 5회</button><button type="button" onClick={() => setSourceDetailsOpen((current) => !current)}>데이터 진단정보</button><button type="button" onClick={() => selectMode('initial')}>최초심사 검토로 보기</button><button type="button" onClick={() => selectMode('response')}>중간서류 검토로 보기</button><button type="button" disabled={preReview.phase === 'running' || data.isDemo} onClick={() => void runPreReview(true)}>전체 AI 재분석 · OpenAI 호출</button><span>KIPRIS 누적 {usage?.total ?? '—'}회</span>{usage?.limits && <span>오늘 KIPRIS {usage.limits.kipris.used}/{usage.limits.kipris.limit} · OpenAI {usage.limits.openai.used}/{usage.limits.openai.limit}</span>}</div></details>
      </div>
    </header>
    <div className="exam-modebar" aria-label="현재 사건 정보">
      <div className="case-primary"><div className="case-title-line"><strong>{data.applicationNumber}</strong><span className={`mobile-lifecycle-badge ${lifecycle.tone}`}>{lifecycle.label}</span></div><span>{data.title}</span><small>{data.isDemo ? '데모 데이터' : `${data.cached ? '저장된 사건' : '최근 조회'} ${data.updatedAt}`} · {workModeLabel(mode, lifecycle)}</small></div>
      <button className="mobile-case-details-toggle" type="button" aria-expanded={caseDetailsOpen} onClick={() => setCaseDetailsOpen((current) => !current)}>사건정보 {caseDetailsOpen ? '접기' : '펼치기'}</button>
      <div className={`mobile-case-details ${caseDetailsOpen ? 'open' : ''}`}><Data label="분석대상" value={targetLabel}/><Data label="상태 설명" value={lifecycle.reason}/><div className="mode-switch" aria-label="사용자 작업 관점"><button aria-pressed={mode === 'initial'} className={mode === 'initial' ? 'active' : ''} type="button" onClick={() => selectMode('initial')}>최초심사 검토</button><button aria-pressed={mode === 'response'} className={mode === 'response' ? 'active' : ''} type="button" onClick={() => selectMode('response')}>중간서류 검토</button></div></div>
    </div>
    <div className={`exam-frame ${resourceOpen ? 'resource-visible' : ''}`}>
      <aside className="exam-sidebar" inert={Boolean(selectedNotice || drawingOpen || claimTreeOpen || (isMobile && resourceOpen))}><p>검토 메뉴</p><label className="mobile-step-picker"><span>{activeAvailableIndex + 1} / {steps.length}</span><select aria-label="검토 메뉴 선택" value={view} onChange={(event) => go(event.target.value as WorkView)}>{steps.map((step) => <option key={step[0]} value={step[0]}>{step[1]}</option>)}</select></label><nav aria-label="검토 메뉴">{steps.map((step, index) => { const state = step[0] === view ? 'active' : 'idle'; return <button ref={(node) => { stepRefs.current[step[0]] = node; }} key={step[0]} className={state} type="button" aria-current={state === 'active' ? 'page' : undefined} onClick={() => go(step[0])}><span>{String(index + 1)}</span><strong>{step[1]}</strong></button>; })}</nav></aside>
      <main className="exam-main" id="exam-main" tabIndex={-1} inert={Boolean(selectedNotice || drawingOpen || claimTreeOpen || (isMobile && resourceOpen))}>
        {view !== 'overview' && (preReview.phase === 'running' || preReview.phase === 'partial') && <section className={`pre-review-global-status ${preReview.phase}`} role="status" aria-live="polite"><span>{preReview.phase === 'running' ? 'AI 분석 진행 중' : '일부 분석 미완료'}</span><strong>{preReview.phase === 'running' ? preReviewTaskLabels[preReview.currentStep] : `${failedPreReviewTasks || 1}개 항목 확인 필요`}</strong><small>{preReview.phase === 'running' ? preReview.tasks?.[preReview.currentStep]?.detail || '분석 상태를 갱신하고 있습니다.' : preReview.error || '대시보드에서 항목별 상태를 확인할 수 있습니다.'}</small><button type="button" onClick={() => go('overview')}>분석상태 보기</button></section>}
        {summary?.summary && <section className={`analysis-provenance status-${basisStatus}`} aria-label="AI 분석 기준"><div><strong>AI 분석 · 미확인</strong><span>분석 {formatAnalysisDate(summary.generatedAt)}</span><span>사건 조회 {formatAnalysisDate(data.fetchedAt)}</span></div>{basisStatus !== 'current' && <p>{basisStatus === 'changed' ? '분석 이후 사건자료 또는 전문이 변경되었습니다. 이전 분석을 현재 판단에 사용하지 마세요.' : basisStatus === 'unverified' ? '기존 분석의 원문 버전 기록이 없어 최신 자료와의 일치 여부를 확인할 수 없습니다.' : '저장된 원문·접수 이력 기준 분석입니다. 새로운 서류 반영 여부는 최신 조회로 확인하세요.'}</p>}<details><summary>분석 기준</summary><dl><Data label="모델" value={summary.model || '기록 없음'}/><Data label="프롬프트" value={summary.version || '기록 없음'}/><Data label="전문파일" value={summary.sourceBasis?.sourceFileName || '기록 없음'}/><Data label="원문 조회" value={formatAnalysisDate(summary.sourceBasis?.fullTextFetchedAt)}/><Data label="원문 식별" value={summary.sourceBasis?.fullTextHash?.slice(0, 16) || '기록 없음'}/><Data label="분석 범위" value={summary.sourceBasis?.sourceScope === 'partial' ? '입력 길이 제한에 따른 발췌 분석' : summary.sourceBasis ? '제공된 전문·청구항' : '기록 없음'}/></dl></details></section>}
        {failedSources.length > 0 && <section className="source-warning" role="alert"><div><strong>일부 사건자료를 불러오지 못했습니다.</strong><span>{failedSources.map((source) => sourceLabel(source.name)).join(' · ')}</span></div><div><button type="button" onClick={() => setSourceDetailsOpen((current) => !current)}>{sourceDetailsOpen ? '상세 닫기' : '상세 보기'}</button><button type="button" disabled={data.isDemo || loading || preReview.phase === 'running' || summaryBusy || claimChangesBusy} onClick={() => void refreshPatentCase()}>다시 조회</button></div>{sourceDetailsOpen && <ul>{failedSources.map((source) => <li key={source.name}><b>{sourceLabel(source.name)}</b>{source.message}</li>)}</ul>}</section>}
        {view === 'overview' && <OverviewView step={stepNumber('overview')} data={data} mode={mode} lifecycle={lifecycle} rounds={examinationRounds} readiness={readiness} summary={summary} noticeAnalyses={noticeAnalyses} amendmentResolutions={amendmentResolutions} claimChangeSummary={claimChangeSummary?.summary ?? null} preReview={preReview} onRun={(force) => void runPreReview(force)} onView={go} onResource={openResource}/>}
        {view === 'response-analysis' && <ResponseAnalysisView step={stepNumber('response-analysis')} rounds={examinationRounds} history={data.history} onSaveLinks={saveLinks} claimChanges={visibleClaimChanges} claimChangeSummary={currentChangeSummary?.summary ?? null} claimChangesBusy={claimChangesBusy} claimChangesError={claimChangesError || claimChangeSummaryError} noticeAnalyses={noticeAnalyses} amendmentResolutions={currentResolutions} onLoadChanges={() => void loadClaimChanges(data.applicationNumberRaw)} selectedRoundKey={selectedRound} onSelectRound={setSelectedRound} onNotice={openNotice} onResource={openResource}/>}
        {view === 'technology' && <TechnologyView step={stepNumber('technology')} data={data} claimAnalysis={claimAnalysis} summary={summary} summaryBusy={summaryBusy} summaryError={summaryError} onOpenClaimTree={() => { setClaimTreeOpen(true); pushMobileOverlay('claim-tree'); }} onEvidence={openEvidence} onOpenReview={() => go('overview')}/>}
        {view === 'strategy' && <StrategyView step={stepNumber('strategy')} data={data} mode={mode} claimAnalysis={claimAnalysis} selectedClaim={selectedClaim} targetLabel={targetLabel} features={features} approvedKeywords={approvedKeywords} suggestedKeywords={[...new Set([...features.map((feature) => feature.label), ...aiStrategySuggestions.filter((word) => features.some((feature) => keywordMatchesFeature(word, feature)))])]} selectedDraftKeywords={strategyDraftKeywords} claimChangeSummary={currentChangeSummary?.summary ?? null} candidates={candidates} searchRan={searchRan} hasAiAnalysis={basisStatus === 'current' && features.length > 0 && Boolean(claimFeatureAnalyses?.some((item) => item.claimNumber === selectedClaim))} analysisBusy={summaryBusy} analysisError={summaryError} onSelectClaim={selectSearchClaim} onOpenClaim={openClaimResource} onOpenEvidence={openFeatureEvidence} onAnalyze={() => void runPreReview(Boolean(summary?.summary), 'technology')} onToggleKeyword={toggleStrategyKeyword} onChangeRole={changeFeatureRole} onCopy={() => void copyText(searchExpression, '검색식')} onRunDemo={runSearch} onOpenResource={() => openResource('documents')} searchOptions={searchOptions} onSearchOptions={changeSearchOptions} onAddCandidate={saveCandidate} onRemoveCandidate={removeCandidate}/>}
      </main>
      {resourceOpen && <ResourcePanel data={data} tab={resourceTab} selectedClaim={resourceClaimNumber} isMobile={isMobile} onTab={(tab) => { setOriginalTarget(null); setResourceTab(tab); }} onClose={closeResource} onFullText={() => { setOriginalTarget(null); openResource('specification'); }} originalTarget={originalTarget} onOriginalLoaded={handleOriginalLoaded} overlayActive={!selectedNotice && !drawingOpen && !claimTreeOpen} onNotice={openNotice} onDrawing={openDrawing}/>}</div>
    {loading && <LoadingOverlay message={loadingMessage}/>} {toast && <div className="exam-toast" role="status">{toast}</div>} {selectedNotice && <NoticeDialog applicationNumber={data.applicationNumberRaw} notice={selectedNotice} pdfUrl={pdfUrl(selectedNotice)} target={noticeTarget} onClose={closeNotice}/>} {drawingOpen && <DrawingDialog data={data} onClose={closeDrawing}/>} {claimTreeOpen && <ClaimTreeDialog data={data} claimAnalysis={claimAnalysis} initialClaim={selectedClaim} onOpenClaim={openClaimFromTree} onClose={() => { if (isMobile && window.history.state?.examOverlay === 'claim-tree') window.history.back(); else setClaimTreeOpen(false); }}/>}</div>;
}

function PageHeading({ step, title, description, action }: { step: string; title: string; description: string; action?: React.ReactNode }) { return <header className="work-heading"><div><span>{/^\d+$/.test(step) ? `단계 ${Number(step)}` : step}</span><h1>{title}</h1>{description && <p>{description}</p>}</div>{action}</header>; }
function OverviewView({ step, data, mode, lifecycle, rounds, summary, noticeAnalyses, amendmentResolutions, claimChangeSummary, preReview, readiness, onRun, onView, onResource }: {
  step: string; data: PatentCase; mode: WorkMode; lifecycle: CaseLifecycle; rounds: ExaminationRound<NoticeItem>[];
  summary: SummaryPayload | null; noticeAnalyses: Record<string, NoticeAnalysis>; amendmentResolutions: Record<string, AmendmentResolutionPayload>;
  claimChangeSummary: ClaimChangeSummary | null; preReview: PreReviewProgress; readiness: ReturnType<typeof reviewReadiness>;
  onRun: (force: boolean) => void; onView: (view: WorkView) => void; onResource: (tab: ResourceTab) => void;
}) {
  const hasResults = Boolean(summary?.summary || Object.keys(noticeAnalyses).length || Object.keys(amendmentResolutions).length || claimChangeSummary);
  const bibliographyReady = data.sources.some((source) => source.name === 'bibliography' && source.ok);
  const hasAmendment = rounds.some((round) => round.amendments.length);
  const proceduralCount = rounds.flatMap((round) => round.otherAmendments).filter((item) => classifyAmendmentDocument(item) === 'procedural').length;
  const unknownCount = rounds.flatMap((round) => round.otherAmendments).filter((item) => classifyAmendmentDocument(item) === 'unknown').length;
  const opinions = data.history.filter((item) => /의견서|답변서|소명서/.test(item.title));
  const orderedHistory = [...data.history].sort((a, b) => digits(b.date).localeCompare(digits(a.date)) || b.documentNumber.localeCompare(a.documentNumber));
  const materialRows = [
    { label: '서지정보', detail: bibliographyReady ? '확보' : '조회 실패', state: bibliographyReady ? 'ready' : 'warning' },
    { label: '전체 명세서', detail: data.fullTextHash ? 'XML 원문 확보' : '분석 시 원문 조회', state: data.fullTextHash ? 'ready' : 'received' },
    { label: '청구항', detail: data.claims.length ? `${data.claims.length}개` : '미수신', state: data.claims.length ? 'ready' : 'warning' },
    { label: '의견제출통지서', detail: rounds.length ? `${rounds.length}건 · 텍스트 ${Object.keys(noticeAnalyses).length}건` : '접수 이력 없음', state: readiness.notices && rounds.length ? 'ready' : rounds.length ? 'received' : 'empty' },
    { label: '청구항 보정', detail: hasAmendment ? readiness.amendments ? '분석 확보' : '변동·판단 확인 필요' : unknownCount ? '보정 대상 미확인' : proceduralCount ? `절차 보완 ${proceduralCount}건 · 청구항 보정 없음` : '접수 이력 없음', state: hasAmendment ? readiness.amendments ? 'ready' : 'received' : unknownCount ? 'warning' : 'empty' },
    { label: '의견서', detail: opinions.length ? '원문 미확보 · 주장 분석 제외' : '접수 이력 없음', state: opinions.length ? 'warning' : 'empty' },
  ];
  const tasks: Record<PreReviewStep, PreReviewTaskState> = {
    case: { status: bibliographyReady ? 'complete' : 'failed', detail: bibliographyReady ? '서지·접수 이력 확보' : '서지정보 조회 실패' },
    technology: { status: readiness.technology ? 'complete' : summary?.summary ? 'stale' : 'pending', detail: readiness.technology ? '원문 기준 일치' : summary?.summary ? '원문·접수 이력 기준 확인 필요' : '명세서 분석 대기' },
    notices: { status: !rounds.length ? 'skipped' : readiness.notices ? 'complete' : Object.keys(noticeAnalyses).length ? 'stale' : 'pending', detail: !rounds.length ? '통지 이력 없음' : readiness.notices ? `통지서 ${rounds.length}건 분석 완료` : '미완료 또는 PDF 버전 확인 필요' },
    amendments: { status: !hasAmendment ? 'skipped' : readiness.amendments ? 'complete' : Object.keys(amendmentResolutions).length || claimChangeSummary ? 'stale' : 'pending', detail: !hasAmendment ? '청구항 보정 없음' : readiness.amendments ? '보정 문언 기준 일치' : rounds.some((round) => round.amendments.length && round.connectionStatus !== 'linked') ? '회차별 문서 연결 확인 필요' : '변동·해소 판단 분석 필요' },
    results: { status: readiness.complete ? 'complete' : 'pending', detail: readiness.complete ? '현재 자료 기준 분석 완료' : '필요한 분석 항목을 먼저 완료하세요.' },
  };
  const taskRows = (['case', 'technology', 'notices', 'amendments', 'results'] as PreReviewStep[]).map((key) => {
    const live = preReview.tasks?.[key];
    return [key, preReview.phase === 'running' && live ? live : live?.status === 'failed' && tasks[key].status !== 'complete' && tasks[key].status !== 'skipped' ? live : tasks[key]] as const;
  });
  return <>
    <PageHeading step={step} title="사건 대시보드" description=""/>
    <section className="dashboard-case-card">
      <header><div><span>{workModeLabel(mode, lifecycle)}</span><h2>사건 서지사항</h2><p>{data.applicant}</p></div><strong className={`dashboard-lifecycle ${lifecycle.tone}`}>{lifecycle.label}</strong></header>
      <dl className="dashboard-biblio"><Data label="출원일" value={data.applicationDate}/><Data label="공개번호" value={data.publicationNumber || '—'}/><Data label="등록번호" value={data.registrationNumber || '—'}/><Data label="심사청구일" value={data.examinationRequestDate || '—'}/><Data label="청구항" value={`${data.claims.length}개`}/><Data label="자료 기준" value={data.updatedAt}/></dl>
      <nav className="dashboard-resource-actions" aria-label="사건 원문 바로가기"><button type="button" onClick={() => onResource('claims')}>청구항 원문</button><button type="button" onClick={() => onResource('specification')}>전체 명세서</button><button type="button" onClick={() => onResource('drawing')}>도면</button><button type="button" onClick={() => onResource('history')}>전체 접수 이력</button></nav>
    </section>
    <div className="dashboard-information-grid">
      <section className="dashboard-document-status"><header><h2>최근 접수·발송 서류</h2><small>전체 {data.history.length}건</small></header>{orderedHistory.length ? <ol>{orderedHistory.slice(0, 7).map((item) => <li key={item.documentNumber}><time>{formatDate(item.date)}</time><div><strong title={item.title}>{shortDocumentTitle(item.title)}</strong><small>{shortDocumentStatus(item.status)}</small></div></li>)}</ol> : <p>접수 이력 없음</p>}<button type="button" onClick={() => onResource('history')}>전체 이력 보기</button></section>
      <section className="dashboard-material-check"><header><h2>사건자료 확보 현황</h2></header><ul>{materialRows.map((item) => <li className={`material-${item.state}`} key={item.label}><span aria-hidden="true">{item.state === 'ready' ? '✓' : item.state === 'warning' ? '!' : item.state === 'received' ? '○' : '–'}</span><strong>{item.label}</strong><small>{item.detail}</small></li>)}</ul></section>
    </div>
    <section className={`pre-review-task-board dashboard-analysis-board phase-${preReview.phase}`} aria-label="AI 분석 상태" aria-live="polite">
      <header><div><h2>{preReview.phase === 'running' ? 'AI 분석 중' : readiness.complete ? '분석 완료' : hasResults ? '분석 기준·미완료 항목 확인' : 'AI 분석'}</h2></div><button className="exam-primary" type="button" onClick={() => readiness.complete ? onView('technology') : onRun(false)} disabled={data.isDemo || preReview.phase === 'running'}>{preReview.phase === 'running' ? '분석 중…' : readiness.complete ? '기술 이해 보기' : hasResults ? '필요한 항목 분석' : 'AI 분석 시작'}</button></header>
      <ol>{taskRows.map(([id, task]) => <li className={`task-${task.status}${preReview.phase === 'running' && preReview.currentStep === id ? ' current' : ''}`} key={id}><span>{preReviewStatusLabels[task.status]}</span><div><strong>{preReviewTaskLabels[id]}</strong><small>{task.error || task.detail}</small></div></li>)}</ol>
      {data.isDemo && <p className="dashboard-demo-note">실제 출원번호를 조회하면 AI 분석을 사용할 수 있습니다.</p>}
      {hasResults && preReview.phase !== 'running' && !readiness.complete && <footer className="dashboard-next-actions"><button type="button" onClick={() => onView('technology')}>저장된 기술 분석 보기</button>{rounds.length > 0 && <button type="button" onClick={() => onView('response-analysis')}>통지·보정 검토</button>}</footer>}
    </section>
  </>;
}
function shortDocumentTitle(title: string) {
  if (/의견제출통지서/.test(title)) return '의견제출통지서';
  if (/의견서|답변서|소명서/.test(title)) return '의견서';
  if (/보정서/.test(title)) return classifyAmendmentDocument({ title }) === 'procedural' ? '보정서 · 절차 보완' : '보정서';
  return title.replace(/^\[[^\]]+\]/, '').trim() || title;
}
function shortDocumentStatus(status: string) { return status.split('(')[0].trim().replace('발송처리완료', '발송 완료').replace(/^수리$/, '접수 완료') || '처리상태 미확인'; }

function claimChangeDocument(history: ClaimChangePayload | null, documentNumber: string) {
  const normalized = digits(documentNumber);
  return history?.documents.find((document) => digits(document.documentNumber) === normalized) ?? null;
}

function claimChangeStats(document: ClaimChangeDocument) {
  const parts = [
    document.statistics.amended ? `수정 ${document.statistics.amended}` : '',
    document.statistics.inserted ? `신규 ${document.statistics.inserted}` : '',
    document.statistics.deleted ? `삭제 ${document.statistics.deleted}` : '',
  ].filter(Boolean);
  return `청구항 변동 ${document.statistics.total}건${parts.length ? ` · ${parts.join(' · ')}` : ''}`;
}

function localAmendmentResolution(
  noticeSummary: NoticeSummary | null,
  documents: ClaimChangeDocument[],
): AmendmentResolutionSummary | null {
  if (!noticeSummary?.rejectionGrounds.length || !documents.length) return null;
  const latestChange = new Map<number, string>();
  for (const document of [...documents].sort((a, b) => a.serialNumber - b.serialNumber)) {
    for (const change of document.changes) {
      latestChange.set(change.claimNumber, change.changeTypeCode.toUpperCase());
    }
  }
  const legalGroundResults = noticeSummary.rejectionGrounds.map((ground) => {
    const originalClaimNumbers = uniqueClaimNumbers(ground.claimNumbers);
    const deletedClaimNumbers = originalClaimNumbers.filter((number) => latestChange.get(number) === 'D');
    const amendedClaimNumbers = originalClaimNumbers.filter((number) => latestChange.get(number) === 'A');
    const remainingClaimNumbers = originalClaimNumbers.filter((number) => latestChange.get(number) !== 'D');
    const assessment: AmendmentResolutionStatus = remainingClaimNumbers.length === 0
      ? 'resolved'
      : deletedClaimNumbers.length > 0
        ? 'partially_resolved'
        : amendedClaimNumbers.length > 0
          ? 'needs_review'
          : 'not_resolved';
    const summary = assessment === 'resolved'
      ? `${claimNumbersLabel(deletedClaimNumbers)} 삭제로 해당 법조항의 거절 대상이 남지 않습니다.`
      : assessment === 'partially_resolved'
        ? `${claimNumbersLabel(deletedClaimNumbers)}은 삭제됐고 ${claimNumbersLabel(remainingClaimNumbers)}은 추가 검토가 필요합니다.`
        : assessment === 'needs_review'
          ? `${claimNumbersLabel(amendedClaimNumbers)}이 보정됐으나 문언 변경만으로 거절이유 해소를 확정할 수 없습니다.`
          : `${claimNumbersLabel(remainingClaimNumbers)}에서 해당 거절이유와 연결된 변동이 확인되지 않습니다.`;
    return {
      provision: ground.provision,
      originalClaimNumbers,
      deletedClaimNumbers,
      amendedClaimNumbers,
      remainingClaimNumbers,
      assessment,
      summary,
    };
  });
  const assessments = legalGroundResults.map((item) => item.assessment);
  const status: AmendmentResolutionStatus = assessments.every((item) => item === 'resolved')
    ? 'resolved'
    : assessments.some((item) => item === 'resolved' || item === 'partially_resolved')
      ? 'partially_resolved'
      : assessments.some((item) => item === 'needs_review')
        ? 'needs_review'
        : 'not_resolved';
  const headline = ({
    resolved: '거절이유 해소',
    partially_resolved: '거절이유 일부 해소',
    not_resolved: '거절이유 유지',
    needs_review: '해소 여부 검토 필요',
    insufficient: '판단 자료 부족',
  } satisfies Record<AmendmentResolutionStatus, string>)[status];
  const rejectedClaims = uniqueClaimNumbers(noticeSummary.rejectionGrounds.flatMap((ground) => ground.claimNumbers));
  const deletedRejected = rejectedClaims.filter((number) => latestChange.get(number) === 'D');
  const amendedRejected = rejectedClaims.filter((number) => latestChange.get(number) === 'A');
  const unchangedRejected = rejectedClaims.filter((number) => !latestChange.has(number));
  const allowableDeleted = noticeSummary.allowableClaims.filter((number) => latestChange.get(number) === 'D');
  const allowableAmended = noticeSummary.allowableClaims.filter((number) => latestChange.get(number) === 'A');
  const allowableRetained = noticeSummary.allowableClaims.filter((number) => !['D', 'A'].includes(latestChange.get(number) ?? ''));
  const outcomeLines = [
    deletedRejected.length ? `${claimNumbersLabel(deletedRejected)} 삭제` : '',
    amendedRejected.length ? `${claimNumbersLabel(amendedRejected)} 보정 · 해소 여부 검토` : '',
    unchangedRejected.length ? `${claimNumbersLabel(unchangedRejected)} 거절이유 잔존` : '',
    allowableRetained.length ? `등록가능항 ${claimNumberRange(allowableRetained)} 유지` : '',
    allowableAmended.length ? `등록가능항 ${claimNumberRange(allowableAmended)} 보정` : '',
    allowableDeleted.length ? `등록가능항 ${claimNumberRange(allowableDeleted)} 삭제` : '',
  ].filter(Boolean);
  return {
    status,
    headline,
    legalGroundResults,
    outcomeLines,
    cautions: ['의견서 원문은 제공되지 않아 통지서와 청구항 변동만 대조했습니다.'],
  };
}

function ResponseAnalysisView({ step, rounds, history, claimChanges, claimChangeSummary, claimChangesBusy, claimChangesError, noticeAnalyses, amendmentResolutions, selectedRoundKey, onSelectRound, onLoadChanges, onNotice, onResource, onSaveLinks }: {
  step: string; rounds: ExaminationRound<NoticeItem>[]; history: HistoryItem[];
  claimChanges: ClaimChangePayload | null; claimChangeSummary: ClaimChangeSummary | null;
  claimChangesBusy: boolean; claimChangesError: string; noticeAnalyses: Record<string, NoticeAnalysis>;
  amendmentResolutions: Record<string, AmendmentResolutionPayload>; selectedRoundKey: string;
  onSelectRound: (number: string) => void; onLoadChanges: () => void;
  onNotice: (notice: NoticeItem, target?: OriginalTarget) => void; onResource: (tab: ResourceTab) => void;
  onSaveLinks: (link: RoundDocumentLink) => Promise<void>;
}) {
  const selectedRound = rounds.find((round) => round.notice.documentNumber === selectedRoundKey) ?? rounds.at(-1) ?? null;
  const key = digits(selectedRound?.notice.documentNumber ?? '');
  const noticeAnalysis = noticeAnalyses[key];
  const noticeCurrent = noticeAnalysis?.basisStatus === 'current';
  const documents = selectedRound?.amendments.flatMap((item) => { const document = claimChangeDocument(claimChanges, item.documentNumber); return document ? [document] : []; }) ?? [];
  const stored = amendmentResolutions[key];
  const hasAllChanges = selectedRound && documents.length === selectedRound.amendments.length;
  const resolution = selectedRound?.connectionStatus === 'linked' && noticeCurrent && hasAllChanges ? stored?.summary ?? localAmendmentResolution(noticeAnalysis.summary, documents) : null;
  const statusLabels: Record<AmendmentResolutionStatus, string> = { resolved: '해소', partially_resolved: '일부 해소', not_resolved: '잔존', needs_review: '검토 필요', insufficient: '근거 부족' };
  const issues = resolution?.legalGroundResults ?? noticeAnalysis?.summary.rejectionGrounds.map((ground) => ({
    provision: ground.provision, originalClaimNumbers: ground.claimNumbers,
    deletedClaimNumbers: [], amendedClaimNumbers: [], remainingClaimNumbers: ground.claimNumbers,
    assessment: 'needs_review' as AmendmentResolutionStatus, summary: ground.reason,
  })) ?? [];
  const versions = buildDocumentClaimVersions(claimChanges?.documents ?? [], history.filter((item) => /특허출원서|실용신안등록출원서/.test(item.title)).map((item) => item.documentNumber));
  function focusAmendment(documentNumber: string, claimNumbers: number[]) {
    const article = document.getElementById(`amendment-document-${digits(documentNumber)}`);
    if (!article) return;
    const targets = claimNumbers.map((number) => document.getElementById(`amendment-${digits(documentNumber)}-claim-${number}`)).filter((node): node is HTMLElement => Boolean(node));
    for (const target of targets) {
      if (target instanceof HTMLDetailsElement) target.open = true;
      target.classList.add('evidence-active');
      window.setTimeout(() => target.classList.remove('evidence-active'), 10_000);
    }
    const first = targets[0] ?? article;
    first.scrollIntoView({ block: 'center', behavior: 'smooth' }); first.tabIndex = -1; first.focus({ preventScroll: true });
  }
  return <>
    <PageHeading step={step} title="통지·보정 검토" description=""/>
    {selectedRound && <label className="mobile-round-select"><span>심사 회차</span><select value={selectedRound.notice.documentNumber} onChange={(event) => onSelectRound(event.target.value)}>{rounds.map((round) => <option key={round.notice.documentNumber} value={round.notice.documentNumber}>{round.number}차 통지 · {formatDate(round.notice.date)}</option>)}</select></label>}
    <div className="round-tabs">{rounds.map((round) => <button type="button" className={round.notice.documentNumber === selectedRound?.notice.documentNumber ? 'active' : ''} key={round.notice.documentNumber} onClick={() => onSelectRound(round.notice.documentNumber)}>{round.number}차 · {formatDate(round.notice.date)}</button>)}</div>
    {!selectedRound && <EmptyState title="통지 이력 없음" text="" action="전체 이력 보기" onAction={() => onResource('history')}/>}
    {selectedRound && <>
      <section className="document-summary-strip">
        <button type="button" onClick={() => onNotice(selectedRound.notice)}><strong>의견제출통지서</strong><small>{formatDate(selectedRound.notice.date)} · 원문</small></button>
        <div><strong>의견서</strong><small>{selectedRound.opinions.length ? selectedRound.opinions.map((item) => formatDate(item.date)).join(' · ') + ' · 원문 미확보, 주장 분석 제외' : '접수 이력 없음'}</small></div>
        {selectedRound.amendments.length ? selectedRound.amendments.map((item) => <div key={item.documentNumber}><strong>보정서</strong><small>{formatDate(item.date)} · {claimChangeDocument(claimChanges, item.documentNumber) ? '변동 자료 확보' : '변동 자료 미확보'}</small></div>) : <div><strong>청구항 보정</strong><small>확인된 문서 없음</small></div>}
      </section>
      {selectedRound.connectionStatus !== 'linked' && <p className="inline-warning">문서 연결 확인 필요 · 자동 해소 판단을 보류합니다.</p>}
      <RoundLinkEditor key={`${selectedRound.notice.documentNumber}:${JSON.stringify([selectedRound.opinions, selectedRound.amendments, selectedRound.decisions].map((items) => items.map((item) => item.documentNumber)))}`} round={selectedRound} history={history} verifiedNumbers={(claimChanges?.documents ?? []).map((document) => document.documentNumber)} onSave={onSaveLinks}/>
      {selectedRound.otherAmendments.length > 0 && <details className="procedural-amendments"><summary>그 밖의 보정 접수 {selectedRound.otherAmendments.length}건</summary>{selectedRound.otherAmendments.map((item) => <p key={item.documentNumber}><strong>{amendmentKindLabel(classifyAmendmentDocument(item))}</strong><small>{formatDate(item.date)} · {item.title}</small></p>)}</details>}
      {noticeAnalysis && !noticeCurrent && <p className="inline-warning">통지서 분석의 PDF 버전이 {noticeAnalysis.basisStatus === 'changed' ? '변경되었습니다' : '미확인입니다'}. 아래는 저장된 통지 요약이며 현재 해소 판단에는 사용하지 않습니다.</p>}
      {noticeAnalysis && <section className="notice-legal-summary"><header><h2>통지 요약</h2><small>{formatAnalysisDate(noticeAnalysis.generatedAt)}</small></header><ul>{noticeAnalysis.summary.rejectionGrounds.map((ground, index) => <li key={index}><strong>{conciseProvision(ground.provision)}</strong><span>{claimNumbersLabel(ground.claimNumbers)}</span></li>)}{noticeAnalysis.summary.allowableClaims.length > 0 && <li><strong>통지 당시 등록가능항</strong><span>{claimNumbersLabel(noticeAnalysis.summary.allowableClaims)}</span></li>}</ul>{noticeAnalysis.summary.keyIssues.length + noticeAnalysis.summary.citedReferences.length > 0 && <details><summary>거절 논리·인용문헌</summary><AiSummaryBulletList value={noticeAnalysis.summary.keyIssues} maxItems={12}/><ul>{noticeAnalysis.summary.citedReferences.map((item) => <li key={item}>{item}</li>)}</ul></details>}</section>}
      {!noticeAnalysis && <section className="review-empty-block"><h2>통지서 분석 전</h2><p>대시보드에서 AI 분석을 실행하세요.</p></section>}
      {resolution && <section className="round-result-summary"><div><span>{stored?.summary ? 'AI 판단 · 미확인' : '청구항 문언 대조 · 법적 판단 아님'}</span><h2>{resolution.headline}</h2></div>{stored?.summary && <small>{formatAnalysisDate(stored.generatedAt)}</small>}</section>}
      {issues.length > 0 && <section className="response-issue-list"><header><h2>거절이유별 검토</h2></header>{issues.map((ground, index) => {
        const related = documents.filter((document) => document.changes.some((change) => ground.originalClaimNumbers.includes(change.claimNumber)));
        const originalGround = noticeAnalysis?.summary.rejectionGrounds.find((item) => conciseProvision(item.provision) === conciseProvision(ground.provision));
        return <article className={`review-issue-card status-${ground.assessment}`} key={index}>
          <header><div><span>{statusLabels[ground.assessment]}</span><strong>{conciseProvision(ground.provision)} · {claimNumbersLabel(ground.originalClaimNumbers)}</strong></div></header>
          <section><AiSummaryBulletList value={ground.summary}/></section>
          <div className="review-evidence-links"><span>근거</span><button type="button" onClick={() => onNotice(selectedRound.notice, noticeGroundTarget(noticeAnalysis?.markdown ?? '', ground.provision, ground.originalClaimNumbers, selectedRound.notice.documentNumber))}>통지서 원문</button>{related.map((document) => <button type="button" key={document.documentNumber} onClick={() => focusAmendment(document.documentNumber, ground.originalClaimNumbers)}>보정 청구항 {document.changes.filter((change) => ground.originalClaimNumbers.includes(change.claimNumber)).map((change) => change.claimNumber).join(', ')}</button>)}</div>
          <details><summary>상세 설명</summary>{originalGround?.reason && <p>{originalGround.reason}</p>}{ground.deletedClaimNumbers.length > 0 && <p>삭제: {claimNumbersLabel(ground.deletedClaimNumbers)}</p>}{ground.amendedClaimNumbers.length > 0 && <p>보정: {claimNumbersLabel(ground.amendedClaimNumbers)}</p>}{ground.remainingClaimNumbers.length > 0 && <p>잔존: {claimNumbersLabel(ground.remainingClaimNumbers)}</p>}</details>
        </article>;
      })}</section>}
      <section className="claim-change-review compact-change-review"><header><h2>관련 청구항 변동</h2></header>
        {claimChangesBusy && <p role="status">변동이력 조회 중…</p>}{claimChangesError && <p className="inline-warning" role="alert">{claimChangesError}</p>}
        {!claimChangesBusy && !documents.length && <div><p>{selectedRound.amendments.length ? '청구항 변동 자료 미확보' : '청구항 보정 없음'}</p>{(selectedRound.amendments.length > 0 || selectedRound.otherAmendments.some((item) => classifyAmendmentDocument(item) === 'unknown')) && <button type="button" className="exam-secondary" onClick={onLoadChanges}>변동 조회 · KIPRIS 최대 1회</button>}</div>}
        {documents.map((document) => {
          const insight = claimChangeSummary?.documentSummaries.find((item) => item.documentNumber === document.documentNumber);
          const date = selectedRound.amendments.find((item) => item.documentNumber === document.documentNumber)?.date ?? '';
          return <article className="compact-change-document" id={`amendment-document-${digits(document.documentNumber)}`} key={document.documentNumber}>
            <header><div><strong>보정서</strong><small>{formatDate(date)} · {document.documentNumber}</small></div><span>{claimChangeStats(document)}</span></header>
            {insight && <section className="compact-change-result"><AiSummaryBulletList value={insight.summary}/></section>}
            <AmendmentClaimTreeComparison version={versions.find((version) => version.documentNumber === document.documentNumber)}/>
            {document.changes.map((change) => <details id={`amendment-${digits(document.documentNumber)}-claim-${change.claimNumber}`} key={change.claimNumber}><summary><strong>청구항 {change.claimNumber}</strong><span>{change.changeTypeName || change.changeTypeCode}</span></summary><div className="claim-change-markup"><ClaimChangeMarkup segments={change.changeSegments}/></div><div className="claim-text-compare"><section><small>보정 전</small><p>{change.previousClaimText || '이전 문언 미확보'}</p></section><section><small>보정 후</small><p>{change.changeTypeCode === 'D' ? '삭제' : change.claimText || '변경 문언 미확보'}</p></section></div></details>)}
          </article>;
        })}
      </section>
    </>}
  </>;
}

function ClaimChangeMarkup({ segments }: { segments: ClaimChangeSegment[] }) {
  if (!segments.length) return <p>변동문이 제공되지 않았습니다.</p>;
  return <p>{segments.map((segment, index) => segment.type === 'lineBreak'
    ? <br key={`br-${index}`}/>
    : segment.type === 'inserted'
      ? <ins key={`ins-${index}`}>{segment.text}</ins>
      : segment.type === 'deleted'
        ? <del key={`del-${index}`}>{segment.text}</del>
    : <span key={`text-${index}`}>{segment.text}</span>)}</p>;
}


function ClaimVersionTree({ title, claims }: { title: string; claims: Claim[] }) {
  const analysis = analyzeClaims(claims);
  const errorCount = analysis.filter((claim) => claim.errors.length > 0).length;
  return <section className="claim-version-tree"><header><strong>{title}</strong><small>{analysis.length}개{errorCount ? ` · 오류 ${errorCount}` : ''}</small></header><ol>{analysis.map((claim) => {
    const totalDescendants = claimDescendantNumbers(analysis, claim.number).size;
    return <li className={`${claim.multipleDependent ? 'multiple' : ''}${claim.errors.length ? ' invalid' : ''}`} style={{ marginLeft: `${Math.min(claim.depth, 6) * 12}px` }} key={claim.number}><span>{claim.isIndependent ? '독립' : claim.multipleDependent ? '다중' : '종속'}</span><div><strong>청구항 {claim.number}</strong><small>{claim.isIndependent ? `직접 ${claim.children.length} · 전체 ${totalDescendants}` : `제${claim.directReferences.join('·')}항 인용 · ${claim.depth}단계`}</small>{claim.errors.length ? <em>{claim.errors.join(' ')}</em> : null}</div></li>;
  })}</ol></section>;
}

function AmendmentClaimTreeComparison({ version }: { version?: DocumentClaimVersion }) {
  if (!version) return null;
  if (!version.beforeComplete || !version.afterComplete) return <p className="partial-claim-version">일부 청구항 변동만 확보되었습니다. 아래는 변경된 항의 문언 비교이며, 전체 청구항 관계는 복원하지 않았습니다.</p>;
  return <details className="claim-version-comparison"><summary>보정 전후 전체 청구항 관계</summary><div><ClaimVersionTree title="보정 전" claims={version.before}/><ClaimVersionTree title="보정 후" claims={version.after}/></div></details>;
}

function fallbackDependentGroups(claimAnalysis: ClaimAnalysis[]): DependentClaimGroup[] {
  const grouped = new Map<string, { roots: number[]; claimNumbers: number[]; maxDepth: number }>();
  for (const claim of claimAnalysis.filter((item) => !item.isIndependent)) {
    const roots = claim.rootClaims.length ? claim.rootClaims : claim.directReferences;
    const key = roots.join(',') || 'unknown';
    const current = grouped.get(key) ?? { roots, claimNumbers: [], maxDepth: 0 };
    current.claimNumbers.push(claim.number);
    current.maxDepth = Math.max(current.maxDepth, claim.depth);
    grouped.set(key, current);
  }
  return [...grouped.values()].slice(0, 5).map((group) => ({
    claimNumbers: uniqueClaimNumbers(group.claimNumbers),
    addition: group.roots.length
      ? `독립항 ${group.roots.join('·')}의 구성을 직접·간접 인용하며 최대 ${group.maxDepth}단계의 추가 한정을 형성합니다.`
      : '선행항 인용관계를 확인할 수 없어 종속 구조의 추가 확인이 필요합니다.',
  }));
}

function claimEvidenceReference(number: number): ReviewItem['sourceRefs'][number] {
  return {
    sourceType: 'claim',
    sourceId: `claim-${number}`,
    locator: `청구항 ${number}`,
    excerpt: '',
    evidenceLevel: 'explicit',
  };
}

function claimAncestorNumbers(claimAnalysis: ClaimAnalysis[], claimNumber: number) {
  const byNumber = new Map(claimAnalysis.map((claim) => [claim.number, claim]));
  const result = new Set<number>();
  const visit = (number: number) => {
    for (const reference of byNumber.get(number)?.directReferences ?? []) {
      if (result.has(reference)) continue;
      result.add(reference);
      visit(reference);
    }
  };
  visit(claimNumber);
  return result;
}

function claimDescendantNumbers(claimAnalysis: ClaimAnalysis[], claimNumber: number) {
  const byNumber = new Map(claimAnalysis.map((claim) => [claim.number, claim]));
  const result = new Set<number>();
  const visit = (number: number) => {
    for (const child of byNumber.get(number)?.children ?? []) {
      if (result.has(child)) continue;
      result.add(child);
      visit(child);
    }
  };
  visit(claimNumber);
  return result;
}

function TechnologyView({ step, data, claimAnalysis, summary, summaryBusy, summaryError, onOpenClaimTree, onEvidence, onOpenReview }: {
  step: string;
  data: PatentCase;
  claimAnalysis: ClaimAnalysis[];
  summary: SummaryPayload | null;
  summaryBusy: boolean;
  summaryError: string;
  onOpenClaimTree: () => void;
  onEvidence: (reference: ReviewItem['sourceRefs'][number]) => void;
  onOpenReview: () => void;
}) {
  const ai = summary?.summary;
  const independentClaims = claimAnalysis.filter((claim) => claim.isIndependent);
  const dependentClaims = claimAnalysis.filter((claim) => !claim.isIndependent);
  const multipleDependentClaims = claimAnalysis.filter((claim) => claim.multipleDependent);
  const claimErrorCount = claimAnalysis.filter((claim) => claim.errors.length > 0).length;
  return <>
    <PageHeading step={step} title="기술 이해" description="해결하고자 하는 과제, 핵심 해결수단, 주요 효과와 청구항 인용관계를 파악합니다." action={<button className="exam-secondary" type="button" onClick={onOpenClaimTree}>청구항 트리 열기</button>}/>
    {summaryError && <div className="inline-warning">△ {summaryError}</div>}
    <section className="technology-center">
      {ai ? <TechnicalAiBrief summary={ai} reviewItems={summary?.reviewItems ?? []} claimAnalysis={claimAnalysis} onEvidence={onEvidence}/> : <section className="ai-analysis-state"><span>{summaryBusy ? 'AI 분석 중' : '분석 전'}</span><h2>{summaryBusy ? '명세서의 핵심 구성을 정리하고 있습니다.' : '아직 생성된 발명 분석이 없습니다.'}</h2><p>사건 대시보드에서 AI 분석을 실행하면 전문 내용을 바탕으로 발명을 요약합니다.</p>{!summaryBusy && <button className="exam-secondary" type="button" onClick={onOpenReview}>사건 대시보드로 이동</button>}</section>}
      <section className="claim-structure-launch"><div><span>{data.claimStructureSource === 'fulltext' ? '전문 XML 기준' : '서지 API 기준'}</span><h2>청구항 인용 구조</h2><p>독립항별 종속 계보와 다중종속·인용 오류를 모달에서 확인합니다.</p></div><dl><Data label="전체" value={`${claimAnalysis.length}개`}/><Data label="독립항" value={`${independentClaims.length}개`}/><Data label="종속항" value={`${dependentClaims.length}개`}/><Data label="다중종속" value={`${multipleDependentClaims.length}개`}/></dl><div className="claim-root-preview">{independentClaims.slice(0, 6).map((claim) => <span key={claim.number}>청구항 {claim.number} 계보 · 후속 {claimDescendantNumbers(claimAnalysis, claim.number).size}개</span>)}{claimErrorCount > 0 && <span className="warning">인용관계 확인 필요 {claimErrorCount}건</span>}</div><button className="exam-secondary" type="button" onClick={onOpenClaimTree}>청구항 트리 전체 보기</button><small>{data.claimStructureSource === 'fulltext' ? '전체 명세서 XML의 청구항 문언을 기준으로 분석했습니다.' : '서지 API 청구항 문언을 기준으로 분석했습니다.'}</small></section>
    </section>
  </>;
}

function ClaimTreeDialog({ data, claimAnalysis, initialClaim, onOpenClaim, onClose }: {
  data: PatentCase;
  claimAnalysis: ClaimAnalysis[];
  initialClaim: number;
  onOpenClaim: (number: number) => void;
  onClose: () => void;
}) {
  const [focusedClaim, setFocusedClaim] = useState(initialClaim || claimAnalysis[0]?.number || 1);
  const [mobilePane, setMobilePane] = useState<'relations' | 'detail'>('relations');
  const dialogRef = useModalBehavior<HTMLElement>(onClose, { lockScroll: true });
  const selected = claimAnalysis.find((claim) => claim.number === focusedClaim) ?? claimAnalysis[0];
  const selectedText = data.claims.find((claim) => claim.number === selected?.number)?.text ?? '';
  const ancestors = selected ? claimAncestorNumbers(claimAnalysis, selected.number) : new Set<number>();
  const descendants = selected ? claimDescendantNumbers(claimAnalysis, selected.number) : new Set<number>();
  const relatedClaims = new Set([selected?.number ?? 0, ...ancestors, ...descendants]);
  const independentCount = claimAnalysis.filter((claim) => claim.isIndependent).length;
  const dependentCount = claimAnalysis.length - independentCount;
  const multipleCount = claimAnalysis.filter((claim) => claim.multipleDependent).length;
  return <div className="exam-dialog-backdrop claim-tree-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section ref={dialogRef} className={`exam-dialog claim-tree-dialog pane-${mobilePane}`} role="dialog" aria-modal="true" aria-labelledby="claim-tree-dialog-title" tabIndex={-1}>
      <header><div><small>청구항 인용관계</small><h2 id="claim-tree-dialog-title">{data.applicationNumber} · 청구항 트리</h2></div><button type="button" onClick={onClose}>닫기 ×</button></header>
      <div className="claim-tree-dialog-summary"><dl><Data label="전체" value={`${claimAnalysis.length}개`}/><Data label="독립항" value={`${independentCount}개`}/><Data label="종속항" value={`${dependentCount}개`}/><Data label="다중종속" value={`${multipleCount}개`}/></dl><p><span className="claim-kind independent">독립</span><span className="claim-kind dependent">종속</span><span className="claim-kind multiple">다중</span></p></div>
      <nav className="claim-tree-mobile-switch" aria-label="청구항 트리 보기"><button type="button" aria-pressed={mobilePane === 'relations'} onClick={() => setMobilePane('relations')}>인용관계 목록</button><button type="button" aria-pressed={mobilePane === 'detail'} onClick={() => setMobilePane('detail')}>청구항 {focusedClaim} 상세</button></nav>
      <div className="claim-tree-dialog-body">
        <div className="claim-tree-modal-list" role="list" aria-label="청구항 목록">{claimAnalysis.map((claim) => {
          const totalDescendants = claimDescendantNumbers(claimAnalysis, claim.number).size;
          const relation = selected?.number === claim.number ? 'selected' : ancestors.has(claim.number) ? 'ancestor' : descendants.has(claim.number) ? 'descendant' : 'unrelated';
          const relationLabel = relation === 'selected' ? '선택 항' : relation === 'ancestor' ? '선행 계보' : relation === 'descendant' ? '후속 계보' : '';
          return <article role="listitem" className={`claim-tree-item relation-${relation}${claim.errors.length ? ' invalid' : ''}${relatedClaims.has(claim.number) ? ' related' : ''}`} style={{ marginLeft: `${Math.min(claim.depth, 6) * 16}px` }} key={claim.number}><button className="claim-tree-main" type="button" aria-pressed={selected?.number === claim.number} onClick={() => { setFocusedClaim(claim.number); setMobilePane('detail'); }}><span className={`claim-kind ${claim.multipleDependent ? 'multiple' : claim.isIndependent ? 'independent' : 'dependent'}`}>{claim.isIndependent ? '독립' : claim.multipleDependent ? '다중' : '종속'}</span><div><strong>청구항 {claim.number}</strong><small>{claim.isIndependent ? `직접 종속 ${claim.children.length}개 · 전체 후속 ${totalDescendants}개` : `제${claim.directReferences.join('·')}항 직접 인용 · ${claim.depth}단계${totalDescendants ? ` · 후속 ${totalDescendants}개` : ''}`}</small>{relationLabel && <b className="claim-relation-label">{relationLabel}</b>}{claim.errors.length > 0 && <em>{claim.errors.join(' ')}</em>}</div></button></article>;
        })}</div>
        <aside className="claim-tree-selection" aria-live="polite">{selected ? <><header><span className={`claim-kind ${selected.multipleDependent ? 'multiple' : selected.isIndependent ? 'independent' : 'dependent'}`}>{selected.isIndependent ? '독립항' : selected.multipleDependent ? '다중종속항' : '종속항'}</span><h3>청구항 {selected.number}</h3></header><dl><Data label="직접 인용항" value={selected.directReferences.length ? `청구항 ${selected.directReferences.join(', ')}` : '없음'}/><Data label="종속 깊이" value={selected.isIndependent ? '독립항' : `${selected.depth}단계`}/><Data label="직접 종속항" value={selected.children.length ? `청구항 ${selected.children.join(', ')}` : '없음'}/><Data label="전체 후속항" value={`${descendants.size}개`}/></dl>{selected.errors.length > 0 && <p className="claim-tree-selection-warning">{selected.errors.join(' ')}</p>}<div className="claim-tree-text"><small>청구항 문언</small><p>{selectedText || '청구항 원문을 불러오지 못했습니다.'}</p></div><button className="exam-primary" type="button" onClick={() => onOpenClaim(selected.number)}>청구항 {selected.number} 원문 보기</button></> : <p>분석 가능한 청구항이 없습니다.</p>}</aside>
      </div>
    </section>
  </div>;
}

function AiSummaryBulletList({ value, maxItems = 4 }: { value: string | string[]; maxItems?: number }) {
  const items = summaryBulletItems(value, maxItems);
  return items.length
    ? <ul className="ai-summary-bullets">{items.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul>
    : <p className="ai-summary-empty">요약할 내용을 찾지 못했습니다.</p>;
}

function TechnicalAiBrief({ summary, reviewItems = [], claimAnalysis, onEvidence }: {
  summary: ExaminationSummary;
  reviewItems?: ReviewItem[];
  claimAnalysis: ClaimAnalysis[];
  onEvidence?: (reference: ReviewItem['sourceRefs'][number]) => void;
}) {
  const operationFlow = summary.operationFlow ?? [];
  const independentClaimSummary = summary.independentClaimSummary || summary.claimOverview;
  const hasAiDependentGroups = Boolean(summary.dependentClaimGroups?.length);
  const dependentClaimGroups = hasAiDependentGroups
    ? summary.dependentClaimGroups ?? []
    : fallbackDependentGroups(claimAnalysis);
  const independentClaims = claimAnalysis
    .filter((claim) => claim.isIndependent)
    .map((claim) => claim.number);
  function refsFor(entityId: string) {
    return reviewItems.find((item) => item.entityId === entityId)?.sourceRefs ?? [];
  }
  function evidence(entityId: string, fallbackRefs: ReviewItem['sourceRefs'] = []) {
    const refs = refsFor(entityId).length ? refsFor(entityId) : fallbackRefs;
    if (!refs.length) return <span className="evidence-missing">근거 부족</span>;
    return <span className="technical-evidence">근거 {refs.slice(0, 3).map((reference, index) => <button type="button" key={`${reference.sourceId}-${reference.locator}-${index}`} onClick={() => onEvidence?.(reference)}>{reference.locator}</button>)}</span>;
  }
  const allReferences = [...new Map(
    reviewItems.flatMap((item) => item.sourceRefs).map((reference) => [
      `${reference.sourceType}:${reference.sourceId}:${reference.locator}`,
      reference,
    ]),
  ).values()];
  return <section className="technical-ai-brief expanded">
    <header className="technical-summary-hero"><small>발명의 핵심</small><p>{summary.oneLine}</p>{evidence('oneLine')}</header>
    <div className="technical-summary-grid">
      <article className="technical-summary-card"><h3>해결하고자 하는 과제</h3><AiSummaryBulletList value={summary.technicalProblem}/>{evidence('technicalProblem')}</article>
      <article className="technical-summary-card"><h3>핵심 해결수단</h3><AiSummaryBulletList value={summary.solution}/>{evidence('solution')}</article>
      <article className="technical-summary-card effects"><h3>주요 효과</h3>{summary.effects.length ? <ul>{summary.effects.slice(0, 3).map((item, index) => <li key={`${item}-${index}`}><p>{item}</p>{evidence(`effects.${index}`)}</li>)}</ul> : <p>명세서에서 명시적인 효과 근거를 찾지 못했습니다.</p>}{!summary.effects.length && <span className="evidence-missing">근거 부족</span>}</article>
    </div>
    {operationFlow.length > 0 && <section className="operation-flow-panel"><header><h3>작동 흐름</h3></header><ol className="operation-flow">{operationFlow.slice(0, 5).map((step, index) => <li className="operation-flow-step" key={`${step}-${index}`}><span>{index + 1}</span><p>{step}</p>{evidence(`operationFlow.${index}`)}</li>)}</ol></section>}
    <div className="technical-bottom-grid">
      <section className="technical-core-elements"><h3>핵심 구성</h3><ol>{summary.keyElements.slice(0, 6).map((item, index) => <li key={`${item}-${index}`}><p>{item}</p>{evidence(`keyElements.${index}`)}</li>)}</ol></section>
      <section className="claim-scope-summary"><h3>청구항 구조 요약</h3><article><small>독립항의 핵심 조합</small><AiSummaryBulletList value={independentClaimSummary}/>{evidence('independentClaimSummary', independentClaims.slice(0, 3).map(claimEvidenceReference))}</article><div className="dependent-claim-groups"><small>종속항의 주요 추가 한정</small>{dependentClaimGroups.length ? dependentClaimGroups.slice(0, 5).map((group, index) => <article key={`${group.claimNumbers.join('-')}-${index}`}><strong>{claimNumbersLabel(group.claimNumbers)}</strong><AiSummaryBulletList value={group.addition} maxItems={3}/>{evidence(`dependentClaimGroups.${index}`, group.claimNumbers.filter((number) => claimAnalysis.some((claim) => claim.number === number && !claim.isIndependent)).slice(0, 3).map(claimEvidenceReference))}</article>) : <p>종속항이 없거나 주요 추가 한정을 분류하지 못했습니다.</p>}</div></section>
    </div>
    <details className="technical-supporting-details"><summary>상세정보 보기</summary><div className="technical-detail-grid">{summary.examinationPoints.length > 0 && <section><h3>선행기술 대조 포인트</h3><ul>{summary.examinationPoints.slice(0, 5).map((item, index) => <li key={`${item}-${index}`}>{item}{evidence(`examinationPoints.${index}`)}</li>)}</ul></section>}{summary.cautions.length > 0 && <section className="detail-cautions"><h3>AI 유의사항</h3><ul>{summary.cautions.slice(0, 3).map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul></section>}{summary.claimOverview && summary.claimOverview !== independentClaimSummary && <section><h3>추가 청구항 설명</h3><AiSummaryBulletList value={summary.claimOverview}/>{evidence('claimOverview')}</section>}<section><h3>전체 근거 목록</h3>{allReferences.length ? <div className="technical-all-evidence">{allReferences.map((reference, index) => <button type="button" key={`${reference.sourceId}-${index}`} onClick={() => onEvidence?.(reference)}><span>{reference.locator}</span><small>{reference.excerpt}</small></button>)}</div> : <p className="evidence-missing">연결된 원문 근거가 없습니다.</p>}</section></div></details>
  </section>;
}
function StrategyView({ step, data, mode, claimAnalysis, selectedClaim, targetLabel, features, suggestedKeywords, selectedDraftKeywords, claimChangeSummary, candidates, searchRan, hasAiAnalysis, analysisBusy, analysisError, onSelectClaim, onOpenClaim, onOpenEvidence, onAnalyze, onToggleKeyword, onChangeRole, onCopy, onRunDemo, searchOptions, onSearchOptions, onAddCandidate, onRemoveCandidate }: {
  step: string; data: PatentCase; mode: WorkMode; claimAnalysis: ClaimAnalysis[]; selectedClaim: number; targetLabel: string;
  features: ClaimFeature[]; approvedKeywords: string[]; suggestedKeywords: string[]; selectedDraftKeywords: string[];
  claimChangeSummary: ClaimChangeSummary | null; candidates: Candidate[]; searchRan: boolean; hasAiAnalysis: boolean;
  analysisBusy: boolean; analysisError: string; onSelectClaim: (number: number) => void; onOpenClaim: (number: number) => void;
  onOpenEvidence: (feature: ClaimFeature) => void; onAnalyze: () => void; onToggleKeyword: (word: string) => void;
  onChangeRole: (id: string, role: SearchRole) => void; onCopy: () => void; onRunDemo: () => void;
  onOpenResource: () => void; searchOptions: SearchOptions; onSearchOptions: (update: Partial<SearchOptions>) => void;
  onAddCandidate: (input: Partial<Candidate>) => Promise<void>; onRemoveCandidate: (candidate: Candidate) => Promise<void>;
}) {
  const activeKeywords = allowedSearchKeywords(features, selectedDraftKeywords);
  const groups = buildKeywordGroups(data, features, activeKeywords, searchOptions);
  const expression = buildSearchExpression(data, features, activeKeywords, searchOptions);
  const recommendation = claimChangeSummary?.searchRecommendation;
  const selectedAnalysis = claimAnalysis.find((claim) => claim.number === selectedClaim);
  const ancestors = [...claimAncestorNumbers(claimAnalysis, selectedClaim)].sort((a, b) => a - b);
  const categories: Record<AiClaimFeatureCategory, string> = { component: '구성요소', relationship: '연결관계', condition: '작동조건', operation: '처리동작', result: '결과상태' };
  const importance: Record<AiClaimFeatureImportance, string> = { core: '핵심', supporting: '조합', conventional: '일반' };
  return <>
    <PageHeading step={step} title="검색 방향" description=""/>
    {mode === 'response' && recommendation && <section className={`review-search-decision compact decision-${recommendation.status}`}><div><span>추가 검색 판단</span><h2>{searchRecommendationLabel(recommendation.status)}</h2><AiSummaryBulletList value={recommendation.reason} maxItems={3}/></div></section>}
    <section className="search-target-claim"><header><div><h2>청구항 {selectedClaim} · {selectedAnalysis?.isIndependent ? '독립항' : selectedAnalysis?.multipleDependent ? '다중종속항' : '종속항'}</h2><small>{targetLabel}</small></div><button type="button" onClick={() => onOpenClaim(selectedClaim)}>청구항 원문</button></header>
      <div className="search-claim-selector"><label htmlFor="search-claim-number">분석 대상<select id="search-claim-number" value={selectedClaim} onChange={(event) => onSelectClaim(Number(event.target.value))}>{claimAnalysis.map((claim) => <option key={claim.number} value={claim.number}>청구항 {claim.number} · {claim.isIndependent ? '독립항' : '종속항'}</option>)}</select></label><div>{ancestors.length > 0 && <p>승계: 청구항 {ancestors.join(', ')}</p>}{hasAiAnalysis && <p>승계 구성 {features.filter((feature) => feature.inherited).length}개 · 추가 구성 {features.filter((feature) => !feature.inherited).length}개</p>}</div></div>
    </section>
    <section className="search-workspace-card ai-feature-workspace"><header><h2>기술적 구성과 검색 역할</h2><strong className={hasAiAnalysis ? 'complete' : 'pending'}>{analysisBusy ? '분석 중…' : hasAiAnalysis ? `${features.length}개 구성` : '분석 전'}</strong></header>
      {hasAiAnalysis ? <div className="search-feature-roles">{features.map((feature) => <article key={feature.id}><div className="search-feature-copy"><header><b>{feature.id}</b><span>{categories[feature.category]}</span><em className={`importance-${feature.importance}`}>{importance[feature.importance]}</em></header><strong>{feature.label}</strong>{feature.inherited && <small>청구항 {feature.sourceClaimNumber}에서 승계</small>}<blockquote>{feature.text}</blockquote>{feature.rationale && <details><summary>검색 의미</summary><p>{feature.rationale}</p></details>}<button type="button" onClick={() => onOpenEvidence(feature)}>원문 근거</button></div><label>검색 역할<select aria-label={`${feature.id} 검색 역할`} value={feature.role} onChange={(event) => onChangeRole(feature.id, event.target.value as SearchRole)}>{(['핵심 검색', '조합 검색', '일반 구성', '검색 제외', '확인 필요'] as SearchRole[]).map((role) => <option key={role}>{role}</option>)}</select></label></article>)}</div> : <div className="ai-feature-empty"><div><h3>선택한 청구항의 구성 분석이 없습니다.</h3>{analysisError && <p className="inline-warning">{analysisError}</p>}</div><button type="button" disabled={analysisBusy || data.isDemo} onClick={onAnalyze}>{analysisBusy ? '분석 중…' : '기술 분석 갱신 · OpenAI 호출'}</button></div>}
      {(suggestedKeywords.length > 0 || activeKeywords.length > 0) && <div className="strategy-keyword-picks">{[...new Set([...suggestedKeywords, ...activeKeywords])].map((keyword) => {
        const excluded = !allowedSearchKeywords(features, [keyword]).length;
        const selected = activeKeywords.includes(keyword);
        return <button type="button" key={keyword} aria-pressed={selected} disabled={excluded} className={selected ? 'selected' : ''} title={excluded ? '검색 제외 또는 확인 필요 구성의 용어' : ''} onClick={() => onToggleKeyword(keyword)}><span>{excluded ? '제외' : selected ? '포함' : '제안'}</span>{keyword}</button>;
      })}</div>}
      <form className="manual-keyword-input" onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; const words = String(new FormData(form).get('keywords') || '').split(',').map((word) => word.trim()).filter(Boolean).slice(0, 20); for (const word of words) if (!activeKeywords.includes(word)) onToggleKeyword(word); form.reset(); }}><label>동의어·검색어 추가<input name="keywords" maxLength={2000} placeholder="쉼표로 구분"/></label><button type="submit">추가</button></form>
    </section>
    <section className="search-query-simple"><header><div><small>출원일 {data.applicationDate}</small><h2>검색식</h2></div><button type="button" onClick={onCopy} disabled={!expression.trim()}>복사</button></header>
      <div className="search-filter-options"><label><input type="checkbox" checked={searchOptions.includeTitle} onChange={(event) => onSearchOptions({ includeTitle: event.target.checked, customExpression: '', useCustomExpression: false })}/>발명의 명칭 포함</label>{data.cpc.map((code) => <label key={code.number}><input type="checkbox" checked={searchOptions.cpcCodes.includes(code.number)} onChange={(event) => onSearchOptions({ cpcCodes: event.target.checked ? [...searchOptions.cpcCodes, code.number] : searchOptions.cpcCodes.filter((value) => value !== code.number), customExpression: '', useCustomExpression: false })}/>CPC {code.number}</label>)}</div>
      {groups.length > 0 && <details className="concept-groups-details"><summary>개념군 {groups.length}개</summary><div className="concept-groups">{groups.map((group) => <div key={group.name}><header><strong>{group.name}</strong></header><p>{group.terms.join(' / ')}</p></div>)}</div></details>}
      <label className="search-expression-editor">검색식 직접 편집<textarea aria-label="검색식 직접 편집" rows={7} value={expression} onChange={(event) => onSearchOptions({ customExpression: event.target.value, useCustomExpression: true })} placeholder="구성과 키워드를 선택하거나 검색식을 입력하세요."/></label>
      {(searchOptions.useCustomExpression || searchOptions.customExpression) && <button type="button" onClick={() => onSearchOptions({ customExpression: '', useCustomExpression: false })}>자동 구성 검색식으로 복원</button>}
      <small>복사한 검색식은 사용하는 외부 검색 서비스의 문법에 맞게 조정하세요.</small>
      {data.isDemo && <button type="button" onClick={onRunDemo}>{searchRan ? '데모 후보 다시 보기' : '데모 후보 보기'}</button>}
    </section>
    <section className="candidate-simple-list"><header><h2>후보문헌{candidates.length ? ` · ${candidates.length}건` : ''}</h2></header><CandidateEditor disabled={data.isDemo} onSave={onAddCandidate}/>
      {candidates.map((candidate) => <article key={candidate.id}><div className="candidate-biblio"><strong>{candidate.country} {candidate.number}</strong><h3>{candidate.title}</h3><dl><Data label="공개일" value={formatDate(candidate.publicationDate)}/><Data label="공개일 기준" value={candidate.eligible === null ? '미확인' : candidate.eligible ? '기준일 이전·동일' : '기준일 이후'}/><Data label="대응 구성" value={candidate.matches.join(', ') || '미확인'}/><Data label="역할" value={candidate.role}/></dl>{candidate.notes && <p>{candidate.notes}</p>}<div className="candidate-actions">{candidate.sourceUrl && <a href={candidate.sourceUrl} target="_blank" rel="noopener noreferrer">원문 보기 ↗</a>}{!data.isDemo && <button type="button" onClick={() => void onRemoveCandidate(candidate)}>목록에서 제외</button>}</div></div></article>)}
    </section>
  </>;
}

function ResourcePanel({ data, tab, selectedClaim, isMobile, originalTarget, overlayActive, onOriginalLoaded, onTab, onClose, onFullText, onNotice, onDrawing }: {
  data: PatentCase; tab: ResourceTab; selectedClaim: number; isMobile: boolean; originalTarget: OriginalTarget | null;
  overlayActive: boolean; onOriginalLoaded: (document: FullTextDocument) => void;
  onTab: (tab: ResourceTab) => void; onClose: () => void; onFullText: () => void; onNotice: (notice: NoticeItem) => void; onDrawing: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const scrolls = useRef<Partial<Record<ResourceTab, number>>>({});
  const bodyRef = useRef<HTMLDivElement>(null);
  const modal = isMobile || expanded;
  const panelRef = useModalBehavior<HTMLElement>(onClose, { active: overlayActive, lockScroll: modal, trapFocus: modal });
  const tabs: Array<[ResourceTab, string]> = [['biblio', '서지'], ['claims', '청구항'], ['specification', '명세서'], ['drawing', '도면'], ['history', '이력'], ['family', '패밀리'], ['documents', '문서']];
  const orderedHistory = [...data.history].sort((left, right) => digits(left.date).localeCompare(digits(right.date)) || left.documentNumber.localeCompare(right.documentNumber));
  const orderedNotices = [...data.notices].sort((left, right) => digits(left.date).localeCompare(digits(right.date)) || left.documentNumber.localeCompare(right.documentNumber));
  const target = originalTarget ?? (tab === 'claims' ? { sourceId: `claim-${selectedClaim}`, locator: `청구항 ${selectedClaim}`, excerpt: '' } : null);
  useEffect(() => {
    const body = bodyRef.current;
    const positions = scrolls.current;
    if (!body) return;
    if (!originalTarget) body.scrollTop = positions[tab] || 0;
    return () => { positions[tab] = body.scrollTop; };
  }, [tab, originalTarget]);
  const familyFailed = data.sources.find((source) => source.name === 'family' && !source.ok);
  return <aside ref={panelRef} className={`resource-panel${expanded ? ' expanded' : ''}`} role={modal ? 'dialog' : 'complementary'} aria-modal={modal ? true : undefined} aria-label="사건자료 원문" tabIndex={-1}>
    <header><div><small>{originalTarget ? 'AI 근거 원문' : '사건자료'}</small><h2>{originalTarget?.locator || '사건자료'}</h2></div><div className="resource-panel-actions">{!isMobile && <button type="button" onClick={() => setExpanded((current) => !current)} aria-pressed={expanded}>{expanded ? '패널로 보기' : '크게 보기'}</button>}<button type="button" onClick={onClose} aria-label="사건자료 닫기">닫기 ×</button></div></header>
    <nav aria-label="사건자료 종류">{tabs.map(([id, label]) => <button className={tab === id ? 'active' : ''} type="button" aria-pressed={tab === id} key={id} onClick={() => onTab(id)}>{label}</button>)}</nav>
    <div className="resource-body" ref={bodyRef}>
      {tab === 'biblio' && <dl className="resource-dl"><Data label="출원번호" value={data.applicationNumber}/><Data label="출원일" value={data.applicationDate}/><Data label="공개번호" value={data.publicationNumber || '—'}/><Data label="출원인" value={data.applicant}/><Data label="심사청구일" value={data.examinationRequestDate}/><Data label="심사관" value={data.examinerName}/><Data label="주 CPC" value={data.cpc[0]?.number || '—'} link={data.cpc[0] ? cpcUrl(data.cpc[0].number) : undefined}/><Data label="서지 조회" value={formatAnalysisDate(data.fetchedAt)}/><Data label="청구항 출처" value={data.claimStructureSource === 'fulltext' ? '전문 XML · 보정 반영시점 미확인' : '서지 API · 보정 반영시점 미확인'}/></dl>}
      {(tab === 'claims' || tab === 'specification') && <OriginalDocumentViewer key={`${data.applicationNumberRaw}:${data.fullTextHash || ''}`} applicationNumber={data.applicationNumberRaw} claimsOnly={tab === 'claims'} target={target} fallbackClaims={data.claims} onLoaded={onOriginalLoaded}/>}
      {tab === 'drawing' && <div className="resource-drawing">{data.drawing ? <figure className="resource-drawing-original"><img src={data.drawing.largeUrl || data.drawing.thumbnailUrl} alt={`${data.title} 대표도면 원본`} loading="eager"/><figcaption><div><strong>대표도면 원본</strong><small>{data.drawing.fileName}</small></div><button type="button" onClick={onDrawing}>확대</button></figcaption></figure> : <div className="resource-unavailable"><h3>대표도면을 표시할 수 없습니다.</h3><p>{data.sources.find((item) => item.name === 'drawing')?.message || '도면 정보가 없습니다.'}</p></div>}</div>}
      {tab === 'history' && <div className="resource-history">{orderedHistory.map((item) => <article key={`${item.documentNumber}-${item.date}`}><time>{formatDate(item.date)}</time><strong>{item.title}</strong><small>{item.status}{classifyAmendmentDocument(item) !== 'none' ? ` · ${amendmentKindLabel(classifyAmendmentDocument(item))}` : ''}</small></article>)}</div>}
      {tab === 'family' && <div className="resource-family">{data.family.length ? data.family.map((item, index) => <article key={`${item.familyNumber}-${index}`}><span>{item.countryCode || '—'}</span><strong>{item.publicationNumber || item.literatureNumber || item.applicationNumber}</strong><small>{item.familyKind || item.literatureKind}</small></article>) : <div className="resource-unavailable"><h3>{familyFailed ? '패밀리 조회 실패' : '패밀리 없음'}</h3><p>{familyFailed ? familyFailed.message : 'API에서 조회된 패밀리 문헌이 없습니다.'}</p></div>}</div>}
      {tab === 'documents' && <div className="resource-documents"><button type="button" onClick={onFullText}><span>XML</span><strong>전체 명세서·청구항</strong><small>{data.fullText?.fileName || '처음 열 때 전문파일 조회'}</small></button>{orderedNotices.map((notice) => <button type="button" key={notice.documentNumber} onClick={() => onNotice(notice)}><span>PDF</span><strong>의견제출통지서</strong><small>{formatDate(notice.date)} · PDF_V2</small></button>)}</div>}
    </div>
  </aside>;
}
function Data({ label, value, link }: { label: string; value: string; link?: string }) { return <div><dt>{label}</dt><dd>{link ? <a href={link} target="_blank" rel="noreferrer">{value} ↗</a> : value || '—'}</dd></div>; }
function EmptyState({ title, text, action, onAction, disabled = false }: { title: string; text: string; action: string; onAction?: () => void; disabled?: boolean }) { return <div className="exam-empty"><span>○</span><h2>{title}</h2><p>{text}</p><button className={disabled ? 'is-coming' : ''} type="button" onClick={onAction} disabled={disabled}>{action}</button></div>; }
function LoadingOverlay({ message }: { message: string }) { return <div className="exam-loading" role="status" aria-live="polite"><section><span>사건자료 조회</span><div className="loading-spinner" aria-hidden="true"/><h2>{message}</h2><p>완료된 데이터가 도착하면 화면을 갱신합니다. AI 분석은 자동으로 실행하지 않습니다.</p></section></div>; }
function DrawingDialog({ data, onClose }: { data: PatentCase; onClose: () => void }) { const dialogRef = useModalBehavior<HTMLElement>(onClose); return <div className="exam-dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section ref={dialogRef} className="exam-dialog drawing" role="dialog" aria-modal="true" aria-label="대표도면" tabIndex={-1}><header><div><small>대표도면</small><h2>{data.title} · 대표도면</h2></div><button type="button" onClick={onClose}>닫기 ×</button></header><div>{data.drawing ? <img src={data.drawing.largeUrl} alt={`${data.title} 대표도면 확대`}/> : <p>대표도면이 없습니다.</p>}</div></section></div>; }
