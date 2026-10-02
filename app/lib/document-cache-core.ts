/** Below D1's 2,000,000 byte cell/row limit, including row metadata. */
export const DOCUMENT_CHUNK_BYTES = 1_500_000;
export const MAX_DOCUMENT_BYTES = 24 * 1024 * 1024;

export function splitDocumentBytes(bytes: Uint8Array): Uint8Array[] {
  if (bytes.byteLength > MAX_DOCUMENT_BYTES) throw new Error('원문 캐시 허용 크기를 초과했습니다.');
  const chunks: Uint8Array[] = [];
  for (let offset = 0; offset < bytes.length; offset += DOCUMENT_CHUNK_BYTES) {
    chunks.push(bytes.slice(offset, offset + DOCUMENT_CHUNK_BYTES));
  }
  return chunks;
}

export function joinDocumentBytes(chunks: Uint8Array[], size: number): Uint8Array {
  if (size < 0 || size > MAX_DOCUMENT_BYTES || chunks.reduce((sum, chunk) => sum + chunk.length, 0) !== size) {
    throw new Error('저장된 원문 크기가 일치하지 않습니다.');
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

export async function documentHash(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest('SHA-256', bytes.slice().buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function createSingleFlight() {
  const running = new Map<string, Promise<unknown>>();
  return function singleFlight<T>(key: string, load: () => Promise<T>): Promise<T> {
    const pending = running.get(key);
    if (pending) return pending as Promise<T>;
    const task = Promise.resolve().then(load);
    running.set(key, task);
    void task.finally(() => { if (running.get(key) === task) running.delete(key); }).catch(() => undefined);
    return task;
  };
}
