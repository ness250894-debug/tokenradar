export type TopicClusterId = "risk" | "launches" | "wallets" | "taxes" | "intent" | "research";

export interface TopicClusterLink {
  href: string;
  label: string;
}

export interface TopicCluster {
  id: TopicClusterId;
  title: string;
  description: string;
  hub: TopicClusterLink;
  supportingLinks: readonly TopicClusterLink[];
}

export const TOPIC_CLUSTERS: readonly TopicCluster[] = [
  {
    id: "risk",
    title: "Risk analysis",
    description: "Understand TokenRadar scores, liquidity, supply, contracts, and avoidable failure modes.",
    hub: { href: "/learn", label: "Risk learning hub" },
    supportingLinks: [
      { href: "/about#methodology", label: "Scoring methodology" },
      { href: "/learn/liquidity-depth", label: "Liquidity depth" },
      { href: "/learn/what-is-a-rug-pull", label: "Rug-pull checks" },
    ],
  },
  {
    id: "launches",
    title: "Crypto launches",
    description: "Follow token launches using lifecycle labels, source evidence, and confirmation rules.",
    hub: { href: "/upcoming", label: "Launch tracker" },
    supportingLinks: [
      { href: "/search-intent/airdrop", label: "Airdrop intent" },
      { href: "/learn/airdrop-eligibility-and-token-distribution", label: "Airdrop distribution" },
      { href: "/learn/token-unlocks-and-vesting", label: "Unlocks and vesting" },
    ],
  },
  {
    id: "wallets",
    title: "Wallets and custody",
    description: "Compare hardware-wallet security models and prepare safer self-custody transfers.",
    hub: { href: "/best-crypto-hardware-wallets", label: "Hardware wallet comparison" },
    supportingLinks: [
      { href: "/render-token/transfer-to-ledger", label: "Transfer checklist example" },
      { href: "/learn/smart-contract-safety", label: "Smart-contract safety" },
      { href: "/learn/bridge-risk", label: "Bridge risk" },
    ],
  },
  {
    id: "taxes",
    title: "Crypto taxes",
    description: "Organize transaction records, understand common events, and compare software workflows.",
    hub: { href: "/crypto-tax-guide", label: "Crypto tax guide" },
    supportingLinks: [
      { href: "/crypto-tax-guide#taxable-events", label: "Taxable-event matrix" },
      { href: "/crypto-tax-guide#recordkeeping", label: "Recordkeeping checklist" },
      { href: "/crypto-tax-guide#tax-software", label: "Tax software selection" },
    ],
  },
  {
    id: "intent",
    title: "Research intent proxy",
    description: "Explore deterministic attention, fundamentals, hype, supply-risk, and launch signals.",
    hub: { href: "/search-intent", label: "Research Intent Proxy" },
    supportingLinks: [
      { href: "/search-intent/risk", label: "Risk intent" },
      { href: "/search-intent/supply", label: "Supply-risk intent" },
      { href: "/search-intent/news", label: "News attention" },
    ],
  },
  {
    id: "research",
    title: "Original research",
    description: "Review equal-weighted risk distributions and category comparisons derived from tracked data.",
    hub: { href: "/research", label: "Market Risk Index" },
    supportingLinks: [
      { href: "/research#risk-distribution", label: "Risk distribution" },
      { href: "/research#category-comparison", label: "Category comparison" },
      { href: "/research#methodology", label: "Research methodology" },
    ],
  },
] as const;
