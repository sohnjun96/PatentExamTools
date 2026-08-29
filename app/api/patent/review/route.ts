import { NextResponse } from 'next/server';
import { getPatentCase, WORKSPACE_USER_ID } from '@/app/lib/db';
import { errorResponse, HttpError } from '@/app/lib/http';
import {
  type EvidenceLevel,
  type EvidenceRef,
  type ReviewDecisionInput,
  type ReviewEntityType,
} from '@/app/lib/review-model';
import {
  getReviewItems,
  getReviewWorkspace,
  saveIssueProposal,
  updateReviewDecision,
} from '@/app/lib/review-store';

const ENTITY_TYPES: ReviewEntityType[] = ['summary', 'issue', 'claim_feature', 'candidate_document'];
const SOURCE_TYPES: EvidenceRef['sourceType'][] = ['claim', 'specification', 'abstract', 'drawing', 'notice', 'opinion', 'amendment', 'document'];
const EVIDENCE_LEVELS: EvidenceLevel[] = ['explicit', 'inferred', 'unsupported'];
const USER_REVIEW_STATUSES: ReviewDecisionInput['status'][] = ['reviewing', 'confirmed', 'modified', 'rejected'];

function applicationNumber(value: unknown) {
  const normalized = String(value ?? '').replace(/\D/g, '');
  if (!/^(10|20)\d{11}$/.test(normalized)) {
    throw new HttpError(400, '특허·실용신안 출원번호 13자리를 확인해 주세요.');
  }
  return normalized;
}

function boundedText(value: unknown, label: string, maxLength: number, required = true) {
  const result = typeof value === 'string' ? value.trim() : '';
  if (required && !result) throw new HttpError(400, `${label}을 입력해 주세요.`);
  if (result.length > maxLength) throw new HttpError(400, `${label}은 ${maxLength}자 이하여야 합니다.`);
  return result;
}

function entityType(value: unknown): ReviewEntityType {
  if (!ENTITY_TYPES.includes(value as ReviewEntityType)) {
    throw new HttpError(400, '지원하지 않는 검토 대상 종류입니다.');
  }
  return value as ReviewEntityType;
}

function evidenceRefs(value: unknown) {
  if (!Array.isArray(value) || value.length > 12) {
    throw new HttpError(400, '원문 근거는 최대 12개까지 저장할 수 있습니다.');
  }
  return value.map((entry) => {
    const source = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {};
    if (!SOURCE_TYPES.includes(source.sourceType as EvidenceRef['sourceType'])) {
      throw new HttpError(400, '지원하지 않는 원문 근거 종류입니다.');
    }
    if (!EVIDENCE_LEVELS.includes(source.evidenceLevel as EvidenceLevel)) {
      throw new HttpError(400, '지원하지 않는 근거 수준입니다.');
    }
    return {
      sourceType: source.sourceType as EvidenceRef['sourceType'],
      sourceId: boundedText(source.sourceId, '근거 식별자', 200),
      locator: boundedText(source.locator, '근거 위치', 200),
      excerpt: boundedText(source.excerpt, '근거 원문', 1_200),
      evidenceLevel: source.evidenceLevel as EvidenceLevel,
    } satisfies EvidenceRef;
  });
}

async function ensureCaseExists(application: string) {
  const stored = await getPatentCase(WORKSPACE_USER_ID, application);
  if (!stored) throw new HttpError(404, '먼저 출원번호를 조회해 사건 데이터를 불러와 주세요.');
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const application = applicationNumber(url.searchParams.get('applicationNumber'));
    await ensureCaseExists(application);
    const typeValue = url.searchParams.get('entityType');
    if (typeValue) {
      return NextResponse.json({
        applicationNumber: application,
        reviewItems: await getReviewItems(WORKSPACE_USER_ID, application, entityType(typeValue)),
      }, { headers: { 'Cache-Control': 'private, no-store' } });
    }
    return NextResponse.json(
      await getReviewWorkspace(WORKSPACE_USER_ID, application),
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const application = applicationNumber(body.applicationNumber);
    await ensureCaseExists(application);
    if (body.action !== 'upsert_issue') {
      throw new HttpError(400, '지원하지 않는 검토 저장 작업입니다.');
    }
    const level = body.evidenceLevel as EvidenceLevel;
    if (!EVIDENCE_LEVELS.includes(level)) throw new HttpError(400, '지원하지 않는 근거 수준입니다.');
    const issueKey = boundedText(body.issueKey, '쟁점 식별자', 160);
    if (!/^[a-zA-Z0-9:_-]+$/.test(issueKey)) {
      throw new HttpError(400, '쟁점 식별자는 영문, 숫자, 콜론, 밑줄 및 하이픈만 사용할 수 있습니다.');
    }
    const reviewItem = await saveIssueProposal(WORKSPACE_USER_ID, application, {
      issueKey,
      roundKey: boundedText(body.roundKey, '심사 회차 식별자', 160, false) || undefined,
      issueType: boundedText(body.issueType, '쟁점 유형', 80),
      title: boundedText(body.title, '쟁점 제목', 240),
      description: boundedText(body.description, '쟁점 설명', 8_000),
      evidenceLevel: level,
      sourceRefs: evidenceRefs(body.sourceRefs),
      aiPayload: body.aiPayload,
    });
    return NextResponse.json({ reviewItem }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const application = applicationNumber(body.applicationNumber);
    await ensureCaseExists(application);
    const type = entityType(body.entityType);
    const id = boundedText(body.entityId, '검토 대상 식별자', 200);
    const status = body.status as ReviewDecisionInput['status'];
    if (!USER_REVIEW_STATUSES.includes(status)) {
      throw new HttpError(400, '지원하지 않는 검토 상태입니다.');
    }
    const current = (await getReviewItems(WORKSPACE_USER_ID, application, type))
      .find((item) => item.entityId === id);
    if (!current) throw new HttpError(404, '검토할 AI 제안을 찾지 못했습니다.');
    if ((status === 'confirmed' || status === 'modified') &&
      (current.evidenceLevel === 'unsupported' || current.sourceRefs.length === 0)) {
      throw new HttpError(409, '원문 근거가 없는 AI 제안은 확정할 수 없습니다.');
    }
    const modifiedText = status === 'modified'
      ? boundedText(body.modifiedText, '수정 내용', 12_000)
      : undefined;
    const reviewItem = await updateReviewDecision(WORKSPACE_USER_ID, {
      applicationNumber: application,
      entityType: type,
      entityId: id,
      status,
      modifiedText,
      reason: boundedText(body.reason, '검토 메모', 2_000, false) || undefined,
    });
    return NextResponse.json({ reviewItem }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}
