# Full Repository Audit Blocks

## Current Iteration

This file is the working contract for the full-repository verification and cleanup pass requested on 2026-05-02.

The request is intentionally broad: verify modularity, naming, lint, integrity, consistency, concurrency, security, race conditions, speed, Telegram notifications, error handling, external connections, documentation, internal linking, APIs, responsive UI, undefined references, UX, SEO, duplication, obsolete code, dead-end code, theme cohesion, logic, functionality, and current best practices.

The repository has a large authored content and data surface, so this audit uses two complementary methods:

- Manual code review for source, scripts, configs, workflows, documentation, and representative content/data patterns.
- Automated validation across the full file set where manual inspection of every generated or content record would be less reliable than schema, link, build, lint, test, and runtime checks.

If an issue found in one file leads to another file, that second file becomes part of the active fix chain and must be reviewed before the block is closed. Unused imports and exports must be checked before removal: remove them when they are truly dead, preserve them when they are public contracts or dynamic entry points, and wire them correctly when the surrounding code clearly intended to use them.

## Scope Rules

### Authored files reviewed directly or through project validation

- Root configs, package metadata, and environment examples
- Root documentation and internal specifications, including ignored local `.md` files present in the workspace
- `.github/workflows`
- `.vscode` project settings
- `src/app`
- `src/components`
- `src/lib`
- `src/video`
- `scripts`
- `tests`
- `content`
- `data`
- `public`

### Files treated as generated, dependency, local secret, or runtime output

These are not normal manual-edit targets:

- `node_modules`
- `.next`
- `.open-next`
- `.wrangler`
- `out`
- `dist-cloudflare`
- `tsconfig.tsbuildinfo`
- files ignored as local caches/logs/quarantine output
- `.env.local`
- plugin or skill cache folders that are not part of the application source

Generated and runtime outputs can still be checked indirectly. For example, sitemap generation, public data mirrors, and build artifacts are validated from source commands rather than edited by hand. `.env.local` is checked only for variable names and presence when needed; secret values must not be copied into docs or final notes.

## Cross-Cutting Criteria Applied To Every Block

Each block is reviewed against the following criteria:

- Modularity: responsibilities should live in the right layer and not leak across UI, data loading, integrations, and automation.
- Naming: files, functions, variables, and exported contracts should be understandable and consistent with neighboring code.
- Lint and TypeScript: no unused imports, unused locals, `not defined` hazards, untyped escape hatches, or stale compiler assumptions unless deliberately scoped.
- Integrity: configs, docs, scripts, content, data, route params, sitemap entries, public mirrors, tests, and runtime consumers should agree.
- Consistency: repeated patterns should use common helpers and avoid one-off logic unless there is a clear reason.
- Concurrency and race conditions: scheduled jobs and posting flows must not double-post, corrupt state, or silently lose partial failures.
- Security: secret handling, user-controlled content rendering, external URLs, fetch behavior, and logs should avoid avoidable exposure or injection risk.
- Performance: repeated data scans, client bundles, rendering paths, retry loops, and generated artifacts should avoid unnecessary work.
- Integrations: Telegram, X, YouTube, CoinGecko, Gemini, IndexNow, GitHub Actions, Cloudflare, and any API wrapper should fail predictably.
- Error handling: recoverable failures need useful messages and hard failures need non-zero exits or explicit reporting.
- Documentation and links: docs should describe commands and workflows that still exist; internal app links should route somewhere real.
- UI/UX and responsive behavior: desktop, tablet, and mobile layouts should avoid overlap, overflow, unreadable text, and broken navigation.
- SEO: metadata, canonical URLs, robots, sitemap output, article semantics, and public content routes should stay coherent.
- Duplication and obsolete code: dead-end code and stale helpers should be removed or documented as deliberate public surface.
- Common sense and best practices: fixes should match the current Next.js, React, TypeScript, and repo patterns rather than introduce unrelated rewrites.

