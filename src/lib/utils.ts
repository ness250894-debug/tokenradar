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
 * based on the UTC hour.
 */
export function getTimeOfDay(): string {
  const hour = new Date().getUTCHours();
  if (hour < 12 && hour > 4) return "Morning";
  if (hour >= 12 && hour < 18) return "Afternoon";
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
