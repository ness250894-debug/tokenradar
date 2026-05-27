import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import * as fs from "fs";
import * as path from "path";
import type { ReactElement } from "react";

import { formatCompact, formatPercent } from "./formatters";

const WIDTH = 1200;
const HEIGHT = 630;

export interface TelegramWeeklyRecapImageData {
  title: string;
  subtitle: string;
  generatedAtLabel: string;
  leaders: Array<{
    symbol: string;
    name: string;
    change7d: number;
  }>;
  pullback?: {
    symbol: string;
    name: string;
    change7d: number;
  };
  volumeLeader?: {
    symbol: string;
    name: string;
    volume24h: number;
  };
}

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
  const verticalLines = [110, 230, 350, 470, 590, 710, 830, 950, 1070];
  const horizontalLines = [120, 240, 360, 480, 600];

  return (
    <div style={{ display: "flex", position: "absolute", inset: 0 }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(135deg, rgba(204,255,0,0.10) 0%, rgba(0,194,255,0.08) 50%, rgba(255,184,0,0.06) 100%)",
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
    </div>
  );
}

function leaderRow(item: TelegramWeeklyRecapImageData["leaders"][number], index: number) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "rgba(15,23,42,0.82)",
        border: "1px solid rgba(204,255,0,0.20)",
        borderRadius: 8,
        padding: "14px 18px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ display: "flex", color: "#64748B", fontSize: 23, fontWeight: 900, width: 28 }}>
          {index + 1}
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", color: "#F8FAFC", fontSize: 31, fontWeight: 900 }}>
            {truncate(item.symbol, 9)}
          </div>
          <div style={{ display: "flex", color: "#94A3B8", fontSize: 18 }}>
            {truncate(item.name, 22)}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", color: "#00FFA3", fontSize: 31, fontWeight: 900 }}>
        {formatPercent(item.change7d, 1)}
      </div>
    </div>
  );
}

function sidePanel(label: string, symbol: string, value: string, accent: string, name?: string) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        background: "rgba(2,6,23,0.76)",
        border: "1px solid rgba(248,250,252,0.13)",
        borderRadius: 8,
        padding: "18px 20px",
      }}
    >
      <div style={{ display: "flex", color: "#94A3B8", fontSize: 20, marginBottom: 8 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <div style={{ display: "flex", color: "#F8FAFC", fontSize: 38, fontWeight: 900 }}>
          {truncate(symbol, 9)}
        </div>
        <div style={{ display: "flex", color: accent, fontSize: 29, fontWeight: 900 }}>{value}</div>
      </div>
      {name ? (
        <div style={{ display: "flex", color: "#94A3B8", fontSize: 19, marginTop: 4 }}>
          {truncate(name, 28)}
        </div>
      ) : null}
    </div>
  );
}

function renderCard(data: TelegramWeeklyRecapImageData): ReactElement {
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
          <div style={{ display: "flex", color: "#F8FAFC", fontSize: 62, fontWeight: 900, lineHeight: 1 }}>
            {data.title}
          </div>
          <div style={{ display: "flex", color: "#94A3B8", fontSize: 25, marginTop: 9 }}>
            {data.subtitle}
          </div>
        </div>

        <div style={{ display: "flex", gap: 22, marginTop: 30 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, width: 650 }}>
            <div style={{ display: "flex", color: "#94A3B8", fontSize: 21 }}>Weekly momentum leaders</div>
            {data.leaders.slice(0, 3).map((item, index) => leaderRow(item, index))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, flex: 1, paddingTop: 33 }}>
            {data.pullback
              ? sidePanel(
                  "Pullback watch",
                  data.pullback.symbol,
                  formatPercent(data.pullback.change7d, 1),
                  "#FF3366",
                  data.pullback.name,
                )
              : null}
            {data.volumeLeader
              ? sidePanel(
                  "Liquidity tell",
                  data.volumeLeader.symbol,
                  formatCompact(data.volumeLeader.volume24h),
                  "#00C2FF",
                  data.volumeLeader.name,
                )
              : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export async function renderTelegramWeeklyRecapImage(data: TelegramWeeklyRecapImageData): Promise<Buffer> {
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
