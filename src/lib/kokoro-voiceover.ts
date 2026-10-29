import * as fs from "fs";
import * as path from "path";
import { createRequire } from "module";
import {
  buildVideoCaptionCues,
  estimateVoiceoverDuration,
  splitScriptIntoClauses,
  type VideoCaptionCue,
} from "./video-captioning";

export { estimateVoiceoverDuration } from "./video-captioning";

type KokoroDtype = "fp32" | "fp16" | "q8" | "q4" | "q4f16";
type KokoroDevice = "wasm" | "webgpu" | "cpu";

export interface KokoroRawAudio {
  audio: Float32Array;
  sampling_rate: number;
  save: (outputPath: string) => void | Promise<void>;
}

interface KokoroEngine {
  generate: (text: string, options?: { voice?: string; speed?: number }) => Promise<KokoroRawAudio>;
}

interface KokoroModule {
  KokoroTTS: {
    from_pretrained: (modelId: string, options: { dtype: KokoroDtype; device: KokoroDevice }) => Promise<KokoroEngine>;
  };
}

interface TransformersModule {
  RawAudio: new (audio: Float32Array, sampling_rate: number) => KokoroRawAudio;
}

// Premium realistic voices supported by Kokoro-82M
export const KOKORO_VOICES = {
  BELLA: "af_bella",     // Smooth, default narrator (US Female)
  SARAH: "af_sarah",     // Energetic, conversational (US Female)
  NICOLE: "af_nicole",   // Professional, clear (US Female)
  SKY: "af_sky",         // Warm, friendly (US Female)
  ADAM: "am_adam",       // Warm, deep (US Male)
  MICHAEL: "am_michael", // Trustworthy, editorial (US Male)
  RIVER: "af_river",     // Dynamic, quick-paced (US Female)
  EMMA: "bf_emma",       // Female, professional (UK Female)
  GEORGE: "bm_george",   // Male, warm (UK Male)
};

// Deterministic rotation list (alternating female and male)
export const ROTATING_VOICES = [
  KOKORO_VOICES.SARAH,   // American female - energetic, conversational
  KOKORO_VOICES.ADAM,    // American male - deep, authoritative
  KOKORO_VOICES.BELLA,   // American female - smooth, steady
  KOKORO_VOICES.MICHAEL, // American male - warm, editorial
  KOKORO_VOICES.SKY,     // American female - warm, friendly
  KOKORO_VOICES.RIVER,   // American female - dynamic, quick-paced
];

export const KOKORO_DEFAULT_SPEED = 1.08;
const INTER_CLAUSE_PAUSE_SECONDS = 0.12;

export interface KokoroVoiceoverRequest {
  script: string;
  outputDir: string;
  fileName: string;
  enabled?: boolean;
  required?: boolean;
  modelId?: string;
  voice?: string;
  speed?: number;
  dualVoice?: boolean;
  dtype?: KokoroDtype;
  device?: KokoroDevice;
  dateSeed?: string; // Optional seed for dynamic voice rotation
}

export interface KokoroVoiceoverResult {
  provider: "kokoro";
  status: "generated" | "skipped" | "failed";
  fileName?: string;
  outputPath?: string;
  durationSeconds?: number;
  cues?: VideoCaptionCue[];
  voice?: string;
  speed?: number;
  error?: string;
}

let cachedEngine: Promise<KokoroEngine> | undefined;
const require = createRequire(import.meta.url);

function isDisabled(value: string | undefined): boolean {
  return ["0", "false", "off", "none", "disabled"].includes((value || "").trim().toLowerCase());
}

async function loadKokoroEngine(modelId: string, dtype: KokoroDtype, device: KokoroDevice): Promise<KokoroEngine> {
  if (!cachedEngine) {
    cachedEngine = (async () => {
      const mod = require("kokoro-js") as KokoroModule;
      return mod.KokoroTTS.from_pretrained(modelId, { dtype, device });
    })();
  }

  return cachedEngine;
}

export function shouldGenerateKokoroVoiceover(env: NodeJS.ProcessEnv = process.env): boolean {
  return !isDisabled(env.TOKENRADAR_VIDEO_TTS) && !isDisabled(env.TOKENRADAR_VIDEO_TTS_PROVIDER);
}



/**
 * Concatenate multiple audio segments into a single audio buffer with silent pauses.
 */
function concatenateAudioSegments(
  segments: KokoroRawAudio[],
  pauseSeconds: number,
): KokoroRawAudio {
  if (segments.length === 0) {
    throw new Error("Cannot concatenate zero audio segments.");
  }
  if (segments.length === 1) {
    return segments[0];
  }

  const samplingRate = segments[0].sampling_rate;
  const pauseSamples = Math.max(0, Math.round(pauseSeconds * samplingRate));
  const totalSamples = segments.reduce((sum, s) => sum + s.audio.length, 0) +
    (segments.length - 1) * pauseSamples;

  const merged = new Float32Array(totalSamples);
  let cursor = 0;

  for (let i = 0; i < segments.length; i++) {
    merged.set(segments[i].audio, cursor);
    cursor += segments[i].audio.length;
    if (i < segments.length - 1) {
      cursor += pauseSamples;
    }
  }

  const { RawAudio } = require("@huggingface/transformers") as TransformersModule;
  return new RawAudio(merged, samplingRate);
}

