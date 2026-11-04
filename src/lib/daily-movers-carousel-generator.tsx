import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import * as fs from "fs";
import * as path from "path";
import { Fragment, isValidElement, type ReactElement, type ReactNode } from "react";
import { formatCompact, formatPercent } from "./formatters";
import { fetchTokenIconDataUrl } from "./token-icon-data";
import { buildInstagramMoverLesson, volumeToMarketCap } from "./instagram-daily-movers";
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

export const DAILY_MOVERS_CAROUSEL_SLIDE_ROLES = [
  "question", "comparison", "explanation", "missing-evidence", "checklist",
] as const;
export const DAILY_MOVERS_CAROUSEL_SLIDE_COUNT = DAILY_MOVERS_CAROUSEL_SLIDE_ROLES.length;
let geistFontBuffer: ArrayBuffer | null = null;
type Mover = DailyMoverCarouselToken & { iconDataUrl?: string };

function getFont(): ArrayBuffer {
  if (!geistFontBuffer) {
    const bytes = fs.readFileSync(path.resolve(process.cwd(), "node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf"));
    geistFontBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  }
  return geistFontBuffer;
}

function heading(text: string, size = 70) {
  return <div style={{ display: "flex", fontSize: size, lineHeight: 1.08, fontWeight: 800, marginTop: 48 }}>{text}</div>;
}

function paragraph(text: string, color = "#CBD5E1", size = 38) {
  return <div style={{ display: "flex", color, fontSize: size, lineHeight: 1.3, marginTop: 28 }}>{text}</div>;
}

function panel(title: string, text: string, accent = "#CCFF00") {
  return <div style={{ display: "flex", flexDirection: "column", padding: 32, borderRadius: 18,
    border: "1px solid #334155", background: "#111A2C", marginTop: 24 }}>
    <div style={{ display: "flex", fontSize: 38, color: accent, fontWeight: 800 }}>{title}</div>
    {paragraph(text, "#F8FAFC", 36)}
  </div>;
}

function shell(section: string, children: ReactNode, date: Date) {
  const content = isValidElement<{ children?: ReactNode }>(children) && children.type === Fragment ? children.props.children : children;
  return <div style={{ width: 1080, height: 1350, boxSizing: "border-box", display: "flex", flexDirection: "column", padding: "64px 64px 48px",
    background: "linear-gradient(150deg, #111B20, #070B13 60%)", color: "#F8FAFC", fontFamily: "Geist", position: "relative" }}>
    <div style={{ display: "flex", position: "absolute", top: 0, left: 0, right: 0, height: 10, background: "#CCFF00" }} />
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div style={{ display: "flex", color: "#CCFF00", fontSize: 28 }}>{section.toUpperCase()}</div>
      <div style={{ display: "flex", fontSize: 30, fontWeight: 800 }}>TOKEN<span style={{ color: "#CCFF00" }}>RADAR</span></div>
    </div>
    <div style={{ display: "flex", flexDirection: "column", flexGrow: 1 }}>{content}</div>
    <div style={{ display: "flex", flexDirection: "column", borderTop: "1px solid #334155", paddingTop: 20, marginTop: 28, color: "#AAB8CB", fontSize: 26 }}>
      <div style={{ display: "flex" }}>CoinGecko · {date.toISOString().slice(0, 16).replace("T", " ")} UTC</div>
      <div style={{ display: "flex", marginTop: 8 }}>Point-in-time educational research · TokenRadar.co</div>
    </div>
  </div>;
}

function icon(mover: Mover) {
  return mover.iconDataUrl
    // eslint-disable-next-line @next/next/no-img-element -- Satori renders this static asset.
    ? <img src={mover.iconDataUrl} alt={mover.name} width={54} height={54} style={{ borderRadius: 27 }} />
    : <div style={{ display: "flex", width: 54, height: 54, borderRadius: 27, background: "#CCFF00", color: "#070B13", alignItems: "center", justifyContent: "center", fontSize: 24 }}>{mover.symbol.slice(0, 2).toUpperCase()}</div>;
}

function renderCover(movers: Mover[], date: Date) {
  const lesson = buildInstagramMoverLesson(movers);
  return shell("The research question", <>
    {heading(lesson.headline, 76)}
    {paragraph("Price change and trading activity answer different questions.")}
    <div style={{ display: "flex", gap: 24, marginTop: 54 }}>
      {[lesson.leader, lesson.peer].map((mover) => <div key={mover.id} style={{ display: "flex", flexDirection: "column", flex: 1, background: "#111A2C", border: "1px solid #334155", borderRadius: 18, padding: 28 }}>
        <div style={{ display: "flex", color: "#F8FAFC", fontSize: 44 }}>{mover.symbol.toUpperCase()}</div>
        {paragraph("24h price change", "#AAB8CB", 30)}
        <div style={{ display: "flex", color: "#00FFA3", fontSize: 54, marginTop: 12 }}>{formatPercent(mover.change24h)}</div>
        {paragraph("Reported turnover", "#AAB8CB", 30)}
        <div style={{ display: "flex", color: "#00C2FF", fontSize: 54, marginTop: 12 }}>{(volumeToMarketCap(mover) * 100).toFixed(1)}%</div>
      </div>)}
    </div>
    {paragraph("Swipe for the calculation and the checks this snapshot cannot provide.", "#CCFF00", 36)}
  </>, date);
}

