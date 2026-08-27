import {
  findUnsafeSocialPhrases,
  maskProtectedSocialEntities,
  type ProtectedSocialEntity,
} from "./social-editorial";

export interface SocialContentFacts {
  tokenName: string;
  symbol: string;
  price?: number;
  priceChange24h?: number;
  marketCap?: number;
  marketCapRank?: number;
  volume24h?: number;
  riskScore?: number;
  growthPotentialIndex?: number;
  twitterFollowers?: number;
  redditSubscribers?: number;
  /** `undefined`/`null` means unavailable. Zero is a supplied, factual value. */
  githubCommits4Weeks?: number | null;
  marketDataSource?: string;
  marketDataAsOf?: string;
  suppliedContext?: Array<string | undefined>;
}

export interface SocialContentValidationIssue {
  code:
    | "unsafe-language"
    | "unsupported-source-claim"
    | "unsupported-metric-explanation"
    | "unsupported-developer-claim"
    | "unsupported-developer-interpretation"
    | "unsupported-number"
    | "missing-market-attribution";
  message: string;
  value?: string;
}

export interface SocialContentValidationResult {
  ok: boolean;
  issues: SocialContentValidationIssue[];
}

interface NumericClaim {
  raw: string;
  kind: "percent" | "currency" | "risk-score" | "growth-score" | "rank" | "commits" | "followers" | "subscribers";
  value: number;
  start: number;
  end: number;
}

const UNSUPPORTED_SOURCE_PATTERNS: Array<[RegExp, string]> = [
  [/\binstitutional(?:\s+(?:interest|activity|flows?|demand|buying|selling))?\b/i, "institutional activity"],
  [/\b(?:whales?|smart\s+money)\b/i, "whale or smart-money activity"],
  [/\b(?:order[ -]?book|order[ -]?flow)\b/i, "order-book data"],
  [/\b(?:open\s+interest|funding\s+rate|liquidations?)\b/i, "derivatives data"],
  [/\b(?:net\s+)?(?:inflows?|outflows?)\b/i, "flow data"],
  [/\b(?:exchange|wallet|on[ -]?chain)\s+(?:flows?|activity|accumulation|distribution)\b/i, "wallet or on-chain activity"],
  [/\b(?:support|resistance)\s+(?:level|zone|at|near)\b/i, "technical price levels"],
  [/\b(?:holder|ownership)\s+(?:concentration|distribution)|\btop\s+holders?\b/i, "holder concentration or distribution"],
  [/\bbuy[ /-]?sell\s+ratio\b/i, "buy/sell ratio"],
  [/\b(?:options?|futures?)\s+(?:flow|positioning|positions?|bias|demand|activity)\b/i, "options or futures positioning"],
  [/\b(?:catalysts?|triggered\s+by|driven\s+by|caused\s+by|because\s+of|due\s+to|explains?\s+the\s+move)\b/i, "an unverified catalyst or causal explanation"],
];

