CREATE TABLE IF NOT EXISTS ai_usage_events (
  id TEXT PRIMARY KEY,
  recorded_at TEXT NOT NULL,
  workflow TEXT,
  content_key TEXT,
  operation TEXT,
  attempt INTEGER,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  thoughts_tokens INTEGER NOT NULL DEFAULT 0,
  cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  details_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_events_recorded
  ON ai_usage_events (recorded_at);

CREATE INDEX IF NOT EXISTS idx_ai_usage_events_workflow_recorded
  ON ai_usage_events (workflow, recorded_at);
