/**
 * Shared Utilities — TokenRadar
 *
 * Common utility functions used across scripts and libraries.
 */

import * as fs from "fs";

/**
 * Read and parse a JSON file safely. Returns the fallback value
 * if the file is missing, empty, or contains invalid JSON.
 *
 * @param filePath - Absolute path to the JSON file
 * @param fallback - Value to return on failure
 * @returns Parsed JSON data or fallback
 */
export function safeReadJson<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, "utf-8");
    if (!raw.trim()) return fallback;
    return JSON.parse(raw) as T;
  } catch (e) {
    console.warn(`  [warn] Failed to parse ${filePath}: ${e instanceof Error ? e.message : String(e)}`);
    return fallback;
  }
}

/**
 * Sleep for a given number of milliseconds.
 *
 * @param ms - Milliseconds to sleep
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Determine the current time of day in string format (Morning, Afternoon, Evening)
 * aligned to US Prime Time (America/New_York).
 */
export function getTimeOfDay(): string {
  // Extract hour in Eastern Time (0-23 format)
  // Fix: Intl.DateTimeFormat with hour12: false can return "24" for midnight instead of "0". We handle this safely.
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    hourCycle: 'h23'
  });
  const hourStr = formatter.format(new Date());
  const hour = parseInt(hourStr, 10);
  
  if (hour >= 5 && hour < 12) return "Morning";
  if (hour >= 12 && hour < 17) return "Afternoon";
  return "Evening";
}

/**
 * Pick a random persona/tone for social media posts.
 * The mix includes professional, story-driven, and slightly degen/casual tones.
 */
export function getRandomTone(): string {
  const tones = [
    "Analytical (Data-Driven, institutional focus)",
    "The Observer (Casual, conversational, spots actionable trends)",
    "Story-Driven (Narrative-focused, explains the why behind the metrics)",
    "Degen-lite (Engaging, slightly chaotic but highly knowledgeable)"
  ];
  return tones[Math.floor(Math.random() * tones.length)];
}
