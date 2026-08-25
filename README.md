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
- Publishes scheduled social output to Telegram, X, Instagram, Threads, and YouTube Shorts; TikTok remains available through manual CLI testing.
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
| Storage | Git-tracked content/data, GitHub Actions cache/artifacts, Cloudflare D1, Cloudflare R2 |
| Hosting | Cloudflare Pages via GitHub Actions |
| Quality | Pull-request CI, Vitest, ESLint, TypeScript, content validation, Lighthouse CI, PageSpeed Insights, full-lockfile npm audit |

## Production Flow

1. `ci.yml` is the required pull-request check: typecheck, lint, tests, deterministic build, and rendered SEO QA. Automation can also dispatch it with an explicit `expected_sha`, which must exactly match the workflow's event SHA.
2. `daily-refresh.yml` refreshes market data, TGE inputs, reference snippets, metrics, token metadata, OG images, sitemaps, analytics, and operational reporting.
3. `daily-content-generation.yml` runs **Daily Launch Content** for new TGE previews and newly graduated launch guides. It quality-gates the queue and becomes a successful no-op when no launch content is published; publication runs only for changed token folders.
4. Scheduled generated changes from the refresh and launch-content workflows use unique bot pull requests. Each workflow dispatches CI for the exact bot-branch head SHA, and the trusted publisher records `Required checks` on that SHA only after verifying the successful run. It then squash-merges and dispatches deployment for the exact merged SHA.
5. `deploy.yml` revalidates the selected current-main revision, builds the static export, checks output size, deploys to Cloudflare Pages, and reports deployment status.
6. `social-automations.yml` publishes the configured Telegram, X, Instagram, Threads, and YouTube routes and records authoritative delivery and measurement state in Cloudflare D1.
7. `social-runner-recovery.yml` reacts to failed or cancelled Social Automations completions and can be dispatched manually; it retries only jobs that never acquired a runner.
8. `video-assets-refresh.yml` is manually dispatched to maintain the verified b-roll manifest and Cloudflare R2 media library; it no longer performs unattended deletion on a weekly schedule.
9. `performance.yml`, `dependency-security.yml`, and Dependabot provide performance monitoring, full-lockfile vulnerability auditing, and dependency updates.

TGE discovery uses free RSS sources that are reachable by the project runner: Airdrop Alert, ICO Watch List, CoinTelegraph, Decrypt, and CoinDesk.

## Homepage Data Surfaces

The homepage market panels render generated snapshot data from the latest refresh/build cycle, with interactive browser controls layered on top for watchlists, polls, tabs, and comparisons. Copy on these preview surfaces should stay data-led and avoid visible freshness claims such as `today`, `now`, or `Last updated`; the data itself carries the signal without implying a live tick feed.

## Content Generation Queue

Daily Launch Content uses launch-only Smart Drip article selection: new TGE preview candidates and newly released TGE graduates. Incomplete content hubs, stale refreshes, and large 24h price-swing moves are parked and disabled. A day with no changed launch token folders is an expected successful no-op and does not build, commit, or deploy.

## Maintained Docs

Locally generated docs live under `docs/` as paired HTML and JSON artifacts. The directory is intentionally ignored by Git; regenerate the pairs in a workspace that includes their JSON sources. The top-level registry in `docs/tokenradar` should mention every maintained pair and the public runtime HTML/JSON artifacts.

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
docs/              Locally generated documentation artifacts (Git-ignored)
tests/             Vitest unit and contract tests
.github/workflows/ CI, deploy, refresh, social, video asset, and quality workflows
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
| `npx tsx scripts/refresh-meta-tokens.ts` | Validate and maintain Instagram/Threads access tokens |
| `npx tsx scripts/generate-doc-artifacts.ts --doc readme` | Regenerate the README HTML/JSON docs pair |
| `npx tsx scripts/generate-doc-artifacts.ts --doc tokenradar` | Regenerate the top-level project docs pair |
| `npx tsx scripts/send-system-report.ts` | Send operational usage and cost reports |

## Social And Video Publishing

Market and video publishing use `generateUnifiedCaptions` in `src/lib/gemini.ts` to request publish-time captions in one structured AI call. The schema is limited to the requested platforms and supports Telegram, X, YouTube, Instagram, Threads, and TikTok.

The production social cadence uses platform-specific routes rather than recycled poll/video slots. X publishes a daily research note plus comparisons on Monday, Wednesday, and Friday. Telegram publishes a daily brief, scheduled comparisons and recaps, a Sunday movers card, and **Radar Divergence** on Monday and Wednesday. Instagram receives a Sunday movers carousel and Monday/Wednesday comparison cards; Threads receives Tuesday/Thursday text explainers and a Friday recap. YouTube keeps the Mon/Wed/Fri short-form video route. TikTok posting is disabled in the scheduled workflow; its CLI integration remains available for manual testing.

