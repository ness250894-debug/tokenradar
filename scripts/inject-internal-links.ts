/**
 * Semantic Internal Linking Engine — Phase 2 (Contextual Learning)
 * 
 * Auto-injects contextual Markdown links to:
 * 1. Other Token Pages (e.g. "Bitcoin" -> "/bitcoin")
 * 2. Glossary/Learn Hub Terms (e.g. "Rug pull" -> "/learn/what-is-a-rug-pull")
 */

import * as fs from "fs/promises";
import * as path from "path";

import { safeReadJson } from "../src/lib/utils";

const DATA_DIR = path.resolve(__dirname, "../data");
const CONTENT_DIR = path.resolve(__dirname, "../content/tokens");

const MAX_TOKEN_LINKS = 3;
const MAX_LEARN_LINKS = 2;

interface LinkMapping {
  name: string;
  slug: string;
  type: "token" | "learn";
}

async function buildAllMappings(): Promise<LinkMapping[]> {
  const mappings: LinkMapping[] = [];

  // 1. Build Token Mappings
  try {
    const tokenFiles = await fs.readdir(path.join(DATA_DIR, "tokens"));
    for (const file of tokenFiles) {
      if (!file.endsWith(".json")) continue;
      const slug = file.replace(".json", "");
      const data = safeReadJson<any>(path.join(DATA_DIR, "tokens", file), null);
      if (data && data.name) mappings.push({ name: data.name, slug: slug, type: "token" });
    }
  } catch (_e) {
    console.warn("⚠️ Tokens data not found. Skipping token links.");
  }

  // 2. Build Learn Hub Mappings
  try {
    const glossaryFile = path.join(DATA_DIR, "glossary.json");
    const raw = await fs.readFile(glossaryFile, "utf-8");
    const glossary = JSON.parse(raw);
    glossary.forEach((item: { title: string; slug: string }) => {
      // Extract main term from title if possible, or use slug parts
      let term = item.title.split("?")[0].replace("What is ", "").replace("Understanding ", "").trim();
      if (term.includes(": ")) term = term.split(": ")[0];
      
      mappings.push({ name: term, slug: `learn/${item.slug}`, type: "learn" });
      // Add common variations
      if (term === "Rug Pull") mappings.push({ name: "rugpull", slug: `learn/${item.slug}`, type: "learn" });
      if (term === "Market Cap") mappings.push({ name: "market capitalization", slug: `learn/${item.slug}`, type: "learn" });
    });
  } catch (_e) {
    console.warn("⚠️ Glossary data not found. Skipping learn hub links.");
  }

  return mappings.sort((a, b) => b.name.length - a.name.length);
}

function injectLinks(content: string, mappings: LinkMapping[], currentSlug: string): string {
  const tokenizer = /(```[\s\S]*?```|`[^`]*`|\[[^\]]+\]\([^)]+\)|^#+ .*$|<[^>]+>)/gm;
  const parts = content.split(tokenizer);

  let tokenLinked = 0;
  let learnLinked = 0;
  const usedSlugs = new Set<string>();

  for (let i = 0; i < parts.length; i++) {
    if (i % 2 !== 0) continue; // Skip protected parts

    let textPart = parts[i];

    for (const mapping of mappings) {
      if (mapping.type === "token" && tokenLinked >= MAX_TOKEN_LINKS) continue;
      if (mapping.type === "learn" && learnLinked >= MAX_LEARN_LINKS) continue;

      if (mapping.slug.includes(currentSlug) || usedSlugs.has(mapping.slug)) continue;

      const escaped = mapping.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(^|\\s|\\(|\\b)(${escaped})($|\\s|\\)|\\b|\\.|,)`, 'i');

      const match = textPart.match(regex);
      if (match) {
        textPart = textPart.replace(regex, `$1[$2](/${mapping.slug})$3`);
        usedSlugs.add(mapping.slug);
        if (mapping.type === "token") tokenLinked++;
        else learnLinked++;
      }
    }

    parts[i] = textPart;
  }

  return parts.join('');
}

async function main() {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║    Semantic Linking Engine — Scaled      ║");
  console.log("╚══════════════════════════════════════════╝");

  const mappings = await buildAllMappings();
  console.log(`  Loaded ${mappings.length} semantic mappings (Tokens + Learn Hub).`);

  if (mappings.length === 0) return;

  const tokens = await fs.readdir(CONTENT_DIR);
  let updatedFiles = 0;

  for (const tokenId of tokens) {
    const tokenDir = path.join(CONTENT_DIR, tokenId);
    if (!(await fs.stat(tokenDir)).isDirectory()) continue;

    const articles = await fs.readdir(tokenDir);
    for (const file of articles) {
      if (!file.endsWith(".json")) continue;
      const filePath = path.join(tokenDir, file);

      // Only process files modified in the last 24 hours to avoid
      // rewriting anchors on unchanged articles every single day.
      const stat = await fs.stat(filePath);
      const ageMs = Date.now() - stat.mtimeMs;
      const ONE_DAY_MS = 24 * 60 * 60 * 1000;
      if (ageMs > ONE_DAY_MS) continue;

      const raw = await fs.readFile(filePath, "utf-8");
      const data = JSON.parse(raw);
      
      if (!data.content) continue;

      const newContent = injectLinks(data.content, mappings, tokenId);
      if (newContent !== data.content) {
        data.content = newContent;
        await fs.writeFile(filePath, JSON.stringify(data, null, 2));
        updatedFiles++;
      }
    }
  }
  
  console.log(`  ✓ Successfully injected links in ${updatedFiles} articles.`);
}

main().catch((err) => {
  console.error("❌ Internal link injection failed:", err);
  process.exit(1);
});
