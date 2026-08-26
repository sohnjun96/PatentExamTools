import { env as cloudflareEnv } from 'cloudflare:workers';

export type AppBindings = {
  DB?: D1Database;
  KIPRIS_API_KEY?: string;
  KIPRIS_SERVICE_KEY?: string;
  APP_ENCRYPTION_KEY?: string;
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
  ALLOW_DEV_AUTH?: string;
};

export function bindings(): AppBindings {
  return cloudflareEnv as unknown as AppBindings;
}

export function envValue(name: keyof AppBindings): string {
  const workerValue = bindings()[name];
  if (typeof workerValue === 'string' && workerValue.trim()) return workerValue.trim();
  return process.env[name]?.trim() ?? '';
}

export function database(): D1Database {
  const db = bindings().DB;
  if (!db) {
    throw new Error('Cloudflare D1 바인딩(DB)이 설정되지 않았습니다.');
  }
  return db;
}
