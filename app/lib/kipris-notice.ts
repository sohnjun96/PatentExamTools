import { XMLParser } from 'fast-xml-parser';
import { getApiUsage, recordApiUsage, WORKSPACE_USER_ID } from '@/app/lib/db';
import { recordKiprisApiCall } from '@/app/lib/kipris-usage';
import { getKiprisKey } from '@/app/lib/secrets';

const BASE_URL = 'https://plus.kipris.or.kr';
const PDF_INFO_PATH = '/openapi/rest/IntermediateDocumentOPService/pdfInfoV2';
const REQUEST_TIMEOUT_MS = 25_000;
const MAX_NOTICE_PDF_BYTES = 20 * 1024 * 1024;

const parser = new XMLParser({
  ignoreAttributes: false,
  parseTagValue: false,
  trimValues: true,
});

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : {};
}

function asArray<T>(value: T | T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : value == null ? [] : [value];
}

function text(value: unknown) {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value).trim()
    : '';
}

function valuesByKey(value: unknown, targetKey: string, found: unknown[] = []) {
  if (Array.isArray(value)) {
    value.forEach((item) => valuesByKey(item, targetKey, found));
    return found;
  }
  if (!value || typeof value !== 'object') return found;
  Object.entries(value as UnknownRecord).forEach(([key, child]) => {
    if (key === targetKey) found.push(child);
    valuesByKey(child, targetKey, found);
  });
  return found;
}

function firstTextByKey(value: unknown, targetKey: string) {
  const candidate = valuesByKey(value, targetKey)[0];
  return Array.isArray(candidate) ? text(candidate[0]) : text(candidate);
}

function validatedKiprisPdfUrl(rawValue: unknown) {
  const url = new URL(text(rawValue).replace(/^http:/, 'https:'));
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'plus.kipris.or.kr' ||
    url.pathname !== '/openapi/fileToss.jsp' ||
    !url.searchParams.has('arg')
  ) throw new Error('허용되지 않은 PDF 파일 경로입니다.');
  return url.toString();
}

function pdfRecord(payload: unknown) {
  const candidates = valuesByKey(payload, 'pdfInfoV2').flatMap((candidate) =>
    asArray(candidate).map(asRecord),
  );
  return candidates.find((candidate) => Object.keys(candidate).length > 0) ?? {};
}

function validateIdentifiers(applicationNumber: string, sendNumber: string) {
  if (!/^(10|20)\d{11}$/.test(applicationNumber)) {
    throw new Error('특허·실용신안 출원번호 13자리를 확인해 주세요.');
  }
  if (!/^\d{10,20}$/.test(sendNumber)) {
    throw new Error('의견제출통지서 발송번호를 확인해 주세요.');
  }
}

async function fetchPdfMetadata(
  applicationNumber: string,
  sendNumber: string,
  accessKey: string,
) {
  const url = new URL(PDF_INFO_PATH, BASE_URL);
  url.searchParams.set('applicationNumber', applicationNumber);
  url.searchParams.set('sendNumber', sendNumber);
  url.searchParams.set('accessKey', accessKey);

  recordKiprisApiCall('의견제출통지서 PDF_V2');
  const response = await fetch(url, {
    cache: 'no-store',
    headers: { Accept: 'application/xml, text/xml;q=0.9, */*;q=0.8' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`PDF_V2 응답 오류 (${response.status})`);

  const parsed = parser.parse(await response.text()) as UnknownRecord;
  const resultCode = firstTextByKey(parsed, 'resultCode');
  if (resultCode && resultCode !== '00') {
    throw new Error(firstTextByKey(parsed, 'resultMsg') || `PDF_V2 오류 코드 ${resultCode}`);
  }

  const info = pdfRecord(parsed);
  if (!Object.keys(info).length) throw new Error('PDF_V2 파일 정보가 없습니다.');
  const responseApplicationNumber = text(info.applicationNumber).replace(/\D/g, '');
  const responseSendNumber = text(info.sendNumber).replace(/\D/g, '');
  if (
    (responseApplicationNumber && responseApplicationNumber !== applicationNumber) ||
    (responseSendNumber && responseSendNumber !== sendNumber)
  ) throw new Error('PDF_V2 문서 식별정보가 요청과 일치하지 않습니다.');

  return {
    fileName: text(info.fileName) || `${sendNumber}.pdf`,
    fileUrl: validatedKiprisPdfUrl(info.filePath),
  };
}

export function noticeIdentifiers(request: Request) {
  const url = new URL(request.url);
  const applicationNumber = (url.searchParams.get('applicationNumber') ?? '').replace(/\D/g, '');
  const sendNumber = (url.searchParams.get('sendNumber') ?? '').replace(/\D/g, '');
  validateIdentifiers(applicationNumber, sendNumber);
  return { applicationNumber, sendNumber };
}

export async function loadNoticePdf(applicationNumber: string, sendNumber: string) {
  validateIdentifiers(applicationNumber, sendNumber);
  const accessKey = getKiprisKey();
  await recordApiUsage(
    WORKSPACE_USER_ID,
    'kipris',
    ['의견제출통지서 PDF_V2'],
    applicationNumber,
  );
  const metadata = await fetchPdfMetadata(applicationNumber, sendNumber, accessKey);
  const response = await fetch(metadata.fileUrl, {
    cache: 'no-store',
    headers: { Accept: 'application/pdf, application/octet-stream;q=0.9' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`의견제출통지서 다운로드 오류 (${response.status})`);

  const announcedLength = Number(response.headers.get('content-length') || 0);
  if (announcedLength > MAX_NOTICE_PDF_BYTES) {
    throw new Error('의견제출통지서 PDF가 허용 크기를 초과했습니다.');
  }
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_NOTICE_PDF_BYTES) {
    throw new Error('의견제출통지서 PDF가 허용 크기를 초과했습니다.');
  }
  const header = new Uint8Array(buffer.slice(0, 5));
  if (String.fromCharCode(...header) !== '%PDF-') {
    throw new Error('PDF_V2 응답이 올바른 PDF 파일이 아닙니다.');
  }
  return {
    ...metadata,
    buffer,
    usage: await getApiUsage(WORKSPACE_USER_ID),
  };
}
