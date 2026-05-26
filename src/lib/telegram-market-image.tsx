import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import * as fs from "fs";
import * as path from "path";
import type { ReactElement } from "react";

import { formatPercent, getRiskColor, getRiskTier } from "./formatters";
import type { TelegramMarketPulseImageData } from "./telegram-market-formats";

const WIDTH = 1200;
const HEIGHT = 630;

let fontBuffer: ArrayBuffer | null = null;

function getFont(): ArrayBuffer {
  if (!fontBuffer) {
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
    fontBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  }

  return fontBuffer;
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function brandMark() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ width: 30, height: 30, borderRadius: 7, background: "#CCFF00" }} />
      <div style={{ display: "flex", color: "#F8FAFC", fontSize: 28, fontWeight: 900 }}>
        <span>TOKEN</span>
        <span style={{ color: "#CCFF00" }}>RADAR</span>
      </div>
    </div>
  );
}

function backdrop() {
  const verticalLines = [90, 210, 330, 450, 570, 690, 810, 930, 1050];
  const horizontalLines = [110, 220, 330, 440, 550];
  const bars = [
    { left: 740, top: 402, height: 86, color: "#00FFA3" },
    { left: 806, top: 354, height: 134, color: "#CCFF00" },
    { left: 872, top: 390, height: 98, color: "#FFB800" },
    { left: 938, top: 326, height: 162, color: "#00C2FF" },
    { left: 1004, top: 372, height: 116, color: "#00FFA3" },
  ];

  return (
    <div style={{ display: "flex", position: "absolute", inset: 0 }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(140deg, rgba(204,255,0,0.10) 0%, rgba(0,194,255,0.08) 52%, rgba(255,184,0,0.06) 100%)",
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
      <div style={{ position: "absolute", left: 720, right: 80, top: 488, height: 2, background: "rgba(204,255,0,0.22)" }} />
      {bars.map((bar) => (
        <div
          key={`${bar.left}-${bar.top}`}
          style={{
            position: "absolute",
            left: bar.left,
            top: bar.top,
            width: 40,
            height: bar.height,
            borderRadius: 7,
            background: bar.color,
            opacity: 0.28,
          }}
        />
      ))}
    </div>
  );
}

function metricPanel(label: string, value: string, accent: string) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        border: "1px solid rgba(248,250,252,0.14)",
        background: "rgba(15,23,42,0.78)",
        borderRadius: 8,
        padding: "16px 18px",
        width: "100%",
      }}
    >
      <div style={{ display: "flex", color: "#94A3B8", fontSize: 20, marginBottom: 10 }}>{label}</div>
      <div style={{ display: "flex", color: accent, fontSize: 27, fontWeight: 900, lineHeight: 1.12 }}>
        {truncate(value, 56)}
      </div>
    </div>
  );
}

function sectorList(sectors: string[]) {
  const colors = ["#CCFF00", "#00C2FF", "#FFB800"];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {sectors.slice(0, 3).map((sector, index) => (
        <div
          key={`${sector}-${index}`}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            border: "1px solid rgba(248,250,252,0.12)",
            background: "rgba(2,6,23,0.72)",
            borderRadius: 8,
            padding: "10px 14px",
          }}
        >
          <div style={{ width: 14, height: 14, borderRadius: 4, background: colors[index] }} />
          <div style={{ display: "flex", color: "#F8FAFC", fontSize: 22, fontWeight: 800 }}>
            {truncate(sector, 32)}
          </div>
        </div>
      ))}
    </div>
  );
}

function tokenPanel(token: TelegramMarketPulseImageData["featuredToken"]) {
  const riskColor = getRiskColor(token.riskScore);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        border: "1px solid rgba(204,255,0,0.24)",
        background: "rgba(15,23,42,0.82)",
        borderRadius: 8,
        padding: "20px 22px",
        width: 360,
      }}
    >
      <div style={{ display: "flex", color: "#94A3B8", fontSize: 21, marginBottom: 8 }}>Watch item</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
        <div style={{ display: "flex", color: "#F8FAFC", fontSize: 52, fontWeight: 900 }}>
          {token.symbol}
        </div>
        <div style={{ display: "flex", color: "#94A3B8", fontSize: 23 }}>
          #{token.marketCapRank || "N/A"}
        </div>
      </div>
      <div style={{ display: "flex", color: "#CBD5E1", fontSize: 23, marginTop: 2 }}>
        {truncate(token.name, 24)}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 16,
          marginTop: 20,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", color: "#94A3B8", fontSize: 18 }}>24h move</div>
          <div style={{ display: "flex", color: token.priceChange24h >= 0 ? "#00FFA3" : "#FF3366", fontSize: 30, fontWeight: 900 }}>
            {formatPercent(token.priceChange24h)}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
          <div style={{ display: "flex", color: "#94A3B8", fontSize: 18 }}>Risk</div>
          <div style={{ display: "flex", color: riskColor, fontSize: 26, fontWeight: 900 }}>
            {getRiskTier(token.riskScore)} {token.riskScore}/10
          </div>
        </div>
      </div>
    </div>
  );
}

function renderCard(data: TelegramMarketPulseImageData): ReactElement {
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
        padding: "36px 54px",
      }}
    >
      {backdrop()}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 10, background: "#CCFF00" }} />
      <div style={{ display: "flex", flexDirection: "column", position: "relative", height: "100%" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          {brandMark()}
          <div style={{ display: "flex", color: "#94A3B8", fontSize: 23 }}>{data.generatedAtLabel}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", marginTop: 26 }}>
          <div style={{ display: "flex", color: "#F8FAFC", fontSize: 64, fontWeight: 900, lineHeight: 1 }}>
            {data.title}
          </div>
          <div style={{ display: "flex", color: "#94A3B8", fontSize: 25, marginTop: 9 }}>
            {data.subtitle}
          </div>
        </div>

        <div style={{ display: "flex", gap: 18, marginTop: 30 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, width: 690 }}>
            {metricPanel("Global market", data.globalStats, "#F8FAFC")}
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", color: "#94A3B8", fontSize: 21, marginBottom: 9 }}>Sector leaders</div>
              {sectorList(data.sectorLines)}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", marginLeft: "auto", justifyContent: "flex-start", paddingTop: 4 }}>
            {tokenPanel(data.featuredToken)}
          </div>
        </div>

      </div>
    </div>
  );
}

export async function renderTelegramMarketImage(data: TelegramMarketPulseImageData): Promise<Buffer> {
  const svg = await satori(renderCard(data), {
    width: WIDTH,
    height: HEIGHT,
    fonts: [
      {
        name: "Geist",
        data: getFont(),
        weight: 600,
        style: "normal",
      },
    ],
  });

  const resvg = new Resvg(svg, {
    background: "#06070A",
    fitTo: { mode: "width", value: WIDTH },
  });

  return Buffer.from(resvg.render().asPng());
}
