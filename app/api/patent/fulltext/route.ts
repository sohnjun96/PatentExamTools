import { NextRequest, NextResponse } from 'next/server';
import { reserveProviderCall } from '@/app/lib/api-protection';
import { XMLParser } from 'fast-xml-parser';
import demoFullText from '@/app/data/demo-fulltext.json';
import { recordKiprisApiCall } from '@/app/lib/kipris-usage';
import { getApiUsage, recordApiUsage, WORKSPACE_USER_ID } from '@/app/lib/db';
import { errorResponse, HttpError } from '@/app/lib/http';
import { normalizeFullTextXml } from '@/app/lib/fulltext-xml';
import { FULLTEXT_PARSER_VERSION } from '@/app/lib/fulltext-version';
import { getKiprisKey } from '@/app/lib/secrets';
import { documentSingleFlight, readDocument, saveDocument } from '@/app/lib/document-cache';
import { documentHash } from '@/app/lib/document-cache-core';

const BASE_URL = 'https://plus.kipris.or.kr';
const METADATA_PATH =
  '/openapi/rest/patUtiModInfoSearchSevice/patentFullTextFileInfo';
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_FULL_TEXT_BYTES = 8 * 1024 * 1024;

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
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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

async function fetchFullTextMetadata(applicationNumber: string, accessKey: string) {
  const url = new URL(METADATA_PATH, BASE_URL);
  url.searchParams.set('applicationNumber', applicationNumber);
  url.searchParams.set('accessKey', accessKey);

  await reserveProviderCall('kipris');
  await recordApiUsage(WORKSPACE_USER_ID, 'kipris', ['전문파일정보'], applicationNumber);
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

  try {
    const refresh = request.nextUrl.searchParams.get('refresh') === 'true';
    const cachedOnly = request.nextUrl.searchParams.get('cachedOnly') === 'true';
    const original = await documentSingleFlight(`fulltext:${applicationNumber}:${refresh}:${cachedOnly}`, async () => {
      if (!refresh) {
        const cached = await readDocument(`fulltext:${applicationNumber}`);
        if (cached) return { ...cached, cached: true };
      }
      if (cachedOnly) throw new HttpError(404, '저장된 XML 원문이 없습니다.');
      const accessKey = getKiprisKey();
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
      const bytes = new Uint8Array(buffer);
      const document = { bytes, fileName: metadata.fileName, mimeType: 'application/xml',
        sourceHash: await documentHash(bytes), fetchedAt: new Date().toISOString(), metadata: {} };
      // Only cache files after successfully parsing/validating them.
      normalizeFullTextXml(decodePatentXml(buffer), applicationNumber, metadata.fileName);
      await saveDocument(`fulltext:${applicationNumber}`, applicationNumber, document);
      return { ...document, cached: false };
    });
    if (request.nextUrl.searchParams.get('raw') === 'true') {
      return new Response(original.bytes.slice().buffer, { headers: {
        'Content-Type': 'application/xml', 'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(original.fileName)}`,
        'Cache-Control': 'private, no-store',
      } });
    }
    const payload = normalizeFullTextXml(
      decodePatentXml(original.bytes.slice().buffer),
      applicationNumber,
      original.fileName,
    );
    return NextResponse.json({ ...payload, fetchedAt: original.fetchedAt, sourceHash: original.sourceHash,
      cached: original.cached, parserVersion: FULLTEXT_PARSER_VERSION,
      sourceFileUrl: `/api/patent/fulltext?applicationNumber=${applicationNumber}&raw=true`,
      usage: await getApiUsage(WORKSPACE_USER_ID) }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
