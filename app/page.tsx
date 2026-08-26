'use client';
/* eslint-disable @next/next/no-img-element */

import { FormEvent, useEffect, useMemo, useState } from 'react';

type ViewName =
  | 'overview'
  | 'bibliography'
  | 'specification'
  | 'history'
  | 'family'
  | 'documents';

type Claim = { number: number; text: string };
type IpcCode = { number: string; date?: string };
type CpcCode = { number: string; date?: string };
type FamilyItem = {
  applicationNumber: string;
  countryCode: string;
  countryName: string;
  familyKind: string;
  familyNumber: string;
  literatureKind: string;
  literatureNumber: string;
  publicationNumber: string;
};
type HistoryItem = {
  documentNumber: string;
  date: string;
  title: string;
  titleEnglish?: string;
  status: string;
  step?: string;
};
type NoticeItem = HistoryItem & {
  pdf?: { sendNumber: string; fileName: string; fileUrl: string } | null;
  pdfError?: string | null;
};
type SourceStatus = { name: string; ok: boolean; message: string };
type ApiUsage = {
  total: number;
  startedAt: string;
  lastCalledAt: string | null;
  byOperation: Record<string, number>;
};

type ExaminationSummary = {
  oneLine: string;
  technicalProblem: string;
  solution: string;
  keyElements: string[];
  effects: string[];
  claimOverview: string;
  examinationPoints: string[];
  searchKeywords: string[];
  cautions: string[];
};

type SummaryPayload = {
  summary: ExaminationSummary | null;
  model?: string;
  cached: boolean;
  generatedAt?: string;
  usage?: { inputTokens: number; outputTokens: number };
};

type PatentCase = {
  applicationNumber: string;
  applicationNumberRaw: string;
  title: string;
  titleEnglish: string;
  status: string;
  updatedAt: string;
  applicant: string;
  applicantEnglish?: string;
  applicantCountry: string;
  applicationDate: string;
  publicationNumber: string;
  publicationDate: string;
  registrationNumber: string;
  registrationDate: string;
  registrationStatus: string;
  examinationRequestDate: string;
  examinerName: string;
  claimCount: number;
  inventorCount: number;
  abstract: string;
  ipc: IpcCode[];
  cpc: CpcCode[];
  claims: Claim[];
  family: FamilyItem[];
  history: HistoryItem[];
  notices: NoticeItem[];
  drawing: { fileName: string; thumbnailUrl: string; largeUrl: string } | null;
  fullText: { fileName: string; fileUrl: string } | null;
  sources: SourceStatus[];
  isDemo: boolean;
};

type LivePayload = {
  applicationNumber: string;
  bibliography: null | {
    applicationNumber: string;
    applicationDate: string;
    applicationKind: string;
    title: string;
    titleEnglish: string;
    publicationNumber: string;
    publicationDate: string;
    registrationNumber: string;
    registrationDate: string;
    registrationStatus: string;
    finalDisposal: string;
    examinationRequestDate: string;
    examinerName: string;
    claimCount: number;
    abstract: string;
    ipc: IpcCode[];
    claims: Claim[];
    applicants: Array<{ name: string; englishName: string; country: string }>;
    inventors: Array<{ name: string; country: string }>;
  };
  cpc: CpcCode[];
  family: FamilyItem[];
  history: HistoryItem[];
  notices: NoticeItem[];
  drawing: PatentCase['drawing'];
  fullText: PatentCase['fullText'];
  sources: SourceStatus[];
  usage: ApiUsage;
  fetchedAt: string;
  cached?: boolean;
};

const drawingUrl = '/demo-drawing.jpg';

const demoClaims: Claim[] = [
  { number: 1, text: '캐비닛; 상기 캐비닛을 개폐하는 도어; 상기 캐비닛 내부에 배치되고, 의류가 수용되는 드럼; 상기 드럼 내의 온도 또는 습도를 측정하도록 센서를 포함하는 센싱장치; 및 상기 센싱장치가 분리 가능하게 장착되도록 상기 도어 또는 드럼 중 적어도 하나에 마련되는 홀더를 포함하는 의류처리장치.' },
  { number: 2, text: '제1항에 있어서, 상기 센싱장치는 상기 의류처리장치의 작동에 따라 상기 홀더로부터 분리되는 의류처리장치.' },
  { number: 3, text: '제2항에 있어서, 상기 센싱장치는 상기 센싱장치의 외주면에서 내측으로 함몰되는 장착홈을 포함하는 의류처리장치.' },
  { number: 4, text: '제3항에 있어서, 상기 홀더는 상기 드럼의 내측에 마련되는 의류처리장치.' },
  { number: 5, text: '제4항에 있어서, 상기 홀더는 상기 센싱장치의 장착홈과 결합되도록 상기 드럼의 중심부를 향해 돌출되는 장착돌기를 포함하는 의류처리장치.' },
  { number: 6, text: '제5항에 있어서, 상기 장착돌기는 상기 드럼의 회전축 방향을 따라 연장되고, 상기 장착홈은 상기 장착돌기에 대응하여 함몰되는 의류처리장치.' },
  { number: 7, text: '제5항에 있어서, 상기 홀더는 상기 장착돌기의 양측에서 상기 센싱장치가 안착되도록 함몰되는 안착부를 포함하는 의류처리장치.' },
  { number: 8, text: '제4항에 있어서, 상기 홀더는 상기 센싱장치의 장착홈과 결합되도록 상기 홀더의 측면으로부터 돌출되는 장착돌기를 포함하는 의류처리장치.' },
  { number: 9, text: '제4항에 있어서, 상기 홀더는 상기 센싱장치의 중앙부가 안착되는 제1안착홈과, 상기 센싱장치의 외측부가 안착되도록 상기 제1안착홈의 둘레에 형성되는 제2안착홈과, 상기 제1안착홈 및 제2안착홈을 구획하는 구획벽을 포함하는 의류처리장치.' },
  { number: 10, text: '제9항에 있어서, 상기 홀더는 상기 센싱장치의 장착홈과 결합하도록 상기 구획벽에서 돌출되는 연장돌기를 더 포함하는 의류처리장치.' },
  { number: 11, text: '제4항에 있어서, 상기 의류처리장치는 상기 의류를 상기 드럼 내부에서 이동시키도록 상기 드럼의 내주면에서 돌출되는 리프터를 포함하고, 상기 리프터는 상기 홀더와 상기 홀더의 양측에 마련되는 복수의 리프팅부를 포함하는 의류처리장치.' },
  { number: 12, text: '제4항에 있어서, 상기 장착홈은 복수로 마련되고, 상기 홀더는 복수의 고리부, 결합축 및 버튼부를 포함하며, 상기 의류처리장치는 상기 버튼부를 가압하는 스토퍼를 더 포함하는 의류처리장치.' },
  { number: 13, text: '제2항에 있어서, 상기 홀더는 상기 도어의 상기 캐비닛의 내부를 마주하는 영역에 배치되는 의류처리장치.' },
  { number: 14, text: '제12항에 있어서, 상기 도어는 도어의 폐쇄 시 상기 드럼 내로 상기 센싱장치가 투입되도록 상기 홀더에 장착된 센싱장치를 가압하는 가압돌기를 더 포함하는 의류처리장치.' },
  { number: 15, text: '제1항에 있어서, 상기 센싱장치는 상기 도어 또는 드럼에 장착되도록 상기 센싱장치의 내부에 자석을 포함하는 의류처리장치.' },
  { number: 16, text: '의류의 세탁 또는 건조를 위해 사용되는 의류처리장치에 있어서, 캐비닛; 도어; 드럼; 및 상기 의류처리장치에 투입되어 드럼 내부의 상태를 측정하는 센서볼이 분리 가능하게 장착되도록 상기 도어 또는 드럼 중 적어도 하나에 마련되는 홀더를 포함하는 의류처리장치.' },
  { number: 17, text: '제16항에 있어서, 상기 홀더는 상기 의류처리장치의 작동에 따라 상기 센서볼이 분리되는 의류처리장치.' },
  { number: 18, text: '제17항에 있어서, 상기 센서볼은 외주면에서 내측으로 함몰되는 장착홈을 포함하고, 상기 홀더는 상기 장착홈과 대응되어 형성되는 장착돌기를 포함하는 의류처리장치.' },
  { number: 19, text: '제16항에 있어서, 상기 홀더는 상기 드럼에 배치되고, 상기 홀더의 양측에 배치되는 복수의 리프팅부를 포함하는 리프터를 포함하는 의류처리장치.' },
  { number: 20, text: '제16항에 있어서, 상기 홀더는 상기 도어에 배치되고, 상기 도어는 상기 센서볼이 상기 드럼 내로 투입되도록 센서볼을 가압하는 가압돌기를 더 포함하는 의류처리장치.' },
];

