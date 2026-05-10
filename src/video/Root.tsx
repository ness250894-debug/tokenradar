
import { Composition } from "remotion";
import { TopGainerUpdate } from "./TopGainerUpdate";
import type { Verdict } from "./styles";

// Define the schema for the props we'll pass dynamically
export type TopGainerProps = {
  tokenName: string;
  symbol: string;
  price: number;
  priceChange24h: number;
  riskScore: number;
  marketCap: number;
  /** Audio filename from public/audio/ (e.g., "Midnight_Pursuit.mp3"). */
  audioFile?: string;
  /** Seconds into the audio track to start playback (beat-drop offset). */
  audioStartSeconds?: number;
  /** Generated hook text for Act 1 */
  hookText?: string;
  /** Why it's moving / Context for Act 4 */
  contextText?: string;
  /** Final calculated verdict for Act 5 */
  verdict?: Verdict;
};

// Default props for the Studio preview
const defaultProps: TopGainerProps = {
  tokenName: "Ethereum",
  symbol: "ETH",
  price: 3500.5,
  priceChange24h: 5.2,
  riskScore: 2.1,
  marketCap: 420000000000,
  audioFile: "Midnight_Pursuit.mp3",
  audioStartSeconds: 0,
  hookText: "IS ETHEREUM ABOUT TO SHOCK THE MARKET?",
  contextText: "Major institutions are quietly accumulating ETH while retail focuses on meme coins.",
  verdict: "STRONG BUY",
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="TopGainerUpdate"
        component={TopGainerUpdate}
        durationInFrames={1800} // 60 seconds at 30fps
        fps={30}
        width={1080}
        height={1920}
        defaultProps={defaultProps}
      />
    </>
  );
};
