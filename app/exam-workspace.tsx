'use client';
/* eslint-disable @next/next/no-img-element */

import { FormEvent, useCallback, useEffect, useState } from 'react';
import demoFullText from '@/app/data/demo-fulltext.json';
import {
  analyzeClaims,
  buildExaminationRounds,
  classifyCaseLifecycle,
  type CaseLifecycle,
  type ClaimAnalysis,
  type ExaminationRound,
} from '@/app/lib/examination-model';
import NoticeDialog from '@/app/notice-dialog';

type WorkMode = 'initial' | 'response';
type WorkView = 'overview' | 'response-analysis' | 'technology' | 'strategy' | 'search' | 'candidates' | 'evidence' | 'notice-draft';
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
type SummaryPayload = { summary: ExaminationSummary | null; model?: string; version?: string; cached: boolean; generatedAt?: string };
type PatentCase = {
  applicationNumber: string; applicationNumberRaw: string; title: string; titleEnglish: string; status: string; updatedAt: string;
  applicant: string; applicantCountry: string; applicationDate: string; publicationNumber: string; publicationDate: string;
  registrationNumber: string; registrationDate: string; registrationStatus: string; examinationRequestDate: string; examinerName: string;
  claimCount: number; inventorCount: number; abstract: string; ipc: CodeItem[]; cpc: CodeItem[]; claims: Claim[]; family: FamilyItem[];
  history: HistoryItem[]; notices: NoticeItem[]; drawing: { fileName: string; thumbnailUrl: string; largeUrl: string } | null;
  fullText: { fileName: string; fileUrl: string } | null; sources: SourceStatus[]; isDemo: boolean;
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
  sources: [{ name: 'bibliography', ok: true, message: '서지·행정처리 반영' }, { name: 'cpc', ok: true, message: 'CPC정보 반영' }, { name: 'drawing', ok: true, message: '대표도면 확인' }, { name: 'family', ok: true, message: '패밀리 없음' }], isDemo: true,
};
const demoCandidates: Candidate[] = [
  { id: 'd1', country: 'KR', number: '10-2018-0012345', title: '드럼 내부 상태를 측정하는 이동식 센서 장치', applicationDate: '2016.03.12.', publicationDate: '2018.02.01.', applicant: 'ABC Electronics', relevance: '높음', wording: '직접', eligible: true, matches: ['1D', '1E'], role: 'D1 후보' },
  { id: 'd2', country: 'JP', number: '2017-123456', title: '세탁 장치용 분리식 센서 홀더', applicationDate: '2016.01.19.', publicationDate: '2017.08.03.', applicant: 'Example Industries', relevance: '보통', wording: '유사', eligible: true, matches: ['1E', '2A'], role: 'D2 후보' },
  { id: 'd3', country: 'US', number: '2019/0001234', title: 'Wireless sensing module for laundry appliances', applicationDate: '2018.07.02.', publicationDate: '2021.04.12.', applicant: 'Sample Appliance Corp.', relevance: '보통', wording: '미확인', eligible: false, matches: ['1D'], role: '보류' },
];
const initialSteps = [
  ['overview', '사건 개요'], ['technology', '기술내용 파악'], ['strategy', '검색전략'], ['search', '선행기술 검색'], ['candidates', '후보문헌'], ['evidence', '증거리뷰', 'future'], ['notice-draft', '통지서 작성', 'future'],
] as const;
const responseSteps = [
  ['overview', '사건 개요'], ['response-analysis', '통지·대응 분석'], ['technology', '기술내용 파악'], ['strategy', '추가 검색전략'], ['search', '선행기술 검색'], ['candidates', '후보문헌'], ['evidence', '증거리뷰', 'future'], ['notice-draft', '통지서 작성', 'future'],
] as const;

