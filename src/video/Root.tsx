
import { Composition } from "remotion";
import { TopGainerUpdate } from "./TopGainerUpdate";
import type { Verdict } from "./styles";
import type { VideoAssetLayer, VideoAssetStageSegment, VideoMediaStage } from "../lib/video-assets";
import type { VideoFormatKey } from "../lib/video-formats";
import type { VideoVisualRecipe } from "../lib/video-recipes";

// Define the schema for the props we'll pass dynamically
export type TopGainerProps = {
  tokenName: string;
  symbol: string;
  price: number;
  priceChange24h: number;
  riskScore: number;
  riskLevel?: string;
  marketCap: number;
  marketCapRank?: number;
  volume24h?: number;
  growthPotentialIndex?: number;
  /** Audio filename from public/video-assets/audio/ (e.g., "Midnight_Pursuit.mp3"). */
  audioFile?: string;
  /** Seconds into the audio track to start playback (beat-drop offset). */
  audioStartSeconds?: number;
  /** Voiceover filename from public/video-assets/voiceover/. */
  voiceoverFile?: string;
  /** Narration text used to generate the voiceover. */
  voiceoverScript?: string;
  /** Generated hook text for Act 1 */
  hookText?: string;
  /** Why it's moving / Context for Act 4 */
  contextText?: string;
  /** Final calculated research read for Act 5 */
  verdict?: Verdict;
  /** Editorial format used to vary short-form video structure. */
  videoFormatKey?: VideoFormatKey;
  /** One-sentence format-specific thesis for this video. */
  videoThesis?: string;
  /** Seeded visual recipe used to vary layout, chart, scene order, and motion. */
  visualRecipe?: VideoVisualRecipe;
  /** Optional background/overlay media selected from the local b-roll library. */
  mediaAssets?: VideoAssetLayer[];
  /** Timed full-screen b-roll segments for the primary stage. */
  mediaSegments?: VideoAssetStageSegment[];
  /** How aggressively selected media should drive the visual stage. */
  mediaStage?: VideoMediaStage;
};

// Default props for the Studio preview
const defaultProps: TopGainerProps = {
  tokenName: "Ethereum",
  symbol: "ETH",
  price: 3500.5,
  priceChange24h: 5.2,
  riskScore: 2.1,
  riskLevel: "low",
  marketCap: 420000000000,
  marketCapRank: 2,
  volume24h: 18000000000,
  growthPotentialIndex: 72,
  audioFile: "Midnight_Pursuit.mp3",
  audioStartSeconds: 0,
  voiceoverFile: undefined,
  voiceoverScript: "Ethereum is back in the conversation, but the useful question is whether attention turns into confirmation. Treat this as market context, not a dashboard headline.",
  hookText: "WHY ETHEREUM NEEDS A DATA CHECK",
  contextText: "Ethereum is moving through a market read where volume, liquidity, and risk confirmation matter most.",
  verdict: "CONSTRUCTIVE",
  videoFormatKey: "breakout_watch",
  videoThesis: "Ethereum is being checked as a breakout candidate because momentum needs volume confirmation.",
  mediaAssets: [],
  mediaSegments: [],
  mediaStage: "ambient",
  visualRecipe: {
    key: "preview:split_report:signal_radar:terminal_scan:cyan_depth:slide_cut:fast_reveal",
    sceneOrder: ["hook", "reveal", "context", "metrics", "verdict"],
    layoutPack: "split_report",
    chartPack: "signal_radar",
    motionPack: "slide_cut",
    backgroundSystem: "terminal_scan",
    colorTheme: "cyan_depth",
    pacingProfile: "fast_reveal",
  },
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="TopGainerUpdate"
        component={TopGainerUpdate}
        durationInFrames={900} // 30 seconds at 30fps
        fps={30}
        width={1080}
        height={1920}
        defaultProps={defaultProps}
      />
    </>
  );
};
