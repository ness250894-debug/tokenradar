export interface SeoAuditCheck {
  id: string;
  passed: boolean;
  message: string;
}

export interface SeoAuditInput {
  html: string;
  url: string;
  sitemapUrls?: ReadonlySet<string>;
  expectedIndexable?: boolean;
}

export interface SeoAuditResult {
  passed: boolean;
  checks: SeoAuditCheck[];
}

export function decodeHtmlEntities(value: string): string {
  const namedEntities: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
    if (code.startsWith("#x")) return String.fromCodePoint(Number.parseInt(code.slice(2), 16));
    if (code.startsWith("#")) return String.fromCodePoint(Number.parseInt(code.slice(1), 10));
    return namedEntities[code.toLowerCase()] || entity;
  });
}

function textBetween(html: string, pattern: RegExp): string | null {
  const match = pattern.exec(html);
  return match?.[1] ? decodeHtmlEntities(match[1].trim()) : null;
}

function attrValue(tag: string, attr: string): string | null {
  const match = new RegExp(`${attr}\\s*=\\s*["']([^"']+)["']`, "i").exec(tag);
  return match?.[1] ? decodeHtmlEntities(match[1].trim()) : null;
}

function findTag(html: string, pattern: RegExp): string | null {
  const match = pattern.exec(html);
  return match?.[0] || null;
}

function normalizeUrl(value: string): string {
  try {
    const url = new URL(value);
    const pathname = url.pathname === "/" ? "/" : url.pathname.replace(/\/+$/, "");
    return `${url.origin}${pathname}`;
  } catch {
    return value.replace(/\/+$/, "");
  }
}

function check(id: string, passed: boolean, message: string): SeoAuditCheck {
  return { id, passed, message };
}

export function auditSeoHtml(input: SeoAuditInput): SeoAuditResult {
  const expectedIndexable = input.expectedIndexable ?? true;
  const canonicalTag = findTag(input.html, /<link\b[^>]*rel=["']canonical["'][^>]*>/i);
  const canonical = canonicalTag ? attrValue(canonicalTag, "href") : null;
  const descriptionTag = findTag(input.html, /<meta\b[^>]*name=["']description["'][^>]*>/i);
  const description = descriptionTag ? attrValue(descriptionTag, "content") : null;
  const robotsTag = findTag(input.html, /<meta\b[^>]*name=["']robots["'][^>]*>/i);
  const robots = robotsTag ? attrValue(robotsTag, "content")?.toLowerCase() || "" : "";
  const title = textBetween(input.html, /<title>([\s\S]*?)<\/title>/i);
  const jsonLdBlocks = input.html.match(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) || [];

  const checks: SeoAuditCheck[] = [
    check("title", Boolean(title), "HTML has a title tag"),
    check(
      "title-length",
      !expectedIndexable || Boolean(title && title.length >= 10 && title.length <= 60),
      expectedIndexable ? "Indexable page title is 10-60 characters" : "Title length is not enforced for non-indexable pages",
    ),
    check("description", Boolean(description), "HTML has a meta description"),
    check(
      "description-length",
      !expectedIndexable || Boolean(description && description.length >= 70 && description.length <= 160),
      expectedIndexable ? "Indexable page description is 70-160 characters" : "Description length is not enforced for non-indexable pages",
    ),
    check(
      "canonical",
      Boolean(canonical) && (!expectedIndexable || normalizeUrl(canonical || "") === normalizeUrl(input.url)),
      expectedIndexable ? "Canonical URL matches the audited URL" : "Non-indexable page has an explicit canonical URL",
    ),
    check(
      "robots",
      expectedIndexable ? !robots.includes("noindex") : robots.includes("noindex"),
      expectedIndexable ? "Indexable page is not marked noindex" : "Non-indexable page is marked noindex",
    ),
    check("open-graph-title", /<meta\b[^>]*property=["']og:title["'][^>]*>/i.test(input.html), "Open Graph title is present"),
    check("open-graph-description", /<meta\b[^>]*property=["']og:description["'][^>]*>/i.test(input.html), "Open Graph description is present"),
    check("open-graph-image", /<meta\b[^>]*property=["']og:image["'][^>]*>/i.test(input.html), "Open Graph image is present"),
    check("twitter-card", /<meta\b[^>]*name=["']twitter:card["'][^>]*>/i.test(input.html), "Twitter card is present"),
    check("json-ld", jsonLdBlocks.length > 0, "At least one JSON-LD block is present"),
    check("internal-links", /<a\b[^>]*href=["'](?:\/|https:\/\/tokenradar\.co\/)[^"']*["']/i.test(input.html), "At least one internal link is present"),
  ];

  if (input.sitemapUrls) {
    const inSitemap = input.sitemapUrls.has(normalizeUrl(input.url));
    checks.push(check(
      "sitemap-membership",
      expectedIndexable ? inSitemap : !inSitemap,
      expectedIndexable ? "Indexable page is present in sitemap" : "Non-indexable page is absent from sitemap",
    ));
  }

  return {
    passed: checks.every((item) => item.passed),
    checks,
  };
}
