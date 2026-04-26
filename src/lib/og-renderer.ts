/**
 * Standalone OG Image Renderer — TokenRadar
 *
 * Renders branded OG data cards in-memory using Satori (SVG) + resvg (PNG).
 * No Next.js runtime required — works in plain Node.js (GHA scripts).
 *
 * Usage:
 *   const buf = await renderOgImage({ name: "Bitcoin", symbol: "BTC", price: 67000, change: 2.5, risk: 3 });
 *   // buf is a PNG Buffer, ready to attach to TG/X posts
 */

import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { formatPrice } from "./formatters";

export interface OgRenderData {
  name: string;
  symbol: string;
  price: number;
  change: number;
  risk: number;
}

// ── Font Loading (cached) ────────────────────────────────────

let _fontCache: ArrayBuffer | null = null;

/**
 * Load Inter font from Google Fonts CDN. Cached after first call.
 */
async function loadFont(): Promise<ArrayBuffer> {
  if (_fontCache) return _fontCache;

  const url =
    "https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZg.ttf";

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch Inter font: HTTP ${response.status}`);
  }

  _fontCache = await response.arrayBuffer();
  return _fontCache;
}

// ── Risk Score Helpers ────────────────────────────────────────

function getRiskColor(score: number): string {
  if (score <= 3) return "#00e676";
  if (score <= 6) return "#ffd740";
  return "#ff5252";
}

function getRiskLabel(score: number): string {
  if (score <= 3) return "LOW";
  if (score <= 6) return "MEDIUM";
  return "HIGH";
}

// ── Name Font Scaling ─────────────────────────────────────────

function getNameFontSize(tokenName: string): number {
  const len = tokenName.length;
  if (len <= 8) return 84;
  if (len <= 12) return 72;
  if (len <= 18) return 60;
  return 48;
}

// ── Main Renderer ─────────────────────────────────────────────

/**
 * Render a branded OG data card as a PNG Buffer.
 *
 * @param data - Live token data to render
 * @returns PNG Buffer (1200×630) ready for social posting
 */
export async function renderOgImage(data: OgRenderData): Promise<Buffer> {
  const font = await loadFont();
  const riskColor = getRiskColor(data.risk);
  const riskLabel = getRiskLabel(data.risk);
  const nameFontSize = getNameFontSize(data.name);
  const changeSign = data.change >= 0 ? "+" : "";
  const changeColor = data.change >= 0 ? "#00e676" : "#ff5252";

  const svg = await satori(
    // Satori accepts React-element-like objects { type, props } at runtime,
    // but its TypeScript signature expects ReactNode. Cast to satisfy the checker.
    ({
      type: "div",
      props: {
        style: {
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "50px 60px",
          backgroundColor: "#0a0b0f",
          backgroundImage: "linear-gradient(135deg, #0a0b0f 0%, #181922 100%)",
          color: "#f0f0f5",
          fontFamily: "Inter",
        },
        children: [
          // Top: Branding
          {
            type: "div",
            props: {
              style: {
                display: "flex",
                alignItems: "center",
                fontSize: 28,
                fontWeight: 700,
                letterSpacing: "-0.02em",
              },
              children: [
                "Token",
                {
                  type: "span",
                  props: {
                    style: { color: "#d97706" },
                    children: "Radar",
                  },
                },
              ],
            },
          },
          // Middle: Token info + Risk badge
          {
            type: "div",
            props: {
              style: {
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-end",
                gap: 32,
              },
              children: [
                // Left: Token details
                {
                  type: "div",
                  props: {
                    style: {
                      display: "flex",
                      flexDirection: "column",
                      maxWidth: 720,
                      flexShrink: 1,
                    },
                    children: [
                      // Name + Symbol
                      {
                        type: "div",
                        props: {
                          style: {
                            display: "flex",
                            alignItems: "baseline",
                            flexWrap: "wrap",
                          },
                          children: [
                            {
                              type: "span",
                              props: {
                                style: {
                                  fontSize: nameFontSize,
                                  fontWeight: 800,
                                  letterSpacing: "-0.03em",
                                  marginRight: 16,
                                },
                                children: data.name,
                              },
                            },
                            {
                              type: "span",
                              props: {
                                style: {
                                  fontSize: 36,
                                  color: "#d97706",
                                  fontWeight: 700,
                                },
                                children: data.symbol.toUpperCase(),
                              },
                            },
                          ],
                        },
                      },
                      // Price + Change
                      {
                        type: "div",
                        props: {
                          style: {
                            display: "flex",
                            alignItems: "baseline",
                            marginTop: 16,
                            gap: 20,
                          },
                          children: [
                            {
                              type: "span",
                              props: {
                                style: {
                                  fontSize: 52,
                                  fontWeight: 800,
                                },
                                children: formatPrice(data.price),
                              },
                            },
                            {
                              type: "span",
                              props: {
                                style: {
                                  fontSize: 32,
                                  fontWeight: 700,
                                  color: changeColor,
                                },
                                children: `${changeSign}${data.change.toFixed(1)}%`,
                              },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
                // Right: Risk Score Badge
                {
                  type: "div",
                  props: {
                    style: {
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "#12131a",
                      padding: "30px 36px",
                      borderRadius: "24px",
                      border: `2px solid ${riskColor}40`,
                      boxShadow: `0 0 40px ${riskColor}20`,
                      flexShrink: 0,
                      minWidth: 200,
                    },
                    children: [
                      {
                        type: "div",
                        props: {
                          style: {
                            display: "flex",
                            fontSize: 20,
                            color: "#9395a5",
                            textTransform: "uppercase",
                            letterSpacing: "0.1em",
                            fontWeight: 700,
                          },
                          children: "Risk Score",
                        },
                      },
                      {
                        type: "div",
                        props: {
                          style: {
                            display: "flex",
                            alignItems: "baseline",
                            fontSize: 80,
                            fontWeight: 800,
                            color: riskColor,
                            marginTop: 8,
                          },
                          children: [
                            String(data.risk),
                            {
                              type: "span",
                              props: {
                                style: {
                                  display: "flex",
                                  fontSize: 40,
                                  color: "#5d5f72",
                                  marginLeft: 6,
                                },
                                children: "/10",
                              },
                            },
                          ],
                        },
                      },
                      {
                        type: "div",
                        props: {
                          style: {
                            display: "flex",
                            fontSize: 16,
                            color: riskColor,
                            fontWeight: 700,
                            marginTop: 4,
                            letterSpacing: "0.1em",
                          },
                          children: riskLabel,
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
          // Footer: Social handles
          {
            type: "div",
            props: {
              style: {
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                gap: 32,
                fontSize: 22,
                color: "#5d5f72",
                fontWeight: 500,
                borderTop: "1px solid #1e2030",
                paddingTop: 18,
              },
              children: [
                {
                  type: "span",
                  props: {
                    style: { display: "flex", alignItems: "center" },
                    children: "tokenradar.co",
                  },
                },
                {
                  type: "span",
                  props: {
                    style: { display: "flex", alignItems: "center" },
                    children: "@tokenradarco",
                  },
                },
                {
                  type: "span",
                  props: {
                    style: { display: "flex", alignItems: "center" },
                    children: "t.me/TokenRadarCo",
                  },
                },
              ],
            },
          },
        ],
      },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any),
    {
      width: 1200,
      height: 630,
      fonts: [
        {
          name: "Inter",
          data: font,
          weight: 700,
          style: "normal",
        },
      ],
    }
  );

  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: 1200 },
  });

  return Buffer.from(resvg.render().asPng());
}
