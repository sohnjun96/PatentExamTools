import { NextResponse } from 'next/server';
import { appDatabase, recordApiUsage, WORKSPACE_USER_ID } from '@/app/lib/db';
import { errorResponse, HttpError } from '@/app/lib/http';
import { loadNoticePdf, noticeIdentifiers } from '@/app/lib/kipris-notice';
import { envValue } from '@/app/lib/runtime-env';
import { getOpenAiCredentials } from '@/app/lib/secrets';

type NoticeSummary = {
  oneLine: string;
  keyIssues: string[];
  affectedClaims: string[];
  citedReferences: string[];
  deadlines: string[];
  requiredActions: string[];
  cautions: string[];
};

type NoticeAnalysis = {
  markdown: string;
  summary: NoticeSummary;
  parser: 'kordoc' | 'openai-pdf';
  model: string;
  cached: boolean;
  generatedAt: string;
  usage: { inputTokens: number; outputTokens: number };
};

const ANALYSIS_VERSION = 'notice-markdown-2026-08-28-v1';
const ANALYSIS_RATE_WINDOW_MS = 60_000;
const ANALYSIS_RATE_MAX = 2;
const analysisRequestLog = new Map<string, number[]>();

function analysisRateLimited(request: Request) {
  const client =
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'local';
  const now = Date.now();
  const recent = (analysisRequestLog.get(client) ?? []).filter(
    (timestamp) => now - timestamp < ANALYSIS_RATE_WINDOW_MS,
  );
  if (recent.length >= ANALYSIS_RATE_MAX) return true;
  recent.push(now);
  analysisRequestLog.set(client, recent);
  return false;
}

const SUMMARY_PROPERTIES = {
  oneLine: { type: 'string' },
  keyIssues: { type: 'array', items: { type: 'string' }, maxItems: 12 },
  affectedClaims: { type: 'array', items: { type: 'string' }, maxItems: 20 },
  citedReferences: { type: 'array', items: { type: 'string' }, maxItems: 20 },
  deadlines: { type: 'array', items: { type: 'string' }, maxItems: 8 },
  requiredActions: { type: 'array', items: { type: 'string' }, maxItems: 12 },
  cautions: { type: 'array', items: { type: 'string' }, maxItems: 8 },
} as const;

const SUMMARY_REQUIRED = [
  'oneLine',
  'keyIssues',
  'affectedClaims',
  'citedReferences',
  'deadlines',
  'requiredActions',
  'cautions',
];

const PDF_ANALYSIS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['markdown', ...SUMMARY_REQUIRED],
  properties: {
    markdown: { type: 'string' },
    ...SUMMARY_PROPERTIES,
  },
};

const SUMMARY_ONLY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: SUMMARY_REQUIRED,
  properties: SUMMARY_PROPERTIES,
};

function outputText(payload: unknown) {
  const response = payload as {
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  };
  if (response.output_text) return response.output_text;
  return (response.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === 'output_text')
    .map((item) => item.text ?? '')
    .join('');
}

async function sha256(buffer: ArrayBuffer) {
  const versionBytes = new TextEncoder().encode(ANALYSIS_VERSION);
  const sourceBytes = new Uint8Array(buffer);
  const combined = new Uint8Array(versionBytes.length + sourceBytes.length);
  combined.set(versionBytes);
  combined.set(sourceBytes, versionBytes.length);
  const digest = await crypto.subtle.digest('SHA-256', combined);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

async function cachedAnalysis(
  applicationNumber: string,
  sendNumber: string,
  sourceHash?: string,
) {
  const db = await appDatabase();
  const statement = db.prepare(
    `SELECT markdown_text, summary_json, parser, model,
            input_tokens, output_tokens, updated_at
     FROM notice_analyses
     WHERE user_id = ? AND application_number = ? AND send_number = ?
       ${sourceHash ? 'AND source_hash = ?' : ''}
     ORDER BY updated_at DESC LIMIT 1`,
  );
  const row = await (sourceHash
    ? statement.bind(WORKSPACE_USER_ID, applicationNumber, sendNumber, sourceHash)
    : statement.bind(WORKSPACE_USER_ID, applicationNumber, sendNumber))
    .first<{
      markdown_text: string;
      summary_json: string;
      parser: 'kordoc' | 'openai-pdf';
      model: string;
      input_tokens: number;
      output_tokens: number;
      updated_at: string;
    }>();
  if (!row) return null;
  return {
    markdown: row.markdown_text,
    summary: JSON.parse(row.summary_json) as NoticeSummary,
    parser: row.parser,
    model: row.model,
    cached: true,
    generatedAt: row.updated_at,
    usage: {
      inputTokens: Number(row.input_tokens || 0),
      outputTokens: Number(row.output_tokens || 0),
    },
  } satisfies NoticeAnalysis;
}

async function parseWithKordoc(pdf: ArrayBuffer, fileName: string) {
  const endpoint = envValue('KORDOC_API_URL');
  if (!endpoint) return null;
  const token = envValue('KORDOC_API_TOKEN');
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/pdf',
      'X-File-Name': encodeURIComponent(fileName),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: pdf,
    signal: AbortSignal.timeout(120_000),
  });
  const payload = await response.json().catch(() => ({})) as {
    success?: boolean;
    markdown?: string;
    data?: { markdown?: string };
    error?: string;
  };
  if (!response.ok || payload.success === false) {
    throw new Error(payload.error || `kordoc 파서 응답 오류 (${response.status})`);
  }
  const markdown = payload.markdown || payload.data?.markdown || '';
  if (!markdown.trim()) throw new Error('kordoc 파서가 빈 마크다운을 반환했습니다.');
  return markdown;
}

