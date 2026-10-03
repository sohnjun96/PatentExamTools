import { NextResponse } from 'next/server';
import { getClaimChangeHistory, WORKSPACE_USER_ID } from '@/app/lib/db';
import { errorResponse } from '@/app/lib/http';
import { assertSameOrigin } from '@/app/lib/api-protection';
import { workflowCase, storedRoundLinks, saveRoundLink } from '@/app/lib/workflow-store';
import type { RoundDocumentLink } from '@/app/lib/examination-model';
import type { ClaimChangeHistory } from '@/app/lib/claim-changes';

export async function GET(request: Request) {
  try {
    const application = new URL(request.url).searchParams.get('applicationNumber') ?? '';
    const stored = await workflowCase(application);
    return NextResponse.json({ links: await storedRoundLinks(application, stored.payload.history ?? []) }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return errorResponse(error); }
}
export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const application = new URL(request.url).searchParams.get('applicationNumber') ?? '';
    const input = await request.json() as RoundDocumentLink;
    const changes = await getClaimChangeHistory<ClaimChangeHistory>(WORKSPACE_USER_ID, application);
    const verified = new Set((changes?.payload.documents ?? []).filter((document) => document.changes.length).map((document) => document.documentNumber));
    return NextResponse.json({ links: await saveRoundLink(application, input, verified) });
  } catch (error) { return errorResponse(error); }
}
