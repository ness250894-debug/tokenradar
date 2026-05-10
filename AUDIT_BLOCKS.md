# TokenRadar Full Repository Audit Blocks

## Purpose

This document defines the first-pass audit structure for a full TokenRadar repository review. The audit covers every tracked project file in the Git worktree and follows issues across file boundaries when one fix affects another module, script, data file, generated asset, page, or test.

The phrase "every file" is interpreted as every repository-owned tracked file. Ignored dependency and build artifacts such as `node_modules/`, `.next/`, `.open-next/`, `.wrangler/`, `out/`, `dist-cloudflare/`, local caches, and local secret files are not source-of-truth project files. They are validated indirectly through package locks, build output, reproducibility checks, generated artifact scripts, and security rules. Local secrets such as `.env.local` are not copied into this document or exposed in logs; only key presence and runtime behavior should be validated.

## Repository Snapshot

- Total tracked files at audit start: 3,603.
- Dominant file groups: `data/`, `content/`, `public/`, `src/`, `scripts/`, `skills/`, `tests/`, `.github/`, and root config/docs.
- Dominant formats: JSON, PNG, TSX, TS, Markdown, MP3, TXT, YAML, XML, JavaScript, MJS, JSONC, CSS, `.gitignore`, and `.env.example`.
- Initial Git state: clean.

## Audit Method

Each block has four layers of review:

1. Static structure: naming, modularity, imports/exports, unused code, duplicate logic, obsolete code, route ownership, file placement, type boundaries, and consistency with neighboring modules.
2. Runtime integrity: lint, TypeScript, test coverage, build behavior, generated outputs, API and network failure handling, Telegram/X/YouTube/R2/Meta/Gemini/Coingecko connection assumptions, retry behavior, concurrency, and race risks.
3. Product quality: UI/UX, mobile/tablet/desktop responsiveness, theme consistency, SEO metadata, robots/sitemap behavior, internal linking, content rendering, and dead-end flows.
4. Security and operations: secret handling, environment validation, external API error surfaces, notification safeguards, idempotency, data writes, artifact cleanup, workflow safety, and documentation accuracy.

When an issue is found in one file and the correct fix requires changes elsewhere, the owning block expands to include the dependent files. Fixes must be verified with the narrowest relevant check first and then with the broader project checks when feasible.

## Block 1: Inventory, Ownership, and Generated Boundaries

Files covered:

- Root project metadata: `package.json`, `package-lock.json`, `tsconfig.json`, `eslint.config.mjs`, `next.config.ts`, `postcss.config.mjs`, `vitest.config.ts`, `wrangler.jsonc`, `remotion.config.ts`.
- Git and editor metadata: `.gitignore`, `.vscode/settings.json`.
- Generated and artifact boundaries: `audit-artifacts/`, `public/og/`, sitemaps, robots, generated blobs, generated images, ignored build folders.

Checks:

- Confirm tracked versus ignored source-of-truth boundaries are intentional.
- Confirm generated files are produced by scripts or documented workflows.
- Confirm config naming is consistent and not stale.
- Confirm lint and TypeScript settings are strict enough to catch unused imports, unused parameters, missing definitions, and accidental `any`.
- Confirm lockfile is aligned with `package.json`.

## Block 2: Core App Routes and Metadata

Files covered:

- `src/app/layout.tsx`
- `src/app/page.tsx`
- `src/app/robots.ts`
- Static legal and informational pages.
- Dynamic route pages under `src/app/[token]/`, `src/app/category/[category]/`, `src/app/learn/`, and `src/app/upcoming/`.

Checks:

- Route naming and folder conventions match Next.js app-router expectations.
- Metadata and JSON-LD are present, unique, and coherent.
- Dynamic route params and generated static params are safe and typed.
- Pages handle missing data without runtime crashes or dead ends.
- Internal links are valid and consistent.
- UI works across desktop, tablet, and mobile.
- SEO pages do not produce duplicate canonical or misleading metadata.

## Block 3: Shared UI Components and Theme

Files covered:

- `src/components/**/*.tsx`
- `src/app/globals.css`
- Public images and icons used by these components.

Checks:

- Component APIs are named clearly, typed, and modular.
- Client components use effects, timers, observers, animation loops, and browser APIs safely.
- Components clean up subscriptions, intervals, animation frames, and observers.
- UI states are accessible, responsive, and consistent with the existing visual system.
- Text cannot overflow common mobile and tablet widths.
- Repeated UI logic is factored only where it improves clarity.
- Unused imports and exports are either removed or intentionally used.

