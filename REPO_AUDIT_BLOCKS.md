# Full Repository Audit Blocks

## Purpose

This file is the working contract for the full-repository verification and cleanup pass requested on 2026-04-24.

The goal is not to perform a shallow lint sweep. The goal is to walk the project in blocks, verify behavior and structure, fix issues that are clearly actionable from local context, and document follow-on risks or external dependencies when a fix cannot be fully validated from inside the repo.

The review criteria for every block include:

- Modularity and separation of concerns
- Naming clarity and consistency
- Lint and TypeScript hygiene
- Integrity between files, configs, scripts, data, and UI
- Internal consistency and shared conventions
- Concurrency, race conditions, and timing-sensitive behavior
- Security and secret-handling risks
- Error handling and fallback behavior
- External connections and integration safety
- Documentation accuracy and internal linking
- API contracts and consumer compatibility
- Responsive behavior across mobile, tablet, and desktop layouts
- "`not defined`" and undefined-state risks
- UI/UX quality and common-sense review
- Duplications, obsolete code, and dead-end code paths
- Theme cohesion and presentational consistency
- Logic and functionality correctness
- Best-practice alignment with the current stack where practical
- Upgrade opportunities that can be safely recommended or applied

## Scope Rules

### Files actively reviewed and eligible for cleanup

- Root configs and docs
- `src/app`
- `src/components`
- `src/lib`
- `src/video`
- `scripts`
- `tests`
- `.github/workflows`
- `content`
- `data`
- `public`

### Files treated as generated or dependency output

The repo contains directories such as `node_modules`, `.next`, `out`, `dist-cloudflare`, and `.open-next`.

These are not appropriate targets for manual refactors because they are generated or vendor-managed. They will be checked indirectly for consistency with the authored source and configuration, but they should not be hand-edited unless a task specifically requires regenerating them from source.

### Validation philosophy

If one fix reveals a second-order issue in another file, that second file becomes part of the active fix chain and must be handled before the block is considered complete.

Unused imports and exports are not removed blindly. Each one must be verified:

- Remove it when it is truly unused or misleading.
- Keep it if it is part of a public contract, dynamic usage path, or near-term intended extension.
- Wire it correctly if the code clearly intended to use it but currently does not.

## Audit Blocks

## Block 1: Project Foundation, Config, and Runtime Contracts

### Scope

- `package.json`
- `tsconfig.json`
- `eslint.config.mjs`
- `next.config.ts`
- `postcss.config.mjs`
- `vitest.config.ts`
- `wrangler.jsonc`
- environment validation and shared configuration files

### What this block verifies

- Package script correctness and sequencing
- Dependency relevance, upgrade pressure, and unused packages signals
- Lint, TypeScript, build, and test configuration alignment
- Environment variable contracts and runtime safety
- Cross-file assumptions between local dev, build, and deployment
- Whether the project’s tooling still matches the current Next.js and React conventions in use

### Completion criteria

- No obvious config drift
- No conflicting script behavior
- Config names and exports are consistent
- Safety notes captured for any setting that depends on external platform configuration

Status: `completed`

## Block 2: App Router Pages, Layouts, Metadata, and Route Logic

### Scope

- `src/app`

### What this block verifies

- Route composition and layout boundaries
- Metadata generation, SEO basics, and robots/sitemap consistency
- Static and dynamic page logic
- Parameter validation and undefined-state handling
- Broken assumptions between route files and content/data loaders
- Page-level UX, mobile stacking, and semantic structure

### Completion criteria

- No obvious route-level crashes or undefined references
- Route-specific data access is guarded
- Layout and metadata behavior remain coherent across pages

Status: `completed`

## Block 3: Shared Components, Design Consistency, and Responsive UI

### Scope

- `src/components`
- shared styles in `src/app/globals.css`

### What this block verifies

- Component modularity and prop design
- Naming consistency and dead prop detection
- Accessibility, interaction states, and defensive rendering
- Duplicate UI logic that should be consolidated
- Tablet/mobile behavior and overflow risks
- Theme consistency and common-sense UX details

### Completion criteria

- No obvious duplicate or dead-end component paths
- Components fail gracefully on missing data
- Responsive issues are fixed or documented with exact blockers

Status: `completed`

## Block 4: Libraries, Integrations, Notifications, and Data Plumbing

### Scope

- `src/lib`

### What this block verifies

