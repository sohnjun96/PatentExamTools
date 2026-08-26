import { NextResponse } from 'next/server';
import { getApiUsage, WORKSPACE_USER_ID } from '@/app/lib/db';
import { errorResponse } from '@/app/lib/http';

export async function GET() {
  try {
    return NextResponse.json(await getApiUsage(WORKSPACE_USER_ID), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
