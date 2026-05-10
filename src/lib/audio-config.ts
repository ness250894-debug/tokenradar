/**
 * Audio Configuration — Track Library
 *
 * Maps local audio files in public/audio/ to their beat-drop sync points.
 * Used by Remotion to overlay music starting at the right moment.
 *
 * Note: startSeconds values are initial estimates. Tune them by listening
 * to each track and identifying the "drop" or "hook" moment.
 */

/** Audio track metadata for Remotion rendering. */
export interface AudioTrack {
  /** Filename in public/audio/ (without path prefix). */
  file: string;
  /** Beat-drop offset in seconds — Remotion <Audio startFrom /> value. */
  startSeconds: number;
  /** Optional BPM for future tempo-synced animations. */
  bpm?: number;
}

/**
 * Available audio tracks for video compositions.
 * Each track is ~30 seconds long (~727 KB).
 */
export const AUDIO_TRACKS: AudioTrack[] = [
  { file: "Against_The_Boulevard.mp3", startSeconds: 0 },
  { file: "Black_Asphalt.mp3", startSeconds: 0 },
  { file: "Calculated_Motion.mp3", startSeconds: 0 },
  { file: "Concrete_Gravity.mp3", startSeconds: 0 },
  { file: "Concrete_Grip.mp3", startSeconds: 0 },
  { file: "Gold_and_Granite.mp3", startSeconds: 0 },
  { file: "Golden_Bastion.mp3", startSeconds: 0 },
  { file: "Midnight_Pursuit.mp3", startSeconds: 0 },
  { file: "The_Pendulum_Falls.mp3", startSeconds: 0 },
  { file: "Velvet_and_Concrete.mp3", startSeconds: 0 },
];

/**
 * Get a random audio track from the library.
 */
export function getRandomTrack(): AudioTrack {
  const index = Math.floor(Math.random() * AUDIO_TRACKS.length);
  return AUDIO_TRACKS[index];
}

/**
 * Get a deterministic audio track for a given date string.
 * Ensures the same day always picks the same track, providing
 * consistency across retries and multi-platform posts.
 *
 * @param dateStr - ISO date string (e.g., "2026-05-09")
 */
export function getTrackForDate(dateStr: string): AudioTrack {
  // Simple hash: sum of char codes, mod by track count
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    hash = (hash * 31 + dateStr.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % AUDIO_TRACKS.length;
  return AUDIO_TRACKS[index];
}

/**
 * Get the full relative path to an audio file from the project root.
 * Remotion reads these through staticFile(`audio/${track.file}`).
 */
export function getAudioPath(track: AudioTrack): string {
  return `public/audio/${track.file}`;
}