const demoHistory: HistoryItem[] = [
  { documentNumber: '412026527198456', date: '20260723', title: '특허고객번호 정보변경(경정)신고서·정정신고서', status: '수리', step: '출원' },
  { documentNumber: '412026525145939', date: '20260706', title: '특허고객번호 정보변경(경정)신고서·정정신고서', status: '수리', step: '출원' },
  { documentNumber: '412026524022279', date: '20260701', title: '특허고객번호 정보변경(경정)신고서·정정신고서', status: '수리', step: '출원' },
  { documentNumber: '952026056648249', date: '20260623', title: '의견제출통지서', titleEnglish: 'Notification of reason for refusal', status: '발송처리완료', step: '출원' },
  { documentNumber: '112025135400767', date: '20251201', title: '[거절이유 등 통지에 따른 의견]의견서·답변서·소명서', status: '수리', step: '출원' },
  { documentNumber: '112025135400611', date: '20251201', title: '[명세서등 보정]보정서', status: '보정승인간주', step: '출원' },
  { documentNumber: '952025071682793', date: '20250729', title: '의견제출통지서', titleEnglish: 'Notification of reason for refusal', status: '발송처리완료', step: '출원' },
  { documentNumber: '112023063864893', date: '20230609', title: '[심사청구]심사청구서·우선심사신청서', status: '수리', step: '출원' },
  { documentNumber: '112020079000192', date: '20200728', title: '[특허출원]특허출원서', titleEnglish: '[Patent Application] Patent Application', status: '수리', step: '출원' },
];

const demoNotices: NoticeItem[] = demoHistory
  .filter((item) => item.title === '의견제출통지서')
  .map((item) => ({ ...item, pdf: null, pdfError: 'API 키 연결 후 PDF_V2로 자동 조회' }));

const demoCase: PatentCase = {
  applicationNumber: '10-2020-0093844',
  applicationNumberRaw: '1020200093844',
  title: '의류처리장치',
  titleEnglish: 'CLOTHES TREATING APPARATUS',
  status: '심사 중',
  updatedAt: '2026.08.26',
  applicant: '삼성전자주식회사',
  applicantCountry: '대한민국',
  applicationDate: '2020.07.28',
  publicationNumber: '10-2022-0014141',
  publicationDate: '2022.02.04',
  registrationNumber: '',
  registrationDate: '',
  registrationStatus: '심사 진행',
  examinationRequestDate: '2023.06.09',
  examinerName: 'API 연동 후 표시',
  claimCount: 20,
  inventorCount: 10,
  abstract: '의류처리장치가 개시된다. 본 발명의 사상에 따른 의류처리장치는 캐비닛과, 상기 캐비닛을 개폐하는 도어와, 상기 캐비닛 내부에 배치되고 의류가 수용되는 드럼과, 상기 드럼 내의 온도 또는 습도를 측정하도록 센서를 포함하는 센싱장치 및 상기 센싱장치가 분리 가능하게 장착되도록 상기 도어 또는 드럼 중 적어도 하나에 마련되는 홀더를 포함할 수 있다.',
  ipc: [
    { number: 'D06F 34/26', date: '2020.01' },
    { number: 'D06F 37/06', date: '2006.01' },
  ],
  cpc: [
    { number: 'D06F 34/26', date: '2020.02' },
    { number: 'D06F 37/06', date: '2013.01' },
  ],
  claims: demoClaims,
  family: [],
  history: demoHistory,
  notices: demoNotices,
  drawing: { fileName: '1020200093844.jpg', thumbnailUrl: drawingUrl, largeUrl: drawingUrl },
  fullText: { fileName: '1020200093844.xml', fileUrl: '' },
  sources: [
    { name: 'bibliography', ok: true, message: '서지·행정처리 반영' },
    { name: 'cpc', ok: true, message: 'CPC정보 반영' },
    { name: 'drawing', ok: true, message: '대표도면 링크 확인' },
    { name: 'family', ok: false, message: 'API 키 연결 후 조회' },
  ],
  isDemo: true,
};

