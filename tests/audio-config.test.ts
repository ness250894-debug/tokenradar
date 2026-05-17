import { describe, expect, it } from "vitest";
import {
  AUDIO_TRACKS,
  selectAvailableAudioTrack,
} from "../src/lib/audio-config";

describe("audio preflight", () => {
  it("falls back to another configured local track when the seeded track is missing", () => {
    const firstTrack = AUDIO_TRACKS[0];
    const secondTrack = AUDIO_TRACKS[1];

    const result = selectAvailableAudioTrack("seed", {
      tracks: [firstTrack, secondTrack],
      fileExists: (track) => track.file === secondTrack.file,
    });

    expect(result.track).toEqual(secondTrack);
    expect(result.fallbackLevel).toBe("next-configured-track");
    expect(result.warnings).toContain(`audio-missing:${firstTrack.file}`);
  });

  it("throws before rendering when every configured local audio track is missing", () => {
    expect(() =>
      selectAvailableAudioTrack("seed", {
        tracks: AUDIO_TRACKS.slice(0, 2),
        fileExists: () => false,
      }),
    ).toThrow(/No configured local audio files are available/);
  });
});
