/**
 * Lightweight server/build sanitizer for isomorphic-dompurify.
 *
 * The real package pulls in DOM implementations that can break static builds in
 * constrained runtimes. This mock intentionally implements the small hardening
 * surface the app needs instead of returning raw HTML.
 */
function sanitize(html) {
  return String(html || "")
    .replace(/<\s*(script|style|iframe|object|embed|link|meta|base)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|style|iframe|object|embed|link|meta|base)[^>]*\/?\s*>/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s+style\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s+srcdoc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s+(href|src|xlink:href|formaction)\s*=\s*(["'])\s*(?:javascript|vbscript|data):[\s\S]*?\2/gi, "")
    .replace(/\s+(href|src|xlink:href|formaction)\s*=\s*(?:javascript|vbscript|data):[^\s>]*/gi, "");
}

module.exports = {
  sanitize,
  default: {
    sanitize
  }
};
