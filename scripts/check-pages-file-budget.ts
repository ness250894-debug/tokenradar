import * as fs from "fs";
import * as path from "path";

const DEFAULT_BUDGET = 19000;
const outputDir = path.resolve(process.cwd(), process.argv[2] || "out");
const rawBudget = Number(process.env.CF_PAGES_FILE_BUDGET || DEFAULT_BUDGET);
const budget = Number.isFinite(rawBudget) && rawBudget > 0 ? Math.floor(rawBudget) : DEFAULT_BUDGET;

function countFiles(dir: string): number {
  let count = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      count += countFiles(filePath);
    } else if (entry.isFile()) {
      count += 1;
    }
  }
  return count;
}

if (!fs.existsSync(outputDir)) {
  console.error(`Pages output directory not found: ${outputDir}`);
  process.exit(1);
}

const fileCount = countFiles(outputDir);
console.log(`Cloudflare Pages output files: ${fileCount} / ${budget}`);

if (fileCount > budget) {
  console.error(`Cloudflare Pages file budget exceeded: ${fileCount} files > ${budget}.`);
  process.exit(1);
}
