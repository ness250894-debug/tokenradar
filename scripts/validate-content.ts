/**
 * Content Validation Script
 * 
 * Scans data/ and content/ directories to:
 * 1. Ensure all .json files are valid JSON.
 * 2. Detect Git conflict markers (<<<<<<<, =======, >>>>>>>).
 * 
 * This script is run during 'npm run prebuild' to prevent broken builds.
 */

import * as fs from "fs";
import * as path from "path";
import { normalizeTge, type UpcomingTge } from "../src/lib/tge";

const SCAN_DIRS = [
  path.resolve(__dirname, "../data"),
  path.resolve(__dirname, "../content")
];

const DATA_DIR = path.resolve(__dirname, "../data");
const CONTENT_TOKENS_DIR = path.resolve(__dirname, "../content/tokens");
const QUEUE_DIR = path.join(DATA_DIR, "queue");
const TGE_FILE = path.join(DATA_DIR, "upcoming-tges.json");
const CONFLICT_MARKERS = ["<<<<<<<", "=======", ">>>>>>>"];
const PLACEHOLDER_PATTERN = /\{\{[A-Z0-9_]+\}\}/g;

function validateFile(filePath: string): { success: boolean; error?: string } {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    
    // 1. Check for conflict markers
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      for (const marker of CONFLICT_MARKERS) {
        if (line.startsWith(marker)) {
          return {
            success: false,
            error: `Git conflict marker "${marker}" found at line ${i + 1}`
          };
        }
      }
    }

    // 2. Check for valid JSON
    if (filePath.endsWith(".json")) {
      JSON.parse(content);
    }

    return { success: true };
  } catch (e) {
    return {
      success: false,
      error: `Invalid JSON syntax: ${e instanceof Error ? e.message : String(e)}`
    };
  }
}

function getFiles(dir: string): string[] {
  let results: string[] = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    file = path.resolve(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      if (path.basename(file) !== "logs") {
        results = results.concat(getFiles(file));
      }
    } else if (file.endsWith(".json")) {
      results.push(file);
    }
  });
  return results;
}

function validateTgePreviews(): string[] {
  const errors: string[] = [];
  const tgeIds = new Set<string>();

  if (fs.existsSync(TGE_FILE)) {
    const tges = JSON.parse(fs.readFileSync(TGE_FILE, "utf-8")) as { id?: string }[];
    for (const tge of tges) {
      if (tge.id) tgeIds.add(tge.id);
    }
  }

  const checkDir = (baseDir: string) => {
    if (!fs.existsSync(baseDir)) return;
    for (const tokenId of fs.readdirSync(baseDir)) {
      const previewPath = path.join(baseDir, tokenId, "tge-preview.json");
      if (fs.existsSync(previewPath) && !tgeIds.has(tokenId)) {
        errors.push(`${path.relative(process.cwd(), previewPath)} has no matching data/upcoming-tges.json entry`);
        continue;
      }

      if (fs.existsSync(previewPath)) {
        const raw = fs.readFileSync(previewPath, "utf-8");
        const placeholders = Array.from(new Set(raw.match(PLACEHOLDER_PATTERN) || []));
        if (placeholders.length > 0) {
          errors.push(`${path.relative(process.cwd(), previewPath)} contains unresolved TGE placeholders: ${placeholders.join(", ")}`);
        }
      }
    }
  };

  checkDir(CONTENT_TOKENS_DIR);
  checkDir(QUEUE_DIR);

  return errors;
}

function validateTgeDataset(): string[] {
  const errors: string[] = [];
  if (!fs.existsSync(TGE_FILE)) return errors;

  let tges: UpcomingTge[] = [];
  try {
    tges = JSON.parse(fs.readFileSync(TGE_FILE, "utf-8")) as UpcomingTge[];
  } catch (e) {
    return [`data/upcoming-tges.json is invalid JSON: ${e instanceof Error ? e.message : String(e)}`];
  }

  const seenIds = new Set<string>();
  const seenNonGenericSymbols = new Map<string, string>();

  for (const rawTge of tges) {
    const tge = normalizeTge(rawTge);
    const label = rawTge.id || rawTge.name || "unknown TGE";

    if (!rawTge.id || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(rawTge.id)) {
      errors.push(`data/upcoming-tges.json has invalid id for ${label}`);
    }

    if (seenIds.has(rawTge.id)) {
      errors.push(`data/upcoming-tges.json has duplicate TGE id: ${rawTge.id}`);
    }
    seenIds.add(rawTge.id);

    if (!rawTge.name || !rawTge.category || !rawTge.expectedTge || !rawTge.dataSource) {
      errors.push(`data/upcoming-tges.json missing required fields for ${label}`);
    }

    if ((rawTge.narrativeStrength ?? -1) < 0 || (rawTge.narrativeStrength ?? 101) > 100) {
      errors.push(`data/upcoming-tges.json has invalid narrativeStrength for ${label}`);
    }

    if ((tge.confidence ?? -1) < 0 || (tge.confidence ?? 101) > 100) {
      errors.push(`data/upcoming-tges.json has invalid confidence for ${label}`);
    }

    if (!tge.signals || tge.signals.length === 0) {
      errors.push(`data/upcoming-tges.json has no evidence signals for ${label}`);
    }

    const symbol = (tge.symbol || "").toUpperCase();
    if (symbol && !["TBD", "TBA", "N/A", "NA", "UNKNOWN"].includes(symbol)) {
      const existing = seenNonGenericSymbols.get(symbol);
      if (existing && existing !== tge.id) {
        errors.push(`data/upcoming-tges.json reuses symbol ${symbol} for ${existing} and ${tge.id}`);
      }
      seenNonGenericSymbols.set(symbol, tge.id);
    }
  }

  return errors;
}

function main() {
  console.log("Checking content integrity...");
  let failCount = 0;
  let totalCount = 0;

  for (const dir of SCAN_DIRS) {
    if (!fs.existsSync(dir)) continue;
    const files = getFiles(dir);
    for (const file of files) {
      totalCount++;
      const result = validateFile(file);
      if (!result.success) {
        failCount++;
        console.error(`\u274C ${path.relative(process.cwd(), file)}: ${result.error}`);
      }
    }
  }

  const tgeErrors = validateTgePreviews();
  for (const error of tgeErrors) {
    failCount++;
    console.error(`\u274C ${error}`);
  }

  const tgeDatasetErrors = validateTgeDataset();
  for (const error of tgeDatasetErrors) {
    failCount++;
    console.error(`\u274C ${error}`);
  }

  if (failCount > 0) {
    console.error(`\nValidation failed: Found ${failCount} corrupted files among ${totalCount} checked.`);
    process.exit(1);
  } else {
    console.log(`\u2705 Content integrity verified successfully (${totalCount} files).`);
  }
}

main();