const COMPARATIVE_VOLUME_PATTERN = /\b(?:(?:flat|surging|rising|falling|spiking|drying\s+up|elevated|strong|weak|thin|deep|low|high|above[ -]average|below[ -]average)\s+(?:24h\s+)?(?:trading\s+)?volume|volume\s+(?:(?:is|looks|remains|stays|was|has\s+been)\s+)?(?:flat|surging|rising|falling|spiking|drying\s+up|elevated|strong|weak|thin|deep|low|high|above[ -]average|below[ -]average)|volume\s+(?:surges?|spikes?|rises?|falls?|drops?|dries\s+up))\b/i;
const LIQUIDITY_QUALITY_PATTERN = /\b(?:(?:thin|deep|low|high|rising|falling|improving|weakening|strong|weak|elevated|drying\s+up)\s+liquidity|liquidity\s+(?:(?:is|looks|remains|stays|was|has\s+been)\s+)?(?:thin|deep|low|high|rising|falling|improving|weakening|strong|weak|elevated|drying\s+up)|liquidity\s+(?:rises?|falls?|improves?|weakens?|dries\s+up))\b/i;
const UNGROUNDED_QUALITATIVE_PATTERNS: Array<[RegExp, string]> = [
  [
    /\b(?:(?:adoption|usage|network\s+activity|community|retail\s+demand|demand)\s+(?:(?:is|looks|remains|stays|was|has\s+been)\s+)?(?:surging|rising|falling|accelerating|decelerating|growing|shrinking|strong|weak|at\s+an?\s+all[ -]time\s+high)|(?:surging|rising|falling|accelerating|growing|shrinking|strong|weak)\s+(?:adoption|usage|network\s+activity|community|retail\s+demand|demand))\b/i,
    "an unsupported adoption, usage, network, community, or demand trend",
  ],
  [
    /\b(?:(?:risk\s+(?:is|looks|remains|stays|was)\s+(?:elevated|high|low|strong|weak))|(?:(?:elevated|high|low|strong|weak)\s+risk)|(?:growth\s+(?:is|looks|remains|stays|was)\s+(?:strong|weak|high|low))|(?:(?:strong|weak|high|low)\s+growth))\b/i,
    "an unsupported qualitative score interpretation",
  ],
  [
    /\b(?:cheap|expensive|undervalued|overvalued|fairly\s+valued|massive\s+move|huge\s+move|breaking\s+out|breakout|room\s+to\s+run|high\s+upside|promising\s+growth)\b/i,
    "an unsupported valuation, move-quality, or upside interpretation",
  ],
  [
    /\b(?:(?:momentum|trend|sentiment)\s+(?:(?:is|looks|remains|stays|was)\s+)?(?:strong|weak|bullish|bearish|positive|negative)|(?:strong|weak|bullish|bearish|positive|negative)\s+(?:momentum|trend|sentiment)|(?:high|low|elevated)\s+volatility|volatility\s+(?:(?:is|looks|remains|stays|was)\s+)?(?:high|low|elevated)|(?:price|token|asset)\s+(?:(?:is|looks|remains|stays|was)\s+)?stable)\b/i,
    "an unsupported momentum, trend, sentiment, volatility, or stability interpretation",
  ],
  [
    /\b(?:(?:heavy|robust|strong|weak)\s+(?:trading\s+)?volume|trading\s+(?:(?:is|looks|remains|stays|was)\s+)?busy|participation\s+(?:(?:is|looks|remains|stays|was)\s+)?(?:strong|weak|high|low)|(?:strong|weak|high|low)\s+participation|large[ -]cap|small[ -]cap|mid[ -]cap)\b/i,
    "an unsupported size, trading, volume, or participation classification",
  ],
  [
    /\b(?:(?:very\s+)?risky|riskier|safer|huge\s+community|massive\s+community|popular|viral|strong\s+sentiment)\b/i,
    "an unsupported risk, community, popularity, or sentiment interpretation",
  ],
  [
    /\b(?:outperform(?:ed|s|ing)?|underperform(?:ed|s|ing)?|led\s+the\s+market|market\s+leader|top[ -]performing|best[ -]performing|fastest[ -]growing|most\s+traded|(?:higher|lower)\s+volume\s+than|(?:larger|smaller)\s+(?:market\s+)?cap\s+than|(?:safer|riskier)\s+than|dominat(?:e|es|ed|ing)\s+(?:its|the)\s+(?:category|sector|market)|beats?\s+(?:every|all|its)\s+peers?)\b/i,
    "an unsupported comparison, ranking, or market-leadership claim",
  ],
];
const UNSUPPORTED_WORD_QUANTITY_PATTERNS = [
  /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|hundreds?|thousands?|millions?|billions?|trillions?)(?:[ -](?:hundreds?|thousands?|millions?|billions?|trillions?))?\s+(?:users?|holders?|followers?|subscribers?|customers?|wallets?|transactions?|tokens?|coins?)\b/i,
  /\b(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)[ -](?:largest|biggest|highest|lowest|ranked)\b/i,
  /\b(?:doubled|tripled|quadrupled)\b/i,
  /\b(?:one|two|three|four|five|six|seven|eight|nine|ten)[ -]?(?:x|times)\s+(?:move|gain|increase|return|growth)\b/i,
  /\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|hundred|thousand|million|billion|trillion)(?:[ -](?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|hundred|thousand|million|billion|trillion))*\s+(?:percent|per\s+cent|dollars?|euros?|pounds?|out\s+of\s+(?:ten|one\s+hundred))\b/i,
  /\b(?:price|market\s+cap|mcap|volume|risk\s+(?:score|index|profile)|growth(?:\s+potential)?\s+(?:score|index)|rank(?:ed|s)?)\b[^.!?\n]{0,32}\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|hundred|thousand|million|billion|trillion|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b/i,
];
const UNSUPPORTED_FACT_FAMILY_PATTERNS: Array<[RegExp, string]> = [
  [/\b(?:tvl|total\s+value\s+locked)\b[^.!?\n]{0,80}\b(?:rose|risen|rising|fell|fallen|falling|grew|growing|declined?|increased?|decreased?|record|high|low)\b/i, "TVL trend"],
  [/\b(?:network|protocol|gas)\s+fees?\b[^.!?\n]{0,80}\b(?:rose|risen|rising|fell|fallen|falling|grew|growing|declined?|increased?|decreased?|record|high|low)\b/i, "fee trend"],
  [/\b(?:circulating|total|max)\s+supply\b[^.!?\n]{0,80}\b(?:rose|risen|rising|fell|fallen|falling|grew|growing|declined?|increased?|decreased?)\b/i, "supply trend"],
  [/\b(?:transactions?|transaction\s+count)\b[^.!?\n]{0,80}\b(?:rose|risen|rising|fell|fallen|falling|grew|growing|declined?|increased?|decreased?|record|high|low|processed)\b/i, "transaction activity"],
  [/\bprocessed\b[^.!?\n]{0,80}\btransactions?\b/i, "transaction activity"],
  [/\b(?:largest|biggest|highest|lowest|leading|number[ -]one)\b[^.!?\n]{0,80}\b(?:crypto|token|coin|platform|network|protocol|market|sector|category)\b/i, "an unsupported superlative"],
  [/\b(?:adoption|usage|activity|demand)\b[^.!?\n]{0,40}\b(?:hit|reached|set)\s+(?:a\s+)?record\b/i, "a record claim"],
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function protectedEntitiesForFacts(facts: SocialContentFacts): ProtectedSocialEntity[] {
  const symbol = facts.symbol.trim();
  return [
    { value: facts.tokenName, caseSensitive: !/[\s.-]/.test(facts.tokenName) },
    { value: `$${symbol.toUpperCase()}`, caseSensitive: false },
    // Do not let a lowercase prose use of a ticker-word bypass policy.
    { value: symbol.toUpperCase(), caseSensitive: true },
  ].filter((entity) => Boolean(entity.value));
}

function normalizeForExactMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/<[^>]+>/g, " ")
    .replace(/,/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function renderedSocialText(value: string): string {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_match, code: string) => {
      const parsed = Number(code);
      return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= 0x10ffff
        ? String.fromCodePoint(parsed)
        : "";
    })
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => {
      const parsed = Number.parseInt(code, 16);
      return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= 0x10ffff
        ? String.fromCodePoint(parsed)
        : "";
    });
}

