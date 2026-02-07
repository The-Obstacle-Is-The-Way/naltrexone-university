# DEBT-138: Dead Modules and Unused Dependencies After Refactors

**Status:** Open
**Priority:** P3
**Date:** 2026-02-07

---

## Description

Static-analysis scans show a set of modules and dependencies with no inbound usage in the current codebase.

Validated from first principles:

- `knip` reported unused files/deps
- `rg` search confirmed no imports/usages for:
  - `lib/auth.ts`
  - `lib/request-context.ts`
  - `src/adapters/gateways/stripe/stripe-client.ts`
  - `src/application/index.ts`
  - `src/application/ports/index.ts`
  - `src/domain/index.ts`
  - `src/domain/errors/index.ts`
- `postcss.config.mjs` does not use `autoprefixer`
- no usage of `swr` in `app/`, `src/`, `lib/`, `components/`
- several build-time toolchain packages currently live in `dependencies`
  (`typescript`, `tailwindcss`, `postcss`, `autoprefixer`, `drizzle-kit`) and should be reviewed for
  `devDependencies` placement to keep runtime installs lean

## Impact

- Unused modules create false API surface and mislead contributors
- Increases maintenance overhead and review noise
- Allows architecture/docs drift to accumulate silently

## Resolution

1. For each unused module, choose one:
   - remove it, or
   - wire it into live flows if it is intentionally part of current architecture
2. Remove truly unused dependencies (`autoprefixer`, `swr`) or add explicit justification where required
3. Reclassify build-only tooling packages to `devDependencies` where runtime usage is not required
4. Add a static-analysis CI check (for example `knip`) with a small allowlist for intentional exceptions

## Verification

- [ ] `pnpm dlx knip --no-progress` has zero unexpected unused files/dependencies
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm test --run` passes

## Related

- `lib/auth.ts`
- `lib/request-context.ts`
- `src/adapters/gateways/stripe/stripe-client.ts`
- `src/application/index.ts`
- `src/application/ports/index.ts`
- `src/domain/index.ts`
- `src/domain/errors/index.ts`
- `postcss.config.mjs`
- `package.json`
