export interface VideoCaptionCue {
  index: number;
  startSeconds: number;
  endSeconds: number;
  text: string;
}

const DEFAULT_WORDS_PER_CUE = 6;

export function sanitizeVideoCaptionText(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/-->/g, "→")
    .replace(/\.{2,}/g, ".")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.!?])/g, "$1")
    .trim();
}

function splitCaptionWords(words: string[], wordsPerCue: number): string[] {
  const chunks: string[] = [];
  let current: string[] = [];

  for (const word of words) {
    current.push(word);
    const endsSentence = /[.!?]$/.test(word);
    if (current.length >= wordsPerCue || (endsSentence && current.length >= 3)) {
      chunks.push(current.join(" "));
      current = [];
    }
  }

  if (current.length > 0) chunks.push(current.join(" "));
  return chunks;
}

/**
 * Split narration into short, sound-off-friendly cues that never extend past
 * the rendered video. Timing is weighted by word count so short clauses do not
 * stay on screen as long as dense evidence lines.
 */
export function buildVideoCaptionCues(
  text: string,
  durationSeconds: number,
  wordsPerCue = DEFAULT_WORDS_PER_CUE,
): VideoCaptionCue[] {
  const cleanText = sanitizeVideoCaptionText(text);
  const safeDuration = Number.isFinite(durationSeconds) ? Math.max(0, durationSeconds) : 0;
  if (!cleanText || safeDuration <= 0) return [];

  const safeWordsPerCue = Math.max(3, Math.min(8, Math.round(wordsPerCue)));
  const chunks = splitCaptionWords(cleanText.split(" "), safeWordsPerCue);
  const totalWords = chunks.reduce((total, chunk) => total + chunk.split(" ").length, 0);
  let cursor = 0;

  return chunks.map((chunk, index) => {
    const chunkWords = chunk.split(" ").length;
    const startSeconds = cursor;
    const isLast = index === chunks.length - 1;
    const endSeconds = isLast
      ? safeDuration
      : Math.min(safeDuration, cursor + (chunkWords / totalWords) * safeDuration);
    cursor = endSeconds;

    return {
      index: index + 1,
      startSeconds,
      endSeconds,
      text: chunk,
    };
  });
}
