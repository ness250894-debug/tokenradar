const AMBIGUOUS_TOKEN_LINK_TERMS = new Set([
  "beam",
  "blur",
  "cash",
  "compound",
  "deep",
  "derive",
  "dual",
  "everything",
  "flow",
  "four",
  "gas",
  "gate",
  "grass",
  "home",
  "just",
  "movement",
  "nano",
  "prime",
  "rain",
  "render",
  "request",
  "river",
  "safe",
  "score",
  "sky",
  "spark",
  "story",
  "vision",
  "would",
]);

const AMBIGUOUS_TOKEN_LINK_PHRASES = new Set([
  "risk score",
  "trust wallet",
]);

function normalizeTerm(value: string): string {
  return value
    .replace(/[`*_~]/g, "")
    .replace(/[^\p{L}\p{N}.+-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function getTermWords(value: string): string[] {
  return normalizeTerm(value).match(/[\p{L}\p{N}+-]+/gu) || [];
}

function isAmbiguousTokenTerm(value: string): boolean {
  const normalized = normalizeTerm(value);
  return AMBIGUOUS_TOKEN_LINK_TERMS.has(normalized) || AMBIGUOUS_TOKEN_LINK_PHRASES.has(normalized);
}

function containsAmbiguousTokenTerm(value: string): boolean {
  const normalized = normalizeTerm(value);
  if (AMBIGUOUS_TOKEN_LINK_PHRASES.has(normalized)) return true;
  return getTermWords(value).some((word) => AMBIGUOUS_TOKEN_LINK_TERMS.has(word));
}

export function isLinkableTokenName(name: string): boolean {
  const normalized = normalizeTerm(name);
  if (normalized.length <= 2) return false;
  if (/^\d+$/.test(normalized)) return false;
  return !isAmbiguousTokenTerm(normalized);
}

export function shouldUnwrapAmbiguousTokenLink(label: string, internalPath: string): boolean {
  if (containsAmbiguousTokenTerm(label)) return true;

  const firstSegment = internalPath.split("/")[1] || "";
  const firstSegmentStem = firstSegment.split("-")[0] || firstSegment;
  if (!isAmbiguousTokenTerm(firstSegment) && !isAmbiguousTokenTerm(firstSegmentStem)) {
    return false;
  }

  return getTermWords(label).length <= 2;
}
