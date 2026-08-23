CREATE TABLE IF NOT EXISTS social_attribution_metrics (
  utm_content TEXT NOT NULL,
  window_days INTEGER NOT NULL,
  range_start TEXT NOT NULL,
  range_end TEXT NOT NULL,
  exported_at TEXT NOT NULL,
  source TEXT NOT NULL,
  medium TEXT NOT NULL,
  campaign TEXT NOT NULL,
  sessions INTEGER NOT NULL DEFAULT 0,
  engaged_sessions INTEGER NOT NULL DEFAULT 0,
  screen_page_views INTEGER NOT NULL DEFAULT 0,
  user_engagement_duration REAL NOT NULL DEFAULT 0,
  event_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (utm_content, window_days, range_end)
);

CREATE INDEX IF NOT EXISTS idx_social_attribution_exported
  ON social_attribution_metrics (window_days, exported_at);