function parseScaledNumber(raw: string): number {
  const normalized = raw.replace(/[$€£,#\s]/g, "").replace(/,/g, "");
  const suffix = normalized.match(/[kmbt]$/i)?.[0].toLowerCase();
  const numeric = Number(suffix ? normalized.slice(0, -1) : normalized);
  const multiplier = suffix === "k"
    ? 1e3
    : suffix === "m"
      ? 1e6
      : suffix === "b"
        ? 1e9
        : suffix === "t"
          ? 1e12
          : 1;
  return numeric * multiplier;
}

function approximatelyEqual(left: number, right: number): boolean {
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  const tolerance = Math.max(Math.abs(right) * 0.015, 0.000001);
  return Math.abs(left - right) <= tolerance;
}

function collectRegexClaims(
  text: string,
  pattern: RegExp,
  build: (match: RegExpExecArray) => Omit<NumericClaim, "start" | "end">,
): NumericClaim[] {
  const claims: NumericClaim[] = [];
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    claims.push({ ...build(match), start, end: start + match[0].length });
  }
  return claims;
}

function extractNumericClaims(text: string): NumericClaim[] {
  const normalizedText = text.replace(/\u2212/g, "-");
  const candidates = [
    ...collectRegexClaims(normalizedText, /[+-]?\d[\d,]*(?:\.\d+)?\s*%/g, (match) => ({
      raw: match[0],
      kind: "percent" as const,
      value: Number(match[0].replace(/[,%\s]/g, "")),
    })),
    ...collectRegexClaims(normalizedText, /[$€£]\s*\d[\d,]*(?:\.\d+)?\s*[kmbt]?\b/gi, (match) => ({
      raw: match[0],
      kind: "currency" as const,
      value: parseScaledNumber(match[0]),
    })),
    ...collectRegexClaims(normalizedText, /\brisk(?:\s+(?:score|index|profile))?\s*:?\s*(\d+(?:\.\d+)?)\s*\/\s*10\b/gi, (match) => ({
      raw: match[0],
      kind: "risk-score" as const,
      value: Number(match[1]),
    })),
    ...collectRegexClaims(normalizedText, /\bgrowth(?:\s+potential)?(?:\s+(?:index|score))?\s*:?\s*(\d+(?:\.\d+)?)\s*\/\s*100\b/gi, (match) => ({
      raw: match[0],
      kind: "growth-score" as const,
      value: Number(match[1]),
    })),
    ...collectRegexClaims(normalizedText, /\brisk\s+(?:score|index|profile)\s*:?\s*(\d+(?:\.\d+)?)(?!\d|\s*\/)/gi, (match) => ({
      raw: match[0],
      kind: "risk-score" as const,
      value: Number(match[1]),
    })),
    ...collectRegexClaims(normalizedText, /\b(?:growth(?:\s+potential)?\s+(?:index|score))\s*:?\s*(\d+(?:\.\d+)?)(?!\d|\s*\/)/gi, (match) => ({
      raw: match[0],
      kind: "growth-score" as const,
      value: Number(match[1]),
    })),
    ...collectRegexClaims(normalizedText, /\brank\s*:?\s*#?\s*\d+\b/gi, (match) => ({
      raw: match[0],
      kind: "rank" as const,
      value: Number(match[0].match(/\d+/)?.[0]),
    })),
    ...collectRegexClaims(normalizedText, /#\d[\d,]*\s+by\s+market\s+cap\b/gi, (match) => ({
      raw: match[0],
      kind: "rank" as const,
      value: parseScaledNumber(match[0].match(/#(\d[\d,]*)/)?.[1] || "NaN"),
    })),
    ...collectRegexClaims(normalizedText, /\b\d[\d,]*\s+(?:github\s+)?commits?\b/gi, (match) => ({
      raw: match[0],
      kind: "commits" as const,
      value: parseScaledNumber(match[0].match(/\d[\d,]*/)?.[0] || "NaN"),
    })),
    ...collectRegexClaims(normalizedText, /\b\d[\d,.]*\s*[kmb]?\s+(?:twitter|x)\s+followers?\b/gi, (match) => ({
      raw: match[0],
      kind: "followers" as const,
      value: parseScaledNumber(match[0].match(/\d[\d,.]*\s*[kmb]?/i)?.[0] || "NaN"),
    })),
    ...collectRegexClaims(normalizedText, /\b\d[\d,.]*\s*[kmb]?\s+reddit\s+subscribers?\b/gi, (match) => ({
      raw: match[0],
      kind: "subscribers" as const,
      value: parseScaledNumber(match[0].match(/\d[\d,.]*\s*[kmb]?/i)?.[0] || "NaN"),
    })),
  ];

  // A ratio contains a plain number but does not overlap the percentage or
  // currency patterns. Other overlaps are duplicates of the same claim.
  const originalClaims = candidates.map((claim) => ({
    ...claim,
    raw: text.slice(claim.start, claim.end),
  }));
  return originalClaims.filter((claim, index) => !originalClaims.some((other, otherIndex) =>
    otherIndex < index
      && other.start < claim.end
      && claim.start < other.end
      && other.kind === claim.kind,
  ));
}

