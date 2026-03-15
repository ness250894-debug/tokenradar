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

const SCAN_DIRS = [
  path.resolve(__dirname, "../data"),
  path.resolve(__dirname, "../content")
];

const CONFLICT_MARKERS = ["<<<<<<<", "=======", ">>>>>>>"];

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
      results = results.concat(getFiles(file));
    } else if (file.endsWith(".json")) {
      results.push(file);
    }
  });
  return results;
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

  if (failCount > 0) {
    console.error(`\nValidation failed: Found ${failCount} corrupted files among ${totalCount} checked.`);
    process.exit(1);
  } else {
    console.log(`\u2705 Content integrity verified successfully (${totalCount} files).`);
  }
}

main();
