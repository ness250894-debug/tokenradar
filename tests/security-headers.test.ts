import * as fs from "fs";
import * as path from "path";
import { describe, expect, it } from "vitest";

function loadCsp(): string {
  const headers = fs.readFileSync(path.join(process.cwd(), "public/_headers"), "utf-8");
  const match = headers.match(/^\s*Content-Security-Policy:\s*(.+)$/m);
  if (!match) throw new Error("Content-Security-Policy header is missing");
  return match[1];
}

function parseCsp(csp: string): Map<string, string[]> {
  return new Map(
    csp
      .split(";")
      .map((directive) => directive.trim().split(/\s+/))
      .filter(([name]) => Boolean(name))
      .map(([name, ...sources]) => [name, sources]),
  );
}

describe("security headers", () => {
  it("allows trusted analytics and embedded TradingView sources without opening broad script or frame sources", () => {
    const directives = parseCsp(loadCsp());

    expect(directives.get("script-src")).toEqual([
      "'self'",
      "'unsafe-inline'",
      "https://www.googletagmanager.com",
      "https://s3.tradingview.com",
      "https://static.cloudflareinsights.com",
    ]);
    expect(directives.get("frame-src")).toEqual(["'self'", "https://www.tradingview.com"]);
    expect(directives.get("connect-src")).toEqual(
      expect.arrayContaining([
        "'self'",
        "https://www.tradingview.com",
        "https://s.tradingview.com",
        "https://cloudflareinsights.com",
      ]),
    );
    expect(directives.get("script-src")).not.toContain("*");
    expect(directives.get("frame-src")).not.toContain("*");
  });
});