export async function generateKokoroVoiceover({
  script,
  outputDir,
  fileName,
  enabled = shouldGenerateKokoroVoiceover(),
  required = process.env.TOKENRADAR_VIDEO_TTS_REQUIRED === "1",
  modelId = process.env.TOKENRADAR_KOKORO_MODEL || "onnx-community/Kokoro-82M-v1.0-ONNX",
  voice = process.env.TOKENRADAR_KOKORO_VOICE || "af_bella",
  speed = Number(process.env.TOKENRADAR_KOKORO_SPEED) || KOKORO_DEFAULT_SPEED,
  dualVoice = process.env.TOKENRADAR_KOKORO_DUAL_VOICE === "1",
  dtype = (process.env.TOKENRADAR_KOKORO_DTYPE as KokoroDtype | undefined) || "q8",
  device = (process.env.TOKENRADAR_KOKORO_DEVICE as KokoroDevice | undefined) || "cpu",
  dateSeed,
}: KokoroVoiceoverRequest): Promise<KokoroVoiceoverResult> {
  const cleanScript = script.replace(/\s+/g, " ").trim();
  const safeSpeed = Math.max(0.6, Math.min(2.0, speed));
  const estimatedDuration = estimateVoiceoverDuration(cleanScript, safeSpeed);
  const estimatedCues = buildVideoCaptionCues(cleanScript, estimatedDuration);

  if (!enabled || !cleanScript) {
    return {
      provider: "kokoro",
      status: "skipped",
      durationSeconds: estimatedDuration,
      cues: estimatedCues,
      speed: safeSpeed,
    };
  }

  const outputPath = path.join(outputDir, fileName);

  // Apply deterministic voice rotation if requested or by default
  let selectedVoice = voice;
  if (
    selectedVoice === "rotate" ||
    process.env.TOKENRADAR_KOKORO_VOICE === "rotate" ||
    (!process.env.TOKENRADAR_KOKORO_VOICE && voice === "af_bella")
  ) {
    if (dateSeed) {
      const day = new Date(dateSeed).getDate();
      if (!isNaN(day)) {
        selectedVoice = ROTATING_VOICES[day % ROTATING_VOICES.length];
        console.info(`[Kokoro] Date seed '${dateSeed}' mapped to rotating voice '${selectedVoice}'`);
      }
    } else {
      const day = new Date().getDate();
      selectedVoice = ROTATING_VOICES[day % ROTATING_VOICES.length];
      console.info(`[Kokoro] No date seed provided; defaulting to rotating voice '${selectedVoice}'`);
    }
  }

  try {
    fs.mkdirSync(outputDir, { recursive: true });
    const engine = await loadKokoroEngine(modelId, dtype, device);
    const clauses = splitScriptIntoClauses(cleanScript);

    if (clauses.length <= 1) {
      // Single clause generation
      const audio = await engine.generate(cleanScript, { voice: selectedVoice, speed: safeSpeed });
      await audio.save(outputPath);

      if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size <= 0) {
        throw new Error("Kokoro did not write a non-empty audio file.");
      }

      const exactDuration = Number((audio.audio.length / audio.sampling_rate).toFixed(2));
      const cues: VideoCaptionCue[] = buildVideoCaptionCues(cleanScript, exactDuration);

      return {
        provider: "kokoro",
        status: "generated",
        fileName,
        outputPath,
        durationSeconds: exactDuration,
        cues,
        voice: selectedVoice,
        speed: safeSpeed,
      };
    }

    // Clause-by-clause generation with exact per-clause timing
    const segments: KokoroRawAudio[] = [];
    const cues: VideoCaptionCue[] = [];
    let timeCursor = 0;

    // Optional dual-voice alternation: energetic hook voice vs calm analyst voice
    const isDual = dualVoice || selectedVoice === "dual";
    const analystVoice = selectedVoice.startsWith("af_") ? KOKORO_VOICES.MICHAEL : KOKORO_VOICES.SARAH;

    for (let i = 0; i < clauses.length; i++) {
      const clauseText = clauses[i];
      const clauseVoice = isDual && i > 0 && i < clauses.length - 1 ? analystVoice : selectedVoice;
      const audio = await engine.generate(clauseText, { voice: clauseVoice, speed: safeSpeed });
      segments.push(audio);

      const clauseDuration = audio.audio.length / audio.sampling_rate;
      const startSeconds = Number(timeCursor.toFixed(2));
      const endSeconds = Number((timeCursor + clauseDuration).toFixed(2));

      cues.push({
        index: i + 1,
        startSeconds,
        endSeconds,
        text: clauseText,
      });

      timeCursor = endSeconds + INTER_CLAUSE_PAUSE_SECONDS;
    }

    const mergedAudio = concatenateAudioSegments(segments, INTER_CLAUSE_PAUSE_SECONDS);
    await mergedAudio.save(outputPath);

    if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size <= 0) {
      throw new Error("Kokoro did not write a non-empty audio file.");
    }

    const totalDurationSeconds = Number((mergedAudio.audio.length / mergedAudio.sampling_rate).toFixed(2));

    return {
      provider: "kokoro",
      status: "generated",
      fileName,
      outputPath,
      durationSeconds: totalDurationSeconds,
      cues,
      voice: selectedVoice,
      speed: safeSpeed,
    };
  } catch (error) {
    cachedEngine = undefined;
    const message = error instanceof Error ? error.message : String(error);
    if (required) {
      throw new Error(`Kokoro voiceover failed: ${message}`);
    }
    return {
      provider: "kokoro",
      status: "failed",
      error: message,
      durationSeconds: estimatedDuration,
      cues: estimatedCues,
      speed: safeSpeed,
    };
  }
}
