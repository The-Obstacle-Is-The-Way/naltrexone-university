# DEBT-080: Missing E2E Coverage for Core App Pages

**Status:** Resolved
**Priority:** P1
**Date:** 2026-02-03

---

## Description

Several high-value `/app/*` user surfaces had **unit coverage** but lacked **Playwright E2E** coverage for real navigation and wiring:

- `/app/questions/[slug]` reattempt flow (seeded slug + submit feedback)
- `/app/review` listing + “Reattempt” link
- `/app/bookmarks` listing after bookmarking from practice
- `/app/billing` rendering for subscribed users (Manage in Stripe button)
- `/app/practice/[sessionId]` session continuation after navigating away

Additionally, dashboard stats are unit-tested, but we lacked a **real Postgres integration test** exercising the Drizzle-backed aggregation path through `getUserStats()`.

Notes:
- The audit claim “`/app/questions/[slug]` is completely untested” was **false** — unit tests exist (`app/(app)/app/questions/[slug]/page.test.tsx`), but **E2E was missing**.

---

## Impact

- Regressions in routing, subscription gating, server actions, and client wiring can ship without detection.
- Session continuation is a core retention feature; breakage there is high-impact.
- Stats aggregation correctness depends on SQL boundaries that unit tests cannot validate.

---

## Resolution

- Added Playwright specs covering core `/app/*` flows:
  - `tests/e2e/core-app-pages.spec.ts`
  - `tests/e2e/session-continuation.spec.ts`
- Added a Postgres-backed integration test for `getUserStats()` aggregation:
  - `tests/integration/controllers.integration.test.ts`

---

## Verification

- [x] `pnpm test --run`
- [x] `pnpm typecheck`
- [x] `DATABASE_URL=... pnpm test:integration`
- [x] `pnpm test:e2e` (auth-required specs skip without Clerk creds)

---

## Related

- `tests/e2e/` (existing E2E coverage)
- `tests/integration/` (existing boundary tests)
- `docs/_archive/debt/debt-074-missing-boundary-integration-tests.md` (related testing pyramid discussion)
