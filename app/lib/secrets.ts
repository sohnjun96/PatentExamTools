import { appDatabase } from '@/app/lib/db';
import { HttpError } from '@/app/lib/http';
import { envValue } from '@/app/lib/runtime-env';

type SecretRow = {
  kipris_ciphertext: string | null;
  kipris_iv: string | null;
  kipris_last4: string | null;
  openai_ciphertext: string | null;
  openai_iv: string | null;
  openai_last4: string | null;
  openai_model: string | null;
};

export type SecretSettings = {
  hasKiprisKey: boolean;
  kiprisLast4: string;
  hasOpenAiKey: boolean;
  openaiLast4: string;
  openaiModel: string;
};

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function encryptionKey() {
  const raw = envValue('APP_ENCRYPTION_KEY');
  if (!raw) {
    throw new HttpError(
      503,
      'APP_ENCRYPTION_KEY Worker secret이 설정되지 않았습니다.',
      'ENCRYPTION_KEY_MISSING',
    );
  }
  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(raw);
  } catch {
    throw new HttpError(503, 'APP_ENCRYPTION_KEY 형식이 올바르지 않습니다.');
  }
  if (bytes.byteLength !== 32) {
    throw new HttpError(503, 'APP_ENCRYPTION_KEY는 32바이트 Base64 값이어야 합니다.');
  }
  return crypto.subtle.importKey('raw', Uint8Array.from(bytes).buffer, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ]);
}

async function encryptSecret(value: string, userId: string) {
  const key = await encryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData: new TextEncoder().encode(userId),
    },
    key,
    new TextEncoder().encode(value),
  );
  return {
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    iv: bytesToBase64(iv),
  };
}

async function decryptSecret(ciphertext: string, iv: string, userId: string) {
  const key = await encryptionKey();
  try {
    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: base64ToBytes(iv),
        additionalData: new TextEncoder().encode(userId),
      },
      key,
      base64ToBytes(ciphertext),
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new HttpError(500, '저장된 API 키를 복호화할 수 없습니다.');
  }
}

async function secretRow(userId: string) {
  const db = await appDatabase();
  return db
    .prepare(
      `SELECT kipris_ciphertext, kipris_iv, kipris_last4,
              openai_ciphertext, openai_iv, openai_last4, openai_model
       FROM user_api_keys WHERE user_id = ?`,
    )
    .bind(userId)
    .first<SecretRow>();
}

export async function getSecretSettings(userId: string): Promise<SecretSettings> {
  const row = await secretRow(userId);
  return {
    hasKiprisKey: Boolean(row?.kipris_ciphertext && row.kipris_iv),
    kiprisLast4: row?.kipris_last4 ?? '',
    hasOpenAiKey: Boolean(row?.openai_ciphertext && row.openai_iv),
    openaiLast4: row?.openai_last4 ?? '',
    openaiModel: row?.openai_model || 'gpt-5-mini',
  };
}

export async function updateSecretSettings(
  userId: string,
  input: {
    kiprisApiKey?: string;
    openaiApiKey?: string;
    openaiModel?: string;
    clearKipris?: boolean;
    clearOpenAi?: boolean;
  },
) {
  const current = await secretRow(userId);
  let kiprisCiphertext = input.clearKipris ? null : current?.kipris_ciphertext ?? null;
  let kiprisIv = input.clearKipris ? null : current?.kipris_iv ?? null;
  let kiprisLast4 = input.clearKipris ? null : current?.kipris_last4 ?? null;
  let openaiCiphertext = input.clearOpenAi ? null : current?.openai_ciphertext ?? null;
  let openaiIv = input.clearOpenAi ? null : current?.openai_iv ?? null;
  let openaiLast4 = input.clearOpenAi ? null : current?.openai_last4 ?? null;

  const kiprisApiKey = input.kiprisApiKey?.trim();
  if (kiprisApiKey) {
    if (kiprisApiKey.length < 8) throw new HttpError(400, 'KIPRIS API 키를 확인해 주세요.');
    const encrypted = await encryptSecret(kiprisApiKey, userId);
    kiprisCiphertext = encrypted.ciphertext;
    kiprisIv = encrypted.iv;
    kiprisLast4 = kiprisApiKey.slice(-4);
  }

  const openaiApiKey = input.openaiApiKey?.trim();
  if (openaiApiKey) {
    if (!openaiApiKey.startsWith('sk-')) {
      throw new HttpError(400, 'OpenAI API 키 형식을 확인해 주세요.');
    }
    const encrypted = await encryptSecret(openaiApiKey, userId);
    openaiCiphertext = encrypted.ciphertext;
    openaiIv = encrypted.iv;
    openaiLast4 = openaiApiKey.slice(-4);
  }

  const model = input.openaiModel?.trim() || current?.openai_model || 'gpt-5-mini';
  if (!/^[a-zA-Z0-9._-]{2,80}$/.test(model)) {
    throw new HttpError(400, 'OpenAI 모델 이름을 확인해 주세요.');
  }

  const db = await appDatabase();
  await db
    .prepare(
      `INSERT INTO user_api_keys (
         user_id, kipris_ciphertext, kipris_iv, kipris_last4,
         openai_ciphertext, openai_iv, openai_last4, openai_model
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         kipris_ciphertext = excluded.kipris_ciphertext,
         kipris_iv = excluded.kipris_iv,
         kipris_last4 = excluded.kipris_last4,
         openai_ciphertext = excluded.openai_ciphertext,
         openai_iv = excluded.openai_iv,
         openai_last4 = excluded.openai_last4,
         openai_model = excluded.openai_model,
         updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(
      userId,
      kiprisCiphertext,
      kiprisIv,
      kiprisLast4,
      openaiCiphertext,
      openaiIv,
      openaiLast4,
      model,
    )
    .run();
  return getSecretSettings(userId);
}

export async function getKiprisKey(userId: string) {
  const row = await secretRow(userId);
  if (row?.kipris_ciphertext && row.kipris_iv) {
    return decryptSecret(row.kipris_ciphertext, row.kipris_iv, userId);
  }
  const fallback = envValue('KIPRIS_API_KEY');
  if (fallback && !/^your_/i.test(fallback)) return fallback;
  throw new HttpError(
    503,
    '설정에서 KIPRIS Plus API 키를 등록해 주세요.',
    'KIPRIS_KEY_MISSING',
  );
}

export async function getOpenAiCredentials(userId: string) {
  const row = await secretRow(userId);
  if (!row?.openai_ciphertext || !row.openai_iv) {
    throw new HttpError(
      503,
      '설정에서 OpenAI API 키를 등록해 주세요.',
      'OPENAI_KEY_MISSING',
    );
  }
  return {
    apiKey: await decryptSecret(row.openai_ciphertext, row.openai_iv, userId),
    model: row.openai_model || 'gpt-5-mini',
  };
}
