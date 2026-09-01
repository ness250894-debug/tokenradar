export interface ProtectedSocialEntity {
  value: string;
  /** Symbols should normally be case-sensitive so a ticker such as PUMP does not exempt generic "pump" hype. */
  caseSensitive?: boolean;
}

export interface SocialEditorialOptions {
  protectedEntities?: Array<string | ProtectedSocialEntity>;
  /**
   * Generated candidates use "preserve" so the validator can report every
   * problem and request a clean regeneration. All other callers fail closed.
   */
  unsafeBehavior?: "throw" | "preserve";
}

const UNSAFE_SOCIAL_PATTERNS: Array<[RegExp, string]> = [
  [/\b(?:buy|buying|sell|selling|invest|investing)\b/i, "investment instruction"],
  [/\baccumulat(?:e|es|ed|ing|ion)\b/i, "accumulation instruction"],
  [/\b(?:entry|entries)(?:\s+(?:price|point|setup|zone|level))?\b/i, "entry instruction"],
  [/\b(?:commit|committing|deploy|deploying)\s+(?:your\s+)?capital\b/i, "capital instruction"],
  [/\bbefore\s+(?:making\s+)?(?:a\s+)?moves?\b/i, "action instruction"],
  [/\b(?:go|going|went)\s+(?:long|short)\b/i, "directional trade"],
  [/\b(?:long|short)\s+(?:position|trade|setup|signal)\b/i, "directional trade"],
  [/\b(?:trade|trading)\s+(?:command|call|position|setup|signal)\b/i, "trade instruction"],
  [/\b(?:take[ -]?profit|stop[ -]?loss)\b/i, "trade level"],
  [/\b(?:load|loading)\s+bags\b/i, "loading bags"],
  [/\bape\s+in\b/i, "ape in"],
  [/\b(?:strong\s+buy|buy\s+now|invest\s+now)\b/i, "direct investment instruction"],
  [/\b(?:tokenradar|buy|sell|trade|entry)\s+signals?\b|\bsignals?\s+to\s+(?:buy|sell|trade|enter)\b/i, "trade signal language"],
  [/\b(?:price\s+prediction|price\s+target)\b/i, "price prediction"],
  [/\bpump(?:ing|ed|s)?\b/i, "pump hype"],
  [/\b(?:moonshot|to\s+the\s+moon|moon\s+bound)\b/i, "moon hype"],
  [/\b(?:1000x|100x|10x)\b/i, "multiple-x claim"],
  [/\bexplosive\s+gains\b/i, "explosive gains"],
  [/\balpha\s+call\b/i, "alpha call"],
  // Match promotional gem tags such as #Gem, #HiddenGem, or #CryptoGems.
  // Requiring "gem" at the end avoids false positives for ordinary words
  // that merely contain those letters, for example #RiskManagement.
  [/#\w*gems?\b/i, "gem hashtag"],
  [/\bgems?\b/i, "gem language"],
  [/\bguaranteed(?:\s+(?:signal|returns|gains|profit))?\b/i, "guaranteed claim"],
  [/\b(?:sure\s+thing|cannot\s+lose|can't\s+lose|risk[ -]?free\s+investment)\b/i, "certainty claim"],
  [/\b(?:this|that|it)\s+is\s+(?:financial|investment)\s+advice\b/i, "affirmative advice claim"],
  [/\bdon't\s+miss\b/i, "urgency language"],
  [/\bsend\s+it\b/i, "send it"],
  [/\uD83D\uDE80/u, "rocket emoji"],
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function maskProtectedSocialEntities(text: string, options: SocialEditorialOptions = {}): string {
  let masked = text;
  let placeholderIndex = 0;
  const entities: ProtectedSocialEntity[] = [
    // Only caller-supplied, verified entities are masked. Automatically
    // treating arbitrary cashtags or dotted words as entities lets unsafe
    // phrases evade review (for example, "Setup.Guaranteed returns").
    ...(options.protectedEntities || []).map((entity) =>
      typeof entity === "string" ? { value: entity, caseSensitive: false } : entity,
    ),
  ];

  for (const entity of entities.sort((left, right) => right.value.length - left.value.length)) {
    if (!entity.value.trim()) continue;
    const flags = entity.caseSensitive ? "g" : "gi";
    masked = masked.replace(new RegExp(escapeRegExp(entity.value), flags), () => {
      placeholderIndex += 1;
      return `\uE000ENTITY${placeholderIndex}\uE001`;
    });
  }

  return masked;
}

export class UnsafeSocialEditorialError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`Unsafe social editorial content: ${issues.join(", ")}`);
    this.name = "UnsafeSocialEditorialError";
    this.issues = issues;
  }
}

export function findUnsafeSocialPhrases(
  text: string,
  options: SocialEditorialOptions = {},
): string[] {
  const searchableText = maskProtectedSocialEntities(text, options);
  const matches = new Set<string>();
  for (const [pattern, label] of UNSAFE_SOCIAL_PATTERNS) {
    if (pattern.test(searchableText)) matches.add(label);
  }
  return Array.from(matches);
}

/**
 * Performs typography-only cleanup. It intentionally does not convert an
 * unsafe instruction into a softer-sounding synonym: unsafe meaning either
 * remains visible to a downstream validator or fails closed here.
 */
export function sanitizeSocialEditorialText(
  text: string,
  options: SocialEditorialOptions = {},
): string {
  const issues = findUnsafeSocialPhrases(text, options);
  if (issues.length > 0 && options.unsafeBehavior !== "preserve") {
    throw new UnsafeSocialEditorialError(issues);
  }

  return text
    .replace(/\s+([.,!?;:])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
