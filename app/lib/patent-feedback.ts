type PatentFeedbackContext = 'case' | 'summary' | 'summary-read' | 'fulltext' | 'notice';

const fallbacks: Record<PatentFeedbackContext, string> = {
  case: '출원 정보를 불러오지 못했습니다. 잠시 후 다시 조회해 주세요.',
  summary: 'AI 요약을 만들지 못했습니다. 잠시 후 AI 요약 만들기를 눌러 다시 시도해 주세요.',
  'summary-read': '저장된 AI 요약을 불러오지 못했습니다. 잠시 후 사건을 다시 조회해 주세요.',
  fulltext: '명세서와 청구항을 불러오지 못했습니다. 잠시 후 전문 다시 불러오기를 눌러 주세요.',
  notice: '의견제출통지서를 불러오지 못했습니다. 잠시 후 통지서 다시 불러오기를 눌러 주세요.',
};

/** Keep actionable Korean errors without showing provider diagnostics or URLs. */
export function patentFeedback(error: unknown, context: PatentFeedbackContext) {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  if (/timeout|timed out|시간.*초과/i.test(message)) return '자료를 불러오는 데 시간이 오래 걸리고 있습니다. 잠시 후 다시 시도해 주세요.';
  if (/failed to fetch|fetch failed|networkerror|network request|ENOTFOUND|ECONN|ERR_NETWORK/i.test(message)) return '서비스에 연결하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.';
  if (/API|accessKey|ServiceKey|Worker|D1|SQLITE|OpenAI|OPENAI|PDF_V2|서비스\s*키|인증\s*키|바인딩|https?:\/\/|<html|<!DOCTYPE/i.test(message)) return `${fallbacks[context]} 문제가 계속되면 관리자에게 문의해 주세요.`;
  if (!/[가-힣]/.test(message) || /unexpected token|JSON|SyntaxError|TypeError|ReferenceError/i.test(message)) return fallbacks[context];
  const clean = message.trim();
  if (/주세요|확인한 뒤|다시 시도|다시 조회/.test(clean)) return clean;
  return `${clean.replace(/[.!\s]+$/, '')}. ${context === 'case' ? '잠시 후 다시 조회해 주세요.' : '잠시 후 다시 시도해 주세요.'}`;
}
