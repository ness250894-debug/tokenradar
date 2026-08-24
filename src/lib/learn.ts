import { promises as fs } from "fs";
import { existsSync } from "fs";
import { join } from "path";
import { marked, Renderer, type Tokens } from "marked";

export interface LearnItem {
  slug: string;
  title: string;
  description: string;
  category: string;
  readTime: string;
  updatedAt: string;
  content: string;
  level: "Beginner" | "Intermediate";
  tags: string[];
  wordCount: number;
}

interface RawLearnItem {
  slug: string;
  title: string;
  description: string;
  category: string;
  readTime?: string;
  updatedAt: string;
  content: string;
}

export const LEARN_AUTHOR = {
  name: "TokenRadar Research Desk",
  url: "/about#methodology",
};

export const LEARN_REVIEWER = {
  name: "Pavlo Nakonechnyi",
  url: "/authors/pavlo-nakonechnyi",
};

const REVIEWED_AT = "2026-05-11";
const WORDS_PER_MINUTE = 220;

const CATEGORY_TAGS: Record<string, string[]> = {
  DeFi: ["DeFi", "yield", "liquidity"],
  "Portfolio Risk": ["risk management", "stablecoins", "portfolio construction"],
  Security: ["wallet safety", "scam detection", "DeFi risk"],
  Tokenomics: ["supply", "incentives", "valuation"],
  "Market Metrics": ["valuation", "liquidity", "market data"],
};

const INTERMEDIATE_SLUGS = new Set([
  "bridge-risk",
  "crypto-treasury-runway",
  "fully-diluted-valuation-fdv",
  "governance-tokens-and-voting-power",
  "impermanent-loss-explained",
  "liquidity-depth",
  "mev-and-front-running",
  "oracle-risk",
  "smart-contract-safety",
  "stablecoin-depeg-risk",
  "token-burn-mechanics",
  "token-unlocks-and-vesting",
]);

