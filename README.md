# TokenRadar

Data-driven crypto analysis platform with AI-powered content generation, proprietary risk metrics, and automated social publishing.

**Live:** [tokenradar.co](https://tokenradar.co)

## Tech Stack

- **Frontend:** Next.js 15 (static export), TypeScript, Vanilla CSS
- **AI:** Gemini 3.1 Flash Lite (primary), Claude Haiku (fallback)
- **Data:** CoinGecko API (free tier)
- **Hosting:** Cloudflare Pages
- **CI/CD:** GitHub Actions (22+ automated runs/day)
- **Social:** X API v2 (pay-per-use), Telegram Bot API

## Project Structure

```
scripts/           # Automation scripts (data fetching, content gen, social posting)
src/lib/           # Shared libraries (API clients, config, utilities)
src/app/           # Next.js app router pages
content/tokens/    # Generated article JSON files
data/              # Token data, metrics, price histories
tests/             # Vitest unit tests
.github/workflows/ # CI/CD automation
```

## Getting Started

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Run tests
npm test
```

## Key Scripts

| Script | Purpose |
|---|---|
| `npx tsx scripts/fetch-crypto-data.ts` | Fetch token data from CoinGecko |
| `npx tsx scripts/compute-metrics.ts` | Calculate risk scores & growth metrics |
| `npx tsx scripts/generate-content.ts` | Generate AI articles for tokens |
| `npx tsx scripts/post-market-updates.ts` | Post market alerts to X/Telegram |
| `npx tsx scripts/send-report.ts` | Send daily usage/cost reports |

## Environment Variables

Copy `.env.example` to `.env.local` and configure:

| Variable | Required | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | Yes | AI content generation |
| `ANTHROPIC_API_KEY` | Yes | Claude fallback |
| `TELEGRAM_BOT_TOKEN` | Yes | Telegram posting |
| `TELEGRAM_CHANNEL_ID` | Yes | Telegram channel target |
| `X_API_KEY` | For X | X posting |
| `X_API_SECRET` | For X | X posting |
| `X_ACCESS_TOKEN` | For X | X posting |
| `X_ACCESS_SECRET` | For X | X posting |
| `COINGECKO_API_KEY` | No | Optional Pro tier |

## Deployment

Deployed automatically via GitHub Actions to Cloudflare Pages on every push to `main`.

Manual deploy: `npm run build` → Cloudflare Pages.
