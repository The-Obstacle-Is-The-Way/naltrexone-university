# DEBT-239: .env.local Stripe Account Mismatch, E2E Credential Gaps, and Audit Test Infrastructure

**Status:** Resolved (all environment and test infrastructure issues fixed)
**Priority:** P1
**Date:** 2026-02-22

---

## Description

During E2E test setup for BS-027/BS-028 validation, we discovered multiple `.env.local` configuration issues that blocked authenticated Playwright tests and indicated a Stripe account migration that was never fully completed. All issues have now been resolved.

### Issue 1: Stripe Account Mismatch (Resolved)

The `.env.local` Stripe keys were from a **different Stripe account** than the one currently active in the Stripe dashboard:

| Key | Old Account Prefix | Current Account Prefix | Status |
|-----|-------------------|----------------------|--------|
| `STRIPE_SECRET_KEY` | `51Svkj6KAPxQwR68A` | `51SvkizKItmaHAwgU` | **Fixed** (2026-02-22) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `51Svkj6KAPxQwR68A` | `51SvkizKItmaHAwgU` | **Fixed** (2026-02-22) |
| `NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY` | `price_1SwOiNKAPxQwR68AemPhbAqG` | `price_1SxuYAKItmaHAwgUWaePv0AC` | **Fixed** (2026-02-22) |
| `NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL` | `price_1SwOiZKAPxQwR68AGAZSsJ1X` | `price_1SxuYXKItmaHAwgUjobv4lxY` | **Fixed** (2026-02-22) |
| `STRIPE_WEBHOOK_SECRET` | `whsec_dec282d58a...` | N/A (local dev `stripe listen` secret, not tied to account) | **No change needed** |

**Root cause:** The Stripe test account was replaced with a different account at some point. The `.env.local` was never updated to match.

### Issue 2: Missing E2E Clerk Credentials (Resolved)

`E2E_CLERK_USER_USERNAME` and `E2E_CLERK_USER_PASSWORD` were defined in `.env.example` but never saved to `.env.local`. The test user `e2e-test@addictionboards.com` existed in Clerk (created Feb 10, 2026) but the password was lost.

**Fixed:** Password was reset via Clerk Backend API and credentials were added to `.env.local`.

### Issue 3: E2E Test Infrastructure Bugs (Resolved)

Four test infrastructure bugs were found and fixed:

1. **`goToHistoryQuestions` strict mode violation** — The "No questions attempted yet" text matched both a `<Card>` and a child `<div>`, causing Playwright strict mode to reject the `.or()` locator. **Fix:** Added `.first()` to both sides of the `.or()` combinator.

2. **Tests crash when no session history exists** — Tests that need session cards (P1-4, P1-5, P1-6, P2-9) crashed instead of skipping. **Fix:** Added `hasSessionCards()` helper with skip guards.

3. **`startSession` helper timeout** — The `getNextQuestion` server action hit its 15-second `withTimeout` in dev mode due to on-demand compilation latency. The UI showed "Request timed out. Please try again." but the E2E helper didn't handle this. **Root cause:** Dev-mode compilation of the `[sessionId]` page + server action handler chain exceeds the 15s server-side timeout on cold start. **Fix:** Added retry loop in `startSession` helper — clicks "Try again" button up to 2 times (second call succeeds because compilation is cached).

4. **BS-027 locator bugs** — Two issues: (a) `nav a[aria-current="page"]` matched the main app navigation's "History" link instead of the HistoryTabBar's active tab (both set `aria-current="page"`). **Fix:** Narrowed locator to target the nav containing History tab links specifically. (b) The test didn't handle active sessions on the Practice page. **Fix:** Added abandon-session flow before looking for SegmentedControl.

---

## Resolution

### All Items Complete

- [x] Reset E2E test user password via Clerk API
- [x] Add `E2E_CLERK_USER_USERNAME` and `E2E_CLERK_USER_PASSWORD` to `.env.local`
- [x] Update `STRIPE_SECRET_KEY` to current account key
- [x] Update `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` from Stripe dashboard
- [x] Update `NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY` and `NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL`
- [x] Verify `STRIPE_WEBHOOK_SECRET` — confirmed for local `stripe listen`, no change needed
- [x] Fix `goToHistoryQuestions` locator strict mode violation
- [x] Add skip guards for tests requiring session history data
- [x] Fix `startSession` timeout with retry on "Request timed out"
- [x] Fix BS-027 locator to target HistoryTabBar nav specifically
- [x] Fix BS-027 abandon-session handling on Practice page
- [x] Restart dev server to pick up `NEXT_PUBLIC_*` changes
- [x] Run full E2E suite — all failures are now genuine BS-028 finding validations

