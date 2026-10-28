import { appDatabase } from '@/app/lib/db';
import { assertPdfBytes, type PatentDocumentKind, type PatentDocumentRequest } from '@/app/lib/patent-document';

const CHUNK_BYTES = 512 * 1024;
const MAX_BYTES = 32 * 1024 * 1024;
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS patent_document_cache (
    cache_key TEXT PRIMARY KEY, application_number TEXT NOT NULL, kind TEXT NOT NULL,
    file_name TEXT NOT NULL, byte_length INTEGER NOT NULL, content_hash TEXT NOT NULL,
    chunk_count INTEGER NOT NULL, fetched_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS patent_document_chunks (
    cache_key TEXT NOT NULL, content_hash TEXT NOT NULL, chunk_index INTEGER NOT NULL,
    data_base64 TEXT NOT NULL, retired_at INTEGER,
    PRIMARY KEY (cache_key, content_hash, chunk_index)
  )`,
];
type Manifest = {
  cache_key: string; application_number: string; kind: PatentDocumentKind; file_name: string;
  byte_length: number; content_hash: string; chunk_count: number; fetched_at: string;
};
type DownloadedFile = { applicationNumber: string; kind: PatentDocumentKind; fileName: string; bytes: Uint8Array };
type Chunk = { chunk_index: number; data_base64: string };

function keyFor(request: PatentDocumentRequest) { return `${request.kind}:${request.numberType}:${request.number}`; }
function encode(bytes: Uint8Array) {
  const parts: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 16_384) parts.push(String.fromCharCode(...bytes.subarray(offset, offset + 16_384)));
  return btoa(parts.join(''));
}
function decode(value: string) { return Uint8Array.from(atob(value), character => character.charCodeAt(0)); }

/** Store PDF bytes, rather than expiring upstream URLs. Chunks stay below D1's row limit. */
export function createPatentDocumentCache(getDatabase: () => Promise<D1Database>) {
  let ready: Promise<void> | undefined;
  const pending = new Map<string, Promise<void>>();
  async function database() {
    const db = await getDatabase();
    ready ??= db.batch(SCHEMA.map(sql => db.prepare(sql))).then(() => undefined).catch(error => { ready = undefined; throw error; });
    await ready;
    return db;
  }
  async function find(request: PatentDocumentRequest) {
    const db = await database();
    const row = await db.prepare('SELECT * FROM patent_document_cache WHERE cache_key = ?').bind(keyFor(request)).first<Manifest>();
    if (!row) return null;
    if (!Number.isInteger(row.byte_length) || row.byte_length < 5 || row.byte_length > MAX_BYTES || row.chunk_count !== Math.ceil(row.byte_length / CHUNK_BYTES)) throw new Error('Invalid cached PDF manifest');
    return {
      applicationNumber: row.application_number, kind: row.kind, fileName: row.file_name,
      byteLength: row.byte_length, fetchedAt: row.fetched_at,
      body() {
        let next = 0;
        return new ReadableStream<Uint8Array>({
          async pull(controller) {
            try {
              // Read a bounded group rather than allocating the whole PDF on every cache hit.
              const end = Math.min(next + 4, row.chunk_count);
              const chunks = await db.prepare(`SELECT chunk_index, data_base64 FROM patent_document_chunks
                WHERE cache_key = ? AND content_hash = ? AND chunk_index >= ? AND chunk_index < ? ORDER BY chunk_index`)
                .bind(row.cache_key, row.content_hash, next, end).all<Chunk>();
              if (chunks.results.length !== end - next) throw new Error('Missing cached PDF chunk');
              for (const chunk of chunks.results) {
                const bytes = decode(chunk.data_base64);
                if (chunk.chunk_index !== next || bytes.byteLength !== Math.min(CHUNK_BYTES, row.byte_length - next * CHUNK_BYTES)) throw new Error('Invalid cached PDF chunk');
                if (next === 0) assertPdfBytes(bytes);
                controller.enqueue(bytes); next++;
              }
              if (next === row.chunk_count) controller.close();
            } catch (error) { controller.error(error); }
          },
        });
      },
    };
  }
  async function put(request: PatentDocumentRequest, file: DownloadedFile) {
    assertPdfBytes(file.bytes);
    if (file.bytes.byteLength > MAX_BYTES || file.kind !== request.kind || !/^(10|20)\d{11}$/.test(file.applicationNumber) || request.numberType === 'application' && file.applicationNumber !== request.number) throw new Error('Invalid PDF cache input');
    const db = await database();
    const key = keyFor(request);
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', file.bytes as BufferSource)), value => value.toString(16).padStart(2, '0')).join('');
    const count = Math.ceil(file.bytes.byteLength / CHUNK_BYTES);
    const now = Date.now();
    const statements = [db.prepare(`UPDATE patent_document_chunks SET retired_at = ? WHERE cache_key = ?
      AND content_hash = (SELECT content_hash FROM patent_document_cache WHERE cache_key = ?) AND content_hash <> ?`).bind(now, key, key, hash), db.prepare(`INSERT INTO patent_document_cache
      (cache_key, application_number, kind, file_name, byte_length, content_hash, chunk_count, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(cache_key) DO UPDATE SET application_number=excluded.application_number, kind=excluded.kind,
      file_name=excluded.file_name, byte_length=excluded.byte_length, content_hash=excluded.content_hash,
      chunk_count=excluded.chunk_count, fetched_at=excluded.fetched_at`)
      .bind(key, file.applicationNumber, file.kind, file.fileName, file.bytes.byteLength, hash, count, new Date(now).toISOString())];
    for (let index = 0; index < count; index++) {
      statements.push(db.prepare(`INSERT INTO patent_document_chunks (cache_key, content_hash, chunk_index, data_base64, retired_at)
        VALUES (?, ?, ?, ?, NULL) ON CONFLICT(cache_key, content_hash, chunk_index) DO UPDATE SET retired_at = NULL`)
        .bind(key, hash, index, encode(file.bytes.subarray(index * CHUNK_BYTES, (index + 1) * CHUNK_BYTES))));
    }
    // Keep recent versions available to downloads already streaming during a refresh.
    statements.push(db.prepare('DELETE FROM patent_document_chunks WHERE cache_key = ? AND content_hash <> ? AND retired_at < ?').bind(key, hash, now - 3_600_000));
    await db.batch(statements); // The pointer and all chunks commit together, or all roll back.
  }
  async function get(request: PatentDocumentRequest, load: () => Promise<DownloadedFile>, refresh = false) {
    const cached = await find(request);
    if (cached && !refresh) return { ...cached, cacheStatus: 'HIT' as const };
    const key = keyFor(request);
    let task = pending.get(key);
    if (!task) {
      task = (async () => { await put(request, await load()); })();
      pending.set(key, task);
    }
    try { await task; } finally { if (pending.get(key) === task) pending.delete(key); }
    const saved = await find(request);
    if (!saved) throw new Error('PDF cache write did not persist');
    return { ...saved, cacheStatus: refresh ? 'REFRESH' as const : 'MISS' as const };
  }
  return { find, get };
}

export const patentDocumentCache = createPatentDocumentCache(appDatabase);