## Audit Blocks

## Block 1: Project Foundation, Config, Dependencies, And Runtime Contracts

### Scope

- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `eslint.config.mjs`
- `next.config.ts`
- `postcss.config.mjs`
- `vitest.config.ts`
- `wrangler.jsonc`
- `.gitignore`
- `.env.example`
- `.env.local` variable names only
- `next-env.d.ts` as generated contract only

### Verification Details

This block verifies script sequencing, toolchain compatibility, dependency hygiene, TypeScript and ESLint expectations, Cloudflare/Next build assumptions, local runtime safety, and environment variable contracts. It also checks whether ignored files line up with what the application actually generates, and whether any dependency upgrades are safe to recommend or apply.

### Completion Criteria

- Lint, TypeScript, and test commands are understood and run where feasible.
- Config files do not contradict the current application structure.
- Environment examples match the code's required configuration names.
- Dependency upgrade recommendations are grounded in local evidence or package metadata checks.

Status: `completed`

## Block 2: App Router Pages, Layouts, Metadata, SEO, And Route Logic

### Scope

- `src/app`
- route-level metadata
- static params and dynamic route behavior
- robots and sitemap route generation

### Verification Details

This block verifies that pages render from valid content/data, route params are guarded, metadata is useful and not stale, SEO routes match public sitemap behavior, and error states are handled without undefined references. It includes user-facing route logic, mobile layout structure, and internal navigation paths that originate from app pages.

### Completion Criteria

- No route-level undefined references or obvious static generation crashes.
- Metadata and canonical behavior are consistent with available content.
- Internal links from page code point at valid routes or intentional external targets.

Status: `completed`

## Block 3: Shared Components, Theme, Interaction States, And Responsive UI

### Scope

- `src/components`
- `src/app/globals.css`
- UI-affecting utility usage in page code

### Verification Details

This block verifies component boundaries, prop names, fallback rendering, client/server component placement, accessibility, stable dimensions, theme consistency, responsive behavior, touch ergonomics, and duplicate UI logic. It checks for mobile/tablet overflow and desktop density issues with browser verification when the app can run locally.

### Completion Criteria

- Components either render safely with missing/empty data or document required props through types.
- No obvious duplicated component logic remains without a reason.
- Main UI paths are checked on desktop, tablet, and mobile viewports where feasible.

Status: `completed`

## Block 4: Libraries, Integrations, Notifications, APIs, And Data Plumbing

### Scope

- `src/lib`
- Telegram notification code
- X, YouTube, CoinGecko, Gemini, IndexNow, and reporting helpers
- schema and formatting utilities

### Verification Details

This block verifies API wrappers, timeout/retry behavior, failure handling, secret usage, input validation, sanitization, logging, reporting, shared utility correctness, and race-condition risk around shared state. Telegram notification paths get explicit attention because a partial failure can look operationally successful while users receive nothing.

### Completion Criteria

- External API clients validate configuration before use and fail with actionable errors.
- Notification/reporting paths distinguish full success, partial success, and failure.
- Shared schemas and utility functions align with their consumers.

Status: `completed`

## Block 5: Automation Scripts, Pipelines, Scheduled Jobs, And Workflows

### Scope

- `scripts`
- `.github/workflows`
- queue and posting state files that scripts read/write

### Verification Details

This block verifies scheduled workflow intent, concurrency locking, posting idempotency, state writes, exit codes, operational logging, build/publish sequencing, and script-to-doc alignment. It checks whether scripts can double-post, skip required content, corrupt JSON, or leave stale state when interrupted.

### Completion Criteria

- Script entry points are clear and non-duplicative.
- Scheduled jobs have concurrency and idempotency safeguards where needed.
- Docs and workflows describe the actual automation behavior.

Status: `completed`

## Block 6: Content, Data, Public Artifacts, And Internal Linking

### Scope

- `content`
- `data`
- `public`
- generated sitemap/robots/public mirror expectations

