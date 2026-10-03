import { NextResponse } from 'next/server';
import { appDatabase, getPatentCase, WORKSPACE_USER_ID } from '@/app/lib/db';
import { errorResponse, HttpError } from '@/app/lib/http';
import { assertSameOrigin } from '@/app/lib/api-protection';
import { workflowCase } from '@/app/lib/workflow-store';
import { normalizeCandidate, type CandidateDocument } from '@/app/lib/candidate-documents';

async function list(application: string) {
  const db = await appDatabase();
  const rows = await db.prepare("SELECT document_json FROM candidate_documents WHERE user_id = ? AND application_number = ? AND review_status != 'rejected' ORDER BY created_at")
    .bind(WORKSPACE_USER_ID, application).all<{ document_json: string }>();
  return rows.results.map((row) => JSON.parse(row.document_json) as CandidateDocument);
}
export async function GET(request: Request) {
  try {
    const application = new URL(request.url).searchParams.get('applicationNumber') ?? '';
    await workflowCase(application);
    return NextResponse.json({ candidates: await list(application) }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return errorResponse(error); }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const application = new URL(request.url).searchParams.get('applicationNumber') ?? '';
    await workflowCase(application);
    const stored = await getPatentCase<{ bibliography?: { applicationDate?: string } }>(WORKSPACE_USER_ID, application);
    let value: CandidateDocument;
    try { value = normalizeCandidate(await request.json(), stored?.payload.bibliography?.applicationDate ?? ''); }
    catch (error) { throw new HttpError(400, error instanceof Error ? error.message : '문헌 입력값을 확인해 주세요.'); }
    const current = await list(application);
    if (current.length >= 100 && !current.some((item) => item.id === value.id)) throw new HttpError(400, '후보문헌은 사건당 최대 100건까지 저장할 수 있습니다.');
    const db = await appDatabase();
    await db.prepare(`INSERT INTO candidate_documents (user_id, application_number, document_key, document_json, review_status)
      VALUES (?, ?, ?, ?, 'reviewing') ON CONFLICT(user_id, application_number, document_key) DO UPDATE SET
      document_json = excluded.document_json, review_status = 'reviewing', updated_at = CURRENT_TIMESTAMP`)
      .bind(WORKSPACE_USER_ID, application, value.id, JSON.stringify(value)).run();
    return NextResponse.json({ candidates: await list(application) });
  } catch (error) { return errorResponse(error); }
}
export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const url = new URL(request.url);
    const application = url.searchParams.get('applicationNumber') ?? '';
    await workflowCase(application);
    const db = await appDatabase();
    await db.prepare("UPDATE candidate_documents SET review_status = 'rejected', updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND application_number = ? AND document_key = ?")
      .bind(WORKSPACE_USER_ID, application, url.searchParams.get('id') ?? '').run();
    return NextResponse.json({ candidates: await list(application) });
  } catch (error) { return errorResponse(error); }
}
