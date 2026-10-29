import { Composition } from "remotion";
import { TopGainerUpdate } from "./TopGainerUpdate";
import { TikTokNativeStory } from "./TikTokNativeStory";
import { TokenComparisonBattle, type TokenComparisonBattleProps } from "./TokenComparisonBattle";
import type { Verdict } from "./styles";
import type { VideoAssetLayer, VideoAssetStageSegment, VideoMediaStage } from "../lib/video-assets";
import type { VideoCaptionCue } from "../lib/video-captioning";
import type { VideoFormatKey } from "../lib/video-formats";
import type { TikTokScenePlan } from "../lib/tiktok-scene-planner";
import type { VideoVisualRecipe } from "../lib/video-recipes";
import {
  STANDARD_VIDEO_DURATION_SECONDS,
  TIKTOK_FOR_YOU_DURATION_SECONDS,
  VIDEO_FPS,
  getVideoRenderProfile,
} from "../lib/video-render-profile";

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
  /** Optional 24h high price from the supplied snapshot. */
  high24h?: number;
  /** Optional 24h low price from the supplied snapshot. */
  low24h?: number;
  /** Optional fully diluted supply figure from the supplied snapshot. */
  fdv?: number;
  /** Optional percentage distance from all-time high. */
  athChangePercentage?: number;
  /** Optional base64 data URI of the token icon. */
  tokenIconDataUrl?: string;
  /** Optional 30-day historical daily prices for the animated SVG sparkline. */
  sparklinePrices?: number[];
  /** Audio filename from public/video-assets/audio/ (e.g., "Midnight_Pursuit.mp3"). */
  audioFile?: string;
  /** Seconds into the audio track to start playback (beat-drop offset). */
  audioStartSeconds?: number;
  /** Voiceover filename from public/video-assets/voiceover/. */
  voiceoverFile?: string;
  /** Narration text used to generate the voiceover. */
  voiceoverScript?: string;
  /** Exact voiceover duration in seconds to dynamically eliminate dead air. */
  voiceoverDurationSeconds?: number;
  /** Exact clause caption cues from speech synthesis. */
  captionCues?: VideoCaptionCue[];
  /** Market-data provider displayed in the rendered source badge. */
  marketDataSource?: string;
  /** ISO timestamp displayed in the rendered source badge. */
  marketDataAsOf?: string;
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
  /** Optional local InVideo-style scene plan for TikTok-native renders. */
  tiktokScenePlan?: TikTokScenePlan;
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
  voiceoverScript: "ETH moved +5.2% over 24 hours. Reported volume was 4.3% of market cap. TokenRadar's supplied risk score is 2.1/10. This is a snapshot, not a forecast. Which field should we break down next?",
  voiceoverDurationSeconds: undefined,
  marketDataSource: "CoinGecko",
  marketDataAsOf: "2026-08-24T18:00:00.000Z",
  hookText: "ETH +5.2%: WHAT'S THE CATCH?",
  contextText: "Ethereum is moving through a market read where volume, liquidity, and risk confirmation matter most.",
  verdict: "SCORECARD READ",
  videoFormatKey: "breakout_watch",
  videoThesis: "Ethereum is being checked as a snapshot candidate with reported volume and risk context.",
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

const defaultBattleProps: TokenComparisonBattleProps = {
  tokenA: {
    name: "Solana",
    symbol: "SOL",
    price: 172.5,
    priceChange24h: 8.4,
    marketCap: 82000000000,
    marketCapRank: 5,
    volume24h: 4200000000,
    riskScore: 4.8,
  },
  tokenB: {
    name: "Ethereum",
    symbol: "ETH",
    price: 3450.0,
    priceChange24h: 2.1,
    marketCap: 415000000000,
    marketCapRank: 2,
    volume24h: 14500000000,
    riskScore: 3.2,
  },
  sharedCategory: "LAYER 1 BATTLE",
  hookText: "SOL VS ETH: WHO WINS THE DATA CHECK?",
  audioFile: "Midnight_Pursuit.mp3",
  audioStartSeconds: 0,
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="TopGainerUpdate"
        component={TopGainerUpdate}
        durationInFrames={STANDARD_VIDEO_DURATION_SECONDS * VIDEO_FPS}
        fps={VIDEO_FPS}
        width={1080}
        height={1920}
        defaultProps={defaultProps}
        calculateMetadata={({ props }) => {
          const profile = getVideoRenderProfile("youtube", {
            voiceoverDurationSeconds: (props as TopGainerProps).voiceoverDurationSeconds,
          });
          return {
            durationInFrames: profile.durationInFrames,
            fps: profile.fps,
            width: profile.width,
            height: profile.height,
          };
        }}
      />
      <Composition
        id="TokenComparisonBattle"
        component={TokenComparisonBattle}
        durationInFrames={14 * VIDEO_FPS}
        fps={VIDEO_FPS}
        width={1080}
        height={1920}
        defaultProps={defaultBattleProps}
        calculateMetadata={({ props }) => {
          const profile = getVideoRenderProfile("youtube", {
            voiceoverDurationSeconds: (props as TopGainerProps).voiceoverDurationSeconds,
          });
          return {
            durationInFrames: profile.durationInFrames,
            fps: profile.fps,
            width: profile.width,
            height: profile.height,
          };
        }}
      />
      <Composition
        id="TopGainerUpdateTikTok"
        component={TikTokNativeStory}
        durationInFrames={TIKTOK_FOR_YOU_DURATION_SECONDS * VIDEO_FPS}
        fps={VIDEO_FPS}
        width={1080}
        height={1920}
        defaultProps={defaultProps}
        calculateMetadata={({ props }) => {
          const profile = getVideoRenderProfile("tiktok", {
            voiceoverDurationSeconds: (props as TopGainerProps).voiceoverDurationSeconds,
          });
          return {
            durationInFrames: profile.durationInFrames,
            fps: profile.fps,
            width: profile.width,
            height: profile.height,
          };
        }}
      />
    </>
  );
};
