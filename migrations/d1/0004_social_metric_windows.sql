ALTER TABLE social_post_metrics ADD COLUMN window_hours INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS idx_social_post_metrics_window
  ON social_post_metrics (platform, content_key, window_hours)
  WHERE window_hours IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_social_post_metrics_window_measured
  ON social_post_metrics (window_hours, measured_at);