## Block 4: Data Loading, Schemas, Formatting, and Markdown

Files covered:

- `src/lib/schemas.ts`
- `src/lib/content-loader.ts`
- `src/lib/markdown.ts`
- `src/lib/article-formatting.ts`
- `src/lib/formatters.ts`
- `src/lib/shared-utils.ts`
- `src/lib/utils.ts`
- JSON data and content consumed by these loaders.

Checks:

- All structured data has schema validation where runtime input can drift.
- Markdown and HTML sanitization are safe.
- Formatting utilities handle empty, invalid, huge, tiny, and missing values.
- Content loaders fail predictably and do not silently create broken routes.
- Duplicated data logic is justified or consolidated.
- Tests cover important parser and formatter edge cases.

## Block 5: External API Clients and Notifications

Files covered:

- `src/lib/coingecko.ts`
- `src/lib/fetch-with-retry.ts`
- `src/lib/gemini.ts`
- `src/lib/meta-client.ts`
- `src/lib/r2-client.ts`
- `src/lib/reporter.ts`
- `src/lib/telegram.ts`
- `src/lib/x-client.ts`
- `src/lib/youtube.ts`
- Related tests and environment validation.

Checks:

- Required environment variables are documented and validated.
- Secrets are not logged.
- HTTP clients use timeouts, retries, clear error classification, and safe fallbacks.
- Telegram notifications handle network failures, malformed payloads, rate limits, Markdown escaping, and missing channels.
- Posting flows are idempotent where duplicate publication would be harmful.
- Concurrency and race conditions are controlled for shared state and posted markers.

## Block 6: Automation, Publishing, and Data Scripts

Files covered:

- `scripts/**/*.ts`
- `scripts/lib/**/*.ts`
- `.github/workflows/*.yml`
- `data/posted*/`, `data/queue/`, `data/references/`, `data/prices/`, generated consolidated blobs.

Checks:

- Script names describe their side effects.
- Scripts validate inputs before writing.
- Concurrent runs cannot corrupt generated data or double-post notifications.
- Temporary files and generated artifacts are cleaned or ignored correctly.
- Workflow schedules and permissions are minimal and explicit.
- Automation docs match actual scripts and environment variables.

## Block 7: Content, Tokens, Internal Linking, and SEO Artifacts

Files covered:

- `content/**/*.json`
- `data/tokens/**/*.json`
- `data/keywords.json`
- `data/glossary.json`
- `data/upcoming-tges.json`
- `public/sitemap*.xml`
- `public/robots.txt`
- `public/.well-known/security.txt`
- `public/ads.txt`

Checks:

- Token slugs, symbols, names, categories, and generated page paths align.
- Internal links point to routes that exist.
- Content files have the required sections for their template.
- Sitemaps include reachable URLs and avoid duplicates.
- Robots and security files are valid and intentional.
- JSON files are valid and schema-consistent.

## Block 8: Video, Audio, and OG Rendering

Files covered:

- `src/video/**/*.tsx`
- `src/video/styles.ts`
- `src/data/audio/*.mp3`
- `public/audio/*.mp3`
- `src/lib/og-renderer.ts`
- `src/lib/og-fetcher.ts`
- `src/lib/movers-generator.tsx`
- `public/og-image.png`
- `public/og/**/*.png`

Checks:

- Video components are deterministic and avoid browser-only assumptions where Remotion renders server-side.
- Audio asset references are valid and not duplicated without reason.
- OG image generation handles long token names, missing logos, and market values.
- Generated images are reproducible and linked by metadata.

## Block 9: Tests and Quality Gates

Files covered:

- `tests/**/*.test.ts`
- `vitest.config.ts`
- Test mocks under `src/lib/mocks/`.

Checks:

- Tests cover the highest-risk behavior in data loading, formatting, notifications, retries, and posting.
- Test names describe behavior, not implementation trivia.
- Mocks remain aligned with real dependencies.
- The suite is deterministic and does not depend on live external APIs.
- Missing coverage is documented when it is not practical to add immediately.

## Block 10: Documentation and Upgrade Review

Files covered:

- `README.md`
- Internal documentation files when present in the worktree.
- Skill files under `skills/`.
- Package versions and dependency usage.

Checks:

- Documentation matches commands, scripts, required env vars, workflows, and generated artifacts.
- Obsolete instructions are removed or updated.
- Skills are scoped and do not conflict with repo code.
- Dependency upgrades are identified with risk notes instead of blind version bumps.
- Any external settings that cannot be verified locally are listed as questions or operational assumptions.

## Verification Commands

Baseline and final verification should use the project-owned checks wherever possible:

- `npm run lint`
- `npm test`
- `npm run build`
- `npm outdated --json`
- Targeted script checks such as `tsx scripts/validate-env.ts`, `tsx scripts/validate-content.ts`, `tsx scripts/consolidate-data.ts`, `tsx scripts/generate-sitemap.ts`, and `tsx scripts/generate-og-images.tsx`.
- Browser checks for representative desktop, tablet, and mobile viewports after app/UI changes.

## Audit Log

### Iteration 1

- Defined audit coverage and block ownership.
- Confirmed Git worktree was clean at the start.
- Confirmed tracked file count and dominant file groups.
- Next step: run baseline automated checks, then inspect and fix issues block by block.

### Iteration 2

- Ran baseline lint, tests, TypeScript, environment validation, content validation, consolidation, sitemap generation, OG generation, and production build.
- Found that the local `npm` shim is broken in this environment, so direct project binaries under `node_modules/.bin/` were used for verification.
- Confirmed `generate-og-images.tsx` and `next build` require network access for remote font/logo fetches; both passed after the network request was approved.
- Found `scripts/quality-check.ts` had a destructive default behavior: running it without `--fix` moved failed tracked articles into quarantine. Restored the moved content and changed quarantine into an explicit `--quarantine` action.
- Aligned ESLint ignores with `.gitignore` scratch-file policy so ignored local `test-*.ts` files do not produce project lint warnings.
- Fixed visible copy issues on category and hardware wallet pages.

### Iteration 3

- Found sitemap coverage gaps for `/learn`, glossary detail pages, contact, privacy, terms, and disclaimer pages. Added those URLs to generated sitemap output.
- Found internal-link generation was using all raw token JSON files, including tokens that do not have routeable static pages. Changed the linker to use routeable token IDs.
- Found common English token names such as `Score`, `Would`, `Gas`, `Just`, `Flow`, and `Safe` being linked as token pages inside articles. Added a shared blocklist in the generator and Markdown renderer.
- Added render-time internal-link validation so stale content links to missing internal routes are unwrapped instead of emitted as broken anchors.
- Added Markdown tests for blocked common-word links and valid learn links.
- Hardened Telegram ops alerts with redaction, 4096-character truncation, and a plain-text fallback when Telegram rejects Markdown.
- Changed Meta token refresh reporting to reuse the central Telegram reporter instead of duplicating direct Telegram API logic.
- Added atomic write helpers and applied them to CoinGecko counters/cache files, consolidated data blobs, sitemap XML, and reporter activity/error logs.
- Queried the npm registry directly because `corepack npm outdated` fails locally with a Corepack signature-key error.

### Iteration 4

- Re-ran the project-owned final checks with `npm.cmd`: lint, tests, full prebuild/build, and dependency currency review.
- Confirmed `npm run build` runs `validate-env`, `consolidate-data`, `validate-content`, `generate-og-images`, `generate-sitemap`, and `next build` successfully when network access is available for Google Fonts and remote OG/logo fetches.
- Confirmed the static export builds 1,932 routes, including token, how-to-buy, price-prediction, transfer-to-ledger, category, learn, legal, and upcoming pages.
- Re-ran `npm outdated --json` against the npm registry. The command exits nonzero because five packages remain outdated, which is expected behavior for `npm outdated`.
- Applied the straightforward patch/minor dependency updates already reflected in `package.json` and `package-lock.json`; left major or migration-sensitive packages for a separate upgrade pass.
- Ran fresh browser checks against the exported `out/` site for 17 representative routes across desktop, tablet, and mobile viewports: 51 route/viewport checks passed with no load errors, no page errors, no local HTTP 4xx/5xx errors, and no horizontal scrollability.
- Refreshed browser evidence in `audit-artifacts/browser-check-results.json`; PNG screenshots were removed to avoid retaining large visual artifacts.
- Found the `AlphaTicker` marquee could inflate horizontal layout metrics even though it was visually clipped. Reworked it into fixed-width rotating ticker items so the page remains non-scrollable horizontally.
- Opened the exported home page in the in-app browser and confirmed the expected title and H1 render.
- Confirmed the remaining browser `networkIssues` entries are aborted route-transition fetches or non-blocking browser/runtime noise, not local missing assets.
- Confirmed the full audit blocks are closed with operational assumptions for live third-party side effects that should not be exercised locally: real Telegram/X/YouTube/Instagram/Threads posting, R2 upload/delete, GitHub secret mutation, Cloudflare Pages deployment, and production IndexNow pings.

