# DEBT-138: Dead Modules and Unused Dependencies After Refactors

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-07
**Resolved:** 2026-02-07

---

## Description

Static-analysis scans flagged dead modules and dependencies after recent refactors.

Validated from first principles on this branch:

- `swr` had no usage in `app/`, `src/`, `lib/`, `components/`
- `autoprefixer` was not used by `postcss.config.mjs`
- Barrel and scaffolding files (`src/**/index.ts`, `lib/auth.ts`,
  `src/adapters/gateways/stripe/stripe-client.ts`, `lib/request-context.ts`)
  are currently import-light but remain intentionally documented structure in SSOT/ADR docs.

## Impact

- Unused dependencies increase install and audit surface area
- Dead-dependency drift causes avoidable review/maintenance noise

## Resolution

1. Remove truly unused runtime dependencies (`swr`, `autoprefixer`)
2. Re-verify that flagged module files are intentional architectural scaffolding
3. Keep request-correlation scaffolding (`lib/request-context.ts`) tracked by DEBT-140

## Verification

- [x] `swr` removed from `package.json`
- [x] `autoprefixer` removed from `package.json`
- [x] `pnpm typecheck` passes
- [x] `pnpm lint` passes
- [x] `pnpm test --run` passes

## Related

- `postcss.config.mjs`
- `package.json`
- `pnpm-lock.yaml`
- `docs/debt/debt-140-request-correlation-not-wired-into-runtime-logs.md`
