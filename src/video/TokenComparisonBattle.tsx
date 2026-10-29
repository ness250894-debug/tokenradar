import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { COLORS, FONTS, SAFE_ZONES } from "./styles";
import { ProfessionalCard, RevealText } from "./components/MotionPrimitives";
import { TimedNarrationCaptions } from "./components/TimedNarrationCaptions";
import { VideoSourceBadge } from "./components/VideoSourceBadge";
import type { VideoCaptionCue } from "../lib/video-captioning";

export interface BattleToken {
  name: string;
  symbol: string;
  price: number;
  priceChange24h: number;
  marketCap: number;
  marketCapRank?: number;
  volume24h?: number;
  riskScore: number;
  growthPotentialIndex?: number;
  tokenIconDataUrl?: string;
}

export interface TokenComparisonBattleProps {
  tokenA?: BattleToken;
  tokenB?: BattleToken;
  sharedCategory?: string;
  hookText?: string;
  audioFile?: string;
  audioStartSeconds?: number;
  voiceoverFile?: string;
  voiceoverScript?: string;
  captionCues?: VideoCaptionCue[];
  marketDataSource?: string;
  marketDataAsOf?: string;
}

const formatCompact = (value: number | undefined) => {
  if (!value) return "N/A";
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
};

const defaultTokenA: BattleToken = {
  name: "Solana",
  symbol: "SOL",
  price: 172.5,
  priceChange24h: 8.4,
  marketCap: 82000000000,
  marketCapRank: 5,
  volume24h: 4200000000,
  riskScore: 4.8,
};

const defaultTokenB: BattleToken = {
  name: "Ethereum",
  symbol: "ETH",
  price: 3450.0,
  priceChange24h: 2.1,
  marketCap: 415000000000,
  marketCapRank: 2,
  volume24h: 14500000000,
  riskScore: 3.2,
};