## Final Audit Status

Status: complete for the current worktree.

- Block 1: Passed. Source/generated boundaries, lockfile alignment, generated blobs, sitemaps, OG output, and audit artifacts were verified.
- Block 2: Passed. App-router routes, static params, metadata-bearing pages, legal pages, category pages, learn pages, token pages, and upcoming pages build and render.
- Block 3: Passed after fixing `AlphaTicker` layout metrics and hero/mobile overflow risks.
- Block 4: Passed. Data loading, Markdown sanitization, internal-link safety, formatter edge cases, and content validation are covered by tests and final checks.
- Block 5: Passed for local-verifiable behavior. Fetch retry, Telegram sanitization, reporter redaction/truncation/fallback, environment validation, and Meta report routing are verified; live posting remains an operational assumption.
- Block 6: Passed for local-verifiable behavior. Data scripts, generated writes, quality-check quarantine behavior, workflow structure, and final prebuild/build scripts were reviewed; live workflow side effects remain operational assumptions.
- Block 7: Passed. Token/content JSON validated, sitemap output regenerated, routeable token links constrained, and missing internal links are unwrapped at render time.
- Block 8: Passed. OG generation and browser metadata render completed; remote logo fetch warnings for `lab`, `quack-ai`, and `troll-2` are non-blocking renderer fallbacks.
- Block 9: Passed. `npm test` completed with 12 test files and 99 tests passing.
- Block 10: Passed. README/workflow/package review completed; dependency upgrades and deferred migration candidates are documented below.

Final verification on 2026-05-10:

- `npm run lint`: passed.
- `npm test`: passed, 12 test files and 99 tests.
- `npm run build`: passed after approved network access, static export generated 1,932 routes.
- `npm outdated --json`: completed after approved registry access; remaining outdated packages listed below.
- `tsx scripts/validate-env.ts`: passed through `npm run build`.
- `tsx scripts/validate-content.ts`: passed through `npm run build`, 3,216 content files.
- `tsx scripts/consolidate-data.ts`: passed through `npm run build`, 554 routeable tokens consolidated and one non-routeable token skipped.
- `tsx scripts/generate-sitemap.ts`: passed through `npm run build`, 241 main URLs and 1,242 token URLs.
- `tsx scripts/generate-og-images.tsx`: passed through `npm run build`, `public/og/movers.png` regenerated.
- Browser checks: passed, 51 route/viewport checks, evidence in `audit-artifacts/browser-check-results.json`.

### Upgrade Review Snapshot

Dependency currency was checked with `npm outdated --json` against the npm registry on 2026-05-10. The sandboxed first attempt was blocked from registry access; the approved network run completed and reported the remaining candidates below.

Patch or minor candidates applied in the current worktree:

- `next` / `@next/third-parties` / `eslint-config-next`: latest `16.2.6`.
- `react` / `react-dom`: latest `19.2.6`.
- `@aws-sdk/client-s3` / `@aws-sdk/lib-storage`: latest `3.1045.0`.
- `remotion` / `@remotion/cli`: latest `4.0.459`.
- `tailwindcss` / `@tailwindcss/postcss`: latest `4.3.0`.
- `dotenv`: latest `17.4.2`.
- `isomorphic-dompurify`: latest `3.12.0`.
- `lucide-react`: latest `1.14.0`.
- `postcss`: latest `8.5.14`.
- `recharts`: latest `3.8.1`.
- `vitest`: latest `4.1.5`.
- `wrangler`: latest `4.90.0`.
- `zod`: latest `4.4.3`.

Remaining candidates requiring separate migration review:

- `@coingecko/coingecko-typescript`: current `3.1.5`, wanted `3.1.6`, latest `5.1.1`.
- `@types/node`: current `20.19.37`, wanted `20.19.40`, latest `25.6.2`.
- `eslint`: current/wanted `9.39.4`, latest `10.3.0`.
- `marked`: current `17.0.4`, wanted `17.0.6`, latest `18.0.3`.
- `typescript`: current/wanted `5.9.3`, latest `6.0.3`.
