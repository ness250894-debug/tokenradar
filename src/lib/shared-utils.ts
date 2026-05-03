/**
 * Shared Utilities — TokenRadar
 *
 * Browser-safe utility functions used across the site.
 */

/**
 * Slugify a string for use in URLs (lowercase, kebab-case).
 */
export function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
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

/**
 * Simple Mutex for protecting shared resources and ensuring sequential execution
 * of rate-limited API calls across concurrent async workflows.
 */
export class Mutex {
  private mutex = Promise.resolve();

  async lock(): Promise<() => void> {
    let begin: (unlock: () => void) => void = () => {};

    this.mutex = this.mutex.then(() => {
      return new Promise(begin);
    });

    return new Promise((res) => {
      begin = res;
    });
  }

  async runExclusive<T>(task: () => Promise<T>): Promise<T> {
    const unlock = await this.lock();
    try {
      return await task();
    } finally {
      unlock();
    }
  }
}

/**
 * Ensures that all specified HTML tags in a string are properly closed.
 * Useful for fixing truncated AI outputs or lazy formatting.
 * 
 * @param text - The text to check
 * @param tags - Array of tag names to check (e.g., ['b', 'tg-spoiler'])
 */
export function ensureHtmlTagsClosed(text: string, tags: string[]): string {
  let result = text;
  for (const tag of tags) {
    const startTag = `<${tag}>`;
    const endTag = `</${tag}>`;
    
    // Count occurrences
    const startCount = (result.match(new RegExp(startTag, 'gi')) || []).length;
    const endCount = (result.match(new RegExp(endTag, 'gi')) || []).length;
    
    // If we have more start tags than end tags, append the missing ones
    if (startCount > endCount) {
      const diff = startCount - endCount;
      result += endTag.repeat(diff);
    }
  }
  return result;
}