function digits(value: string) { return value.replace(/\D/g, ''); }
function formatApplicationNumber(value: string) { const number = digits(value); return number.length === 13 ? `${number.slice(0, 2)}-${number.slice(2, 6)}-${number.slice(6)}` : value; }
function formatDate(value: string) { const number = digits(value); return number.length === 8 ? `${number.slice(0, 4)}.${number.slice(4, 6)}.${number.slice(6)}.` : value || '—'; }
function cpcUrl(code: string) { return `https://cls.kipro.or.kr/classification/cpc/search?code=${code.replace(/\s+/g, '')}`; }
function mapLiveCase(payload: LivePayload): PatentCase {
  const b = payload.bibliography; const applicant = b?.applicants?.[0];
  return { applicationNumber: formatApplicationNumber(b?.applicationNumber || payload.applicationNumber), applicationNumberRaw: payload.applicationNumber, title: b?.title || '발명의 명칭 미수신', titleEnglish: b?.titleEnglish || '', status: b?.finalDisposal || b?.registrationStatus || '심사 진행', updatedAt: new Date(payload.fetchedAt).toLocaleString('ko-KR'), applicant: applicant?.name || '출원인 미수신', applicantCountry: applicant?.country || '', applicationDate: formatDate(b?.applicationDate || ''), publicationNumber: b?.publicationNumber || '', publicationDate: formatDate(b?.publicationDate || ''), registrationNumber: b?.registrationNumber || '', registrationDate: formatDate(b?.registrationDate || ''), registrationStatus: b?.registrationStatus || '', examinationRequestDate: formatDate(b?.examinationRequestDate || ''), examinerName: b?.examinerName || '—', claimCount: b?.claimCount || b?.claims.length || 0, inventorCount: b?.inventors.length || 0, abstract: b?.abstract || '초록 데이터가 없습니다.', ipc: b?.ipc || [], cpc: payload.cpc || [], claims: b?.claims || [], family: payload.family || [], history: payload.history || [], notices: payload.notices || [], drawing: payload.drawing, fullText: payload.fullText, sources: payload.sources || [], isDemo: false };
}
const WORKSPACE_STORAGE_KEY = 'patent-exam-workspace:last-case-v1';
const AI_SUMMARY_VERSION = 'fulltext-summary-2026-08-28-v2';
function readStoredWorkspace() {
  try {
    const raw = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as StoredWorkspace;
    return (stored.version === 1 || stored.version === 2) && stored.data?.applicationNumberRaw ? stored : null;
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
async function requestPatentCase(applicationNumber: string) {
  if (applicationNumber === demoCase.applicationNumberRaw) return { data: demoCase, usage: null };
  const response = await fetch(`/api/patent?applicationNumber=${encodeURIComponent(applicationNumber)}`);
  const payload = (await response.json()) as LivePayload & { error?: string };
  if (!response.ok) throw new Error(payload.error || '사건 조회에 실패했습니다.');
  return { data: mapLiveCase(payload), usage: payload.usage };
}
function featureRows(claim: Claim | undefined): ClaimFeature[] {
  if (!claim) return [];
  const parts = claim.text.replace(/\n/g, ' ').split(/;| 및 |, 상기 /).map((part) => part.trim().replace(/^상기 /, '')).filter((part) => part.length > 8).slice(0, 7);
  return parts.map((text, index) => ({ id: `${claim.number}${String.fromCharCode(65 + index)}`, label: text.length > 30 ? `${text.slice(0, 30)}…` : text, text, role: index < 3 ? '일반 구성' : index === parts.length - 1 ? '핵심 검색' : '조합 검색' }));
}
async function fetchUsage() { const response = await fetch('/api/patent/usage', { cache: 'no-store' }); if (!response.ok) throw new Error('사용량 조회 실패'); return (await response.json()) as ApiUsage; }

export default function ExamWorkspace() {
  const [data, setData] = useState<PatentCase>(demoCase); const [query, setQuery] = useState(demoCase.applicationNumber); const [mode, setMode] = useState<WorkMode>('initial'); const [view, setView] = useState<WorkView>('overview');
  const [resourceOpen, setResourceOpen] = useState(false); const [resourceTab, setResourceTab] = useState<ResourceTab>('biblio'); const [loading, setLoading] = useState(false); const [loadStage, setLoadStage] = useState(0); const [toast, setToast] = useState(''); const [usage, setUsage] = useState<ApiUsage | null>(null);
  const [summary, setSummary] = useState<SummaryPayload | null>(null); const [summaryBusy, setSummaryBusy] = useState(false); const [summaryError, setSummaryError] = useState(''); const [selectedClaim, setSelectedClaim] = useState(1); const [features, setFeatures] = useState<ClaimFeature[]>(featureRows(demoCase.claims[0]));
  const [searchRan, setSearchRan] = useState(false); const [candidates, setCandidates] = useState<Candidate[]>([]); const [selectedCandidate, setSelectedCandidate] = useState<string | null>(null); const [selectedNotice, setSelectedNotice] = useState<NoticeItem | null>(null); const [drawingOpen, setDrawingOpen] = useState(false); const [packageBusy, setPackageBusy] = useState(false); const [restoring, setRestoring] = useState(true);
  const loadSummary = useCallback(async (applicationNumber: string, force = false) => {
    setSummaryBusy(true); setSummaryError('');
    try {
      if (!force) {
        const cachedResponse = await fetch(`/api/patent/summary?${new URLSearchParams({ applicationNumber })}`, { cache: 'no-store' });
        const cachedPayload = (await cachedResponse.json()) as SummaryPayload & { error?: string };
        if (!cachedResponse.ok) throw new Error(cachedPayload.error || 'AI 분석 캐시를 확인하지 못했습니다.');
        if (cachedPayload.summary) { setSummary(cachedPayload); writeStoredSummary(applicationNumber, cachedPayload); return; }
      }

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
      setSummary(payload); writeStoredSummary(applicationNumber, payload);
    } catch (error) { setSummaryError(error instanceof Error ? error.message : 'AI 분석을 불러오지 못했습니다.'); }
    finally { setSummaryBusy(false); }
  }, []);
  const claimAnalysis = analyzeClaims(data.claims);
  const examinationRounds = buildExaminationRounds<NoticeItem>(data.history, data.notices);
  const lifecycle = classifyCaseLifecycle(data);
  const steps = mode === 'response' ? responseSteps : initialSteps; const activeIndex = Math.max(0, steps.findIndex((step) => step[0] === view)); const currentClaim = data.claims.find((claim) => claim.number === selectedClaim) || data.claims[0]; const amendment = examinationRounds.flatMap((round) => round.amendments).at(-1);
  const targetLabel = mode === 'response' && amendment ? `${formatDate(amendment.date)} 보정 청구항 1~${data.claimCount}` : `현재 출원 청구항 1~${data.claimCount}`;
  const sourceOk = data.sources.filter((source) => source.ok).length; const familyCountries = new Set(data.family.map((item) => item.countryCode).filter(Boolean)).size; const independentClaims = claimAnalysis.filter((claim) => claim.isIndependent);
  const searchExpression = buildSearchExpression(data, features, summary?.summary?.searchKeywords || []);
  const nextStep = steps[activeIndex + 1]; const nextStepUnavailable = Boolean(nextStep?.[2]);
  useEffect(() => {
    let cancelled = false;
    const requested = digits(new URLSearchParams(window.location.search).get('applicationNumber') || '');
    const stored = readStoredWorkspace();
    if (stored && (!requested || requested === stored.data.applicationNumberRaw)) {
      window.queueMicrotask(() => {
        if (cancelled) return;
        const restoredSummary = stored.summary?.version === AI_SUMMARY_VERSION ? stored.summary : null;
        setData(stored.data); setQuery(stored.data.applicationNumber); setMode(stored.mode ?? 'initial'); setView('overview'); setSelectedClaim(stored.data.claims[0]?.number || 1); setFeatures(featureRows(stored.data.claims[0])); setSummary(restoredSummary); setRestoring(false);
        if (!stored.data.isDemo && !restoredSummary?.summary) void loadSummary(stored.data.applicationNumberRaw);
      });
      return () => { cancelled = true; };
    }
    if (!/^(10|20)\d{11}$/.test(requested)) { window.queueMicrotask(() => { if (!cancelled) setRestoring(false); }); return () => { cancelled = true; }; }
    void requestPatentCase(requested).then(({ data: restoredData, usage: restoredUsage }) => {
      if (cancelled) return;
      setData(restoredData); setQuery(restoredData.applicationNumber); setMode('initial'); setView('overview'); setSelectedClaim(restoredData.claims[0]?.number || 1); setFeatures(featureRows(restoredData.claims[0])); if (restoredUsage) setUsage(restoredUsage); writeStoredWorkspace(restoredData, null, 'initial'); syncCaseUrl(restoredData.applicationNumberRaw);
      if (!restoredData.isDemo) void loadSummary(restoredData.applicationNumberRaw);
    }).catch((error) => { if (!cancelled) setToast(error instanceof Error ? error.message : '이전 사건을 불러오지 못했습니다.'); }).finally(() => { if (!cancelled) setRestoring(false); });
    return () => { cancelled = true; };
  }, [loadSummary]);
  useEffect(() => { void fetchUsage().then(setUsage).catch(() => undefined); }, []);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 3200); return () => window.clearTimeout(timer); }, [toast]);
  function go(next: WorkView) { setView(next); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function selectMode(next: WorkMode) { setMode(next); setView('overview'); writeStoredWorkspace(data, summary, next); }
  function openResource(tab: ResourceTab) { setResourceTab(tab); setResourceOpen(true); }
  async function copyText(value: string, label: string) { try { await navigator.clipboard.writeText(value); setToast(`${label}을 복사했습니다.`); } catch { setToast(`${label}을 복사하지 못했습니다.`); } }
  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const normalized = digits(query); if (!/^(10|20)\d{11}$/.test(normalized)) { setToast('특허·실용신안 출원번호 13자리를 확인해 주세요.'); return; }
    setLoading(true); setLoadStage(0); const timer = window.setInterval(() => setLoadStage((current) => Math.min(current + 1, 4)), 420);
    try { const { data: nextData, usage: nextUsage } = await requestPatentCase(normalized); if (nextUsage) setUsage(nextUsage);
      setData(nextData); setQuery(nextData.applicationNumber); setMode('initial'); setView('overview'); setSelectedClaim(nextData.claims[0]?.number || 1); setFeatures(featureRows(nextData.claims[0])); setSummary(null); setSearchRan(false); setCandidates([]); writeStoredWorkspace(nextData, null, 'initial'); syncCaseUrl(nextData.applicationNumberRaw); if (!nextData.isDemo) void loadSummary(nextData.applicationNumberRaw); setToast('사건을 불러왔습니다. 작업 관점을 선택해 검토를 시작하세요.');
    } catch (error) { setToast(error instanceof Error ? error.message : '사건 조회에 실패했습니다.'); } finally { window.clearInterval(timer); setLoadStage(4); setLoading(false); }
  }
  async function downloadPackage() {
    setPackageBusy(true); try { const { default: JSZip } = await import('jszip'); const zip = new JSZip(); zip.file('01_사건개요.json', JSON.stringify({ workMode: mode, lifecycle, targetLabel, data, aiSummary: summary?.summary ?? null }, null, 2)); zip.file('02_청구항구조.json', JSON.stringify(claimAnalysis, null, 2)); zip.file('03_심사회차.json', JSON.stringify(examinationRounds, null, 2)); zip.file('04_검색대상구성.json', JSON.stringify(features, null, 2)); zip.file('05_검색전략.txt', searchExpression); zip.file('06_후보문헌.json', JSON.stringify(candidates, null, 2)); const blob = await zip.generateAsync({ type: 'blob' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `심사자료_${data.applicationNumberRaw}.zip`; anchor.click(); URL.revokeObjectURL(url); setToast('사건 상태·청구항 구조·심사 회차를 포함한 ZIP을 만들었습니다.'); } finally { setPackageBusy(false); }
  }
  function runSearch() { setSearchRan(true); if (data.isDemo) { setCandidates(demoCandidates); setToast('데모 검색결과 3건을 불러왔습니다.'); } else { setCandidates([]); setToast('실데이터 검색 API는 다음 연동 단계에서 연결합니다.'); } }
  function pdfUrl(notice: NoticeItem) { return `/api/patent/pdf?${new URLSearchParams({ applicationNumber: data.applicationNumberRaw, sendNumber: notice.documentNumber })}`; }

  if (restoring) return <div className="exam-app"><div className="exam-loading" role="status"><section><span>RESTORING WORKSPACE</span><h2>이전에 보던 심사 사건을 불러오는 중입니다.</h2></section></div></div>;

  return <div className={`exam-app mode-${mode}`}>
    <a className="skip-link" href="#exam-main">본문 바로가기</a><div className="exam-govbar"><span aria-hidden="true" /> 대한민국 디지털 정부 디자인 시스템(KRDS)을 참고한 특허심사 지원 도구입니다.</div>
    <header className="exam-header"><button className="exam-brand" type="button" onClick={() => go('overview')}><span aria-hidden="true">특허</span><strong>특허심사 지원서비스</strong><small>KIPRIS Plus 연계 · 심사데스크</small></button><form className="exam-search" onSubmit={handleSearch}><label htmlFor="case-search">출원번호 검색</label><input id="case-search" value={query} onChange={(event) => setQuery(event.target.value)} inputMode="numeric" placeholder="출원번호 13자리 입력"/><button type="submit">검색</button></form><div className="exam-header-actions"><span className="exam-usage">외부 API <strong>{usage?.total ?? '—'}</strong>회</span><button className="exam-secondary" type="button" onClick={() => openResource('biblio')}>사건자료</button><button className="exam-primary" type="button" onClick={downloadPackage} disabled={packageBusy}>{packageBusy ? '정리 중…' : '심사자료 내려받기'}</button></div></header>
    <div className="exam-modebar" aria-label="현재 사건 정보"><div><span className="mode-badge">{mode === 'response' ? '중간서류 검토' : '심사 착수'}</span><strong>{data.applicationNumber}</strong><span>{data.title}</span></div><div className={`case-lifecycle ${lifecycle.tone}`} title={lifecycle.reason}><small>사건 현재 상태</small><strong>{lifecycle.label}</strong><span>{lifecycle.reason}</span></div><div><small>현재 심사대상</small><strong>{targetLabel}</strong></div><div><small>데이터 기준</small><span>{data.isDemo ? '데모 데이터' : `KIPRIS Plus · ${data.updatedAt}`}</span></div><div className="mode-switch" aria-label="사용자 작업 관점"><button aria-pressed={mode === 'initial'} className={mode === 'initial' ? 'active' : ''} type="button" onClick={() => selectMode('initial')}>착수</button><button aria-pressed={mode === 'response'} className={mode === 'response' ? 'active' : ''} type="button" onClick={() => selectMode('response')}>중간서류</button></div></div>
    <div className={`exam-frame ${resourceOpen ? 'resource-visible' : ''}`}><aside className="exam-sidebar"><p>심사 업무 단계</p><nav aria-label="심사 업무 단계">{steps.map((step, index) => { const unavailable = Boolean(step[2]); const state = step[0] === view ? 'active' : index < activeIndex ? 'done' : 'idle'; return <button key={step[0]} className={`${state}${unavailable ? ' is-coming' : ''}`} type="button" aria-current={state === 'active' ? 'step' : undefined} disabled={unavailable} title={unavailable ? '공통 근거 구조 완성 후 제공할 기능입니다.' : undefined} onClick={() => go(step[0])}><span>{state === 'done' ? '✓' : String(index + 1)}</span><strong>{step[1]}</strong>{unavailable && <small>준비 중</small>}</button>; })}</nav><div className="exam-source-state"><span className={data.isDemo ? 'demo' : ''}/><strong>{data.isDemo ? '데모 사건' : 'KIPRIS Plus 연결'}</strong><small>{sourceOk}/{data.sources.length}개 데이터 소스 정상</small></div></aside>
      <main className="exam-main" id="exam-main" tabIndex={-1}>
        {view === 'overview' && <OverviewView data={data} mode={mode} lifecycle={lifecycle} rounds={examinationRounds} targetLabel={targetLabel} familyCountries={familyCountries} independentCount={independentClaims.length} onNext={() => go(mode === 'response' ? 'response-analysis' : 'technology')} onResource={openResource}/>}
        {view === 'response-analysis' && <ResponseAnalysisView rounds={examinationRounds} onNotice={setSelectedNotice} onNext={() => go('technology')}/>}
        {view === 'technology' && <TechnologyView data={data} mode={mode} claimAnalysis={claimAnalysis} selectedClaim={selectedClaim} features={features} summary={summary} summaryBusy={summaryBusy} summaryError={summaryError} onSelectClaim={(number) => { setSelectedClaim(number); setFeatures(featureRows(data.claims.find((claim) => claim.number === number))); openResource('claims'); }} onChangeRole={(id, role) => setFeatures((current) => current.map((feature) => feature.id === id ? { ...feature, role } : feature))} onEvidence={() => openResource('claims')} onAnalyze={() => data.isDemo ? setToast('데모 사건은 기존 분석 시안을 사용합니다.') : void loadSummary(data.applicationNumberRaw, true)} onNext={() => go('strategy')}/>}
        {view === 'strategy' && <StrategyView data={data} mode={mode} features={features} summary={summary?.summary ?? null} onCopy={() => void copyText(searchExpression, '검색식')} onNext={() => go('search')}/>}
        {view === 'search' && <PriorArtSearchView data={data} expression={searchExpression} candidates={candidates} searchRan={searchRan} onRun={runSearch} onCopy={() => void copyText(searchExpression, '검색식')} onCandidate={(candidate) => { setSelectedCandidate(candidate.id); setCandidates((current) => current.map((item) => item.id === candidate.id && item.role === '보류' ? { ...item, role: 'D2 후보' } : item)); }} onOpenResource={() => openResource('documents')} onNext={() => go('candidates')}/>}
        {view === 'candidates' && <CandidatesView data={data} features={features} candidates={candidates} selectedCandidate={selectedCandidate} onSelect={setSelectedCandidate} onBack={() => go('search')}/>}
        {(view === 'evidence' || view === 'notice-draft') && <FutureView title={view === 'evidence' ? '증거리뷰' : '통지서 작성'} description={view === 'evidence' ? '청구항 구성과 인용문헌 원문 근거를 심사관이 확정하는 화면입니다.' : '확인된 근거만 사용해 문단 단위로 통지서를 작성하는 화면입니다.'} onBack={() => go('candidates')}/>}
      </main>
      {resourceOpen && <ResourcePanel data={data} tab={resourceTab} selectedClaim={currentClaim?.number || 1} onTab={setResourceTab} onClose={() => setResourceOpen(false)} onFullText={() => window.location.assign(`/fulltext?applicationNumber=${encodeURIComponent(data.applicationNumberRaw)}`)} onNotice={setSelectedNotice} onDrawing={() => setDrawingOpen(true)}/>}</div>
    <footer className="exam-step-footer"><button type="button" disabled={activeIndex === 0} onClick={() => go(steps[Math.max(0, activeIndex - 1)][0])}>← 이전 단계</button><span>작업 관점·최근 사건 저장됨 · 이 브라우저</span><button className={nextStepUnavailable ? 'is-coming' : 'exam-primary'} type="button" disabled={!nextStep || nextStepUnavailable} title={nextStepUnavailable ? `${nextStep?.[1]} 기능은 준비 중입니다.` : undefined} onClick={() => nextStep && go(nextStep[0])}>{nextStepUnavailable ? `${nextStep?.[1]} · 준비 중` : '다음 단계 →'}</button></footer>
    {loading && <LoadingOverlay stage={loadStage}/>} {toast && <div className="exam-toast" role="status">{toast}</div>} {selectedNotice && <NoticeDialog applicationNumber={data.applicationNumberRaw} notice={selectedNotice} pdfUrl={pdfUrl(selectedNotice)} onClose={() => setSelectedNotice(null)}/>} {drawingOpen && <DrawingDialog data={data} onClose={() => setDrawingOpen(false)}/>}</div>;
}

function PageHeading({ step, title, description, action }: { step: string; title: string; description: string; action?: React.ReactNode }) { return <header className="work-heading"><div><span>{/^\d+$/.test(step) ? `단계 ${Number(step)}` : step}</span><h1>{title}</h1><p>{description}</p></div>{action}</header>; }
function OverviewView({ data, mode, lifecycle, rounds, targetLabel, familyCountries, independentCount, onNext, onResource }: { data: PatentCase; mode: WorkMode; lifecycle: CaseLifecycle; rounds: ExaminationRound<NoticeItem>[]; targetLabel: string; familyCountries: number; independentCount: number; onNext: () => void; onResource: (tab: ResourceTab) => void }) {
  const latestNotice = rounds.at(-1)?.notice;
  return <>
    <PageHeading step="01" title="사건 개요" description="사건의 현재 상태와 사용자가 선택한 작업 관점을 구분해 확인합니다." action={<span className={`mode-card ${mode}`}>{mode === 'response' ? '중간서류 검토' : '착수 준비'}</span>}/>
    <section className="overview-summary"><div><small>현재 심사대상</small><strong>{targetLabel}</strong><span>{lifecycle.label} · {data.applicant}</span></div><button type="button" onClick={() => onResource('claims')}>현재 청구항 원문 보기</button></section>
    <div className="overview-grid">
      <section className="work-card"><h2>사건 핵심정보</h2><dl className="key-dl"><Data label="출원일" value={data.applicationDate}/><Data label="공개일" value={data.publicationDate}/><Data label="심사청구일" value={data.examinationRequestDate}/><Data label="청구항" value={`${data.claimCount}개 · 독립항 ${independentCount}개`}/><Data label="주 CPC" value={data.cpc[0]?.number || '정보 없음'} link={data.cpc[0] ? cpcUrl(data.cpc[0].number) : undefined}/><Data label="출원인" value={data.applicant}/></dl></section>
      <section className="work-card readiness"><h2>{mode === 'response' ? '중간서류 검토 준비' : '착수 준비'}</h2><ul><li className="ok">✓ 서지정보 확보</li><li className="ok">✓ 청구항 데이터 확보</li><li className={data.drawing ? 'ok' : 'warn'}>{data.drawing ? '✓' : '!'} 대표도면 {data.drawing ? '확보' : '확인 필요'}</li><li className="ok">✓ 사건 상태 분리 · {lifecycle.label}</li><li className={data.family.length ? 'warn' : 'ok'}>{data.family.length ? '!' : '✓'} {data.family.length ? `패밀리 ${familyCountries}개 관할청 확인 필요` : '패밀리 없음'}</li></ul><p className="lifecycle-reason">{lifecycle.reason}</p></section>
    </div>
    {mode === 'response' && <section className="work-card rounds"><div className="section-title"><div><small>EXAMINATION ROUNDS</small><h2>심사 회차</h2></div><button type="button" onClick={() => onResource('history')}>전체 이력 보기</button></div><div className="round-list">{rounds.length ? rounds.map((round) => <article key={round.notice.documentNumber}><span>{round.number}</span><div><strong>{round.number}차 통지 · {formatDate(round.notice.date)}</strong><p>{round.notice.title} · {round.notice.status}</p><div className="round-docs">{round.opinions.map((item) => <small key={item.documentNumber}>의견서 {formatDate(item.date)}</small>)}{round.amendments.map((item) => <small key={item.documentNumber}>보정서 {formatDate(item.date)}</small>)}{round.decisions.map((item) => <small key={item.documentNumber}>후속 결정 {formatDate(item.date)}</small>)}</div><small className={`connection-status ${round.connectionStatus}`}>{round.connectionStatus === 'linked' ? '문서 연결됨' : '연결 확인 필요'} · {round.connectionReason}</small></div></article>) : <EmptyState title="확인된 심사 회차가 없습니다." text="의견제출통지서가 확인되면 통지일 오름차순으로 회차를 구성합니다." action="전체 이력 확인" onAction={() => onResource('history')}/>}</div></section>}
    <section className="next-work"><div><small>다음 작업</small><h2>{mode === 'response' ? '통지 내용과 대응서류의 연결 상태를 확인하세요.' : '청구항 인용관계를 확인하고 검색 대상 구성을 선정하세요.'}</h2><p>{latestNotice ? `최근 통지 ${formatDate(latestNotice.date)} · ${latestNotice.documentNumber}` : '확인된 의견제출통지서가 없습니다.'}</p></div><button className="exam-primary" type="button" onClick={onNext}>{mode === 'response' ? '통지·대응 분석' : '기술내용 파악'} →</button></section>
  </>;
}
function ResponseAnalysisView({ rounds, onNotice, onNext }: { rounds: ExaminationRound<NoticeItem>[]; onNotice: (notice: NoticeItem) => void; onNext: () => void }) {
  const needsConfirmation = rounds.filter((round) => round.connectionStatus === 'needs_confirmation').length;
  return <>
    <PageHeading step="02" title="통지·대응 분석" description="문서일자와 종류를 기준으로 회차를 구성하며, 모호한 연결은 자동 확정하지 않습니다."/>
    <div className="round-tabs">{rounds.map((round, index) => <button className={index === rounds.length - 1 ? 'active' : ''} type="button" key={round.notice.documentNumber}>{round.number}차 통지 {formatDate(round.notice.date)}</button>)}<button className="is-coming" type="button" disabled>전체 이력 분석 · 준비 중</button></div>
    <section className="issue-table"><div className="issue-head"><span>통지 내용</span><span>출원인 대응</span><span>보정 내용</span><span>연결 상태</span></div>{rounds.length ? rounds.map((round) => <article key={round.notice.documentNumber}><div className="notice-col"><b>{round.number}차 심사 회차</b><strong>{round.notice.title}</strong><span>발송 {formatDate(round.notice.date)}</span><button type="button" onClick={() => onNotice(round.notice)}>통지서 원문 확인</button></div><div className="argument-col"><b>{round.opinions.length ? `의견서 ${round.opinions.length}건` : '의견서 확인 필요'}</b>{round.opinions.length ? round.opinions.map((item) => <p key={item.documentNumber}>{formatDate(item.date)} · {item.title}</p>) : <p>이 회차 범위에서 연결할 의견서를 확인하지 못했습니다.</p>}</div><div className="amend-col"><b>{round.amendments.length ? `보정서 ${round.amendments.length}건` : '보정 없음'}</b>{round.amendments.length ? round.amendments.map((item) => <p key={item.documentNumber}>{formatDate(item.date)} · {item.status}</p>) : <p>이 회차 범위에서 연결된 보정서가 없습니다.</p>}</div><div className="state-col"><span className={round.connectionStatus === 'linked' ? 'status-linked' : 'status-warning'}>{round.connectionStatus === 'linked' ? '✓ 문서 연결됨' : '△ 연결 확인 필요'}</span><small>{round.connectionReason}</small>{round.decisions.map((item) => <small key={item.documentNumber}>후속 처리 · {item.title}</small>)}</div></article>) : <EmptyState title="확인된 통지서가 없습니다." text="행정처리 이력에 의견제출통지서가 확인되면 회차별 분석을 시작할 수 있습니다." action="사건자료 확인"/>}</section>
    <section className="analysis-result"><div><h2>현재 청구항 검토 결과</h2><p>의견서 주장 분석과 보정 전후 청구항 비교는 원문 근거 구조를 연결한 뒤 확정합니다.</p></div><dl><Data label="구성된 회차" value={`${rounds.length}개`}/><Data label="자동 연결" value={`${rounds.length - needsConfirmation}개`}/><Data label="연결 확인 필요" value={`${needsConfirmation}개`}/></dl><button className="exam-primary" type="button" onClick={onNext}>현재 청구항 확인 →</button></section>
  </>;
}
function TechnologyView({ data, mode, claimAnalysis, selectedClaim, features, summary, summaryBusy, summaryError, onSelectClaim, onChangeRole, onEvidence, onAnalyze, onNext }: { data: PatentCase; mode: WorkMode; claimAnalysis: ClaimAnalysis[]; selectedClaim: number; features: ClaimFeature[]; summary: SummaryPayload | null; summaryBusy: boolean; summaryError: string; onSelectClaim: (number: number) => void; onChangeRole: (id: string, role: SearchRole) => void; onEvidence: () => void; onAnalyze: () => void; onNext: () => void }) {
  const ai = summary?.summary;
  return <>
    <PageHeading step={mode === 'response' ? '03' : '02'} title="기술내용 파악" description="청구항 인용관계와 종속 깊이를 확인하고 검색할 핵심 구성을 선정합니다." action={<button className="exam-secondary" type="button" onClick={onAnalyze} disabled={summaryBusy}>{summaryBusy ? '전문 분석 중…' : ai ? 'AI 분석 다시 실행' : 'AI 전문 요약 실행'}</button>}/>
    {summaryError && <div className="inline-warning">△ {summaryError}</div>}
    <div className="technology-layout"><aside className="claim-tree"><div><h2>청구항 구조</h2><span>{data.claimCount}개</span></div>{claimAnalysis.map((claim) => <button className={`${selectedClaim === claim.number ? 'active' : ''}${claim.errors.length ? ' invalid' : ''}`} style={{ paddingLeft: `${10 + Math.min(claim.depth, 6) * 13}px` }} type="button" key={claim.number} onClick={() => onSelectClaim(claim.number)}><span>{claim.isIndependent ? '독립' : claim.multipleDependent ? '다중' : '종속'}</span><strong>청구항 {claim.number}</strong><small>{claim.isIndependent ? `독립항 · 종속항 ${claim.children.length}개` : `제${claim.directReferences.join('·')}항 인용 · ${claim.depth}단계`}</small>{claim.errors.length > 0 && <em>{claim.errors.join(' ')}</em>}</button>)}</aside><section className="technology-center"><div className="invention-flow">{ai ? <><FlowCard title="기술적 과제" text={ai.technicalProblem} onEvidence={onEvidence}/><i>→</i><FlowCard title="핵심 해결수단" text={ai.solution} onEvidence={onEvidence}/><i>→</i><FlowCard title="주요 효과" text={ai.effects.join(' · ') || '명세서에 명시된 효과 없음'} onEvidence={onEvidence}/></> : <section className="ai-analysis-state"><span>{summaryBusy ? 'ANALYZING FULL TEXT' : 'AI SUMMARY'}</span><h2>{summaryBusy ? '전문 명세서를 분석하고 있습니다.' : '아직 생성된 AI 전문 요약이 없습니다.'}</h2><p>{summaryBusy ? '초록, 전체 청구항과 명세서 본문을 함께 읽어 기술적 과제·해결수단·효과를 정리합니다.' : 'AI 전문 요약 실행을 누르면 실제 명세서 내용을 바탕으로 분석합니다.'}</p></section>}</div><section className="feature-selector"><div className="section-title"><div><small>SEARCH TARGETS</small><h2>검색대상 구성</h2></div><span>청구항 {selectedClaim}</span></div>{features.length ? features.map((feature) => <article key={feature.id} className="feature-row"><div><span>{feature.id}</span><div><strong>{feature.label}</strong><p>{feature.text}</p></div></div><select aria-label={`${feature.id} 검색 역할`} value={feature.role} onChange={(event) => onChangeRole(feature.id, event.target.value as SearchRole)}>{(['핵심 검색', '조합 검색', '일반 구성', '검색 제외', '확인 필요'] as SearchRole[]).map((role) => <option key={role}>{role}</option>)}</select></article>) : <EmptyState title="분석할 청구항이 없습니다." text="청구항 데이터가 수신되면 구성 분석을 시작할 수 있습니다." action="원문 확인"/>}</section></section></div>
    <div className="work-actions"><button type="button" onClick={onAnalyze} disabled={summaryBusy}>{summaryBusy ? 'AI 분석 중…' : ai ? 'AI 분석 다시 실행' : 'AI 전문 요약 실행'}</button><button className="is-coming" type="button" disabled title="근거 검토 상태 저장 기능과 함께 제공합니다.">분석 확정 · 준비 중</button><button className="exam-primary" type="button" onClick={onNext}>검색전략 작성 →</button></div>
  </>;
}
function FlowCard({ title, text, onEvidence }: { title: string; text: string; onEvidence: () => void }) { return <article className="ai-proposal"><span>AI 분석</span><h3>{title}</h3><p>{text}</p><button type="button" onClick={onEvidence}>근거 보기</button></article>; }
function StrategyView({ data, mode, features, summary, onCopy, onNext }: { data: PatentCase; mode: WorkMode; features: ClaimFeature[]; summary: ExaminationSummary | null; onCopy: () => void; onNext: () => void }) {
  const groups = buildKeywordGroups(data, features, summary?.searchKeywords || []); const expression = buildSearchExpression(data, features, summary?.searchKeywords || []);
  return <><PageHeading step={mode === 'response' ? '04' : '03'} title={mode === 'response' ? '추가 검색전략' : '검색전략'} description="검색대상 구성을 개념군과 복사 가능한 검색식 초안으로 구체화합니다." action={<span className="version-badge">저장 전 초안</span>}/><section className="search-basis"><span>검색 기준일</span><strong>{data.applicationDate}</strong><p>{mode === 'response' ? '최초 출원일 이전 공개문헌을 기준으로 보정 추가 구성을 검색합니다.' : '기준일 이전 공개문헌만 적격 문헌으로 표시합니다.'}</p></section><div className="strategy-layout"><aside className="strategy-targets"><h2>검색대상 구성</h2>{features.filter((feature) => !['일반 구성', '검색 제외'].includes(feature.role)).map((feature) => <div key={feature.id}><span>{feature.id}</span><strong>{feature.label}</strong><small>{feature.role}</small></div>)}</aside><section className="query-builder"><div className="section-title"><div><small>CONCEPT GROUPS</small><h2>개념군 및 검색식</h2></div><button type="button" onClick={onCopy}>검색식 복사</button></div><div className="concept-groups">{groups.map((group, index) => <div key={group.name}><header><span>개념군 {String.fromCharCode(65 + index)}</span><strong>{group.name}</strong></header><div>{group.terms.map((term, termIndex) => <span key={`${term}-${termIndex}`}><b>{/[a-z]/i.test(term) ? 'EN' : 'KR'}</b>{term}</span>)}</div>{index < groups.length - 1 && <i>AND</i>}</div>)}</div><pre className="search-expression">{expression}</pre></section><aside className="strategy-info"><h2>전략 정보</h2><dl><Data label="검색 범위 예상" value="보통"/><Data label="저장 상태" value="미저장 초안"/></dl><ul><li className="ok">✓ 핵심 차별구성 포함</li><li className="ok">✓ 한·영 키워드 포함</li><li className={data.cpc.length ? 'ok' : 'warn'}>{data.cpc.length ? '✓' : '!'} CPC 조건 {data.cpc.length ? '확인' : '미설정'}</li><li className="warn">! AI 제안은 심사관 확인 필요</li></ul></aside></div><div className="work-actions"><button type="button" onClick={onCopy}>검색식 복사</button><button className="is-coming" type="button" disabled title="검색전략 버전 스키마 구현 후 제공합니다.">전략 저장 · 준비 중</button><button className="exam-primary" type="button" onClick={onNext}>검색 연결 상태 확인 →</button></div></>;
}
function PriorArtSearchView({ data, expression, candidates, searchRan, onRun, onCopy, onCandidate, onOpenResource, onNext }: { data: PatentCase; expression: string; candidates: Candidate[]; searchRan: boolean; onRun: () => void; onCopy: () => void; onCandidate: (candidate: Candidate) => void; onOpenResource: () => void; onNext: () => void }) {
  return <><PageHeading step="05" title="선행기술 검색" description="실검색 연동 전에는 사건별 검색식 복사와 데모 결과 확인만 제공합니다." action={<button className={data.isDemo ? 'exam-primary' : 'is-coming'} type="button" onClick={onRun} disabled={!data.isDemo} title={data.isDemo ? undefined : '실데이터 검색 API 연결 후 제공합니다.'}>{data.isDemo ? '데모 결과 보기' : '실검색 연동 준비 중'}</button>}/><section className="search-query-bar"><div><span>현재 사건 검색식</span><pre>{expression}</pre><small>{searchRan ? `결과 ${candidates.length}건 · 데모 결과` : data.isDemo ? '데모 결과를 실행할 수 있습니다.' : '실검색 API는 연결되지 않았습니다. 검색식을 복사해 외부 검색에서 사용하세요.'}</small></div><button type="button" onClick={onCopy}>검색식 복사</button><button className="is-coming" type="button" disabled>검색이력 · 준비 중</button></section><div className="prior-layout"><aside className="search-filters"><h2>검색 필터</h2><dl><Data label="기준일" value={data.applicationDate}/><Data label="국가" value="KR · US · EP · JP"/><Data label="주 CPC" value={data.cpc[0]?.number || '미설정'}/><Data label="검색 필드" value="명칭 · 초록 · 청구항"/></dl></aside><section className="search-results">{candidates.length ? candidates.map((candidate) => <CandidateCard key={candidate.id} candidate={candidate} onCandidate={() => onCandidate(candidate)} onOriginal={onOpenResource}/>) : <EmptyState title={data.isDemo ? '아직 데모 검색결과가 없습니다.' : '실데이터 검색 API가 연결되지 않았습니다.'} text={data.isDemo ? '데모 결과 보기를 눌러 후보문헌 화면을 확인하세요.' : '현재 사건에서 생성한 검색식을 복사할 수 있습니다. 후보문헌 직접 추가와 외부 결과 가져오기는 다음 구현 범위입니다.'} action={data.isDemo ? '데모 결과 보기' : '후보문헌 직접 추가 · 준비 중'} onAction={data.isDemo ? onRun : undefined} disabled={!data.isDemo}/>}</section><aside className="candidate-basket"><h2>후보문헌</h2><strong>{candidates.length}건</strong>{candidates.map((candidate) => <div key={candidate.id}><span className={candidate.role === 'D1 후보' ? 'd1' : candidate.role === 'D2 후보' ? 'd2' : 'hold'}>{candidate.role}</span><b>{candidate.country} {candidate.number}</b><small>구성 {candidate.matches.join(', ')}</small></div>)}<button className="exam-primary" type="button" disabled={!candidates.length} onClick={onNext}>후보문헌 검토 →</button></aside></div></>;
}
function CandidateCard({ candidate, onCandidate, onOriginal }: { candidate: Candidate; onCandidate: () => void; onOriginal: () => void }) { return <article className="candidate-card"><div className="candidate-thumb"><span>{candidate.country}</span><small>대표도면</small></div><div><header><span>{candidate.country}</span><strong>{candidate.number}</strong><em>{candidate.role}</em></header><h2>{candidate.title}</h2><dl><Data label="출원일" value={candidate.applicationDate}/><Data label="공개일" value={candidate.publicationDate}/><Data label="출원인" value={candidate.applicant}/></dl><div className="match-tags">{candidate.matches.map((match) => <span key={match}>{match} 일치</span>)}</div><div className="candidate-status"><span>구성 관련도 <b>{candidate.relevance}</b></span><span>문언 일치 <b>{candidate.wording}</b></span><span className={candidate.eligible ? 'eligible' : 'ineligible'}>기준일 {candidate.eligible ? '적격 확인' : '이후 공개'}</span></div><footer><button type="button" onClick={onOriginal}>원문 보기</button><button className="is-coming" type="button" disabled>병렬 비교 · 준비 중</button><button className="exam-primary" type="button" onClick={onCandidate}>후보 추가</button><button className="is-coming" type="button" disabled>제외 · 준비 중</button></footer></div></article>; }
function CandidatesView({ data, features, candidates, selectedCandidate, onSelect, onBack }: { data: PatentCase; features: ClaimFeature[]; candidates: Candidate[]; selectedCandidate: string | null; onSelect: (id: string) => void; onBack: () => void }) {
  return <><PageHeading step="06" title="후보문헌" description="후보문헌이 청구항 구성을 얼마나 충족하는지 비교합니다."/>{candidates.length ? <><section className="coverage-table"><div className="coverage-row head"><strong>청구항 구성</strong>{candidates.map((candidate) => <span key={candidate.id}>{candidate.role}</span>)}</div>{features.slice(0, 6).map((feature) => <div className="coverage-row" key={feature.id}><strong>{feature.id} {feature.label}</strong>{candidates.map((candidate) => <span key={candidate.id} className={candidate.matches.includes(feature.id) ? 'direct' : 'none'}>{candidate.matches.includes(feature.id) ? '● 직접 후보' : '— 근거 없음'}</span>)}</div>)}</section><div className="candidate-tabs"><button className="active" type="button">전체 후보 {candidates.length}</button><button className="is-coming" type="button" disabled>주인용 후보 {candidates.filter((item) => item.role === 'D1 후보').length}</button><button className="is-coming" type="button" disabled>보조 후보 {candidates.filter((item) => item.role === 'D2 후보').length}</button><button className="is-coming" type="button" disabled>보류 {candidates.filter((item) => item.role === '보류').length}</button></div><section className="candidate-table"><div className="candidate-table-head"><span>문헌</span><span>기준일</span><span>대응 구성</span><span>검토상태</span><span>역할</span></div>{candidates.map((candidate) => <button className={selectedCandidate === candidate.id ? 'selected' : ''} type="button" key={candidate.id} onClick={() => onSelect(candidate.id)}><strong>{candidate.country} {candidate.number}<small>{candidate.title}</small></strong><span>{candidate.eligible ? '적격' : '부적격'}</span><span>{candidate.matches.join(', ')}</span><span>미검토</span><span>{candidate.role}</span></button>)}</section></> : <EmptyState title="아직 후보문헌이 없습니다." text="선행기술 검색에서 관련 문헌을 후보로 추가하면 이 화면에서 구성별로 비교할 수 있습니다." action="선행기술 검색으로 이동" onAction={onBack}/>}<div className="work-actions"><button type="button" onClick={onBack}>검색으로 돌아가기</button><span>선택 문헌 {candidates.length}건 · {data.isDemo ? '데모 후보' : '실데이터 후보'}</span><button className="is-coming" type="button" disabled title="EvidenceRef와 검토 상태 저장 기능 구현 후 제공합니다.">증거리뷰 · 준비 중</button></div></>;
}
function FutureView({ title, description, onBack }: { title: string; description: string; onBack: () => void }) { return <><PageHeading step="향후 구현" title={title} description={description}/><section className="future-state"><span>ROADMAP</span><h2>검토 근거가 충분히 연결된 이후 구현합니다.</h2><p>현재 MVP에서는 사건 조회부터 후보문헌 비교까지의 작업 흐름을 먼저 제공합니다. 이 단계는 AI 제안과 심사관 확인을 명확히 분리하고, 확인된 근거만 다음 문서에 사용할 수 있도록 설계됩니다.</p><button type="button" onClick={onBack}>후보문헌으로 돌아가기</button></section></>; }
function ResourcePanel({ data, tab, selectedClaim, onTab, onClose, onFullText, onNotice, onDrawing }: { data: PatentCase; tab: ResourceTab; selectedClaim: number; onTab: (tab: ResourceTab) => void; onClose: () => void; onFullText: () => void; onNotice: (notice: NoticeItem) => void; onDrawing: () => void }) {
  const tabs: Array<[ResourceTab, string]> = [['biblio', '서지'], ['claims', '원문'], ['drawing', '도면'], ['history', '이력'], ['family', '패밀리'], ['documents', '문서']];
  const orderedHistory = [...data.history].sort((left, right) => digits(left.date).localeCompare(digits(right.date)) || left.documentNumber.localeCompare(right.documentNumber));
  const orderedNotices = [...data.notices].sort((left, right) => digits(left.date).localeCompare(digits(right.date)) || left.documentNumber.localeCompare(right.documentNumber));
  return <aside className="resource-panel"><header><div><small>CASE MATERIALS</small><h2>사건자료</h2></div><button type="button" onClick={onClose}>패널 닫기 ×</button></header><nav>{tabs.map(([id, label]) => <button className={tab === id ? 'active' : ''} type="button" key={id} onClick={() => onTab(id)}>{label}</button>)}</nav><div className="resource-body">{tab === 'biblio' && <dl className="resource-dl"><Data label="출원번호" value={data.applicationNumber}/><Data label="출원일" value={data.applicationDate}/><Data label="공개번호" value={data.publicationNumber || '—'}/><Data label="출원인" value={data.applicant}/><Data label="심사청구일" value={data.examinationRequestDate}/><Data label="심사관" value={data.examinerName}/><Data label="주 CPC" value={data.cpc[0]?.number || '—'}/></dl>}{tab === 'claims' && <div className="resource-claims"><span>현재 청구항 {selectedClaim}</span>{data.claims.map((claim) => <article className={claim.number === selectedClaim ? 'active' : ''} key={claim.number}><strong>청구항 {claim.number}</strong><p>{claim.text}</p></article>)}<button className="exam-secondary" type="button" onClick={onFullText}>전체 명세서·청구항 보기</button></div>}{tab === 'drawing' && <div className="resource-drawing">{data.drawing ? <button type="button" onClick={onDrawing}><img src={data.drawing.thumbnailUrl} alt={`${data.title} 대표도면`}/><span>대표도면 크게 보기</span></button> : <EmptyState title="대표도면이 없습니다." text="대표도면 API 응답이 없거나 아직 조회되지 않았습니다." action="확인"/>}</div>}{tab === 'history' && <div className="resource-history">{orderedHistory.map((item) => <article key={`${item.documentNumber}-${item.date}`}><time>{formatDate(item.date)}</time><strong>{item.title}</strong><small>{item.status}</small></article>)}</div>}{tab === 'family' && <div className="resource-family">{data.family.length ? data.family.map((item, index) => <article key={`${item.familyNumber}-${index}`}><span>{item.countryCode || '—'}</span><strong>{item.publicationNumber || item.literatureNumber || item.applicationNumber}</strong><small>{item.familyKind || item.literatureKind}</small></article>) : <EmptyState title="패밀리 없음" text="KIPRIS Plus API에서 조회된 패밀리 문헌이 없습니다." action="확인 완료"/>}</div>}{tab === 'documents' && <div className="resource-documents"><button type="button" onClick={onFullText}><span>XML</span><strong>전체 명세서·청구항</strong><small>{data.fullText?.fileName || '전문파일정보에서 조회'}</small></button>{orderedNotices.map((notice) => <button type="button" key={notice.documentNumber} onClick={() => onNotice(notice)}><span>PDF</span><strong>의견제출통지서</strong><small>{formatDate(notice.date)} · PDF_V2</small></button>)}</div>}</div></aside>;
}
function Data({ label, value, link }: { label: string; value: string; link?: string }) { return <div><dt>{label}</dt><dd>{link ? <a href={link} target="_blank" rel="noreferrer">{value} ↗</a> : value || '—'}</dd></div>; }
function EmptyState({ title, text, action, onAction, disabled = false }: { title: string; text: string; action: string; onAction?: () => void; disabled?: boolean }) { return <div className="exam-empty"><span>○</span><h2>{title}</h2><p>{text}</p><button className={disabled ? 'is-coming' : ''} type="button" onClick={onAction} disabled={disabled}>{action}</button></div>; }
function LoadingOverlay({ stage }: { stage: number }) { const labels = ['서지정보 조회', '청구항·전문 확인', '행정처리 이력 확인', '사건 현재 상태 분류', 'AI 분석 캐시 확인']; return <div className="exam-loading" role="status"><section><span>CASE LOADING</span><h2>특허 사건을 불러오고 있습니다.</h2>{labels.map((label, index) => <div key={label} className={index < stage ? 'done' : index === stage ? 'current' : ''}><b>{index < stage ? '●' : index === stage ? '◐' : '○'}</b>{label}<small>{index < stage ? '완료' : index === stage ? '처리 중' : '대기'}</small></div>)}</section></div>; }
function DrawingDialog({ data, onClose }: { data: PatentCase; onClose: () => void }) { return <div className="exam-dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="exam-dialog drawing" role="dialog" aria-modal="true"><header><div><small>REPRESENTATIVE DRAWING</small><h2>{data.title} · 대표도면</h2></div><button type="button" onClick={onClose}>닫기 ×</button></header><div>{data.drawing ? <img src={data.drawing.largeUrl} alt={`${data.title} 대표도면 확대`}/> : <p>대표도면이 없습니다.</p>}</div></section></div>; }
function buildKeywordGroups(data: PatentCase, features: ClaimFeature[], aiKeywords: string[]) { const titleTerms = [data.title, data.titleEnglish].filter(Boolean); const featureTerms = features.filter((feature) => feature.role !== '검색 제외').slice(0, 3).map((feature) => feature.label.replace('…', '')); const ai = aiKeywords.slice(0, 4); return [{ name: '적용 대상', terms: [...titleTerms, '특허 대상 장치'].slice(0, 4) }, { name: '핵심 구성', terms: featureTerms.length ? featureTerms : ['핵심 구성 확인 필요'] }, { name: '동의어·결합관계', terms: ai.length ? ai : ['동의어 확인 필요'] }]; }
function buildSearchExpression(data: PatentCase, features: ClaimFeature[], aiKeywords: string[]) { const groups = buildKeywordGroups(data, features, aiKeywords); return groups.map((group, index) => `(G${index + 1}=(${group.terms.join(' OR ')}))`).join('\nAND\n') + (data.cpc[0] ? `\nAND\n(CPC=${data.cpc[0].number.replace(/\s+/g, '')})` : ''); }
