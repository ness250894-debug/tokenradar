CREATE TABLE IF NOT EXISTS social_delivery_attempts (
  platform TEXT NOT NULL,
  content_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN ('planned', 'publishing', 'published', 'failed', 'outcome_unknown')
  ),
  attempt_id TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  external_id TEXT,
  last_error TEXT,
  workflow TEXT,
  run_id TEXT,
  planned_at TEXT NOT NULL,
  started_at TEXT,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  details_json TEXT,
  PRIMARY KEY (platform, content_key)
);

CREATE INDEX IF NOT EXISTS idx_social_delivery_attempts_status_updated
  ON social_delivery_attempts (status, updated_at);

CREATE INDEX IF NOT EXISTS idx_social_delivery_attempts_run
  ON social_delivery_attempts (workflow, run_id);
