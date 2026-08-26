import { HttpError } from '@/app/lib/http';
import { envValue } from '@/app/lib/runtime-env';

export function getKiprisKey() {
  const apiKey = envValue('KIPRIS_API_KEY');
  if (!apiKey || /^your_/i.test(apiKey)) {
    throw new HttpError(
      503,
      'Cloudflare Worker Secret에 KIPRIS_API_KEY를 설정해 주세요.',
      'KIPRIS_KEY_MISSING',
    );
  }
  return apiKey;
}

export function getOpenAiCredentials() {
  const apiKey = envValue('OPENAI_API_KEY');
  if (!apiKey) {
    throw new HttpError(
      503,
      'Cloudflare Worker Secret에 OPENAI_API_KEY를 설정해 주세요.',
      'OPENAI_KEY_MISSING',
    );
  }
  return {
    apiKey,
    model: envValue('OPENAI_MODEL') || 'gpt-5-mini',
  };
}