| Platform | Production schedule (UTC) | Format |
|---|---|---|
| Telegram | Daily at 00:17; Tue/Thu at 15:37; Fri at 16:29; Mon/Wed at 18:41; Sun at 21:23 | Brief, token comparison, weekly recap, Radar Divergence, movers card |
| X | Daily at 03:17; Mon/Wed/Fri at 12:23 | Research note; token comparison card |
| Instagram | Sun at 00:29; Mon/Wed at 18:41 | Movers carousel; token comparison card |
| Threads | Tue/Thu at 16:17; Fri at 16:29 | Text explainer; weekly recap |
| YouTube | Mon/Wed/Fri at 18:47 | Short-form video |
| TikTok | Disabled | No scheduled posts |

Short-form video uses `src/lib/video-formats.ts` for editorial rotation, `src/lib/video-recipes.ts` for seeded visual recipes, `src/lib/social-content-generator.ts` for pre-render hook text, and Remotion for platform-specific MP4 renders. Each platform can receive its own hook, thesis, music track, caption, layout, chart style, background system, motion pack, and pacing.

TikTok supports two modes through `TIKTOK_ENV`: `sandbox` uploads to the authorized creator inbox and sends a copy-ready caption to Telegram reporting; `production` uses direct `video.publish`. Missing TikTok credentials fall back to Telegram reporting with the generated video and caption.

Instagram authentication is explicit. `IG_AUTH_MODE=facebook_login` keeps the Page-linked Graph API flow and the weekly maintenance job converts an eligible Facebook User token to its non-expiring Page token. `IG_AUTH_MODE=instagram_login` routes publishing and metrics through `graph.instagram.com` and renews an unexpired long-lived Instagram User token with `ig_refresh_token`. Change the mode only when `IG_ACCESS_TOKEN` and `IG_ACCOUNT_ID` have been replaced and validated for the same flow.

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
| R2 media staging | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`; optional account telemetry: `CLOUDFLARE_R2_METRICS_API_TOKEN` (Workers R2 Storage Read) |
| Telegram | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHANNEL_ID`, `TELEGRAM_REPORT_BOT_TOKEN`, `TELEGRAM_REPORT_CHAT_ID` |
| X | Required: `X_OAUTH2_CLIENT_ID`, `X_OAUTH2_REFRESH_TOKEN`; optional: `X_OAUTH2_CLIENT_SECRET`, `X_BEARER_TOKEN` |
| Meta | `IG_AUTH_MODE`, `META_APP_ID`, `META_APP_SECRET`, `IG_ACCESS_TOKEN`, `IG_ACCOUNT_ID`, `THREADS_ACCESS_TOKEN`, `THREADS_ACCOUNT_ID` |
| YouTube | `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN` |
| TikTok | `TIKTOK_ENV`, `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_REDIRECT_URI`, `TIKTOK_REFRESH_TOKEN`, `TIKTOK_ACCESS_TOKEN` |
| Analytics | `NEXT_PUBLIC_GA_MEASUREMENT_ID`, `GA4_PROPERTY_ID`, `GSC_SITE_URL`, `PAGESPEED_API_KEY`, `NEXT_PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN` |
| Video assets | `VIDEO_ASSET_PROVIDERS`, `PEXELS_API_KEY`, `PIXABAY_API_KEY`, `BLENDER_BIN`, `REMOTION_CONCURRENCY` |

## GitHub Storage Strategy

- Source code, curated content, and selected JSON contracts are tracked in Git; generated docs artifacts remain local and ignored.
- High-volume generated families are documented by pattern in `docs/tokenradar` instead of listing every token-level file.
- GitHub Actions cache stores npm packages, CoinGecko cache files, and social cooldown state.
- Failure diagnostics are uploaded as short-retention Actions artifacts.
- Cloudflare D1 is authoritative for social delivery and measurement state and also stores automation, attribution, quota, and R2 staging records.
- Social tracking state is not pushed to `main` after every social run.

## Quality Gates

- `prebuild` validates env, computes search intent, consolidates data, validates content, generates OG images, and regenerates sitemaps.
- `ci.yml` provides the `CI / Required checks` pull-request gate: typecheck, lint, tests, build, and rendered SEO QA. Bot publication workflows dispatch the same gate for their exact head SHA; after independently verifying the successful run, the trusted integration job publishes its `Required checks` status to that SHA before squash-merging. The `main` ruleset requires this GitHub Actions status and intentionally does not use a merge queue because the publisher performs an exact-head squash merge.
- `deploy.yml` runs typecheck, lint, tests, build, static output verification, Cloudflare Pages deploy, and deployment reporting.
- `performance.yml` runs Lighthouse CI against static export and PageSpeed Insights against production when `PAGESPEED_API_KEY` is configured.
- `dependency-security.yml` audits the full lockfile, including development and build tooling, at high severity without installing packages or running dependency lifecycle scripts.
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

Keep `docs/tokenradar` synchronized when adding maintained HTML/JSON docs, public HTML/JSON runtime artifacts, major workflows, integrations, or generated data families.

## Deployment

Production deploys from GitHub Actions to Cloudflare Pages. Ordinary pushes to `main` deploy the static export after the project gates. Scheduled publication workflows instead create unique bot pull requests, run CI for the exact proposed SHA, squash-merge, and explicitly deploy the exact merged SHA. Manual local validation is:

```bash
npm run build
npm run deploy:check-files
```
