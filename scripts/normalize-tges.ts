/**
 * Normalize data/upcoming-tges.json into the lifecycle/evidence model.
 *
 * This is intentionally deterministic: it does not call external APIs, and it
 * preserves legacy fields while adding normalized confidence, signals, and
 * lifecycle status.
 */

import * as fs from "fs";
import * as path from "path";
import { normalizeTge, type UpcomingTge } from "../src/lib/tge";

const TGE_FILE = path.resolve(process.cwd(), "data/upcoming-tges.json");

function main() {
  const raw = JSON.parse(fs.readFileSync(TGE_FILE, "utf-8")) as UpcomingTge[];
  const normalized = raw.map((tge) => {
    const manualStatus = tge.lifecycleStatus === "rejected" ? tge.lifecycleStatus : undefined;
    return normalizeTge({
      ...tge,
      confidence: undefined,
      lifecycleStatus: manualStatus,
    });
  });

  fs.writeFileSync(TGE_FILE, `${JSON.stringify(normalized, null, 2)}\n`);

  const byStatus = normalized.reduce<Record<string, number>>((acc, tge) => {
    const status = tge.lifecycleStatus || "candidate";
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});

  console.log(`Normalized ${normalized.length} TGE records.`);
  console.log(JSON.stringify(byStatus, null, 2));
}

main();
