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
type StepKind = 'optional' | 'future';
type ResourceTab = 'biblio' | 'claims' | 'drawing' | 'history' | 'family' | 'documents';
type SearchRole = '핵심 검색' | '조합 검색' | '일반 구성' | '검색 제외' | '확인 필요';
type Claim = { number: number; text: string };
type CodeItem = { number: string; date?: string };
type FamilyItem = { applicationNumber: string; countryCode: string; countryName: string; familyKind: string; familyNumber: string; literatureKind: string; literatureNumber: string; publicationNumber: string };
type HistoryItem = { documentNumber: string; date: string; title: string; titleEnglish?: string; status: string; step?: string };
type NoticeItem = HistoryItem & { pdf?: { sendNumber: string; fileName: string; fileUrl: string } | null; pdfError?: string | null };
type SourceStatus = { name: string; ok: boolean; message: string };
type ApiUsage = { total: number; startedAt: string; lastCalledAt: string | null; byOperation: Record<string, number> };
type ExaminationSummary = { oneLine: string; technicalProblem: string; solution: string; keyElements: string[]; effects: string[]; claimOverview: string; examinationPoints: string[]; searchKeywords: string[]; cautions: string[] };
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
type PatentCase = {
  applicationNumber: string; applicationNumberRaw: string; title: string; titleEnglish: string; status: string; updatedAt: string;
  applicant: string; applicantCountry: string; applicationDate: string; publicationNumber: string; publicationDate: string;
  registrationNumber: string; registrationDate: string; registrationStatus: string; examinationRequestDate: string; examinerName: string;
  claimCount: number; inventorCount: number; abstract: string; ipc: CodeItem[]; cpc: CodeItem[]; claims: Claim[]; family: FamilyItem[];
  history: HistoryItem[]; notices: NoticeItem[]; drawing: { fileName: string; thumbnailUrl: string; largeUrl: string } | null;
  fullText: { fileName: string; fileUrl: string } | null; sources: SourceStatus[]; isDemo: boolean; cached: boolean;
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
  sources: [{ name: 'bibliography', ok: true, message: '서지·행정처리 반영' }, { name: 'cpc', ok: true, message: 'CPC정보 반영' }, { name: 'drawing', ok: true, message: '대표도면 확인' }, { name: 'family', ok: true, message: '패밀리 없음' }], isDemo: true, cached: false,
};
const demoCandidates: Candidate[] = [
  { id: 'd1', country: 'KR', number: '10-2018-0012345', title: '드럼 내부 상태를 측정하는 이동식 센서 장치', applicationDate: '2016.03.12.', publicationDate: '2018.02.01.', applicant: 'ABC Electronics', relevance: '높음', wording: '직접', eligible: true, matches: ['1D', '1E'], role: 'D1 후보' },
  { id: 'd2', country: 'JP', number: '2017-123456', title: '세탁 장치용 분리식 센서 홀더', applicationDate: '2016.01.19.', publicationDate: '2017.08.03.', applicant: 'Example Industries', relevance: '보통', wording: '유사', eligible: true, matches: ['1E', '2A'], role: 'D2 후보' },
  { id: 'd3', country: 'US', number: '2019/0001234', title: 'Wireless sensing module for laundry appliances', applicationDate: '2018.07.02.', publicationDate: '2021.04.12.', applicant: 'Sample Appliance Corp.', relevance: '보통', wording: '미확인', eligible: false, matches: ['1D'], role: '보류' },
];
const initialSteps = [
  ['overview', '사건 개요'], ['technology', '기술내용 파악'], ['strategy', '검색전략'], ['search', '선행기술 검색'], ['candidates', '후보문헌'], ['evidence', '증거리뷰', 'future'], ['notice-draft', '통지서 작성', 'future'],
] as const satisfies ReadonlyArray<readonly [WorkView, string, StepKind?]>;
const responseSteps = [
  ['overview', '사건 개요'], ['response-analysis', '통지·대응 분석'], ['technology', '기술내용 파악'], ['response-review', '검토 정리'], ['strategy', '추가 검색전략', 'optional'], ['search', '선행기술 검색', 'optional'], ['candidates', '후보문헌', 'optional'], ['evidence', '증거리뷰', 'future'], ['notice-draft', '통지서 작성', 'future'],
] as const satisfies ReadonlyArray<readonly [WorkView, string, StepKind?]>;

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
function cpcUrl(code: string) { return `https://cls.kipro.or.kr/classification/cpc/search?code=${code.replace(/\s+/g, '')}`; }
function sourceLabel(name: string) { return ({ bibliography: '서지·이력', cpc: 'CPC', drawing: '대표도면', family: '패밀리', fullText: '전문 명세서' } as Record<string, string>)[name] ?? name; }
function mapLiveCase(payload: LivePayload): PatentCase {
  const b = payload.bibliography; const applicant = b?.applicants?.[0];
  return { applicationNumber: formatApplicationNumber(b?.applicationNumber || payload.applicationNumber), applicationNumberRaw: payload.applicationNumber, title: b?.title || '발명의 명칭 미수신', titleEnglish: b?.titleEnglish || '', status: b?.finalDisposal || b?.registrationStatus || '심사 진행', updatedAt: new Date(payload.fetchedAt).toLocaleString('ko-KR'), applicant: applicant?.name || '출원인 미수신', applicantCountry: applicant?.country || '', applicationDate: formatDate(b?.applicationDate || ''), publicationNumber: b?.publicationNumber || '', publicationDate: formatDate(b?.publicationDate || ''), registrationNumber: b?.registrationNumber || '', registrationDate: formatDate(b?.registrationDate || ''), registrationStatus: b?.registrationStatus || '', examinationRequestDate: formatDate(b?.examinationRequestDate || ''), examinerName: b?.examinerName || '—', claimCount: b?.claimCount || b?.claims.length || 0, inventorCount: b?.inventors.length || 0, abstract: b?.abstract || '초록 데이터가 없습니다.', ipc: b?.ipc || [], cpc: payload.cpc || [], claims: b?.claims || [], family: payload.family || [], history: payload.history || [], notices: payload.notices || [], drawing: payload.drawing, fullText: payload.fullText, sources: payload.sources || [], isDemo: false, cached: Boolean(payload.cached) };
}
const WORKSPACE_STORAGE_KEY = 'patent-exam-workspace:last-case-v1';
const AI_SUMMARY_VERSION = 'concise-technical-summary-2026-08-29-v2';
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
  const [searchRan, setSearchRan] = useState(false); const [candidates, setCandidates] = useState<Candidate[]>([]); const [selectedCandidate, setSelectedCandidate] = useState<string | null>(null); const [selectedNotice, setSelectedNotice] = useState<NoticeItem | null>(null); const [drawingOpen, setDrawingOpen] = useState(false); const [packageBusy, setPackageBusy] = useState(false); const [restoring, setRestoring] = useState(true);
  const [claimChanges, setClaimChanges] = useState<ClaimChangePayload | null>(null); const [claimChangesBusy, setClaimChangesBusy] = useState(false); const [claimChangesError, setClaimChangesError] = useState('');
  const [claimChangeSummary, setClaimChangeSummary] = useState<ClaimChangeSummaryPayload | null>(null); const [claimChangeSummaryBusy, setClaimChangeSummaryBusy] = useState(false); const [claimChangeSummaryError, setClaimChangeSummaryError] = useState('');
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
      if (payload.summary) { setSummary(payload); writeStoredSummary(applicationNumber, payload); }
      else setSummary(null);
    } catch (error) { setSummaryError(error instanceof Error ? error.message : '저장된 AI 분석을 확인하지 못했습니다.'); }
  }, []);
  const generateSummary = useCallback(async (applicationNumber: string, force = false) => {
    setSummaryBusy(true); setSummaryError('');
    try {
      const fullTextResponse = await fetch(`/api/patent/fulltext?${new URLSearchParams({ applicationNumber })}`, { cache: 'no-store' });
      const fullText = (await fullTextResponse.json()) as FullTextPayload;
      if (!fullTextResponse.ok) throw new Error(fullText.error || 'AI 분석에 필요한 전문 명세서를 불러오지 못했습니다.');
      if (fullText.usage) setUsage(fullText.usage);

      const parameters = new URLSearchParams({ applicationNumber });
      if (force) parameters.set('force', 'true');
      const response = await fetch(`/api/patent/summary?${parameters}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fullText }),
      });
      const payload = (await response.json()) as SummaryPayload & { error?: string };
      if (!response.ok) throw new Error(payload.error || 'AI 분석을 불러오지 못했습니다.');
      setSummary(payload); setStrategyDraftKeywords([]); writeStoredSummary(applicationNumber, payload);
    } catch (error) { setSummaryError(error instanceof Error ? error.message : 'AI 분석을 불러오지 못했습니다.'); }
    finally { setSummaryBusy(false); }
  }, []);
  const loadClaimChanges = useCallback(async (applicationNumber: string, force = false) => {
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
    } catch (error) {
      setClaimChangesError(error instanceof Error ? error.message : '청구항 변동이력을 불러오지 못했습니다.');
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
  const steps = mode === 'response' ? responseSteps : initialSteps; const activeIndex = Math.max(0, steps.findIndex((step) => step[0] === view)); const availableSteps = steps.filter((step) => step[2] !== 'future'); const activeAvailableIndex = Math.max(0, availableSteps.findIndex((step) => step[0] === view)); const currentClaim = data.claims.find((claim) => claim.number === selectedClaim) || data.claims[0]; const amendment = examinationRounds.flatMap((round) => round.amendments).at(-1);
  const targetLabel = mode === 'response' && amendment ? `${formatDate(amendment.date)} 보정 청구항 1~${data.claimCount}` : `현재 출원 청구항 1~${data.claimCount}`;
  const sourceOk = data.sources.filter((source) => source.ok).length; const failedSources = data.sources.filter((source) => !source.ok); const familyCountries = new Set(data.family.map((item) => item.countryCode).filter(Boolean)).size; const independentClaims = claimAnalysis.filter((claim) => claim.isIndependent);
  const approvedReviewItems = (summary?.reviewItems ?? []).filter((item) => isApprovedReviewStatus(item.reviewStatus));
  const approvedKeywords = approvedReviewItems.filter((item) => item.entityId.startsWith('searchKeywords.')).map((item) => item.text);
  const visibleClaimChanges = claimChanges?.applicationNumber === data.applicationNumberRaw ? claimChanges : null;
  const linkedClaimChangeDocuments = visibleClaimChanges?.documents.filter((document) => examinationRounds.some((round) => round.amendments.some((item) => digits(item.documentNumber) === digits(document.documentNumber)))) ?? [];
  const claimChangeDocumentNumbers = linkedClaimChangeDocuments.map((document) => digits(document.documentNumber));
  const claimChangeSignature = `${data.applicationNumberRaw}:${[...claimChangeDocumentNumbers].sort().join(',')}`;
  const aiStrategySuggestions = [...new Set([...(summary?.summary?.searchKeywords ?? []), ...(claimChangeSummary?.summary?.searchRecommendation.targetFeatures ?? [])].map((item) => item.trim()).filter(Boolean))];
  const strategyKeywords = [...new Set([...approvedKeywords, ...strategyDraftKeywords])];
  const searchExpression = buildSearchExpression(data, features, strategyKeywords);
  const nextStep = steps[activeIndex + 1]; const nextStepUnavailable = nextStep?.[2] === 'future'; const nextStepOptional = nextStep?.[2] === 'optional';
  const hasAmendmentDocuments = examinationRounds.some((round) => round.amendments.length > 0);
  useEffect(() => {
    let cancelled = false;
    const requested = digits(new URLSearchParams(window.location.search).get('applicationNumber') || '');
    const stored = readStoredWorkspace();
    if (stored && (!requested || requested === stored.data.applicationNumberRaw)) {
      window.queueMicrotask(() => {
        if (cancelled) return;
        const restoredSummary = stored.summary?.version === AI_SUMMARY_VERSION ? stored.summary : null;
        setData(stored.data); setQuery(stored.data.applicationNumber); setMode(stored.mode ?? 'initial'); setView('overview'); setSelectedClaim(stored.data.claims[0]?.number || 1); setFeatures(featureRows(stored.data.claims[0])); setSummary(restoredSummary); setRestoring(false);
        if (!stored.data.isDemo && !restoredSummary?.summary) void loadCachedSummary(stored.data.applicationNumberRaw);
      });
      return () => { cancelled = true; };
    }
    if (!/^(10|20)\d{11}$/.test(requested)) { window.queueMicrotask(() => { if (!cancelled) setRestoring(false); }); return () => { cancelled = true; }; }
    void requestPatentCase(requested).then(({ data: restoredData, usage: restoredUsage }) => {
      if (cancelled) return;
      setData(restoredData); setQuery(restoredData.applicationNumber); setMode('initial'); setView('overview'); setSelectedClaim(restoredData.claims[0]?.number || 1); setFeatures(featureRows(restoredData.claims[0])); if (restoredUsage) setUsage(restoredUsage); writeStoredWorkspace(restoredData, null, 'initial'); syncCaseUrl(restoredData.applicationNumberRaw);
      if (!restoredData.isDemo) void loadCachedSummary(restoredData.applicationNumberRaw);
    }).catch((error) => { if (!cancelled) setToast(error instanceof Error ? error.message : '이전 사건을 불러오지 못했습니다.'); }).finally(() => { if (!cancelled) setRestoring(false); });
    return () => { cancelled = true; };
  }, [loadCachedSummary]);
  useEffect(() => { void fetchUsage().then(setUsage).catch(() => undefined); }, []);
  useEffect(() => {
    if (mode !== 'response' || !['response-analysis', 'technology', 'response-review'].includes(view) || data.isDemo || !hasAmendmentDocuments) return;
    if (claimChanges?.applicationNumber === data.applicationNumberRaw || claimChangesAttemptedFor.current === data.applicationNumberRaw || claimChangesBusy) return;
    void loadClaimChanges(data.applicationNumberRaw);
  }, [claimChanges?.applicationNumber, claimChangesBusy, data.applicationNumberRaw, data.isDemo, hasAmendmentDocuments, loadClaimChanges, mode, view]);
  useEffect(() => {
    const documentNumbers = claimChangeSignature.split(':').at(-1)?.split(',').filter(Boolean) ?? [];
    if (mode !== 'response' || !documentNumbers.length) return;
    if (claimChangeSummaryAttemptedFor.current === claimChangeSignature) return;
    void loadCachedClaimChangeSummary(data.applicationNumberRaw, documentNumbers);
  }, [claimChangeSignature, data.applicationNumberRaw, loadCachedClaimChangeSummary, mode]);
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
  async function generateClaimChangeAnalysis(force = false) {
    if (!linkedClaimChangeDocuments.length) {
      setToast('보정서와 연결된 청구항 변동이 없어 AI 분석을 실행할 수 없습니다.');
      return;
    }
    setClaimChangeSummaryBusy(true); setClaimChangeSummaryError('');
    try {
      const parameters = new URLSearchParams({ applicationNumber: data.applicationNumberRaw });
      if (force) parameters.set('force', 'true');
      const response = await fetch(`/api/patent/claim-change-summary?${parameters}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documents: linkedClaimChangeDocuments,
          amendments: examinationRounds.flatMap((round) => round.amendments.map((item) => ({ documentNumber: item.documentNumber, date: item.date, roundNumber: round.number }))),
        }),
      });
      const payload = await response.json() as ClaimChangeSummaryPayload & { error?: string };
      if (!response.ok || !payload.summary) throw new Error(payload.error || '청구항 변동 AI 요약을 생성하지 못했습니다.');
      setClaimChangeSummary(payload); setStrategyDraftKeywords([]);
      claimChangeSummaryAttemptedFor.current = claimChangeSignature;
      void fetchUsage().then(setUsage).catch(() => undefined);
      setToast('보정 전후 청구항의 기술적 변화를 정리했습니다.');
    } catch (error) {
      setClaimChangeSummaryError(error instanceof Error ? error.message : '청구항 변동 AI 요약을 생성하지 못했습니다.');
    } finally {
      setClaimChangeSummaryBusy(false);
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
      setData(nextData); setQuery(nextData.applicationNumber); setMode('initial'); setView('overview'); setSelectedClaim(nextData.claims[0]?.number || 1); setFeatures(featureRows(nextData.claims[0])); setSummary(null); setSummaryError(''); setClaimChanges(null); setClaimChangesError(''); setClaimChangeSummary(null); setClaimChangeSummaryError(''); setStrategyDraftKeywords([]); setSourceDetailsOpen(false); setCaseDetailsOpen(false); claimChangesAttemptedFor.current = null; claimChangeSummaryAttemptedFor.current = null; setSearchRan(false); setCandidates([]); writeStoredWorkspace(nextData, null, 'initial'); syncCaseUrl(nextData.applicationNumberRaw); if (!nextData.isDemo) void loadCachedSummary(nextData.applicationNumberRaw); setToast('사건을 불러왔습니다. AI 분석은 실행 버튼을 눌렀을 때만 생성됩니다.');
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

  if (restoring) return <div className="exam-app"><div className="exam-loading" role="status"><section><span>작업공간 복원</span><h2>이전에 보던 심사 사건을 불러오는 중입니다.</h2></section></div></div>;

  return <div className={`exam-app mode-${mode}`}>
    <a className="skip-link" href="#exam-main">본문 바로가기</a>
    <div className="exam-govbar"><span aria-hidden="true" /> 대한민국 디지털 정부 디자인 시스템(KRDS)을 참고한 특허심사 지원 도구입니다.</div>
    <header className="exam-header">
      <button className="exam-brand" type="button" onClick={() => go('overview')}><span aria-hidden="true">특허</span><strong>특허심사 지원서비스</strong><small>KIPRIS Plus 연계 · 심사데스크</small></button>
      <form className="exam-search" onSubmit={handleSearch}><label htmlFor="case-search">출원번호 검색</label><input id="case-search" value={query} onChange={(event) => setQuery(event.target.value)} inputMode="numeric" placeholder="출원번호 13자리 입력"/><button type="submit">검색</button></form>
      <div className="exam-header-actions">
        <span className="exam-usage desktop-header-only">외부 API <strong>{usage?.total ?? '—'}</strong>회</span>
        <button className="exam-secondary mobile-case-materials" type="button" onClick={() => openResource('biblio')}><span className="desktop-label">사건자료</span><span className="mobile-label">자료</span></button>
        <button className="exam-primary desktop-download" type="button" onClick={downloadPackage} disabled={packageBusy}>{packageBusy ? '정리 중…' : '심사자료 내려받기'}</button>
        <details className="mobile-more-menu"><summary aria-label="더보기">⋮</summary><div role="menu"><button type="button" onClick={downloadPackage} disabled={packageBusy}>{packageBusy ? '정리 중…' : '심사자료 내려받기'}</button><button type="button" disabled={data.isDemo} onClick={() => void refreshPatentCase()}>최신 데이터 다시 조회</button><button type="button" onClick={() => setSourceDetailsOpen((current) => !current)}>데이터 진단정보</button><span>외부 API 누적 {usage?.total ?? '—'}회</span></div></details>
      </div>
    </header>
    <div className="exam-modebar" aria-label="현재 사건 정보">
      <div className="case-primary"><span className="mode-badge">{mode === 'response' ? '중간서류 검토' : '최초심사 관점'}</span><div className="case-title-line"><strong>{data.applicationNumber}</strong><span className={`mobile-lifecycle-badge ${lifecycle.tone}`}>{lifecycle.label}</span></div><span>{data.title}</span></div>
      <div className={`case-lifecycle ${lifecycle.tone}`} title={lifecycle.reason}><small>사건 현재 상태</small><strong>{lifecycle.label}</strong><span>{lifecycle.reason}</span></div>
      <div className="analysis-target"><small>현재 분석대상</small><strong>{targetLabel}</strong></div>
      <div className="data-basis"><small>데이터 기준</small><span>{data.isDemo ? '데모 데이터' : `${data.cached ? '저장된 사건' : '최신 조회'} · ${data.updatedAt}`}</span></div>
      <div className="mode-switch" aria-label="사용자 작업 관점"><button aria-pressed={mode === 'initial'} className={mode === 'initial' ? 'active' : ''} type="button" onClick={() => selectMode('initial')}>최초심사 검토</button><button aria-pressed={mode === 'response'} className={mode === 'response' ? 'active' : ''} type="button" onClick={() => selectMode('response')}>중간서류 검토</button></div>
      <button className="mobile-case-details-toggle" type="button" aria-expanded={caseDetailsOpen} onClick={() => setCaseDetailsOpen((current) => !current)}>사건정보 {caseDetailsOpen ? '접기' : '펼치기'}</button>
      <div className={`mobile-case-details ${caseDetailsOpen ? 'open' : ''}`}><Data label="현재 분석대상" value={targetLabel}/><Data label="데이터 기준" value={data.isDemo ? '데모 데이터' : `${data.cached ? '저장된 사건' : '최신 조회'} · ${data.updatedAt}`}/><Data label="상태 설명" value={lifecycle.reason}/></div>
    </div>
    <div className={`exam-frame ${resourceOpen ? 'resource-visible' : ''}`}>
      <aside className="exam-sidebar"><p>심사 업무 단계</p><label className="mobile-step-picker"><span>{activeAvailableIndex + 1} / {availableSteps.length}</span><select aria-label="심사 업무 단계 선택" value={view} onChange={(event) => go(event.target.value as WorkView)}>{availableSteps.map((step) => <option key={step[0]} value={step[0]}>{step[1]}{step[2] === 'optional' ? ' · 선택' : ''}</option>)}</select></label><nav aria-label="심사 업무 단계">{steps.map((step, index) => { const unavailable = step[2] === 'future'; const optional = step[2] === 'optional'; const state = step[0] === view ? 'active' : index < activeIndex ? 'done' : 'idle'; return <button ref={(node) => { stepRefs.current[step[0]] = node; }} key={step[0]} className={`${state}${unavailable ? ' is-coming' : ''}${optional ? ' is-optional' : ''}`} type="button" aria-current={state === 'active' ? 'step' : undefined} disabled={unavailable} title={unavailable ? '공통 근거 구조 완성 후 제공할 기능입니다.' : optional ? '심사관이 추가 검색을 원하는 경우에만 진행합니다.' : undefined} onClick={() => go(step[0])}><span>{state === 'done' ? '✓' : String(index + 1)}</span><strong>{step[1]}</strong>{unavailable ? <small>준비 중</small> : optional ? <small>선택</small> : null}</button>; })}</nav><div className="exam-source-state"><span className={data.isDemo ? 'demo' : ''}/><strong>{data.isDemo ? '데모 사건' : 'KIPRIS Plus 연결'}</strong><small>{sourceOk}/{data.sources.length}개 데이터 소스 정상</small></div></aside>
      <main className="exam-main" id="exam-main" tabIndex={-1}>
        {failedSources.length > 0 && <section className="source-warning" role="alert"><div><strong>일부 사건자료를 불러오지 못했습니다.</strong><span>{failedSources.map((source) => sourceLabel(source.name)).join(' · ')}</span></div><div><button type="button" onClick={() => setSourceDetailsOpen((current) => !current)}>{sourceDetailsOpen ? '상세 닫기' : '상세 보기'}</button><button type="button" disabled={data.isDemo} onClick={() => void refreshPatentCase()}>다시 조회</button></div>{sourceDetailsOpen && <ul>{failedSources.map((source) => <li key={source.name}><b>{sourceLabel(source.name)}</b>{source.message}</li>)}</ul>}</section>}
        {view === 'overview' && <OverviewView data={data} mode={mode} lifecycle={lifecycle} rounds={examinationRounds} targetLabel={targetLabel} familyCountries={familyCountries} independentCount={independentClaims.length} onNext={() => go(mode === 'response' ? 'response-analysis' : 'technology')} onResource={openResource} onRefresh={() => void refreshPatentCase()}/>}
        {view === 'response-analysis' && <ResponseAnalysisView applicationNumber={data.applicationNumberRaw} rounds={examinationRounds} claimChanges={visibleClaimChanges} claimChangesBusy={claimChangesBusy} claimChangesError={claimChangesError} claimChangeSummary={claimChangeSummary} claimChangeSummaryBusy={claimChangeSummaryBusy} claimChangeSummaryError={claimChangeSummaryError} isDemo={data.isDemo} onRefreshClaimChanges={() => { setClaimChangeSummary(null); setClaimChangeSummaryError(''); claimChangeSummaryAttemptedFor.current = null; void loadClaimChanges(data.applicationNumberRaw, true); }} onAnalyzeClaimChanges={() => void generateClaimChangeAnalysis(Boolean(claimChangeSummary?.summary))} onUsageRefresh={() => { void fetchUsage().then(setUsage).catch(() => undefined); }} onNotice={openNotice} onNext={() => go('technology')}/>}
        {view === 'technology' && <TechnologyView data={data} mode={mode} claimAnalysis={claimAnalysis} selectedClaim={selectedClaim} features={features} summary={summary} summaryBusy={summaryBusy} summaryError={summaryError} onSelectClaim={(number) => { setSelectedClaim(number); setFeatures(featureRows(data.claims.find((claim) => claim.number === number))); }} onOpenClaim={(number) => { setSelectedClaim(number); openResource('claims'); }} onChangeRole={(id, role) => setFeatures((current) => current.map((feature) => feature.id === id ? { ...feature, role } : feature))} onAnalyze={() => data.isDemo ? setToast('데모 사건은 기존 분석 시안을 사용합니다.') : void generateSummary(data.applicationNumberRaw, Boolean(summary?.summary))} onNext={() => go(mode === 'response' ? 'response-review' : 'strategy')}/>}
        {view === 'response-review' && <ResponseReviewView summary={summary?.summary ?? null} claimChangeSummary={claimChangeSummary?.summary ?? null} rounds={examinationRounds} linkedChangeCount={linkedClaimChangeDocuments.length} onResponse={() => go('response-analysis')} onTechnology={() => go('technology')} onAdditionalSearch={() => go('strategy')}/>}
        {view === 'strategy' && <StrategyView data={data} mode={mode} features={features} approvedKeywords={approvedKeywords} suggestedKeywords={aiStrategySuggestions} selectedDraftKeywords={strategyDraftKeywords} claimChangeSummary={claimChangeSummary?.summary ?? null} onToggleKeyword={toggleStrategyKeyword} onCopy={() => void copyText(searchExpression, '검색식')} onNext={() => go('search')}/>}
        {view === 'search' && <PriorArtSearchView data={data} mode={mode} expression={searchExpression} candidates={candidates} searchRan={searchRan} onRun={runSearch} onCopy={() => void copyText(searchExpression, '검색식')} onCandidate={(candidate) => { setSelectedCandidate(candidate.id); setCandidates((current) => current.map((item) => item.id === candidate.id && item.role === '보류' ? { ...item, role: 'D2 후보' } : item)); }} onOpenResource={() => openResource('documents')} onNext={() => go('candidates')}/>}
        {view === 'candidates' && <CandidatesView data={data} mode={mode} features={features} candidates={candidates} selectedCandidate={selectedCandidate} onSelect={setSelectedCandidate} onBack={() => go('search')}/>}
        {(view === 'evidence' || view === 'notice-draft') && <FutureView title={view === 'evidence' ? '증거리뷰' : '통지서 작성'} description={view === 'evidence' ? '청구항 구성과 인용문헌 원문 근거를 심사관이 확정하는 화면입니다.' : '확인된 근거만 사용해 문단 단위로 통지서를 작성하는 화면입니다.'} onBack={() => go('candidates')}/>}
      </main>
      {resourceOpen && <ResourcePanel data={data} tab={resourceTab} selectedClaim={currentClaim?.number || 1} isMobile={isMobile} onTab={setResourceTab} onClose={closeResource} onFullText={() => window.location.assign(`/fulltext?applicationNumber=${encodeURIComponent(data.applicationNumberRaw)}`)} onNotice={openNotice} onDrawing={openDrawing}/>}</div>
    <footer className="exam-step-footer"><button type="button" disabled={activeIndex === 0} onClick={() => go(steps[Math.max(0, activeIndex - 1)][0])}>← 이전 단계</button><span>작업 관점·최근 사건 저장됨 · 이 브라우저</span><button className={nextStepUnavailable ? 'is-coming' : nextStepOptional ? 'is-optional' : 'exam-primary'} type="button" disabled={!nextStep || nextStepUnavailable} title={nextStepUnavailable ? `${nextStep?.[1]} 기능은 준비 중입니다.` : nextStepOptional ? '추가 검색이 필요한 경우에만 진행합니다.' : undefined} onClick={() => nextStep && go(nextStep[0])}>{nextStepUnavailable ? `${nextStep?.[1]} · 준비 중` : nextStepOptional ? `${nextStep?.[1]} · 선택 →` : '다음 단계 →'}</button></footer>
    {loading && <LoadingOverlay message={loadingMessage}/>} {toast && <div className="exam-toast" role="status">{toast}</div>} {selectedNotice && <NoticeDialog applicationNumber={data.applicationNumberRaw} notice={selectedNotice} pdfUrl={pdfUrl(selectedNotice)} onClose={closeNotice}/>} {drawingOpen && <DrawingDialog data={data} onClose={closeDrawing}/>}</div>;
}

