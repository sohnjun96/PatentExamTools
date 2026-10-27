import { NextRequest, NextResponse } from 'next/server';
import { EvaluationError, visibleState, type EvaluationActor, type EvaluationAction } from '@/app/lib/evaluation';
import { readEvaluationState, mutateEvaluationState } from '@/app/lib/evaluation-store';

const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };

function failure(error: unknown, operation: 'load' | 'save') {
  const status = error instanceof EvaluationError ? error.status : error instanceof SyntaxError ? 400 : 500;
  const message = error instanceof EvaluationError
    ? error.message
    : error instanceof SyntaxError
      ? '전송한 입력 내용을 확인할 수 없습니다. 입력을 보관한 뒤 최신 자료를 불러와 다시 시도해 주세요.'
      : operation === 'load'
        ? '평가 자료를 불러오지 못했습니다. 잠시 후 새로고침해 주세요. 계속되면 관리자에게 문의해 주세요.'
        : '평가 자료를 저장하지 못했습니다. 입력 내용은 이 화면에 남아 있습니다. 잠시 후 다시 저장해 주세요. 계속되면 관리자에게 문의해 주세요.';
  return NextResponse.json({ error: message }, { status, headers });
}

export async function GET(request: NextRequest) {
  try {
    const actor: EvaluationActor = { admin: request.nextUrl.searchParams.get('admin') === '1', userId: request.nextUrl.searchParams.get('userId') ?? undefined };
    const current = await readEvaluationState();
    return NextResponse.json({ revision: current.revision, state: visibleState(current.state, actor) }, { headers });
  } catch (error) { return failure(error, 'load'); }
}

export async function POST(request: NextRequest) {
  try {
    // One action publishes a whole selection, result bundle or evaluation in a
    // single compare-and-swap update, so interrupted requests cannot publish rows.
    const raw = await request.text();
    if (raw.length > 1_000_000) throw new EvaluationError('요청이 너무 큽니다.', 413);
    const body = JSON.parse(raw);
    if (!body || !Number.isSafeInteger(body.revision) || body.revision < 0 || !body.action || typeof body.action.type !== 'string') throw new EvaluationError('요청 형식을 확인해 주세요.');
    const actor: EvaluationActor = { admin: body.actor?.admin === true, userId: typeof body.actor?.userId === 'string' ? body.actor.userId : undefined };
    const action = body.action as EvaluationAction;
    const current = await mutateEvaluationState(body.revision, actor, action);
    const selectionRows = action.type === 'saveSelection' ? action.rows : action.type === 'adminAddCase' ? [action.row] : [];
    const selectionExaminer = action.type === 'adminAddCase' ? action.examinerId : actor.userId;
    const selectionMonth = action.type === 'saveSelection' || action.type === 'adminAddCase' ? action.monthId : '';
    const duplicateWarnings = selectionRows.filter((row) => current.state.cases.some((item) => item.monthId === selectionMonth && item.examinerId !== selectionExaminer && item.status === 'confirmed' && item.applicationNumber.replace(/\D/g, '') === row.applicationNumber.replace(/\D/g, ''))).map((row) => `${row.applicationNumber}: 같은 운영월에 다른 심사관이 선정 확정한 출원입니다.`);
    return NextResponse.json({ revision: current.revision, state: visibleState(current.state, actor), warnings: duplicateWarnings }, { headers });
  } catch (error) { return failure(error, 'save'); }
}
