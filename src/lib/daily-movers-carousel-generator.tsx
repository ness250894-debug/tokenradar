import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import * as fs from "fs";
import * as path from "path";
import { Fragment, isValidElement, type ReactElement, type ReactNode } from "react";
import { formatCompact, formatPercent, formatPrice } from "./formatters";
import { fetchTokenIconDataUrl } from "./token-icon-data";

export interface DailyMoverCarouselToken {
  id: string;
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  marketCap: number;
  volume24h: number;
  rank: number;
  imageUrl?: string;
}

export interface DailyMoversCarouselOptions {
  generatedAt?: Date;
}

const SLIDE_WIDTH = 1080;
const SLIDE_HEIGHT = 1350;

let geistFontBuffer: ArrayBuffer | null = null;

type RenderableDailyMover = DailyMoverCarouselToken & {
  iconDataUrl?: string;
};

async function getFont() {
  if (!geistFontBuffer) {
    const fontPath = path.resolve(
      process.cwd(),
      "node_modules",
      "next",
      "dist",
      "compiled",
      "@vercel",
      "og",
      "Geist-Regular.ttf",
    );
    const buffer = fs.readFileSync(fontPath);
    geistFontBuffer = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    );
  }
  return geistFontBuffer;
}

async function prepareMovers(movers: DailyMoverCarouselToken[]): Promise<RenderableDailyMover[]> {
  return Promise.all(
    movers.map(async (mover) => {
      const iconDataUrl = await fetchTokenIconDataUrl(mover);
      if (iconDataUrl) {
        return { ...mover, iconDataUrl };
      }

      return mover;
    }),
  );
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function brandMark() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ width: 34, height: 34, borderRadius: 8, background: "#CCFF00" }} />
      <div style={{ display: "flex", color: "#F8FAFC", fontSize: 30, fontWeight: 800 }}>
        <span>TOKEN</span>
        <span style={{ color: "#CCFF00" }}>RADAR</span>
      </div>
    </div>
  );
}

function unwrapFragment(children: ReactNode): ReactNode {
  return isValidElement<{ children?: ReactNode }>(children) && children.type === Fragment
    ? children.props.children
    : children;
}

function marketBackdrop() {
  const verticalLines = [96, 216, 336, 456, 576, 696, 816, 936];
  const horizontalLines = [144, 284, 424, 564, 704, 844, 984, 1124, 1264];
  const candles = [
    { left: 746, top: 836, height: 156, bodyTop: 48, bodyHeight: 58, color: "#00FFA3" },
    { left: 806, top: 792, height: 210, bodyTop: 34, bodyHeight: 86, color: "#CCFF00" },
    { left: 866, top: 876, height: 144, bodyTop: 52, bodyHeight: 46, color: "#FFB800" },
    { left: 926, top: 732, height: 270, bodyTop: 58, bodyHeight: 112, color: "#00C2FF" },
    { left: 986, top: 820, height: 194, bodyTop: 42, bodyHeight: 76, color: "#00FFA3" },
  ];

  return (
    <div style={{ display: "flex", position: "absolute", inset: 0 }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(155deg, rgba(204,255,0,0.12) 0%, rgba(0,194,255,0.07) 46%, rgba(255,184,0,0.06) 100%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 110,
          right: -70,
          width: 520,
          height: 520,
          borderRadius: 260,
          border: "1px solid rgba(204,255,0,0.14)",
          background: "rgba(204,255,0,0.025)",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: -180,
          left: -90,
          width: 680,
          height: 680,
          borderRadius: 340,
          border: "1px solid rgba(0,194,255,0.14)",
          background: "rgba(0,194,255,0.025)",
        }}
      />

      {verticalLines.map((left) => (
        <div
          key={`v-${left}`}
          style={{
            position: "absolute",
            left,
            top: 0,
            bottom: 0,
            width: 1,
            background: "rgba(248,250,252,0.045)",
          }}
        />
      ))}
      {horizontalLines.map((top) => (
        <div
          key={`h-${top}`}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top,
            height: 1,
            background: "rgba(248,250,252,0.045)",
          }}
        />
      ))}

      <div
        style={{
          position: "absolute",
          left: 72,
          right: 72,
          bottom: 104,
          height: 1,
          background: "rgba(204,255,0,0.16)",
        }}
      />
      {candles.map((candle) => (
        <div
          key={`${candle.left}-${candle.top}`}
          style={{
            position: "absolute",
            left: candle.left,
            top: candle.top,
            width: 34,
            height: candle.height,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: 0.42,
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              width: 3,
              background: candle.color,
            }}
          />
          <div
            style={{
              position: "absolute",
              top: candle.bodyTop,
              width: 34,
              height: candle.bodyHeight,
              borderRadius: 5,
              background: candle.color,
            }}
          />
        </div>
      ))}
    </div>
  );
}

