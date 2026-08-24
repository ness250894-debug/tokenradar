import React from "react";
import { buildVideoEvidenceSummary } from "../../lib/video-evidence";
import { COLORS, FONTS, SAFE_ZONES } from "../styles";

export const VideoSourceBadge: React.FC<{
  tokenName: string;
  symbol: string;
  marketDataSource?: string;
  marketDataAsOf?: string;
  reserveActionRail?: boolean;
}> = ({
  tokenName,
  symbol,
  marketDataSource,
  marketDataAsOf,
  reserveActionRail = false,
}) => {
  const sourceLabel = buildVideoEvidenceSummary({
    tokenName,
    symbol,
    marketDataSource,
    marketDataAsOf,
  }).sourceLabel;
  if (!sourceLabel) return null;

  return (
    <div
      aria-label="Market data source"
      style={{
        position: "absolute",
        left: SAFE_ZONES.horizontal,
        right: reserveActionRail ? SAFE_ZONES.actionRail : SAFE_ZONES.horizontal,
        bottom: SAFE_ZONES.sourceBottom,
        zIndex: 41,
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          maxWidth: 820,
          borderRadius: 999,
          padding: "10px 18px",
          background: "rgba(8,8,12,0.88)",
          border: "1px solid rgba(255,255,255,0.18)",
          color: COLORS.textMuted,
          fontFamily: FONTS.primary,
          fontSize: 21,
          fontWeight: 800,
          lineHeight: 1.1,
          letterSpacing: 0.2,
          textAlign: "center",
        }}
      >
        {sourceLabel}
      </div>
    </div>
  );
};
