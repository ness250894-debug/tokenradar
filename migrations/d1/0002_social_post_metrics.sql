CREATE TABLE IF NOT EXISTS social_post_metrics (
  platform TEXT NOT NULL,
  content_key TEXT NOT NULL,
  measured_at TEXT NOT NULL,
  impressions INTEGER,
  views INTEGER,
  likes INTEGER,
  replies INTEGER,
  comments INTEGER,
  reposts INTEGER,
  shares INTEGER,
  saves INTEGER,
  link_clicks INTEGER,
  profile_clicks INTEGER,
  watch_time_seconds REAL,
  completion_rate REAL,
  details_json TEXT,
  PRIMARY KEY (platform, content_key, measured_at)
);

CREATE INDEX IF NOT EXISTS idx_social_post_metrics_post
  ON social_post_metrics (platform, content_key, measured_at);

CREATE INDEX IF NOT EXISTS idx_social_post_metrics_measured_at
  ON social_post_metrics (measured_at);
