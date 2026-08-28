import { errorResponse, HttpError } from '@/app/lib/http';
import { loadNoticePdf, noticeIdentifiers } from '@/app/lib/kipris-notice';

export async function GET(request: Request) {
  try {
    const { applicationNumber, sendNumber } = noticeIdentifiers(request);
    const pdf = await loadNoticePdf(applicationNumber, sendNumber);
    const encodedName = encodeURIComponent(pdf.fileName);
    return new Response(pdf.buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename*=UTF-8''${encodedName}`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'X-KIPRIS-API-Calls-Total': String(pdf.usage.total),
      },
    });
  } catch (error) {
    return errorResponse(
      error instanceof HttpError
        ? error
        : new HttpError(
            502,
            error instanceof Error
              ? error.message
              : '의견제출통지서 PDF를 불러오지 못했습니다.',
          ),
    );
  }
}