async function callOpenAi(body: Record<string, unknown>, apiKey: string) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180_000),
  });
  const payload = await response.json() as {
    error?: { message?: string };
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  if (!response.ok) {
    throw new HttpError(
      502,
      payload.error?.message || `OpenAI 응답 오류 (${response.status})`,
      'OPENAI_REQUEST_FAILED',
    );
  }
  const raw = outputText(payload);
  if (!raw) throw new HttpError(502, '통지서 분석 결과가 비어 있습니다.');
  try {
    return {
      value: JSON.parse(raw) as Record<string, unknown>,
      inputTokens: Number(payload.usage?.input_tokens ?? 0),
      outputTokens: Number(payload.usage?.output_tokens ?? 0),
    };
  } catch {
    throw new HttpError(502, '통지서 분석 결과를 해석하지 못했습니다.');
  }
}

async function analyzePdfWithOpenAi(
  pdf: ArrayBuffer,
  fileName: string,
  apiKey: string,
  model: string,
) {
  const result = await callOpenAi({
    model,
    store: false,
    max_output_tokens: 16_000,
    instructions:
      '당신은 대한민국 특허청 의견제출통지서를 원문에 충실하게 디지털화하는 문서 분석가입니다. PDF의 모든 페이지에서 제목, 본문, 번호 목록, 인용문헌, 청구항 번호, 기간과 표를 빠짐없이 읽으세요. markdown에는 원문 구조를 보존한 마크다운을 작성하세요. 표는 반드시 GitHub Flavored Markdown 파이프 표로 복원하고, 병합 셀은 의미가 사라지지 않도록 필요한 값을 반복 기재하세요. 페이지 머리글·꼬리글의 단순 반복은 제거하되 법적·절차적 문구는 생략하지 마세요. 판독 불가능한 부분은 [판독 불가]로 표시하고 추측하지 마세요. 요약 필드는 통지서에 실제로 기재된 내용만 사실형 문장으로 정리하세요. 거절이유 또는 의견제출 사유, 대상 청구항, 인용문헌과 대응 요구사항을 구체적으로 적고, 사용자에게 일반적인 조언을 하지 마세요.',
    input: [{
      role: 'user',
      content: [
        {
          type: 'input_file',
          filename: fileName,
          file_data: `data:application/pdf;base64,${Buffer.from(pdf).toString('base64')}`,
        },
        {
          type: 'input_text',
          text: '첨부한 의견제출통지서를 표까지 보존한 마크다운으로 변환하고 심사 대응 검토용 요약을 작성하세요.',
        },
      ],
    }],
    text: {
      format: {
        type: 'json_schema',
        name: 'office_action_markdown_analysis',
        strict: true,
        schema: PDF_ANALYSIS_SCHEMA,
      },
    },
  }, apiKey);
  const value = result.value as unknown as NoticeSummary & { markdown: string };
  return {
    markdown: value.markdown,
    summary: {
      oneLine: value.oneLine,
      keyIssues: value.keyIssues,
      affectedClaims: value.affectedClaims,
      citedReferences: value.citedReferences,
      deadlines: value.deadlines,
      requiredActions: value.requiredActions,
      cautions: value.cautions,
    },
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  };
}

