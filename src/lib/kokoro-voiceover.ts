import * as fs from "fs";
import * as path from "path";
import { createRequire } from "module";

type KokoroDtype = "fp32" | "fp16" | "q8" | "q4" | "q4f16";
type KokoroDevice = "wasm" | "webgpu" | "cpu";

interface KokoroAudio {
  save: (outputPath: string) => void | Promise<void>;
}

interface KokoroEngine {
  generate: (text: string, options: { voice: string }) => Promise<KokoroAudio>;
}

interface KokoroModule {
  KokoroTTS: {
    from_pretrained: (modelId: string, options: { dtype: KokoroDtype; device: KokoroDevice }) => Promise<KokoroEngine>;
  };
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

export interface KokoroVoiceoverRequest {
  script: string;
  outputDir: string;
  fileName: string;
  enabled?: boolean;
  required?: boolean;
  modelId?: string;
  voice?: string;
  dtype?: KokoroDtype;
  device?: KokoroDevice;
  dateSeed?: string; // Optional seed for dynamic voice rotation
}

export interface KokoroVoiceoverResult {
  provider: "kokoro";
  status: "generated" | "skipped" | "failed";
  fileName?: string;
  outputPath?: string;
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

export async function generateKokoroVoiceover({
  script,
  outputDir,
  fileName,
  enabled = shouldGenerateKokoroVoiceover(),
  required = process.env.TOKENRADAR_VIDEO_TTS_REQUIRED === "1",
  modelId = process.env.TOKENRADAR_KOKORO_MODEL || "onnx-community/Kokoro-82M-v1.0-ONNX",
  voice = process.env.TOKENRADAR_KOKORO_VOICE || "af_bella",
  dtype = (process.env.TOKENRADAR_KOKORO_DTYPE as KokoroDtype | undefined) || "q8",
  device = (process.env.TOKENRADAR_KOKORO_DEVICE as KokoroDevice | undefined) || "cpu",
  dateSeed,
}: KokoroVoiceoverRequest): Promise<KokoroVoiceoverResult> {
  const cleanScript = script.replace(/\s+/g, " ").trim();
  if (!enabled || !cleanScript) {
    return { provider: "kokoro", status: "skipped" };
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
        console.log(`[Kokoro] Date seed '${dateSeed}' mapped to rotating voice '${selectedVoice}'`);
      }
    } else {
      // Fallback if no seed is provided but rotation is enabled
      const day = new Date().getDate();
      selectedVoice = ROTATING_VOICES[day % ROTATING_VOICES.length];
      console.log(`[Kokoro] No date seed provided; defaulting to rotating voice '${selectedVoice}'`);
    }
  }

  try {
    fs.mkdirSync(outputDir, { recursive: true });
    const engine = await loadKokoroEngine(modelId, dtype, device);
    const audio = await engine.generate(cleanScript, { voice: selectedVoice });
    await audio.save(outputPath);

    if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size <= 0) {
      throw new Error("Kokoro did not write a non-empty audio file.");
    }

    return { provider: "kokoro", status: "generated", fileName, outputPath };
  } catch (error) {
    cachedEngine = undefined;
    const message = error instanceof Error ? error.message : String(error);
    if (required) {
      throw new Error(`Kokoro voiceover failed: ${message}`);
    }
    return { provider: "kokoro", status: "failed", error: message };
  }
}
