# TokenRadar

Data-driven crypto analysis platform with AI-powered content generation, proprietary risk metrics, and automated social publishing.

**Live:** [tokenradar.co](https://tokenradar.co)

## Tech Stack

- **Frontend:** Next.js 16 (static export), TypeScript, Vanilla CSS
- **AI:** Gemini 2.5 Flash (primary), Claude Haiku 4.5 (fallback)
- **Data:** CoinGecko API (free tier)
- **Hosting:** Cloudflare Pages
- **CI/CD:** GitHub Actions (daily refresh, daily content publication, deploy, and 8 social workflow runs/day)
- **Social:** X API v2 (pay-per-use), Telegram Bot API, Instagram Graph API, Threads API, YouTube Data API
- **Storage:** Cloudflare R2 (media staging for Meta API)

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
| `npx tsx scripts/post-daily-poll.ts` | Post AI-generated TG poll (7 rotating themes) |
| `npx tsx scripts/post-daily-movers.ts` | Post Top 5 Movers image to TG |
| `npx tsx scripts/post-interactive-daily.ts` | Post interactive poll to X |
| `npx tsx scripts/post-video-daily.ts` | Generate and post 60s cinematic video (IG, Threads, YT) |
| `npx tsx scripts/refresh-meta-tokens.ts` | Rotate Meta (IG/Threads) access tokens |
| `npx tsx scripts/send-system-report.ts` | Send daily usage/cost reports |

## Social Publishing

Market and video publishing use `generateUnifiedCaptions` in `src/lib/gemini.ts` to request all publish-time captions in one structured AI call. The function dynamically limits the JSON schema to the requested platforms and supports Telegram, X, YouTube, Instagram, and Threads.

Video hook text is intentionally separate in `src/lib/social-content-generator.ts` because it is needed before the Remotion render. TikTok is not wired yet.

Safe dry-run checks:

```bash
npx tsx scripts/post-market-updates.ts --dry-run --platform all
npx tsx scripts/post-video-daily.ts --dry-run --platform x --force
```

## Environment Variables

Copy `.env.example` to `.env.local` and configure:

| Variable | Required | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | Yes | AI content generation |
| `ANTHROPIC_API_KEY` | Yes | Claude fallback |
| `TELEGRAM_BOT_TOKEN` | Yes | Telegram posting |
| `TELEGRAM_CHANNEL_ID` | Yes | Telegram channel target |
| `X_OAUTH2_CLIENT_ID` | For X | X posting |
| `X_OAUTH2_CLIENT_SECRET` | For X | X posting |
| `X_OAUTH2_REFRESH_TOKEN` | For X | X posting |
| `IG_ACCESS_TOKEN` | For IG | Instagram posting |
| `IG_ACCOUNT_ID` | For IG | Instagram posting |
| `THREADS_ACCESS_TOKEN` | For Threads | Threads posting |
| `THREADS_ACCOUNT_ID` | For Threads | Threads posting |
| `META_APP_ID` | For Meta | Auto-refreshing Meta tokens |
| `META_APP_SECRET` | For Meta | Auto-refreshing Meta tokens |
| `YOUTUBE_CLIENT_ID` | For YT | YouTube Shorts |
| `YOUTUBE_CLIENT_SECRET` | For YT | YouTube Shorts |
| `YOUTUBE_REFRESH_TOKEN` | For YT | YouTube Shorts |
| `R2_ACCOUNT_ID` | For R2 | Cloudflare R2 Media Staging |
| `R2_ACCESS_KEY_ID` | For R2 | Cloudflare R2 Media Staging |
| `R2_SECRET_ACCESS_KEY` | For R2 | Cloudflare R2 Media Staging |
| `R2_BUCKET_NAME` | For R2 | Cloudflare R2 Media Staging |
| `R2_PUBLIC_URL` | For R2 | Cloudflare R2 Media Staging |
| `COINGECKO_API_KEY` | No | Optional Pro tier |

## Deployment

Deployed automatically from GitHub Actions to Cloudflare Pages via `wrangler pages deploy`.

Manual deploy: `npm run build` -> Cloudflare Pages.