### Verification Details

This block verifies JSON shape, slug consistency, content schema integrity, missing token relationships, duplicate content records, stale public mirrors, broken internal links, and sitemap coverage. Because this block contains thousands of files, full-file coverage is primarily through schema validators, targeted sampling, route/build checks, and integrity scripts.

### Completion Criteria

- Content validation passes or each failure has a concrete fix.
- Token/content/data relationships used by routes are coherent.
- Public artifacts either match generated source expectations or are documented as generated outputs.

Status: `completed`

## Block 7: Tests, Documentation, Internal Specs, And Communication Surfaces

### Scope

- `tests`
- `README.md`
- `TOKENRADAR.md`
- `AUTOMATIONS.md`
- `DATA_SCHEMA.md`
- `DEPLOYMENT.md`
- `DESIGN.md`
- `EDITORIAL.md`
- `INTEGRATIONS.md`
- `PIPELINE.md`
- `PROMPTS.md`
- `SEO.md`
- `TESTING.md`

### Verification Details

This block verifies that tests still cover the code paths they claim to cover, fixtures match current schema, docs describe real commands, and internal specs do not contradict implementation. It also checks whether ignored local docs contain outdated guidance that could mislead future work.

### Completion Criteria

- Test suite passes or failures are tied to concrete implementation gaps.
- Documentation references existing scripts, environment variables, and routes.
- Internal specs are either accurate or updated with current behavior.

Status: `completed`

## Block 8: Final Verification, Browser Checks, Cleanup, And Upgrade Notes

### Scope

- final lint/type/test/content/build checks
- responsive browser verification
- generated diff inspection
- final recommendations

### Verification Details

This block reruns affected checks after fixes, reviews git diff for accidental generated churn, verifies representative pages in the browser if a local server can run, and captures upgrade recommendations that should be applied now versus deferred. It also records external questions that cannot be answered from local files, such as deployment secrets or third-party account settings.

### Completion Criteria

- Relevant checks have been rerun and results are recorded.
- Browser checks cover representative desktop, tablet, and mobile layouts where feasible.
- The final diff contains only intentional changes.
- Remaining risks or external questions are explicit.

Status: `completed`

## Progress Log

- 2026-05-02: Refreshed this audit tracker for the current requested pass. Initial file inventory found thousands of authored content/data/public files plus generated/runtime folders that will be validated indirectly instead of hand-edited.
- 2026-05-02: Hardened Markdown and Telegram HTML sanitization, added regression tests for unsafe links/attributes, and verified notification formatting keeps allowed Telegram tags while stripping unsafe markup.
- 2026-05-02: Fixed social posting state handling so partial platform failures do not write false success markers, validated platform arguments for market and video posting scripts, and improved the GitHub workflow commit step to avoid no-op push failures and retry state pushes.
- 2026-05-02: Removed test-time side effects from the metrics script, made data consolidation deterministic, regenerated consolidated data blobs and sitemaps, and ignored/cleaned generated token OG images that are recreated by the build.
- 2026-05-02: Corrected documentation for the actual schedule, providers, workflow cadence, testing surface, and current Gemini model usage. Root ignored docs present in the workspace were reviewed and updated even where Git does not track them.
- 2026-05-02: Fixed responsive overflow behavior around the alpha ticker and mobile navigation. Browser verification covered 27 route/viewport combinations: desktop 1440x900, tablet 768x1024, and mobile 390x844 across representative home, upcoming, token, learning, guide, methodology, and contact routes.
- 2026-05-02: Final verification passed: `npm.cmd run lint`, `.\node_modules\.bin\tsc.cmd --noEmit --pretty false`, `.\node_modules\.bin\vitest.cmd run` (9 files, 88 tests), and `npm.cmd run build` (1845 static pages). `npm.cmd run build` still reports that CoinGecko live mover data lacks an authenticated client key for that generator and falls back to local data.