async function summarizeKordocMarkdown(
  markdown: string,
  apiKey: string,
  model: string,
) {
  const result = await callOpenAi({
    model,
    store: false,
    max_output_tokens: 4_000,
    instructions:
      '당신은 대한민국 특허청 의견제출통지서를 검토하는 특허심사 보조 분석가입니다. 제공된 kordoc 마크다운만 근거로 통지서의 핵심 내용을 한국어로 요약하세요. 거절이유 또는 의견제출 사유, 대상 청구항, 인용문헌, 제출기한과 요구된 대응을 구체적으로 적으세요. 문서에 없는 사항은 추정하지 말고 cautions에만 표시하세요. 일반적인 조언이나 “확인해야 합니다” 같은 빈 안내문을 출력하지 마세요.',
    input: `<office_action_markdown>\n${markdown.slice(0, 180_000)}\n</office_action_markdown>`,
    text: {
      format: {
        type: 'json_schema',
        name: 'office_action_summary',
        strict: true,
        schema: SUMMARY_ONLY_SCHEMA,
      },
    },
  }, apiKey);
  return {
    summary: result.value as unknown as NoticeSummary,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  };
}

export async function GET(request: Request) {
  try {
    const { applicationNumber, sendNumber } = noticeIdentifiers(request);
    const cached = await cachedAnalysis(applicationNumber, sendNumber);
    if (!cached) throw new HttpError(404, '저장된 통지서 텍스트 분석이 없습니다.');
    return NextResponse.json(cached, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { applicationNumber, sendNumber } = noticeIdentifiers(request);
    const force = new URL(request.url).searchParams.get('force') === 'true';
    if (!force) {
      const latest = await cachedAnalysis(applicationNumber, sendNumber);
      if (latest) return NextResponse.json(latest);
    }
    if (analysisRateLimited(request)) {
      throw new HttpError(429, '통지서 AI 분석 요청이 많습니다. 잠시 후 다시 시도해 주세요.');
    }

    const pdf = await loadNoticePdf(applicationNumber, sendNumber);
    const sourceHash = await sha256(pdf.buffer);
    if (!force) {
      const matching = await cachedAnalysis(applicationNumber, sendNumber, sourceHash);
      if (matching) return NextResponse.json(matching);
    }

    const { apiKey, model } = getOpenAiCredentials();
    const kordocMarkdown = await parseWithKordoc(pdf.buffer, pdf.fileName).catch(() => null);
    const parser: NoticeAnalysis['parser'] = kordocMarkdown ? 'kordoc' : 'openai-pdf';
    const analyzed = kordocMarkdown
      ? { markdown: kordocMarkdown, ...await summarizeKordocMarkdown(kordocMarkdown, apiKey, model) }
      : await analyzePdfWithOpenAi(pdf.buffer, pdf.fileName, apiKey, model);

    const db = await appDatabase();
    await db.prepare(
      `INSERT INTO notice_analyses (
         user_id, application_number, send_number, parser, model, source_hash,
         markdown_text, summary_json, input_tokens, output_tokens
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, application_number, send_number, source_hash)
       DO UPDATE SET parser = excluded.parser, model = excluded.model,
         markdown_text = excluded.markdown_text,
         summary_json = excluded.summary_json,
         input_tokens = excluded.input_tokens,
         output_tokens = excluded.output_tokens,
         updated_at = CURRENT_TIMESTAMP`,
    ).bind(
      WORKSPACE_USER_ID,
      applicationNumber,
      sendNumber,
      parser,
      model,
      sourceHash,
      analyzed.markdown,
      JSON.stringify(analyzed.summary),
      analyzed.inputTokens,
      analyzed.outputTokens,
    ).run();
    await recordApiUsage(
      WORKSPACE_USER_ID,
      'openai',
      ['의견제출통지서 텍스트·요약'],
      applicationNumber,
    );

    return NextResponse.json({
      markdown: analyzed.markdown,
      summary: analyzed.summary,
      parser,
      model,
      cached: false,
      generatedAt: new Date().toISOString(),
      usage: {
        inputTokens: analyzed.inputTokens,
        outputTokens: analyzed.outputTokens,
      },
      kiprisUsage: pdf.usage,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
