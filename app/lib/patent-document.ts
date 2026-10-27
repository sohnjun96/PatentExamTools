import { XMLParser } from 'fast-xml-parser';

export type PatentDocumentKind = 'publication' | 'registration';
export type PatentNumberType = 'application' | 'publication' | 'registration';
export type PatentDocumentRequest = {
  number: string;
  numberType: PatentNumberType;
  kind: PatentDocumentKind;
};
export class PatentDocumentError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const BASE_URL = 'https://plus.kipris.or.kr';
const REST_SERVICE_PATH = '/openapi/rest/patUtiModInfoSearchSevice/';
const GATEWAY_SERVICE_PATH = '/kipo-api/kipi/patUtiModInfoSearchSevice/';
const MAX_PDF_BYTES = 32 * 1024 * 1024;
const MAX_METADATA_BYTES = 2 * 1024 * 1024;
const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: false, trimValues: true });
type RecordValue = Record<string, unknown>;
type Fetcher = typeof fetch;

function record(value: unknown): RecordValue {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};
}
function text(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}
function allRecords(value: unknown): RecordValue[] {
  if (Array.isArray(value)) return value.flatMap(allRecords);
  if (!value || typeof value !== 'object') return [];
  return [record(value), ...Object.values(record(value)).flatMap(allRecords)];
}
function firstValue(value: unknown, key: string): string {
  return allRecords(value).map(entry => text(entry[key])).find(Boolean) ?? '';
}

export function parseDocumentRequest(params: URLSearchParams): PatentDocumentRequest {
  const kind = params.get('kind') ?? 'publication';
  if (kind !== 'publication' && kind !== 'registration') {
    throw new PatentDocumentError(400, '공개전문 또는 등록공고 전문을 선택해 주세요.');
  }
  const application = params.get('applicationNumber');
  const numberType = application ? 'application' : params.get('numberType');
  if (!['application', 'publication', 'registration'].includes(numberType ?? '')) {
    throw new PatentDocumentError(400, '문헌번호가 출원번호인지 공개번호인지 등록번호인지 선택해 주세요.');
  }
  const raw = (application ?? params.get('documentNumber') ?? '').trim().toUpperCase();
  const prefix = raw.replace(/^KR\s*/, '').replace(/\s*[ABUY]\d?$/, '');
  if (!/^[\d\s-]+$/.test(prefix)) {
    throw new PatentDocumentError(400, '한국 특허·실용신안 번호를 입력해 주세요. 해외 문헌은 원문 제공처에서 확인해 주세요.');
  }
  let number = prefix.replace(/[\s-]/g, '');
  if (numberType === 'registration') {
    if (/^(10|20)\d{7}$/.test(number)) number += '0000';
    if (!/^(10|20)\d{7}0000$/.test(number)) {
      throw new PatentDocumentError(400, '등록번호 형식을 확인해 주세요. 예: 10-2345678');
    }
  } else if (!/^(10|20)\d{11}$/.test(number)) {
    throw new PatentDocumentError(400, '특허·실용신안 출원번호 또는 공개번호 13자리를 확인해 주세요.');
  }
  return { number, numberType: numberType as PatentNumberType, kind };
}

export function validatedDocumentUrl(raw: unknown): string {
  let url: URL;
  try { url = new URL(text(raw).replace(/^http:/i, 'https:')); }
  catch { throw new PatentDocumentError(502, 'KIPRIS Plus 전문 PDF 경로를 확인할 수 없습니다.'); }
  if (url.protocol !== 'https:' || url.hostname !== 'plus.kipris.or.kr' || url.port ||
      url.username || url.password || url.hash ||
      !['/openapi/fileToss.jsp', '/kiprisplusws/fileToss.jsp'].includes(url.pathname) ||
      !url.searchParams.get('arg')) {
    throw new PatentDocumentError(502, '허용되지 않은 KIPRIS Plus 전문 PDF 경로입니다.');
  }
  return url.toString();
}

