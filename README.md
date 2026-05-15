# TokenRadar

Data-driven crypto analysis platform with AI-powered content generation, proprietary risk metrics, and automated social publishing.

**Live:** [tokenradar.co](https://tokenradar.co)

## Tech Stack

- **Frontend:** Next.js 16 (static export), TypeScript, Vanilla CSS
- **AI:** Gemini 2.5 Flash (primary), Claude Haiku 4.5 (fallback)
- **Data:** CoinGecko API (free tier)
- **Hosting:** Cloudflare Pages
- **CI/CD:** GitHub Actions (daily refresh, daily content publication, deploy, and platform-aware social automation)
- **Social:** X API v2 (pay-per-use), Telegram Bot API, Instagram Graph API, Threads API, YouTube Data API, TikTok Content Posting API with manual fallback
- **Storage:** Cloudflare R2 (media staging for Meta API), GitHub Actions cache/artifacts, monthly GitHub Release snapshots

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

## GitHub Storage Strategy

- Actions cache stores npm packages, CoinGecko cache files, and social cooldown state.
- Failure diagnostics are uploaded as short-retention Actions artifacts.
- Monthly data/content/media snapshots are archived as GitHub Releases.
- Social tracking state is no longer pushed to `main` after every social run.

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
| `npx tsx scripts/compute-search-intent.ts` | Generate free-data search intent and hype/fundamentals signals |
| `npx tsx scripts/generate-content.ts` | Generate AI articles for tokens |
| `npx tsx scripts/post-market-updates.ts` | Post market alerts to X/Telegram |
| `npx tsx scripts/post-daily-poll.ts` | Post AI-generated TG poll (7 rotating themes) |
| `npx tsx scripts/post-daily-movers.ts` | Post Top 5 Movers image to TG |
| `npx tsx scripts/post-instagram-daily-movers.ts` | Post Daily Movers carousel to IG |
| `npx tsx scripts/post-interactive-daily.ts` | Post interactive poll to X |
| `npx tsx scripts/post-threads-daily.ts` | Post text-native signal prompt to Threads |
| `npx tsx scripts/post-video-daily.ts` | Generate and post 60s cinematic video (all platforms or shorts-only route) |
| `npx tsx scripts/refresh-meta-tokens.ts` | Rotate Meta (IG/Threads) access tokens |
| `npx tsx scripts/send-system-report.ts` | Send daily usage/cost reports |

## Social Publishing

Market and video publishing use `generateUnifiedCaptions` in `src/lib/gemini.ts` to request all publish-time captions in one structured AI call. The function dynamically limits the JSON schema to the requested platforms and supports Telegram, X, YouTube, Instagram, Threads, and TikTok. Platform copy now uses deterministic daily variants from `src/lib/social-variety.ts`, so repeated runs rotate between signal, risk, rotation, watchlist, and conversation-prompt formats.

Video hook text is intentionally separate in `src/lib/social-content-generator.ts` because it is needed before the Remotion render. TikTok is wired as one script with two API flows selected by `TIKTOK_ENV`: `sandbox` uses `video.upload` to upload the MP4 to the authorized creator inbox, stores the returned `publish_id`, and sends the publish id plus copy-ready caption to the Telegram reporting chat for manual release in the TikTok app; `production` uses `video.publish` to send the MP4 and caption directly to TikTok as a full auto-post. If TikTok API credentials are missing, the script falls back to sending the video and copy-ready caption to the Telegram reporting chat. The scheduled video route uses `--platform shorts` so short-form platforms receive the video without adding extra Telegram or X posts. Threads also has a text-native route (`post-threads-daily.ts`) for non-video days, and X posts compare against recent tracker text before publishing to reduce stale repeated structure.

Safe dry-run checks:

```bash
npx tsx scripts/post-market-updates.ts --dry-run --platform all
npx tsx scripts/post-threads-daily.ts --dry-run --force
npx tsx scripts/post-video-daily.ts --dry-run --platform x --force
npx tsx scripts/post-video-daily.ts --dry-run --platform shorts --force
npx tsx scripts/post-video-daily.ts --dry-run --platform tiktok --force
npx tsx scripts/generate-tiktok-token.ts --env sandbox
npx tsx scripts/generate-tiktok-token.ts --env production
npx tsx scripts/check-tiktok-post-status.ts --publish-id <publish_id>
```

## Environment Variables

Copy `.env.example` to `.env.local` and configure:

| Variable | Required | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | Yes | AI content generation |
| `GEMINI_THINKING_BUDGET` | Optional | Gemini 2.5 thinking budget; defaults to `0` to avoid short social copy hitting `MAX_TOKENS` |
| `ANTHROPIC_API_KEY` | Yes | Claude fallback |
| `TELEGRAM_BOT_TOKEN` | Yes | Telegram posting |
| `TELEGRAM_CHANNEL_ID` | Yes | Telegram channel target |
| `TELEGRAM_REPORT_BOT_TOKEN` | Yes | Ops alerts and TikTok manual/inbox reporting |
| `TELEGRAM_REPORT_CHAT_ID` | Yes | Reporting chat target |
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
| `TIKTOK_ENV` | For TikTok | `sandbox` for inbox + TG caption, `production` for direct post |
| `TIKTOK_CLIENT_KEY` | For TikTok | TikTok Content Posting API |
| `TIKTOK_CLIENT_SECRET` | For TikTok | TikTok OAuth token exchange |
| `TIKTOK_REDIRECT_URI` | For TikTok | TikTok OAuth redirect URI, usually `https://tokenradar.co/tiktok/callback` |
| `TIKTOK_REFRESH_TOKEN` | For TikTok | TikTok sandbox/creator refresh token |
| `TIKTOK_ACCESS_TOKEN` | For TikTok | Optional short-lived fallback access token |
| `TIKTOK_PRIVACY_LEVEL` | For TikTok production | Direct post privacy, default `PUBLIC_TO_EVERYONE` |
| `R2_ACCOUNT_ID` | For R2 | Cloudflare R2 Media Staging |
| `R2_ACCESS_KEY_ID` | For R2 | Cloudflare R2 Media Staging |
| `R2_SECRET_ACCESS_KEY` | For R2 | Cloudflare R2 Media Staging |
| `R2_BUCKET_NAME` | For R2 | Cloudflare R2 Media Staging |
| `R2_PUBLIC_URL` | For R2 | Cloudflare R2 Media Staging |
| `COINGECKO_API_KEY` | No | Optional Pro tier |

## Deployment

Deployed automatically from GitHub Actions to Cloudflare Pages via `wrangler pages deploy`.

Manual deploy: `npm run build` -> Cloudflare Pages.
