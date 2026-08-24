import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import * as fs from "fs";
import * as path from "path";
import { Fragment, isValidElement, type ReactElement, type ReactNode } from "react";
import { formatPercent } from "./formatters";
import { fetchTokenIconDataUrl } from "./token-icon-data";
import type { SocialContentVariant } from "./social-variety";

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
  variant?: SocialContentVariant;
  cta?: string;
  ctaLabel?: string;
}

const SLIDE_WIDTH = 1080;
const SLIDE_HEIGHT = 1350;
export const DAILY_MOVERS_CAROUSEL_SLIDE_ROLES = [
  "verdict",
  "evidence-board",
  "evidence-context",
  "risk",
  "cta",
] as const;
export const DAILY_MOVERS_CAROUSEL_SLIDE_COUNT = DAILY_MOVERS_CAROUSEL_SLIDE_ROLES.length;

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

function splitTitleLines(title: string): string[] {
  const words = title.split(/\s+/).filter(Boolean);
  if (words.length <= 2) return [title];
  const midpoint = Math.ceil(words.length / 2);
  return [words.slice(0, midpoint).join(" "), words.slice(midpoint).join(" ")];
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
      {/* eslint-disable-next-line @next/next/no-img-element -- Satori renders this static image before Next can optimize it. */}
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

function renderCover(movers: RenderableDailyMover[], generatedAt: Date, variant?: SocialContentVariant) {
  const leader = movers[0];
  const titleLines = splitTitleLines(`${leader.symbol.toUpperCase()} leads the scan`);
  const subtitle = variant?.carouselTitle || "Qualified Daily Movers";

  return slideShell(
    <>
      <div style={{ display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center" }}>
        {sectionLabel("Verdict")}
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
          {titleLines.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
        <div style={{ display: "flex", color: "#94A3B8", fontSize: 32, marginTop: 28 }}>
          {`${subtitle} | ${formatDate(generatedAt)}`}
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
          <div style={{ display: "flex", color: "#94A3B8", fontSize: 24 }}>Strongest qualifying 24h move</div>
          <div style={{ display: "flex", color: "#F8FAFC", fontSize: 44, fontWeight: 900 }}>
            {leader.symbol.toUpperCase()} / {leader.name}
          </div>
          <div style={{ display: "flex", color: "#00FFA3", fontSize: 52, fontWeight: 900 }}>
            {formatPercent(leader.change24h)}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", marginTop: "auto", color: "#64748B", fontSize: 25 }}>
        Filtered result, not a forecast or entry signal.
      </div>
    </>,
  );
}

function renderBoard(movers: RenderableDailyMover[], variant?: SocialContentVariant) {
  return slideShell(
    <>
      <div style={{ display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center" }}>
        {sectionLabel("Evidence")}
        {brandMark()}
      </div>

      <div
        style={{
          display: "flex",
          color: "#F8FAFC",
          fontSize: 50,
          lineHeight: 1.04,
          fontWeight: 900,
          marginTop: 38,
        }}
      >
        {variant?.carouselSubtitle || "Top gainers by 24h move"}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 32 }}>
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
              padding: "19px 24px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
              <div style={{ display: "flex", color: "#64748B", width: 42, fontSize: 30, fontWeight: 900 }}>
                {index + 1}
              </div>
              {tokenIcon(mover, 68)}
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", color: "#F8FAFC", fontSize: 31, fontWeight: 900 }}>
                  {mover.symbol.toUpperCase()}
                </div>
                <div style={{ display: "flex", color: "#94A3B8", fontSize: 21 }}>{mover.name}</div>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
              <div style={{ display: "flex", color: "#00FFA3", fontSize: 34, fontWeight: 900 }}>
                {formatPercent(mover.change24h)}
              </div>
              <div style={{ display: "flex", color: "#94A3B8", fontSize: 20 }}>
                {(mover.volume24h / mover.marketCap * 100).toFixed(1)}% turnover
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", marginTop: "auto", color: "#64748B", fontSize: 22 }}>
        Every name cleared the market-cap, volume, turnover, and data-noise filters.
      </div>
    </>,
  );
}

function renderEvidenceSlide(movers: RenderableDailyMover[]) {
  const leader = movers[0];
  const runnerUp = movers[1];
  const leaderTurnover = leader.volume24h / leader.marketCap * 100;
  const runnerUpTurnover = runnerUp.volume24h / runnerUp.marketCap * 100;

  return slideShell(
    <>
      <div style={{ display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center" }}>
        {sectionLabel("Evidence", "#00C2FF")}
        {brandMark()}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 30, marginTop: 74 }}>
        {tokenIcon(leader, 142)}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", color: "#F8FAFC", fontSize: 64, fontWeight: 900 }}>
            Why {leader.symbol.toUpperCase()} leads
          </div>
          <div style={{ display: "flex", color: "#94A3B8", fontSize: 31 }}>
            Price change wins the rank; turnover adds context.
          </div>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 18,
          marginTop: 70,
        }}
      >
        <div style={{ display: "flex", gap: 18 }}>
          <div style={{ display: "flex", flex: 1 }}>
            {metricBox(`${leader.symbol.toUpperCase()} 24h move`, formatPercent(leader.change24h), "#00FFA3")}
          </div>
          <div style={{ display: "flex", flex: 1 }}>
            {metricBox(`${runnerUp.symbol.toUpperCase()} 24h move`, formatPercent(runnerUp.change24h))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 18 }}>
          <div style={{ display: "flex", flex: 1 }}>
            {metricBox(`${leader.symbol.toUpperCase()} turnover`, `${leaderTurnover.toFixed(1)}%`, "#00C2FF")}
          </div>
          <div style={{ display: "flex", flex: 1 }}>
            {metricBox(`${runnerUp.symbol.toUpperCase()} turnover`, `${runnerUpTurnover.toFixed(1)}%`)}
          </div>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          border: "1px solid rgba(204,255,0,0.22)",
          background: "rgba(204,255,0,0.08)",
          borderRadius: 8,
          padding: "28px 30px",
          marginTop: 34,
        }}
      >
        <div style={{ display: "flex", color: "#CCFF00", fontSize: 25, fontWeight: 800 }}>WHAT THE DATA SUPPORTS</div>
        <div style={{ display: "flex", color: "#F8FAFC", fontSize: 31, lineHeight: 1.3, marginTop: 10 }}>
          {`${leader.symbol.toUpperCase()} ranks first on the measured 24h move after every candidate cleared the same publication floor.`}
        </div>
      </div>

      <div style={{ display: "flex", marginTop: "auto", color: "#64748B", fontSize: 25 }}>
        Turnover is reported 24h volume divided by market cap. It is context, not proof of demand quality.
      </div>
    </>,
  );
}