function renderComparison(movers: Mover[], date: Date) {
  return shell("Compare the evidence", <>
    {heading("Same window. Two measurements.")}
    {paragraph("Five qualifying movers, ordered by 24h price change.", "#CBD5E1", 34)}
    <div style={{ display: "flex", marginTop: 40, padding: "0 20px", color: "#AAB8CB", fontSize: 28 }}>
      <div style={{ display: "flex", flex: 1 }}>Asset</div>
      <div style={{ display: "flex", width: 210 }}>24h change</div>
      <div style={{ display: "flex", width: 210 }}>Turnover</div>
    </div>
    {movers.map((mover) => <div key={mover.id} style={{ display: "flex", alignItems: "center", marginTop: 18, padding: "26px 20px", background: "#111A2C", borderRadius: 14, border: "1px solid #334155" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, flex: 1 }}>{icon(mover)}<div style={{ display: "flex", fontSize: 36 }}>{mover.symbol.toUpperCase()}</div></div>
      <div style={{ display: "flex", width: 210, fontSize: 38, color: "#00FFA3" }}>{formatPercent(mover.change24h)}</div>
      <div style={{ display: "flex", width: 210, fontSize: 38, color: "#00C2FF" }}>{(volumeToMarketCap(mover) * 100).toFixed(1)}%</div>
    </div>)}
    {paragraph("Turnover = reported 24h volume / market cap. The columns measure different things.", "#CCFF00", 36)}
  </>, date);
}

function renderExplanation(movers: Mover[], date: Date) {
  const leader = movers[0];
  return shell("Understand the metric", <>
    {heading(`How ${leader.symbol.toUpperCase()}'s turnover is calculated`)}
    {panel("Reported 24h trading volume", formatCompact(leader.volume24h), "#00C2FF")}
    <div style={{ display: "flex", fontSize: 48, justifyContent: "center", marginTop: 20 }}>divided by</div>
    {panel("Market cap", formatCompact(leader.marketCap))}
    <div style={{ display: "flex", fontSize: 86, color: "#00C2FF", marginTop: 32 }}>{(volumeToMarketCap(leader) * 100).toFixed(1)}% turnover</div>
    {paragraph("This compares reported activity with market size. Repeated trades can contribute to volume.")}
    {paragraph("The ratio cannot tell us how much quoted liquidity is available.", "#CCFF00", 36)}
  </>, date);
}

function renderMissingEvidence(date: Date) {
  return shell("Know what is missing", <>
    {heading("Three checks beyond turnover")}
    {panel("Spread", "The gap between the best quoted prices.")}
    {panel("Depth", "Available quoted size near the market price.", "#00C2FF")}
    {panel("Venue mix", "Where the trading activity was reported.", "#FFB800")}
    {paragraph("These fields are absent from this snapshot. Turnover alone cannot answer them.", "#CBD5E1", 36)}
  </>, date);
}

function renderChecklist(cta: string, date: Date) {
  const checks = [
    ["Price change", "Movement over a stated time window."],
    ["Reported turnover", "Trading volume relative to market size."],
    ["Spread", "The gap between quoted prices."],
    ["Depth", "Available quoted size near price."],
  ];
  return shell("Your research checklist", <>
    {heading("Four fields to read together")}
    {checks.map(([title, detail], index) => <div key={title} style={{ display: "flex", gap: 24, alignItems: "center", marginTop: 32, padding: "22px 0", borderBottom: "1px solid #334155" }}>
      <div style={{ display: "flex", fontSize: 48, color: "#CCFF00", width: 56 }}>{index + 1}</div>
      <div style={{ display: "flex", flexDirection: "column" }}><div style={{ display: "flex", fontSize: 42 }}>{title}</div><div style={{ display: "flex", fontSize: 32, color: "#CBD5E1", marginTop: 10 }}>{detail}</div></div>
    </div>)}
    {paragraph(cta, "#CCFF00", 42)}
  </>, date);
}

async function renderPng(element: ReactElement): Promise<Buffer> {
  const svg = await satori(element, { width: 1080, height: 1350, fonts: [{ name: "Geist", data: getFont(), weight: 400, style: "normal" }] });
  return Buffer.from(new Resvg(svg).render().asPng());
}

export async function generateDailyMoversCarousel(movers: DailyMoverCarouselToken[], options: DailyMoversCarouselOptions = {}): Promise<Buffer[]> {
  if (movers.length < 5) throw new Error(`Daily Movers carousel requires 5 movers. Received ${movers.length}.`);
  const prepared = await Promise.all(movers.slice(0, 5).map(async (mover) => ({ ...mover, iconDataUrl: await fetchTokenIconDataUrl(mover) || undefined })));
  const date = options.generatedAt ?? new Date();
  const slides = [renderCover(prepared, date), renderComparison(prepared, date), renderExplanation(prepared, date), renderMissingEvidence(date), renderChecklist(options.cta?.trim() || "Save the four-field research checklist.", date)];
  return Promise.all(slides.map(renderPng));
}