const ARTICLE_EXTENSIONS: Record<string, string> = {
  "what-is-a-rug-pull": `
## Fast Assessment Checklist
Use this checklist before buying a new token, especially one that is promoted through social media, a presale, or a thin-liquidity decentralized exchange pool.

| Check | What to look for | Why it matters |
| --- | --- | --- |
| Liquidity lock | Locked LP tokens or verifiable vesting | Unlocked liquidity can be removed in seconds. |
| Ownership | Renounced ownership or transparent multisig controls | A single owner wallet can change fees, mint supply, or pause transfers. |
| Holder spread | No extreme concentration in a few wallets | Concentrated wallets can dump into retail demand. |
| Contract behavior | No hidden taxes, blacklists, or mint functions | Malicious functions can trap buyers after launch. |
| Source credibility | Public team, audit, and official communication channels | Anonymous teams are not automatically malicious, but the burden of proof is higher. |

## Common Variations
Liquidity rugs are the simplest version: the team pulls the trading pool, and buyers cannot exit without accepting a near-zero price. A soft rug is slower. The team keeps marketing active while insiders sell into new demand, miss roadmap milestones, or quietly abandon development. A honeypot is more technical: users can buy, but contract logic prevents them from selling or charges a punitive exit tax.

## How TokenRadar Applies This
TokenRadar's risk model treats rug-pull risk as a pattern, not a single signal. A token can have an audit and still be risky if liquidity is tiny, supply is concentrated, or volume appears manufactured. The useful question is not "is this safe?" but "what evidence would have to be true for this risk score to improve?" For new tokens, prioritize live liquidity, contract ownership, holder distribution, and whether the token has survived normal selling pressure.

## What To Do Before You Trade
Start with a small test transaction, verify that selling works, and compare the pool depth with the position size you intend to take. If the token would move heavily against you on a normal exit, the liquidity risk alone may be enough reason to pass. Keep screenshots or links to official contract addresses, because scam teams often clone tickers and create lookalike assets.
`,
  "understanding-slippage": `
## Slippage vs. Price Impact
Slippage is the difference between the price you expect and the price you actually receive. Price impact is the amount your own order moves the market because the pool is not deep enough. They often appear together, but they are not the same problem.

| Scenario | Main cause | Better response |
| --- | --- | --- |
| Small liquid trade | Volatility or pending block delay | Use a tight tolerance, such as 0.1% to 0.5%. |
| Large trade in thin pool | Your order consumes too much liquidity | Split the order or avoid the pool. |
| Newly launched token | Volatility, taxes, MEV, or bad pool design | Use extra caution and test exits first. |
| Transaction keeps failing | Tolerance is too tight or liquidity is moving | Recheck the pool instead of blindly raising tolerance. |

## Why High Slippage Can Be Dangerous
Some traders raise slippage tolerance until a transaction succeeds. That can be expensive. A high tolerance gives the market, bots, or malicious token logic more room to fill your order at a worse price. In meme coins and brand-new launches, extreme slippage can also hide transfer taxes or honeypot behavior.

## How TokenRadar Applies This
TokenRadar treats slippage as a market-quality signal. A token with high volume but shallow liquidity can still be hard to trade safely. When evaluating a token, compare volume, liquidity depth, and market cap together. If volume is high but available liquidity is low, the market may be noisy rather than healthy.

## Practical Rules
For large-cap tokens, keep slippage tight and use limit orders where available. For thin decentralized pools, calculate how much of the pool your order represents before submitting. If a trade needs a double-digit slippage setting, treat that as a warning rather than a normal setting. The goal is not just to enter a position; it is to know you can exit without giving up a large share of the trade value.
`,
  "fully-diluted-valuation-fdv": `
## Market Cap and FDV Side by Side
Market cap tells you what the circulating tokens are worth today. FDV tells you what the project would be worth if all possible tokens were already circulating at the current price. The gap between the two is one of the fastest ways to identify future supply pressure.

| Signal | Interpretation |
| --- | --- |
| Market cap near FDV | Most supply is already circulating. Future unlock pressure may be lower. |
| FDV much higher than market cap | A large share of supply is still locked, reserved, or not yet emitted. |
| Low float and high FDV | Price can rise quickly, but future dilution risk is high. |
| Unlock schedule unknown | The valuation is harder to trust because future supply is unclear. |

## Why FDV Alone Can Mislead
A high FDV does not automatically mean a token is bad. Some networks have long emission schedules, strong demand, or locked tokens that are unlikely to hit the market quickly. The risk appears when FDV is high, circulating float is low, unlocks are near, and token utility is not strong enough to absorb new supply.

## How TokenRadar Applies This
TokenRadar compares market cap, total supply, circulating supply, unlock pressure, and category peers. A token with a cheap unit price can still be expensive if the FDV is already pricing in years of growth. Conversely, a high unit price can be reasonable if supply is scarce and circulating ownership is broad.

## Investor Checklist
Before relying on any valuation, ask four questions: what percentage of supply is circulating, when do the next unlocks occur, who receives those unlocks, and what demand source is expected to absorb them? If you cannot answer those questions, the FDV gap should be treated as a risk input rather than a bullish upside story.
`,
  "token-burn-mechanics": `
## Burns Are Supply Events, Not Magic
Token burns can support a scarcity narrative, but they do not create value by themselves. A burn matters most when it is recurring, transparent, tied to real usage or revenue, and large enough to offset emissions.

| Burn type | Stronger when | Weaker when |
| --- | --- | --- |
| Fee burn | Network usage is real and sustained | Fees are subsidized or temporary. |
| Buyback and burn | Funded by protocol revenue | Funded by treasury reserves without new demand. |
| Manual burn | Rules are public and repeatable | Timing depends on marketing cycles. |
| Tax burn | Tax is modest and trading remains liquid | High tax discourages real liquidity. |

## The Net Supply Question
The key question is not "are tokens being burned?" It is "is net supply increasing or decreasing after emissions, unlocks, incentives, and burns?" A project can announce a large burn while still inflating supply through staking rewards or team unlocks.

## How TokenRadar Applies This
TokenRadar evaluates burn mechanics alongside circulating supply, total supply, unlocks, volume, and actual utility. Burns that are tied to real economic activity score better than one-time announcements. A burn can strengthen a narrative, but only if the project also has durable demand.

## Common Mistakes
Do not compare token burns by headline token count. Burning one billion units of a micro-priced token may be less meaningful than burning a small percentage of a scarce supply. Always convert the burn into percentage of supply and market value, then compare it with upcoming emissions.
`,
  "liquidity-depth": `
## Depth Shows Whether You Can Exit
Daily volume tells you how much traded during a period. Liquidity depth tells you how much the market can absorb near the current price. For risk management, depth is often more important than volume because it determines how painful an exit may be.

| Metric | Useful for | Main weakness |
| --- | --- | --- |
| 24h volume | Interest and activity | Can be inflated by wash trading or incentives. |
| Pool liquidity | Available capital for swaps | Can disappear if unlocked or fragmented. |
| Order book depth | Expected slippage around current price | Can change quickly in volatile markets. |
| Spread | Difference between best buy and sell prices | Narrow spread can hide shallow depth. |

## Why Thin Liquidity Is a Security Issue
Thin liquidity turns normal volatility into a major loss event. If a single medium-sized wallet can move the price heavily, holders are exposed to sudden dumps, failed exits, and manipulative candles. Thin pools are also easier to manipulate for screenshots, social posts, and short-lived ranking spikes.

## How TokenRadar Applies This
TokenRadar looks beyond volume and asks whether there is enough real market depth to support the token's valuation. A token can have a strong narrative and still receive a weak risk profile if liquidity is too shallow relative to market cap or holder concentration.

## Practical Rule
Before entering, estimate the price impact of the amount you would need to sell under stress. If your exit would materially move the market, size down or avoid the trade. Liquidity is not just a convenience; it is part of the risk model.
`,
  "smart-contract-safety": `
## What an Audit Can and Cannot Prove
An audit is useful, but it is not a guarantee. It is a snapshot of a specific codebase at a specific time. Contracts can be upgraded, ownership can change, and external dependencies can introduce new risk after the report is published.

| Safety signal | What to verify |
| --- | --- |
| Audit report | Scope, date, severity of findings, and whether fixes were reviewed. |
| Upgradeability | Who can upgrade contracts and under what process. |
| Admin keys | Whether controls are held by a multisig, DAO, or single wallet. |
| Pausing/freezing | Whether user funds or transfers can be restricted. |
| Dependencies | Oracles, bridges, and external protocols the contract relies on. |

## Common Risk Patterns
Many exploits come from predictable categories: reentrancy, oracle manipulation, faulty access controls, unsafe upgrades, and economic attacks that use flash loans. A project can also be technically secure but operationally risky if a small group controls privileged keys.

## How TokenRadar Applies This
TokenRadar treats smart contract safety as part technical, part governance, and part market structure. Audit presence, ownership controls, liquidity quality, and exploit history are more useful together than any single badge. If a protocol holds user funds, the risk standard should be higher than for a simple non-custodial token.

## Practical Review Flow
Start with the official contract address, then verify the source code, audit links, admin controls, and whether the contract is upgradeable. If the project uses a bridge, oracle, or lending market, review those dependencies too. Most users do not need to read every line of Solidity, but they should know who can change the rules after deposits are made.
`,
  "circulating-vs-total-supply": `
## The Three Supply Numbers
Circulating supply is the amount available in the market today. Total supply is the amount that currently exists. Maximum supply is the hard cap, if one exists. These numbers answer different questions, so they should not be treated as interchangeable.

| Supply metric | Best use |
| --- | --- |
| Circulating supply | Current market cap and live valuation. |
| Total supply | Existing tokens, including locked or reserved allocations. |
| Maximum supply | Long-term dilution ceiling, if the protocol has one. |
| Emission schedule | Timing of future supply entering the market. |

## Why Unlock Timing Matters
The market does not only care how many tokens exist. It cares when locked tokens become sellable and who receives them. Team, investor, ecosystem, and staking allocations can behave very differently. A large unlock to long-term ecosystem incentives may be less bearish than a large unlock to early investors who are already deeply in profit.

## How TokenRadar Applies This
TokenRadar evaluates supply gaps with valuation, liquidity, and category context. A token with a large locked supply and shallow liquidity deserves more caution because future emissions can overwhelm demand. A token with most supply circulating may still be risky, but the dilution question is clearer.

## Practical Checklist
Before comparing two tokens, normalize by market cap and FDV rather than unit price. Then check the next unlock date, unlock size as a percentage of circulating supply, and whether the project has real usage that could absorb new tokens. Supply analysis is most useful when it is tied to timing.
`,
  "what-is-staking": `
## Native Staking vs. DeFi Staking
Native staking helps secure a proof-of-stake network. DeFi staking often means locking a token in a protocol contract to receive rewards. The word is the same, but the risk profile can be very different.

| Type | Reward source | Main risk |
| --- | --- | --- |
| Native PoS staking | Network issuance and transaction fees | Validator downtime, slashing, token price volatility. |
| Liquid staking | Native staking plus liquid receipt token | Smart contract risk and peg/liquidity risk. |
| DeFi staking | Protocol fees or token incentives | Unsustainable emissions and contract risk. |
| Liquidity mining | Trading fees plus incentive tokens | Impermanent loss and reward dilution. |

## Where Yield Comes From
Every yield has a source. It can come from real fees, inflation, borrower interest, trading fees, or incentive budgets. High APR is not automatically good; it often means the protocol is paying users with newly issued tokens. If the reward token falls faster than your balance grows, the position can lose value despite a high displayed APR.

## How TokenRadar Applies This
TokenRadar evaluates staking yield against inflation, liquidity, volatility, and token utility. A sustainable yield should be understandable without relying on constant new buyers. If a reward rate looks extreme, check emissions and sell pressure before assuming it is an opportunity.

## Practical Rules
Prefer transparent reward sources, avoid locking periods you do not understand, and account for taxes and withdrawal delays. If you stake through a validator, review uptime, commission, and slashing history. If you stake through a DeFi contract, review audits, admin controls, and whether rewards are paid from real protocol activity.
`,
  "market-cap-explained": `
## Why Unit Price Misleads
A token priced at $0.01 is not automatically cheap, and a token priced at $1,000 is not automatically expensive. Unit price only makes sense when paired with circulating supply. Market cap is the better starting point because it estimates the total value the market assigns to the circulating tokens.

| Token | Price | Circulating supply | Market cap |
| --- | --- | --- | --- |
| Token A | $0.01 | 100 billion | $1 billion |
| Token B | $100 | 1 million | $100 million |

In this example, Token B has the higher unit price but the lower market cap. It may require less new capital to double, assuming similar liquidity and demand.

## Market Cap Is Not Cash In The Bank
Market cap is not the amount of money invested in a token. It is price multiplied by circulating supply. In thin markets, a small trade can change the last price and therefore change the displayed market cap dramatically. That is why liquidity depth and volume must be reviewed alongside valuation.

## How TokenRadar Applies This
TokenRadar uses market cap as a baseline, then compares it with FDV, liquidity, category peers, volatility, and narrative strength. A small market cap can mean upside potential, but it can also mean weak liquidity, poor adoption, or higher manipulation risk.

## Practical Use
Use market cap to compare tokens in the same category, not to make a decision by itself. For example, comparing two Layer 1 networks by market cap can be useful; comparing a stablecoin, a meme coin, and a governance token by market cap alone is less meaningful. Always ask what the market cap is paying for: revenue, users, security, brand, speculation, or future promises.
`,
  "token-unlocks-and-vesting": `
## Unlock Types To Understand
Not all unlocks create the same risk. Team, investor, ecosystem, staking, and community allocations can behave differently after they become liquid.

| Unlock type | What to check | Risk pattern |
| --- | --- | --- |
| Team allocation | Cliff date, vesting length, and public commitments | Selling pressure can rise if team tokens unlock before product traction. |
| Investor allocation | Entry valuation and token discount | Early investors may be deeply in profit even after a price drop. |
| Ecosystem incentives | Program design and recipient quality | Incentives can support growth or attract mercenary farming. |
| Staking emissions | Net supply growth after burns and fees | High emissions can dilute holders even without a one-time unlock. |

## The Size Question
An unlock is more important when it is large compared with circulating supply and daily liquidity. A 2% unlock in a deep market may be absorbed quietly. A 20% unlock in a thin market can dominate trading behavior for weeks.

## How TokenRadar Applies This
TokenRadar treats unlocks as timing risk. The strongest projects make supply schedules easy to verify, explain who receives tokens, and show demand sources that can absorb future emissions. The weakest projects combine low float, high FDV, shallow liquidity, and unclear unlock documentation.

## Practical Checklist
Before buying, compare the next unlock size with circulating supply and liquidity. Then ask whether recipients are long-term contributors or price-sensitive sellers. If a token's valuation depends on supply staying scarce, upcoming unlocks deserve extra weight in the risk score.
`,
  "governance-tokens-and-voting-power": `
## Governance Is A Spectrum
Some governance tokens control real protocol parameters. Others only signal community preference. The difference matters because token value depends on what holders can actually influence.

| Governance feature | Stronger signal | Weaker signal |
| --- | --- | --- |
| Treasury control | Transparent spending votes and multisig execution | Treasury decisions handled off-chain by insiders. |
| Fee control | Holders can direct or capture protocol fees | No revenue path or unclear fee switch. |
| Risk parameters | Votes affect collateral, emissions, or product rules | Votes are symbolic and do not affect contracts. |
| Voter distribution | Broad participation and delegated expertise | A few wallets can decide every proposal. |

## Utility vs. Governance Theater
Governance does not automatically create demand. If a protocol has no durable revenue, no meaningful decisions, and low participation, governance rights may be mostly narrative. A useful token gives holders a reason to care about protocol outcomes beyond short-term speculation.

## How TokenRadar Applies This
TokenRadar reviews governance with concentration, treasury quality, protocol usage, and fee design. A token can have strong governance documents but weak decentralization if founders, investors, or one delegate control the vote.

## Practical Review Flow
Read the last five proposals, not only the tokenomics page. Check who voted, what changed, whether the decision was executed, and whether token holders gained clearer rights or economics. Real governance leaves an on-chain and operational trail.
`,
  "total-value-locked-tvl": `
## TVL Quality Matters
TVL is most useful when deposits are sticky and tied to a real product. It is less reliable when users deposit only to farm incentives or loop borrowed assets.

| TVL pattern | Better interpretation |
| --- | --- |
| Stable TVL with organic fees | Users may be finding durable utility. |
| TVL rising only during reward campaigns | Growth may reverse when incentives end. |
| TVL concentrated in one asset | Protocol risk depends heavily on that asset's liquidity and price. |
| Recursive lending loops | Headline TVL can overstate distinct user demand. |

## TVL Is Not Revenue
A protocol can hold billions in deposits and still earn little revenue. Deposits show capital entrusted to the system; fees show economic activity. Strong analysis compares TVL with revenue, users, retention, and risk.

## How TokenRadar Applies This
TokenRadar treats TVL as a context metric, not a standalone score. For lending protocols, TVL should be compared with utilization and bad debt risk. For DEXs, it should be compared with volume and fee generation. For bridges, it should be compared with security assumptions and withdrawal liquidity.

## Practical Checklist
Ask where TVL comes from, how expensive it is to retain, and whether it leaves when rewards decline. Durable TVL is useful. Rented TVL can disappear quickly and make a protocol look healthier than it is.
`,
  "impermanent-loss-explained": `
## A Simple Way To Think About It
Liquidity providers sell a little of the asset that rises and buy a little of the asset that falls because the pool must keep its ratio balanced. That automatic rebalancing is useful for traders but can hurt providers when prices diverge.

| Pool type | Typical IL risk |
| --- | --- |
| Stablecoin pair | Lower, assuming both assets keep their peg. |
| Blue-chip volatile pair | Moderate, depending on volatility and fee income. |
| New token pair | High, especially if one asset trends strongly. |
| Concentrated liquidity position | Can be higher if price leaves the chosen range. |

## When Fees Can Help
Fees are the compensation for taking liquidity risk. A pool with high real volume and moderate volatility can outperform holding. A pool with low volume, high volatility, or incentive-token APR can underperform even when the dashboard shows attractive yield.

## How TokenRadar Applies This
TokenRadar reads liquidity incentives with market quality. High yield is less attractive if rewards are inflationary, pool depth is thin, or one side of the pair has weak demand. The best liquidity programs usually have transparent fee generation and realistic reward schedules.

## Practical Rule
Before depositing, compare the expected fee income with a realistic price-movement scenario. If you would be unhappy owning more of the weaker asset after a drawdown, the pool is probably not a good fit.
`,
  "oracle-risk": `
## Where Oracle Attacks Show Up
Oracle risk is most dangerous in protocols that make automated decisions from price data. Lending markets, synthetic assets, derivatives, and collateralized stablecoins are especially sensitive.

| Risk source | What can go wrong |
| --- | --- |
| Thin reference markets | Attackers can move the price used by the oracle. |
| Stale updates | Contracts act on old prices during volatility. |
| Single data source | One bad source can corrupt the whole system. |
| Weak circuit breakers | The protocol keeps operating when data is clearly abnormal. |

## Good Oracle Design
Stronger systems use multiple data sources, time-weighted prices, sanity checks, fallback logic, and clear emergency procedures. No oracle design removes all risk, but resilient designs make manipulation more expensive and easier to detect.

## How TokenRadar Applies This
TokenRadar treats oracle design as part of smart contract safety. A protocol can be audited and still have oracle risk if its data assumptions are weak. For tokens tied to lending, leverage, or synthetic assets, oracle quality affects the entire risk profile.

## Practical Checklist
Check which oracle provider is used, how often prices update, whether the feed uses deep markets, and what happens if the feed fails. If the project cannot explain this clearly, the risk is probably not being managed clearly.
`,
  "bridge-risk": `
## Bridge Models
Different bridges make different tradeoffs. Some rely on multisigs, some on validator sets, some on light clients, and some on liquidity networks. The safest design depends on the assets, chain pair, and operational controls.

| Bridge model | Main dependency |
| --- | --- |
| Lock and mint | Custody and accounting of locked collateral. |
| Liquidity network | Liquidity providers and rebalancing. |
| Validator bridge | Honest majority or threshold signatures. |
| Light-client bridge | Correct verification of another chain's state. |

## Why Wrapped Assets Carry Extra Risk
When you hold a bridged asset, you hold exposure to the original asset plus the bridge mechanism. If the bridge fails, the wrapped token can lose backing even if the underlying token is fine.

## How TokenRadar Applies This
TokenRadar treats bridge dependency as a security and liquidity signal. A token with most liquidity on a bridged representation may be more fragile than it looks. Bridge history, audits, validator decentralization, and withdrawal depth all matter.

## Practical Checklist
Use official links, verify token contracts, and avoid bridging more than needed for the task. For larger amounts, test a small transfer first and confirm the destination asset has enough liquidity to exit.
`,
  "mev-and-front-running": `
## Common MEV Patterns
MEV is not always malicious, but users usually feel it through worse execution.

| Pattern | What happens |
| --- | --- |
| Sandwich attack | A bot buys before your trade and sells after it. |
| Back-running | A bot trades immediately after a transaction that changes price. |
| Liquidation capture | Searchers compete to liquidate risky borrowing positions. |
| Arbitrage | Bots equalize prices across pools or exchanges. |

## Why Slippage Settings Matter
A high slippage tolerance gives sandwich bots more room to extract value. Thin pools and large trades are easier targets because a single swap moves the price more.

## How TokenRadar Applies This
TokenRadar connects MEV risk to liquidity depth, volatility, and trade size. A token may look liquid by volume but still expose users to poor execution if the actual pool depth is weak.

## Practical Defense
Use limit orders or protected routing when available, keep slippage tight for liquid assets, split large swaps carefully, and avoid trading new tokens during chaotic launch windows unless you understand the execution risk.
`,
  "stablecoin-depeg-risk": `
## Types Of Stablecoins
Stablecoin design affects depeg risk. Fiat-backed, crypto-backed, algorithmic, and yield-bearing stablecoins have different failure modes.

| Type | Main thing to verify |
| --- | --- |
| Fiat-backed | Reserve quality, audits, redemption access, and banking partners. |
| Crypto-backed | Collateral ratio, liquidation design, and oracle quality. |
| Algorithmic | Whether demand can survive without reflexive incentives. |
| Yield-bearing | Source of yield and liquidity during withdrawals. |

## Depeg Warning Signs
Watch for widening spreads, redemption delays, declining liquidity, reserve uncertainty, large outflows, and unusual borrowing rates. A small depeg can be temporary, but the context matters.

## How TokenRadar Applies This
TokenRadar treats stablecoins as risk assets, not cash equivalents by default. Peg stability, backing transparency, liquidity, chain exposure, and counterparty risk all affect how defensive a stablecoin position really is.

## Practical Rules
Diversify stablecoin exposure, understand where redemption happens, and avoid assuming that on-chain liquidity equals full backing. During stress, the best stablecoin is not always the one with the highest yield; it is the one with the clearest path back to par.
`,
  "crypto-treasury-runway": `
## Treasury Quality Beats Treasury Size
A large treasury can still be weak if it is mostly the project's own illiquid token. A smaller treasury with cash, stablecoins, and liquid assets may provide more real runway.

| Treasury factor | Why it matters |
| --- | --- |
| Liquid reserves | Funds that can pay contributors without crashing the token. |
| Native-token concentration | Selling treasury tokens can pressure price and confidence. |
| Burn rate | Monthly expenses determine how long reserves last. |
| Revenue | Real fees can extend runway and reduce reliance on token sales. |

## Runway And Token Price
Weak runway can become a market risk. If a team must sell tokens to fund operations, holders face dilution or sell pressure. If the team cuts spending too aggressively, product momentum can slow.

## How TokenRadar Applies This
TokenRadar reads runway alongside development activity, revenue, liquidity, and unlock schedules. A project with high spending and weak reserves needs stronger growth evidence than a project with disciplined costs and clear revenue.

## Practical Checklist
Review treasury disclosures, governance spending proposals, grant programs, revenue dashboards, and token sale history. If there is no treasury transparency, assume less certainty in the risk model.
`,
  "airdrop-eligibility-and-token-distribution": `
## Airdrops Are Tokenomics Events
An airdrop is not just a marketing campaign. It determines who owns early supply, how much float enters the market, and whether recipients have a reason to stay after claiming.

| Design choice | Better outcome |
| --- | --- |
| Usage-based eligibility | Rewards users who created real protocol activity. |
| Anti-sybil filters | Reduces farming by duplicate wallets. |
| Vesting or staged claims | Limits immediate sell pressure. |
| Clear utility | Gives recipients a reason to hold or participate. |

## Hidden Risks
Airdrops can create heavy sell pressure if most recipients see the token as free money. They can also disappoint users if eligibility rules are unclear or if insiders receive a large share before the community.

## How TokenRadar Applies This
TokenRadar reviews airdrops through distribution quality, float, FDV, unlock timing, and post-launch liquidity. A broad airdrop can improve decentralization, but only if token design and governance support long-term participation.

## Practical Checklist
Check claim deadlines, phishing risk, official contract addresses, vesting, insider allocations, and whether the token has actual use after launch. Never connect a wallet to a claim site from an unverified link.
`,
};