const navigation: Array<{ id: ViewName; index: string; label: string }> = [
  { id: 'overview', index: '01', label: '심사 개요' },
  { id: 'bibliography', index: '02', label: '서지정보' },
  { id: 'specification', index: '03', label: '명세서 · 청구항' },
  { id: 'history', index: '04', label: '행정처리 이력' },
  { id: 'family', index: '05', label: '패밀리' },
  { id: 'documents', index: '06', label: '문서함' },
];

const sourceLabels: Record<string, string> = {
  bibliography: '서지상세',
  cpc: 'CPC정보',
  drawing: '대표도면',
  family: '패밀리',
};

function formatApplicationNumber(value: string) {
  const digits = value.replace(/\D/g, '');
  return digits.length === 13
    ? `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`
    : value;
}

function formatDate(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 8) {
    return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6)}`;
  }
  return value || '—';
}

function cpcSearchUrl(code: string) {
  return `https://cls.kipro.or.kr/classification/cpc/search?code=${code.replace(/\s+/g, '')}`;
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function fetchApiUsage() {
  const response = await fetch('/api/patent/usage', { cache: 'no-store' });
  if (!response.ok) throw new Error('API 사용량을 불러오지 못했습니다.');
  return (await response.json()) as ApiUsage;
}

function mapLiveCase(payload: LivePayload): PatentCase {
  const biblio = payload.bibliography;
  const applicant = biblio?.applicants?.[0];
  return {
    applicationNumber: formatApplicationNumber(
      biblio?.applicationNumber || payload.applicationNumber,
    ),
    applicationNumberRaw: payload.applicationNumber,
    title: biblio?.title || '발명의 명칭 미수신',
    titleEnglish: biblio?.titleEnglish || '',
    status: biblio?.finalDisposal || biblio?.registrationStatus || '심사 진행',
    updatedAt: new Date(payload.fetchedAt).toLocaleString('ko-KR'),
    applicant: applicant?.name || '출원인 미수신',
    applicantEnglish: applicant?.englishName,
    applicantCountry: applicant?.country || '',
    applicationDate: formatDate(biblio?.applicationDate || ''),
    publicationNumber: biblio?.publicationNumber || '',
    publicationDate: formatDate(biblio?.publicationDate || ''),
    registrationNumber: biblio?.registrationNumber || '',
    registrationDate: formatDate(biblio?.registrationDate || ''),
    registrationStatus: biblio?.registrationStatus || '',
    examinationRequestDate: formatDate(biblio?.examinationRequestDate || ''),
    examinerName: biblio?.examinerName || '—',
    claimCount: biblio?.claimCount || biblio?.claims.length || 0,
    inventorCount: biblio?.inventors.length || 0,
    abstract: biblio?.abstract || '초록 데이터가 없습니다.',
    ipc: biblio?.ipc || [],
    cpc: payload.cpc || [],
    claims: biblio?.claims || [],
    family: payload.family || [],
    history: payload.history || [],
    notices: payload.notices || [],
    drawing: payload.drawing,
    fullText: payload.fullText,
    sources: payload.sources || [],
    isDemo: false,
  };
}