function claimClause(text: string, claim: NumericClaim): string {
  const before = text.slice(0, claim.start);
  const after = text.slice(claim.end);
  const previousBreak = Math.max(
    before.lastIndexOf("\n"),
    before.lastIndexOf("."),
    before.lastIndexOf("!"),
    before.lastIndexOf("?"),
    before.lastIndexOf(";"),
  );
  const nextOffsets = ["\n", ".", "!", "?", ";"]
    .map((delimiter) => after.indexOf(delimiter))
    .filter((offset) => offset >= 0);
  const nextBreak = nextOffsets.length > 0 ? Math.min(...nextOffsets) : after.length;
  return text.slice(previousBreak + 1, claim.end + nextBreak);
}

function claimLine(text: string, claim: NumericClaim): string {
  const lineStart = text.lastIndexOf("\n", claim.start - 1) + 1;
  const lineEndOffset = text.indexOf("\n", claim.end);
  const lineEnd = lineEndOffset >= 0 ? lineEndOffset : text.length;
  return text.slice(lineStart, lineEnd);
}

function claimSubjectSegment(text: string, claim: NumericClaim): string {
  const line = claimLine(text, claim);
  const lineStart = text.lastIndexOf("\n", claim.start - 1) + 1;
  const relativeStart = Math.max(0, claim.start - lineStart);
  const beforeClaim = line.slice(0, relativeStart);
  const segments = beforeClaim.split(/[,;:]|\b(?:while|whereas|but)\b/gi);
  return segments[segments.length - 1] || beforeClaim;
}

function claimMetricSegment(text: string, claim: NumericClaim): string {
  const line = claimLine(text, claim);
  const lineStart = text.lastIndexOf("\n", claim.start - 1) + 1;
  const relativeStart = Math.max(0, claim.start - lineStart);
  const boundaries = Array.from(line.matchAll(/[!?;]\s*|\.(?=\s|$)|,\s+(?=[A-Za-z])|\b(?:and|while|whereas|but)\b/gi));
  let segmentStart = 0;
  let segmentEnd = line.length;
  for (const boundary of boundaries) {
    const start = boundary.index || 0;
    const end = start + boundary[0].length;
    if (end <= relativeStart) segmentStart = end;
    if (start >= relativeStart) {
      segmentEnd = start;
      break;
    }
  }
  return line.slice(segmentStart, segmentEnd);
}

function claimNamesAnotherAsset(text: string, claim: NumericClaim, facts: SocialContentFacts): boolean {
  const segment = claimMetricSegment(text, claim);
  const normalizedSegment = normalizeForExactMatch(segment);
  const normalizedName = normalizeForExactMatch(facts.tokenName);
  const normalizedSymbol = facts.symbol.toLowerCase();
  if (normalizedSegment.includes(normalizedName)
    || normalizedSegment.includes(`$${normalizedSymbol}`)) return false;

  const cashtags = Array.from(segment.matchAll(/\$([A-Za-z][A-Za-z0-9._+-]*)/g));
  if (cashtags.some((match) => match[1].toLowerCase() !== normalizedSymbol)) return true;

  const namedMetricSubject = segment.match(
    /\b([A-Z][A-Za-z0-9._+-]*(?:\s+[A-Z][A-Za-z0-9._+-]*){0,2})\s+(?:[Pp]rice|[Mm]arket\s+[Cc]ap|[Mm][Cc]ap|(?:24h\s+)?[Vv]olume|[Rr]anks?|[Hh]as\s+(?:a\s+)?(?:[Rr]isk|[Gg]rowth)|[Rr]isk\s+(?:[Ss]core|[Ii]ndex|[Pp]rofile)|[Gg]rowth(?:\s+[Pp]otential)?\s+(?:[Ss]core|[Ii]ndex))\b/,
  )?.[1];
  if (namedMetricSubject && !normalizeForExactMatch(facts.tokenName).includes(normalizeForExactMatch(namedMetricSubject))) {
    return true;
  }
  const metricNamedObject = segment.match(
    /\b(?:[Pp]rice|[Mm]arket\s+[Cc]ap|[Mm][Cc]ap|(?:24h\s+)?[Vv]olume|[Rr]isk\s+(?:[Ss]core|[Ii]ndex|[Pp]rofile)|[Gg]rowth(?:\s+[Pp]otential)?\s+(?:[Ss]core|[Ii]ndex)|[Rr]ank)\s+(?:for|of)\s+([A-Z][A-Za-z0-9._+-]*(?:\s+[A-Z][A-Za-z0-9._+-]*){0,2})\b/,
  )?.[1];
  return Boolean(metricNamedObject
    && !normalizeForExactMatch(facts.tokenName).includes(normalizeForExactMatch(metricNamedObject)));
}

