export const REVIEW_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS claim_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL, application_number TEXT NOT NULL,
    version_key TEXT NOT NULL, source_document_number TEXT,
    source_hash TEXT NOT NULL, claims_json TEXT NOT NULL,
    is_current INTEGER NOT NULL DEFAULT 1 CHECK (is_current IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, application_number, version_key),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS examination_rounds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL, application_number TEXT NOT NULL,
    round_key TEXT NOT NULL, round_number INTEGER NOT NULL,
    notice_document_number TEXT NOT NULL, notice_date TEXT NOT NULL,
    documents_json TEXT NOT NULL, connection_status TEXT NOT NULL
      CHECK (connection_status IN ('linked', 'needs_confirmation')),
    source_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, application_number, round_key),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS issues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL, application_number TEXT NOT NULL,
    issue_key TEXT NOT NULL, examination_round_id INTEGER,
    issue_type TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL,
    ai_payload_json TEXT, source_hash TEXT NOT NULL,
    review_status TEXT NOT NULL DEFAULT 'ai_proposed'
      CHECK (review_status IN ('ai_proposed', 'reviewing', 'confirmed', 'modified', 'rejected', 'unsupported')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, application_number, issue_key),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (examination_round_id) REFERENCES examination_rounds(id) ON DELETE SET NULL
  )`,
  `CREATE TABLE IF NOT EXISTS claim_features (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL, application_number TEXT NOT NULL,
    claim_version_id INTEGER NOT NULL, feature_key TEXT NOT NULL,
    claim_number INTEGER NOT NULL, feature_text TEXT NOT NULL,
    relation_json TEXT, ai_payload_json TEXT, source_hash TEXT NOT NULL,
    review_status TEXT NOT NULL DEFAULT 'ai_proposed'
      CHECK (review_status IN ('ai_proposed', 'reviewing', 'confirmed', 'modified', 'rejected', 'unsupported')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, application_number, claim_version_id, feature_key),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (claim_version_id) REFERENCES claim_versions(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS evidence_refs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL, application_number TEXT NOT NULL,
    entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0, source_type TEXT NOT NULL,
    source_id TEXT NOT NULL, locator TEXT NOT NULL, excerpt TEXT NOT NULL,
    evidence_level TEXT NOT NULL CHECK (evidence_level IN ('explicit', 'inferred', 'unsupported')),
    source_hash TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, application_number, entity_type, entity_id, position),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS review_decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL, application_number TEXT NOT NULL,
    entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
    label TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ai_proposed'
      CHECK (status IN ('ai_proposed', 'reviewing', 'confirmed', 'modified', 'rejected', 'unsupported')),
    original_text TEXT NOT NULL, modified_text TEXT, reason TEXT,
    source_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, application_number, entity_type, entity_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS search_strategy_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL, application_number TEXT NOT NULL,
    version_number INTEGER NOT NULL, strategy_json TEXT NOT NULL,
    source_hash TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, application_number, version_number),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS candidate_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL, application_number TEXT NOT NULL,
    document_key TEXT NOT NULL, document_json TEXT NOT NULL,
    review_status TEXT NOT NULL DEFAULT 'ai_proposed'
      CHECK (review_status IN ('ai_proposed', 'reviewing', 'confirmed', 'modified', 'rejected', 'unsupported')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, application_number, document_key),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  'CREATE INDEX IF NOT EXISTS idx_claim_versions_case_current ON claim_versions(user_id, application_number, is_current, updated_at DESC)',
  'CREATE INDEX IF NOT EXISTS idx_examination_rounds_case_number ON examination_rounds(user_id, application_number, round_number)',
  'CREATE INDEX IF NOT EXISTS idx_issues_case_status ON issues(user_id, application_number, review_status, updated_at DESC)',
  'CREATE INDEX IF NOT EXISTS idx_claim_features_case_claim ON claim_features(user_id, application_number, claim_number, review_status)',
  'CREATE INDEX IF NOT EXISTS idx_evidence_refs_entity ON evidence_refs(user_id, application_number, entity_type, entity_id, position)',
  'CREATE INDEX IF NOT EXISTS idx_review_decisions_case_status ON review_decisions(user_id, application_number, status, updated_at DESC)',
  'CREATE INDEX IF NOT EXISTS idx_search_strategy_versions_case ON search_strategy_versions(user_id, application_number, version_number DESC)',
  'CREATE INDEX IF NOT EXISTS idx_candidate_documents_case_status ON candidate_documents(user_id, application_number, review_status, updated_at DESC)',
  'PRAGMA optimize',
];
