CREATE TABLE IF NOT EXISTS patent_documents (
  document_key TEXT PRIMARY KEY, application_number TEXT NOT NULL,
  file_name TEXT NOT NULL, mime_type TEXT NOT NULL,
  source_hash TEXT NOT NULL, payload_hash TEXT NOT NULL,
  fetched_at TEXT NOT NULL, byte_length INTEGER NOT NULL,
  chunk_count INTEGER NOT NULL, metadata_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS patent_document_chunks (
  document_key TEXT NOT NULL, payload_hash TEXT NOT NULL,
  chunk_index INTEGER NOT NULL, content BLOB NOT NULL,
  PRIMARY KEY (document_key, payload_hash, chunk_index)
);
