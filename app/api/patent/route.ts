import { NextRequest, NextResponse } from 'next/server';
import { XMLParser } from 'fast-xml-parser';
import {
  getKiprisApiUsage,
  recordKiprisApiCall,
} from '@/app/lib/kipris-usage';

const parser = new XMLParser({
  ignoreAttributes: false,
  parseTagValue: false,
  trimValues: true,
});

const BASE_URL = 'https://plus.kipris.or.kr';
const REQUEST_TIMEOUT_MS = 15_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 12;

const requestLog = new Map<string, number[]>();

type UnknownRecord = Record<string, unknown>;

type EndpointDefinition = {
  path: string;
  keyParameter: 'ServiceKey' | 'accessKey';
  operation: string;
};

const endpoints: Record<string, EndpointDefinition> = {
  bibliography: {
    path: '/kipo-api/kipi/patUtiModInfoSearchSevice/getBibliographyDetailInfoSearch',
    keyParameter: 'ServiceKey',
    operation: '서지상세',
  },
  cpc: {
    path: '/openapi/rest/patUtiModInfoSearchSevice/patentCpcInfo',
    keyParameter: 'accessKey',
    operation: 'CPC정보',
  },
  drawing: {
    path: '/kipo-api/kipi/patUtiModInfoSearchSevice/getReprsntFloorPlanInfoSearch',
    keyParameter: 'ServiceKey',
    operation: '대표도면',
  },
  family: {
    path: '/openapi/rest/patUtiModInfoSearchSevice/patentFamilyInfo',
    keyParameter: 'accessKey',
    operation: '패밀리정보',
  },
};

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (Array.isArray(value)) return value;
  return value == null ? [] : [value];
}

function firstRecord(value: unknown): UnknownRecord {
  const first = asArray(value as UnknownRecord | UnknownRecord[])[0];
  return asRecord(first);
}

function text(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return '';
}

function secureFileUrl(value: unknown): string {
  return text(value).replace(/^http:/, 'https:');
}