- API wrappers and retry behavior
- Telegram/X/YouTube/reporting integrations
- Notification integrity and failure modes
- Connection handling, timeout behavior, and race-condition risk
- Schema alignment, sanitization, and parsing safety
- Shared utility correctness and naming

### Completion criteria

- Integration clients handle expected failure modes sensibly
- Shared utilities do not hide unsafe assumptions
- Notification paths are verified for obvious operational gaps

Status: `completed`

## Block 5: Automation Scripts, Content Pipeline, and Scheduled Workflows

### Scope

- `scripts`
- `.github/workflows`

### What this block verifies

- Script entrypoints and sequencing
- Cron/workflow intent versus actual implementation
- Concurrency hazards in posting, queue processing, and data refresh jobs
- Error reporting and exit behavior
- Whether automation can corrupt state, double-post, or silently fail
- Operational compatibility with the documented environment

### Completion criteria

- Script responsibilities are clear and non-duplicative
- High-risk automation flows are guarded against obvious race conditions
- Workflow-doc-script alignment is restored where needed

Status: `completed`

## Block 6: Content, Data, Public Artifacts, and Internal Linking

### Scope

- `content`
- `data`
- relevant mirrored assets under `public`

### What this block verifies

- Schema integrity and content shape consistency
- Broken internal links, missing slugs, or mismatched content/public mirrors
- Duplicate, stale, or dead-end content
- Publicly served data artifacts matching source expectations
- Token/content relationships used by the app

### Completion criteria

- No obvious content/data integrity mismatches that break authored pages
- Internal linking is consistent with current route structure
- Public mirrors are not silently diverging from source truth where that matters

Status: `completed`

## Block 7: Tests, Documentation, and Project Communication Surfaces

### Scope

- `tests`
- root markdown docs such as `README.md`, `DEPLOYMENT.md`, `TESTING.md`, `INTEGRATIONS.md`, and related guides

### What this block verifies

- Test coverage relevance versus current code
- Broken or stale test assumptions
- Documentation truthfulness and internal references
- Whether the docs still describe the actual scripts, workflows, and feature set

### Completion criteria

- Tests align with the current implementation
- Docs do not instruct broken commands or outdated flows
- Important operational gaps are called out clearly

Status: `completed`

## Block 8: Final Verification, Browser Checks, and Upgrade Recommendations

### Scope

- Lint, tests, selected runtime checks, and browser-based verification

### What this block verifies

- That the fixes do not introduce new lint or test regressions
- That important pages still render
- That responsive layouts behave sensibly on desktop, tablet, and mobile
- That upgrade recommendations are grounded in observed code rather than generic advice

### Completion criteria

- Lint and tests run, or failures are documented with exact causes
- Browser verification is completed for the main UI paths that can be exercised locally
- Upgrade recommendations are specific and actionable

Status: `completed`

## Progress Log

- 2026-04-24: Audit tracker created and block structure defined.
- 2026-04-24: Block 1 completed. Verified config/runtime alignment, validated lint/typecheck/build/test flow, and removed stale workflow/docs assumptions around deploy timing and concurrency.
- 2026-04-24: Block 2 completed. Fixed route metadata, static params, related-token mapping, and upcoming-token handling that produced noisy zero-market build warnings.
- 2026-04-24: Block 3 completed. Fixed anchor mismatches, missing design tokens, responsive utility drift, TradingView re-init behavior, and several UI consistency issues. Browser screenshots were captured under `audit-artifacts/` for desktop/tablet/mobile sampling.
- 2026-04-24: Block 4 completed. Hardened CoinGecko key handling, fetch timeout behavior, Telegram reporting integrity, and shared referral/config consistency.
- 2026-04-24: Block 5 completed. Fixed social posting partial-success handling, dead agent code, queue publication edge cases, safer quality-check quarantine behavior, and workflow locking that could delay social slots.
- 2026-04-24: Block 6 completed. Revalidated content/data integrity with `scripts/validate-content.ts`, corrected sitemap/content ID reuse, and treated `data/metrics/*.json` drift as generated artifacts rather than manual edit targets.
- 2026-04-24: Block 7 completed. Updated markdown docs so workflow timing, deployment flow, route inventory, and active automation behavior match the current repo.
- 2026-04-24: Block 8 completed. Re-ran lint, typecheck, tests, content validation, and multiple production builds. Browser smoke checks passed on the sampled pages with screenshots and a JSON report saved in `audit-artifacts/`; remaining console 404s came from the temporary local test server not reproducing Next's route-specific RSC prefetch filenames.
