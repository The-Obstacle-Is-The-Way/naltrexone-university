# DEBT-293: E2E Shared-State Structural Flakiness

**Priority:** P1
**Created:** 2026-03-09
**Status:** Open
**Discovered during:** CI run on `main` (PR #186 merge commit `ab5f21c1`, run `22852148955`)

---

## Triggering Incident

PR #186 merged CSS-only changes (DEBT-290: practice filter tonal fill elevation). The **identical code** passed CI on `dev` 9 minutes earlier, then failed on `main`. The failing test was `session-review-navigation.spec.ts`:

- **Attempt 1**: Passed session creation, answered 2 questions, ended session, navigated to review. Failed at line 93 — `navigatorButtons` count expected 2 but assertion timed out.
- **Retry 1**: Failed at line 23 — `getByText('Question 1 of 2')` not found after `startSession()`.
- **Retry 2**: Same as Retry 1.

The code change was purely visual CSS. This is not a regression — it is a **structural flakiness pattern** rooted in shared mutable state and cascading retry corruption.

---

## Root Cause Analysis

### 1. The Single Shared User Anti-Pattern

All E2E tests share one Clerk account. `playwright.config.ts` enforces `workers: 1` to prevent parallel conflicts, and a comment documents why:

> All authenticated E2E tests share a single test user, so concurrent workers cause session and bookmark state conflicts. Use 1 worker to run sequentially.

This makes tests sequential but **does not make them isolated**. Every test that creates sessions, answers questions, or toggles bookmarks mutates the same user's database rows. Later tests inherit that dirty state.

**Playwright's own documentation explicitly calls this out:**

> *"Your tests modify server-side state. For example, one test checks the rendering of the settings page, while the other test is changing the setting, and you run tests in parallel. In this case, tests must use different accounts."*
> — [Playwright Authentication Docs](https://playwright.dev/docs/auth)

Even in sequential mode, the principle holds. Martin Fowler writes:

> *"If one test creates some data in the database and leaves it lying around, it can corrupt the run of another test."*
> — [Eradicating Non-Determinism in Tests](https://martinfowler.com/articles/nonDeterminism.html)

### 2. Suite-Level Reset, Not Test-Level Reset

`global.setup.ts` runs `runE2EUserStateReset()` once at suite start. This:

1. Deletes all `idempotency_keys`, `attempts`, `bookmarks`, `practice_sessions` for the E2E user
2. Seeds a deterministic baseline (1 completed session, 2 attempts, 1 bookmark)
3. Verifies the baseline

After that, **no automatic cleanup occurs between tests**. Each test accumulates state:

| Spec | Mutates sessions? | Mutates attempts? | Mutates bookmarks? |
|------|:-:|:-:|:-:|
| `practice.spec.ts` (3 tests) | Yes | Yes | No |
| `session-continuation.spec.ts` | Yes | Yes | No |
| `session-review-navigation.spec.ts` (3 tests) | Yes | Yes | No |
| `subscribe-and-practice.spec.ts` | Yes | Yes | No |
| `review-mode-audit.spec.ts` | No | No | No |
| `bookmarks.spec.ts` | No | No | Yes (reset per-test since DEBT-281) |
| `core-app-pages.spec.ts` | No | No | Yes (reset per-test since DEBT-281) |
| Others (smoke, theme, etc.) | No | No | No |

Session-creating tests run in whatever order Playwright discovers them (alphabetical by filename within the `chromium` project). By the time `session-review-navigation.spec.ts` runs, the E2E user may have accumulated sessions and attempts from earlier specs.

### 3. Cascading Retry Corruption

This is the specific mechanism that caused the PR #186 failure:

1. **Attempt 1** created a new session (2 questions), answered both, ended the session, and navigated to review. It reached the question navigator but the button count assertion timed out — likely a rendering timing issue under CI resource pressure.

2. **Attempt 1 left behind**: a completed session + 2 new attempts in the database.

3. **Retry 1** starts fresh in the browser (Playwright kills the worker process on retry). But the database still has the attempt 1 artifacts. `startSession()` checks for and abandons incomplete sessions — but the attempt 1 session was *completed*, not incomplete. So `startSession()` proceeds to create a new session.

4. **Question availability may have shifted**: The `startSession()` helper probes question statuses ('Unanswered', 'Incorrect', 'Bookmarked') and picks the first that has enough questions. After attempt 1 answered 2 questions (both on the placeholder questions), the 'Unanswered' pool may have been exhausted for those placeholders. The helper falls back to 'Incorrect' or 'Bookmarked', which have different question sets. If fewer than 2 questions are available, the session starts but the "Question 1 of 2" text never appears because the progress indicator reflects a different count.

5. **Retry 2** has the same problem, compounded by retry 1's own partial or complete session creation.

This is exactly what Evil Martians describes:

> *"When tests pass in isolation but fail in groups, you're dealing with state that persists between tests and creates hidden dependencies."*
> — [Flaky Tests Be Gone](https://evilmartians.com/chronicles/flaky-tests-be-gone-long-lasting-relief-chronic-ci-retry-irritation)

### 4. Retries Are Masking the True Flake Rate

The project already documented this in DEBT-281:

> With `retries: 2` in CI, a test that fails once but passes on retry appears green. The true flake rate may be higher than CI status suggests.

Applitools is blunter:

> *"The worst thing you can do as a fix is to blindly increase the wait time or rerun the test. [...] Pushing the dirt under the carpet and claiming all is clean."*
> — [Applitools: Uncover Flaky Tests](https://applitools.com/blog/uncover-flaky-tests/)

The existing `testing-infrastructure.md` troubleshooting section currently recommends `waitForLoadState('networkidle')` and `page.waitForTimeout(1000)` as flakiness fixes. These are exactly the band-aids the literature warns against.

---

## DEBT-281 Was a Symptom Fix

DEBT-281 (E2E bookmark test flakiness, resolved 2026-03-07) correctly diagnosed the shared-state problem for bookmarks and implemented a per-test bookmark reset. That fix was thorough and well-executed.

But it was scoped to bookmarks. The same structural problem exists for **sessions and attempts**, which are mutated by more tests and have a larger blast radius. DEBT-293 is the generalization of the DEBT-281 pattern to all shared mutable E2E state.

---

## What the Literature Recommends

Ranked from most isolated to least:

| Strategy | Description | Effort | Source |
|----------|-------------|--------|--------|
| **Database-per-worker** | Each worker gets its own database instance | Very High | [Playwright #33699](https://github.com/microsoft/playwright/issues/33699) |
| **Unique user per worker** | `testInfo.parallelIndex` maps to distinct test accounts | High | [Playwright Auth Docs](https://playwright.dev/docs/auth) |
| **Per-test API-driven reset** | `beforeEach` clears and reseeds relevant state via direct DB | Medium | [Playwright Best Practices](https://playwright.dev/docs/best-practices), Fowler |
| **Transaction rollback** | Wrap each test in a DB transaction and roll back | Medium | [Fowler: Non-Determinism](https://martinfowler.com/articles/nonDeterminism.html) |
| **Fresh browser context** (already done) | Playwright creates new context per test — but this only isolates *browser* state, not *server* state | Already in place | [Playwright Isolation Docs](https://playwright.dev/docs/browser-contexts) |

Google Testing Blog adds a strategic perspective:

> *"Flaky tests reduce the developer's trust in the test, and as a result flaky tests are often ignored, even when they find real product issues."*
> — [Just Say No to More End-to-End Tests](https://testing.googleblog.com/2015/04/just-say-no-to-more-end-to-end-tests.html)

Martin Fowler's Practical Test Pyramid advocates reducing E2E tests to a bare minimum of critical user journeys and pushing logic verification down to unit and integration tests.

---

## Proposed Resolution

### Phase 1: Per-Test Session State Reset (Immediate, Medium Effort)

Follow the DEBT-281 pattern: create `resetSessionsForE2EUser()` that:

1. Deletes all `practice_sessions` and `attempts` for the E2E user
2. Re-seeds the deterministic baseline (1 completed session, 2 attempts)
3. Verifies the baseline

Wire it into `beforeEach` for every session-creating spec:
- `practice.spec.ts`
- `session-continuation.spec.ts`
- `session-review-navigation.spec.ts`
- `subscribe-and-practice.spec.ts`

This eliminates cross-spec session state leakage and retry cascading corruption.

### Phase 2: Unified Per-Test Full State Reset (Medium Effort)

Consolidate `resetBookmarksForE2EUser()` and `resetSessionsForE2EUser()` into a single `resetE2EUserState()` callable from `beforeEach` (or a shared `test.beforeEach`). This is the same `runE2EUserStateReset()` that already runs in `global.setup.ts`, but now it runs before each test that mutates state.

Trade-off: adds ~1-2s per test for the DB round-trip. With 28 E2E tests, that is ~30-60s of additional CI time. This is worth it for deterministic isolation.

### Phase 3: Fix the Troubleshooting Guidance (Low Effort)

Update `docs/dev/testing-infrastructure.md` "Tests flaky on CI" section to replace the current band-aid advice with structural guidance:

**Remove:**
```
- Increase timeout in playwright.config.ts
- Use waitForLoadState('networkidle') before assertions
- Add explicit waits: await page.waitForTimeout(1000)
```

**Replace with:**
```
- Check if the failing test mutates server-side state (sessions, attempts, bookmarks)
- If yes, add a per-test state reset in beforeEach (see reset helpers in tests/e2e/helpers/)
- If the failure only occurs on retries, suspect cascading state corruption from the first attempt
- Never add waitForTimeout() — diagnose the root cause instead
```

### Phase 4: Evaluate Parallel Isolation (Future, High Effort)

If CI time becomes a concern or the suite grows beyond ~40 tests, evaluate:
- Multiple Clerk test users (one per parallel worker)
- Database-per-worker via Docker Compose profiles
- Or: push more verification down to integration tests and reduce E2E to smoke-only

This is not urgent. The current suite is small enough that sequential execution with per-test resets is sufficient.

---

## Files Involved

| File | Relevance |
|------|-----------|
| `playwright.config.ts` | `workers: 1`, `retries: 2` configuration |
| `tests/e2e/global.setup.ts` | Suite-level state reset (runs once) |
| `tests/e2e/helpers/reset-e2e-user-state.ts` | Full user state reset implementation |
| `tests/e2e/helpers/reset-bookmarks-for-e2e-user.ts` | Per-test bookmark reset (DEBT-281 pattern) |
| `tests/e2e/helpers/session.ts` | `startSession()` helper with abandon/probe logic |
| `tests/e2e/session-review-navigation.spec.ts` | Triggering test (3 tests, 180s timeout) |
| `tests/e2e/practice.spec.ts` | Session-creating spec |
| `tests/e2e/session-continuation.spec.ts` | Session-creating spec |
| `tests/e2e/subscribe-and-practice.spec.ts` | Session-creating spec |
| `docs/dev/testing-infrastructure.md` | Troubleshooting section needs update |

---

## Authoritative References

1. **Fowler, M.** "Eradicating Non-Determinism in Tests." martinfowler.com. — Shared state as primary flakiness cause; rebuild state per test.
2. **Fowler, M.** "The Practical Test Pyramid." martinfowler.com. — E2E tests are "notoriously flaky"; minimize them.
3. **Playwright Docs.** "Authentication." playwright.dev/docs/auth. — "Tests must use different accounts" when modifying server-side state.
4. **Playwright Docs.** "Best Practices." playwright.dev/docs/best-practices. — "Each test should be completely isolated from another test."
5. **Applitools.** "Uncover Flaky Tests." applitools.com/blog/uncover-flaky-tests/. — Retries are "pushing dirt under the carpet."
6. **Evil Martians.** "Flaky Tests Be Gone." evilmartians.com. — Zero-tolerance policy; quarantine and fix, don't retry.
7. **Wacker, M.** "Just Say No to More End-to-End Tests." Google Testing Blog. — Flaky tests erode developer trust.

---

## Relationship to Prior Work

| Item | Relationship |
|------|-------------|
| DEBT-281 | Solved the same structural problem for bookmarks; DEBT-293 generalizes it to sessions/attempts |
| DEBT-248 | Hardened E2E helpers (CodeRabbit follow-ups); did not address shared-state isolation |
| DEBT-225 | Vitest cold-import flakes (unrelated; unit test timeouts, not E2E state) |

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-09 | Created DEBT-293 | CI failure on `main` (PR #186) exposed structural E2E shared-state flakiness beyond the bookmark domain already fixed in DEBT-281 |
| 2026-03-09 | Classified as P1 | Flaky CI on `main` erodes trust in the test suite and blocks the deployment pipeline |
| 2026-03-09 | Proposed per-test session reset as Phase 1 | Follows proven DEBT-281 pattern; medium effort, high impact |