export default function Home() {
  const [activeView, setActiveView] = useState<ViewName>('overview');
  const [caseData, setCaseData] = useState<PatentCase>(demoCase);
  const [searchValue, setSearchValue] = useState(demoCase.applicationNumber);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');
  const [historyFilter, setHistoryFilter] = useState<'all' | 'notice'>('all');
  const [claimFilter, setClaimFilter] = useState<'all' | 'independent'>('all');
  const [selectedNotice, setSelectedNotice] = useState<NoticeItem | null>(null);
  const [packageOpen, setPackageOpen] = useState(false);
  const [drawingOpen, setDrawingOpen] = useState(false);
  const [cpcOpen, setCpcOpen] = useState(false);
  const [summaryPayload, setSummaryPayload] = useState<SummaryPayload | null>(null);
  const [summaryBusy, setSummaryBusy] = useState(false);
  const [summaryError, setSummaryError] = useState('');
  const [apiUsage, setApiUsage] = useState<ApiUsage | null>(null);
  const [packageBusy, setPackageBusy] = useState(false);
  const [packageOptions, setPackageOptions] = useState({
    summary: true,
    claims: true,
    history: true,
    family: true,
    documentLinks: true,
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedNotice(null);
        setPackageOpen(false);
        setDrawingOpen(false);
        setCpcOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    void fetchApiUsage().then(setApiUsage).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const latestNotice = caseData.notices[0] ?? null;
  const sourceOkCount = caseData.sources.filter((source) => source.ok).length;
  const familyCountryCount = new Set(
    caseData.family.map((item) => item.countryCode).filter(Boolean),
  ).size;
  const visibleHistory = useMemo(
    () =>
      historyFilter === 'notice'
        ? caseData.history.filter((item) => item.title.includes('의견제출통지서'))
        : caseData.history,
    [caseData.history, historyFilter],
  );
  const visibleClaims = useMemo(
    () =>
      claimFilter === 'independent'
        ? caseData.claims.filter((claim) => !claim.text.trim().startsWith('제'))
        : caseData.claims,
    [caseData.claims, claimFilter],
  );

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = searchValue.replace(/\D/g, '');
    if (!/^(10|20)\d{11}$/.test(normalized)) {
      setToast('특허·실용신안 출원번호 13자리를 확인해 주세요.');
      return;
    }

    setLoading(true);
    try {
      if (normalized === demoCase.applicationNumberRaw) {
        await new Promise((resolve) => window.setTimeout(resolve, 550));
        setCaseData(demoCase);
        setSummaryPayload(null);
        setSummaryError('');
        setActiveView('overview');
        setToast('샘플 사건 데이터를 불러왔습니다.');
        return;
      }

      const response = await fetch(
        `/api/patent?applicationNumber=${encodeURIComponent(normalized)}`,
      );
      const payload = (await response.json()) as LivePayload & { error?: string };
      if (!response.ok) throw new Error(payload.error || '사건 조회에 실패했습니다.');
      const loadedCase = mapLiveCase(payload as LivePayload);
      setCaseData(loadedCase);
      setApiUsage(payload.usage);
      setSummaryPayload(null);
      setSummaryError('');
      void loadSummary(normalized, false);
      setActiveView('overview');
      setToast(payload.cached ? 'D1에 저장된 사건 데이터를 불러왔습니다.' : 'KIPRIS Plus 최신 데이터를 불러왔습니다.');
    } catch (error) {
      setToast(error instanceof Error ? error.message : '사건 조회에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }

  async function loadSummary(applicationNumber: string, generate: boolean, force = false) {
    setSummaryBusy(generate);
    setSummaryError('');
    try {
      const parameters = new URLSearchParams({ applicationNumber });
      if (force) parameters.set('force', 'true');
      const response = await fetch(`/api/patent/summary?${parameters.toString()}`, {
        method: generate ? 'POST' : 'GET',
        headers: generate ? { 'Content-Type': 'application/json' } : undefined,
      });
      const payload = (await response.json()) as SummaryPayload & { error?: string };
      if (!response.ok) {
        if (!generate && response.status === 404) return;
        throw new Error(payload.error || 'AI 요약을 불러오지 못했습니다.');
      }
      setSummaryPayload(payload);
      if (!generate && !payload.summary) {
        void loadSummary(applicationNumber, true);
        return;
      }
      if (generate) setToast(payload.cached ? '저장된 AI 요약을 불러왔습니다.' : 'AI 심사요약을 생성했습니다.');
    } catch (error) {
      setSummaryError(error instanceof Error ? error.message : 'AI 요약을 불러오지 못했습니다.');
    } finally {
      setSummaryBusy(false);
    }
  }

  async function buildPackage() {
    setPackageBusy(true);
    try {
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      const prefix = caseData.applicationNumberRaw;

      zip.file(
        'README.txt',
        `심사데스크 MVP 자료 묶음\n출원번호: ${caseData.applicationNumber}\n생성일: ${new Date().toLocaleString('ko-KR')}\n\n이 묶음은 MVP에서 가공한 검토용 데이터입니다. 원문 전문·대표도면·의견제출통지서 PDF는 KIPRIS Plus API 키 연결 후 서버에서 내려받아 포함하는 구조입니다.`,
      );
      if (packageOptions.summary) {
        zip.file(
          `01_사건요약_${prefix}.json`,
          JSON.stringify(
            {
              applicationNumber: caseData.applicationNumber,
              title: caseData.title,
              applicant: caseData.applicant,
              status: caseData.status,
              applicationDate: caseData.applicationDate,
              publicationNumber: caseData.publicationNumber,
              publicationDate: caseData.publicationDate,
              cpc: caseData.cpc,
              ipc: caseData.ipc,
              abstract: caseData.abstract,
              aiExaminationSummary: summaryPayload?.summary ?? null,
            },
            null,
            2,
          ),
        );
      }
      if (packageOptions.claims) {
        zip.file(
          `02_청구항_${prefix}.json`,
          JSON.stringify(caseData.claims, null, 2),
        );
      }
      if (packageOptions.history) {
        const rows = [
          ['일자', '문서명', '상태', '접수발송번호'],
          ...caseData.history.map((item) => [
            formatDate(item.date),
            item.title,
            item.status,
            item.documentNumber,
          ]),
        ];
        const csv = rows
          .map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(','))
          .join('\r\n');
        zip.file(`03_행정처리이력_${prefix}.csv`, `\uFEFF${csv}`);
      }
      if (packageOptions.family) {
        zip.file(
          `04_패밀리정보_${prefix}.json`,
          JSON.stringify(caseData.family, null, 2),
        );
      }
      if (packageOptions.documentLinks) {
        zip.file(
          `05_원문파일목록_${prefix}.json`,
          JSON.stringify(
            {
              fullText: caseData.fullText,
              drawing: caseData.drawing,
              officeActionPdfs: caseData.notices.map((notice) => ({
                sendNumber: notice.documentNumber,
                date: formatDate(notice.date),
                file: notice.pdf ?? null,
                note: '문서를 열 때 PDF_V2에서 조회',
              })),
            },
            null,
            2,
          ),
        );
      }

      const blob = await zip.generateAsync({ type: 'blob' });
      downloadBlob(blob, `심사자료_${prefix}_MVP.zip`);
      setPackageOpen(false);
      setToast('검토용 ZIP 묶음을 만들었습니다.');
    } catch {
      setToast('ZIP 묶음을 만드는 중 오류가 발생했습니다.');
    } finally {
      setPackageBusy(false);
    }
  }

  function goTo(view: ViewName) {
    setActiveView(view);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openFullText() {
    window.location.assign(
      `/fulltext?applicationNumber=${encodeURIComponent(caseData.applicationNumberRaw)}`,
    );
  }

  function pdfViewerUrl(notice: NoticeItem | null) {
    if (!notice?.documentNumber) return '';
    const parameters = new URLSearchParams({
      applicationNumber: caseData.applicationNumberRaw,
      sendNumber: notice.documentNumber,
    });
    return `/api/patent/pdf?${parameters.toString()}`;
  }

  const facts = [
    { label: '출원일', value: caseData.applicationDate || '—', detail: `공개 ${caseData.publicationDate || '—'}` },
    { label: '청구항', value: `${caseData.claimCount}항`, detail: `독립항 ${caseData.claims.filter((claim) => !claim.text.trim().startsWith('제')).length} · 전체 ${caseData.claimCount}` },
    { label: '주 CPC', value: caseData.cpc[0]?.number || '—', detail: caseData.cpc.length ? `전체 ${caseData.cpc.length}개 보기 ↗` : 'CPC 정보 없음', cpc: true },
    { label: '패밀리', value: familyCountryCount ? `${familyCountryCount}개 관할청` : '패밀리 없음', detail: familyCountryCount ? `${caseData.family.length}개 문헌` : '조회된 패밀리 문헌 없음' },
  ];

  const selectedPdfUrl = pdfViewerUrl(selectedNotice);
  const usageDetails = apiUsage
    ? Object.entries(apiUsage.byOperation)
        .map(([name, count]) => `${name} ${count}회`)
        .join(' · ')
    : '집계 정보를 불러오는 중입니다.';

  return (
    <>
      <a className="skip-link" href="#main-content">본문 바로가기</a>
      <div className="krds-masthead">
        <div><span className="krds-flag" aria-hidden="true" />이 누리집은 대한민국 공식 전자정부 누리집의 디자인 원칙을 참고한 MVP입니다.</div>
      </div>
      <main className="app-shell">
      <aside className="sidebar">
        <button className="brand brand-button" type="button" onClick={() => goTo('overview')} aria-label="심사데스크 홈">
          <span className="brand-mark">특허</span>
          <span><strong>심사데스크</strong><small>특허 사건 검토 지원</small></span>
        </button>

        <nav className="side-nav" aria-label="사건 메뉴">
          <p className="nav-label">WORKSPACE</p>
          {navigation.map((item) => (
            <button
              className={`nav-item ${activeView === item.id ? 'active' : ''}`}
              type="button"
              key={item.id}
              onClick={() => item.id === 'specification' ? openFullText() : goTo(item.id)}
            >
              <span>{item.index}</span> {item.label}
              {item.id === 'history' && <em>{caseData.history.length}</em>}
              {item.id === 'documents' && <em>{caseData.notices.length + 2}</em>}
            </button>
          ))}
        </nav>

        <div className="source-status">
          <span className={`status-dot ${caseData.isDemo ? 'demo' : ''}`} />
          <div>
            <strong>{caseData.isDemo ? 'MVP 샘플 데이터' : 'KIPRIS Plus 연결됨'}</strong>
            <small>{caseData.isDemo ? '실제 응답 구조 기반' : `${sourceOkCount}/${caseData.sources.length}개 API 정상`}</small>
          </div>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <form className="search-box" onSubmit={handleSearch}>
            <label htmlFor="application-search">출원번호로 사건 조회</label>
            <div>
              <span aria-hidden="true">⌕</span>
              <input
                id="application-search"
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                aria-label="출원번호"
                inputMode="numeric"
                placeholder="예: 10-2020-0093844"
              />
              <button className="search-submit" type="submit">조회</button>
            </div>
          </form>
          <div className="top-actions">
            <span className="demo-pill">{caseData.isDemo ? 'DEMO' : 'LIVE'}</span>
            <span className="api-usage-pill" title={usageDetails} aria-label={`KIPRIS Plus API D1 누적 호출 ${apiUsage?.total ?? 0}회`}>
              API 호출 <strong>{apiUsage?.total ?? '—'}</strong>회 <small>D1 누적</small>
            </span>
            <span className="secret-pill">Worker Secret 연동</span>
            <button className="export-button" type="button" onClick={() => setPackageOpen(true)}>
              심사자료 묶음 만들기 <span>↓</span>
            </button>
          </div>
        </header>

        <div className="content" id="main-content" tabIndex={-1}>
          {activeView === 'overview' && (
            <>
              <div className="breadcrumb">심사 사건 <span>/</span> 국내 특허 <span>/</span> 개요</div>
              <CaseHeading data={caseData} />
              <section className="facts-grid" aria-label="사건 핵심 정보">
                {facts.map((fact) => (
                  <article className={`fact-card ${fact.cpc ? 'interactive' : ''}`} key={fact.label}>
                    {fact.cpc ? (
                      <div className="fact-card-cpc">
                        <span>{fact.label}</span>
                        {caseData.cpc[0] ? (
                          <a href={cpcSearchUrl(caseData.cpc[0].number)} target="_blank" rel="noreferrer" aria-label={`주 CPC ${caseData.cpc[0].number} 분류 검색, 새 창`}>
                            <strong>{fact.value}</strong><i aria-hidden="true">↗</i>
                          </a>
                        ) : <strong>{fact.value}</strong>}
                        <button type="button" onClick={() => setCpcOpen(true)} disabled={!caseData.cpc.length}>{fact.detail}</button>
                      </div>
                    ) : (
                      <><span>{fact.label}</span><strong>{fact.value}</strong><small>{fact.detail}</small></>
                    )}
                  </article>
                ))}
              </section>

              <section className="dashboard-grid">
                <article className="panel review-panel">
                  <PanelHeading eyebrow="REVIEW SNAPSHOT" title="심사 포인트" action={<span className="attention-badge">확인 필요 {caseData.notices.length}</span>} />
                  {latestNotice ? (
                    <div className="notice-card">
                      <span className="notice-index">01</span>
                      <div><strong>최근 의견제출통지서가 있습니다</strong><p>{formatDate(latestNotice.date)} 발송 · {latestNotice.documentNumber}</p></div>
                      <button type="button" onClick={() => setSelectedNotice(latestNotice)}>PDF 보기 <span>↗</span></button>
                    </div>
                  ) : (
                    <div className="clear-card"><strong>의견제출통지서 없음</strong><span>서지상세 행정처리 기준으로 확인된 통지서가 없습니다.</span></div>
                  )}
                  <div className="review-list">
                    <button type="button" onClick={openFullText}>
                      <span className="review-icon">A</span>
                      <p><strong>전체 명세서 · 청구항 검토</strong><small>전문파일정보의 전체 본문과 청구항 {caseData.claimCount}개를 읽기 화면에서 확인</small></p>
                      <em>→</em>
                    </button>
                    <button type="button" onClick={() => goTo('family')}>
                      <span className="review-icon muted">F</span>
                      <p><strong>해외 패밀리 대조</strong><small>{familyCountryCount ? `${familyCountryCount}개 관할청 · ${caseData.family.length}개 문헌` : '패밀리 없음'}</small></p>
                      <em>→</em>
                    </button>
                  </div>
                  <div className="ai-summary-card">
                    <div className="ai-summary-head">
                      <div><span>AI EXAMINATION BRIEF</span><strong>발명 요약</strong></div>
                      {!caseData.isDemo && (
                        <button
                          type="button"
                          disabled={summaryBusy}
                          onClick={() => void loadSummary(caseData.applicationNumberRaw, true, Boolean(summaryPayload?.summary))}
                        >
                          {summaryBusy ? '분석 중…' : summaryPayload?.summary ? '다시 생성' : 'AI 요약 생성'}
                        </button>
                      )}
                    </div>
                    {summaryPayload?.summary ? (
                      <div className="ai-summary-content">
                        <p className="ai-one-line">{summaryPayload.summary.oneLine}</p>
                        <dl>
                          <div><dt>기술적 과제</dt><dd>{summaryPayload.summary.technicalProblem}</dd></div>
                          <div><dt>해결수단</dt><dd>{summaryPayload.summary.solution}</dd></div>
                          <div><dt>청구범위</dt><dd>{summaryPayload.summary.claimOverview}</dd></div>
                        </dl>
                        <div className="ai-summary-columns">
                          <div><strong>핵심 구성</strong><ul>{summaryPayload.summary.keyElements.map((item) => <li key={item}>{item}</li>)}</ul></div>
                          <div><strong>심사 확인 포인트</strong><ul>{summaryPayload.summary.examinationPoints.map((item) => <li key={item}>{item}</li>)}</ul></div>
                        </div>
                        <div className="keyword-row">{summaryPayload.summary.searchKeywords.map((keyword) => <span key={keyword}>{keyword}</span>)}</div>
                        <small>{summaryPayload.model} · {summaryPayload.cached ? 'D1 저장 요약' : '새로 생성'} · AI 결과는 원문 확인이 필요합니다.</small>
                      </div>
                    ) : (
                      <div className="abstract-preview ai-fallback">
                        <span>{caseData.isDemo ? '초록 기반 미리보기' : '원문 초록'}</span>
                        <p>{caseData.abstract}</p>
                        {summaryError && <em>{summaryError}</em>}
                        {!caseData.isDemo && !summaryError && <small>저장된 요약이 없으면 버튼을 눌러 최초 1회 생성합니다.</small>}
                      </div>
                    )}
                  </div>
                </article>

                <article className="panel drawing-panel">
                  <PanelHeading eyebrow="REPRESENTATIVE DRAWING" title="대표도면" action={<button className="plain-link" type="button" onClick={() => setDrawingOpen(true)}>크게 보기 ↗</button>} />
                  <button className="drawing-frame" type="button" onClick={() => setDrawingOpen(true)}>
                    {caseData.drawing?.largeUrl ? (
                      <img src={caseData.drawing.largeUrl} alt={`${caseData.title} 대표도면`} />
                    ) : <span className="drawing-empty">대표도면 없음</span>}
                    <span className="figure-label">FIG. 1</span>
                  </button>
                </article>

                <article className="panel timeline-panel">
                  <PanelHeading eyebrow="LATEST ACTIVITY" title="최근 행정처리" action={<button className="plain-link" type="button" onClick={() => goTo('history')}>전체 {caseData.history.length}건 →</button>} />
                  <div className="timeline">
                    {caseData.history.slice(0, 4).map((event) => (
                      <button className="timeline-row" type="button" key={event.documentNumber} onClick={() => event.title.includes('의견제출통지서') ? setSelectedNotice(caseData.notices.find((notice) => notice.documentNumber === event.documentNumber) ?? { ...event }) : goTo('history')}>
                        <span className={`timeline-dot ${event.title.includes('의견제출통지서') ? 'alert' : ''}`} />
                        <time>{formatDate(event.date)}</time>
                        <div><strong>{event.title}</strong><small>{event.status}</small></div>
                      </button>
                    ))}
                  </div>
                </article>
              </section>

              <section className="source-strip" aria-label="데이터 수집 상태">
                <div><span className="eyebrow">DATA SOURCES</span><strong>수집 상태</strong></div>
                {caseData.sources.map((source) => (
                  <div className="source-chip" key={source.name}><span className={source.ok ? 'ok' : 'wait'} /> <strong>{sourceLabels[source.name] || source.name}</strong><small>{source.message}</small></div>
                ))}
              </section>
            </>
          )}

          {activeView === 'bibliography' && (
            <section className="detail-view">
              <ViewHeader eyebrow="BIBLIOGRAPHY" title="서지정보" description="서지상세정보 API에서 심사에 필요한 핵심 필드만 선별합니다." action={<button className="outline-button" type="button" onClick={() => setPackageOpen(true)}>이 정보 담기 ↓</button>} />
              <div className="detail-grid bibliographic-grid">
                <article className="panel detail-panel wide">
                  <h2>출원 · 공개 · 심사</h2>
                  <dl className="data-list">
                    <DataRow label="출원번호" value={caseData.applicationNumber} />
                    <DataRow label="출원일자" value={caseData.applicationDate} />
                    <DataRow label="공개번호" value={caseData.publicationNumber || '—'} />
                    <DataRow label="공개일자" value={caseData.publicationDate || '—'} />
                    <DataRow label="심사청구일" value={caseData.examinationRequestDate || '—'} />
                    <DataRow label="심사관" value={caseData.examinerName || '—'} />
                    <DataRow label="최종처분/상태" value={caseData.status || '—'} tone="accent" />
                  </dl>
                </article>
                <article className="panel detail-panel">
                  <h2>출원인</h2>
                  <div className="entity-card"><span>APPLICANT</span><strong>{caseData.applicant}</strong><p>{caseData.applicantEnglish || caseData.applicantCountry}</p></div>
                  <dl className="mini-list"><DataRow label="국가" value={caseData.applicantCountry || '—'} /><DataRow label="발명자" value={`${caseData.inventorCount}명`} /></dl>
                </article>
                <article className="panel detail-panel">
                  <h2>분류정보</h2>
                  <div className="classification-list">
                    {caseData.cpc.slice(0, 3).map((cpc, index) => <div key={`${cpc.number}-${index}`}><span>{index === 0 ? '주 CPC' : 'CPC'}</span><a className="cpc-code-link" href={cpcSearchUrl(cpc.number)} target="_blank" rel="noreferrer" aria-label={`${cpc.number} CPC 분류 검색, 새 창`}>{cpc.number}<i aria-hidden="true">↗</i></a><small>{cpc.date || ''}</small></div>)}
                    {caseData.cpc.length > 3 && <button className="classification-more" type="button" onClick={() => setCpcOpen(true)}>전체 CPC {caseData.cpc.length}개 보기 ↗</button>}
                    {!caseData.cpc.length && <p className="classification-empty">CPC 정보가 없습니다.</p>}
                  </div>
                </article>
                <article className="panel detail-panel wide invention-title-card">
                  <span className="eyebrow">INVENTION TITLE</span><h2>{caseData.title}</h2><p>{caseData.titleEnglish || '영문 명칭 없음'}</p>
                </article>
              </div>
            </section>
          )}

          {activeView === 'specification' && (
            <section className="detail-view">
              <ViewHeader eyebrow="FULL TEXT" title="명세서 · 청구항" description="전문파일의 전체 명세서와 청구항을 별도 읽기 화면으로 확인합니다." action={<button className="export-button" type="button" onClick={openFullText}>전체 전문 보기 →</button>} />
              <article className="panel abstract-panel"><span className="section-number">A</span><div><span className="eyebrow">ABSTRACT</span><h2>초록</h2><p>{caseData.abstract}</p></div></article>
              <div className="claims-header"><div><h2>청구항</h2><span>{caseData.claimCount}개 항목</span></div><div className="segmented"><button className={claimFilter === 'all' ? 'active' : ''} type="button" onClick={() => setClaimFilter('all')}>전체</button><button className={claimFilter === 'independent' ? 'active' : ''} type="button" onClick={() => setClaimFilter('independent')}>독립항</button></div></div>
              <div className="claims-list">
                {visibleClaims.map((claim) => <article className={`claim-card ${!claim.text.trim().startsWith('제') ? 'independent' : ''}`} key={claim.number}><span>{String(claim.number).padStart(2, '0')}</span><div><strong>청구항 {claim.number}{!claim.text.trim().startsWith('제') && <em>독립항</em>}</strong><p>{claim.text}</p></div></article>)}
              </div>
            </section>
          )}

          {activeView === 'history' && (
            <section className="detail-view">
              <ViewHeader eyebrow="PROSECUTION HISTORY" title="행정처리 이력" description="서지상세정보의 행정처리 항목을 시간순으로 정리하고 의견제출통지서를 표시합니다." action={<span className="count-badge">총 {caseData.history.length}건</span>} />
              <div className="history-toolbar"><div className="segmented"><button className={historyFilter === 'all' ? 'active' : ''} type="button" onClick={() => setHistoryFilter('all')}>전체 이력</button><button className={historyFilter === 'notice' ? 'active' : ''} type="button" onClick={() => setHistoryFilter('notice')}>의견제출통지서 {caseData.notices.length}</button></div><p><span /> 의견제출통지서는 PDF_V2 자동조회 대상입니다.</p></div>
              <article className="panel history-table">
                <div className="history-table-head"><span>일자</span><span>문서명</span><span>처리상태</span><span>접수·발송번호</span><span>원문</span></div>
                {visibleHistory.map((item) => {
                  const isNotice = item.title.includes('의견제출통지서');
                  const notice = caseData.notices.find((entry) => entry.documentNumber === item.documentNumber);
                  return <div className={`history-table-row ${isNotice ? 'notice' : ''}`} key={item.documentNumber}><time>{formatDate(item.date)}</time><div><strong>{item.title}</strong><small>{item.titleEnglish || item.step || ''}</small></div><span className="status-label">{item.status}</span><code>{item.documentNumber}</code><div>{isNotice ? <button type="button" onClick={() => setSelectedNotice(notice ?? { ...item })}>PDF 열기 ↗</button> : <span>—</span>}</div></div>;
                })}
              </article>
            </section>
          )}

          {activeView === 'family' && (
            <section className="detail-view">
              <ViewHeader eyebrow="PATENT FAMILY" title="패밀리 상태" description="패밀리 종류와 관할청별 문헌을 한 화면에서 대조합니다." action={<span className="count-badge">{familyCountryCount ? `${familyCountryCount}개 관할청` : '패밀리 없음'}</span>} />
              {caseData.family.length ? (
                <article className="panel family-table"><div className="family-table-head"><span>관할청</span><span>출원번호</span><span>패밀리 종류</span><span>문헌번호</span><span>공개번호</span></div>{caseData.family.map((item, index) => <div className="family-table-row" key={`${item.countryCode}-${item.familyNumber}-${index}`}><div><span className="country-code">{item.countryCode}</span><strong>{item.countryName}</strong></div><code>{item.applicationNumber}</code><span>{item.familyKind}</span><code>{item.literatureNumber}</code><span>{item.publicationNumber}</span></div>)}</article>
              ) : (
                <article className="panel empty-family"><div className="family-orbit empty" aria-hidden="true"><span>KR</span></div><div><span className="eyebrow">PATENT FAMILY</span><h2>패밀리 없음</h2><p><code>patentFamilyInfo</code> 응답에서 확인되는 패밀리 문헌이 없습니다. 응답이 비어 있거나 조회 결과가 없는 경우 임의 데이터를 만들지 않고 ‘패밀리 없음’으로 표시합니다.</p></div></article>
              )}
            </section>
          )}

          {activeView === 'documents' && (
            <section className="detail-view">
              <ViewHeader eyebrow="DOCUMENTS" title="문서함" description="원문과 가공 데이터를 용도별로 확인하고 검토 묶음으로 내보냅니다." action={<button className="export-button" type="button" onClick={() => setPackageOpen(true)}>심사자료 묶음 만들기 ↓</button>} />
              <div className="document-grid">
                <DocumentCard type="XML" title="출원 전문" description="전체 명세서·초록·청구항 읽기 화면" meta={caseData.fullText?.fileName || '열 때 전문파일정보 조회'} state="ready" onOpen={openFullText} action="전체 전문 보기 →" />
                <DocumentCard type="IMG" title="대표도면" description="공보의 대표 이미지" meta={caseData.drawing?.fileName || '대표도면 없음'} state={caseData.drawing ? 'ready' : 'wait'} onOpen={() => setDrawingOpen(true)} action="미리보기 ↗" />
                {caseData.notices.map((notice) => <DocumentCard key={notice.documentNumber} type="PDF" title="의견제출통지서" description={`${formatDate(notice.date)} 발송`} meta={`발송번호 ${notice.documentNumber}`} state="ready" onOpen={() => setSelectedNotice(notice)} action="PDF 열기 ↗" />)}
                <article className="document-card package-card"><span className="document-type">ZIP</span><div><h2>심사자료 묶음</h2><p>요약·청구항·이력·패밀리·원문 목록</p></div><button type="button" onClick={() => setPackageOpen(true)}>구성하기 ↓</button></article>
              </div>
            </section>
          )}
        </div>
        <footer className="dashboard-footer">
          <div><strong>심사데스크</strong><span>KIPRIS Plus 특허 사건 검토 지원 MVP</span></div>
          <p>전문·도면·행정처리·패밀리 데이터는 원 API 응답을 기준으로 표시합니다.</p>
        </footer>
      </section>

      {loading && <div className="loading-overlay" role="status" aria-live="polite"><div className="loader-ring" /><strong>KIPRIS Plus 조회 중</strong><span>서지·전문·도면·패밀리·이력을 함께 가져오고 있습니다.</span></div>}
      {toast && <div className="toast" role="status" aria-live="polite">{toast}</div>}

      {selectedNotice && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setSelectedNotice(null)}>
          <section className="modal pdf-modal" role="dialog" aria-modal="true" aria-labelledby="pdf-title">
            <header><div><span className="eyebrow">OFFICE ACTION · PDF_V2</span><h2 id="pdf-title">의견제출통지서</h2><p>{formatDate(selectedNotice.date)} · {selectedNotice.documentNumber}</p></div><button type="button" onClick={() => setSelectedNotice(null)} aria-label="닫기">×</button></header>
            {selectedPdfUrl ? (
              <><iframe src={selectedPdfUrl} title={`${formatDate(selectedNotice.date)} 의견제출통지서 PDF`} onLoad={() => void fetchApiUsage().then(setApiUsage).catch(() => undefined)} /><footer><span>{selectedNotice.pdf?.fileName || '의견제출통지서.pdf'}</span><a href={selectedPdfUrl} target="_blank" rel="noreferrer">새 창에서 열기 ↗</a></footer></>
            ) : (
              <div className="pdf-placeholder"><div className="paper-preview"><span>특허청</span><h3>의견제출통지서</h3><i>PDF V2</i><dl><dt>출원번호</dt><dd>{caseData.applicationNumber}</dd><dt>발송일자</dt><dd>{formatDate(selectedNotice.date)}</dd><dt>발송번호</dt><dd>{selectedNotice.documentNumber}</dd></dl><p>원문 영역</p></div><div className="integration-note"><span className="eyebrow">API CONNECTION</span><h3>PDF 자동조회 위치</h3><p>서지상세 행정처리의 접수·발송번호를 <code>sendNumber</code>로 전달해 PDF_V2 원문을 이 창에 표시합니다.</p><ul><li>문서명에서 의견제출통지서 감지</li><li>출원번호 + 발송번호로 PDF_V2 호출</li><li>반환된 filePath를 인라인 미리보기</li></ul></div></div>
            )}
          </section>
        </div>
      )}

      {cpcOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setCpcOpen(false)}>
          <section className="modal cpc-modal" role="dialog" aria-modal="true" aria-labelledby="cpc-title">
            <header><div><span className="eyebrow">COOPERATIVE PATENT CLASSIFICATION</span><h2 id="cpc-title">전체 CPC</h2><p>{caseData.applicationNumber} · 총 {caseData.cpc.length}개</p></div><button type="button" onClick={() => setCpcOpen(false)} aria-label="닫기">×</button></header>
            <div className="cpc-modal-body">
              {caseData.cpc.length ? caseData.cpc.map((cpc, index) => (
                <a className="cpc-row" href={cpcSearchUrl(cpc.number)} target="_blank" rel="noreferrer" aria-label={`${cpc.number} CPC 분류 검색, 새 창`} key={`${cpc.number}-${index}`}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <div><strong>{cpc.number} <i aria-hidden="true">↗</i></strong><small>{cpc.date ? `분류일자 ${cpc.date}` : '분류일자 미수신'}</small></div>
                  {index === 0 ? <em>주 CPC</em> : <em>분류 조회</em>}
                </a>
              )) : <p className="cpc-empty">조회된 CPC 정보가 없습니다.</p>}
            </div>
          </section>
        </div>
      )}

      {drawingOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setDrawingOpen(false)}>
          <section className="modal drawing-modal" role="dialog" aria-modal="true" aria-labelledby="drawing-title"><header><div><span className="eyebrow">REPRESENTATIVE DRAWING</span><h2 id="drawing-title">{caseData.title} · 대표도면</h2></div><button type="button" onClick={() => setDrawingOpen(false)} aria-label="닫기">×</button></header><div>{caseData.drawing?.largeUrl ? <img src={caseData.drawing.largeUrl} alt={`${caseData.title} 대표도면 확대`} /> : <p>대표도면이 없습니다.</p>}</div></section>
        </div>
      )}

      {packageOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setPackageOpen(false)}>
          <section className="modal package-modal" role="dialog" aria-modal="true" aria-labelledby="package-title"><header><div><span className="eyebrow">EXPORT PACKAGE</span><h2 id="package-title">심사자료 묶음 만들기</h2><p>{caseData.applicationNumber} · {caseData.title}</p></div><button type="button" onClick={() => setPackageOpen(false)} aria-label="닫기">×</button></header><div className="package-body"><div className="package-options">{([
            ['summary', '사건 요약', '서지·상태·초록 JSON'],
            ['claims', '청구항', `${caseData.claimCount}개 청구항 JSON`],
            ['history', '행정처리 이력', `${caseData.history.length}건 CSV`],
            ['family', '패밀리 정보', `${caseData.family.length}개 문헌 JSON`],
            ['documentLinks', '원문파일 목록', '전문·도면·PDF 조회정보 JSON'],
          ] as const).map(([key, title, description]) => <label key={key}><input type="checkbox" checked={packageOptions[key]} onChange={(event) => setPackageOptions((current) => ({ ...current, [key]: event.target.checked }))} /><span><strong>{title}</strong><small>{description}</small></span></label>)}</div><aside><span className="package-icon">ZIP</span><strong>검토용 데이터 패키지</strong><p>MVP에서는 가공 데이터와 원문 파일 목록을 묶습니다. 실제 원문 바이너리는 API 키 연결 및 접근정책 확정 후 포함합니다.</p></aside></div><footer><button className="text-button" type="button" onClick={() => setPackageOpen(false)}>취소</button><button className="export-button" type="button" onClick={buildPackage} disabled={packageBusy}>{packageBusy ? '묶음 생성 중…' : 'ZIP 다운로드 ↓'}</button></footer></section>
        </div>
      )}
      </main>
    </>
  );
}

