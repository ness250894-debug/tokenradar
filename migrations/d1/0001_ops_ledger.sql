CREATE TABLE IF NOT EXISTS ops_schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS automation_runs (
  id TEXT PRIMARY KEY,
  workflow TEXT NOT NULL,
  slot TEXT,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  details_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_automation_runs_workflow_started
  ON automation_runs (workflow, started_at);

CREATE TABLE IF NOT EXISTS social_posts (
  platform TEXT NOT NULL,
  content_key TEXT NOT NULL,
  external_id TEXT,
  posted_at TEXT NOT NULL,
  details_json TEXT,
  PRIMARY KEY (platform, content_key)
);

CREATE INDEX IF NOT EXISTS idx_social_posts_posted_at
  ON social_posts (posted_at);

CREATE TABLE IF NOT EXISTS media_staging (
  object_key TEXT PRIMARY KEY,
  bucket TEXT NOT NULL,
  platform TEXT NOT NULL,
  kind TEXT NOT NULL,
  content_type TEXT,
  bytes INTEGER NOT NULL,
  public_url TEXT NOT NULL,
  status TEXT NOT NULL,
  workflow TEXT,
  run_id TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  deleted_at TEXT,
  external_id TEXT,
  details_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_media_staging_status_expiry
  ON media_staging (status, expires_at);

CREATE INDEX IF NOT EXISTS idx_media_staging_run
  ON media_staging (workflow, run_id);

CREATE TABLE IF NOT EXISTS quota_snapshots (
  source TEXT NOT NULL,
  period TEXT NOT NULL,
  count INTEGER NOT NULL,
  recorded_at TEXT NOT NULL,
  details_json TEXT,
  PRIMARY KEY (source, period)
);
