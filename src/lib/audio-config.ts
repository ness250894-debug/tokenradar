/**
 * Audio Configuration — Track Library
 *
 * Maps local audio files in public/video-assets/audio/ to their beat-drop sync points.
 * Used by Remotion to overlay music starting at the right moment.
 *
 * Note: startSeconds values are initial estimates. Tune them by listening
 * to each track and identifying the "drop" or "hook" moment.
 */

import * as fs from "fs";
import * as path from "path";

/** Audio track metadata for Remotion rendering. */
export interface AudioTrack {
  /** Filename in public/video-assets/audio/ (without path prefix). */
  file: string;
  /** Beat-drop offset in seconds — Remotion <Audio startFrom /> value. */
  startSeconds: number;
  /** Optional BPM for future tempo-synced animations. */
  bpm?: number;
}

export interface AvailableAudioTrackSelection {
  track: AudioTrack;
  fallbackLevel: "seeded-track" | "next-configured-track";
  warnings: string[];
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

function stableHash(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function defaultAudioFileExists(track: AudioTrack): boolean {
  return fs.existsSync(path.resolve(process.cwd(), getAudioPath(track)));
}

/**
 * Select a deterministic local audio track and preflight that the file exists.
 * If the seeded track is missing, use the next configured available file.
 * This fails before rendering when every configured local track is missing.
 */
export function selectAvailableAudioTrack(
  seed: string,
  options: {
    tracks?: AudioTrack[];
    fileExists?: (track: AudioTrack) => boolean;
  } = {},
): AvailableAudioTrackSelection {
  const tracks = options.tracks || AUDIO_TRACKS;
  const fileExists = options.fileExists || defaultAudioFileExists;
  if (tracks.length === 0) {
    throw new Error("No configured local audio files are available. Configure AUDIO_TRACKS before rendering.");
  }

  const seededIndex = stableHash(seed) % tracks.length;
  const orderedTracks = [
    ...tracks.slice(seededIndex),
    ...tracks.slice(0, seededIndex),
  ];
  const warnings: string[] = [];

  for (let index = 0; index < orderedTracks.length; index++) {
    const track = orderedTracks[index];
    if (fileExists(track)) {
      return {
        track,
        fallbackLevel: index === 0 ? "seeded-track" : "next-configured-track",
        warnings,
      };
    }
    warnings.push(`audio-missing:${track.file}`);
  }

  throw new Error(
    `No configured local audio files are available. Checked: ${tracks.map((track) => track.file).join(", ")}`,
  );
}

/**
 * Get the full relative path to an audio file from the project root.
 * Remotion reads these through staticFile(`audio/${track.file}`) because
 * remotion.config.ts sets public/video-assets as the Remotion public dir.
 */
export function getAudioPath(track: AudioTrack): string {
  return `public/video-assets/audio/${track.file}`;
}
