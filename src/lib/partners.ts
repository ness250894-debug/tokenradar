export type PartnerCategory = "exchange" | "hardware-wallet" | "tax" | "charting";

export interface PartnerAvailability {
  label: string;
  note: string;
  restrictedInUs?: boolean;
}

export interface Partner {
  id: string;
  name: string;
  category: PartnerCategory;
  url: string;
  cta: string;
  shortCta: string;
  description: string;
  disclosure: string;
  availability: PartnerAvailability;
  offer?: string;
  coupon?: string;
  color?: string;
  textColor?: string;
  priority: number;
  enabled: boolean;
}

export const PARTNER_REL = "sponsored noopener noreferrer" as const;

export const PARTNERS: Partner[] = [
  {
    id: "okx",
    name: "OKX",
    category: "exchange",
    url: "https://okx.com/join/66004268",
    cta: "Check OKX markets",
    shortCta: "OKX",
    description: "Exchange venue with access that varies by jurisdiction and asset listing.",
    disclosure: "Paid link: TokenRadar may earn a commission if you sign up through this link.",
    availability: {
      label: "Check local eligibility",
      note: "OKX availability varies by state, country, and asset. Verify local access before depositing funds.",
    },
    color: "#ffffff",
    textColor: "#000000",
    priority: 10,
    enabled: true,
  },
  {
    id: "binance",
    name: "Binance",
    category: "exchange",
    url: "https://www.binance.com/referral/earn-together/refer2earn-usdc/claim?hl=en&ref=GRO_28502_65AUB&utm_source=default",
    cta: "Open Binance",
    shortCta: "Binance",
    description: "Large global exchange with broad asset coverage outside restricted jurisdictions.",
    disclosure: "Paid link: TokenRadar may earn a commission if you sign up through this link.",
    availability: {
      label: "Global, not US",
      note: "This Binance.com partner link is not for US residents. US users must use legally available services in their state.",
      restrictedInUs: true,
    },
    color: "#FCD535",
    textColor: "#000000",
    priority: 20,
    enabled: true,
  },
  {
    id: "bybit",
    name: "Bybit",
    category: "exchange",
    url: "https://www.bybit.com/invite?ref=QONQNG",
    cta: "Open Bybit",
    shortCta: "Bybit",
    description: "Global exchange for eligible non-US jurisdictions.",
    disclosure: "Paid link: TokenRadar may earn a commission if you sign up through this link.",
    availability: {
      label: "Global, not US",
      note: "Bybit does not offer services to US residents. Verify your jurisdiction before using this link.",
      restrictedInUs: true,
    },
    color: "#F7A600",
    textColor: "#ffffff",
    priority: 30,
    enabled: true,
  },
  {
    id: "kucoin",
    name: "KuCoin",
    category: "exchange",
    url: "https://www.kucoin.com/r/rf/FQ67QZ7A",
    cta: "Open KuCoin",
    shortCta: "KuCoin",
    description: "Global exchange for eligible non-US jurisdictions.",
    disclosure: "Paid link: TokenRadar may earn a commission if you sign up through this link.",
    availability: {
      label: "Global, not US",
      note: "KuCoin has restricted US users. Verify your jurisdiction before using this link.",
      restrictedInUs: true,
    },
    color: "#00A277",
    textColor: "#ffffff",
    priority: 40,
    enabled: true,
  },
  {
    id: "ledger",
    name: "Ledger",
    category: "hardware-wallet",
    url: "https://shop.ledger.com/?r=dc06a3bcc173",
    cta: "Buy from Ledger",
    shortCta: "Ledger",
    description: "Hardware wallets for offline private-key storage.",
    disclosure: "Paid link: TokenRadar may earn a commission if you buy through this link.",
    availability: {
      label: "Official store",
      note: "Buy hardware wallets only from official manufacturer channels and verify current shipping availability.",
    },
    color: "#10b981",
    textColor: "#111111",
    priority: 10,
    enabled: true,
  },
  {
    id: "trezor-safe-3",
    name: "Trezor Safe 3",
    category: "hardware-wallet",
    url: "https://affil.trezor.io/aff_c?offer_id=169&aff_id=135555",
    cta: "Buy Trezor Safe 3",
    shortCta: "Trezor",
    description: "Open-source hardware wallet with secure-element protection.",
    disclosure: "Paid link: TokenRadar may earn a commission if you buy through this link.",
    availability: {
      label: "Official store",
      note: "Buy hardware wallets only from official manufacturer channels and verify current shipping availability.",
    },
    color: "#4c1d95",
    textColor: "#ffffff",
    priority: 20,
    enabled: true,
  },
  {
    id: "trezor-bitcoin-only",
    name: "Trezor Bitcoin-only",
    category: "hardware-wallet",
    url: "https://affil.trezor.io/aff_c?offer_id=239&aff_id=135555",
    cta: "View Bitcoin-only Trezor",
    shortCta: "Bitcoin-only",
    description: "Bitcoin-only firmware option for Trezor buyers who prefer a reduced asset surface.",
    disclosure: "Paid link: TokenRadar may earn a commission if you buy through this link.",
    availability: {
      label: "Official store",
      note: "Verify current device model, firmware, and shipping availability on Trezor before buying.",
    },
    color: "#f7931a",
    textColor: "#111111",
    priority: 30,
    enabled: true,
  },
  {
    id: "koinly",
    name: "Koinly",
    category: "tax",
    url: "https://koinly.io/?via=28A9E9E2&utm_source=affiliate",
    cta: "Try Koinly",
    shortCta: "Koinly",
    description: "Crypto tax reporting tool with exchange and wallet import support.",
    disclosure: "Paid link: TokenRadar may earn a commission if you sign up through this link.",
    availability: {
      label: "Tax jurisdictions vary",
      note: "Tax rules vary by country and state. Confirm reports with a qualified tax professional.",
    },
    color: "#eab308",
    textColor: "#111111",
    priority: 10,
    enabled: true,
  },
  {
    id: "coinledger",
    name: "CoinLedger",
    category: "tax",
    url: "https://coinledger.io?fpr=hrykjl",
    cta: "Try CoinLedger",
    shortCta: "CoinLedger",
    description: "Crypto tax reporting tool with exchange imports and tax software exports.",
    disclosure: "Paid link: TokenRadar may earn a commission if you sign up through this link.",
    availability: {
      label: "Tax jurisdictions vary",
      note: "Tax rules vary by country and state. Confirm reports with a qualified tax professional.",
    },
    coupon: "CRYPTOTAX10",
    color: "#eab308",
    textColor: "#111111",
    priority: 20,
    enabled: true,
  },
  {
    id: "tradingview",
    name: "TradingView",
    category: "charting",
    url: "https://www.tradingview.com/?aff_id=165531",
    cta: "Try TradingView",
    shortCta: "TradingView",
    description: "Advanced charting, indicators, and market watchlists.",
    disclosure: "Paid link: TokenRadar may earn a commission if you sign up through this link.",
    availability: {
      label: "Availability varies",
      note: "Verify current plan terms, trials, and regional availability on TradingView.",
    },
    color: "#2962ff",
    textColor: "#ffffff",
    priority: 10,
    enabled: true,
  },
];

