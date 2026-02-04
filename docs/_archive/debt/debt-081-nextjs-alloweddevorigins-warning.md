# DEBT-081: Next.js allowedDevOrigins Warning in E2E Runs

**Status:** Resolved
**Priority:** P3
**Date:** 2026-02-03

---

## Description

Playwright runs with `NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000` by default.
Next.js warns about cross-origin requests to `/_next/*` resources because
`127.0.0.1` is not included in the dev server’s allowlist.

This warning indicates a **future Next.js major** will block these requests unless
`allowedDevOrigins` is explicitly configured.

## Impact

- Noisy logs during local E2E runs.
- Risk of future E2E failures when Next switches from warn → block by default.

## Resolution

- Configure `allowedDevOrigins` in `next.config.ts` to allow `127.0.0.1`.

## Verification

- [x] `pnpm test:e2e` (no cross-origin warning)
- [x] `pnpm build`

## Related

- `next.config.ts`
- `playwright.config.ts`
