/**
 * Token Technical Data — The "Unique Data Pillars" for pSEO guides.
 * Used to provide token-specific security instructions and avoid 'Thin Content' penalties.
 */

export interface TokenTechnical {
  network: string;       // Primary blockchain network (e.g., Ethereum, Solana)
  standard: string;      // Token standard (e.g., ERC-20, SPL, Native)
  gasToken: string;      // Token used for network fees (e.g., ETH, SOL)
  contractAddress?: string; // Verified contract address
  ledgerAppName: string; // The specific app name in Ledger Live
  isSubtoken: boolean;   // Whether it requires a parent account (like SHIB in ETH account)
}

export const TOKEN_TECHNICAL_MAP: Record<string, TokenTechnical> = {
  "bitcoin": {
    network: "Bitcoin",
    standard: "Native",
    gasToken: "BTC",
    ledgerAppName: "Bitcoin",
    isSubtoken: false
  },
  "ethereum": {
    network: "Ethereum",
    standard: "Native (Mainnet)",
    gasToken: "ETH",
    ledgerAppName: "Ethereum",
    isSubtoken: false
  },
  "solana": {
    network: "Solana",
    standard: "Native",
    gasToken: "SOL",
    ledgerAppName: "Solana",
    isSubtoken: false
  },
  "shiba-inu": {
    network: "Ethereum",
    standard: "ERC-20",
    gasToken: "ETH",
    contractAddress: "0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce",
    ledgerAppName: "Ethereum",
    isSubtoken: true
  },
  "pepe": {
    network: "Ethereum",
    standard: "ERC-20",
    gasToken: "ETH",
    contractAddress: "0x6982508145454ce325ddbe47a25d4ec3d2311933",
    ledgerAppName: "Ethereum",
    isSubtoken: true
  },
  "chainlink": {
    network: "Ethereum",
    standard: "ERC-20",
    gasToken: "ETH",
    contractAddress: "0x514910771af9ca656af840dff83e8264ecf986ca",
    ledgerAppName: "Ethereum",
    isSubtoken: true
  },
  "polygon-ecosystem-token": {
    network: "Ethereum",
    standard: "ERC-20",
    gasToken: "ETH",
    contractAddress: "0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0",
    ledgerAppName: "Ethereum",
    isSubtoken: true
  },
  "uniswap": {
    network: "Ethereum",
    standard: "ERC-20",
    gasToken: "ETH",
    contractAddress: "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984",
    ledgerAppName: "Ethereum",
    isSubtoken: true
  },
  "aave": {
    network: "Ethereum",
    standard: "ERC-20",
    gasToken: "ETH",
    contractAddress: "0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9",
    ledgerAppName: "Ethereum",
    isSubtoken: true
  },
  "polkadot": {
    network: "Polkadot",
    standard: "Native",
    gasToken: "DOT",
    ledgerAppName: "Polkadot",
    isSubtoken: false
  },
  "avalanche-2": {
    network: "Avalanche (C-Chain)",
    standard: "Native",
    gasToken: "AVAX",
    ledgerAppName: "Avalanche",
    isSubtoken: false
  },
  "ripple": {
    network: "XRPL",
    standard: "Native",
    gasToken: "XRP",
    ledgerAppName: "XRP",
    isSubtoken: false
  },
  "cardano": {
    network: "Cardano",
    standard: "Native",
    gasToken: "ADA",
    ledgerAppName: "Cardano ADA",
    isSubtoken: false
  },
  "litecoin": {
    network: "Litecoin",
    standard: "Native",
    gasToken: "LTC",
    ledgerAppName: "Litecoin",
    isSubtoken: false
  },
  "dogecoin": {
    network: "Dogecoin",
    standard: "Native",
    gasToken: "DOGE",
    ledgerAppName: "Dogecoin",
    isSubtoken: false
  },
  "bonk": {
    network: "Solana",
    standard: "SPL",
    gasToken: "SOL",
    contractAddress: "DezXAZzbnzG6z9GvE9w8Y4vL9nLqGmqq9sVxy6BC9jQ",
    ledgerAppName: "Solana",
    isSubtoken: true
  },
  "arbitrum": {
    network: "Arbitrum One",
    standard: "ERC-20",
    gasToken: "ETH",
    contractAddress: "0x912ce59144191c1204e64559fe8253a0e49e6548",
    ledgerAppName: "Arbitrum",
    isSubtoken: true
  },
  "optimism": {
    network: "Optimism",
    standard: "ERC-20",
    gasToken: "ETH",
    contractAddress: "0x4200000000000000000000000000000000000042",
    ledgerAppName: "Optimism",
    isSubtoken: true
  },
  "render-token": {
    network: "Solana",
    standard: "SPL",
    gasToken: "SOL",
    contractAddress: "rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof",
    ledgerAppName: "Solana",
    isSubtoken: true
  },
  "tether": {
    network: "Ethereum",
    standard: "ERC-20",
    gasToken: "ETH",
    contractAddress: "0xdac17f958d2ee523a2206206994597c13d831ec7",
    ledgerAppName: "Ethereum",
    isSubtoken: true
  }
};

/** Get the pilot tokens (staged rollout) */
export function getPilotTokenIds(): string[] {
  return Object.keys(TOKEN_TECHNICAL_MAP);
}

/** Get technical details for a token */
export function getTokenTechnical(tokenId: string): TokenTechnical | null {
  return TOKEN_TECHNICAL_MAP[tokenId] || null;
}