function PageHeading({ step, title, description, action }: { step: string; title: string; description: string; action?: React.ReactNode }) { return <header className="work-heading"><div><span>{/^\d+$/.test(step) ? `단계 ${Number(step)}` : step}</span><h1>{title}</h1><p>{description}</p></div>{action}</header>; }
function OverviewView({ data, mode, lifecycle, rounds, targetLabel, familyCountries, independentCount, onNext, onResource, onRefresh }: { data: PatentCase; mode: WorkMode; lifecycle: CaseLifecycle; rounds: ExaminationRound<NoticeItem>[]; targetLabel: string; familyCountries: number; independentCount: number; onNext: () => void; onResource: (tab: ResourceTab) => void; onRefresh: () => void }) {
  const latestNotice = rounds.at(-1)?.notice;
  const failedSources = data.sources.filter((source) => !source.ok);
  const normalSources = data.sources.filter((source) => source.ok);
  return <>
    <PageHeading step="01" title="사건 개요" description="사건 상태와 선택한 검토 관점을 확인합니다." action={<span className={`mode-card ${mode}`}>{mode === 'response' ? '중간서류 검토' : '최초 청구항 분석'}</span>}/>
    <section className="overview-summary"><div><small>분석대상</small><strong>{targetLabel}</strong><span>{lifecycle.label} · {data.applicant}</span></div><button type="button" onClick={() => onResource('claims')}>청구항 원문 보기</button></section>
    <section className="data-freshness"><div><span className={data.isDemo ? 'demo' : data.cached ? 'cached' : 'live'}>{data.isDemo ? '데모 데이터' : data.cached ? '저장된 사건' : '최신 조회'}</span><p>데이터 기준 <strong>{data.updatedAt}</strong></p></div>{!data.isDemo && <button type="button" onClick={onRefresh}>최신 데이터 다시 조회 <small>외부 API 4회</small></button>}</section>
    <div className="overview-grid">
      <section className="work-card"><h2>사건 핵심정보</h2><dl className="key-dl"><Data label="출원일" value={data.applicationDate}/><Data label="공개일" value={data.publicationDate}/><Data label="심사청구일" value={data.examinationRequestDate}/><Data label="청구항" value={`${data.claimCount}개 · 독립항 ${independentCount}개`}/><Data label="주 CPC" value={data.cpc[0]?.number || '정보 없음'} link={data.cpc[0] ? cpcUrl(data.cpc[0].number) : undefined}/><Data label="출원인" value={data.applicant}/></dl></section>
      <section className="work-card readiness"><h2>사건자료 {normalSources.length}/{data.sources.length} 확보</h2>{failedSources.length ? <ul className="exception-list">{failedSources.map((source) => <li className="warn" key={source.name}>! {sourceLabel(source.name)} 확인 필요</li>)}{data.family.length > 0 && <li className="warn">! 패밀리 {familyCountries}개 관할청 확인 필요</li>}</ul> : <p className="readiness-ok">필수 사건자료를 모두 불러왔습니다.</p>}<details><summary>정상 수신 항목 보기</summary><ul>{normalSources.map((source) => <li className="ok" key={source.name}>✓ {sourceLabel(source.name)}</li>)}</ul></details><p className="lifecycle-reason">{lifecycle.reason}</p></section>
    </div>
    {mode === 'response' && <section className="work-card rounds"><div className="section-title"><div><small>회차별 문서 연결</small><h2>심사 회차</h2></div><button type="button" onClick={() => onResource('history')}>전체 이력 보기</button></div><div className="round-list">{rounds.length ? rounds.map((round) => <article key={round.notice.documentNumber}><span>{round.number}</span><div><strong>{round.number}차 통지 · {formatDate(round.notice.date)}</strong><p>{round.notice.title} · {round.notice.status}</p><div className="round-docs">{round.opinions.map((item) => <small key={item.documentNumber}>의견서 {formatDate(item.date)}</small>)}{round.amendments.map((item) => <small key={item.documentNumber}>보정서 {formatDate(item.date)}</small>)}{round.decisions.map((item) => <small key={item.documentNumber}>후속 결정 {formatDate(item.date)}</small>)}</div><small className={`connection-status ${round.connectionStatus}`}>{round.connectionStatus === 'linked' ? '문서 연결됨' : '연결 확인 필요'} · {round.connectionReason}</small></div></article>) : <EmptyState title="확인된 심사 회차가 없습니다." text="의견제출통지서가 확인되면 통지일 오름차순으로 회차를 구성합니다." action="전체 이력 확인" onAction={() => onResource('history')}/>}</div></section>}
    <section className="next-work"><div><small>다음 작업</small><h2>{mode === 'response' ? '통지 내용과 대응서류의 연결 상태를 확인하세요.' : '청구항 인용관계를 확인하고 검색 대상 구성을 선정하세요.'}</h2><p>{latestNotice ? `최근 통지 ${formatDate(latestNotice.date)} · ${latestNotice.documentNumber}` : '확인된 의견제출통지서가 없습니다.'}</p></div><button className="exam-primary" type="button" onClick={onNext}>{mode === 'response' ? '통지·대응 분석' : '기술내용 파악'} →</button></section>
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

function ResponseAnalysisView({ applicationNumber, rounds, claimChanges, claimChangesBusy, claimChangesError, claimChangeSummary, claimChangeSummaryBusy, claimChangeSummaryError, isDemo, onRefreshClaimChanges, onAnalyzeClaimChanges, onUsageRefresh, onNotice, onNext }: { applicationNumber: string; rounds: ExaminationRound<NoticeItem>[]; claimChanges: ClaimChangePayload | null; claimChangesBusy: boolean; claimChangesError: string; claimChangeSummary: ClaimChangeSummaryPayload | null; claimChangeSummaryBusy: boolean; claimChangeSummaryError: string; isDemo: boolean; onRefreshClaimChanges: () => void; onAnalyzeClaimChanges: () => void; onUsageRefresh: () => void; onNotice: (notice: NoticeItem) => void; onNext: () => void }) {
  const [selectedRoundNumber, setSelectedRoundNumber] = useState<number | null>(null);
  const [noticeAnalysis, setNoticeAnalysis] = useState<NoticeAnalysis | null>(null);
  const [noticeAnalysisBusy, setNoticeAnalysisBusy] = useState(false);
  const [noticeAnalysisError, setNoticeAnalysisError] = useState('');
  const [resolutionPayload, setResolutionPayload] = useState<AmendmentResolutionPayload | null>(null);
  const [resolutionBusy, setResolutionBusy] = useState(false);
  const [resolutionError, setResolutionError] = useState('');
  const selectedRound = rounds.find((round) => round.number === selectedRoundNumber) ?? rounds.at(-1) ?? null;
  const needsConfirmation = rounds.filter((round) => round.connectionStatus === 'needs_confirmation').length;
  const amendmentDocuments = rounds.flatMap((round) => round.amendments);
  const linkedChangeDocuments = amendmentDocuments.filter((item) => claimChangeDocument(claimChanges, item.documentNumber));
  const selectedChangeDocuments = selectedRound?.amendments.flatMap((item) => {
    const document = claimChangeDocument(claimChanges, item.documentNumber);
    return document ? [document] : [];
  }) ?? [];
  const selectedNoticeNumber = selectedRound?.notice.documentNumber ?? '';
  const expectedResolutionDocuments = selectedChangeDocuments.map((document) => digits(document.documentNumber)).sort().join(',');
  const receivedResolutionDocuments = (resolutionPayload?.sourceDocumentNumbers ?? []).map(digits).sort().join(',');
  const activeResolutionPayload = expectedResolutionDocuments && expectedResolutionDocuments === receivedResolutionDocuments
    ? resolutionPayload
    : null;
  const displayedResolution = activeResolutionPayload?.summary
    ?? localAmendmentResolution(noticeAnalysis?.summary ?? null, selectedChangeDocuments);

  useEffect(() => {
    let cancelled = false;
    window.queueMicrotask(() => {
      if (cancelled) return;
      setNoticeAnalysis(null);
      setNoticeAnalysisError('');
      setResolutionPayload(null);
      setResolutionError('');
      setNoticeAnalysisBusy(Boolean(selectedNoticeNumber && !isDemo));
      setResolutionBusy(Boolean(selectedNoticeNumber && !isDemo));
    });
    if (!selectedNoticeNumber || isDemo) return () => { cancelled = true; };
    const parameters = new URLSearchParams({ applicationNumber, sendNumber: selectedNoticeNumber });
    void fetch(`/api/patent/notice-analysis?${parameters}`, { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json() as NoticeAnalysis;
        if (response.status === 404) return null;
        if (!response.ok) throw new Error(payload.error || '저장된 통지서 요약을 불러오지 못했습니다.');
        return payload;
      })
      .then((payload) => { if (!cancelled) setNoticeAnalysis(payload); })
      .catch((error) => { if (!cancelled) setNoticeAnalysisError(error instanceof Error ? error.message : '통지서 요약을 불러오지 못했습니다.'); })
      .finally(() => { if (!cancelled) setNoticeAnalysisBusy(false); });
    void fetch(`/api/patent/amendment-resolution?${parameters}`, { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json() as AmendmentResolutionPayload;
        if (!response.ok) throw new Error(payload.error || '저장된 보정 검토 결과를 불러오지 못했습니다.');
        return payload;
      })
      .then((payload) => { if (!cancelled) setResolutionPayload(payload.summary ? payload : null); })
      .catch((error) => { if (!cancelled) setResolutionError(error instanceof Error ? error.message : '보정 검토 결과를 불러오지 못했습니다.'); })
      .finally(() => { if (!cancelled) setResolutionBusy(false); });
    return () => { cancelled = true; };
  }, [applicationNumber, isDemo, selectedNoticeNumber]);

  async function analyzeSelectedNotice() {
    if (!selectedRound) return;
    setNoticeAnalysisBusy(true);
    setNoticeAnalysisError('');
    try {
      const parameters = new URLSearchParams({ applicationNumber, sendNumber: selectedRound.notice.documentNumber });
      if (noticeAnalysis) parameters.set('force', 'true');
      const response = await fetch(`/api/patent/notice-analysis?${parameters}`, { method: 'POST' });
      const payload = await response.json() as NoticeAnalysis;
      if (!response.ok) throw new Error(payload.error || '통지서 요약을 생성하지 못했습니다.');
      setNoticeAnalysis(payload);
      setResolutionPayload(null);
      onUsageRefresh();
    } catch (error) {
      setNoticeAnalysisError(error instanceof Error ? error.message : '통지서 요약을 생성하지 못했습니다.');
    } finally {
      setNoticeAnalysisBusy(false);
    }
  }

  async function analyzeAmendmentResolution() {
    if (!selectedRound || !noticeAnalysis?.summary || !selectedChangeDocuments.length) return;
    setResolutionBusy(true);
    setResolutionError('');
    try {
      const parameters = new URLSearchParams({ applicationNumber, sendNumber: selectedRound.notice.documentNumber });
      if (activeResolutionPayload?.summary) parameters.set('force', 'true');
      const response = await fetch(`/api/patent/amendment-resolution?${parameters}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          noticeSummary: noticeAnalysis.summary,
          documents: selectedChangeDocuments,
        }),
      });
      const payload = await response.json() as AmendmentResolutionPayload;
      if (!response.ok || !payload.summary) throw new Error(payload.error || '보정의 거절이유 해소 여부를 분석하지 못했습니다.');
      setResolutionPayload(payload);
      onUsageRefresh();
    } catch (error) {
      setResolutionError(error instanceof Error ? error.message : '보정의 거절이유 해소 여부를 분석하지 못했습니다.');
    } finally {
      setResolutionBusy(false);
    }
  }

  return <>
    <PageHeading step="02" title="통지·대응 분석" description="법조항별 거절 청구항과 보정 후 해소 여부를 회차별로 확인합니다."/>
    {rounds.length > 0 && <label className="mobile-round-select"><span>심사 회차</span><select value={selectedRound?.number ?? ''} onChange={(event) => setSelectedRoundNumber(Number(event.target.value))}>{rounds.map((round) => <option key={round.notice.documentNumber} value={round.number}>{round.number}차 통지 · {formatDate(round.notice.date)}</option>)}</select></label>}
    <div className="round-tabs">{rounds.map((round) => <button className={selectedRound?.number === round.number ? 'active' : ''} type="button" key={round.notice.documentNumber} onClick={() => setSelectedRoundNumber(round.number)}>{round.number}차 통지 {formatDate(round.notice.date)}</button>)}<button className="is-coming" type="button" disabled>전체 이력 분석 · 준비 중</button></div>
    {selectedRound ? <section className="response-document-analysis">
      <article className="response-document-card notice-result">
        <header><div><span>법조항별 거절 청구항</span><h2>의견제출통지서</h2><p>발송 {formatDate(selectedRound.notice.date)} · {selectedRound.notice.documentNumber}</p></div><button type="button" onClick={() => onNotice(selectedRound.notice)}>원문 보기</button></header>
        {noticeAnalysisBusy && <div className="response-analysis-state" role="status">저장된 통지서 요약을 확인하는 중입니다.</div>}
        {noticeAnalysisError && <div className="inline-warning">△ {noticeAnalysisError}</div>}
        {!noticeAnalysisBusy && !noticeAnalysis && <div className="response-analysis-empty"><strong>법조항별 요약이 아직 없습니다.</strong><span>실행할 때만 통지서 PDF를 읽어 거절 청구항을 추출합니다.</span>{!isDemo && <button type="button" onClick={() => void analyzeSelectedNotice()}>통지서 요약 실행</button>}</div>}
        {noticeAnalysis && <><dl className="notice-ground-list">{noticeAnalysis.summary.rejectionGrounds.map((ground, index) => <div key={`${ground.provision}-${index}`}><dt>{conciseProvision(ground.provision)}</dt><dd>{claimNumbersLabel(ground.claimNumbers)}</dd>{ground.reason && <small>{ground.reason}</small>}</div>)}{noticeAnalysis.summary.allowableClaims.length > 0 && <div className="allowable"><dt>등록가능항</dt><dd>{claimNumbersLabel(noticeAnalysis.summary.allowableClaims)}</dd></div>}</dl>{!noticeAnalysis.summary.rejectionGrounds.length && <div className="inline-warning">△ 통지서에서 법조항별 거절 청구항을 구조화하지 못했습니다.</div>}<button className="response-text-action" type="button" onClick={() => void analyzeSelectedNotice()} disabled={noticeAnalysisBusy}>AI 요약 다시 실행</button></>}
      </article>
      <article className="response-document-card opinion-result">
        <header><div><span>원문 미확보 · 분석 안 함</span><h2>의견서</h2><p>{selectedRound.opinions.length ? `접수 ${selectedRound.opinions.map((item) => formatDate(item.date)).join(' · ')}` : '접수일 미확인'}</p></div></header>
        <div className="opinion-unavailable"><strong>의견서 내용은 요약하지 않습니다.</strong><p>KIPRIS Plus에서 의견서 원문 파일이 제공되지 않아 출원인 주장을 추정하지 않습니다.</p></div>
        {selectedRound.opinions.length > 0 && <ul className="response-document-history">{selectedRound.opinions.map((item) => <li key={item.documentNumber}><strong>{formatDate(item.date)}</strong><span>{item.title}</span></li>)}</ul>}
      </article>
      <article className="response-document-card amendment-result">
        <header><div><span>거절이유 해소 검토</span><h2>보정서</h2><p>{selectedRound.amendments.length ? `접수 ${selectedRound.amendments.map((item) => formatDate(item.date)).join(' · ')}` : '접수일 미확인'} · 통지서와 청구항 변동 대조</p></div>{noticeAnalysis?.summary.rejectionGrounds.length && selectedChangeDocuments.length ? <button type="button" disabled={resolutionBusy} onClick={() => void analyzeAmendmentResolution()}>{resolutionBusy ? 'AI 검토 중…' : activeResolutionPayload?.summary ? 'AI 다시 검토' : 'AI 해소 검토'}</button> : null}</header>
        {resolutionError && <div className="inline-warning">△ {resolutionError}</div>}
        {!selectedRound.amendments.length && <div className="response-analysis-empty"><strong>이 회차에 연결된 보정서가 없습니다.</strong></div>}
        {selectedRound.amendments.length > 0 && !selectedChangeDocuments.length && <div className="response-analysis-empty"><strong>청구항 변동이력 연결이 필요합니다.</strong><span>{claimChangesBusy ? '변동이력을 확인하는 중입니다.' : '보정서 문서번호와 일치하는 변동정보가 없습니다.'}</span></div>}
        {selectedChangeDocuments.length > 0 && !noticeAnalysis && <div className="response-analysis-empty"><strong>통지서 요약을 먼저 실행해 주세요.</strong><span>법조항별 거절 청구항이 있어야 보정 결과를 대조할 수 있습니다.</span></div>}
        {displayedResolution && <ResolutionResult summary={displayedResolution} aiGenerated={Boolean(activeResolutionPayload?.summary)}/>}
        {selectedRound.amendments.length > 0 && <ul className="response-document-history amendment-history">{selectedRound.amendments.map((item) => { const linked = claimChangeDocument(claimChanges, item.documentNumber); return <li key={item.documentNumber}><div><strong>{formatDate(item.date)} 보정서</strong><code>{item.documentNumber}</code></div><span className={linked ? 'claim-change-linked' : 'claim-change-pending'}>{linked ? claimChangeStats(linked) : claimChangesBusy ? '변동이력 확인 중…' : '변동이력 연결 확인 필요'}</span></li>; })}</ul>}
      </article>
      <footer className="response-connection-note"><span className={selectedRound.connectionStatus === 'linked' ? 'status-linked' : 'status-warning'}>{selectedRound.connectionStatus === 'linked' ? '문서 연결됨' : '연결 확인 필요'}</span><p>{selectedRound.connectionReason}</p>{selectedRound.decisions.map((item) => <small key={item.documentNumber}>후속 처리 · {item.title}</small>)}</footer>
    </section> : <EmptyState title="확인된 통지서가 없습니다." text="행정처리 이력에 의견제출통지서가 확인되면 회차별 분석을 시작할 수 있습니다." action="사건자료 확인"/>}
    {selectedRound && <ClaimChangeReview round={selectedRound} history={claimChanges} loading={claimChangesBusy} error={claimChangesError} aiSummary={claimChangeSummary} aiBusy={claimChangeSummaryBusy} aiError={claimChangeSummaryError} isDemo={isDemo} onRefresh={onRefreshClaimChanges} onAnalyze={onAnalyzeClaimChanges}/>}
    <section className="analysis-result"><div><h2>중간서류 연결 결과</h2><p>보정서 문서번호와 일치하는 청구항 변동만 연결했습니다. 다음 단계에서는 현재 발명의 기술 내용과 보정 영향을 함께 확인합니다.</p></div><dl><Data label="구성된 회차" value={`${rounds.length}개`}/><Data label="보정 변동 연결" value={`${linkedChangeDocuments.length}/${amendmentDocuments.length}건`}/><Data label="회차 확인 필요" value={`${needsConfirmation}개`}/></dl><button className="exam-primary" type="button" onClick={onNext}>기술내용 파악 →</button></section>
  </>;
}

function ResolutionResult({ summary, aiGenerated }: { summary: AmendmentResolutionSummary; aiGenerated: boolean }) {
  const statusLabel = ({
    resolved: '해소',
    partially_resolved: '일부 해소',
    not_resolved: '유지',
    needs_review: '검토 필요',
    insufficient: '자료 부족',
  } satisfies Record<AmendmentResolutionStatus, string>);
  return <div className={`amendment-resolution-summary resolution-${summary.status}`}>
    <div className="resolution-lead"><span>{aiGenerated ? 'AI 검토 · 미확인' : '문서 자동 대조'}</span><h3>{summary.headline}</h3></div>
    {summary.outcomeLines.length > 0 && <ul className="resolution-outcomes">{summary.outcomeLines.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul>}
    <div className="resolution-ground-results">{summary.legalGroundResults.map((ground, index) => <details key={`${ground.provision}-${index}`}><summary><strong>{conciseProvision(ground.provision)}</strong><span className={`resolution-status status-${ground.assessment}`}>{statusLabel[ground.assessment]}</span></summary><p>{ground.summary}</p></details>)}</div>
    {summary.cautions.length > 0 && <p className="resolution-caution">{summary.cautions[0]}</p>}
  </div>;
}

function ClaimChangeReview({ round, history, loading, error, aiSummary, aiBusy, aiError, isDemo, onRefresh, onAnalyze }: { round: ExaminationRound<NoticeItem>; history: ClaimChangePayload | null; loading: boolean; error: string; aiSummary: ClaimChangeSummaryPayload | null; aiBusy: boolean; aiError: string; isDemo: boolean; onRefresh: () => void; onAnalyze: () => void }) {
  const [selectedDocumentNumber, setSelectedDocumentNumber] = useState<string | null>(null);
  const linked = round.amendments.flatMap((amendment) => {
    const document = claimChangeDocument(history, amendment.documentNumber);
    return document ? [{ amendment, document }] : [];
  });
  const selected = linked.find((item) => item.document.documentNumber === selectedDocumentNumber) ?? linked.at(-1) ?? null;
  const selectedAiDocument = aiSummary?.summary?.documentSummaries.find((item) => digits(item.documentNumber) === digits(selected?.document.documentNumber ?? '')) ?? null;
  function openInsight(insight: ClaimChangeInsight) {
    setSelectedDocumentNumber(insight.documentNumber);
    window.setTimeout(() => document.getElementById(`claim-change-${digits(insight.documentNumber)}-${insight.claimNumbers[0] ?? 0}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
  }

  return <section className="claim-change-review">
    <header><div><small>청구항 변동이력</small><h2>보정 전후 청구항 비교</h2><p>보정서 문서번호와 KIPRIS Plus 청구항 변동이력을 직접 대조합니다.</p></div>{!isDemo && <button type="button" onClick={onRefresh} disabled={loading}>{loading ? '조회 중…' : '변동이력 갱신 · API 1회'}</button>}</header>
    {loading && !history && <div className="claim-change-state" role="status"><strong>청구항 변동이력을 불러오는 중입니다.</strong><span>사건별 최초 1회만 KIPRIS Plus를 호출하고 이후에는 D1 캐시를 사용합니다.</span></div>}
    {error && <div className="inline-warning">△ {error}</div>}
    {isDemo && <div className="claim-change-state"><strong>샘플 사건에는 청구항 변동이력이 연결되지 않습니다.</strong><span>실제 출원번호의 중간서류 화면에서 KIPRIS Plus 응답을 확인할 수 있습니다.</span></div>}
    {!loading && !error && !isDemo && history && !history.documents.length && <div className="claim-change-state"><strong>조회된 청구항 변동이력이 없습니다.</strong><span>해당 출원에 청구항 보정 이력이 없거나 KIPRIS Plus 응답이 비어 있습니다.</span></div>}
    {!loading && !error && !isDemo && history && history.documents.length > 0 && !linked.length && <div className="inline-warning">△ 변동이력 {history.documents.length}개 문서를 받았지만, 이 회차의 보정서 문서번호와 일치하는 항목이 없습니다. 자동 연결하지 않았습니다.</div>}
    {linked.length > 0 && <>
      <div className="claim-change-meta"><div><span>{history?.cached ? 'D1 캐시 사용' : 'KIPRIS Plus 최신 조회'}</span><small>{history?.fetchedAt ? new Date(history.fetchedAt).toLocaleString('ko-KR') : ''}</small></div><nav aria-label="회차 내 보정서 선택">{linked.map(({ amendment, document }) => <button className={selected?.document.documentNumber === document.documentNumber ? 'active' : ''} type="button" key={document.documentNumber} onClick={() => setSelectedDocumentNumber(document.documentNumber)}><strong>{formatDate(amendment.date)} 보정서</strong><small>{claimChangeStats(document)}</small></button>)}</nav></div>
      <ClaimChangeAiBrief payload={aiSummary} selectedDocument={selectedAiDocument} busy={aiBusy} error={aiError} isDemo={isDemo} onAnalyze={onAnalyze} onInsight={openInsight}/>
      {selected && <div className="claim-change-document"><header><div><span>접수문서번호 {selected.document.documentNumber}</span><h3>{formatDate(selected.amendment.date)} 청구항 보정</h3></div><dl><Data label="수정" value={`${selected.document.statistics.amended}항`}/><Data label="신규" value={`${selected.document.statistics.inserted}항`}/><Data label="삭제" value={`${selected.document.statistics.deleted}항`}/></dl></header><div className="claim-change-list">{selected.document.changes.map((change) => <article id={`claim-change-${digits(change.documentNumber)}-${change.claimNumber}`} key={`${change.documentNumber}-${change.claimNumber}`} className={`change-${change.changeTypeCode.toLowerCase()}`}><header><div><span className="claim-number">청구항 {change.claimNumber}</span><span className="change-kind">{change.changeTypeName || change.changeTypeCode}</span></div><small>{change.sourceDocumentNumber ? `기준 문서 ${change.sourceDocumentNumber}` : '기준 문서 자동 추적'}</small></header><div className="claim-change-markup" aria-label={`청구항 ${change.claimNumber} 변경 표시`}><ClaimChangeMarkup segments={change.changeSegments}/></div><details><summary>보정 전·후 전체 문언</summary><div className="claim-text-compare"><section><small>보정 전</small><p>{change.previousClaimText || (change.changeTypeCode === 'I' ? '신규 청구항' : '이전 문언 미수신')}</p></section><section><small>보정 후</small><p>{change.claimText || (change.changeTypeCode === 'D' ? '삭제됨' : '변경 후 문언 미수신')}</p></section></div></details></article>)}</div></div>}
    </>}
  </section>;
}

function ClaimChangeAiBrief({ payload, selectedDocument, busy, error, isDemo, onAnalyze, onInsight }: { payload: ClaimChangeSummaryPayload | null; selectedDocument: ClaimChangeSummary['documentSummaries'][number] | null; busy: boolean; error: string; isDemo: boolean; onAnalyze: () => void; onInsight: (insight: ClaimChangeInsight) => void }) {
  const summary = payload?.summary;
  const visibleImpacts = summary?.examinationImpact.filter((item) => !selectedDocument || digits(item.documentNumber) === digits(selectedDocument.documentNumber)) ?? [];
  const scopeLabel = summary ? ({ narrowed: '한정 추가 중심', broadened_possible: '범위 확대 가능성', mixed: '추가·삭제 혼재', uncertain: '판단 유보' } satisfies Record<ClaimChangeSummary['scopeAssessment'], string>)[summary.scopeAssessment] : '';
  const searchLabel = summary ? ({ not_needed: '추가 검색 필요성 낮음', optional: '심사관 선택', recommended: '추가 검색 권장', insufficient: '자료 부족' } satisfies Record<ClaimChangeSummary['searchRecommendation']['status'], string>)[summary.searchRecommendation.status] : '';
  return <section className="claim-change-ai-brief">
    <header><div><span>AI 생성 · 미확인</span><h3>보정 영향 요약</h3><p>추가·삭제된 한정과 심사 영향만 압축해 보여줍니다.</p></div><button type="button" disabled={busy || isDemo} onClick={onAnalyze}>{busy ? '보정 영향 분석 중…' : summary ? 'AI 요약 다시 실행' : 'AI 보정 영향 요약'}</button></header>
    {error && <div className="inline-warning">△ {error}</div>}
    {!summary && !busy && <div className="claim-change-ai-empty"><strong>아직 생성된 보정 영향 요약이 없습니다.</strong><span>실행할 때만 연결된 보정 청구항을 OpenAI로 보내 분석합니다.</span></div>}
    {busy && <div className="claim-change-ai-empty" role="status"><strong>보정 전후 문언을 비교하고 있습니다.</strong><span>기술적 한정 변화와 추가 검색 판단 근거를 정리합니다.</span></div>}
    {summary && <>
      <div className="claim-change-ai-lead"><div><span className={`scope-${summary.scopeAssessment}`}>{scopeLabel}</span>{payload?.cached && <small>저장된 AI 결과</small>}</div><p>{summary.oneLine}</p></div>
      {selectedDocument && <div className="claim-change-ai-document"><small>선택한 보정서 · {selectedDocument.documentNumber}</small><strong>{selectedDocument.summary}</strong><span>대상 청구항 {selectedDocument.changedClaims.join(', ') || '미분류'}</span></div>}
      {selectedDocument && <div className="claim-change-ai-grid"><section><h4>추가된 한정</h4>{selectedDocument.addedLimitations.length ? <ul>{selectedDocument.addedLimitations.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul> : <p>식별된 추가 한정이 없습니다.</p>}</section><section className="risk"><h4>삭제·완화 가능성</h4>{selectedDocument.removedLimitations.length ? <ul>{selectedDocument.removedLimitations.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul> : <p>식별된 삭제 한정이 없습니다.</p>}</section><section><h4>관계 변화</h4>{selectedDocument.relationshipChanges.length ? <ul>{selectedDocument.relationshipChanges.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul> : <p>식별된 관계 변화가 없습니다.</p>}</section></div>}
      {!!visibleImpacts.length && <div className="claim-change-impact"><h4>심사 영향</h4>{visibleImpacts.slice(0, 5).map((item, index) => <button type="button" key={`${item.documentNumber}-${index}`} onClick={() => onInsight(item)}><strong>{item.text}</strong><span>청구항 {item.claimNumbers.join(', ')} · 근거로 이동</span></button>)}</div>}
      <div className={`claim-change-search-decision decision-${summary.searchRecommendation.status}`}><div><small>추가 검색 판단</small><strong>{searchLabel}</strong><p>{summary.searchRecommendation.reason}</p></div>{summary.searchRecommendation.targetFeatures.length > 0 && <ul>{summary.searchRecommendation.targetFeatures.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul>}<span>추가 검색은 자동으로 시작되지 않습니다.</span></div>
    </>}
  </section>;
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
function TechnologyView({ data, mode, claimAnalysis, selectedClaim, features, summary, summaryBusy, summaryError, onSelectClaim, onOpenClaim, onChangeRole, onAnalyze, onNext }: { data: PatentCase; mode: WorkMode; claimAnalysis: ClaimAnalysis[]; selectedClaim: number; features: ClaimFeature[]; summary: SummaryPayload | null; summaryBusy: boolean; summaryError: string; onSelectClaim: (number: number) => void; onOpenClaim: (number: number) => void; onChangeRole: (id: string, role: SearchRole) => void; onAnalyze: () => void; onNext: () => void }) {
  const ai = summary?.summary;
  const selectedClaimRecord = data.claims.find((claim) => claim.number === selectedClaim);
  const allFeatureParts = featureParts(selectedClaimRecord);
  return <>
    <PageHeading step={mode === 'response' ? '03' : '02'} title="기술내용 파악" description="짧은 AI 요약과 청구항 구조로 발명의 핵심을 빠르게 파악합니다." action={<button className="exam-secondary" type="button" onClick={onAnalyze} disabled={summaryBusy}>{summaryBusy ? '전문 분석 중…' : ai ? 'AI 요약 다시 실행' : 'AI 기술요약 실행'}</button>}/>
    {summaryError && <div className="inline-warning">△ {summaryError}</div>}
    <div className="technology-layout">
      <aside className="claim-tree"><div><h2>청구항 구조</h2><span>{data.claimCount}개</span></div>{claimAnalysis.map((claim) => <article className={`claim-tree-item${selectedClaim === claim.number ? ' active' : ''}${claim.errors.length ? ' invalid' : ''}`} style={{ paddingLeft: `${10 + Math.min(claim.depth, 6) * 13}px` }} key={claim.number}><button className="claim-tree-main" type="button" aria-pressed={selectedClaim === claim.number} onClick={() => onSelectClaim(claim.number)}><span>{claim.isIndependent ? '독립' : claim.multipleDependent ? '다중' : '종속'}</span><div><strong>청구항 {claim.number}</strong><small>{claim.isIndependent ? `독립항 · 종속항 ${claim.children.length}개` : `제${claim.directReferences.join('·')}항 인용 · ${claim.depth}단계`}</small>{claim.errors.length > 0 && <em>{claim.errors.join(' ')}</em>}</div></button><div className="claim-tree-actions"><button type="button" onClick={() => onOpenClaim(claim.number)}>원문</button></div></article>)}</aside>
      <section className="technology-center">
        {ai ? <TechnicalAiBrief summary={ai}/> : <section className="ai-analysis-state"><span>{summaryBusy ? '전문 분석 중' : 'AI 기술요약'}</span><h2>{summaryBusy ? '명세서의 핵심만 추리고 있습니다.' : '아직 생성된 AI 기술요약이 없습니다.'}</h2><p>{summaryBusy ? '과제·해결수단·청구항 핵심과 검색 단서를 짧게 정리합니다.' : '실행 버튼을 누른 경우에만 실제 명세서 내용을 OpenAI로 보내 요약합니다.'}</p></section>}
        <section className="feature-selector"><div className="section-title"><div><small>AI 검색대상 구성 초안</small><h2>검색대상 구성</h2></div><span>청구항 {selectedClaim}</span></div><p className="feature-draft-note">청구항 {selectedClaim}에서 자동 분리한 {features.length}개 구성{allFeatureParts.length > features.length ? ` · 전체 ${allFeatureParts.length}개 중 최대 7개만 표시` : ''}</p>{features.length ? features.map((feature) => <article key={feature.id} className="feature-row"><div><span>{feature.id}</span><div><strong>{feature.label}</strong><p>{feature.text}</p></div></div><label><span>검색 역할</span><select aria-label={`${feature.id} 검색 역할`} value={feature.role} onChange={(event) => onChangeRole(feature.id, event.target.value as SearchRole)}>{(['핵심 검색', '조합 검색', '일반 구성', '검색 제외', '확인 필요'] as SearchRole[]).map((role) => <option key={role}>{role}</option>)}</select></label></article>) : <EmptyState title="분석할 청구항이 없습니다." text="청구항 데이터가 수신되면 구성 분석을 시작할 수 있습니다." action="원문 확인"/>}</section>
      </section>
    </div>
    <div className="work-actions"><span>{ai ? 'AI 기술요약 생성됨' : 'AI 기술요약 미생성'}</span><button className="exam-primary" type="button" onClick={onNext}>{mode === 'response' ? '중간서류 검토 정리' : '검색전략 작성'} →</button></div>
  </>;
}
function TechnicalAiBrief({ summary }: { summary: ExaminationSummary }) {
  return <section className="technical-ai-brief"><header><span>AI 기술요약</span><p>{summary.oneLine}</p></header><div className="technical-summary-grid"><section><h3>과제</h3><p>{summary.technicalProblem}</p></section><section><h3>해결수단</h3><p>{summary.solution}</p></section><section><h3>청구항 핵심</h3><p>{summary.claimOverview}</p></section></div><footer className="technical-ai-points"><section><h3>핵심 구성</h3><ul className="technical-tags">{summary.keyElements.slice(0, 5).map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul></section><section><h3>기술적 효과</h3><ul>{summary.effects.slice(0, 3).map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul></section><section><h3>검색·대조 포인트</h3><ul>{summary.examinationPoints.slice(0, 3).map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul></section></footer>{summary.cautions.length > 0 && <details><summary>주의사항 {summary.cautions.length}건</summary><ul>{summary.cautions.slice(0, 3).map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul></details>}</section>;
}
function ResponseReviewView({ summary, claimChangeSummary, rounds, linkedChangeCount, onResponse, onTechnology, onAdditionalSearch }: { summary: ExaminationSummary | null; claimChangeSummary: ClaimChangeSummary | null; rounds: ExaminationRound<NoticeItem>[]; linkedChangeCount: number; onResponse: () => void; onTechnology: () => void; onAdditionalSearch: () => void }) {
  const recommendation = claimChangeSummary?.searchRecommendation;
  const recommendationLabel = recommendation ? ({ not_needed: '추가 검색 필요성 낮음', optional: '심사관 선택', recommended: '추가 검색 권장', insufficient: '판단 자료 부족' } satisfies Record<ClaimChangeSummary['searchRecommendation']['status'], string>)[recommendation.status] : '심사관 선택';
  return <>
    <PageHeading step="04" title="중간서류 검토 정리" description="발명의 핵심과 보정 영향을 함께 보고, 추가 검색 진행 여부를 심사관이 선택합니다." action={<span className="response-flow-complete">필수 검토 흐름</span>}/>
    <section className="response-review-lead"><span>현재 기술적 판단 기준</span><h2>{summary?.oneLine || 'AI 기술요약을 실행하면 발명의 핵심을 이 위치에서 함께 확인할 수 있습니다.'}</h2><dl><Data label="심사 회차" value={`${rounds.length}개`}/><Data label="연결된 보정" value={`${linkedChangeCount}건`}/><Data label="보정 영향 AI" value={claimChangeSummary ? '요약 생성됨' : '미생성'}/></dl></section>
    <div className="response-review-grid"><section><header><span>01</span><div><h3>기술 내용</h3><p>현재 청구항에서 파악된 발명의 중심</p></div></header>{summary ? <><strong>{summary.claimOverview}</strong><ul>{summary.keyElements.slice(0, 5).map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul></> : <p className="response-review-empty">기술내용 파악에서 AI 전문 요약을 실행하면 핵심 구성과 청구항 구조가 표시됩니다.</p>}<button type="button" onClick={onTechnology}>기술내용 다시 보기</button></section><section><header><span>02</span><div><h3>보정 영향</h3><p>보정 전후 문언에서 달라진 기술적 범위</p></div></header>{claimChangeSummary ? <><strong>{claimChangeSummary.oneLine}</strong><ul>{claimChangeSummary.importantChanges.slice(0, 5).map((item, index) => <li key={`${item.documentNumber}-${index}`}>청구항 {item.claimNumbers.join(', ')} · {item.text}</li>)}</ul></> : <p className="response-review-empty">통지·대응 분석에서 AI 보정 영향 요약을 실행하면 추가·삭제 한정이 표시됩니다.</p>}<button type="button" onClick={onResponse}>보정 원문 다시 보기</button></section></div>
    <section className={`optional-search-gate gate-${recommendation?.status ?? 'optional'}`}><div><small>선택 업무</small><h2>추가 검색을 진행하시겠습니까?</h2><span>{recommendationLabel}</span><p>{recommendation?.reason || '추가 검색은 중간서류 검토의 필수 단계가 아닙니다. 보정으로 새 검색대상이 생겼다고 판단한 경우에만 진행하세요.'}</p></div>{recommendation?.targetFeatures.length ? <section><h3>AI 제안 검색대상</h3><ul>{recommendation.targetFeatures.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul></section> : null}<footer><p>이 화면에서 멈춰도 중간서류 검토 흐름은 완료됩니다.</p><button className="exam-primary" type="button" onClick={onAdditionalSearch}>추가 검색전략 작성 →</button></footer></section>
  </>;
}
function StrategyView({ data, mode, features, approvedKeywords, suggestedKeywords, selectedDraftKeywords, claimChangeSummary, onToggleKeyword, onCopy, onNext }: { data: PatentCase; mode: WorkMode; features: ClaimFeature[]; approvedKeywords: string[]; suggestedKeywords: string[]; selectedDraftKeywords: string[]; claimChangeSummary: ClaimChangeSummary | null; onToggleKeyword: (keyword: string) => void; onCopy: () => void; onNext: () => void }) {
  const activeKeywords = [...new Set([...approvedKeywords, ...selectedDraftKeywords])];
  const groups = buildKeywordGroups(data, features, activeKeywords);
  const expression = buildSearchExpression(data, features, activeKeywords);
  return <>
    <PageHeading step={mode === 'response' ? '선택 01' : '03'} title={mode === 'response' ? '추가 검색전략' : '검색전략'} description="AI가 검색 방향과 용어를 제안하고, 심사관이 검색식에 포함할 항목을 직접 선택합니다." action={<span className="version-badge">저장 전 초안</span>}/>
    {mode === 'response' && <section className="optional-step-notice"><strong>선택 단계</strong><p>보정 후 추가 검색이 필요하다고 판단한 경우에만 진행합니다. 이 화면을 열었다고 검색이 자동 실행되지는 않습니다.</p></section>}
    <section className="strategy-ai-assist"><header><div><span>AI 생성 · 미확인</span><h2>검색전략 제안</h2><p>기술요약과 보정 영향에서 추출한 용어입니다. 선택한 항목만 현재 검색식 초안에 들어갑니다.</p></div><strong>{activeKeywords.length}개 반영</strong></header>{suggestedKeywords.length ? <div className="strategy-keyword-picks">{suggestedKeywords.map((keyword) => { const approved = approvedKeywords.includes(keyword); const selected = approved || selectedDraftKeywords.includes(keyword); return <button type="button" key={keyword} className={selected ? 'selected' : ''} aria-pressed={selected} disabled={approved} onClick={() => onToggleKeyword(keyword)}><span>{approved ? '확정' : selected ? '포함' : '제안'}</span>{keyword}</button>; })}</div> : <div className="strategy-ai-empty">AI 전문요약을 실행하면 발명의 명세서 용어·동의어와 보정 추가 구성을 제안합니다.</div>}{mode === 'response' && claimChangeSummary?.searchRecommendation.targetFeatures.length ? <div className="strategy-change-focus"><small>보정으로 달라진 검색 초점</small><ul>{claimChangeSummary.searchRecommendation.targetFeatures.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul></div> : null}</section>
    <section className="search-basis"><span>검색 기준일</span><strong>{data.applicationDate}</strong><p>{mode === 'response' ? '최초 출원일 이전 공개문헌을 기준으로 선택한 보정 추가 구성을 검색합니다.' : '기준일 이전 공개문헌만 적격 문헌으로 표시합니다.'}</p></section>
    <div className="strategy-layout"><aside className="strategy-targets"><h2>검색대상 구성</h2>{features.filter((feature) => !['일반 구성', '검색 제외'].includes(feature.role)).map((feature) => <div key={feature.id}><span>{feature.id}</span><strong>{feature.label}</strong><small>{feature.role}</small></div>)}</aside><section className="query-builder"><div className="section-title"><div><small>검색 개념군</small><h2>개념군 및 검색식</h2></div><button type="button" onClick={onCopy}>검색식 복사</button></div><div className="concept-groups">{groups.map((group, index) => <div key={group.name}><header><span>개념군 {String.fromCharCode(65 + index)}</span><strong>{group.name}</strong></header><div>{group.terms.map((term, termIndex) => <span key={`${term}-${termIndex}`}><b>{/[a-z]/i.test(term) ? 'EN' : 'KR'}</b>{term}</span>)}</div>{index < groups.length - 1 && <i>AND</i>}</div>)}</div><pre className="search-expression">{expression}</pre></section><aside className="strategy-info"><h2>전략 정보</h2><dl><Data label="검색 범위 예상" value="보통"/><Data label="AI 용어 반영" value={`${activeKeywords.length}개`}/><Data label="저장 상태" value="미저장 초안"/></dl><ul><li className="ok">✓ 심사관 선정 구성 포함</li><li className={activeKeywords.length ? 'ok' : 'warn'}>{activeKeywords.length ? '✓ 선택한 AI 제안 포함' : '! AI 제안 미선택'}</li><li className={data.cpc.length ? 'ok' : 'warn'}>{data.cpc.length ? '✓' : '!'} CPC 조건 {data.cpc.length ? '확인' : '미설정'}</li></ul></aside></div>
    <div className="work-actions"><button className="is-coming" type="button" disabled title="검색전략 버전 저장 API는 다음 구현 범위입니다.">전략 저장 · 준비 중</button><button className="exam-primary" type="button" onClick={onNext}>검색 연결 상태 확인 →</button></div>
  </>;
}
function PriorArtSearchView({ data, mode, expression, candidates, searchRan, onRun, onCopy, onCandidate, onOpenResource, onNext }: { data: PatentCase; mode: WorkMode; expression: string; candidates: Candidate[]; searchRan: boolean; onRun: () => void; onCopy: () => void; onCandidate: (candidate: Candidate) => void; onOpenResource: () => void; onNext: () => void }) {
  return <><PageHeading step={mode === 'response' ? '선택 02' : '04'} title="선행기술 검색" description="실검색 연동 전에는 사건별 검색식 복사와 데모 결과 확인만 제공합니다." action={<button className={data.isDemo ? 'exam-primary' : 'is-coming'} type="button" onClick={onRun} disabled={!data.isDemo} title={data.isDemo ? undefined : '실데이터 검색 API 연결 후 제공합니다.'}>{data.isDemo ? '데모 결과 보기' : '실검색 연동 준비 중'}</button>}/><section className="search-query-bar"><div><span>현재 사건 검색식</span><pre>{expression}</pre><small>{searchRan ? `결과 ${candidates.length}건 · 데모 결과` : data.isDemo ? '데모 결과를 실행할 수 있습니다.' : '실검색 API는 연결되지 않았습니다. 검색식을 복사해 외부 검색에서 사용하세요.'}</small></div><button type="button" onClick={onCopy}>검색식 복사</button><button className="is-coming" type="button" disabled>검색이력 · 준비 중</button></section><div className="prior-layout"><aside className="search-filters"><h2>검색 필터</h2><dl><Data label="기준일" value={data.applicationDate}/><Data label="국가" value="KR · US · EP · JP"/><Data label="주 CPC" value={data.cpc[0]?.number || '미설정'}/><Data label="검색 필드" value="명칭 · 초록 · 청구항"/></dl></aside><section className="search-results">{candidates.length ? candidates.map((candidate) => <CandidateCard key={candidate.id} candidate={candidate} onCandidate={() => onCandidate(candidate)} onOriginal={onOpenResource}/>) : <EmptyState title={data.isDemo ? '아직 데모 검색결과가 없습니다.' : '실데이터 검색 API가 연결되지 않았습니다.'} text={data.isDemo ? '데모 결과 보기를 눌러 후보문헌 화면을 확인하세요.' : '현재 사건에서 생성한 검색식을 복사할 수 있습니다. 후보문헌 직접 추가와 외부 결과 가져오기는 다음 구현 범위입니다.'} action={data.isDemo ? '데모 결과 보기' : '후보문헌 직접 추가 · 준비 중'} onAction={data.isDemo ? onRun : undefined} disabled={!data.isDemo}/>}</section><aside className="candidate-basket"><h2>후보문헌</h2><strong>{candidates.length}건</strong>{candidates.map((candidate) => <div key={candidate.id}><span className={candidate.role === 'D1 후보' ? 'd1' : candidate.role === 'D2 후보' ? 'd2' : 'hold'}>{candidate.role}</span><b>{candidate.country} {candidate.number}</b><small>구성 {candidate.matches.join(', ')}</small></div>)}<button className="exam-primary" type="button" disabled={!candidates.length} onClick={onNext}>후보문헌 검토 →</button></aside></div></>;
}
function CandidateCard({ candidate, onCandidate, onOriginal }: { candidate: Candidate; onCandidate: () => void; onOriginal: () => void }) { return <article className="candidate-card"><div className="candidate-thumb"><span>{candidate.country}</span><small>대표도면</small></div><div><header><span>{candidate.country}</span><strong>{candidate.number}</strong><em>{candidate.role}</em></header><h2>{candidate.title}</h2><dl><Data label="출원일" value={candidate.applicationDate}/><Data label="공개일" value={candidate.publicationDate}/><Data label="출원인" value={candidate.applicant}/></dl><div className="match-tags">{candidate.matches.map((match) => <span key={match}>{match} 일치</span>)}</div><div className="candidate-status"><span>구성 관련도 <b>{candidate.relevance}</b></span><span>문언 일치 <b>{candidate.wording}</b></span><span className={candidate.eligible ? 'eligible' : 'ineligible'}>기준일 {candidate.eligible ? '적격 확인' : '이후 공개'}</span></div><footer><button type="button" onClick={onOriginal}>원문 보기</button><button className="is-coming" type="button" disabled>병렬 비교 · 준비 중</button><button className="exam-primary" type="button" onClick={onCandidate}>후보 추가</button><button className="is-coming" type="button" disabled>제외 · 준비 중</button></footer><small className="mobile-coming-summary">추가 기능: 병렬 비교·제외 준비 중</small></div></article>; }
function CandidatesView({ data, mode, features, candidates, selectedCandidate, onSelect, onBack }: { data: PatentCase; mode: WorkMode; features: ClaimFeature[]; candidates: Candidate[]; selectedCandidate: string | null; onSelect: (id: string) => void; onBack: () => void }) {
  return <><PageHeading step={mode === 'response' ? '선택 03' : '05'} title="후보문헌" description="후보문헌이 청구항 구성을 얼마나 충족하는지 비교합니다."/>{candidates.length ? <><section className="coverage-table"><div className="coverage-row head"><strong>청구항 구성</strong>{candidates.map((candidate) => <span key={candidate.id}>{candidate.role}</span>)}</div>{features.slice(0, 6).map((feature) => <div className="coverage-row" key={feature.id}><strong>{feature.id} {feature.label}</strong>{candidates.map((candidate) => <span key={candidate.id} className={candidate.matches.includes(feature.id) ? 'direct' : 'none'}>{candidate.matches.includes(feature.id) ? '● 직접 후보' : '— 근거 없음'}</span>)}</div>)}</section><div className="candidate-tabs"><button className="active" type="button">전체 후보 {candidates.length}</button><button className="is-coming" type="button" disabled>주인용 후보 {candidates.filter((item) => item.role === 'D1 후보').length}</button><button className="is-coming" type="button" disabled>보조 후보 {candidates.filter((item) => item.role === 'D2 후보').length}</button><button className="is-coming" type="button" disabled>보류 {candidates.filter((item) => item.role === '보류').length}</button></div><section className="candidate-table"><div className="candidate-table-head"><span>문헌</span><span>기준일</span><span>대응 구성</span><span>검토상태</span><span>역할</span></div>{candidates.map((candidate) => <button className={selectedCandidate === candidate.id ? 'selected' : ''} type="button" key={candidate.id} onClick={() => onSelect(candidate.id)}><strong data-label="문헌">{candidate.country} {candidate.number}<small>{candidate.title}</small></strong><span data-label="기준일">{candidate.eligible ? '적격' : '부적격'}</span><span data-label="대응 구성">{candidate.matches.join(', ')}</span><span data-label="검토 상태">미검토</span><span data-label="역할">{candidate.role}</span></button>)}</section><p className="mobile-coming-summary">추가 기능: 후보 분류·증거리뷰 준비 중</p></> : <EmptyState title="아직 후보문헌이 없습니다." text="선행기술 검색에서 관련 문헌을 후보로 추가하면 이 화면에서 구성별로 비교할 수 있습니다." action="선행기술 검색으로 이동" onAction={onBack}/>}<div className="work-actions"><button type="button" onClick={onBack}>검색으로 돌아가기</button><span>선택 문헌 {candidates.length}건 · {data.isDemo ? '데모 후보' : '실데이터 후보'}</span><button className="is-coming" type="button" disabled title="EvidenceRef와 검토 상태 저장 기능 구현 후 제공합니다.">증거리뷰 · 준비 중</button></div></>;
}
function FutureView({ title, description, onBack }: { title: string; description: string; onBack: () => void }) { return <><PageHeading step="향후 구현" title={title} description={description}/><section className="future-state"><span>개발 예정</span><h2>검토 근거가 충분히 연결된 이후 구현합니다.</h2><p>현재 MVP에서는 사건 조회부터 후보문헌 비교까지의 작업 흐름을 먼저 제공합니다. 이 단계는 AI 제안과 심사관 확인을 명확히 분리하고, 확인된 근거만 다음 문서에 사용할 수 있도록 설계됩니다.</p><button type="button" onClick={onBack}>후보문헌으로 돌아가기</button></section></>; }
function ResourcePanel({ data, tab, selectedClaim, isMobile, onTab, onClose, onFullText, onNotice, onDrawing }: { data: PatentCase; tab: ResourceTab; selectedClaim: number; isMobile: boolean; onTab: (tab: ResourceTab) => void; onClose: () => void; onFullText: () => void; onNotice: (notice: NoticeItem) => void; onDrawing: () => void }) {
  const tabs: Array<[ResourceTab, string]> = [['biblio', '서지'], ['claims', '원문'], ['drawing', '도면'], ['history', '이력'], ['family', '패밀리'], ['documents', '문서']];
  const orderedHistory = [...data.history].sort((left, right) => digits(left.date).localeCompare(digits(right.date)) || left.documentNumber.localeCompare(right.documentNumber));
  const orderedNotices = [...data.notices].sort((left, right) => digits(left.date).localeCompare(digits(right.date)) || left.documentNumber.localeCompare(right.documentNumber));
  const panelRef = useModalBehavior<HTMLElement>(onClose, { lockScroll: isMobile });
  return <aside ref={panelRef} className="resource-panel" role={isMobile ? 'dialog' : 'complementary'} aria-modal={isMobile ? true : undefined} aria-label="사건자료" tabIndex={-1}><header><div><small>원문·이력·문서</small><h2>사건자료</h2></div><button type="button" onClick={onClose}>닫기 ×</button></header><nav>{tabs.map(([id, label]) => <button className={tab === id ? 'active' : ''} type="button" key={id} onClick={() => onTab(id)}>{label}</button>)}</nav><div className="resource-body">{tab === 'biblio' && <dl className="resource-dl"><Data label="출원번호" value={data.applicationNumber}/><Data label="출원일" value={data.applicationDate}/><Data label="공개번호" value={data.publicationNumber || '—'}/><Data label="출원인" value={data.applicant}/><Data label="심사청구일" value={data.examinationRequestDate}/><Data label="심사관" value={data.examinerName}/><Data label="주 CPC" value={data.cpc[0]?.number || '—'}/></dl>}{tab === 'claims' && <div className="resource-claims"><span>청구항 {selectedClaim}</span>{data.claims.map((claim) => <article className={claim.number === selectedClaim ? 'active' : ''} key={claim.number}><strong>청구항 {claim.number}</strong><p>{claim.text}</p></article>)}<button className="exam-secondary" type="button" onClick={onFullText}>전체 명세서·청구항 보기</button></div>}{tab === 'drawing' && <div className="resource-drawing">{data.drawing ? <button type="button" onClick={onDrawing}><img src={data.drawing.thumbnailUrl} alt={`${data.title} 대표도면`}/><span>대표도면 크게 보기</span></button> : <EmptyState title="대표도면이 없습니다." text="대표도면 API 응답이 없거나 아직 조회되지 않았습니다." action="확인"/>}</div>}{tab === 'history' && <div className="resource-history">{orderedHistory.map((item) => <article key={`${item.documentNumber}-${item.date}`}><time>{formatDate(item.date)}</time><strong>{item.title}</strong><small>{item.status}</small></article>)}</div>}{tab === 'family' && <div className="resource-family">{data.family.length ? data.family.map((item, index) => <article key={`${item.familyNumber}-${index}`}><span>{item.countryCode || '—'}</span><strong>{item.publicationNumber || item.literatureNumber || item.applicationNumber}</strong><small>{item.familyKind || item.literatureKind}</small></article>) : <EmptyState title="패밀리 없음" text="KIPRIS Plus API에서 조회된 패밀리 문헌이 없습니다." action="확인 완료"/>}</div>}{tab === 'documents' && <div className="resource-documents"><button type="button" onClick={onFullText}><span>XML</span><strong>전체 명세서·청구항</strong><small>{data.fullText?.fileName || '전문파일정보에서 조회'}</small></button>{orderedNotices.map((notice) => <button type="button" key={notice.documentNumber} onClick={() => onNotice(notice)}><span>PDF</span><strong>의견제출통지서</strong><small>{formatDate(notice.date)} · PDF_V2</small></button>)}</div>}</div></aside>;
}
function Data({ label, value, link }: { label: string; value: string; link?: string }) { return <div><dt>{label}</dt><dd>{link ? <a href={link} target="_blank" rel="noreferrer">{value} ↗</a> : value || '—'}</dd></div>; }
function EmptyState({ title, text, action, onAction, disabled = false }: { title: string; text: string; action: string; onAction?: () => void; disabled?: boolean }) { return <div className="exam-empty"><span>○</span><h2>{title}</h2><p>{text}</p><button className={disabled ? 'is-coming' : ''} type="button" onClick={onAction} disabled={disabled}>{action}</button></div>; }
function LoadingOverlay({ message }: { message: string }) { return <div className="exam-loading" role="status" aria-live="polite"><section><span>사건자료 조회</span><div className="loading-spinner" aria-hidden="true"/><h2>{message}</h2><p>완료된 데이터가 도착하면 화면을 갱신합니다. AI 분석은 자동으로 실행하지 않습니다.</p></section></div>; }
function DrawingDialog({ data, onClose }: { data: PatentCase; onClose: () => void }) { const dialogRef = useModalBehavior<HTMLElement>(onClose); return <div className="exam-dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section ref={dialogRef} className="exam-dialog drawing" role="dialog" aria-modal="true" aria-label="대표도면" tabIndex={-1}><header><div><small>대표도면</small><h2>{data.title} · 대표도면</h2></div><button type="button" onClick={onClose}>닫기 ×</button></header><div>{data.drawing ? <img src={data.drawing.largeUrl} alt={`${data.title} 대표도면 확대`}/> : <p>대표도면이 없습니다.</p>}</div></section></div>; }
function buildKeywordGroups(data: PatentCase, features: ClaimFeature[], aiKeywords: string[]) { const titleTerms = [data.title, data.titleEnglish].filter(Boolean); const fallbackTerms = titleTerms.length ? titleTerms : [data.applicationNumber]; const featureTerms = features.filter((feature) => feature.role !== '검색 제외').slice(0, 3).map((feature) => feature.label.replace('…', '')).filter(Boolean); const ai = aiKeywords.slice(0, 6).filter(Boolean); return [{ name: '적용 대상', terms: fallbackTerms }, { name: '핵심 구성', terms: featureTerms.length ? featureTerms : fallbackTerms.slice(0, 1) }, ...(ai.length ? [{ name: '선택한 AI 용어', terms: ai }] : [])]; }
function buildSearchExpression(data: PatentCase, features: ClaimFeature[], aiKeywords: string[]) { const groups = buildKeywordGroups(data, features, aiKeywords); return groups.map((group, index) => `(G${index + 1}=(${group.terms.join(' OR ')}))`).join('\nAND\n') + (data.cpc[0] ? `\nAND\n(CPC=${data.cpc[0].number.replace(/\s+/g, '')})` : ''); }
