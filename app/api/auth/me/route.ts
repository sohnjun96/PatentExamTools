import { NextResponse } from 'next/server';
import { accessLogoutUrl, requireUser } from '@/app/lib/auth';
import { errorResponse } from '@/app/lib/http';

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    return NextResponse.json(
      { user, logoutUrl: accessLogoutUrl() },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
