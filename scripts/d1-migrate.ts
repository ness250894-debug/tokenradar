import * as fs from "fs";
import * as path from "path";

import { executeD1Query } from "../src/lib/d1-client";
import { formatErrorForLog, loadEnv } from "../src/lib/utils";

loadEnv();

const MIGRATIONS_DIR = path.resolve(process.cwd(), "migrations", "d1");

interface MigrationRow {
  id: string;
}

interface TableInfoRow {
  name: string;
}

const WINDOW_HOURS_ALTER_RE = /ALTER TABLE social_post_metrics ADD COLUMN window_hours INTEGER;\s*/i;

async function socialMetricsHasWindowHours(): Promise<boolean> {
  const tableInfo = await executeD1Query<TableInfoRow>(
    "PRAGMA table_info(social_post_metrics)",
    [],
    { required: true },
  );
  return (tableInfo[0]?.results || []).some((column) => column.name === "window_hours");
}

async function ensureMigrationTable(): Promise<void> {
  await executeD1Query(
    `
    CREATE TABLE IF NOT EXISTS ops_schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
    `,
    [],
    { required: true },
  );
}

async function getAppliedMigrationIds(): Promise<Set<string>> {
  const results = await executeD1Query<MigrationRow>(
    "SELECT id FROM ops_schema_migrations ORDER BY id",
    [],
    { required: true },
  );
  return new Set((results[0]?.results || []).map((row) => row.id));
}

async function applyMigration(fileName: string): Promise<void> {
  const filePath = path.join(MIGRATIONS_DIR, fileName);
  let sql = fs.readFileSync(filePath, "utf-8").trim();
  if (!sql) return;

  // 0004 may have completed its ALTER before a later statement or migration
  // marker failed. SQLite has no portable ADD COLUMN IF NOT EXISTS, so make
  // that bridge explicitly resumable.
  if (fileName === "0004_social_metric_windows.sql") {
    if (await socialMetricsHasWindowHours()) {
      sql = sql.replace(WINDOW_HOURS_ALTER_RE, "").trim();
    }
  }

  console.log(`Applying D1 migration ${fileName}...`);
  if (sql) {
    try {
      await executeD1Query(sql, [], { required: true });
    } catch (error) {
      // Another workflow may win the first-run ALTER race between our schema
      // check and execution. Verify that exact outcome, then execute the
      // remaining idempotent indexes instead of failing the migration.
      if (fileName !== "0004_social_metric_windows.sql" || !(await socialMetricsHasWindowHours())) {
        throw error;
      }
      const remainder = sql.replace(WINDOW_HOURS_ALTER_RE, "").trim();
      if (remainder) await executeD1Query(remainder, [], { required: true });
    }
  }
  await executeD1Query(
    "INSERT OR IGNORE INTO ops_schema_migrations (id, applied_at) VALUES (?, ?)",
    [fileName, new Date().toISOString()],
    { required: true },
  );
}

async function main(): Promise<void> {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    throw new Error(`D1 migrations directory not found: ${MIGRATIONS_DIR}`);
  }

  await ensureMigrationTable();
  const applied = await getAppliedMigrationIds();
  const migrationFiles = fs.readdirSync(MIGRATIONS_DIR)
    .filter((fileName) => fileName.endsWith(".sql"))
    .sort();

  let appliedCount = 0;
  for (const fileName of migrationFiles) {
    if (applied.has(fileName)) {
      console.log(`Skipping already-applied D1 migration ${fileName}.`);
      continue;
    }

    await applyMigration(fileName);
    appliedCount += 1;
  }

  console.log(`D1 migrations complete. Applied ${appliedCount} new migration(s).`);
}

main().catch((error) => {
  console.error(`D1 migration failed: ${formatErrorForLog(error)}`);
  process.exit(1);
});
