import { appDatabase } from '@/app/lib/db';
import { createSingleFlight, documentHash, joinDocumentBytes, splitDocumentBytes } from '@/app/lib/document-cache-core';

export type CachedDocument = {
  bytes: Uint8Array;
  sourceHash: string;
  fetchedAt: string;
  fileName: string;
  mimeType: string;
  metadata: Record<string, unknown>;
};

export const documentSingleFlight = createSingleFlight();

export async function getDocumentMetadata(key: string) {
  const db = await appDatabase();
  return db.prepare('SELECT source_hash, fetched_at, file_name FROM patent_documents WHERE document_key = ?')
    .bind(key).first<{ source_hash: string; fetched_at: string; file_name: string }>();
}

export async function readDocument(key: string): Promise<CachedDocument | null> {
  const db = await appDatabase();
  const row = await db.prepare(`SELECT * FROM patent_documents WHERE document_key = ?`).bind(key).first<{
    source_hash: string; payload_hash: string; fetched_at: string; file_name: string;
    mime_type: string; byte_length: number; chunk_count: number; metadata_json: string;
  }>();
  if (!row) return null;
  const result = await db.prepare(`SELECT chunk_index, content FROM patent_document_chunks
    WHERE document_key = ? AND payload_hash = ? ORDER BY chunk_index`).bind(key, row.payload_hash)
    .all<{ chunk_index: number; content: number[] | ArrayBuffer }>();
  if (result.results.length !== row.chunk_count || result.results.some((chunk, index) => chunk.chunk_index !== index)) return null;
  const bytes = joinDocumentBytes(result.results.map((chunk) => new Uint8Array(chunk.content)), row.byte_length);
  if (await documentHash(bytes) !== row.payload_hash) return null;
  return { bytes, sourceHash: row.source_hash, fetchedAt: row.fetched_at, fileName: row.file_name,
    mimeType: row.mime_type, metadata: JSON.parse(row.metadata_json) as Record<string, unknown> };
}

export async function saveDocument(key: string, applicationNumber: string, document: CachedDocument) {
  const db = await appDatabase();
  const chunks = splitDocumentBytes(document.bytes);
  const hash = await documentHash(document.bytes);
  // Atomic batch: readers either see the old complete generation or the new one.
  await db.batch([
    db.prepare('DELETE FROM patent_document_chunks WHERE document_key = ?').bind(key),
    ...chunks.map((chunk, index) => db.prepare(`INSERT INTO patent_document_chunks
      (document_key, payload_hash, chunk_index, content) VALUES (?, ?, ?, ?)`).bind(key, hash, index, chunk.buffer)),
    db.prepare(`INSERT INTO patent_documents (document_key, application_number, file_name, mime_type,
      source_hash, payload_hash, fetched_at, byte_length, chunk_count, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(document_key) DO UPDATE SET file_name = excluded.file_name, mime_type = excluded.mime_type,
      source_hash = excluded.source_hash, payload_hash = excluded.payload_hash, fetched_at = excluded.fetched_at,
      byte_length = excluded.byte_length, chunk_count = excluded.chunk_count, metadata_json = excluded.metadata_json`)
      .bind(key, applicationNumber, document.fileName, document.mimeType, document.sourceHash, hash,
        document.fetchedAt, document.bytes.length, chunks.length, JSON.stringify(document.metadata)),
  ]);
}
