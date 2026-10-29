import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { COLORS, FONTS } from "../styles";

export const SparklineChart: React.FC<{
  prices: number[];
  color: string;
  width?: number;
  height?: number;
  showLabels?: boolean;
}> = ({ prices, color, width = 720, height = 90, showLabels = true }) => {
  const frame = useCurrentFrame();

  if (!prices || prices.length < 2) return null;

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;

  const points = prices.map((p, i) => {
    const x = (i / (prices.length - 1)) * (width - 40) + 20;
    const y = height - 16 - ((p - min) / range) * (height - 30);
    return { x, y };
  });

  const pathD = points.reduce((acc, pt, i) => {
    return i === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`;
  }, "");

  const areaD = `${pathD} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`;

  // Animate path reveal from left to right over 22 frames
  const drawProgress = interpolate(frame, [8, 30], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const formatPrice = (v: number) => {
    if (v >= 1000) return `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
    if (v >= 1) return `$${v.toFixed(2)}`;
    return `$${v.toFixed(4)}`;
  };

  const gradId = `grad-${color.replace(/[^a-zA-Z0-9]/g, "")}`;

  return (
    <div style={{ width, margin: "22px auto 0", position: "relative" }}>
      <svg width={width} height={height} style={{ overflow: "visible" }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.32} />
            <stop offset="100%" stopColor={color} stopOpacity={0.0} />
          </linearGradient>
        </defs>
        <path d={areaD} fill={`url(#${gradId})`} />
        <path
          d={pathD}
          fill="none"
          stroke={color}
          strokeWidth={4.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={2000}
          strokeDashoffset={2000 * drawProgress}
          style={{ filter: `drop-shadow(0 0 10px ${color}88)` }}
        />
        {drawProgress === 0 && (
          <circle
            cx={points[points.length - 1].x}
            cy={points[points.length - 1].y}
            r={5.5}
            fill="#FFFFFF"
            stroke={color}
            strokeWidth={3}
            style={{ filter: `drop-shadow(0 0 8px ${color})` }}
          />
        )}
      </svg>
      {showLabels && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 8,
            color: COLORS.textMuted,
            fontFamily: FONTS.primary,
            fontSize: 19,
            fontWeight: 800,
            textTransform: "uppercase",
            letterSpacing: 0.8,
          }}
        >
          <span>30D L: {formatPrice(min)}</span>
          <span style={{ color, letterSpacing: 1.2 }}>● 30D PRICE TREND</span>
          <span>30D H: {formatPrice(max)}</span>
        </div>
      )}
    </div>
  );
};

export const PriceRangeBar: React.FC<{
  current: number;
  low: number;
  high: number;
  color: string;
  width?: number;
}> = ({ current, low, high, color, width = 720 }) => {
  if (!low || !high || high <= low) return null;
  const clampedCurrent = Math.max(low, Math.min(high, current));
  const percent = Math.min(100, Math.max(0, ((clampedCurrent - low) / (high - low)) * 100));

  const formatPrice = (v: number) => {
    if (v >= 1000) return `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
    if (v >= 1) return `$${v.toFixed(2)}`;
    return `$${v.toFixed(4)}`;
  };

  return (
    <div style={{ width, margin: "18px auto 0", fontFamily: FONTS.primary }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 8,
          color: COLORS.textMuted,
          fontSize: 19,
          fontWeight: 800,
          textTransform: "uppercase",
          letterSpacing: 0.8,
        }}
      >
        <span>24H L: {formatPrice(low)}</span>
        <span style={{ color: COLORS.text, fontWeight: 900 }}>24H RANGE</span>
        <span>24H H: {formatPrice(high)}</span>
      </div>
      <div
        style={{
          position: "relative",
          height: 12,
          borderRadius: 999,
          background: "rgba(255,255,255,0.12)",
          overflow: "visible",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            width: `${percent}%`,
            height: "100%",
            borderRadius: 999,
            background: color,
            boxShadow: `0 0 14px ${color}88`,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: `${percent}%`,
            top: "50%",
            transform: "translate(-50%, -50%)",
            width: 22,
            height: 22,
            borderRadius: "50%",
            background: "#FFFFFF",
            border: `3px solid ${color}`,
            boxShadow: `0 0 12px ${color}`,
          }}
        />
      </div>
    </div>
  );
};