function getGlossaryPath(): string {
  return join(process.cwd(), "data/glossary.json");
}

function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/\[[^\]]+\]\([^)]+\)/g, " ")
    .replace(/[>#*_|\-]/g, " ");
}

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtmlAttribute(value: string): string {
  return escapeHtmlText(value)
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function stripDangerousHtmlBlocks(markdown: string): string {
  return markdown
    .replace(/<\s*(script|style|iframe|object|embed|link|meta|base)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|style|iframe|object|embed|link|meta|base)[^>]*\/?\s*>/gi, "");
}

function sanitizeMarkdownHref(href: string): string | null {
  const trimmed = href.trim();
  if (!trimmed) return null;
  if (/^#[A-Za-z0-9_-]+$/.test(trimmed)) return trimmed;
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return trimmed;

  try {
    const url = new URL(trimmed);
    if (url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:") {
      return url.toString();
    }
  } catch {
    return null;
  }

  return null;
}

function createLearnMarkdownRenderer(): Renderer {
  const renderer = new Renderer();

  renderer.html = () => "";

  renderer.link = function ({ href, title, tokens }: Tokens.Link): string {
    const label = String(renderer.parser.parseInline(tokens));
    const safeHref = sanitizeMarkdownHref(href);
    if (!safeHref) return label;

    const attrs = [`href="${escapeHtmlAttribute(safeHref)}"`];
    if (title) attrs.push(`title="${escapeHtmlAttribute(title)}"`);
    if (/^https?:\/\//i.test(safeHref)) {
      attrs.push('target="_blank"', 'rel="noopener noreferrer"');
    }

    return `<a ${attrs.join(" ")}>${label}</a>`;
  };

  renderer.image = function ({ href, title, text }: Tokens.Image): string {
    const safeSrc = sanitizeMarkdownHref(href);
    if (!safeSrc || safeSrc.startsWith("mailto:") || safeSrc.startsWith("#")) return "";

    const attrs = [
      `src="${escapeHtmlAttribute(safeSrc)}"`,
      `alt="${escapeHtmlAttribute(text || "")}"`,
    ];
    if (title) attrs.push(`title="${escapeHtmlAttribute(title)}"`);

    return `<img ${attrs.join(" ")}>`;
  };

  return renderer;
}

export async function learnMarkdownToHtml(markdown: string): Promise<string> {
  const rawHtml = await marked.parse(stripDangerousHtmlBlocks(markdown.trim()), {
    renderer: createLearnMarkdownRenderer(),
    gfm: true,
    breaks: false,
  });

  return rawHtml.replace(/<h([23])>(.*?)<\/h\1>/gi, (_match, level, innerHtml) => {
    const textContent = innerHtml.replace(/<[^>]*>?/gm, "");
    const id = textContent.toLowerCase().replace(/[^\w]+/g, "-").replace(/^-+|-+$/g, "");
    return `<h${level} id="${id}">${innerHtml}</h${level}>`;
  });
}

export function getWordCount(markdown: string): number {
  return (stripMarkdown(markdown).match(/\b[\w']+\b/g) || []).length;
}

export function getReadTime(markdown: string): string {
  const minutes = Math.max(1, Math.ceil(getWordCount(markdown) / WORDS_PER_MINUTE));
  return `${minutes} min read`;
}

function getLevel(slug: string): LearnItem["level"] {
  return INTERMEDIATE_SLUGS.has(slug) ? "Intermediate" : "Beginner";
}

function normalizeLearnItem(item: RawLearnItem): LearnItem {
  const extension = ARTICLE_EXTENSIONS[item.slug]?.trim();
  const content = extension ? `${item.content.trim()}\n\n${extension}` : item.content.trim();
  const wordCount = getWordCount(content);
  const baseTags = CATEGORY_TAGS[item.category] || ["crypto education"];

  return {
    ...item,
    content,
    updatedAt: extension ? REVIEWED_AT : item.updatedAt,
    readTime: getReadTime(content),
    level: getLevel(item.slug),
    tags: Array.from(new Set([...baseTags, item.title.split(":")[0].toLowerCase()])),
    wordCount,
  };
}

export async function getLearnItems(): Promise<LearnItem[]> {
  const filePath = getGlossaryPath();
  if (!existsSync(filePath)) return [];

  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const data = JSON.parse(raw) as RawLearnItem[];
    if (!Array.isArray(data)) return [];
    return data.map(normalizeLearnItem);
  } catch (error) {
    console.error("Failed to load learn items", error);
    return [];
  }
}

export async function getLearnItem(slug: string): Promise<LearnItem | null> {
  const items = await getLearnItems();
  return items.find((item) => item.slug === slug) || null;
}

export function getRelatedLearnItems(items: LearnItem[], current: LearnItem, limit = 3): LearnItem[] {
  return items
    .filter((item) => item.slug !== current.slug)
    .map((item) => ({
      item,
      score:
        (item.category === current.category ? 3 : 0) +
        item.tags.filter((tag) => current.tags.includes(tag)).length,
    }))
    .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title, "en-US"))
    .slice(0, limit)
    .map(({ item }) => item);
}