export function getPartner(id: string): Partner | undefined {
  return PARTNERS.find((partner) => partner.id === id && partner.enabled);
}

export function getPartnersByCategory(category: PartnerCategory): Partner[] {
  return PARTNERS
    .filter((partner) => partner.enabled && partner.category === category)
    .sort((left, right) => left.priority - right.priority);
}

export function isRestrictedForUsAudience(partner: Partner): boolean {
  return Boolean(partner.availability.restrictedInUs);
}

export function getExchangePartners(options: { includeUsRestricted?: boolean } = {}): Partner[] {
  const partners = getPartnersByCategory("exchange");
  if (options.includeUsRestricted) return partners;
  return partners.filter((partner) => !isRestrictedForUsAudience(partner));
}

export function getExchangeReferralRecords(): { name: string; url: string }[] {
  return getPartnersByCategory("exchange").map((partner) => ({
    name: partner.name,
    url: partner.url,
  }));
}

export function getPartnerLinkAttributes(partner: Partner, placement: string) {
  return {
    target: "_blank",
    rel: PARTNER_REL,
    "data-analytics-id": `partner-${partner.category}-${placement}-${partner.id}`,
    "data-analytics-label": `${partner.name} ${partner.category} ${placement}`,
    "data-partner-id": partner.id,
    "data-partner-category": partner.category,
    "data-partner-placement": placement,
  } as const;
}
