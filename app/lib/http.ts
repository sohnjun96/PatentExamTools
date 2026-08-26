import { NextResponse } from 'next/server';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

export function errorResponse(error: unknown) {
  if (error instanceof HttpError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  return NextResponse.json(
    {
      error: error instanceof Error ? error.message : '요청을 처리하지 못했습니다.',
    },
    { status: 500, headers: { 'Cache-Control': 'no-store' } },
  );
}