function renderRiskSlide(movers: RenderableDailyMover[], variant?: SocialContentVariant) {
  const leader = movers[0];
  const riskLines = [
    `Fastest move today: ${leader.symbol.toUpperCase()} at ${formatPercent(leader.change24h)}.`,
    ...(variant?.riskSlideLines || [
      "High 24h gains can reverse quickly when liquidity is thin.",
      "Compare volume, market cap, and the reason for the move.",
      "Use the carousel as a watchlist, not as a buy signal.",
    ]),
  ];

  return slideShell(
    <>
      <div style={{ display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center" }}>
        {sectionLabel("Risk", "#FFB800")}
      </div>
      <div style={{ display: "flex", position: "absolute", top: 0, right: 0 }}>{brandMark()}</div>

      <div style={{ display: "flex", color: "#F8FAFC", fontSize: 70, fontWeight: 900, marginTop: 72 }}>
        {variant?.riskSlideTitle || "Before chasing green"}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 24, marginTop: 70 }}>
        {riskLines.map((line) => (
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

function renderCtaSlide(
  movers: RenderableDailyMover[],
  cta: string,
  generatedAt: Date,
  ctaLabel?: string,
) {
  const leader = movers[0];
  return slideShell(
    <>
      <div style={{ display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center" }}>
        {sectionLabel("Next Step")}
        {brandMark()}
      </div>

      <div style={{ display: "flex", color: "#94A3B8", fontSize: 29, marginTop: 100 }}>
        {ctaLabel || "Choose the next research check"}
      </div>
      <div
        style={{
          display: "flex",
          color: "#F8FAFC",
          fontSize: 72,
          fontWeight: 900,
          lineHeight: 1.12,
          marginTop: 34,
        }}
      >
        {cta}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 28,
          border: "1px solid rgba(204,255,0,0.24)",
          background: "rgba(15,23,42,0.80)",
          borderRadius: 8,
          padding: 32,
          marginTop: 90,
        }}
      >
        {tokenIcon(leader, 92)}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", color: "#94A3B8", fontSize: 23 }}>Today&apos;s evidence anchor</div>
          <div style={{ display: "flex", color: "#F8FAFC", fontSize: 39, fontWeight: 900 }}>
            {leader.symbol.toUpperCase()} · {formatPercent(leader.change24h)}
          </div>
        </div>
      </div>

      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", color: "#F8FAFC", fontSize: 44, fontWeight: 900 }}>Save · Comment · Research</div>
        <div style={{ display: "flex", color: "#64748B", fontSize: 25 }}>
          {`CoinGecko snapshot · ${formatDate(generatedAt)} · TokenRadar.co`}
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
  const variant = options.variant;
  const cta = options.cta?.trim() || "Save this scan and comment which evidence check should come next.";
  const slides = [
    renderCover(topFive, generatedAt, variant),
    renderBoard(topFive, variant),
    renderEvidenceSlide(topFive),
    renderRiskSlide(topFive, variant),
    renderCtaSlide(topFive, cta, generatedAt, options.ctaLabel),
  ];

  return Promise.all(slides.map((slide) => renderPng(slide)));
}
