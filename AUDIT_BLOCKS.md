# TokenRadar Comprehensive Audit Blocks

This file defines the audit blocks used for the repository-wide pass. The goal was to avoid a single vague "review everything" sweep and instead move through explicit layers: repository inventory, static correctness, data integrity, runtime behavior, security, UI/PWA/SEO, performance, and final cleanup.

The audit covered tracked application code, scripts, tests, workflows, public assets, static export output, and generated data behavior. Ignored build folders such as `.next`, `.open-next`, `out`, `dist-cloudflare`, `.wrangler`, `node_modules`, and temporary audit files were treated as generated output unless a verification step needed to inspect their exported artifacts.

## Block 0: Inventory, Boundaries, and Baseline

Purpose:

- Establish the full repository shape before editing.
- Separate source files from generated or ignored folders.
- Capture current Git state so unrelated user work is not overwritten.
- Define this block plan before making code changes.

Checks:

- Enumerate files with `rg --files`.
- Identify large generated folders and ignored artifacts.
- Check Git status and current branch.
- Confirm package manager and project scripts.
- Create this markdown plan as the audit guide.

Decision rules:

- Do not delete generated folders just because they are large.
- Do not revert files that were not part of the audit change.
- Treat build-generated changes as verification output unless they remain tracked diffs.

## Block 1: Static Correctness, Naming, and Modularity

Purpose:

- Verify TypeScript, lint, naming, imports, exports, and module boundaries.
- Catch "not defined" issues before runtime.
- Check whether unused imports or exports are real dead code or part of public/local conventions.

Checks:

- Run ESLint.
- Run TypeScript with `--noEmit`.
- Run the test suite.
- Search for TODO/FIXME/debug markers.
- Inspect dangerous or broad patterns when found by search.

Decision rules:

- Remove unused code only when it is confirmed dead.
- Prefer existing project patterns over adding new abstractions.
- Keep changes focused on issues found by the audit.

## Block 2: Data, Content, Integrity, and Internal Linking

Purpose:

- Verify token data, content pages, generated sitemaps, internal routes, and static public references.
- Ensure content generation and static export assumptions are consistent.

Checks:

- Run environment validation.
- Run content validation.
- Regenerate sitemap output.
- Parse JSON-like files for malformed JSON.
- Compare token data files, content directories, TGE entries, and sitemap URLs.
- Check manifest, service worker, icon, and public references.

Decision rules:

- Do not force-index tokens that are intentionally excluded due to untrusted or empty market data.
- Treat non-indexed launch tokens as valid when they have explicit upcoming/TGE context.
- Fix malformed local artifacts only when they break parser integrity checks.

## Block 3: Runtime, APIs, Connections, and Social/TG Notifications

Purpose:

- Review runtime scripts, external API handling, Telegram notification behavior, GitHub Actions concurrency, and social posting flows.
- Reduce failure modes where notification code can hide the original workflow failure.

Checks:

- Inspect GitHub Actions schedules, concurrency groups, and failure notification steps.
- Review Telegram/reporting helpers and social scripts for missing-secret behavior.
- Confirm social workflows do not race direct writes to the same main-branch files.
- Verify partial success and retry behavior where scripts publish to multiple platforms.

Fixes applied:

- Hardened Telegram failure notification steps in workflows with missing-secret guards, `jq` payload construction, `curl --fail`, request timeout, and `continue-on-error`.

Decision rules:

- Do not run live social/TG posting without explicit external-channel approval.
- Keep notification hardening inside workflow code when the failure path itself is the issue.

## Block 4: Security Review

Purpose:

- Search for hardcoded secrets, unsafe HTML rendering, weak CSP, dangerous shell execution, and unsafe external connections.
- Validate whether risky-looking patterns are actually sanitized by local code.

Checks:

- Search for credential-like strings and secret names.
- Inspect `dangerouslySetInnerHTML` usage.
- Inspect markdown-to-HTML renderers.
- Inspect JSON-LD rendering.
- Inspect CSP directives.
- Search for broad CSP wildcards and unsafe eval usage.

Fixes applied:

- Updated CSP to allow the TradingView advanced chart sources used by the app without opening wildcard script or frame sources.
- Added a regression test that parses CSP directives and verifies the TradingView allowlist stays narrow.

Decision rules:

- Sanitized markdown rendering is acceptable when raw HTML is stripped, URLs are validated, and attributes are escaped.
- JSON-LD script injection is acceptable when serialized JSON escapes `<`.
- External widget CSP sources should be explicit and tested.

## Block 5: UI/UX, Theme, Mobile/Tablet/Resolution Behavior, SEO, and PWA

Purpose:

- Verify exported UI surfaces, SEO metadata, PWA artifacts, internal links, and responsive CSS coverage.
- Check the site at production-export level rather than only through source inspection.

Checks:

- Run production build and static export.
- Inspect exported HTML files for visible `undefined`, `not defined`, `ReferenceError`, `TypeError`, `NaN`, and `[object Object]` artifacts outside script/template/style payloads.
- Check sampled core routes for title, description, viewport, canonical where applicable, and `<main>`.
- Check internal `href` and `src` targets in exported HTML.
- Check PWA manifest, icons, service worker, and offline page.
- Check CSS media query, reduced-motion, and safe-area coverage.

Result:

- Export-level checks found no missing internal targets and no visible runtime artifact strings.
- The offline page intentionally has no canonical because it is marked `noindex`.

Decision rules:

- Prefer runtime browser checks when available.
- If local/browser policy blocks local URLs, use static export artifact verification and report the limitation clearly.

## Block 6: Performance and Build Output

Purpose:

- Verify production build behavior, static generation scale, package freshness, and low-risk upgrades.

Checks:

- Run production build.
- Review generated route count and build completion.
- Run `npm outdated`.
- Apply non-major dependency upgrades that are low-risk and verified.

Fixes applied:

- Upgraded Remotion packages to `4.0.462`.
- Upgraded `zod` to `4.4.3`.

Remaining upgrade candidates:

- `@coingecko/coingecko-typescript` major upgrade.
- `@types/node` major upgrade.
- `eslint` major upgrade.
- `marked` major upgrade.
- `typescript` major upgrade.

Decision rules:

- Do not combine major migrations with a broad audit unless tests and code changes are scoped for that migration.
- Re-run lint, typecheck, tests, and build after dependency changes.

## Block 7: Tests, Verification, and Cleanup

Purpose:

- Confirm the final state is reproducible and clean.
- Remove temporary audit helpers.
- Summarize changes and known limitations.

Checks:

- Run lint.
- Run TypeScript.
- Run test suite.
- Run production build.
- Run export-level static/PWA/link/artifact audit.
- Check Git status.
- Remove temporary audit files and logs.

Final verification:

- ESLint passed.
- TypeScript passed.
- Vitest passed.
- Production build passed.
- Static export audit passed.
- Temporary audit helpers were removed.

## Questions That Require External Access

Some items cannot be fully verified without external mutation or credentials:

- Live Telegram channel delivery.
- Live social platform posting.
- Production Cloudflare deployment behavior.
- Major dependency migrations that may require API changes.

Those should be handled as explicit follow-up tasks with external settings and rollback expectations defined before execution.
