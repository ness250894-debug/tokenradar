import * as fs from "fs";
import * as path from "path";

import { executeD1Query } from "../src/lib/d1-client";
import { formatErrorForLog, loadEnv } from "../src/lib/utils";

loadEnv();

const MIGRATIONS_DIR = path.resolve(process.cwd(), "migrations", "d1");

interface MigrationRow {
  id: string;
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
  const sql = fs.readFileSync(filePath, "utf-8").trim();
  if (!sql) return;

  console.log(`Applying D1 migration ${fileName}...`);
  await executeD1Query(sql, [], { required: true });
  await executeD1Query(
    "INSERT INTO ops_schema_migrations (id, applied_at) VALUES (?, ?)",
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