const SUPPLIED_CONTEXT_ANCHORS = [
  "bitcoin",
  "btc",
  "dominance",
  "global",
  "total market",
  "sector",
  "category",
  "fear and greed",
  "fear & greed",
];

function claimAppearsInSuppliedContext(
  claim: NumericClaim,
  text: string,
  facts: SocialContentFacts,
): boolean {
  const clause = normalizeForExactMatch(claimClause(text, claim));
  return (facts.suppliedContext || []).some((context) => {
    if (!context) return false;
    const normalizedContext = normalizeForExactMatch(context);
    const sameNumber = extractNumericClaims(context).some((contextClaim) =>
      contextClaim.kind === claim.kind && approximatelyEqual(contextClaim.value, claim.value),
    );
    if (!sameNumber) return false;
    if (normalizedContext.includes(clause) || clause.includes(normalizedContext)) return true;
    return SUPPLIED_CONTEXT_ANCHORS.some((anchor) =>
      clause.includes(anchor) && normalizedContext.includes(anchor),
    );
  });
}

function comparativePhraseAppearsInSuppliedContext(
  text: string,
  pattern: RegExp,
  facts: SocialContentFacts,
): boolean {
  const phrase = text.match(pattern)?.[0];
  if (!phrase) return false;
  const needle = normalizeForExactMatch(phrase);
  return (facts.suppliedContext || []).some((context) =>
    context ? normalizeForExactMatch(context).includes(needle) : false,
  );
}

function exactPhraseAppearsInSuppliedContext(phrase: string, facts: SocialContentFacts): boolean {
  const needle = normalizeForExactMatch(phrase);
  return (facts.suppliedContext || []).some((context) =>
    context ? normalizeForExactMatch(context).includes(needle) : false,
  );
}

const POSITIVE_DIRECTION_PATTERN = /\b(?:gain(?:ed|s)?|rose|rise[sn]?|risen|up|climb(?:ed|s)?|increase(?:d|s)?|ralli(?:ed|es)|jump(?:ed|s)?|advance(?:d|s)?|soar(?:ed|s)?|surge(?:d|s)?)\b/i;
const NEGATIVE_DIRECTION_PATTERN = /\b(?:fell|fall(?:s|en)?|drop(?:ped|s)?|down|declin(?:ed|es)|decrease(?:d|s)?|lost|slid|pull(?:ed)?\s+back|plung(?:ed|es)|plummet(?:ed|s)?|tumbl(?:ed|es)|slump(?:ed|s)?|sank|sunk|retreat(?:ed|s)?|dip(?:ped|s)?|shed)\b/i;
const FLAT_DIRECTION_PATTERN = /\b(?:flat|unchanged|steady|no\s+change)\b/i;