function slideShell(children: ReactNode) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "#06070A",
        color: "#F8FAFC",
        display: "flex",
        flexDirection: "column",
        fontFamily: "Geist",
        position: "relative",
        overflow: "hidden",
        padding: "70px 72px",
      }}
    >
      {marketBackdrop()}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 10,
          background: "#CCFF00",
        }}
      />
      <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
        {unwrapFragment(children)}
      </div>
    </div>
  );
}

function sectionLabel(text: string, color = "#CCFF00") {
  return (
    <div
      style={{
        display: "flex",
        color,
        fontSize: 28,
        fontWeight: 800,
        textTransform: "uppercase",
      }}
    >
      {text}
    </div>
  );
}

function metricBox(label: string, value: string, accent = "#F8FAFC") {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        border: "1px solid rgba(248,250,252,0.12)",
        background: "rgba(15,23,42,0.78)",
        borderRadius: 8,
        padding: "22px 24px",
        minHeight: 112,
      }}
    >
      <div style={{ display: "flex", color: "#94A3B8", fontSize: 22, marginBottom: 10 }}>{label}</div>
      <div style={{ display: "flex", color: accent, fontSize: 34, fontWeight: 800 }}>{value}</div>
    </div>
  );
}

function tokenBadge(symbol: string, size = 118) {
  const safeSymbol = symbol.toUpperCase().slice(0, 5);
  const fontSize = safeSymbol.length > 4
    ? Math.floor(size * 0.24)
    : safeSymbol.length > 3
      ? Math.floor(size * 0.30)
      : Math.floor(size * 0.38);

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 24,
        background: "linear-gradient(135deg, #CCFF00 0%, #00C2FF 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#06070A",
        fontSize,
        fontWeight: 900,
        overflow: "hidden",
        textAlign: "center",
      }}
    >
      {safeSymbol}
    </div>
  );
}

function tokenIcon(mover: RenderableDailyMover, size = 118) {
  if (!mover.iconDataUrl) {
    return tokenBadge(mover.symbol, size);
  }

  const innerSize = Math.round(size * 0.74);

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.22),
        border: "1px solid rgba(248,250,252,0.14)",
        background: "rgba(248,250,252,0.08)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <img
        src={mover.iconDataUrl}
        alt={mover.name}
        width={innerSize}
        height={innerSize}
        style={{
          objectFit: "contain",
          borderRadius: Math.round(innerSize * 0.5),
        }}
      />
    </div>
  );
}

function renderCover(movers: RenderableDailyMover[], generatedAt: Date) {
  const leader = movers[0];

  return slideShell(
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        {sectionLabel("Daily Movers")}
        {brandMark()}
      </div>

      <div style={{ display: "flex", flexDirection: "column", marginTop: 140 }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            color: "#F8FAFC",
            fontSize: 96,
            lineHeight: 1.02,
            fontWeight: 900,
          }}
        >
          <div>Top 5 Crypto</div>
          <div>Gainers</div>
        </div>
        <div style={{ display: "flex", color: "#94A3B8", fontSize: 32, marginTop: 28 }}>
          {`Market snapshot for ${formatDate(generatedAt)}`}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 28,
          marginTop: 130,
          border: "1px solid rgba(204,255,0,0.24)",
          background: "rgba(15,23,42,0.80)",
          borderRadius: 8,
          padding: 32,
        }}
      >
        {tokenIcon(leader, 110)}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", color: "#94A3B8", fontSize: 24 }}>Leading move</div>
          <div style={{ display: "flex", color: "#F8FAFC", fontSize: 44, fontWeight: 900 }}>
            {leader.symbol.toUpperCase()} / {leader.name}
          </div>
          <div style={{ display: "flex", color: "#00FFA3", fontSize: 52, fontWeight: 900 }}>
            {formatPercent(leader.change24h)}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", marginTop: "auto", color: "#64748B", fontSize: 25 }}>
        Data-driven market intelligence. Not financial advice.
      </div>
    </>,
  );
}

