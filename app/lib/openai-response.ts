import { HttpError } from '@/app/lib/http';

type OpenAiResponsePayload = {
  status?: string;
  error?: { message?: string } | null;
  incomplete_details?: { reason?: string } | null;
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
      refusal?: string;
    }>;
  }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
};

type StructuredRequestOptions = {
  apiKey: string;
  body: Record<string, unknown>;
  label: string;
  timeoutMs: number;
  maxOutputTokens: number;
  retryMaxOutputTokens: number;
};

export type StructuredResponse<T> = {
  value: T;
  inputTokens: number;
  outputTokens: number;
};

function outputText(payload: OpenAiResponsePayload) {
  if (payload.output_text?.trim()) return payload.output_text.trim();
  return (payload.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === 'output_text')
    .map((item) => item.text ?? '')
    .join('')
    .trim();
}

function refusalText(payload: OpenAiResponsePayload) {
  return (payload.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === 'refusal')
    .map((item) => item.refusal ?? '')
    .filter(Boolean)
    .join(' ');
}

function parseJson<T>(raw: string): T | null {
  const candidates = [raw.trim()];
  const fenced = raw.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1];
  if (fenced) candidates.push(fenced.trim());
  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(raw.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of [...new Set(candidates)]) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // Try the next safe representation. A truncated object is never repaired.
    }
  }
  return null;
}

function reasoningFor(model: unknown) {
  if (typeof model !== 'string') return {};
  return /^(gpt-5|o[1-9])/i.test(model)
    ? { reasoning: { effort: 'low' } }
    : {};
}

export async function requestStructuredOpenAi<T>({
  apiKey,
  body,
  label,
  timeoutMs,
  maxOutputTokens,
  retryMaxOutputTokens,
}: StructuredRequestOptions): Promise<StructuredResponse<T>> {
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let lastPayload: OpenAiResponsePayload | null = null;
  const limits = [maxOutputTokens, retryMaxOutputTokens];

  for (let attempt = 0; attempt < limits.length; attempt += 1) {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...body,
        ...reasoningFor(body.model),
        max_output_tokens: limits[attempt],
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const payload = await response.json().catch(() => ({})) as OpenAiResponsePayload;
    lastPayload = payload;
    totalInputTokens += Number(payload.usage?.input_tokens ?? 0);
    totalOutputTokens += Number(payload.usage?.output_tokens ?? 0);

    if (!response.ok) {
      throw new HttpError(
        502,
        payload.error?.message || `OpenAI 응답 오류 (${response.status})`,
        'OPENAI_REQUEST_FAILED',
      );
    }

    const refusal = refusalText(payload);
    if (refusal) {
      throw new HttpError(422, `${label} 생성이 거부되었습니다: ${refusal}`, 'OPENAI_REFUSAL');
    }

    const raw = outputText(payload);
    const value = raw ? parseJson<T>(raw) : null;
    const incomplete = payload.status === 'incomplete' || Boolean(payload.incomplete_details);
    if (value && !incomplete) {
      return {
        value,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
      };
    }

    if (attempt === limits.length - 1) break;
  }

  const reason = lastPayload?.incomplete_details?.reason;
  if (reason === 'max_output_tokens') {
    throw new HttpError(
      502,
      `${label} 결과가 두 차례 출력 한도에서 중단되었습니다. OPENAI_MODEL 설정을 확인하거나 잠시 후 다시 실행해 주세요.`,
      'OPENAI_OUTPUT_TRUNCATED',
    );
  }
  if (!outputText(lastPayload ?? {})) {
    throw new HttpError(502, `${label} 결과가 비어 있습니다.`, 'OPENAI_EMPTY_OUTPUT');
  }
  throw new HttpError(
    502,
    `${label} 결과가 올바른 JSON 형식이 아닙니다. 다시 실행해 주세요.`,
    'OPENAI_INVALID_JSON',
  );
}
