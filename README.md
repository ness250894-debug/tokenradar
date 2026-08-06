# TokenRadar

TokenRadar is a live crypto programmatic SEO and social publishing platform. It builds static token analysis pages from market data, proprietary metrics, AI-generated editorial content, and automated distribution workflows.

**Live:** [tokenradar.co](https://tokenradar.co)

## Source Of Truth

- `README.md` is the GitHub landing page and should stay tracked on `main`.
- `docs/tokenradar/tokenradar.html` and `docs/tokenradar/tokenradar.json` are the comprehensive project reference.
- `docs/readme/readme.html` and `docs/readme/readme.json` are generated from this README for the docs artifact set.
- `TOKENRADAR.md` is retired. Do not recreate it or use it as a source file.

## Current Capabilities

- Generates long-tail token pages for mid-cap and upcoming crypto assets.
- Uses CoinGecko, reference snippets, and local JSON data to ground content.
- Computes proprietary signals such as risk score, growth potential, ATH gap, category strength, and search-intent indicators.
- Produces article JSON under `content/tokens/` and static pages with Next.js export.
- Runs quality gates for content validation, SEO metadata, sitemap coverage, security headers, and static export size.
- Publishes social output to Telegram, X, Instagram, Threads, YouTube Shorts, and TikTok.
- Renders platform-specific Remotion videos with rotating formats, hooks, music, b-roll, and visual recipes.
- Uses Cloudflare Pages for hosting, Cloudflare D1 for the ops ledger, and Cloudflare R2 for media staging.

## Tech Stack

| Layer | Implementation |
|---|---|
| App | Next.js 16 App Router, React 19, TypeScript, static export |
| Styling | Vanilla CSS plus project components |
| Data | CoinGecko API, local JSON stores, generated metrics, reference snippets |
| AI | Gemini 2.5 Flash primary, Claude Haiku 4.5 fallback |
| Video | Remotion, generated b-roll manifests, optional Blender loops |
| Social | X API v2, Telegram Bot API, Instagram Graph API, Threads API, YouTube Data API, TikTok Content Posting API |
| Storage | Git-tracked content/data, GitHub Actions cache/artifacts, monthly GitHub Release snapshots, Cloudflare D1, Cloudflare R2 |
| Hosting | Cloudflare Pages via GitHub Actions |
| Quality | Vitest, ESLint, TypeScript, content validation, Lighthouse CI, PageSpeed Insights, production npm audit |

## Production Flow

1. `daily-refresh.yml` refreshes market data, TGE inputs, reference snippets, metrics, token metadata, OG images, and sitemaps.
2. `daily-content-generation.yml` generates queued articles, runs quality checks, publishes approved content, repairs formatting, validates content, builds, and dispatches deploy.
3. `deploy.yml` validates env, builds the static export, checks output size, deploys to Cloudflare Pages, and reports deployment status.
4. `social-automations.yml` runs market updates, Telegram polls, daily movers, X polls, Threads text prompts, short-form video publishing, D1 maintenance, R2 cleanup, and ops reporting.
5. `video-assets-refresh.yml` maintains the b-roll manifest and Cloudflare R2 media assets.
6. `performance.yml`, `dependency-security.yml`, and Dependabot provide scheduled quality and dependency gates.

TGE discovery uses free RSS sources that are reachable by the project runner: Airdrop Alert, ICO Watch List, CoinTelegraph, Decrypt, and CoinDesk.

## Homepage Data Surfaces

The homepage market panels render generated snapshot data from the latest refresh/build cycle, with interactive browser controls layered on top for watchlists, polls, tabs, and comparisons. Copy on these preview surfaces should stay data-led and avoid visible freshness claims such as `today`, `now`, or `Last updated`; the data itself carries the signal without implying a live tick feed.

## Content Generation Queue

Daily content generation uses launch-only Smart Drip article selection for now: new TGE preview candidates and newly released TGE graduates. Incomplete content hubs, stale refreshes, and large 24h price-swing moves are parked and disabled.

## Maintained Docs

Tracked docs live under `docs/` as paired HTML and JSON artifacts. The top-level registry in `docs/tokenradar` should mention every maintained pair and the public runtime HTML/JSON artifacts.

| Docs | Covers |
|---|---|
| `docs/tokenradar/` | Whole-project product, architecture, workflows, integrations, and operating model |
| `docs/automations/` | Schedules, social routes, diagnostics, credentials, and recurring operations |
| `docs/data-schema/` | JSON contracts, producers, consumers, and validation rules |
| `docs/deployment/` | Static export, Cloudflare Pages deployment, build gates, and diagnostics |
| `docs/design/` | Visual system, layout rules, interaction states, accessibility, and brand constraints |
| `docs/editorial/` | Article standards, factual grounding, quality gates, and review triggers |
| `docs/integrations/` | Provider APIs, credentials, analytics, social publishing, and storage integrations |
| `docs/pipeline/` | Discovery, data harvest, metrics, queue publication, validation, build, and delivery |
| `docs/prompts/` | Prompt inputs, generation constraints, fallback behavior, and output validation |
| `docs/public-video-assets-broll-readme/` | B-roll generation, Blender loops, R2 sync, manifest contract, and pruning |
| `docs/readme/` | Generated representation of this README |
| `docs/seo/` | Static export SEO, metadata, sitemap coverage, structured data, and search QA |
| `docs/testing/` | Vitest inventory, local validation, CI gates, mocking policy, and browser QA |

Public runtime artifacts represented in the docs include `public/admin.html`, `public/_routes.json`, `public/video-assets/broll/manifest.json`, and `public/video-assets/broll/manifest.example.json`.

## Project Structure

```text
src/app/           Next.js routes and static pages
src/components/    Shared UI components
src/lib/           Data, AI, social, storage, SEO, and utility clients
src/video/         Remotion scenes, formats, recipes, and render entrypoints
scripts/           Data, content, docs, deploy, social, video, and reporting automation
content/tokens/    Generated article JSON by token and article type
data/              Token data, metrics, prices, references, queues, logs, and ledgers
public/            Static runtime assets, admin page, routes file, OG images, video assets
docs/              Tracked project documentation artifacts
tests/             Vitest unit and contract tests
.github/workflows/ CI, deploy, refresh, social, video asset, snapshot, and quality workflows
```

## Getting Started

```bash
npm install
npm run dev
npm test
npm run build
```

For docs-only work, run the focused checks instead of a full production build when the change does not affect runtime behavior:

```bash
npx tsx scripts/generate-doc-artifacts.ts --doc readme --check
npx tsx scripts/generate-doc-artifacts.ts --doc tokenradar --check
npx vitest run tests/tokenradar-docs.test.ts tests/testing-contract.test.ts tests/seo-contract-implementation.test.ts
```

## Key Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Start the local Next.js dev server |
| `npm run build` | Run prebuild validation and static export build |
| `npm test` | Run the Vitest suite |
| `npm run lint` | Run ESLint |
| `npx tsx scripts/fetch-crypto-data.ts` | Fetch token data from CoinGecko |
| `npx tsx scripts/compute-metrics.ts` | Calculate risk, growth, ATH, and category metrics |
| `npx tsx scripts/compute-search-intent.ts` | Generate free-data search intent and hype/fundamentals signals |
| `npx tsx scripts/generate-content.ts` | Generate token articles |
| `npx tsx scripts/quality-check.ts --dir data/queue --fix --delete-failures` | Validate and repair queued content |
| `npx tsx scripts/validate-content.ts` | Validate content JSON and generated article integrity |
| `npx tsx scripts/generate-sitemap.ts` | Generate sitemap files |
| `npx tsx scripts/generate-og-images.tsx` | Generate OG images |
| `npx tsx scripts/post-market-updates.ts` | Post market alerts to Telegram and X |
| `npx tsx scripts/post-daily-poll.ts` | Post the rotating Telegram poll |
| `npx tsx scripts/post-daily-movers.ts` | Post the Telegram movers image |
| `npx tsx scripts/post-interactive-daily.ts` | Post the X interactive poll |
| `npx tsx scripts/post-token-comparison.ts` | Publish the shared two-token comparison card |
| `npx tsx scripts/post-threads-daily.ts` | Post text-native Threads prompts |
| `npx tsx scripts/post-video-daily.ts` | Render and publish platform-specific short-form video |
| `npx tsx scripts/refresh-meta-tokens.ts` | Rotate Meta access tokens |
| `npx tsx scripts/generate-doc-artifacts.ts --doc readme` | Regenerate the README HTML/JSON docs pair |
| `npx tsx scripts/generate-doc-artifacts.ts --doc tokenradar` | Regenerate the top-level project docs pair |
| `npx tsx scripts/send-system-report.ts` | Send operational usage and cost reports |

## Social And Video Publishing

Market and video publishing use `generateUnifiedCaptions` in `src/lib/gemini.ts` to request publish-time captions in one structured AI call. The schema is limited to the requested platforms and supports Telegram, X, YouTube, Instagram, Threads, and TikTok.

The production social cadence publishes a two-token comparison card to X and Telegram daily, replacing their former poll slots. The same comparison reaches Instagram and Threads on Monday, Wednesday, and Friday instead of video. YouTube keeps the Mon/Wed/Fri short-form video route. Telegram also publishes **Radar Divergence**, a visual comparison of price momentum, volume participation, and risk. TikTok video posting is disabled in the scheduled workflow; its CLI integration remains available for manual testing.

| Platform | Production schedule (UTC) | Format |
|---|---|---|
| Telegram | Daily at 00:17, 03:17, 12:23, 15:37, 21:23; Mon/Wed/Fri at 18:41; Fri at 16:29 | Brief, watchlist, pulse, token comparison, movers, Radar Divergence, weekly recap |
| X | Daily at 03:17 and 12:23 | Research note; token comparison card |
| Instagram | Sun/Tue/Thu at 00:29; Mon/Wed/Fri at 18:41 | Movers carousel; token comparison card |
| Threads | Tue/Thu at 16:17; Mon/Wed/Fri at 18:41; Fri at 16:29 | Research note; token comparison card; weekly recap |
| YouTube | Mon/Wed/Fri at 18:41 | Short-form video |
| TikTok | Disabled | No scheduled posts |

Short-form video uses `src/lib/video-formats.ts` for editorial rotation, `src/lib/video-recipes.ts` for seeded visual recipes, `src/lib/social-content-generator.ts` for pre-render hook text, and Remotion for platform-specific MP4 renders. Each platform can receive its own hook, thesis, music track, caption, layout, chart style, background system, motion pack, and pacing.

TikTok supports two modes through `TIKTOK_ENV`: `sandbox` uploads to the authorized creator inbox and sends a copy-ready caption to Telegram reporting; `production` uses direct `video.publish`. Missing TikTok credentials fall back to Telegram reporting with the generated video and caption.

Safe dry-run commands:

```bash
npx tsx scripts/post-market-updates.ts --dry-run --platform all
npx tsx scripts/post-market-updates.ts --dry-run --platform telegram --format radar-divergence
npx tsx scripts/post-token-comparison.ts --dry-run --platform all --output-dir tmp/comparison-previews
npx tsx scripts/post-threads-daily.ts --dry-run --force
npx tsx scripts/post-video-daily.ts --dry-run --platform youtube --force --output-dir tmp/video-previews
npx tsx scripts/post-video-daily.ts --dry-run --platform tiktok --force
npx tsx scripts/generate-tiktok-token.ts --env sandbox
npx tsx scripts/generate-tiktok-token.ts --env production
npx tsx scripts/check-tiktok-post-status.ts --publish-id <publish_id>
```

## Environment

Copy `.env.example` to `.env.local` for local work. The full list is documented in `.env.example`; the main groups are:

| Group | Variables |
|---|---|
| Site | `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SITE_NAME`, `NEXT_PUBLIC_CONTACT_FORM_ENDPOINT` |
| AI | `GEMINI_API_KEY`, `GEMINI_THINKING_BUDGET`, `AI_PROMPT_CACHE_DISABLED`, `ANTHROPIC_API_KEY` |
| Market data | `COINGECKO_API_KEY` |
| Deploy | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_ZONE_ID` |
| D1 ops ledger | `D1_DATABASE_ID`, `D1_OPS_LEDGER_DISABLED`, `D1_MEDIA_STAGING_TTL_HOURS` |
| R2 media staging | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL` |
| Telegram | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHANNEL_ID`, `TELEGRAM_REPORT_BOT_TOKEN`, `TELEGRAM_REPORT_CHAT_ID` |
| X | Required: `X_OAUTH2_CLIENT_ID`, `X_OAUTH2_REFRESH_TOKEN`; optional: `X_OAUTH2_CLIENT_SECRET`, `X_BEARER_TOKEN` |
| Meta | `META_APP_ID`, `META_APP_SECRET`, `IG_ACCESS_TOKEN`, `IG_ACCOUNT_ID`, `THREADS_ACCESS_TOKEN`, `THREADS_ACCOUNT_ID` |
| YouTube | `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN` |
| TikTok | `TIKTOK_ENV`, `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_REDIRECT_URI`, `TIKTOK_REFRESH_TOKEN`, `TIKTOK_ACCESS_TOKEN` |
| Analytics | `NEXT_PUBLIC_GA_MEASUREMENT_ID`, `GA4_PROPERTY_ID`, `GSC_SITE_URL`, `PAGESPEED_API_KEY`, `NEXT_PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN` |
| Video assets | `VIDEO_ASSET_PROVIDERS`, `PEXELS_API_KEY`, `PIXABAY_API_KEY`, `BLENDER_BIN`, `REMOTION_CONCURRENCY` |

## GitHub Storage Strategy

- Source code, docs artifacts, curated content, and selected JSON contracts are tracked in Git.
- High-volume generated families are documented by pattern in `docs/tokenradar` instead of listing every token-level file.
- GitHub Actions cache stores npm packages, CoinGecko cache files, and social cooldown state.
- Failure diagnostics are uploaded as short-retention Actions artifacts.
- Monthly data/content/media snapshots are archived as GitHub Releases.
- Cloudflare D1 stores best-effort ops ledger state for automation and R2 media staging.
- Social tracking state is not pushed to `main` after every social run.

## Quality Gates

- `prebuild` validates env, computes search intent, consolidates data, validates content, generates OG images, and regenerates sitemaps.
- `deploy.yml` runs typecheck, lint, tests, build, static output verification, Cloudflare Pages deploy, and deployment reporting.
- `performance.yml` runs Lighthouse CI against static export and PageSpeed Insights against production when `PAGESPEED_API_KEY` is configured.
- `dependency-security.yml` runs production dependency audit gates.
- `tests/setup/no-network.ts` blocks accidental live network calls in Vitest.
- `tests/tokenradar-docs.test.ts` keeps the docs registry, README docs pair, public artifacts, and retired `TOKENRADAR.md` behavior under contract.

## Docs Maintenance

When `README.md` changes, regenerate the generated README docs pair:

```bash
npx tsx scripts/generate-doc-artifacts.ts --doc readme
npx tsx scripts/generate-doc-artifacts.ts --doc readme --check
```

When the whole-project reference changes, regenerate and check `docs/tokenradar`:

```bash
npx tsx scripts/generate-doc-artifacts.ts --doc tokenradar
npx tsx scripts/generate-doc-artifacts.ts --doc tokenradar --check
```

Keep `docs/tokenradar` synchronized when adding tracked HTML/JSON docs, public HTML/JSON runtime artifacts, major workflows, integrations, or generated data families.

## Deployment

Production deploys from GitHub Actions to Cloudflare Pages. Pushes to `main` run the project gates and deploy the static export. Manual local validation is:

```bash
npm run build
npm run deploy:check-files
```
