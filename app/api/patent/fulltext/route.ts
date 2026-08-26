import { NextRequest, NextResponse } from 'next/server';
import { XMLParser } from 'fast-xml-parser';
import demoFullText from '@/app/data/demo-fulltext.json';
import { recordKiprisApiCall } from '@/app/lib/kipris-usage';
import { getApiUsage, recordApiUsage, WORKSPACE_USER_ID } from '@/app/lib/db';
import { errorResponse } from '@/app/lib/http';
import { getKiprisKey } from '@/app/lib/secrets';

const BASE_URL = 'https://plus.kipris.or.kr';
const METADATA_PATH =
  '/openapi/rest/patUtiModInfoSearchSevice/patentFullTextFileInfo';
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_FULL_TEXT_BYTES = 8 * 1024 * 1024;
const LINE_BREAK_TOKEN = '\uE000KIPRIS_BR\uE001';

const parser = new XMLParser({
  ignoreAttributes: false,
  parseTagValue: false,
  trimValues: false,
  textNodeName: '#text',
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

function plainText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(plainText).filter(Boolean).join(' ');
  }

  return Object.entries(asRecord(value))
    .filter(([key]) => !key.startsWith('@_') && key !== '?xml')
    .map(([key, child]) => (key === 'br' ? '\n' : plainText(child)))
    .filter(Boolean)
    .join(' ');
}

