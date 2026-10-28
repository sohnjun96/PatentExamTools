import { NextRequest, NextResponse } from 'next/server';
import { createPatentDocumentService, parseDocumentRequest, PatentDocumentError } from '@/app/lib/patent-document';
import { getKiprisKey } from '@/app/lib/secrets';
import { HttpError } from '@/app/lib/http';
import { recordKiprisApiCall } from '@/app/lib/kipris-usage';
import { getApiUsage, recordApiUsage, WORKSPACE_USER_ID } from '@/app/lib/db';
import { envValue } from '@/app/lib/runtime-env';
import { patentDocumentCache } from '@/app/lib/patent-document-cache';

export async function GET(request: NextRequest) {
  try {
    const documentRequest = parseDocumentRequest(request.nextUrl.searchParams);
    const refresh = request.nextUrl.searchParams.get('refresh') === '1';
    const service = () => createPatentDocumentService({
      accessKey: getKiprisKey(),
      serviceKey: envValue('KIPRIS_SERVICE_KEY') || undefined,
      onCall: async (operation, applicationNumber) => {
        recordKiprisApiCall(operation);
        await recordApiUsage(WORKSPACE_USER_ID, 'kipris', [operation], applicationNumber);
      },
    });
    if (request.nextUrl.searchParams.get('metadata') === '1') {
      const info = (!refresh && await patentDocumentCache.find(documentRequest)) || await service().metadata(documentRequest);
      const params = new URLSearchParams({ applicationNumber: info.applicationNumber, kind: info.kind, download: '1' });
      if (refresh) params.set('refresh', '1');
      return NextResponse.json({ applicationNumber: info.applicationNumber, kind: info.kind, fileName: info.fileName,
        downloadUrl: `/api/patent/document?${params.toString()}` }, { headers: { 'Cache-Control': 'private, no-store' } });
    }
    const info = await patentDocumentCache.get(documentRequest, () => service().download(documentRequest), refresh);
    return new Response(info.body(), { headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${request.nextUrl.searchParams.get('download') === '1' ? 'attachment' : 'inline'}; filename="${info.fileName}"; filename*=UTF-8''${encodeURIComponent(info.fileName)}`,
      'Content-Length': String(info.byteLength),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-KIPRIS-API-Calls-Total': String((await getApiUsage(WORKSPACE_USER_ID)).total),
      'X-Document-Cache': info.cacheStatus,
      'X-Document-Fetched-At': info.fetchedAt,
    } });
  } catch (error) {
    const known = error instanceof PatentDocumentError || error instanceof HttpError;
    return NextResponse.json({ error: known ? error.message : '전문 PDF를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.' }, {
      status: known ? error.status : 502, headers: { 'Cache-Control': 'private, no-store' },
    });
  }
}
