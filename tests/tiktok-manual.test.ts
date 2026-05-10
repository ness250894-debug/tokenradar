import { describe, expect, it } from "vitest";
import {
  buildTikTokManualVideoCaption,
  chunkTikTokManualCaption,
} from "../src/lib/tiktok-manual";
import { SOCIAL_PLATFORM_LIMITS } from "../src/lib/config";

describe("TikTok manual reporting helpers", () => {
  it("builds a short reporting video caption with token metadata", () => {
    const tiktokCaption = "Copy-ready TikTok caption #Crypto";
    const caption = buildTikTokManualVideoCaption({
      videoBuffer: Buffer.from("video"),
      caption: tiktokCaption,
      tokenName: "Solana",
      symbol: "sol",
      reason: "spotlight",
      generatedAt: "2026-05-10T12:00:00.000Z",
    });

    expect(caption).toContain("TikTok manual post ready: Solana ($SOL)");
    expect(caption).toContain(`Caption: ${tiktokCaption.length}/${SOCIAL_PLATFORM_LIMITS.TIKTOK.CAPTION_LIMIT} chars`);
    expect(caption.length).toBeLessThanOrEqual(1024);
  });

  it("keeps the manual caption copy-ready", () => {
    const caption = "First line\n\n#SOL #Crypto";

    expect(chunkTikTokManualCaption(caption)).toEqual([caption]);
  });

  it("falls back when the generated caption is blank", () => {
    expect(chunkTikTokManualCaption("   ")).toEqual(["TokenRadar market update.\n\n#Crypto #TokenRadar"]);
  });
});