function renderBoard(movers: RenderableDailyMover[]) {
  return slideShell(
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        {sectionLabel("Leaderboard")}
        {brandMark()}
      </div>

      <div style={{ display: "flex", color: "#F8FAFC", fontSize: 58, fontWeight: 900, marginTop: 52 }}>
        Top gainers by 24h move
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 18, marginTop: 46 }}>
        {movers.map((mover, index) => (
          <div
            key={mover.id}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              border: "1px solid rgba(248,250,252,0.12)",
              background: index === 0 ? "rgba(204,255,0,0.12)" : "rgba(15,23,42,0.78)",
              borderRadius: 8,
              padding: "24px 28px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
              <div style={{ display: "flex", color: "#64748B", width: 42, fontSize: 30, fontWeight: 900 }}>
                {index + 1}
              </div>
              {tokenIcon(mover, 76)}
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", color: "#F8FAFC", fontSize: 34, fontWeight: 900 }}>
                  {mover.symbol.toUpperCase()}
                </div>
                <div style={{ display: "flex", color: "#94A3B8", fontSize: 23 }}>{mover.name}</div>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
              <div style={{ display: "flex", color: "#00FFA3", fontSize: 38, fontWeight: 900 }}>
                {formatPercent(mover.change24h)}
              </div>
              <div style={{ display: "flex", color: "#94A3B8", fontSize: 22 }}>{formatPrice(mover.price)}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", marginTop: "auto", color: "#64748B", fontSize: 25 }}>
        Filtered to exclude stablecoins, invalid prices, and extreme data spikes.
      </div>
    </>,
  );
}

function renderTokenSlide(mover: RenderableDailyMover, index: number) {
  return slideShell(
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        {sectionLabel(`Mover ${index + 1} / 5`, "#00C2FF")}
        {brandMark()}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 30, marginTop: 74 }}>
        {tokenIcon(mover, 142)}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", color: "#F8FAFC", fontSize: 72, fontWeight: 900 }}>
            {mover.symbol.toUpperCase()}
          </div>
          <div style={{ display: "flex", color: "#94A3B8", fontSize: 34 }}>{mover.name}</div>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          color: "#00FFA3",
          fontSize: 114,
          fontWeight: 900,
          marginTop: 72,
          lineHeight: 1,
        }}
      >
        {formatPercent(mover.change24h)}
      </div>
      <div style={{ display: "flex", color: "#94A3B8", fontSize: 30, marginTop: 14 }}>24-hour price change</div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 18,
          marginTop: 70,
        }}
      >
        <div style={{ display: "flex", gap: 18 }}>
          <div style={{ display: "flex", flex: 1 }}>{metricBox("Price", formatPrice(mover.price))}</div>
          <div style={{ display: "flex", flex: 1 }}>{metricBox("Market Cap", formatCompact(mover.marketCap))}</div>
        </div>
        <div style={{ display: "flex", gap: 18 }}>
          <div style={{ display: "flex", flex: 1 }}>{metricBox("24h Volume", formatCompact(mover.volume24h), "#00C2FF")}</div>
          <div style={{ display: "flex", flex: 1 }}>{metricBox("Market Rank", mover.rank > 0 ? `#${mover.rank}` : "N/A", "#FFB800")}</div>
        </div>
      </div>

      <div style={{ display: "flex", marginTop: "auto", color: "#64748B", fontSize: 25 }}>
        Momentum snapshot. Verify liquidity and volatility before drawing conclusions.
      </div>
    </>,
  );
}

function renderRiskSlide(movers: RenderableDailyMover[]) {
  const leader = movers[0];

  return slideShell(
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        {sectionLabel("Risk Lens", "#FFB800")}
        {brandMark()}
      </div>

      <div style={{ display: "flex", color: "#F8FAFC", fontSize: 70, fontWeight: 900, marginTop: 72 }}>
        Before chasing green
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 24, marginTop: 70 }}>
        {[
          `Fastest move today: ${leader.symbol.toUpperCase()} at ${formatPercent(leader.change24h)}.`,
          "High 24h gains can reverse quickly when liquidity is thin.",
          "Compare volume, market cap, and the reason for the move.",
          "Use the carousel as a watchlist, not as a buy signal.",
        ].map((line) => (
          <div
            key={line}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 22,
              border: "1px solid rgba(248,250,252,0.12)",
              background: "rgba(15,23,42,0.78)",
              borderRadius: 8,
              padding: "26px 28px",
            }}
          >
            <div style={{ width: 18, height: 18, borderRadius: 4, background: "#CCFF00" }} />
            <div style={{ display: "flex", color: "#F8FAFC", fontSize: 31, lineHeight: 1.25 }}>{line}</div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", color: "#F8FAFC", fontSize: 44, fontWeight: 900 }}>TokenRadar.co</div>
        <div style={{ display: "flex", color: "#64748B", fontSize: 25 }}>
          Daily crypto data, rankings, and risk context.
        </div>
      </div>
    </>,
  );
}

async function renderPng(element: ReactElement): Promise<Buffer> {
  const fontData = await getFont();
  const svg = await satori(element, {
    width: SLIDE_WIDTH,
    height: SLIDE_HEIGHT,
    fonts: [
      {
        name: "Geist",
        data: fontData,
        weight: 600,
        style: "normal",
      },
    ],
  });

  const resvg = new Resvg(svg, {
    background: "#06070A",
    fitTo: {
      mode: "width",
      value: SLIDE_WIDTH,
    },
  });

  return Buffer.from(resvg.render().asPng());
}

export async function generateDailyMoversCarousel(
  movers: DailyMoverCarouselToken[],
  options: DailyMoversCarouselOptions = {},
): Promise<Buffer[]> {
  if (movers.length < 5) {
    throw new Error(`Daily Movers carousel requires 5 movers. Received ${movers.length}.`);
  }

  const topFive = await prepareMovers(movers.slice(0, 5));
  const generatedAt = options.generatedAt ?? new Date();
  const slides = [
    renderCover(topFive, generatedAt),
    renderBoard(topFive),
    ...topFive.map((mover, index) => renderTokenSlide(mover, index)),
    renderRiskSlide(topFive),
  ];

  return Promise.all(slides.map((slide) => renderPng(slide)));
}
