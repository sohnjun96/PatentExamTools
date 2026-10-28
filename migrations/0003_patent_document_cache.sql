CREATE TABLE IF NOT EXISTS patent_document_cache (
  cache_key TEXT PRIMARY KEY, application_number TEXT NOT NULL, kind TEXT NOT NULL,
  file_name TEXT NOT NULL, byte_length INTEGER NOT NULL, content_hash TEXT NOT NULL,
  chunk_count INTEGER NOT NULL, fetched_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS patent_document_chunks (
  cache_key TEXT NOT NULL, content_hash TEXT NOT NULL, chunk_index INTEGER NOT NULL,
  data_base64 TEXT NOT NULL, retired_at INTEGER,
  PRIMARY KEY (cache_key, content_hash, chunk_index)
);
