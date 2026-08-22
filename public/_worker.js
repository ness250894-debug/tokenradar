const CANONICAL_HOST = "tokenradar.co";
const PUBLIC_TEXT_FILES = new Set(["/ads.txt", "/robots.txt"]);
const HTML_CACHE_CONTROL = "public, max-age=300, stale-while-revalidate=86400";

export const GLOBAL_SECURITY_HEADERS = Object.freeze({
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  "Content-Security-Policy": "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests; script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://s3.tradingview.com https://static.cloudflareinsights.com; connect-src 'self' https://formspree.io https://www.google-analytics.com https://region1.google-analytics.com https://stats.g.doubleclick.net https://www.tradingview.com https://s.tradingview.com https://cloudflareinsights.com wss://data-stream.binance.vision wss://stream.binance.com:9443; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; font-src 'self'; frame-src 'self' https://www.tradingview.com; manifest-src 'self'; worker-src 'self'",
});

export function shouldNoIndexTextPayload(pathname) {
  if (!pathname.toLowerCase().endsWith(".txt")) return false;
  if (PUBLIC_TEXT_FILES.has(pathname.toLowerCase())) return false;
  if (/^\/[a-f0-9]{32}\.txt$/i.test(pathname)) return false;
  return true;
}

export function withManagedHeaders(response, pathname) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(GLOBAL_SECURITY_HEADERS)) {
    headers.set(name, value);
  }

  const contentType = headers.get("Content-Type")?.toLowerCase() || "";
  if (pathname === "/" || pathname.toLowerCase().endsWith(".html") || contentType.includes("text/html")) {
    headers.set("Cache-Control", HTML_CACHE_CONTROL);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

const worker = {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.hostname.toLowerCase() === `www.${CANONICAL_HOST}`) {
      url.protocol = "https:";
      url.host = CANONICAL_HOST;
      return withManagedHeaders(Response.redirect(url, 308), url.pathname);
    }

    if (url.pathname === "/compare" || url.pathname.startsWith("/compare/")) {
      return new Response("Gone", {
        status: 410,
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "public, max-age=3600",
          "strict-transport-security": "max-age=31536000; includeSubDomains; preload",
          "x-content-type-options": "nosniff",
          "x-frame-options": "DENY",
          "referrer-policy": "strict-origin-when-cross-origin",
          "cross-origin-opener-policy": "same-origin",
          "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
          "content-security-policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
        },
      });
    }

    const response = await env.ASSETS.fetch(request);
    if (!shouldNoIndexTextPayload(url.pathname)) {
      return withManagedHeaders(response, url.pathname);
    }

    const headers = new Headers(response.headers);
    headers.set("X-Robots-Tag", "noindex, nofollow, nosnippet");
    return withManagedHeaders(new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    }), url.pathname);
  },
};

export default worker;
