import { NextResponse } from 'next/server';
import { getKiprisApiUsage } from '@/app/lib/kipris-usage';

export async function GET() {
  return NextResponse.json(getKiprisApiUsage(), {
    headers: { 'Cache-Control': 'no-store' },
  });
}
