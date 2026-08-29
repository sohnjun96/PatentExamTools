import { NextRequest, NextResponse } from 'next/server';
import { parseClaimChangeHistoryXml, type ClaimChangeHistory } from '@/app/lib/claim-changes';
import {
  getApiUsage,
  getClaimChangeHistory,
  recordApiUsage,
  saveClaimChangeHistory,
  WORKSPACE_USER_ID,
} from '@/app/lib/db';
import { errorResponse } from '@/app/lib/http';
import { recordKiprisApiCall } from '@/app/lib/kipris-usage';
import { getKiprisKey } from '@/app/lib/secrets';

const ENDPOINT = 'https://plus.kipris.or.kr/openapi/rest/ClaimsChangeHistoryService/amendmentHistoryDetailInfo';
const REQUEST_TIMEOUT_MS = 20_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 6;
const requestLog = new Map<string, number[]>();

function rateLimited(request: NextRequest) {
  const key = request.headers.get('cf-connecting-ip')
    ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? 'local';
  const now = Date.now();
  const recent = (requestLog.get(key) ?? []).filter(
    (timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS,
  );
  recent.push(now);
  requestLog.set(key, recent);
  return recent.length > RATE_LIMIT_MAX;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function GET(request: NextRequest) {
  try {
    if (rateLimited(request)) {
      return NextResponse.json(
        { error: '청구항 변동이력 요청이 많습니다. 잠시 후 다시 시도해 주세요.' },
        { status: 429 },
      );
    }

    const applicationNumber = (request.nextUrl.searchParams.get('applicationNumber') ?? '')
      .replace(/\D/g, '');
    if (!/^(10|20)\d{11}$/.test(applicationNumber)) {
      return NextResponse.json(
        { error: '특허·실용신안 출원번호 13자리를 입력해 주세요.' },
        { status: 400 },
      );
    }

    const refresh = request.nextUrl.searchParams.get('refresh') === 'true';
    if (!refresh) {
      const stored = await getClaimChangeHistory<ClaimChangeHistory>(
        WORKSPACE_USER_ID,
        applicationNumber,
      );
      if (stored) {
        return NextResponse.json(
          {
            ...stored.payload,
            applicationNumber,
            fetchedAt: stored.fetchedAt,
            cached: true,
            usage: await getApiUsage(WORKSPACE_USER_ID),
          },
          { headers: { 'Cache-Control': 'private, no-store' } },
        );
      }
    }

    const url = new URL(ENDPOINT);
    url.searchParams.set('applicationNumber', applicationNumber);
    url.searchParams.set('accessKey', getKiprisKey());
    recordKiprisApiCall('청구항변동이력');

    let response: Response;
    try {
      response = await fetch(url, {
        cache: 'no-store',
        headers: { Accept: 'application/xml, text/xml;q=0.9, */*;q=0.8' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } finally {
      await recordApiUsage(
        WORKSPACE_USER_ID,
        'kipris',
        ['청구항변동이력'],
        applicationNumber,
      ).catch(() => undefined);
    }

    if (!response.ok) {
      throw new Error(`KIPRIS Plus 청구항 변동이력 응답 오류 (${response.status})`);
    }

    const xml = await response.text();
    const parsed = parseClaimChangeHistoryXml(xml);
    const payload: ClaimChangeHistory = {
      ...parsed,
      applicationNumber: parsed.applicationNumber || applicationNumber,
    };
    const fetchedAt = new Date().toISOString();
    await saveClaimChangeHistory(
      WORKSPACE_USER_ID,
      applicationNumber,
      await sha256(xml),
      payload,
      fetchedAt,
    );

    return NextResponse.json(
      {
        ...payload,
        fetchedAt,
        cached: false,
        usage: await getApiUsage(WORKSPACE_USER_ID),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