function cleanText(value: unknown): string {
  return plainText(value)
    .replaceAll(LINE_BREAK_TOKEN, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function preserveExplicitLineBreaks(xml: string): string {
  return xml
    .replace(/<br\b[^>]*>\s*<\/br\s*>/gi, LINE_BREAK_TOKEN)
    .replace(/<br\b[^>]*\/\s*>/gi, LINE_BREAK_TOKEN);
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
  return cleanText(candidate);
}

function recordsByKeys(value: unknown, keys: string[]): UnknownRecord[] {
  return keys.flatMap((key) =>
    valuesByKey(value, key).flatMap((candidate) =>
      asArray(candidate).map(asRecord).filter((record) => Object.keys(record).length),
    ),
  );
}

function validatedKiprisFileUrl(rawValue: unknown): string {
  const value = cleanText(rawValue).replace(/^http:/, 'https:');
  const url = new URL(value);
  const isAllowedPath =
    url.pathname === '/openapi/fileToss.jsp' ||
    url.pathname === '/kiprisplusws/fileToss.jsp';

  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'plus.kipris.or.kr' ||
    !isAllowedPath ||
    !url.searchParams.has('arg')
  ) {
    throw new Error('허용되지 않은 전문파일 경로입니다.');
  }
  return url.toString();
}

function decodePatentXml(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const prefix = Array.from(bytes.slice(0, 256), (byte) =>
    String.fromCharCode(byte),
  ).join('');
  const declaredEncoding =
    prefix.match(/encoding\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase() ??
    'utf-8';
  const decoderLabel = /euc[-_]?kr|ks_c_5601|ksx1001/i.test(declaredEncoding)
    ? 'euc-kr'
    : 'utf-8';

  try {
    return new TextDecoder(decoderLabel, { fatal: false }).decode(bytes);
  } catch {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  }
}

function normalizeParagraphNumber(value: unknown): string | null {
  const number = cleanText(value);
  if (!number) return null;
  return /^\d+$/.test(number) ? number.padStart(4, '0') : number;
}

function paragraphsFrom(value: unknown) {
  const paragraphs = valuesByKey(value, 'p').flatMap(asArray);
  if (paragraphs.length === 0) {
    const fallback = cleanText(value);
    return fallback ? [{ number: null, text: fallback }] : [];
  }
  return paragraphs
    .map((paragraph) => {
      const record = asRecord(paragraph);
      return {
        number: normalizeParagraphNumber(record['@_num']),
        text: cleanText(paragraph),
      };
    })
    .filter((paragraph) => paragraph.text);
}

function normalizeFullTextXml(
  xml: string,
  applicationNumber: string,
  sourceFileName: string,
) {
  // fast-xml-parser groups mixed child tags by name, so the original position
  // of <br/> is lost unless it is converted to text before parsing.
  const parsed = parser.parse(preserveExplicitLineBreaks(xml)) as UnknownRecord;
  const resultCode = firstTextByKey(parsed, 'resultCode');
  if (resultCode && resultCode !== '00') {
    throw new Error(
      firstTextByKey(parsed, 'resultMsg') || `전문파일 오류 코드 ${resultCode}`,
    );
  }

  const sectionDefinitions = [
    ['technical-field', '기술분야'],
    ['background-art', '배경기술'],
    ['summary-of-invention', '발명의 내용'],
    ['description-of-drawings', '도면의 간단한 설명'],
    ['description-of-embodiments', '발명을 실시하기 위한 구체적인 내용'],
    ['reference-signs-list', '부호의 설명'],
  ] as const;

  const sections = sectionDefinitions
    .map(([id, title]) => {
      const node = valuesByKey(parsed, id)[0];
      return { id, title, paragraphs: paragraphsFrom(node) };
    })
    .filter((section) => section.paragraphs.length > 0);

  const claimNodes = valuesByKey(parsed, 'claim').flatMap(asArray);
  const claims = claimNodes
    .map((claim, index) => {
      const record = asRecord(claim);
      return {
        number: Number(record['@_num']) || index + 1,
        text: cleanText(record['claim-text'] ?? claim),
      };
    })
    .filter((claim) => claim.text);

  const abstractNode = valuesByKey(parsed, 'abstract')[0];
  const figureCount = valuesByKey(parsed, 'figure').flatMap(asArray).length;

  return {
    applicationNumber,
    title: firstTextByKey(parsed, 'invention-title') || '발명의 명칭 미수신',
    abstract: paragraphsFrom(abstractNode),
    sections,
    claims,
    figureCount,
    sourceFileName,
    isDemo: false,
    fetchedAt: new Date().toISOString(),
  };
}

async function fetchFullTextMetadata(applicationNumber: string, accessKey: string) {
  const url = new URL(METADATA_PATH, BASE_URL);
  url.searchParams.set('applicationNumber', applicationNumber);
  url.searchParams.set('accessKey', accessKey);

  recordKiprisApiCall('전문파일정보');
  const response = await fetch(url, {
    cache: 'no-store',
    headers: { Accept: 'application/xml, text/xml;q=0.9, */*;q=0.8' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`전문파일정보 응답 오류 (${response.status})`);
  }

  const parsed = parser.parse(await response.text()) as UnknownRecord;
  const resultCode = firstTextByKey(parsed, 'resultCode');
  if (resultCode && resultCode !== '00') {
    throw new Error(
      firstTextByKey(parsed, 'resultMsg') || `전문파일정보 오류 코드 ${resultCode}`,
    );
  }

  const candidates = recordsByKeys(parsed, ['fullTextFileInfo', 'filePathInfo']);
  const selected =
    candidates.find((candidate) => cleanText(candidate.docName).endsWith('.xml')) ??
    candidates[0];
  if (!selected) throw new Error('전문 XML 파일 경로가 없습니다.');

  return {
    fileName: cleanText(selected.docName) || `${applicationNumber}.xml`,
    fileUrl: validatedKiprisFileUrl(selected.path),
  };
}

export async function GET(request: NextRequest) {
  const rawNumber = request.nextUrl.searchParams.get('applicationNumber') ?? '';
  const applicationNumber = rawNumber.replace(/\D/g, '');

  if (!/^(10|20)\d{11}$/.test(applicationNumber)) {
    return NextResponse.json(
      { error: '특허·실용신안 출원번호 13자리를 입력해 주세요.' },
      { status: 400 },
    );
  }

  if (applicationNumber === demoFullText.applicationNumber) {
    return NextResponse.json(demoFullText, {
      headers: { 'Cache-Control': 'private, max-age=300' },
    });
  }

  let accessKey: string;
  try {
    accessKey = getKiprisKey();
  } catch (error) {
    return errorResponse(error);
  }

  try {
    await recordApiUsage(
      WORKSPACE_USER_ID,
      'kipris',
      ['전문파일정보'],
      applicationNumber,
    );
    const metadata = await fetchFullTextMetadata(applicationNumber, accessKey);
    const fileResponse = await fetch(metadata.fileUrl, {
      cache: 'no-store',
      headers: { Accept: 'application/xml, text/xml;q=0.9, */*;q=0.8' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!fileResponse.ok) {
      throw new Error(`전문 XML 다운로드 오류 (${fileResponse.status})`);
    }

    const announcedLength = Number(fileResponse.headers.get('content-length') || 0);
    if (announcedLength > MAX_FULL_TEXT_BYTES) {
      throw new Error('전문 XML 파일이 허용 크기를 초과했습니다.');
    }

    const buffer = await fileResponse.arrayBuffer();
    if (buffer.byteLength > MAX_FULL_TEXT_BYTES) {
      throw new Error('전문 XML 파일이 허용 크기를 초과했습니다.');
    }

    const payload = normalizeFullTextXml(
      decodePatentXml(buffer),
      applicationNumber,
      metadata.fileName,
    );
    return NextResponse.json({ ...payload, usage: await getApiUsage(WORKSPACE_USER_ID) }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : '전문파일을 불러오지 못했습니다.',
      },
      { status: 502 },
    );
  }
}
