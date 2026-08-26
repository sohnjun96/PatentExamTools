import { NextRequest, NextResponse } from 'next/server';
import { XMLParser } from 'fast-xml-parser';
import { recordKiprisApiCall } from '@/app/lib/kipris-usage';
import { requireUser } from '@/app/lib/auth';
import { getApiUsage, recordApiUsage } from '@/app/lib/db';
import { errorResponse } from '@/app/lib/http';
import { getKiprisKey } from '@/app/lib/secrets';

const BASE_URL = 'https://plus.kipris.or.kr';
const PDF_INFO_PATH = '/openapi/rest/IntermediateDocumentOPService/pdfInfoV2';
const REQUEST_TIMEOUT_MS = 20_000;

const parser = new XMLParser({
  ignoreAttributes: false,
  parseTagValue: false,
  trimValues: true,
});

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (Array.isArray(value)) return value;
  return value == null ? [] : [value];
}

function text(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value).trim();
  }
  return '';
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

function firstTextByKey(value: unknown, targetKey: string): string {
  const candidate = valuesByKey(value, targetKey)[0];
  if (Array.isArray(candidate)) return text(candidate[0]);
  return text(candidate);
}

function validatedKiprisPdfUrl(rawValue: unknown): string {
  const value = text(rawValue).replace(/^http:/, 'https:');
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'plus.kipris.or.kr' ||
    url.pathname !== '/openapi/fileToss.jsp' ||
    !url.searchParams.has('arg')
  ) {
    throw new Error('허용되지 않은 PDF 파일 경로입니다.');
  }
  return url.toString();
}

function pdfRecord(payload: unknown): UnknownRecord {
  const candidates = valuesByKey(payload, 'pdfInfoV2').flatMap((candidate) =>
    asArray(candidate).map(asRecord),
  );
  return candidates.find((candidate) => Object.keys(candidate).length > 0) ?? {};
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
  if (!response.ok) {
    throw new Error(`PDF_V2 응답 오류 (${response.status})`);
  }

  const parsed = parser.parse(await response.text()) as UnknownRecord;
  const resultCode = firstTextByKey(parsed, 'resultCode');
  if (resultCode && resultCode !== '00') {
    throw new Error(
      firstTextByKey(parsed, 'resultMsg') || `PDF_V2 오류 코드 ${resultCode}`,
    );
  }

  const info = pdfRecord(parsed);
  if (!Object.keys(info).length) throw new Error('PDF_V2 파일 정보가 없습니다.');

  const responseApplicationNumber = text(info.applicationNumber).replace(/\D/g, '');
  const responseSendNumber = text(info.sendNumber).replace(/\D/g, '');
  if (
    (responseApplicationNumber && responseApplicationNumber !== applicationNumber) ||
    (responseSendNumber && responseSendNumber !== sendNumber)
  ) {
    throw new Error('PDF_V2 문서 식별정보가 요청과 일치하지 않습니다.');
  }

  return {
    fileName: text(info.fileName) || `${sendNumber}.pdf`,
    fileUrl: validatedKiprisPdfUrl(info.filePath),
  };
}

export async function GET(request: NextRequest) {
  let user;
  try {
    user = await requireUser(request);
  } catch (error) {
    return errorResponse(error);
  }
  const applicationNumber = (
    request.nextUrl.searchParams.get('applicationNumber') ?? ''
  ).replace(/\D/g, '');
  const sendNumber = (request.nextUrl.searchParams.get('sendNumber') ?? '').replace(
    /\D/g,
    '',
  );

  if (!/^(10|20)\d{11}$/.test(applicationNumber)) {
    return NextResponse.json(
      { error: '특허·실용신안 출원번호 13자리를 확인해 주세요.' },
      { status: 400 },
    );
  }
  if (!/^\d{10,20}$/.test(sendNumber)) {
    return NextResponse.json(
      { error: '의견제출통지서 발송번호를 확인해 주세요.' },
      { status: 400 },
    );
  }

  let accessKey: string;
  try {
    accessKey = await getKiprisKey(user.id);
  } catch (error) {
    return errorResponse(error);
  }

  try {
    await recordApiUsage(
      user.id,
      'kipris',
      ['의견제출통지서 PDF_V2'],
      applicationNumber,
    );
    const metadata = await fetchPdfMetadata(
      applicationNumber,
      sendNumber,
      accessKey,
    );
    const fileResponse = await fetch(metadata.fileUrl, {
      cache: 'no-store',
      headers: { Accept: 'application/pdf, application/octet-stream;q=0.9' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!fileResponse.ok || !fileResponse.body) {
      throw new Error(`의견제출통지서 다운로드 오류 (${fileResponse.status})`);
    }

    const encodedName = encodeURIComponent(metadata.fileName);
    return new Response(fileResponse.body, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename*=UTF-8''${encodedName}`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'X-KIPRIS-API-Calls-Total': String((await getApiUsage(user.id)).total),
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : '의견제출통지서 PDF를 불러오지 못했습니다.',
      },
      { status: 502 },
    );
  }
}
