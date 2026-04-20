import fs from "fs";
import path from "path";

const glossaryPath = path.join(process.cwd(), "data", "glossary.json");
const glossary = JSON.parse(fs.readFileSync(glossaryPath, "utf-8"));

const newItems = [
  {
    "slug": "smart-contract-safety",
    "title": "Smart Contract Safety: How to Avoid Exploits",
    "category": "Security",
    "description": "Understanding the basics of smart contract risks, audit reports, and common vulnerabilities in DeFi protocols.",
    "readTime": "5 min read",
    "updatedAt": new Date().toISOString().split('T')[0],
    "content": "Smart contracts form the backbone of Decentralized Finance (DeFi), executing logic exactly as written. However, if they are written poorly, they can harbor catastrophic bugs.\n\n## Why Smart Contracts Fail\nBecause blockchain transactions are immutable, a bug cannot be simply 'reversed.' If a hacker finds a loophole, they can drain the entire protocol.\n\n## Common Vulnerabilities\n1. **Reentrancy Attacks:** A function makes an external call to an untrusted contract before it resolves its own state, allowing the attacker to recursively call the function and drain funds.\n2. **Front-Running (MEV):** Bots monitor pending transactions and pay higher gas fees to execute their own trades first, profiting at your expense.\n3. **Centralization Risks:** Some contracts have 'owner' backdoors, allowing developers to mint infinite tokens or freeze user funds.\n\n## How to Verify Safety\nAlways look for projects that have undergone rigorous security audits by top-tier firms like CertiK, Hacken, or Trail of Bits. On TokenRadar, our Security Score automatically deducts points from tokens lacking verifiable audits."
  },
  {
    "slug": "circulating-vs-total-supply",
    "title": "Circulating vs. Total Supply Explained",
    "category": "Tokenomics",
    "description": "Learn the vital difference between tokens currently trading on the market and the maximum amount that will ever exist.",
    "readTime": "4 min read",
    "updatedAt": new Date().toISOString().split('T')[0],
    "content": "When evaluating a cryptocurrency's price potential, looking only at its current token price is a beginner's mistake. Supply metrics tell the actual story.\n\n## Circulating Supply\nThe number of coins or tokens that are currently publicly available and circulating in the market. This is the metric used to calculate Market Capitalization.\n\n## Total Supply\nThe total amount of tokens that currently exist, including those locked in staking smart contracts, reserved for the team, or held in treasury wallets.\n\n## Maximum Supply\nThe absolute hard cap on the number of tokens that will *ever* exist (e.g., Bitcoin's 21 million). Not all cryptocurrencies have a max supply, meaning they can be infinitely inflationary.\n\n## Why the Gap Matters\nIf a token has a massive gap between Circulating and Total Supply, it means millions of tokens are waiting to be 'unlocked' and dumped onto the market. TokenRadar tracks 'Emission Schedules' to warn you before heavy supply shocks hit the exchanges."
  },
  {
    "slug": "what-is-staking",
    "title": "What is Staking? Earning Yield in Crypto",
    "category": "Tokenomics",
    "description": "A beginner-friendly breakdown of crypto staking, Proof of Stake networks, and the risks of chasing high APRs.",
    "readTime": "6 min read",
    "updatedAt": new Date().toISOString().split('T')[0],
    "content": "Staking is the crypto equivalent of putting money in a high-yield savings account, but with significantly more variables and risks.\n\n## How Staking Works\nIn Proof of Stake (PoS) blockchains like Ethereum, Solana, or Cardano, 'validators' secure the network by locking up their native tokens. In exchange for providing this security and validating transactions, the network rewards them with newly minted tokens.\n\nAs an average user, you can 'delegate' your tokens to a validator and earn a percentage of that yield.\n\n## Staking in DeFi (Liquidity Mining)\nBeyond securing networks, DeFi protocols often offer 'staking' where you lock their governance token to earn protocol revenue. \n\n## The Risks of High APR\nIf a token offers 10,000% APR for staking, ask yourself: *Where is the yield coming from?* High yields are typically paid out by hyper-inflating the token supply. While your token balance goes up, the price of the token plummets exponentially. TokenRadar's Tokenomics gauge heavily penalizes unsustainable, hyper-inflationary reward structures."
  },
  {
    "slug": "market-cap-explained",
    "title": "Market Cap Explained: The True Valuation Metric",
    "category": "Market Metrics",
    "description": "Why a $0.0001 coin isn't cheap and a $1,000 coin isn't expensive. The fundamentals of Market Capitalization.",
    "readTime": "3 min read",
    "updatedAt": new Date().toISOString().split('T')[0],
    "content": "The most common mistake new investors make is assuming a token priced at $0.01 is 'cheaper' or has more growth potential than a token priced at $100. \n\n## The Formula\n**Market Cap = Current Price × Circulating Supply**\n\n## The Reality Check\nIf Token A costs $0.01 but has a circulating supply of 100 Billion, its Market Cap is $1 Billion.\n\nIf Token B costs $100 but has a circulating supply of only 1 Million, its Market Cap is $100 Million.\n\nToken B is actually 10x smaller and theoretically requires much less capital influx to double in value compared to Token A, despite its higher individual coin price.\n\nAlways use Market Cap, not unit price, when comparing the size and growth ceiling of different projects on TokenRadar."
  }
];

let added = 0;
for (const item of newItems) {
  if (!glossary.find((g: { slug: string }) => g.slug === item.slug)) {
    glossary.push(item);

    added++;
  }
}

fs.writeFileSync(glossaryPath, JSON.stringify(glossary, null, 2));
console.log(`Successfully added ${added} items to glossary.json`);