---

## Verification

1. All `.env.local` Stripe keys use the same account prefix (`51SvkizKIt`) ✓
2. No old-account references (`KAPxQwR68A`) exist in source code ✓
3. `npx playwright test tests/e2e/bs-028-history-ux-audit.spec.ts` — setup passes, all failures are BS-028 finding confirmations (not infrastructure) ✓
4. BS-027 test passes — SPEC-037 visual unification verified ✓

---

## Final Test Results (2026-02-22)

After all infrastructure fixes, the BS-028/BS-027 audit suite produces clean results — **every failure is a validated BS-028 finding, every pass confirms a non-issue or resolved item:**

| Test | Result | Category |
|------|--------|----------|
| Clerk setup | **PASS** | Infrastructure ✓ |
| Seed test subscription | **PASS** | Infrastructure ✓ |
| P0-1: Tutor score denominator | **FAIL** | **BS-028 finding confirmed** — denominator uses answered (1), not questionCount (2) |
| P0-2: Session durations capped | **PASS** | No absurd durations found |
| P1-3: Questions tab navigator | **FAIL** | **BS-028 finding confirmed** — no navigator in standalone question view |
| P1-4: Session card clickable | **FAIL** | **BS-028 finding confirmed** — cursor=auto, no role, no tabindex, no link |
| P1-5: Breakdown "Review session" | **FAIL** | **BS-028 finding confirmed** — no "Review session" action exists |
| P1-6: Dark mode hover contrast | **FAIL** | **BS-028 finding confirmed** — hover contrast delta insufficient |
| P2-8: Sessions tab filters | **FAIL** | **BS-028 finding confirmed** — no filters or pagination counts |
| P2-9: Dual "Back to History" | **FAIL** | **BS-028 finding confirmed** — found 2 links (expected 1) |
| P2-14: Native select dropdowns | **FAIL** | **BS-028 finding confirmed** — height mismatch (40px vs 36px), font-weight wrong |
| P3-10: Duplicate "Other" tag | **FAIL** | **BS-028 finding confirmed** — found 2 "Other" entries in tag filter |
| P3-12: Questions tab sort | **FAIL** | **BS-028 finding confirmed** — no sort controls exist |
| BS-027: Tab bar visual match | **PASS** | **SPEC-037 verified** — active states match within tolerance ✓ |

**Summary:** 4 passed, 10 failed. All 10 failures are validated BS-028 UX findings. Zero infrastructure issues.

### Comparison with Initial Run

| Metric | Initial Run (before fixes) | Final Run (after fixes) |
|--------|---------------------------|------------------------|
| Passed | 3 (2 setup + 1 test) | 4 (2 setup + 2 tests) |
| Failed | 11 | 10 |
| Skipped | 0 | 0 |
| Infrastructure failures | 9 | **0** |
| BS-028 findings confirmed | 2 | **10** |
| BS-027 verified | No (test bug) | **Yes** ✓ |

### BS-028 Findings NOT in E2E Suite

Three BS-028 findings (P2-7, P2-11, P2-13) are not covered by the E2E audit test. These are design/UX concerns that require manual visual inspection rather than automated testing.

---

## Related

- [BS-027](../_archive/brainstorming/bs-027-history-tab-bar-visual-inconsistency.md) — Tab bar visual inconsistency (Archived — resolved by SPEC-037)
- [BS-028](../brainstorming/bs-028-history-session-scoring-and-navigation-gaps.md) — History page UX audit (14 findings, 10 confirmed by E2E)
- [SPEC-037](../_archive/specs/spec-037-tab-switch-visual-unification.md) — Tab switch visual unification (Implemented, verified by E2E)
- [DEBT-104](../_archive/debt/debt-104-missing-e2e-test-credentials.md) — Previously "resolved" E2E credentials issue
- `.env.example` — Defines expected env vars including E2E credentials
- `tests/e2e/bs-028-history-ux-audit.spec.ts` — The audit test file
- `tests/e2e/helpers/session.ts` — Session start helper with retry logic
- `tests/e2e/global.setup.ts` — E2E setup (Clerk + Stripe seeder)