async function boundedBytes(response: Response, maxBytes: number): Promise<Uint8Array> {
  if (Number(response.headers.get('content-length') ?? 0) > maxBytes) {
    throw new PatentDocumentError(502, '전문 파일이 허용 크기를 초과했습니다.');
  }
  if (!response.body) throw new PatentDocumentError(502, '전문 파일 응답이 비어 있습니다.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) {
        await reader.cancel();
        throw new PatentDocumentError(502, '전문 파일이 허용 크기를 초과했습니다.');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

export function assertPdfBytes(bytes: Uint8Array): void {
  if (new TextDecoder('ascii').decode(bytes.slice(0, 5)) !== '%PDF-') {
    throw new PatentDocumentError(502, 'KIPRIS Plus에서 PDF 원문 대신 오류 또는 다른 형식의 파일을 반환했습니다.');
  }
}

/** Inject fetch and onCall so upstream behavior can be verified without credentials. */
export function createPatentDocumentService(options: {
  accessKey: string;
  serviceKey?: string;
  fetcher?: Fetcher;
  onCall?: (operation: string, applicationNumber?: string) => void | Promise<void>;
}) {
  const fetcher = options.fetcher ?? fetch;
  async function fetchMetadata(operation: string, parameters: Record<string, string>, label: string) {
    const gateway = operation === 'getPubFullTextInfoSearch' || operation === 'getAnnFullTextInfoSearch';
    const url = new URL((gateway ? GATEWAY_SERVICE_PATH : REST_SERVICE_PATH) + operation, BASE_URL);
    for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);
    url.searchParams.set(gateway ? 'ServiceKey' : 'accessKey', gateway ? options.serviceKey || options.accessKey : options.accessKey);
    await options.onCall?.(label, parameters.applicationNumber);
    const response = await fetcher(url, {
      cache: 'no-store', redirect: 'manual',
      headers: { Accept: 'application/xml, text/xml;q=0.9' },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new PatentDocumentError(502, `KIPRIS Plus ${label} 조회에 실패했습니다. (${response.status})`);
    const bytes = await boundedBytes(response, MAX_METADATA_BYTES);
    const payload: unknown = parser.parse(new TextDecoder().decode(bytes));
    const code = firstValue(payload, 'resultCode');
    if (code && code !== '00') {
      // Never relay raw upstream diagnostics: they can include the credential URL.
      throw new PatentDocumentError(502, `KIPRIS Plus ${label} 조회 오류입니다. API 이용 권한과 제공 여부를 확인해 주세요.`);
    }
    return payload;
  }

  async function resolveApplicationNumber(request: PatentDocumentRequest): Promise<string> {
    if (request.numberType === 'application') return request.number;
    const isPublication = request.numberType === 'publication';
    const parameter = isPublication ? 'openNumber' : 'registerNumber';
    const operation = isPublication ? 'openNumberSearchInfo' : 'registrationNumberSearchInfo';
    const payload = await fetchMetadata(operation, {
      [parameter]: request.number, docsStart: '1',
    }, isPublication ? '공개번호 검색' : '등록번호 검색');
    const matching = allRecords(payload).filter(entry => {
      const candidateNumber = text(isPublication ? entry.OpeningNumber ?? entry.openNumber : entry.RegistrationNumber ?? entry.registerNumber ?? entry.registrationNumber).replace(/\D/g, '');
      return candidateNumber === request.number && /^(10|20)\d{11}$/.test(text(entry.ApplicationNumber ?? entry.applicationNumber).replace(/\D/g, ''));
    });
    const applications = [...new Set(matching.map(entry => text(entry.ApplicationNumber ?? entry.applicationNumber).replace(/\D/g, '')))];
    if (applications.length !== 1) {
      throw new PatentDocumentError(404, '문헌번호와 정확히 일치하는 출원을 확인하지 못했습니다. 출원번호를 확인한 뒤 다시 시도해 주세요.');
    }
    return applications[0];
  }

  async function metadata(request: PatentDocumentRequest) {
    const applicationNumber = await resolveApplicationNumber(request);
    const publication = request.kind === 'publication';
    const payload = await fetchMetadata(
      publication ? 'getPubFullTextInfoSearch' : 'getAnnFullTextInfoSearch',
      { applicationNumber }, publication ? '공개전문 PDF' : '등록공고전문 PDF',
    );
    const responseApplication = firstValue(payload, 'applicationNumber').replace(/\D/g, '');
    if (responseApplication && responseApplication !== applicationNumber) {
      throw new PatentDocumentError(502, '전문 PDF의 출원번호가 요청과 일치하지 않습니다.');
    }
    const candidate = allRecords(payload).find(entry => text(entry.path ?? entry.filePath));
    if (!candidate) {
      throw new PatentDocumentError(404, `${publication ? '공개' : '등록공고'} 전문 PDF가 제공되지 않습니다. 공개·등록 여부 또는 API 이용 권한을 확인해 주세요.`);
    }
    return {
      applicationNumber, kind: request.kind,
      fileName: `${applicationNumber}_${publication ? 'publication' : 'registration'}.pdf`,
      fileUrl: validatedDocumentUrl(candidate.path ?? candidate.filePath),
    };
  }

  async function download(request: PatentDocumentRequest) {
    const info = await metadata(request);
    const response = await fetcher(info.fileUrl, {
      cache: 'no-store', redirect: 'manual', headers: { Accept: 'application/pdf, application/octet-stream;q=0.9' },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new PatentDocumentError(502, `전문 PDF 다운로드에 실패했습니다. (${response.status})`);
    const bytes = await boundedBytes(response, MAX_PDF_BYTES);
    assertPdfBytes(bytes);
    return { ...info, bytes };
  }
  return { metadata, download, resolveApplicationNumber };
}
