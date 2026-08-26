import { NextResponse } from 'next/server';
import { requireUser } from '@/app/lib/auth';
import { errorResponse, HttpError } from '@/app/lib/http';
import { getSecretSettings, updateSecretSettings } from '@/app/lib/secrets';

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    return NextResponse.json(await getSecretSettings(user.id), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const user = await requireUser(request);
    const contentType = request.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
      throw new HttpError(415, 'JSON 요청만 허용됩니다.');
    }
    const input = (await request.json()) as {
      kiprisApiKey?: string;
      openaiApiKey?: string;
      openaiModel?: string;
      clearKipris?: boolean;
      clearOpenAi?: boolean;
    };
    const settings = await updateSecretSettings(user.id, input);
    return NextResponse.json(settings, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