function rateLimited(request: NextRequest): boolean {
  const key =
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'local';
  const now = Date.now();
  const recent = (requestLog.get(key) ?? []).filter(
    (timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS,
  );
  recent.push(now);
  requestLog.set(key, recent);
  return recent.length > RATE_LIMIT_MAX;
}

async function fetchEndpoint(
  definition: EndpointDefinition,
  applicationNumber: string,
  apiKey: string,
) {
  const url = new URL(definition.path, BASE_URL);
  url.searchParams.set('applicationNumber', applicationNumber);
  url.searchParams.set(definition.keyParameter, apiKey);
  recordKiprisApiCall(definition.operation);
  const response = await fetch(url, {
    cache: 'no-store',
    headers: { Accept: 'application/xml, text/xml;q=0.9, */*;q=0.8' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`KIPRIS Plus 응답 오류 (${response.status})`);
  }

  const xml = await response.text();
  const parsed = parser.parse(xml) as UnknownRecord;
  const root = asRecord(parsed.response);
  const header = asRecord(root.header);
  const resultCode = text(header.resultCode);

  if (resultCode && resultCode !== '00') {
    throw new Error(text(header.resultMsg) || `KIPRIS Plus 오류 코드 ${resultCode}`);
  }

  return parsed;
}

function bodyOf(payload: unknown): UnknownRecord {
  return asRecord(asRecord(asRecord(payload).response).body);
}

function normalizeBibliography(payload: unknown) {
  const body = bodyOf(payload);
  const items = asRecord(body.items);
  const item = firstRecord(items.item ?? body.item ?? items);
  const summary = firstRecord(
    asRecord(item.biblioSummaryInfoArray).biblioSummaryInfo ?? item.biblioSummaryInfo,
  );
  const ipc = asArray(
    asRecord(item.ipcInfoArray).ipcInfo ?? item.ipcInfo,
  ).map((entry) => {
    const record = asRecord(entry);
    return { number: text(record.ipcNumber), date: text(record.ipcDate) };
  });
  const claims = asArray(
    asRecord(item.claimInfoArray).claimInfo ?? item.claimInfo,
  ).map((entry, index) => {
    const record = asRecord(entry);
    return { number: index + 1, text: text(record.claim ?? entry) };
  });
  const applicants = asArray(
    asRecord(item.applicantInfoArray).applicantInfo ?? item.applicantInfo,
  ).map((entry) => {
    const record = asRecord(entry);
    return {
      name: text(record.name),
      englishName: text(record.engName),
      country: text(record.country),
      code: text(record.code),
    };
  });
  const inventors = asArray(
    asRecord(item.inventorInfoArray).inventorInfo ?? item.inventorInfo,
  ).map((entry) => {
    const record = asRecord(entry);
    return { name: text(record.name), country: text(record.country) };
  });
  const abstract = firstRecord(
    asRecord(item.abstractInfoArray).abstractInfo ?? item.abstractInfo,
  );

  return {
    applicationNumber: text(summary.applicationNumber),
    applicationDate: text(summary.applicationDate),
    applicationKind: text(summary.originalApplicationKind),
    title: text(summary.inventionTitle),
    titleEnglish: text(summary.inventionTitleEng),
    publicationNumber: text(summary.openNumber),
    publicationDate: text(summary.openDate),
    registrationNumber: text(summary.registerNumber),
    registrationDate: text(summary.registerDate),
    registrationStatus: text(summary.registerStatus),
    finalDisposal: text(summary.finalDisposal),
    examinationRequestDate: text(summary.originalExaminationRequestDate),
    examinerName: text(summary.examinerName),
    claimCount: Number(text(summary.claimCount) || claims.length || 0),
    abstract: text(abstract.astrtCont),
    ipc,
    claims,
    applicants,
    inventors,
  };
}

function normalizeFamily(payload: unknown) {
  const body = bodyOf(payload);
  const items = asRecord(body.items);
  return asArray(items.patentFamilyInfo ?? body.patentFamilyInfo).map((entry) => {
    const record = asRecord(entry);
    return {
      applicationNumber: text(record.applicationNumber),
      countryCode: text(record.countryCode),
      countryName: text(record.countryName),
      familyKind: text(record.familyKind),
      familyNumber: text(record.familyNumber),
      literatureKind: text(record.literatureKind),
      literatureNumber: text(record.literatureNumber),
      publicationNumber: text(record.openingNumber),
    };
  });
}

function normalizeCpc(payload: unknown) {
  const body = bodyOf(payload);
  const items = asRecord(body.items);
  return asArray(items.patentCpcInfo ?? body.patentCpcInfo).map((entry) => {
    const record = asRecord(entry);
    return {
      number: text(record.CooperativepatentclassificationNumber),
      date: text(record.CooperativepatentclassificationDate).replace(/[()]/g, ''),
    };
  }).filter((entry) => entry.number);
}

function normalizeBibliographicLegalStatus(payload: unknown) {
  const body = bodyOf(payload);
  const items = asRecord(body.items);
  const item = firstRecord(items.item ?? body.item ?? items);
  return asArray(
    asRecord(item.legalStatusInfoArray).legalStatusInfo ?? item.legalStatusInfo,
  ).map((entry) => {
    const record = asRecord(entry);
    return {
      receiptNumber: text(record.receiptNumber).replace(/\D/g, ''),
      receiptDate: text(record.receiptDate),
      documentName: text(record.documentName),
      documentEnglishName: text(record.documentEngName),
      status: text(record.commonCodeName),
    };
  }).filter((entry) => entry.documentName);
}

function normalizeDrawing(payload: unknown) {
  const info = asRecord(bodyOf(payload).imagePathInfo);
  return {
    fileName: text(info.docName),
    thumbnailUrl: secureFileUrl(info.path),
    largeUrl: secureFileUrl(info.largePath),
  };
}

export async function GET(request: NextRequest) {
  if (rateLimited(request)) {
    return NextResponse.json(
      { error: '요청이 많습니다. 잠시 후 다시 시도해 주세요.' },
      { status: 429 },
    );
  }

  const rawNumber = request.nextUrl.searchParams.get('applicationNumber') ?? '';
  const applicationNumber = rawNumber.replace(/\D/g, '');

  if (!/^(10|20)\d{11}$/.test(applicationNumber)) {
    return NextResponse.json(
      { error: '특허·실용신안 출원번호 13자리를 입력해 주세요.' },
      { status: 400 },
    );
  }

  const accessKey = process.env.KIPRIS_API_KEY?.trim();
  if (!accessKey || /^your_/i.test(accessKey)) {
    return NextResponse.json(
      {
        error: 'KIPRIS_API_KEY가 아직 설정되지 않았습니다.',
        code: 'API_KEY_MISSING',
        demoApplicationNumber: '1020200093844',
      },
      { status: 503 },
    );
  }
  const serviceKey = process.env.KIPRIS_SERVICE_KEY ?? accessKey;

  const names = Object.keys(endpoints);
  const settled = await Promise.allSettled(
    names.map((name) => {
      const endpoint = endpoints[name];
      return fetchEndpoint(
        endpoint,
        applicationNumber,
        endpoint.keyParameter === 'ServiceKey' ? serviceKey : accessKey,
      );
    }),
  );

  const payloads: Record<string, unknown> = {};
  const sources = names.map((name, index) => {
    const result = settled[index];
    if (result.status === 'fulfilled') {
      payloads[name] = result.value;
      return { name, ok: true, message: '정상 수신' };
    }
    return { name, ok: false, message: result.reason?.message ?? '조회 실패' };
  });

  const bibliography = payloads.bibliography
    ? normalizeBibliography(payloads.bibliography)
    : null;
  const legalStatus = payloads.bibliography
    ? normalizeBibliographicLegalStatus(payloads.bibliography)
    : [];
  const history = legalStatus
    .map((entry) => ({
      documentNumber: entry.receiptNumber,
      date: entry.receiptDate,
      title: entry.documentName,
      titleEnglish: entry.documentEnglishName,
      status: entry.status,
      step: '서지상세',
    }))
    .sort((a, b) =>
      b.date.replace(/\D/g, '').localeCompare(a.date.replace(/\D/g, '')),
    );
  const notices = history.filter(
    (entry) =>
      entry.title.includes('의견제출통지서') && entry.documentNumber.length > 0,
  );

  const response = {
    applicationNumber,
    bibliography,
    cpc: payloads.cpc ? normalizeCpc(payloads.cpc) : [],
    family: payloads.family ? normalizeFamily(payloads.family) : [],
    history,
    legalStatus,
    drawing: payloads.drawing ? normalizeDrawing(payloads.drawing) : null,
    fullText: null,
    notices,
    sources,
    usage: getKiprisApiUsage(),
    fetchedAt: new Date().toISOString(),
  };

  return NextResponse.json(response, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
