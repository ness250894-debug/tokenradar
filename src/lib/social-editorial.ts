const SOCIAL_EDITORIAL_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bbuy\s+now(?:\s+before)?\b/gi, "Review the data"],
  [/\binvest\s+now\b/gi, "Review the data"],
  [/\byou\s+should\s+(?:buy|invest)\b/gi, "review the data"],
  [/\b(?:moonshot|to the moon)\b/gi, "high-volatility move"],
  [/\b(?:1000x|100x|10x)\b/gi, "large upside claim"],
  [/\bguaranteed\s+(?:returns|gains|profit)\b/gi, "unverified return claim"],
  [/\b(?:sure thing|cannot lose|can't lose|risk-free investment)\b/gi, "risk claim"],
  [/\bfinancial advice\b/gi, "research context"],
  [/\b(?:go|going|went)\s+(?:long|short)\b/gi, "review the setup"],
  [/\b(?:long|short)\s+(?:position|trade|setup|signal)\b/gi, "directional setup"],
  [/\bentry\s+(?:price|point|setup|zone)\b/gi, "watch area"],
  [/\btake-profit\b/gi, "risk-management"],
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
