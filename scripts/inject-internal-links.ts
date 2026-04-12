/**
 * Semantic Internal Linking Engine
 * 
 * Auto-injects contextual Markdown links to other TokenRadar pages 
 * inside AI-generated articles. Limits link density to protect SEO.
 * Will only run post-generation, during the daily build pipeline.
 *
 * Usage: npx tsx scripts/inject-internal-links.ts
 */

import * as fs from "fs/promises";
import * as path from "path";

const DATA_TOKENS_DIR = path.resolve(__dirname, "../data/tokens");
const CONTENT_CURRENT = path.resolve(__dirname, "../content/tokens");

const MAX_LINKS_PER_ARTICLE = 4;

async function buildTokenMapping(): Promise<Map<string, string>> {
  const mapping = new Map<string, string>();
  try {
    const files = await fs.readdir(DATA_TOKENS_DIR);
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const slug = file.replace(".json", "");
      try {
        const data = JSON.parse(await fs.readFile(path.join(DATA_TOKENS_DIR, file), "utf-8"));
        if (data.name) {
          mapping.set(data.name.toLowerCase(), slug);
        }
      } catch (_e) {}
    }
  } catch (e) {
    console.error("Failed to read token data", e);
  }
  return mapping;
}

function injectLinks(content: string, mapping: Map<string, string>, currentSlug: string): string {
  // Sort descending by length so we match "Bitcoin Cash" before "Bitcoin"
  const tokenNames = Array.from(mapping.keys()).sort((a, b) => b.length - a.length);

  // Split content into protected blocks vs plain text
  // Protected: headers (#), code blocks (``` ... ``` or `...`), links ([...](...)), HTML tags
  const tokenizer = /(```[\s\S]*?```|`[^`]*`|\[[^\]]+\]\([^)]+\)|^#+ .*$|<[^>]+>)/gm;
  const parts = content.split(tokenizer);

  let linkedCount = 0;
  const usedSlugs = new Set<string>();

  for (let i = 0; i < parts.length; i++) {
    // Only process plain text parts (even indices)
    if (i % 2 !== 0) continue;

    if (linkedCount >= MAX_LINKS_PER_ARTICLE) break;

    let textPart = parts[i];

    for (const tokenName of tokenNames) {
      if (linkedCount >= MAX_LINKS_PER_ARTICLE) break;

      const slug = mapping.get(tokenName)!;
      if (slug === currentSlug || usedSlugs.has(slug)) continue;

      // Safe word boundary matching
      const escaped = tokenName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Look for the token strictly bounded by non-word chars, but allow simple punctuation
      const regex = new RegExp(`(^|\\s|\\(|\\b)(${escaped})($|\\s|\\)|\\b|\\.|,)`, 'i');

      const match = textPart.match(regex);
      if (match) {
        // Log the injection context just for tracking during dev
        // console.log(`Injecting link for ${tokenName} -> /${slug}`);
        // match[1] = before, match[2] = token (cased properly), match[3] = after
        textPart = textPart.replace(regex, `$1[$2](/${slug})$3`);
        usedSlugs.add(slug);
        linkedCount++;
      }
    }

    parts[i] = textPart;
  }

  return parts.join('');
}

async function main() {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║     Semantic Internal Linking Engine     ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log();

  const mapping = await buildTokenMapping();
  console.log(`  Loaded ${mapping.size} tokens for semantic clustering.`);

  if (mapping.size === 0) return;

  try {
    const tokens = await fs.readdir(CONTENT_CURRENT);
    let updatedFiles = 0;

    for (const tokenId of tokens) {
      const tokenDir = path.join(CONTENT_CURRENT, tokenId);
      const stat = await fs.stat(tokenDir);
      if (!stat.isDirectory()) continue;

      const articles = await fs.readdir(tokenDir);
      for (const articleFile of articles) {
        if (!articleFile.endsWith(".json")) continue;
        
        const filePath = path.join(tokenDir, articleFile);
        try {
          const raw = await fs.readFile(filePath, "utf-8");
          const data = JSON.parse(raw);
          
          if (!data.content || typeof data.content !== "string") continue;

          const newContent = injectLinks(data.content, mapping, tokenId);
          
          if (newContent !== data.content) {
            data.content = newContent;
            await fs.writeFile(filePath, JSON.stringify(data, null, 2));
            updatedFiles++;
          }
        } catch (e) {
          console.error(`  Error processing ${filePath}:`, e);
        }
      }
    }
    
    console.log(`  ✓ Successfully injected internal links across ${updatedFiles} articles.`);
  } catch (e) {
    console.error("  Error reading content directory", e);
  }
}

main().catch(console.error);