function hasNon24hTimeframe(text: string): boolean {
  const withoutAllowedDailyWindow = text
    // Scaled currency suffixes are amounts, not timeframe units. Without this
    // mask, values such as "$49M" are interpreted as "49 minutes" by the
    // case-insensitive shorthand matcher below.
    .replace(/[$€£]\s*\d[\d,]*(?:\.\d+)?\s*[kmbt]?\b/gi, " ")
    .replace(/\b(?:24\s*h|24[ -]hours?|1d|one[ -]day|daily)\b/gi, " ");
  return /\b(?:\d+\s*(?:m|min(?:ute)?s?|h|hours?|d|days?|w|weeks?|mo|months?|y|years?)|(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|thirty|sixty|ninety|hundred|three\s+hundred|three\s+hundred\s+sixty[ -]five)\s+(?:minutes?|hours?|days?|weeks?|months?|years?)|week(?:ly)?|month(?:ly)?|year(?:ly)?|ytd|year[ -]to[ -]date|q[1-4]|quarter(?:ly)?|this\s+(?:week|month|quarter|year)|since\s+(?:launch|inception|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|all[ -]time)\b/i.test(withoutAllowedDailyWindow);
}

function directedPercentValue(
  claim: NumericClaim,
  text: string,
  facts: SocialContentFacts,
): number | undefined {
  const line = claimLine(text, claim);
  const lineStart = text.lastIndexOf("\n", claim.start - 1) + 1;
  const relativeStart = Math.max(0, claim.start - lineStart);
  const relativeEnd = Math.max(relativeStart, claim.end - lineStart);
  const tokenIdentities = [facts.symbol, facts.tokenName]
    .filter((identity) => identity.trim().length > 0)
    .sort((left, right) => right.length - left.length)
    .map(escapeRegExp)
    .join("|");
  let subject = claimSubjectSegment(text, claim);
  if (tokenIdentities) {
    const leadingIdentity = new RegExp(
      `^\\s*\\$?(?:${tokenIdentities})(?=\\s|[(:-]|$)`,
      "i",
    );
    const parenthesizedIdentity = new RegExp(
      `^\\s*\\(\\s*\\$?(?:${tokenIdentities})\\s*\\)`,
      "i",
    );
    for (let identity = 0; identity < 2; identity += 1) {
      subject = subject.replace(parenthesizedIdentity, " ").replace(leadingIdentity, " ");
    }
  }
  const localContext = `${subject} ${line.slice(relativeEnd, relativeEnd + 32)}`;
  const hasPositiveDirection = POSITIVE_DIRECTION_PATTERN.test(localContext);
  const hasNegativeDirection = NEGATIVE_DIRECTION_PATTERN.test(localContext);
  const hasFlatDirection = FLAT_DIRECTION_PATTERN.test(localContext);
  if ([hasPositiveDirection, hasNegativeDirection, hasFlatDirection].filter(Boolean).length > 1) return undefined;

  const normalizedRaw = claim.raw.trim().replace(/\u2212/g, "-");
  const explicitlyPositive = normalizedRaw.startsWith("+");
  const explicitlyNegative = normalizedRaw.startsWith("-");
  if ((hasPositiveDirection && explicitlyNegative) || (hasNegativeDirection && explicitlyPositive)) {
    return undefined;
  }
  if (hasPositiveDirection) return Math.abs(claim.value);
  if (hasNegativeDirection) return -Math.abs(claim.value);
  if (hasFlatDirection) return 0;
  return claim.value;
}

function isSupportedNumericClaim(claim: NumericClaim, facts: SocialContentFacts, text: string): boolean {
  const clause = normalizeForExactMatch(claimClause(text, claim));
  const metricSegment = normalizeForExactMatch(claimMetricSegment(text, claim));
  if (claimNamesAnotherAsset(text, claim, facts)) return false;
  switch (claim.kind) {
    case "percent": {
      const macroSpecific = /\b(?:dominance|global|total\s+market|sector|category)\b/.test(clause);
      if (macroSpecific) return claimAppearsInSuppliedContext(claim, text, facts);
      // Use the whole line for entity binding because legitimate names such as
      // Pump.fun contain punctuation that also acts as a sentence delimiter.
      const line = normalizeForExactMatch(claimLine(text, claim));
      const subject = normalizeForExactMatch(claimSubjectSegment(text, claim));
      const namedTarget = subject.includes(normalizeForExactMatch(facts.tokenName))
        || subject.includes(`$${facts.symbol.toLowerCase()}`)
        || new RegExp(`\\b${escapeRegExp(facts.symbol.toLowerCase())}\\b`).test(subject);
      const tokenSpecific = namedTarget
        || /\b(?:price|24h\s+(?:move|change)|token\s+(?:move|change))\b/.test(subject || line);
      if (tokenSpecific && hasNon24hTimeframe(line)) {
        return claimAppearsInSuppliedContext(claim, text, facts);
      }
      const directedValue = directedPercentValue(claim, text, facts);
      const matchesTokenChange = facts.priceChange24h !== undefined
        && directedValue !== undefined
        && approximatelyEqual(directedValue, facts.priceChange24h);
      if (tokenSpecific) return matchesTokenChange;
      return claimAppearsInSuppliedContext(claim, text, facts);
    }
    case "currency": {
      const isGlobal = /\b(?:global|total)\b/.test(metricSegment);
      if (/\b(?:market\s+cap|mcap|valuation)\b/.test(metricSegment) && !isGlobal) {
        return facts.marketCap !== undefined && approximatelyEqual(claim.value, facts.marketCap);
      }
      if (/\b(?:24h\s+)?(?:trading\s+)?volume\b/.test(metricSegment) && !isGlobal) {
        return facts.volume24h !== undefined && approximatelyEqual(claim.value, facts.volume24h);
      }
      if (/\b(?:price|trading\s+at)\b/.test(metricSegment)) {
        return facts.price !== undefined && approximatelyEqual(claim.value, facts.price);
      }
      if (isGlobal) return claimAppearsInSuppliedContext(claim, text, facts);
      return claimAppearsInSuppliedContext(claim, text, facts);
    }
    case "risk-score":
      return facts.riskScore !== undefined && claim.value === facts.riskScore;
    case "growth-score":
      return facts.growthPotentialIndex !== undefined
        && claim.value === facts.growthPotentialIndex;
    case "rank":
      return facts.marketCapRank !== undefined && claim.value === facts.marketCapRank;
    case "commits":
      return facts.githubCommits4Weeks !== undefined
        && facts.githubCommits4Weeks !== null
        && claim.value === facts.githubCommits4Weeks
        && /\b(?:4\s*(?:weeks?|w)|four[ -]weeks?)\b/i.test(claimClause(text, claim));
    case "followers":
      return facts.twitterFollowers !== undefined
        && approximatelyEqual(claim.value, facts.twitterFollowers);
    case "subscribers":
      return facts.redditSubscribers !== undefined
        && approximatelyEqual(claim.value, facts.redditSubscribers);
  }
}

export function formatMarketDataSourceLabel(source: string | undefined): string | undefined {
  if (!source?.trim()) return undefined;
  if (/coingecko/i.test(source)) return "CoinGecko";
  if (/cached|fallback|local/i.test(source)) return "TokenRadar cached market data";
  return source.trim();
}

export function formatMarketDataAsOf(asOf: string | undefined): string | undefined {
  if (!asOf?.trim()) return undefined;
  const parsed = new Date(asOf);
  if (Number.isNaN(parsed.getTime())) return asOf.trim();
  return `${parsed.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

export function formatMarketDataAttribution(facts: Pick<SocialContentFacts, "marketDataSource" | "marketDataAsOf">): string | undefined {
  const source = formatMarketDataSourceLabel(facts.marketDataSource);
  const asOf = formatMarketDataAsOf(facts.marketDataAsOf);
  if (!source || !asOf) return undefined;
  return `${source} snapshot, ${asOf}`;
}

function hasPriceSensitiveClaim(text: string, numericClaims: NumericClaim[]): boolean {
  return numericClaims.some((claim) => ["percent", "currency", "rank"].includes(claim.kind))
    || /\b(?:price|market\s+cap|volume|24h\s+(?:move|change)|moved|moving|gained|fell|rose|flat)\b/i.test(text);
}

function exactCommitCountAppears(text: string, count: number): boolean {
  const countPattern = escapeRegExp(count.toLocaleString("en-US"));
  const plainPattern = escapeRegExp(String(count));
  return new RegExp(`\\b(?:${countPattern}|${plainPattern})\\s+(?:github\\s+)?commits?\\b`, "i").test(text);
}

function findUnsupportedPlainNumbers(
  text: string,
  recognizedClaims: NumericClaim[],
  facts: SocialContentFacts,
): string[] {
  const masked = Array.from(text);
  const maskRange = (start: number, end: number) => {
    for (let index = Math.max(0, start); index < Math.min(masked.length, end); index++) masked[index] = " ";
  };
  for (const claim of recognizedClaims) maskRange(claim.start, claim.end);

  const maskMatches = (pattern: RegExp) => {
    for (const match of text.matchAll(pattern)) maskRange(match.index || 0, (match.index || 0) + match[0].length);
  };
  maskMatches(/https?:\/\/\S+/gi);
  maskMatches(/#[a-z][a-z0-9_]*/gi);
  for (const entity of protectedEntitiesForFacts(facts)) {
    const flags = entity.caseSensitive ? "g" : "gi";
    maskMatches(new RegExp(escapeRegExp(entity.value), flags));
  }
  const attribution = formatMarketDataAttribution(facts);
  if (attribution) maskMatches(new RegExp(escapeRegExp(attribution), "gi"));
  // These are window labels, not measured values.
  maskMatches(/\b(?:24h|7d|30d|1y)\b/gi);
  maskMatches(/\b4\s*(?:weeks?|w)\b/gi);

  const remaining = masked.join("").replace(/\u2212/g, "-");
  return Array.from(remaining.matchAll(/[+-]?\d[\d,]*(?:\.\d+)?/g))
    .map((match) => text.slice(match.index || 0, (match.index || 0) + match[0].length).trim())
    .filter(Boolean);
}

export function validateSocialContent(
  text: string,
  facts: SocialContentFacts,
): SocialContentValidationResult {
  const issues: SocialContentValidationIssue[] = [];
  const renderedText = renderedSocialText(text);
  const protectedEntities = protectedEntitiesForFacts(facts);
  const unsafePhrases = findUnsafeSocialPhrases(renderedText, { protectedEntities });
  const semanticText = maskProtectedSocialEntities(renderedText, { protectedEntities });

  for (const phrase of unsafePhrases) {
    issues.push({
      code: "unsafe-language",
      message: `Blocked editorial language: ${phrase}.`,
      value: phrase,
    });
  }

  for (const [pattern, category] of UNSUPPORTED_SOURCE_PATTERNS) {
    if (pattern.test(semanticText)) {
      issues.push({
        code: "unsupported-source-claim",
        message: `The supplied facts do not support ${category}.`,
        value: category,
      });
    }
  }

  if (COMPARATIVE_VOLUME_PATTERN.test(semanticText)
    && !comparativePhraseAppearsInSuppliedContext(semanticText, COMPARATIVE_VOLUME_PATTERN, facts)) {
    issues.push({
      code: "unsupported-source-claim",
      message: "An absolute 24-hour volume snapshot does not support a volume trend or quality claim.",
      value: "comparative volume",
    });
  }

  if (LIQUIDITY_QUALITY_PATTERN.test(semanticText)) {
    issues.push({
      code: "unsupported-source-claim",
      message: "The supplied facts do not contain spread, depth, or time-series data needed to characterize liquidity.",
      value: "liquidity quality",
    });
  }

  for (const [pattern, category] of UNGROUNDED_QUALITATIVE_PATTERNS) {
    const match = semanticText.match(pattern)?.[0];
    if (match && !exactPhraseAppearsInSuppliedContext(match, facts)) {
      issues.push({
        code: category.includes("score") ? "unsupported-metric-explanation" : "unsupported-source-claim",
        message: `The supplied facts do not support ${category}.`,
        value: match,
      });
    }
  }

  for (const pattern of UNSUPPORTED_WORD_QUANTITY_PATTERNS) {
    const match = semanticText.match(pattern)?.[0];
    if (match && !exactPhraseAppearsInSuppliedContext(match, facts)) {
      issues.push({
        code: "unsupported-number",
        message: `Quantitative claim ${match} does not match a supplied fact.`,
        value: match,
      });
    }
  }

  for (const [pattern, category] of UNSUPPORTED_FACT_FAMILY_PATTERNS) {
    const match = semanticText.match(pattern)?.[0];
    if (match && !exactPhraseAppearsInSuppliedContext(match, facts)) {
      issues.push({
        code: "unsupported-source-claim",
        message: `The supplied facts do not support ${category}.`,
        value: match,
      });
    }
  }

  const metricDefinitionPattern = /\b(?:growth(?:\s+potential)?\s+(?:index|score)|risk\s+(?:profile|index|score))\b[^.!?\n]{0,120}\b(?:measures?|tracks?|reflects?|uses?|based\s+on|driven\s+by|derived\s+from)\b/i;
  const reversedMetricDefinitionPattern = /\b(?:measures?|tracks?|reflects?|uses?|drives?|determines?)\b[^.!?\n]{0,120}\b(?:growth(?:\s+potential)?\s+(?:index|score)|risk\s+(?:profile|index|score))\b/i;
  if (metricDefinitionPattern.test(semanticText) || reversedMetricDefinitionPattern.test(semanticText)) {
    issues.push({
      code: "unsupported-metric-explanation",
      message: "A supplied score may be quoted, but its methodology was not supplied to the generator.",
    });
  }

  if (/\bno\s+recent\s+(?:developer\s+|github\s+)?activity\b/i.test(semanticText)) {
    issues.push({
      code: "unsupported-developer-claim",
      message: "Missing developer data must be represented as N/A, not interpreted as no recent activity.",
    });
  }

  if (/\b(?:developer|github|commits?)\b/i.test(semanticText)) {
    if (facts.githubCommits4Weeks === undefined || facts.githubCommits4Weeks === null) {
      issues.push({
        code: "unsupported-developer-claim",
        message: "Developer data is unavailable; the output must use N/A or omit the claim.",
      });
    } else if (!exactCommitCountAppears(semanticText, facts.githubCommits4Weeks)) {
      issues.push({
        code: "unsupported-developer-claim",
        message: "Developer claims must quote the supplied four-week commit count exactly.",
      });
    }

    if (/\b(?:developer|github)\b[^.!?\n]{0,80}\b(?:strong|weak|healthy|active|inactive|rising|falling|momentum|growth)\b/i.test(semanticText)
      || /\b(?:strong|weak|healthy|active|inactive|rising|falling|momentum|growth)\b[^.!?\n]{0,80}\b(?:developer|github)\b/i.test(semanticText)) {
      issues.push({
        code: "unsupported-developer-interpretation",
        message: "A commit count does not support a qualitative developer-activity conclusion.",
      });
    }
  }

  const numericClaims = extractNumericClaims(renderedText);
  for (const claim of numericClaims) {
    if (!isSupportedNumericClaim(claim, facts, renderedText)) {
      issues.push({
        code: "unsupported-number",
        message: `Numeric claim ${claim.raw.trim()} does not match the supplied facts.`,
        value: claim.raw.trim(),
      });
    }
  }
  for (const raw of findUnsupportedPlainNumbers(renderedText, numericClaims, facts)) {
    issues.push({
      code: "unsupported-number",
      message: `Numeric claim ${raw} is not a recognized supplied fact or safe label.`,
      value: raw,
    });
  }

  if (hasPriceSensitiveClaim(renderedText, numericClaims)
    && (facts.marketDataSource || facts.marketDataAsOf)) {
    const attribution = formatMarketDataAttribution(facts);
    if (!attribution || !normalizeForExactMatch(renderedText).includes(normalizeForExactMatch(attribution))) {
      issues.push({
        code: "missing-market-attribution",
        message: attribution
          ? `Price-sensitive copy must include the exact attribution: ${attribution}`
          : "Price-sensitive copy requires both a market-data source and an as-of timestamp.",
        value: attribution,
      });
    }
  }

  const deduplicated = Array.from(
    new Map(issues.map((issue) => [`${issue.code}:${issue.value || issue.message}`, issue])).values(),
  );
  return { ok: deduplicated.length === 0, issues: deduplicated };
}
