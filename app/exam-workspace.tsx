'use client';
/* eslint-disable @next/next/no-img-element */

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import demoFullText from '@/app/data/demo-fulltext.json';
import {
  analyzeClaims,
  buildExaminationRounds,
  classifyCaseLifecycle,
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

type WorkMode = 'initial' | 'response';
type WorkView = 'overview' | 'response-analysis' | 'technology' | 'response-review' | 'strategy' | 'search' | 'candidates' | 'evidence' | 'notice-draft';
type ResourceTab = 'biblio' | 'claims' | 'drawing' | 'history' | 'family' | 'documents';
type SearchRole = '핵심 검색' | '조합 검색' | '일반 구성' | '검색 제외' | '확인 필요';
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
type ApiUsage = { total: number; startedAt: string; lastCalledAt: string | null; byOperation: Record<string, number> };
type DependentClaimGroup = { claimNumbers: number[]; addition: string };
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
};
type SummaryPayload = { summary: ExaminationSummary | null; reviewItems?: ReviewItem[]; model?: string; version?: string; cached: boolean; generatedAt?: string };
type ClaimChangePayload = ClaimChangeHistory & { fetchedAt: string; cached: boolean; usage?: ApiUsage; error?: string };
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
type ClaimChangeSummaryPayload = { summary: ClaimChangeSummary | null; sourceDocumentNumbers: string[]; model?: string; version?: string; cached: boolean; generatedAt?: string };
type PreReviewPhase = 'idle' | 'running' | 'complete' | 'partial';
type PreReviewStep = 'case' | 'technology' | 'notices' | 'amendments' | 'results';
type PreReviewTaskStatus = 'pending' | 'running' | 'complete' | 'failed' | 'skipped';
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
};
type StoredWorkspace = { version: 1 | 2; data: PatentCase; summary: SummaryPayload | null; mode?: WorkMode; savedAt: string };
type LivePayload = {
  applicationNumber: string;
  bibliography: null | { applicationNumber: string; applicationDate: string; title: string; titleEnglish: string; publicationNumber: string; publicationDate: string; registrationNumber: string; registrationDate: string; registrationStatus: string; finalDisposal: string; examinationRequestDate: string; examinerName: string; claimCount: number; abstract: string; ipc: CodeItem[]; claims: Claim[]; applicants: Array<{ name: string; englishName: string; country: string }>; inventors: Array<{ name: string; country: string }> };
  cpc: CodeItem[]; family: FamilyItem[]; history: HistoryItem[]; notices: NoticeItem[]; drawing: PatentCase['drawing']; fullText: PatentCase['fullText']; sources: SourceStatus[]; usage: ApiUsage; fetchedAt: string; cached?: boolean;
};
type FullTextPayload = {
  applicationNumber: string; title: string; abstract: Array<{ number: string | null; text: string }>;
  sections: Array<{ id: string; title: string; paragraphs: Array<{ number: string | null; text: string }> }>;
  claims: Claim[]; sourceFileName: string; usage?: ApiUsage; error?: string;
};
type ClaimFeature = { id: string; label: string; text: string; role: SearchRole };
type Candidate = { id: string; country: string; number: string; title: string; applicationDate: string; publicationDate: string; applicant: string; relevance: '높음' | '보통' | '낮음'; wording: '직접' | '유사' | '미확인'; eligible: boolean; matches: string[]; role: 'D1 후보' | 'D2 후보' | '보류' };

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
  ['overview', '사건 개요'],
  ['technology', '발명·청구항'],
  ['response-analysis', '통지·보정'],
  ['strategy', '검색·후보'],
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
  skipped: '해당 없음',
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
function firstSentence(value: string, maxLength = 180) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  const sentence = normalized.match(/^.*?(?:[.!?。]|$)/u)?.[0]?.trim() || normalized;
  return sentence.length > maxLength ? `${sentence.slice(0, maxLength).trim()}…` : sentence;
}
function searchRecommendationLabel(status?: ClaimChangeSummary['searchRecommendation']['status']) {
  return ({
    not_needed: '권장하지 않음',
    optional: '심사관 선택',
    recommended: '추가 검색 권장',
    insufficient: '판단 자료 부족',
  } satisfies Record<ClaimChangeSummary['searchRecommendation']['status'], string>)[status ?? 'optional'];
}
function scopeAssessmentLabel(status: ClaimChangeSummary['scopeAssessment']) {
  return ({
    narrowed: '권리범위 축소',
    broadened_possible: '확대 가능성',
    mixed: '축소·확대 혼합',
    uncertain: '판단 불가',
  } satisfies Record<ClaimChangeSummary['scopeAssessment'], string>)[status];
}
function cpcUrl(code: string) { return `https://cls.kipro.or.kr/classification/cpc/search?code=${code.replace(/\s+/g, '')}`; }
function sourceLabel(name: string) { return ({ bibliography: '서지·이력', cpc: 'CPC', drawing: '대표도면', family: '패밀리', fullText: '전문 명세서' } as Record<string, string>)[name] ?? name; }
function defaultWorkMode(patentCase: PatentCase): WorkMode {
  const lifecycle = classifyCaseLifecycle(patentCase);
  const hasResponse = patentCase.history.some((item) => /의견서|답변서|보정서/.test(item.title));
  return ['registered_closed', 'rejected_closed', 'reexamination_after_amendment'].includes(lifecycle.code)
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
  return { applicationNumber: formatApplicationNumber(b?.applicationNumber || payload.applicationNumber), applicationNumberRaw: payload.applicationNumber, title: b?.title || '발명의 명칭 미수신', titleEnglish: b?.titleEnglish || '', status: b?.finalDisposal || b?.registrationStatus || '심사 진행', updatedAt: new Date(payload.fetchedAt).toLocaleString('ko-KR'), applicant: applicant?.name || '출원인 미수신', applicantCountry: applicant?.country || '', applicationDate: formatDate(b?.applicationDate || ''), publicationNumber: b?.publicationNumber || '', publicationDate: formatDate(b?.publicationDate || ''), registrationNumber: b?.registrationNumber || '', registrationDate: formatDate(b?.registrationDate || ''), registrationStatus: b?.registrationStatus || '', examinationRequestDate: formatDate(b?.examinationRequestDate || ''), examinerName: b?.examinerName || '—', claimCount: b?.claimCount || b?.claims.length || 0, inventorCount: b?.inventors.length || 0, abstract: b?.abstract || '초록 데이터가 없습니다.', ipc: b?.ipc || [], cpc: payload.cpc || [], claims: b?.claims || [], family: payload.family || [], history: payload.history || [], notices: payload.notices || [], drawing: payload.drawing, fullText: payload.fullText, sources: payload.sources || [], isDemo: false, cached: Boolean(payload.cached), claimStructureSource: 'bibliography' };
}
const WORKSPACE_STORAGE_KEY = 'patent-exam-workspace:last-case-v1';
const PRE_REVIEW_STORAGE_PREFIX = 'patent-exam-pre-review-v1:';
const AI_SUMMARY_VERSION = 'invention-claim-summary-2026-08-30-v4';
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
    if (stored.version !== 1 || stored.summaryVersion !== AI_SUMMARY_VERSION || !stored.progress?.phase) return null;
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
    window.localStorage.setItem(`${PRE_REVIEW_STORAGE_PREFIX}${applicationNumber}`, JSON.stringify({ version: 1, summaryVersion: AI_SUMMARY_VERSION, progress }));
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
function featureParts(claim: Claim | undefined) {
  if (!claim) return [];
  return claim.text.replace(/\n/g, ' ').split(/;| 및 |, 상기 /).map((part) => part.trim().replace(/^상기 /, '')).filter((part) => part.length > 8);
}
function featureRows(claim: Claim | undefined): ClaimFeature[] {
  if (!claim) return [];
  const parts = featureParts(claim).slice(0, 7);
  return parts.map((text, index) => ({ id: `${claim.number}${String.fromCharCode(65 + index)}`, label: text.length > 30 ? `${text.slice(0, 30)}…` : text, text, role: index < 3 ? '일반 구성' : index === parts.length - 1 ? '핵심 검색' : '조합 검색' }));
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
  const [summary, setSummary] = useState<SummaryPayload | null>(null); const [summaryBusy, setSummaryBusy] = useState(false); const [summaryError, setSummaryError] = useState(''); const [selectedClaim, setSelectedClaim] = useState(1); const [features, setFeatures] = useState<ClaimFeature[]>(featureRows(demoCase.claims[0]));
  const [searchRan, setSearchRan] = useState(false); const [candidates, setCandidates] = useState<Candidate[]>([]); const [selectedNotice, setSelectedNotice] = useState<NoticeItem | null>(null); const [drawingOpen, setDrawingOpen] = useState(false); const [packageBusy, setPackageBusy] = useState(false); const [restoring, setRestoring] = useState(true);
  const [claimChanges, setClaimChanges] = useState<ClaimChangePayload | null>(null); const [claimChangesBusy, setClaimChangesBusy] = useState(false); const [claimChangesError, setClaimChangesError] = useState('');
  const [claimChangeSummary, setClaimChangeSummary] = useState<ClaimChangeSummaryPayload | null>(null); const [, setClaimChangeSummaryBusy] = useState(false); const [, setClaimChangeSummaryError] = useState('');
  const [noticeAnalyses, setNoticeAnalyses] = useState<Record<string, NoticeAnalysis>>({});
  const [amendmentResolutions, setAmendmentResolutions] = useState<Record<string, AmendmentResolutionPayload>>({});
  const [preReview, setPreReview] = useState<PreReviewProgress>({ phase: 'idle', currentStep: 'case', completedSteps: [], noticeDone: 0, noticeTotal: 0, error: '' });
  const [strategyDraftKeywords, setStrategyDraftKeywords] = useState<string[]>([]);
  const [sourceDetailsOpen, setSourceDetailsOpen] = useState(false); const [caseDetailsOpen, setCaseDetailsOpen] = useState(false);
  const claimChangesAttemptedFor = useRef<string | null>(null);
  const claimChangeSummaryAttemptedFor = useRef<string | null>(null);
  const stepRefs = useRef<Partial<Record<WorkView, HTMLButtonElement | null>>>({});
  const isMobile = useIsMobile();
  const loadCachedSummary = useCallback(async (applicationNumber: string) => {
    setSummaryError('');
    try {
      const response = await fetch(`/api/patent/summary?${new URLSearchParams({ applicationNumber })}`, { cache: 'no-store' });
      const payload = (await response.json()) as SummaryPayload & { error?: string };
      if (!response.ok) throw new Error(payload.error || '저장된 AI 분석을 확인하지 못했습니다.');
      if (payload.summary && payload.version === AI_SUMMARY_VERSION) {
        setSummary(payload);
        writeStoredSummary(applicationNumber, payload);
      }
      else setSummary(null);
    } catch (error) { setSummaryError(error instanceof Error ? error.message : '저장된 AI 분석을 확인하지 못했습니다.'); }
  }, []);
  const generateSummary = useCallback(async (applicationNumber: string, force = false): Promise<SummaryPayload | null> => {
    setSummaryBusy(true); setSummaryError('');
    try {
      const fullTextResponse = await fetch(`/api/patent/fulltext?${new URLSearchParams({ applicationNumber })}`, { cache: 'no-store' });
      const fullText = (await fullTextResponse.json()) as FullTextPayload;
      if (!fullTextResponse.ok) throw new Error(fullText.error || 'AI 분석에 필요한 전문 명세서를 불러오지 못했습니다.');
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
          };
          const nextSelectedClaim =
            xmlClaims.find((claim) => claim.number === selectedClaim) ?? xmlClaims[0];
          setData(nextData);
          setSelectedClaim(nextSelectedClaim.number);
          setFeatures(featureRows(nextSelectedClaim));
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
      setSummary(payload); setStrategyDraftKeywords([]); writeStoredSummary(applicationNumber, payload);
      return payload;
    } catch (error) { setSummaryError(error instanceof Error ? error.message : 'AI 분석을 불러오지 못했습니다.'); return null; }
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
      setClaimChanges(payload);
      if (payload.usage) setUsage(payload.usage);
      return payload;
    } catch (error) {
      setClaimChangesError(error instanceof Error ? error.message : '청구항 변동이력을 불러오지 못했습니다.');
      return null;
    } finally {
      setClaimChangesBusy(false);
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
      setClaimChangeSummary(payload.summary && expected === received ? payload : null);
    } catch (error) {
      setClaimChangeSummaryError(error instanceof Error ? error.message : '저장된 청구항 변동 AI 요약을 확인하지 못했습니다.');
    }
  }, []);
  const claimAnalysis = analyzeClaims(data.claims);
  const examinationRounds = buildExaminationRounds<NoticeItem>(data.history, data.notices);
  const lifecycle = classifyCaseLifecycle(data);
  const steps = workspaceSteps; const activeIndex = Math.max(0, steps.findIndex((step) => step[0] === view)); const activeAvailableIndex = Math.max(0, activeIndex); const currentClaim = data.claims.find((claim) => claim.number === selectedClaim) || data.claims[0]; const amendment = examinationRounds.flatMap((round) => round.amendments).at(-1);
  const targetLabel = mode === 'response' && amendment ? `${formatDate(amendment.date)} 보정 청구항 1~${data.claimCount}` : `현재 출원 청구항 1~${data.claimCount}`;
  const failedSources = data.sources.filter((source) => !source.ok);
  const approvedReviewItems = (summary?.reviewItems ?? []).filter((item) => isApprovedReviewStatus(item.reviewStatus));
  const approvedKeywords = approvedReviewItems.filter((item) => item.entityId.startsWith('searchKeywords.')).map((item) => item.text);
  const visibleClaimChanges = claimChanges?.applicationNumber === data.applicationNumberRaw ? claimChanges : null;
  const linkedClaimChangeDocuments = visibleClaimChanges?.documents.filter((document) => examinationRounds.some((round) => round.amendments.some((item) => digits(item.documentNumber) === digits(document.documentNumber)))) ?? [];
  const claimChangeDocumentNumbers = linkedClaimChangeDocuments.map((document) => digits(document.documentNumber));
  const claimChangeSignature = `${data.applicationNumberRaw}:${[...claimChangeDocumentNumbers].sort().join(',')}`;
  const aiStrategySuggestions = [...new Set([...(summary?.summary?.searchKeywords ?? []), ...(claimChangeSummary?.summary?.searchRecommendation.targetFeatures ?? [])].map((item) => item.trim()).filter(Boolean))];
  const strategyKeywords = [...new Set([...approvedKeywords, ...strategyDraftKeywords])];
  const searchExpression = buildSearchExpression(data, features, strategyKeywords);
  const hasAmendmentDocuments = examinationRounds.some((round) => round.amendments.length > 0);
  const failedPreReviewTasks = Object.values(preReview.tasks ?? {}).filter((task) => task?.status === 'failed').length;
  useEffect(() => {
    let cancelled = false;
    const requested = digits(new URLSearchParams(window.location.search).get('applicationNumber') || '');
    const stored = readStoredWorkspace();
    if (stored && (!requested || requested === stored.data.applicationNumberRaw)) {
      window.queueMicrotask(() => {
        if (cancelled) return;
        const restoredSummary = stored.summary?.version === AI_SUMMARY_VERSION ? stored.summary : null;
        const restoredMode = defaultWorkMode(stored.data);
        setData(stored.data); setQuery(stored.data.applicationNumber); setMode(restoredMode); setView('overview'); setSelectedClaim(stored.data.claims[0]?.number || 1); setFeatures(featureRows(stored.data.claims[0])); setSummary(restoredSummary); setPreReview(readStoredPreReview(stored.data.applicationNumberRaw) ?? { phase: 'idle', currentStep: 'case', completedSteps: [], noticeDone: 0, noticeTotal: stored.data.notices.length, error: '' }); setRestoring(false);
        if (!stored.data.isDemo && !restoredSummary?.summary) void loadCachedSummary(stored.data.applicationNumberRaw);
      });
      return () => { cancelled = true; };
    }
    if (!/^(10|20)\d{11}$/.test(requested)) { window.queueMicrotask(() => { if (!cancelled) setRestoring(false); }); return () => { cancelled = true; }; }
    void requestPatentCase(requested).then(({ data: restoredData, usage: restoredUsage }) => {
      if (cancelled) return;
      const restoredMode = defaultWorkMode(restoredData);
      setData(restoredData); setQuery(restoredData.applicationNumber); setMode(restoredMode); setView('overview'); setSelectedClaim(restoredData.claims[0]?.number || 1); setFeatures(featureRows(restoredData.claims[0])); setPreReview(readStoredPreReview(restoredData.applicationNumberRaw) ?? { phase: 'idle', currentStep: 'case', completedSteps: [], noticeDone: 0, noticeTotal: restoredData.notices.length, error: '' }); if (restoredUsage) setUsage(restoredUsage); writeStoredWorkspace(restoredData, null, restoredMode); syncCaseUrl(restoredData.applicationNumberRaw);
      if (!restoredData.isDemo) void loadCachedSummary(restoredData.applicationNumberRaw);
    }).catch((error) => { if (!cancelled) setToast(error instanceof Error ? error.message : '이전 사건을 불러오지 못했습니다.'); }).finally(() => { if (!cancelled) setRestoring(false); });
    return () => { cancelled = true; };
  }, [loadCachedSummary]);
  useEffect(() => { void fetchUsage().then(setUsage).catch(() => undefined); }, []);
  useEffect(() => {
    if (restoring || data.isDemo) return;
    writeStoredPreReview(data.applicationNumberRaw, preReview);
  }, [data.applicationNumberRaw, data.isDemo, preReview, restoring]);
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
    const documentNumbers = claimChangeSignature.split(':').at(-1)?.split(',').filter(Boolean) ?? [];
    if (!documentNumbers.length) return;
    if (claimChangeSummaryAttemptedFor.current === claimChangeSignature) return;
    void loadCachedClaimChangeSummary(data.applicationNumberRaw, documentNumbers);
  }, [claimChangeSignature, data.applicationNumberRaw, loadCachedClaimChangeSummary]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 3200); return () => window.clearTimeout(timer); }, [toast]);
  useEffect(() => {
    stepRefs.current[view]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [mode, view]);
  useEffect(() => {
    function handlePopState() {
      if (selectedNotice) { setSelectedNotice(null); return; }
      if (drawingOpen) { setDrawingOpen(false); return; }
      if (resourceOpen) setResourceOpen(false);
    }
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [drawingOpen, resourceOpen, selectedNotice]);
  function go(next: WorkView) { setView(next); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function selectMode(next: WorkMode) { setMode(next); setView('overview'); writeStoredWorkspace(data, summary, next); }
  function pushMobileOverlay(name: 'resource' | 'notice' | 'drawing') {
    if (!isMobile) return;
    window.history.pushState({ ...window.history.state, examOverlay: name }, '', window.location.href);
  }
  function openResource(tab: ResourceTab) {
    setResourceTab(tab);
    if (!resourceOpen) pushMobileOverlay('resource');
    setResourceOpen(true);
  }
  function closeResource() {
    if (isMobile && window.history.state?.examOverlay === 'resource') window.history.back();
    else setResourceOpen(false);
  }
  function openNotice(notice: NoticeItem) { setSelectedNotice(notice); pushMobileOverlay('notice'); }
  function closeNotice() {
    if (isMobile && window.history.state?.examOverlay === 'notice') window.history.back();
    else setSelectedNotice(null);
  }
  function openDrawing() { setDrawingOpen(true); pushMobileOverlay('drawing'); }
  function closeDrawing() {
    if (isMobile && window.history.state?.examOverlay === 'drawing') window.history.back();
    else setDrawingOpen(false);
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
      setClaimChangeSummary(payload); setStrategyDraftKeywords([]);
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
    if (!force && noticeAnalyses[key]) return noticeAnalyses[key];
    const parameters = new URLSearchParams({ applicationNumber: data.applicationNumberRaw, sendNumber: round.notice.documentNumber });
    if (force) parameters.set('force', 'true');
    const response = await fetch(`/api/patent/notice-analysis?${parameters}`, { method: 'POST' });
    const payload = await response.json() as NoticeAnalysis;
    if (!response.ok) throw new Error(payload.error || `${round.number}차 통지서를 분석하지 못했습니다.`);
    setNoticeAnalyses((current) => ({ ...current, [key]: payload }));
    return payload;
  }
  async function analyzeResolution(round: ExaminationRound<NoticeItem>, noticeAnalysis: NoticeAnalysis, documents: ClaimChangeDocument[], force = false) {
    const key = digits(round.notice.documentNumber);
    const expected = documents.map((document) => digits(document.documentNumber)).sort().join(',');
    const cached = amendmentResolutions[key];
    const received = (cached?.sourceDocumentNumbers ?? []).map(digits).sort().join(',');
    if (!force && cached?.summary && expected === received) return cached;
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
    const noticesAlreadyComplete = examinationRounds.every((round) => Boolean(noticeAnalyses[digits(round.notice.documentNumber)]));
    const amendmentRounds = examinationRounds.filter((round) => round.amendments.length > 0);
    const amendmentsAlreadyComplete = amendmentRounds.every((round) => Boolean(amendmentResolutions[digits(round.notice.documentNumber)]?.summary))
      && (amendmentRounds.length === 0 || Boolean(claimChangeSummary?.summary));
    let taskSnapshot: Partial<Record<PreReviewStep, PreReviewTaskState>> = {
      case: { status: 'complete', detail: '서지·전문·이력 확인 완료' },
      technology: summary?.summary
        ? { status: 'complete', detail: '저장된 발명 요약 사용' }
        : { status: 'pending', detail: '전문 명세서 분석 대기' },
      notices: examinationRounds.length === 0
        ? { status: 'skipped', detail: '의견제출통지서 없음' }
        : noticesAlreadyComplete
          ? { status: 'complete', detail: `통지서 ${examinationRounds.length}/${examinationRounds.length} 분석 완료` }
          : { status: 'pending', detail: `통지서 0/${examinationRounds.length} 분석 대기` },
      amendments: !hasAmendmentDocuments
        ? { status: 'skipped', detail: '보정서 없음' }
        : amendmentsAlreadyComplete
          ? { status: 'complete', detail: '청구항 변동과 거절이유 해소 검토 완료' }
          : { status: 'pending', detail: '청구항 변동 분석 대기' },
      results: { status: 'pending', detail: '분석 결과 정리 대기' },
      ...(preReview.tasks ?? {}),
    };
    const shouldRun = (step: PreReviewStep) => !requestedStep || requestedStep === step;
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
        const generated = !summary?.summary || force || data.claimStructureSource !== 'fulltext'
          ? await generateSummary(data.applicationNumberRaw, force)
          : summary;
        if (generated?.summary || summary?.summary) {
          reportTask('technology', {
            status: 'complete',
            detail: generated?.cached ? '저장된 발명 요약 사용' : '전문 기반 발명 요약 완료',
            completedAt: new Date().toISOString(),
          });
        } else {
          reportTask('technology', { status: 'failed', detail: '발명 요약을 생성하지 못함', error: summaryError || '전문 분석 응답 없음' });
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
          reportTask('amendments', { status: 'skipped', detail: '보정서 없음' });
        } else {
          reportTask('amendments', { status: 'running', detail: '청구항 변동과 거절이유 해소 여부 분석 중' });
          let activeClaimChanges = visibleClaimChanges;
          if (!activeClaimChanges && !data.isDemo) activeClaimChanges = await loadClaimChanges(data.applicationNumberRaw);
          const activeDocuments = activeClaimChanges?.documents.filter((document) => examinationRounds.some((round) => round.amendments.some((item) => digits(item.documentNumber) === digits(document.documentNumber)))) ?? [];
          const amendmentErrors: string[] = [];
          if (!activeClaimChanges) amendmentErrors.push('청구항 변동이력을 불러오지 못했습니다.');
          else if (!activeDocuments.length) amendmentErrors.push('보정서와 연결된 청구항 변동이 없습니다.');
          if (activeDocuments.length && (!claimChangeSummary?.summary || force)) {
            const changeSummary = await generateClaimChangeAnalysis(force, activeDocuments);
            if (!changeSummary?.summary) amendmentErrors.push('보정 기술변화 분석을 완료하지 못했습니다.');
          }
          for (const round of examinationRounds) {
            const documents = round.amendments.flatMap((item) => {
              const document = activeClaimChanges ? claimChangeDocument(activeClaimChanges, item.documentNumber) : null;
              return document ? [document] : [];
            });
            const noticeAnalysis = analyses[digits(round.notice.documentNumber)] ?? noticeAnalyses[digits(round.notice.documentNumber)];
            if (!documents.length) continue;
            if (!noticeAnalysis) {
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

      reportTask('results', { status: 'complete', detail: '완료된 분석을 사건 개요에 반영', completedAt: new Date().toISOString() });
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
      setToast(failedTasks.length || pendingTasks.length ? '완료하지 못한 분석 항목을 확인해 주세요.' : 'AI 사전검토가 완료되었습니다.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI 사전검토를 완료하지 못했습니다.';
      reportTask(requestedStep ?? 'results', { status: 'failed', detail: '분석 실행 중 오류 발생', error: message });
      setPreReview((current) => ({ ...current, phase: 'partial', currentStep: 'results', error: message, tasks: taskSnapshot }));
    }
  }
  function toggleStrategyKeyword(keyword: string) {
    if (approvedKeywords.includes(keyword)) return;
    setStrategyDraftKeywords((current) => current.includes(keyword) ? current.filter((item) => item !== keyword) : [...current, keyword]);
  }
  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const normalized = digits(query); if (!/^(10|20)\d{11}$/.test(normalized)) { setToast('특허·실용신안 출원번호 13자리를 확인해 주세요.'); return; }
    setLoadingMessage('KIPRIS Plus에서 사건자료를 불러오는 중입니다.'); setLoading(true);
    try { const { data: nextData, usage: nextUsage } = await requestPatentCase(normalized); if (nextUsage) setUsage(nextUsage);
      const nextMode = defaultWorkMode(nextData);
      setData(nextData); setQuery(nextData.applicationNumber); setMode(nextMode); setView('overview'); setSelectedClaim(nextData.claims[0]?.number || 1); setFeatures(featureRows(nextData.claims[0])); setSummary(null); setSummaryError(''); setClaimChanges(null); setClaimChangesError(''); setClaimChangeSummary(null); setClaimChangeSummaryError(''); setNoticeAnalyses({}); setAmendmentResolutions({}); setPreReview({ phase: 'idle', currentStep: 'case', completedSteps: [], noticeDone: 0, noticeTotal: nextData.notices.length, error: '' }); setStrategyDraftKeywords([]); setSourceDetailsOpen(false); setCaseDetailsOpen(false); claimChangesAttemptedFor.current = null; claimChangeSummaryAttemptedFor.current = null; setSearchRan(false); setCandidates([]); writeStoredWorkspace(nextData, null, nextMode); syncCaseUrl(nextData.applicationNumberRaw); if (!nextData.isDemo) void loadCachedSummary(nextData.applicationNumberRaw); setToast('사건을 불러왔습니다. AI 사전검토는 실행 버튼을 눌렀을 때만 시작합니다.');
    } catch (error) { setToast(error instanceof Error ? error.message : '사건 조회에 실패했습니다.'); } finally { setLoading(false); }
  }
  async function refreshPatentCase() {
    if (data.isDemo) { setToast('데모 사건은 최신 조회를 지원하지 않습니다.'); return; }
    setLoadingMessage('KIPRIS Plus에서 최신 사건자료를 다시 조회하는 중입니다.'); setLoading(true);
    try {
      const { data: nextData, usage: nextUsage } = await requestPatentCase(data.applicationNumberRaw, true);
      if (nextUsage) setUsage(nextUsage);
      setData(nextData); setQuery(nextData.applicationNumber); setClaimChanges(null); setClaimChangesError(''); setClaimChangeSummary(null); setClaimChangeSummaryError(''); claimChangesAttemptedFor.current = null; claimChangeSummaryAttemptedFor.current = null;
      const nextClaim = nextData.claims.find((claim) => claim.number === selectedClaim) ?? nextData.claims[0];
      setSelectedClaim(nextClaim?.number || 1); setFeatures(featureRows(nextClaim));
      setNoticeAnalyses({}); setAmendmentResolutions({}); setPreReview({ phase: 'idle', currentStep: 'case', completedSteps: [], noticeDone: 0, noticeTotal: nextData.notices.length, error: '' });
      writeStoredWorkspace(nextData, summary, mode); syncCaseUrl(nextData.applicationNumberRaw);
      setToast('최신 사건자료로 갱신했습니다.');
    } catch (error) { setToast(error instanceof Error ? error.message : '최신 사건자료 조회에 실패했습니다.'); }
    finally { setLoading(false); }
  }
  async function downloadPackage() {
    setPackageBusy(true); try { const { default: JSZip } = await import('jszip'); const zip = new JSZip(); zip.file('01_사건개요.json', JSON.stringify({ workMode: mode, lifecycle, targetLabel, data }, null, 2)); zip.file('02_청구항구조.json', JSON.stringify(claimAnalysis, null, 2)); zip.file('03_심사회차.json', JSON.stringify(examinationRounds, null, 2)); zip.file('04_청구항변동이력.json', JSON.stringify(visibleClaimChanges, null, 2)); zip.file('05_보정영향_AI요약.json', JSON.stringify(claimChangeSummary, null, 2)); zip.file('06_확정된_AI검토항목.json', JSON.stringify(approvedReviewItems, null, 2)); zip.file('07_검색대상구성.json', JSON.stringify(features, null, 2)); zip.file('08_검색전략.txt', searchExpression); zip.file('09_후보문헌.json', JSON.stringify(candidates, null, 2)); const blob = await zip.generateAsync({ type: 'blob' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `심사자료_${data.applicationNumberRaw}.zip`; anchor.click(); URL.revokeObjectURL(url); setToast(`청구항 변동이력과 확정·수정된 AI 항목 ${approvedReviewItems.length}건을 포함한 ZIP을 만들었습니다.`); } finally { setPackageBusy(false); }
  }
  function runSearch() { setSearchRan(true); if (data.isDemo) { setCandidates(demoCandidates); setToast('데모 검색결과 3건을 불러왔습니다.'); } else { setCandidates([]); setToast('실데이터 검색 API는 다음 연동 단계에서 연결합니다.'); } }
  function pdfUrl(notice: NoticeItem) { return `/api/patent/pdf?${new URLSearchParams({ applicationNumber: data.applicationNumberRaw, sendNumber: notice.documentNumber })}`; }
  function openEvidence(reference: ReviewItem['sourceRefs'][number]) {
    if (reference.sourceType === 'claim') {
      const claimNumber = Number(reference.sourceId.match(/\d+/)?.[0] ?? 0);
      if (claimNumber) setSelectedClaim(claimNumber);
      openResource('claims');
      return;
    }
    if (reference.sourceType === 'specification' || reference.sourceType === 'abstract') {
      window.location.assign(`/fulltext?applicationNumber=${encodeURIComponent(data.applicationNumberRaw)}#${encodeURIComponent(reference.sourceId)}`);
      return;
    }
    openResource('documents');
  }

  if (restoring) return <div className="exam-app"><div className="exam-loading" role="status"><section><span>작업공간 복원</span><h2>이전에 보던 심사 사건을 불러오는 중입니다.</h2></section></div></div>;

  return <div className={`exam-app mode-${mode}`}>
    <a className="skip-link" href="#exam-main">본문 바로가기</a>
    <header className="exam-header">
      <button className="exam-brand" type="button" onClick={() => go('overview')}><span aria-hidden="true">특허</span><strong>특허심사 지원서비스</strong></button>
      <form className="exam-search" onSubmit={handleSearch}><label htmlFor="case-search">출원번호 검색</label><input id="case-search" value={query} onChange={(event) => setQuery(event.target.value)} inputMode="numeric" placeholder="출원번호 13자리 입력"/><button type="submit">검색</button></form>
      <div className="exam-header-actions">
        <button className="exam-secondary mobile-case-materials" type="button" onClick={() => openResource('biblio')}><span className="desktop-label">사건자료</span><span className="mobile-label">자료</span></button>
        <details className="mobile-more-menu"><summary aria-label="더보기">⋮</summary><div role="menu"><button type="button" onClick={downloadPackage} disabled={packageBusy}>{packageBusy ? '정리 중…' : '심사자료 내려받기'}</button><button type="button" disabled={data.isDemo} onClick={() => void refreshPatentCase()}>최신 데이터 다시 조회</button><button type="button" onClick={() => setSourceDetailsOpen((current) => !current)}>데이터 진단정보</button><button type="button" onClick={() => selectMode('initial')}>최초심사 검토로 보기</button><button type="button" onClick={() => selectMode('response')}>중간서류 검토로 보기</button><span>외부 API 누적 {usage?.total ?? '—'}회</span></div></details>
      </div>
    </header>
    <div className="exam-modebar" aria-label="현재 사건 정보">
      <div className="case-primary"><div className="case-title-line"><strong>{data.applicationNumber}</strong><span className={`mobile-lifecycle-badge ${lifecycle.tone}`}>{lifecycle.label}</span></div><span>{data.title}</span><small>{data.isDemo ? '데모 데이터' : `${data.cached ? '저장된 사건' : '최근 조회'} ${data.updatedAt}`} · {workModeLabel(mode, lifecycle)}</small></div>
      <button className="mobile-case-details-toggle" type="button" aria-expanded={caseDetailsOpen} onClick={() => setCaseDetailsOpen((current) => !current)}>사건정보 {caseDetailsOpen ? '접기' : '펼치기'}</button>
      <div className={`mobile-case-details ${caseDetailsOpen ? 'open' : ''}`}><Data label="분석대상" value={targetLabel}/><Data label="상태 설명" value={lifecycle.reason}/><div className="mode-switch" aria-label="사용자 작업 관점"><button aria-pressed={mode === 'initial'} className={mode === 'initial' ? 'active' : ''} type="button" onClick={() => selectMode('initial')}>최초심사 검토</button><button aria-pressed={mode === 'response'} className={mode === 'response' ? 'active' : ''} type="button" onClick={() => selectMode('response')}>중간서류 검토</button></div></div>
    </div>
    <div className={`exam-frame ${resourceOpen ? 'resource-visible' : ''}`}>
      <aside className="exam-sidebar"><p>검토 메뉴</p><label className="mobile-step-picker"><span>{activeAvailableIndex + 1} / {steps.length}</span><select aria-label="검토 메뉴 선택" value={view} onChange={(event) => go(event.target.value as WorkView)}>{steps.map((step) => <option key={step[0]} value={step[0]}>{step[1]}</option>)}</select></label><nav aria-label="검토 메뉴">{steps.map((step, index) => { const state = step[0] === view ? 'active' : 'idle'; return <button ref={(node) => { stepRefs.current[step[0]] = node; }} key={step[0]} className={state} type="button" aria-current={state === 'active' ? 'page' : undefined} onClick={() => go(step[0])}><span>{String(index + 1)}</span><strong>{step[1]}</strong></button>; })}</nav></aside>
      <main className="exam-main" id="exam-main" tabIndex={-1}>
        {view !== 'overview' && (preReview.phase === 'running' || preReview.phase === 'partial') && <section className={`pre-review-global-status ${preReview.phase}`} role="status" aria-live="polite"><span>{preReview.phase === 'running' ? 'AI 사전검토 진행 중' : '일부 분석 미완료'}</span><strong>{preReview.phase === 'running' ? preReviewTaskLabels[preReview.currentStep] : `${failedPreReviewTasks || 1}개 항목 확인 필요`}</strong><small>{preReview.phase === 'running' ? preReview.tasks?.[preReview.currentStep]?.detail || '분석 상태를 갱신하고 있습니다.' : preReview.error || '사건 개요에서 항목별 상태를 확인할 수 있습니다.'}</small><button type="button" onClick={() => go('overview')}>분석상태 보기</button></section>}
        {failedSources.length > 0 && <section className="source-warning" role="alert"><div><strong>일부 사건자료를 불러오지 못했습니다.</strong><span>{failedSources.map((source) => sourceLabel(source.name)).join(' · ')}</span></div><div><button type="button" onClick={() => setSourceDetailsOpen((current) => !current)}>{sourceDetailsOpen ? '상세 닫기' : '상세 보기'}</button><button type="button" disabled={data.isDemo} onClick={() => void refreshPatentCase()}>다시 조회</button></div>{sourceDetailsOpen && <ul>{failedSources.map((source) => <li key={source.name}><b>{sourceLabel(source.name)}</b>{source.message}</li>)}</ul>}</section>}
        {view === 'overview' && <OverviewView data={data} mode={mode} lifecycle={lifecycle} rounds={examinationRounds} summary={summary} noticeAnalyses={noticeAnalyses} amendmentResolutions={amendmentResolutions} claimChangeSummary={claimChangeSummary?.summary ?? null} preReview={preReview} onRun={(force) => void runPreReview(force)} onRunStep={(step) => void runPreReview(false, step)} onView={go} onResource={openResource}/>}
        {view === 'response-analysis' && <ResponseAnalysisView rounds={examinationRounds} currentClaims={data.claims} claimChanges={visibleClaimChanges} claimChangeSummary={claimChangeSummary?.summary ?? null} claimChangesBusy={claimChangesBusy} claimChangesError={claimChangesError} noticeAnalyses={noticeAnalyses} amendmentResolutions={amendmentResolutions} onNotice={openNotice} onResource={openResource}/>}
        {view === 'technology' && <TechnologyView data={data} claimAnalysis={claimAnalysis} selectedClaim={selectedClaim} features={features} summary={summary} summaryBusy={summaryBusy} summaryError={summaryError} onSelectClaim={(number) => { setSelectedClaim(number); setFeatures(featureRows(data.claims.find((claim) => claim.number === number))); }} onOpenClaim={(number) => { setSelectedClaim(number); openResource('claims'); }} onEvidence={openEvidence} onOpenReview={() => go('overview')}/>}
        {view === 'strategy' && <StrategyView data={data} mode={mode} features={features} approvedKeywords={approvedKeywords} suggestedKeywords={aiStrategySuggestions} selectedDraftKeywords={strategyDraftKeywords} claimChangeSummary={claimChangeSummary?.summary ?? null} candidates={candidates} searchRan={searchRan} onToggleKeyword={toggleStrategyKeyword} onChangeRole={(id, role) => setFeatures((current) => current.map((feature) => feature.id === id ? { ...feature, role } : feature))} onCopy={() => void copyText(searchExpression, '검색식')} onRunDemo={runSearch} onOpenResource={() => openResource('documents')}/>}
      </main>
      {resourceOpen && <ResourcePanel data={data} tab={resourceTab} selectedClaim={currentClaim?.number || 1} isMobile={isMobile} onTab={setResourceTab} onClose={closeResource} onFullText={() => window.location.assign(`/fulltext?applicationNumber=${encodeURIComponent(data.applicationNumberRaw)}`)} onNotice={openNotice} onDrawing={openDrawing}/>}</div>
    {loading && <LoadingOverlay message={loadingMessage}/>} {toast && <div className="exam-toast" role="status">{toast}</div>} {selectedNotice && <NoticeDialog applicationNumber={data.applicationNumberRaw} notice={selectedNotice} pdfUrl={pdfUrl(selectedNotice)} onClose={closeNotice}/>} {drawingOpen && <DrawingDialog data={data} onClose={closeDrawing}/>}</div>;
}

function PageHeading({ step, title, description, action }: { step: string; title: string; description: string; action?: React.ReactNode }) { return <header className="work-heading"><div><span>{/^\d+$/.test(step) ? `단계 ${Number(step)}` : step}</span><h1>{title}</h1><p>{description}</p></div>{action}</header>; }
function OverviewView({ data, mode, lifecycle, rounds, summary, noticeAnalyses, amendmentResolutions, claimChangeSummary, preReview, onRun, onRunStep, onView, onResource }: {
  data: PatentCase;
  mode: WorkMode;
  lifecycle: CaseLifecycle;
  rounds: ExaminationRound<NoticeItem>[];
  summary: SummaryPayload | null;
  noticeAnalyses: Record<string, NoticeAnalysis>;
  amendmentResolutions: Record<string, AmendmentResolutionPayload>;
  claimChangeSummary: ClaimChangeSummary | null;
  preReview: PreReviewProgress;
  onRun: (force: boolean) => void;
  onRunStep: (step: PreReviewStep) => void;
  onView: (view: WorkView) => void;
  onResource: (tab: ResourceTab) => void;
}) {
  const cachedResultCount = Number(Boolean(summary?.summary)) + Object.keys(noticeAnalyses).length + Object.keys(amendmentResolutions).length + Number(Boolean(claimChangeSummary));
  const hasResults = preReview.phase === 'complete' || preReview.phase === 'partial' || cachedResultCount > 0;
  const noticesComplete = rounds.every((round) => Boolean(noticeAnalyses[digits(round.notice.documentNumber)]));
  const amendmentRounds = rounds.filter((round) => round.amendments.length > 0);
  const amendmentsComplete = amendmentRounds.every((round) => Boolean(amendmentResolutions[digits(round.notice.documentNumber)]?.summary))
    && (amendmentRounds.length === 0 || Boolean(claimChangeSummary));
  const reviewComplete = preReview.phase === 'complete' || Boolean(summary?.summary && noticesComplete && amendmentsComplete);
  const failedSources = data.sources.filter((source) => !source.ok);
  const opinionUnavailable = rounds.some((round) => round.opinions.length > 0);
  const groundRows = rounds.flatMap((round) => {
    const key = digits(round.notice.documentNumber);
    const notice = noticeAnalyses[key];
    const resolution = amendmentResolutions[key]?.summary;
    if (resolution?.legalGroundResults.length) return resolution.legalGroundResults;
    return (notice?.summary.rejectionGrounds ?? []).map((ground) => ({
        provision: ground.provision,
        originalClaimNumbers: ground.claimNumbers,
        deletedClaimNumbers: [],
        amendedClaimNumbers: [],
        remainingClaimNumbers: ground.claimNumbers,
        assessment: 'needs_review' as AmendmentResolutionStatus,
        summary: ground.reason || `${claimNumbersLabel(ground.claimNumbers)}에 대한 통지 내용이 확인되었습니다.`,
    }));
  });
  const resolvedCount = groundRows.filter((ground) => ground.assessment === 'resolved').length;
  const reviewCount = groundRows.filter((ground) => ['partially_resolved', 'not_resolved', 'needs_review'].includes(ground.assessment)).length;
  const insufficientCount = groundRows.filter((ground) => ground.assessment === 'insufficient').length;
  const recommendation = claimChangeSummary?.searchRecommendation;
  const hasAmendment = rounds.some((round) => round.amendments.length > 0);
  const fallbackTasks: Record<PreReviewStep, PreReviewTaskState> = {
    case: { status: 'complete', detail: '서지·전문·이력 확인 완료' },
    technology: summary?.summary ? { status: 'complete', detail: '저장된 발명 요약 사용' } : { status: 'pending', detail: '전문 명세서 분석 대기' },
    notices: rounds.length === 0 ? { status: 'skipped', detail: '의견제출통지서 없음' } : noticesComplete ? { status: 'complete', detail: `통지서 ${rounds.length}/${rounds.length} 분석 완료` } : { status: 'pending', detail: `통지서 분석 대기 · ${Object.keys(noticeAnalyses).length}/${rounds.length}` },
    amendments: !hasAmendment ? { status: 'skipped', detail: '보정서 없음' } : amendmentsComplete ? { status: 'complete', detail: '청구항 변동과 해소 검토 완료' } : { status: 'pending', detail: '청구항 변동 분석 대기' },
    results: preReview.phase === 'complete' || preReview.phase === 'partial' ? { status: 'complete', detail: '완료된 분석을 사건 개요에 반영' } : { status: 'pending', detail: '분석 결과 정리 대기' },
  };
  const taskRows = (['case', 'technology', 'notices', 'amendments', 'results'] as PreReviewStep[]).map((step) => [step, preReview.tasks?.[step] ?? fallbackTasks[step]] as const);
  return <>
    <PageHeading step="01" title="사건 개요" description="사건 상태와 분석 가능한 자료를 확인하고 필요한 검토 화면으로 이동합니다." action={hasResults && preReview.phase !== 'running' ? <button className="exam-secondary" type="button" onClick={() => onRun(reviewComplete)}>{reviewComplete ? '분석 갱신' : '사전검토 계속'}</button> : undefined}/>
    {!hasResults && preReview.phase !== 'running' && <section className="pre-review-launch">
      <div className="pre-review-case"><span>{workModeLabel(mode, lifecycle)}</span><h2>{data.applicationNumber} · {data.title}</h2><p>{lifecycle.label} · {data.applicant}</p></div>
      <dl className="overview-case-facts"><Data label="청구항" value={`${data.claimCount}개`}/><Data label="통지서" value={`${rounds.length}건`}/><Data label="보정 이력" value={hasAmendment ? '있음' : '없음'}/></dl>
      <div className="pre-review-materials"><strong>확보된 자료</strong><p>서지정보 · 청구항 · 전문{rounds.length ? ' · 의견제출통지서' : ''}{hasAmendment ? ' · 청구항 변동이력' : ''}</p></div>
      {(opinionUnavailable || failedSources.length > 0) && <div className="pre-review-warnings">{opinionUnavailable && <span>의견서 원문 미확보</span>}{failedSources.map((source) => <span key={source.name}>{sourceLabel(source.name)} 확인 필요</span>)}</div>}
      <footer><button type="button" onClick={() => onResource('claims')}>청구항 원문</button><button className="exam-primary" type="button" onClick={() => onRun(false)} disabled={data.isDemo}>AI 사전검토 시작</button></footer>
      {data.isDemo && <small>데모 사건에서는 AI 사전검토를 새로 실행하지 않습니다. 실제 출원번호를 조회해 주세요.</small>}
    </section>}
    {preReview.phase === 'running' && <section className="pre-review-progress detailed" role="status" aria-live="polite"><header><span>AI 사전검토 중</span><h2>완료된 분석은 유지하고 필요한 항목만 처리합니다.</h2></header><ol>{taskRows.map(([id, task]) => <li className={`task-${task.status}${preReview.currentStep === id ? ' current' : ''}`} key={id}><span>{task.status === 'complete' ? '✓' : task.status === 'failed' ? '!' : task.status === 'skipped' ? '–' : task.status === 'running' ? '◐' : '○'}</span><div><strong>{preReviewTaskLabels[id]}</strong><small>{task.detail}</small></div><em>{preReviewStatusLabels[task.status]}</em></li>)}</ol><p>다른 검토 화면으로 이동해도 분석은 계속됩니다.</p></section>}
    {hasResults && preReview.phase !== 'running' && <>
      <section className="overview-analysis-status"><span>AI 생성 · 미확인</span><p>{preReview.completedAt ? `${new Date(preReview.completedAt).toLocaleString('ko-KR')} 분석` : '저장된 분석'} · {lifecycle.label}</p></section>
      <section className="pre-review-task-board" aria-label="AI 분석 항목 상태"><header><div><span>분석 상태</span><h2>{reviewComplete ? '필수 분석 완료' : '일부 항목 확인 필요'}</h2></div><small>실패한 항목만 따로 다시 실행할 수 있습니다.</small></header><ol>{taskRows.map(([id, task]) => <li className={`task-${task.status}`} key={id}><span>{preReviewStatusLabels[task.status]}</span><div><strong>{preReviewTaskLabels[id]}</strong><small>{task.error || task.detail}</small></div>{['technology', 'notices', 'amendments'].includes(id) && (task.status === 'failed' || task.status === 'pending') ? <button type="button" onClick={() => onRunStep(id)}>{task.status === 'failed' ? '다시 시도' : '실행'}</button> : null}</li>)}</ol></section>
      {opinionUnavailable && <p className="compact-opinion-alert">ⓘ 의견서 원문은 제공되지 않아 출원인 주장은 분석에서 제외했습니다.</p>}
      <section className="overview-summary-cards">
        <article className="overview-summary-card invention"><header><span>발명 요약</span><small>AI 생성 · 미확인</small></header><h2>{summary?.summary?.oneLine || '발명 요약이 아직 생성되지 않았습니다.'}</h2><p><strong>해결하고자 하는 과제</strong>{summary?.summary?.technicalProblem ? firstSentence(summary.summary.technicalProblem) : '전문 분석 후 표시됩니다.'}</p><button type="button" onClick={() => onView('technology')}>발명·청구항 보기</button></article>
        <article className="overview-summary-card response"><header><span>통지·보정 요약</span><small>{rounds.length}개 심사 회차</small></header><h2>{groundRows.length ? `거절이유 ${groundRows.length}건` : rounds.length ? '거절이유 분석 전' : '통지 이력 없음'}</h2><dl className="overview-counts"><Data label="해소" value={`${resolvedCount}건`}/><Data label="잔존·검토" value={`${reviewCount}건`}/><Data label="근거 부족" value={`${insufficientCount}건`}/></dl><button type="button" onClick={() => onView('response-analysis')}>통지·보정 보기</button></article>
        <article className={`overview-summary-card search decision-${recommendation?.status ?? 'optional'}`}><header><span>추가 검색 판단</span><small>자동 실행 안 함</small></header><h2>{recommendation ? searchRecommendationLabel(recommendation.status) : mode === 'response' ? '판단 전' : '심사관 선택'}</h2><p>{recommendation?.reason || (mode === 'response' ? '통지·보정 분석 후 추가 검색 필요성을 표시합니다.' : '필요한 경우 검색 방향을 구성할 수 있습니다.')}</p>{recommendation?.targetFeatures.length ? <ul>{recommendation.targetFeatures.slice(0, 3).map((item) => <li key={item}>{item}</li>)}</ul> : null}<button type="button" onClick={() => onView('strategy')}>검색·후보 보기</button></article>
      </section>
    </>}
  </>;
}
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
  for (const document of documents) {
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

function ResponseAnalysisView({ rounds, currentClaims, claimChanges, claimChangeSummary, claimChangesBusy, claimChangesError, noticeAnalyses, amendmentResolutions, onNotice, onResource }: {
  rounds: ExaminationRound<NoticeItem>[];
  currentClaims: Claim[];
  claimChanges: ClaimChangePayload | null;
  claimChangeSummary: ClaimChangeSummary | null;
  claimChangesBusy: boolean;
  claimChangesError: string;
  noticeAnalyses: Record<string, NoticeAnalysis>;
  amendmentResolutions: Record<string, AmendmentResolutionPayload>;
  onNotice: (notice: NoticeItem) => void;
  onResource: (tab: ResourceTab) => void;
}) {
  const [selectedRoundNumber, setSelectedRoundNumber] = useState<number | null>(null);
  const selectedRound = rounds.find((round) => round.number === selectedRoundNumber) ?? rounds.at(-1) ?? null;
  const key = digits(selectedRound?.notice.documentNumber ?? '');
  const noticeAnalysis = noticeAnalyses[key] ?? null;
  const selectedChangeDocuments = selectedRound?.amendments.flatMap((item) => {
    const document = claimChangeDocument(claimChanges, item.documentNumber);
    return document ? [document] : [];
  }) ?? [];
  const resolution = amendmentResolutions[key]?.summary ?? localAmendmentResolution(noticeAnalysis?.summary ?? null, selectedChangeDocuments);
  const statusLabel = ({ resolved: '해소', partially_resolved: '일부 해소', not_resolved: '잔존', needs_review: '검토 필요', insufficient: '근거 부족' } satisfies Record<AmendmentResolutionStatus, string>);
  const issueRows = resolution?.legalGroundResults ?? noticeAnalysis?.summary.rejectionGrounds.map((ground) => ({
    provision: ground.provision,
    originalClaimNumbers: ground.claimNumbers,
    deletedClaimNumbers: [],
    amendedClaimNumbers: [],
    remainingClaimNumbers: ground.claimNumbers,
    assessment: 'needs_review' as AmendmentResolutionStatus,
    summary: ground.reason || `${claimNumbersLabel(ground.claimNumbers)}에 대한 거절이유입니다.`,
  })) ?? [];
  return <>
    <PageHeading step="03" title="통지·보정" description="선택한 심사 회차의 거절이유와 보정 결과를 쟁점별로 확인합니다."/>
    {rounds.length > 0 && <label className="mobile-round-select"><span>심사 회차</span><select value={selectedRound?.number ?? ''} onChange={(event) => setSelectedRoundNumber(Number(event.target.value))}>{rounds.map((round) => <option key={round.notice.documentNumber} value={round.number}>{round.number}차 통지 · {formatDate(round.notice.date)}</option>)}</select></label>}
    <div className="round-tabs">{rounds.map((round) => <button className={selectedRound?.number === round.number ? 'active' : ''} type="button" key={round.notice.documentNumber} onClick={() => setSelectedRoundNumber(round.number)}>{round.number}차 통지 · {formatDate(round.notice.date)}</button>)}</div>
    {!selectedRound && <EmptyState title="확인된 통지서가 없습니다." text="통지 이력이 없는 사건은 발명·청구항 화면에서 최초심사 자료를 확인할 수 있습니다." action="전체 이력 확인" onAction={() => onResource('history')}/>}
    {selectedRound && <>
      <section className="round-result-summary"><div><span>{selectedRound.number}차 심사 회차</span><h2>{resolution?.headline || '통지·보정 결과 확인 필요'}</h2></div><dl><Data label="해소" value={`${issueRows.filter((item) => item.assessment === 'resolved').length}건`}/><Data label="잔존·검토" value={`${issueRows.filter((item) => item.assessment !== 'resolved').length}건`}/></dl></section>
      <section className="document-summary-strip">
        <button type="button" onClick={() => onNotice(selectedRound.notice)}><strong>의견제출통지서</strong><small>{formatDate(selectedRound.notice.date)} · 원문 보기</small></button>
        <div><strong>의견서</strong><small>{selectedRound.opinions.length ? `${selectedRound.opinions.map((item) => formatDate(item.date)).join(' · ')} · 원문 미확보` : '원문 미확보'}</small></div>
        {selectedRound.amendments.length ? selectedRound.amendments.map((item) => <div key={item.documentNumber}><strong>보정서</strong><small>{formatDate(item.date)} · {claimChangeDocument(claimChanges, item.documentNumber) ? '청구항 변동 연결' : '변동 확인 필요'}</small></div>) : <div><strong>보정서</strong><small>접수 문서 없음</small></div>}
      </section>
      <p className="compact-opinion-alert">ⓘ 의견서 원문은 제공되지 않아 출원인 주장은 분석에서 제외했습니다.</p>
      {!noticeAnalysis && <section className="review-empty-block"><h2>이 회차의 AI 분석이 없습니다.</h2><p>사건 개요에서 AI 사전검토를 시작하면 통지서와 보정 내용을 함께 분석합니다.</p></section>}
      {issueRows.length > 0 && <section className="response-issue-list"><header><h2>거절이유별 검토</h2></header>{issueRows.map((ground, index) => {
        const noticeGround = noticeAnalysis?.summary.rejectionGrounds.find((item) => conciseProvision(item.provision) === conciseProvision(ground.provision));
        return <article className={`review-issue-card status-${ground.assessment}`} key={`${ground.provision}-${index}`}><header><div><span>{statusLabel[ground.assessment]}</span><strong>{conciseProvision(ground.provision)} · {claimNumbersLabel(ground.originalClaimNumbers)}</strong></div></header><section><small>결과</small><p>{ground.summary}</p></section><div className="review-evidence-links"><span>근거</span><button type="button" onClick={() => onNotice(selectedRound.notice)}>통지서 {formatDate(selectedRound.notice.date)}</button>{selectedRound.amendments.map((item) => <button type="button" key={item.documentNumber} onClick={() => document.getElementById(`amendment-document-${digits(item.documentNumber)}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>보정서 {formatDate(item.date)}</button>)}</div><details><summary>상세 설명</summary><p><strong>통지 사유</strong> {noticeGround?.reason || '통지서의 거절 대상과 보정 후 청구항 변동을 대조한 결과입니다.'}</p>{ground.deletedClaimNumbers.length > 0 && <p><strong>삭제 청구항</strong> {claimNumbersLabel(ground.deletedClaimNumbers)}</p>}{ground.amendedClaimNumbers.length > 0 && <p><strong>보정 청구항</strong> {claimNumbersLabel(ground.amendedClaimNumbers)}</p>}{ground.remainingClaimNumbers.length > 0 && <p><strong>잔존 청구항</strong> {claimNumbersLabel(ground.remainingClaimNumbers)}</p>}</details></article>;
      })}</section>}
      {noticeAnalysis?.summary.allowableClaims.length ? <section className="allowable-claims-result"><span>등록가능항</span><strong>{claimNumbersLabel(noticeAnalysis.summary.allowableClaims)}</strong></section> : null}
      <section className="claim-change-review compact-change-review"><header><div><small>보정 전후</small><h2>관련 청구항 변동</h2></div></header>{claimChangesBusy && <p>청구항 변동이력을 불러오는 중입니다.</p>}{claimChangesError && <div className="inline-warning">△ {claimChangesError}</div>}{!claimChangesBusy && !claimChangesError && !selectedChangeDocuments.length && <p>이 회차와 연결된 청구항 변동이 없습니다.</p>}{selectedChangeDocuments.map((document) => {
        const documentSummary = claimChangeSummary?.documentSummaries.find((item) => digits(item.documentNumber) === digits(document.documentNumber));
        return <article className="compact-change-document" id={`amendment-document-${digits(document.documentNumber)}`} key={document.documentNumber}><header><div><strong>보정서</strong><small>{selectedRound.amendments.find((item) => digits(item.documentNumber) === digits(document.documentNumber)) ? formatDate(selectedRound.amendments.find((item) => digits(item.documentNumber) === digits(document.documentNumber))?.date ?? '') : document.documentNumber}</small></div><span>{claimChangeStats(document)}</span></header>{documentSummary && claimChangeSummary && <section className={`compact-change-result scope-${claimChangeSummary.scopeAssessment}`}><span>{scopeAssessmentLabel(claimChangeSummary.scopeAssessment)}</span><strong>{documentSummary.summary}</strong><small>{claimNumbersLabel(documentSummary.changedClaims)}</small></section>}<AmendmentClaimTreeComparison currentClaims={currentClaims} document={document}/><div>{document.changes.map((change) => <details key={`${document.documentNumber}-${change.claimNumber}`}><summary><strong>청구항 {change.claimNumber}</strong><span>{change.changeTypeName || change.changeTypeCode}</span></summary><div className="claim-change-markup"><ClaimChangeMarkup segments={change.changeSegments}/></div><div className="claim-text-compare"><section><small>보정 전</small><p>{change.previousClaimText || '이전 문언 미수신'}</p></section><section><small>보정 후</small><p>{change.claimText || (change.changeTypeCode === 'D' ? '삭제됨' : '변경 후 문언 미수신')}</p></section></div></details>)}</div></article>;
      })}</section>
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

function amendmentClaimVersions(currentClaims: Claim[], document: ClaimChangeDocument) {
  const after = new Map(currentClaims.map((claim) => [claim.number, { ...claim }]));
  const before = new Map(after);
  for (const change of document.changes) {
    const deleted = change.changeTypeCode === 'D' || /삭제/u.test(change.changeTypeName);
    const inserted = change.changeTypeCode === 'I' || /신규|추가/u.test(change.changeTypeName);
    if (deleted) after.delete(change.claimNumber);
    else if (change.claimText.trim()) after.set(change.claimNumber, { number: change.claimNumber, text: change.claimText });
    if (inserted) before.delete(change.claimNumber);
    else if (change.previousClaimText?.trim()) before.set(change.claimNumber, { number: change.claimNumber, text: change.previousClaimText });
  }
  const ordered = (claims: Map<number, Claim>) => [...claims.values()].sort((left, right) => left.number - right.number);
  return { before: ordered(before), after: ordered(after) };
}

function ClaimVersionTree({ title, claims }: { title: string; claims: Claim[] }) {
  const analysis = analyzeClaims(claims);
  const errorCount = analysis.filter((claim) => claim.errors.length > 0).length;
  return <section className="claim-version-tree"><header><strong>{title}</strong><small>{analysis.length}개{errorCount ? ` · 오류 ${errorCount}` : ''}</small></header><ol>{analysis.map((claim) => {
    const totalDescendants = claimDescendantNumbers(analysis, claim.number).size;
    return <li className={`${claim.multipleDependent ? 'multiple' : ''}${claim.errors.length ? ' invalid' : ''}`} style={{ marginLeft: `${Math.min(claim.depth, 6) * 12}px` }} key={claim.number}><span>{claim.isIndependent ? '독립' : claim.multipleDependent ? '다중' : '종속'}</span><div><strong>청구항 {claim.number}</strong><small>{claim.isIndependent ? `직접 ${claim.children.length} · 전체 ${totalDescendants}` : `제${claim.directReferences.join('·')}항 인용 · ${claim.depth}단계`}</small>{claim.errors.length ? <em>{claim.errors.join(' ')}</em> : null}</div></li>;
  })}</ol></section>;
}

function AmendmentClaimTreeComparison({ currentClaims, document }: { currentClaims: Claim[]; document: ClaimChangeDocument }) {
  const versions = amendmentClaimVersions(currentClaims, document);
  if (!versions.before.length && !versions.after.length) return null;
  return <details className="claim-version-comparison" open><summary>보정 전후 청구항 관계</summary><p>변경 문언과 현재 청구항을 기준으로 복원한 구조입니다. 과거 회차는 후속 보정의 영향을 받을 수 있습니다.</p><div><ClaimVersionTree title="보정 전" claims={versions.before}/><ClaimVersionTree title="보정 후" claims={versions.after}/></div></details>;
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

function TechnologyView({ data, claimAnalysis, selectedClaim, features, summary, summaryBusy, summaryError, onSelectClaim, onOpenClaim, onEvidence, onOpenReview }: {
  data: PatentCase;
  claimAnalysis: ClaimAnalysis[];
  selectedClaim: number;
  features: ClaimFeature[];
  summary: SummaryPayload | null;
  summaryBusy: boolean;
  summaryError: string;
  onSelectClaim: (number: number) => void;
  onOpenClaim: (number: number) => void;
  onEvidence: (reference: ReviewItem['sourceRefs'][number]) => void;
  onOpenReview: () => void;
}) {
  const ai = summary?.summary;
  const selectedClaimRecord = data.claims.find((claim) => claim.number === selectedClaim);
  const allFeatureParts = featureParts(selectedClaimRecord);
  const featureType = (feature: ClaimFeature, index: number) => feature.role === '핵심 검색' ? '핵심 구성' : index > 2 ? '추가 한정' : '일반 구성';
  const ancestors = claimAncestorNumbers(claimAnalysis, selectedClaim);
  const descendants = claimDescendantNumbers(claimAnalysis, selectedClaim);
  const relatedClaims = new Set([selectedClaim, ...ancestors, ...descendants]);
  const claimErrorCount = claimAnalysis.filter((claim) => claim.errors.length > 0).length;
  return <>
    <PageHeading step="02" title="발명·청구항" description="해결하고자 하는 과제, 핵심 해결수단, 작동 흐름, 효과와 청구항 구조를 요약해 보여줍니다."/>
    {summaryError && <div className="inline-warning">△ {summaryError}</div>}
    <div className="technology-layout">
      <aside className="claim-tree"><div><h2>청구항 구조</h2><span>{claimAnalysis.length}개 · {data.claimStructureSource === 'fulltext' ? '전문 XML' : '서지 문언'}{claimErrorCount ? ` · 오류 ${claimErrorCount}` : ''}</span></div><p className="claim-tree-guide">청구항을 선택하면 선행·후속 계보를 함께 강조합니다.</p>{claimAnalysis.map((claim) => {
        const totalDescendants = claimDescendantNumbers(claimAnalysis, claim.number).size;
        const relation = selectedClaim === claim.number ? 'selected' : ancestors.has(claim.number) ? 'ancestor' : descendants.has(claim.number) ? 'descendant' : 'unrelated';
        const relationLabel = relation === 'selected' ? '선택 항' : relation === 'ancestor' ? '선행 계보' : relation === 'descendant' ? '후속 계보' : '';
        return <article className={`claim-tree-item relation-${relation}${selectedClaim === claim.number ? ' active' : ''}${claim.errors.length ? ' invalid' : ''}${relatedClaims.has(claim.number) ? ' related' : ''}`} style={{ paddingLeft: `${10 + Math.min(claim.depth, 6) * 13}px` }} key={claim.number}><button className="claim-tree-main" type="button" aria-pressed={selectedClaim === claim.number} onClick={() => onSelectClaim(claim.number)}><span className={`claim-kind ${claim.multipleDependent ? 'multiple' : claim.isIndependent ? 'independent' : 'dependent'}`}>{claim.isIndependent ? '독립' : claim.multipleDependent ? '다중' : '종속'}</span><div><strong>청구항 {claim.number}</strong><small>{claim.isIndependent ? `직접 종속 ${claim.children.length}개 · 전체 후속 ${totalDescendants}개` : `제${claim.directReferences.join('·')}항 직접 인용 · ${claim.depth}단계${totalDescendants ? ` · 후속 ${totalDescendants}개` : ''}`}</small>{relationLabel && <b className="claim-relation-label">{relationLabel}</b>}{claim.errors.length > 0 && <em>{claim.errors.join(' ')}</em>}</div></button><div className="claim-tree-actions"><button type="button" onClick={() => onOpenClaim(claim.number)}>원문 보기</button></div></article>;
      })}</aside>
      <section className="technology-center">
        {ai ? <TechnicalAiBrief summary={ai} reviewItems={summary?.reviewItems ?? []} claimAnalysis={claimAnalysis} onEvidence={onEvidence}/> : <section className="ai-analysis-state"><span>{summaryBusy ? 'AI 사전검토 중' : '분석 전'}</span><h2>{summaryBusy ? '명세서의 핵심 구성을 정리하고 있습니다.' : '아직 생성된 발명 분석이 없습니다.'}</h2><p>사건 개요에서 AI 사전검토를 시작하면 전문 내용을 바탕으로 발명과 청구항을 요약합니다.</p>{!summaryBusy && <button className="exam-secondary" type="button" onClick={onOpenReview}>사건 개요로 이동</button>}</section>}
        <section className="feature-selector"><div className="section-title"><div><small>청구항 자동 분리</small><h2>청구항 {selectedClaim} 구성</h2></div><button type="button" onClick={() => onOpenClaim(selectedClaim)}>원문 보기</button></div><p className="feature-draft-note">자동 분리한 {features.length}개 구성{allFeatureParts.length > features.length ? ` · 전체 ${allFeatureParts.length}개 중 일부 표시` : ''} · 원문 기준 확인 필요</p>{features.length ? features.map((feature, index) => <article key={feature.id} className="feature-row compact"><div><span>{feature.id}</span><div><strong>{feature.label}</strong><p>{feature.text}</p><small className={`feature-type feature-type-${featureType(feature, index).replace(/\s/g, '-')}`}>{featureType(feature, index)}</small></div></div></article>) : <EmptyState title="분석할 청구항이 없습니다." text="청구항 데이터가 수신되면 구성 분석을 시작할 수 있습니다." action="원문 확인" onAction={() => onOpenClaim(selectedClaim)}/>}</section>
      </section>
    </div>
  </>;
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
    <header className="technical-summary-hero"><span>AI 생성 · 미확인</span><small>발명의 핵심</small><p>{summary.oneLine}</p>{evidence('oneLine')}</header>
    <div className="technical-summary-grid">
      <article className="technical-summary-card"><h3>해결하고자 하는 과제</h3><p>{summary.technicalProblem}</p>{evidence('technicalProblem')}</article>
      <article className="technical-summary-card"><h3>핵심 해결수단</h3><p>{summary.solution}</p>{evidence('solution')}</article>
      <article className="technical-summary-card effects"><h3>주요 효과</h3>{summary.effects.length ? <ul>{summary.effects.slice(0, 3).map((item, index) => <li key={`${item}-${index}`}><p>{item}</p>{evidence(`effects.${index}`)}</li>)}</ul> : <p>명세서에서 명시적인 효과 근거를 찾지 못했습니다.</p>}{!summary.effects.length && <span className="evidence-missing">근거 부족</span>}</article>
    </div>
    <section className="operation-flow-panel"><header><h3>작동 흐름</h3><small>입력·판단·제어·출력 순서</small></header>{operationFlow.length ? <ol className="operation-flow">{operationFlow.slice(0, 5).map((step, index) => <li className="operation-flow-step" key={`${step}-${index}`}><span>{index + 1}</span><p>{step}</p>{evidence(`operationFlow.${index}`)}</li>)}</ol> : <div className="operation-flow-empty"><p>전문에서 연속된 작동 순서를 충분히 확인하지 못했습니다.</p><span className="evidence-missing">근거 부족</span></div>}</section>
    <div className="technical-bottom-grid">
      <section className="technical-core-elements"><h3>핵심 구성</h3><ol>{summary.keyElements.slice(0, 6).map((item, index) => <li key={`${item}-${index}`}><p>{item}</p>{evidence(`keyElements.${index}`)}</li>)}</ol></section>
      <section className="claim-scope-summary"><h3>청구항 구조 요약</h3><article><small>독립항의 핵심 조합</small><p>{independentClaimSummary}</p>{evidence('independentClaimSummary', independentClaims.slice(0, 3).map(claimEvidenceReference))}</article><div className="dependent-claim-groups"><small>종속항의 주요 추가 한정</small>{dependentClaimGroups.length ? dependentClaimGroups.slice(0, 5).map((group, index) => <article key={`${group.claimNumbers.join('-')}-${index}`}><strong>{claimNumbersLabel(group.claimNumbers)}</strong><p>{group.addition}</p>{evidence(`dependentClaimGroups.${index}`, group.claimNumbers.filter((number) => claimAnalysis.some((claim) => claim.number === number && !claim.isIndependent)).slice(0, 3).map(claimEvidenceReference))}</article>) : <p>종속항이 없거나 주요 추가 한정을 분류하지 못했습니다.</p>}</div></section>
    </div>
    <details className="technical-supporting-details"><summary>상세정보 보기</summary><div className="technical-detail-grid">{summary.examinationPoints.length > 0 && <section><h3>선행기술 대조 포인트</h3><ul>{summary.examinationPoints.slice(0, 5).map((item, index) => <li key={`${item}-${index}`}>{item}{evidence(`examinationPoints.${index}`)}</li>)}</ul></section>}{summary.cautions.length > 0 && <section className="detail-cautions"><h3>AI 유의사항</h3><ul>{summary.cautions.slice(0, 3).map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul></section>}{summary.claimOverview && summary.claimOverview !== independentClaimSummary && <section><h3>추가 청구항 설명</h3><p>{summary.claimOverview}</p>{evidence('claimOverview')}</section>}<section><h3>전체 근거 목록</h3>{allReferences.length ? <div className="technical-all-evidence">{allReferences.map((reference, index) => <button type="button" key={`${reference.sourceId}-${index}`} onClick={() => onEvidence?.(reference)}><span>{reference.locator}</span><small>{reference.excerpt}</small></button>)}</div> : <p className="evidence-missing">연결된 원문 근거가 없습니다.</p>}</section></div></details>
  </section>;
}
function StrategyView({ data, mode, features, approvedKeywords, suggestedKeywords, selectedDraftKeywords, claimChangeSummary, candidates, searchRan, onToggleKeyword, onChangeRole, onCopy, onRunDemo, onOpenResource }: {
  data: PatentCase;
  mode: WorkMode;
  features: ClaimFeature[];
  approvedKeywords: string[];
  suggestedKeywords: string[];
  selectedDraftKeywords: string[];
  claimChangeSummary: ClaimChangeSummary | null;
  candidates: Candidate[];
  searchRan: boolean;
  onToggleKeyword: (keyword: string) => void;
  onChangeRole: (id: string, role: SearchRole) => void;
  onCopy: () => void;
  onRunDemo: () => void;
  onOpenResource: () => void;
}) {
  const activeKeywords = [...new Set([...approvedKeywords, ...selectedDraftKeywords])];
  const groups = buildKeywordGroups(data, features, activeKeywords);
  const expression = buildSearchExpression(data, features, activeKeywords);
  const recommendation = claimChangeSummary?.searchRecommendation;
  return <>
    <PageHeading step="04" title="검색·후보" description="추가 검색이 필요할 때만 검색 방향을 조정하고 후보문헌을 검토합니다."/>
    {mode === 'response' && <section className={`review-search-decision compact decision-${recommendation?.status ?? 'optional'}`}><div><span>추가 검색 판단</span><h2>{searchRecommendationLabel(recommendation?.status)}</h2><p>{recommendation?.reason || '필요한 경우에만 검색식을 사용하세요.'}</p>{recommendation?.targetFeatures.length ? <ul>{recommendation.targetFeatures.slice(0, 5).map((item) => <li key={item}>{item}</li>)}</ul> : null}</div><small>이 화면을 열어도 검색은 자동으로 실행되지 않습니다.</small></section>}
    <section className="search-workspace-card"><header><div><span>검색 방향</span><h2>구성 및 용어 선택</h2></div><strong>{activeKeywords.length}개 AI 용어 반영</strong></header><div className="search-feature-roles">{features.map((feature) => <label key={feature.id}><span><b>{feature.id}</b>{feature.label}</span><select value={feature.role} onChange={(event) => onChangeRole(feature.id, event.target.value as SearchRole)}>{(['핵심 검색', '조합 검색', '일반 구성', '검색 제외', '확인 필요'] as SearchRole[]).map((role) => <option key={role}>{role}</option>)}</select></label>)}</div>{suggestedKeywords.length > 0 && <div className="strategy-keyword-picks">{suggestedKeywords.map((keyword) => { const approved = approvedKeywords.includes(keyword); const selected = approved || selectedDraftKeywords.includes(keyword); return <button type="button" key={keyword} className={selected ? 'selected' : ''} aria-pressed={selected} disabled={approved} onClick={() => onToggleKeyword(keyword)}><span>{approved ? '확정' : selected ? '포함' : '제안'}</span>{keyword}</button>; })}</div>}</section>
    <section className="search-query-simple"><header><div><span>검색 기준일 {data.applicationDate}</span><h2>검색식</h2></div><button type="button" onClick={onCopy}>검색식 복사</button></header><div className="concept-groups">{groups.map((group, index) => <div key={group.name}><header><span>개념군 {String.fromCharCode(65 + index)}</span><strong>{group.name}</strong></header><div>{group.terms.map((term, termIndex) => <span key={`${term}-${termIndex}`}><b>{/[a-z]/i.test(term) ? 'EN' : 'KR'}</b>{term}</span>)}</div></div>)}</div><pre className="search-expression">{expression}</pre><p>실검색 API는 연결되지 않았습니다. 검색식을 복사해 외부 검색에서 사용할 수 있습니다.</p>{data.isDemo && <button className="exam-secondary" type="button" onClick={onRunDemo}>{searchRan ? '데모 결과 새로 보기' : '데모 후보 보기'}</button>}</section>
    <section className="candidate-simple-list"><header><div><span>후보문헌</span><h2>{candidates.length ? `${candidates.length}건` : '아직 추가된 문헌이 없습니다.'}</h2></div>{candidates.length > 0 && <button type="button" onClick={onOpenResource}>사건 문서 보기</button>}</header>{candidates.map((candidate) => <article key={candidate.id}><div className="candidate-result"><span>{candidate.role}</span><h3>{candidate.matches.length ? `${candidate.matches.join(', ')} 구성과 ${candidate.wording === '직접' ? '직접 대응' : candidate.wording === '유사' ? '유사 대응' : '대응 여부 확인 필요'}` : '대응 구성이 아직 확인되지 않았습니다.'}</h3><p>관련도 {candidate.relevance} · 기준일 {candidate.eligible ? '적격' : '이후 공개'}</p></div><div className="candidate-biblio"><strong>{candidate.country} {candidate.number}</strong><h3>{candidate.title}</h3><dl><Data label="대응 구성" value={candidate.matches.join(', ') || '미확인'}/><Data label="출원일" value={candidate.applicationDate}/><Data label="검토 상태" value="미검토"/></dl></div></article>)}</section>
  </>;
}
function ResourcePanel({ data, tab, selectedClaim, isMobile, onTab, onClose, onFullText, onNotice, onDrawing }: { data: PatentCase; tab: ResourceTab; selectedClaim: number; isMobile: boolean; onTab: (tab: ResourceTab) => void; onClose: () => void; onFullText: () => void; onNotice: (notice: NoticeItem) => void; onDrawing: () => void }) {
  const tabs: Array<[ResourceTab, string]> = [['biblio', '서지'], ['claims', '원문'], ['drawing', '도면'], ['history', '이력'], ['family', '패밀리'], ['documents', '문서']];
  const orderedHistory = [...data.history].sort((left, right) => digits(left.date).localeCompare(digits(right.date)) || left.documentNumber.localeCompare(right.documentNumber));
  const orderedNotices = [...data.notices].sort((left, right) => digits(left.date).localeCompare(digits(right.date)) || left.documentNumber.localeCompare(right.documentNumber));
  const panelRef = useModalBehavior<HTMLElement>(onClose, { lockScroll: isMobile });
  return <aside ref={panelRef} className="resource-panel" role={isMobile ? 'dialog' : 'complementary'} aria-modal={isMobile ? true : undefined} aria-label="사건자료" tabIndex={-1}><header><div><small>원문·이력·문서</small><h2>사건자료</h2></div><button type="button" onClick={onClose}>닫기 ×</button></header><nav>{tabs.map(([id, label]) => <button className={tab === id ? 'active' : ''} type="button" key={id} onClick={() => onTab(id)}>{label}</button>)}</nav><div className="resource-body">{tab === 'biblio' && <dl className="resource-dl"><Data label="출원번호" value={data.applicationNumber}/><Data label="출원일" value={data.applicationDate}/><Data label="공개번호" value={data.publicationNumber || '—'}/><Data label="출원인" value={data.applicant}/><Data label="심사청구일" value={data.examinationRequestDate}/><Data label="심사관" value={data.examinerName}/><Data label="주 CPC" value={data.cpc[0]?.number || '—'} link={data.cpc[0] ? cpcUrl(data.cpc[0].number) : undefined}/></dl>}{tab === 'claims' && <div className="resource-claims"><span>청구항 {selectedClaim}</span>{data.claims.map((claim) => <article className={claim.number === selectedClaim ? 'active' : ''} key={claim.number}><strong>청구항 {claim.number}</strong><p>{claim.text}</p></article>)}<button className="exam-secondary" type="button" onClick={onFullText}>전체 명세서·청구항 보기</button></div>}{tab === 'drawing' && <div className="resource-drawing">{data.drawing ? <button type="button" onClick={onDrawing}><img src={data.drawing.thumbnailUrl} alt={`${data.title} 대표도면`}/><span>대표도면 크게 보기</span></button> : <EmptyState title="대표도면이 없습니다." text="대표도면 API 응답이 없거나 아직 조회되지 않았습니다." action="확인"/>}</div>}{tab === 'history' && <div className="resource-history">{orderedHistory.map((item) => <article key={`${item.documentNumber}-${item.date}`}><time>{formatDate(item.date)}</time><strong>{item.title}</strong><small>{item.status}</small></article>)}</div>}{tab === 'family' && <div className="resource-family">{data.family.length ? data.family.map((item, index) => <article key={`${item.familyNumber}-${index}`}><span>{item.countryCode || '—'}</span><strong>{item.publicationNumber || item.literatureNumber || item.applicationNumber}</strong><small>{item.familyKind || item.literatureKind}</small></article>) : <EmptyState title="패밀리 없음" text="KIPRIS Plus API에서 조회된 패밀리 문헌이 없습니다." action="확인 완료"/>}</div>}{tab === 'documents' && <div className="resource-documents"><button type="button" onClick={onFullText}><span>XML</span><strong>전체 명세서·청구항</strong><small>{data.fullText?.fileName || '전문파일정보에서 조회'}</small></button>{orderedNotices.map((notice) => <button type="button" key={notice.documentNumber} onClick={() => onNotice(notice)}><span>PDF</span><strong>의견제출통지서</strong><small>{formatDate(notice.date)} · PDF_V2</small></button>)}</div>}</div></aside>;
}
function Data({ label, value, link }: { label: string; value: string; link?: string }) { return <div><dt>{label}</dt><dd>{link ? <a href={link} target="_blank" rel="noreferrer">{value} ↗</a> : value || '—'}</dd></div>; }
function EmptyState({ title, text, action, onAction, disabled = false }: { title: string; text: string; action: string; onAction?: () => void; disabled?: boolean }) { return <div className="exam-empty"><span>○</span><h2>{title}</h2><p>{text}</p><button className={disabled ? 'is-coming' : ''} type="button" onClick={onAction} disabled={disabled}>{action}</button></div>; }
function LoadingOverlay({ message }: { message: string }) { return <div className="exam-loading" role="status" aria-live="polite"><section><span>사건자료 조회</span><div className="loading-spinner" aria-hidden="true"/><h2>{message}</h2><p>완료된 데이터가 도착하면 화면을 갱신합니다. AI 분석은 자동으로 실행하지 않습니다.</p></section></div>; }
function DrawingDialog({ data, onClose }: { data: PatentCase; onClose: () => void }) { const dialogRef = useModalBehavior<HTMLElement>(onClose); return <div className="exam-dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section ref={dialogRef} className="exam-dialog drawing" role="dialog" aria-modal="true" aria-label="대표도면" tabIndex={-1}><header><div><small>대표도면</small><h2>{data.title} · 대표도면</h2></div><button type="button" onClick={onClose}>닫기 ×</button></header><div>{data.drawing ? <img src={data.drawing.largeUrl} alt={`${data.title} 대표도면 확대`}/> : <p>대표도면이 없습니다.</p>}</div></section></div>; }
function buildKeywordGroups(data: PatentCase, features: ClaimFeature[], aiKeywords: string[]) { const titleTerms = [data.title, data.titleEnglish].filter(Boolean); const fallbackTerms = titleTerms.length ? titleTerms : [data.applicationNumber]; const featureTerms = features.filter((feature) => feature.role !== '검색 제외').slice(0, 3).map((feature) => feature.label.replace('…', '')).filter(Boolean); const ai = aiKeywords.slice(0, 6).filter(Boolean); return [{ name: '적용 대상', terms: fallbackTerms }, { name: '핵심 구성', terms: featureTerms.length ? featureTerms : fallbackTerms.slice(0, 1) }, ...(ai.length ? [{ name: '선택한 AI 용어', terms: ai }] : [])]; }
function buildSearchExpression(data: PatentCase, features: ClaimFeature[], aiKeywords: string[]) { const groups = buildKeywordGroups(data, features, aiKeywords); return groups.map((group, index) => `(G${index + 1}=(${group.terms.join(' OR ')}))`).join('\nAND\n') + (data.cpc[0] ? `\nAND\n(CPC=${data.cpc[0].number.replace(/\s+/g, '')})` : ''); }
