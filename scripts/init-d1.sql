CREATE TABLE IF NOT EXISTS tags (
  tag TEXT NOT NULL,
  path TEXT NOT NULL,
  PRIMARY KEY (tag, path)
);

CREATE TABLE IF NOT EXISTS revalidations (
  path TEXT PRIMARY KEY,
  revalidatedAt INTEGER NOT NULL
);
