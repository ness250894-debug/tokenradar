const SOCIAL_EDITORIAL_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\btokenradar\s+signal\b/gi, "TokenRadar research read"],
  [/\bstrong\s+buy\b/gi, "positive data read"],
  [/\bbuy\s+signal\b/gi, "market data read"],
  [/\btrade\s+signal\b/gi, "market data read"],
  [/\bsignal\b/gi, "research read"],
  [/\bprice\s+prediction\b/gi, "scenario read"],
  [/\bprice\s+target\b/gi, "scenario level"],
  [/\bbuy\s+now(?:\s+before)?\b/gi, "Review the data"],
  [/\bbuying\s+dips\b/gi, "waiting for confirmation"],
  [/\bbuying\b/gi, "accumulation"],
  [/\binvest\s+now\b/gi, "Review the data"],
  [/\byou\s+should\s+(?:buy|invest)\b/gi, "review the data"],
  [/\b(?:moonshot|to the moon)\b/gi, "high-volatility move"],
  [/\bmoon\s+bound\b/gi, "Needs confirmation"],
  [/\b(?:1000x|100x|10x)\b/gi, "large upside claim"],
  [/\bguaranteed\s+(?:returns|gains|profit)\b/gi, "unverified return claim"],
  [/\bguaranteed\b/gi, "automatic"],
  [/\b(?:sure thing|cannot lose|can't lose|risk-free investment)\b/gi, "risk claim"],
  [/\bfinancial advice\b/gi, "research context"],
  [/\b(?:go|going|went)\s+(?:long|short)\b/gi, "review the setup"],
  [/\b(?:long|short)\s+(?:position|trade|setup|signal)\b/gi, "directional setup"],
  [/\bentry\s+(?:price|point|setup|zone)\b/gi, "watch area"],
  [/\btake-profit\b/gi, "risk-management"],
  [/\bloading\s+bags\b/gi, "reviewing the data"],
  [/\bload\s+bags\b/gi, "review the data"],
  [/\bape\s+in\b/gi, "review the setup"],
  [/\bpump(?:ing|ed|s)?\b/gi, "high-volatility move"],
  [/\bexplosive\s+gains\b/gi, "large move"],
  [/\bnext\s+(?:1000x|100x|10x)\b/gi, "large upside claim"],
  [/\balpha\s+call\b/gi, "research note"],
  [/#\w*gems?\w*/gi, "#MarketRead"],
  [/\bgems?\b/gi, "tokens"],
  [/\bguaranteed\s+signal\b/gi, "unverified research read"],
  [/\bdon't\s+miss\b/gi, "review carefully"],
  [/\bsend\s+it\b/gi, "wait for confirmation"],
  [/\uD83D\uDE80/g, ""],
];

const UNSAFE_SOCIAL_PATTERNS: Array<[RegExp, string]> = [
  [/\bbuy\s+now\b/i, "buy now"],
  [/\bloading\s+bags\b/i, "loading bags"],
  [/\bload\s+bags\b/i, "load bags"],
  [/\bape\s+in\b/i, "ape in"],
  [/\bpump(?:ing|ed|s)?\b/i, "pump"],
  [/\bexplosive\s+gains\b/i, "explosive gains"],
  [/\b(?:1000x|100x|10x)\b/i, "multiple-x claim"],
  [/\balpha\s+call\b/i, "alpha call"],
  [/#\w*gems?\w*/i, "gem hashtag"],
  [/\bguaranteed\s+(?:signal|returns|gains|profit)\b/i, "guaranteed claim"],
  [/\bguaranteed\b/i, "guaranteed"],
  [/\bdon't\s+miss\b/i, "don't miss"],
  [/\bsend\s+it\b/i, "send it"],
  [/\uD83D\uDE80/u, "rocket emoji"],
];

export function sanitizeSocialEditorialText(text: string): string {
  let next = text;
  for (const [pattern, replacement] of SOCIAL_EDITORIAL_REPLACEMENTS) {
    next = next.replace(pattern, replacement);
  }

  return next
    .replace(/\s+([.,!?;:])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function findUnsafeSocialPhrases(text: string): string[] {
  const matches = new Set<string>();
  for (const [pattern, label] of UNSAFE_SOCIAL_PATTERNS) {
    if (pattern.test(text)) matches.add(label);
  }
  return Array.from(matches);
}