function CaseHeading({ data }: { data: PatentCase }) {
  return <section className="case-heading"><div><div className="case-number-row"><span className="case-number">{data.applicationNumber}</span><span className="case-status">{data.status}</span><span className="case-updated">{data.isDemo ? '샘플 사건' : `${data.updatedAt} 갱신`}</span></div><h1>{data.title}</h1><p>{data.titleEnglish}</p></div><div className="applicant-block"><small>출원인</small><strong>{data.applicant}</strong><span>{data.applicantCountry || '국가정보 없음'}</span></div></section>;
}

function PanelHeading({ eyebrow, title, action }: { eyebrow: string; title: string; action?: React.ReactNode }) {
  return <div className="panel-heading"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div>{action}</div>;
}

function ViewHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <header className="view-header"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action}</header>;
}

function DataRow({ label, value, tone }: { label: string; value: string; tone?: 'accent' }) {
  return <div><dt>{label}</dt><dd className={tone === 'accent' ? 'accent-value' : ''}>{value}</dd></div>;
}

function DocumentCard({ type, title, description, meta, state, onOpen, action }: { type: string; title: string; description: string; meta: string; state: 'ready' | 'wait'; onOpen: () => void; action: string }) {
  return <article className="document-card"><div className="document-card-top"><span className={`document-type ${type.toLowerCase()}`}>{type}</span><span className={`document-state ${state}`}>{state === 'ready' ? '준비됨' : '연동 대기'}</span></div><div><h2>{title}</h2><p>{description}</p><code>{meta}</code></div><button type="button" onClick={onOpen}>{action}</button></article>;
}