export const TokenComparisonBattle: React.FC<TokenComparisonBattleProps> = (props) => {
  const {
    tokenA = defaultTokenA,
    tokenB = defaultTokenB,
    sharedCategory = "MARKET HEAD-TO-HEAD",
    hookText,
    audioFile,
    audioStartSeconds = 0,
    voiceoverFile,
    voiceoverScript,
    captionCues,
    marketDataSource = "TokenRadar Market Data",
    marketDataAsOf,
  } = props;

  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Scene timing
  const hookFrames = 90; // 0s..3s
  const compareFrames = 210; // 3s..10s
  const verdictStartFrame = hookFrames + compareFrames; // 10s..end

  // Metrics comparison
  const moveWinsA = tokenA.priceChange24h >= tokenB.priceChange24h;
  const turnoverA = tokenA.marketCap > 0 && tokenA.volume24h ? (tokenA.volume24h / tokenA.marketCap) * 100 : 0;
  const turnoverB = tokenB.marketCap > 0 && tokenB.volume24h ? (tokenB.volume24h / tokenB.marketCap) * 100 : 0;
  const turnoverWinsA = turnoverA >= turnoverB;
  const riskWinsA = tokenA.riskScore <= tokenB.riskScore; // lower risk score is better
  const rankWinsA = (tokenA.marketCapRank || 9999) <= (tokenB.marketCapRank || 9999);

  let scoreA = 0;
  if (moveWinsA) scoreA++;
  if (turnoverWinsA) scoreA++;
  if (riskWinsA) scoreA++;
  if (rankWinsA) scoreA++;

  const scoreB = 4 - scoreA;
  const overallWinner = scoreA > scoreB ? tokenA : scoreB > scoreA ? tokenB : null;

  const vsGlow = interpolate(frame, [15, 30, 60, 80], [0.3, 0.9, 0.5, 0.3], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.background, fontFamily: FONTS.primary }}>
      {/* Background radial glow */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(circle at 50% 35%, rgba(250, 204, 21, 0.08) 0%, transparent 65%)`,
          pointerEvents: "none",
        }}
      />

      {/* Act 1: Battle Matchup Hook (frames 0..90) */}
      <Sequence from={0} durationInFrames={hookFrames}>
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: `0 ${SAFE_ZONES.horizontal}px` }}>
          <RevealText
            delay={2}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 24px",
              borderRadius: 999,
              background: "rgba(16, 16, 24, 0.88)",
              border: `1.5px solid #FACC15`,
              boxShadow: `0 0 24px rgba(250, 204, 21, 0.4)`,
              color: "#FACC15",
              fontSize: 24,
              fontWeight: 900,
              letterSpacing: 2.2,
              textTransform: "uppercase",
              marginBottom: 44,
            }}
          >
            <span style={{ fontSize: 18 }}>●</span>
            {sharedCategory}
          </RevealText>

          {/* VS Matchup Row */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 36, width: "100%", marginBottom: 44 }}>
            {/* Token A */}
            <ProfessionalCard
              accentColor={tokenA.priceChange24h >= 0 ? COLORS.positive : COLORS.negative}
              width={340}
              padding={28}
              borderRadius={28}
              style={{ textAlign: "center" }}
            >
              {tokenA.tokenIconDataUrl ? (
                <Img
                  src={tokenA.tokenIconDataUrl}
                  alt={tokenA.name}
                  style={{ width: 84, height: 84, borderRadius: "50%", margin: "0 auto 16px", border: "2px solid rgba(255,255,255,0.2)" }}
                />
              ) : (
                <div style={{ width: 84, height: 84, borderRadius: "50%", margin: "0 auto 16px", background: "rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, fontWeight: 900, color: COLORS.text }}>
                  {tokenA.symbol.slice(0, 3)}
                </div>
              )}
              <div style={{ fontSize: 38, fontWeight: 900, color: COLORS.text }}>{tokenA.symbol}</div>
              <div style={{ fontSize: 28, fontWeight: 800, marginTop: 8, color: tokenA.priceChange24h >= 0 ? COLORS.positive : COLORS.negative }}>
                {tokenA.priceChange24h >= 0 ? "+" : ""}{tokenA.priceChange24h.toFixed(1)}%
              </div>
            </ProfessionalCard>

            {/* Glowing VS Badge */}
            <div
              style={{
                width: 90,
                height: 90,
                borderRadius: "50%",
                background: "#0F1015",
                border: "2.5px solid #FACC15",
                boxShadow: `0 0 35px rgba(250, 204, 21, ${vsGlow})`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 34,
                fontWeight: 900,
                color: "#FACC15",
                letterSpacing: 2,
              }}
            >
              VS
            </div>

            {/* Token B */}
            <ProfessionalCard
              accentColor={tokenB.priceChange24h >= 0 ? COLORS.positive : COLORS.negative}
              width={340}
              padding={28}
              borderRadius={28}
              style={{ textAlign: "center" }}
            >
              {tokenB.tokenIconDataUrl ? (
                <Img
                  src={tokenB.tokenIconDataUrl}
                  alt={tokenB.name}
                  style={{ width: 84, height: 84, borderRadius: "50%", margin: "0 auto 16px", border: "2px solid rgba(255,255,255,0.2)" }}
                />
              ) : (
                <div style={{ width: 84, height: 84, borderRadius: "50%", margin: "0 auto 16px", background: "rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, fontWeight: 900, color: COLORS.text }}>
                  {tokenB.symbol.slice(0, 3)}
                </div>
              )}
              <div style={{ fontSize: 38, fontWeight: 900, color: COLORS.text }}>{tokenB.symbol}</div>
              <div style={{ fontSize: 28, fontWeight: 800, marginTop: 8, color: tokenB.priceChange24h >= 0 ? COLORS.positive : COLORS.negative }}>
                {tokenB.priceChange24h >= 0 ? "+" : ""}{tokenB.priceChange24h.toFixed(1)}%
              </div>
            </ProfessionalCard>
          </div>

          <RevealText delay={12} style={{ fontSize: 44, fontWeight: 900, color: COLORS.text, textAlign: "center", textTransform: "uppercase" }}>
            {hookText || `${tokenA.symbol} vs ${tokenB.symbol}: Who Wins The Data Check?`}
          </RevealText>
        </AbsoluteFill>
      </Sequence>

      {/* Act 2: Head-to-Head Comparative Stats (frames 90..300) */}
      <Sequence from={hookFrames} durationInFrames={compareFrames}>
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: `0 ${SAFE_ZONES.horizontal}px` }}>
          <ProfessionalCard accentColor="#FACC15" width={860} padding={44} borderRadius={32}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.12)", paddingBottom: 18, marginBottom: 24 }}>
              <div style={{ fontSize: 36, fontWeight: 900, color: COLORS.text }}>{tokenA.symbol}</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: "#FACC15", letterSpacing: 2 }}>HEAD-TO-HEAD</div>
              <div style={{ fontSize: 36, fontWeight: 900, color: COLORS.text }}>{tokenB.symbol}</div>
            </div>

            {/* Row 1: 24H Price Move */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 140px 1fr", alignItems: "center", padding: "16px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ fontSize: 32, fontWeight: 900, color: moveWinsA ? COLORS.positive : COLORS.textMuted, textAlign: "left" }}>
                {tokenA.priceChange24h >= 0 ? "+" : ""}{tokenA.priceChange24h.toFixed(2)}% {moveWinsA ? "✓" : ""}
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: COLORS.textMuted, textAlign: "center", textTransform: "uppercase" }}>24H MOVE</div>
              <div style={{ fontSize: 32, fontWeight: 900, color: !moveWinsA ? COLORS.positive : COLORS.textMuted, textAlign: "right" }}>
                {!moveWinsA ? "✓ " : ""}{tokenB.priceChange24h >= 0 ? "+" : ""}{tokenB.priceChange24h.toFixed(2)}%
              </div>
            </div>

            {/* Row 2: 24H Volume / Cap Turnover */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 140px 1fr", alignItems: "center", padding: "16px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ fontSize: 30, fontWeight: 900, color: turnoverWinsA ? COLORS.accent : COLORS.textMuted, textAlign: "left" }}>
                {turnoverA.toFixed(1)}% Vol/Cap {turnoverWinsA ? "✓" : ""}
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: COLORS.textMuted, textAlign: "center", textTransform: "uppercase" }}>TURNOVER</div>
              <div style={{ fontSize: 30, fontWeight: 900, color: !turnoverWinsA ? COLORS.accent : COLORS.textMuted, textAlign: "right" }}>
                {!turnoverWinsA ? "✓ " : ""}{turnoverB.toFixed(1)}% Vol/Cap
              </div>
            </div>

            {/* Row 3: Risk Score (lower is better) */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 140px 1fr", alignItems: "center", padding: "16px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ fontSize: 32, fontWeight: 900, color: riskWinsA ? COLORS.positive : COLORS.warning, textAlign: "left" }}>
                {tokenA.riskScore.toFixed(1)}/10 {riskWinsA ? "✓ (Safer)" : ""}
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: COLORS.textMuted, textAlign: "center", textTransform: "uppercase" }}>RISK SCORE</div>
              <div style={{ fontSize: 32, fontWeight: 900, color: !riskWinsA ? COLORS.positive : COLORS.warning, textAlign: "right" }}>
                {!riskWinsA ? "(Safer) ✓ " : ""}{tokenB.riskScore.toFixed(1)}/10
              </div>
            </div>

            {/* Row 4: Market Cap Rank */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 140px 1fr", alignItems: "center", padding: "16px 0" }}>
              <div style={{ fontSize: 30, fontWeight: 900, color: rankWinsA ? COLORS.text : COLORS.textMuted, textAlign: "left" }}>
                Rank #{tokenA.marketCapRank || "N/A"} ({formatCompact(tokenA.marketCap)})
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: COLORS.textMuted, textAlign: "center", textTransform: "uppercase" }}>MARKET CAP</div>
              <div style={{ fontSize: 30, fontWeight: 900, color: !rankWinsA ? COLORS.text : COLORS.textMuted, textAlign: "right" }}>
                Rank #{tokenB.marketCapRank || "N/A"} ({formatCompact(tokenB.marketCap)})
              </div>
            </div>
          </ProfessionalCard>
        </AbsoluteFill>
      </Sequence>

      {/* Act 3: Winner Verdict Reveal (frames 300..end) */}
      <Sequence from={verdictStartFrame}>
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: `0 ${SAFE_ZONES.horizontal}px` }}>
          <ProfessionalCard accentColor={overallWinner ? COLORS.positive : "#FACC15"} width={860} padding={54} borderRadius={36} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: "#FACC15", textTransform: "uppercase", letterSpacing: 2, marginBottom: 18 }}>
              DATA SCORECARD VERDICT
            </div>
            <div style={{ fontSize: 68, fontWeight: 900, color: COLORS.text, lineHeight: 1.1, marginBottom: 24 }}>
              {overallWinner ? `${overallWinner.symbol} WINS THE SETUP` : `SPLIT ADVANTAGE`}
            </div>
            <div style={{ fontSize: 34, fontWeight: 800, color: COLORS.textMuted, lineHeight: 1.35, maxWidth: 720, margin: "0 auto" }}>
              {overallWinner
                ? `${overallWinner.symbol} edged out on ${overallWinner === tokenA && riskWinsA ? "lower risk score" : "momentum and liquidity"} across 4 verified points.`
                : `${tokenA.symbol} held advantage in ${riskWinsA ? "risk safety" : "momentum"}, while ${tokenB.symbol} dominated in ${turnoverWinsA ? "rank" : "turnover"}.`}
            </div>
          </ProfessionalCard>
        </AbsoluteFill>
      </Sequence>

      {/* SFX Audio Cues */}
      <Sequence from={hookFrames} durationInFrames={15}>
        <Audio src={staticFile("sfx/tick.wav")} volume={0.3} />
      </Sequence>
      <Sequence from={verdictStartFrame} durationInFrames={25}>
        <Audio src={staticFile("sfx/reveal.wav")} volume={0.4} />
      </Sequence>

      {/* Karaoke Captions */}
      <TimedNarrationCaptions text={voiceoverScript} cues={captionCues} />

      {/* Pinned Video Source Badge */}
      <VideoSourceBadge
        tokenName={`${tokenA.symbol} & ${tokenB.symbol}`}
        symbol="VS"
        marketDataSource={marketDataSource}
        marketDataAsOf={marketDataAsOf}
      />

      {/* Background Music */}
      {audioFile && (
        <Audio
          src={staticFile(`audio/${audioFile}`)}
          startFrom={audioStartSeconds * fps}
          loop
          volume={voiceoverFile ? 0.22 : 0.8}
        />
      )}

      {/* Voiceover */}
      {voiceoverFile && (
        <Audio src={staticFile(`voiceover/${voiceoverFile}`)} volume={1.0} />
      )}
    </AbsoluteFill>
  );
};

