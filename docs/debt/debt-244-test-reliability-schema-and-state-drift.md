# DEBT-244: Test Reliability Drift (Schema + Stateful E2E Data + Spec Drift)

**Status:** Active  
**Date:** 2026-02-23  
**Owner:** Test Infrastructure

## Current Verified State

- Unit tests: passing
- Browser tests: passing
- Integration tests: passing when seeded
- Build: passing
- E2E: `66 passed`, `2 skipped`, `0 failed` in latest local run

Root-cause status after code audit:

1. **Schema drift (`idempotency_keys.completed_at`)**: resolved by E2E preflight validator in `tests/e2e/helpers/credential-health-check.ts`.
2. **Stale assertion drift from older UI contracts**: resolved for previously failing assertions in `tests/e2e/bug-151-affordance-audit.spec.ts` and `tests/e2e/session-review-navigation.spec.ts`.
3. **State drift and data-dependent skips**: not resolved.
4. **Dev-server stability (`ECONNRESET` during long Playwright runs)**: not resolved.
5. **Integration seed precondition in taxonomy census test**: not resolved.

## Resolution Status Matrix

| Item | Status | Source of Truth |
|---|---|---|
| §1 Schema-shape preflight | Done | `tests/e2e/helpers/credential-health-check.ts` (`verifyIdempotencySchema`) |
| §2 Migrations before E2E in CI | Done | `.github/workflows/ci.yml` (`Migrate DB` step before E2E) |
| §3 Deterministic E2E user state | Not done | `tests/e2e/helpers/reset-e2e-user-state.ts` clears state but does not seed deterministic baseline rows |
| §4 Stale reference handling | Partially done | App read paths are defensive; setup still lacks deterministic replacement data |
| §5 Stale assertions against current UX contract | Done | Current listed specs align with current component contracts |
| §6 Integration seed dependency | Not done | `tests/integration/tag-taxonomy-census.integration.test.ts` requires seeded tags but does not fail explicitly when missing |
| §7 Web server stability for Playwright | Not done | `playwright.config.ts` uses `pnpm dev` locally with keep-alive reset risk |

## §3 Deterministic E2E User State (Authoritative Spec)

### Current setup pipeline (verified)

`tests/e2e/global.setup.ts` currently executes:

1. `runE2ECredentialHealthCheck()`
2. `runE2EUserStateReset()`
3. `clerkSetup()`
4. `seedTestSubscription()`

`runE2EUserStateReset()` currently clears mutable rows for one user (`idempotency_keys`, `attempts`, `bookmarks`, `practice_sessions`) and republishes `placeholder-*` questions. It does **not** seed deterministic attempts/sessions/bookmarks.

### Baseline data required by credential-gated E2E specs

| Spec | Baseline requirement before test body |
|---|---|
| `tests/e2e/subscribe.spec.ts` | Active subscription row for E2E user |
| `tests/e2e/practice.spec.ts` | Published question fixtures + active subscription |
| `tests/e2e/session-continuation.spec.ts` | Published question fixtures + active subscription |
| `tests/e2e/subscribe-and-practice.spec.ts` | Published question fixtures + active subscription |
| `tests/e2e/bookmarks.spec.ts` | At least one bookmarkable published question + active subscription |
| `tests/e2e/history.spec.ts` | `placeholder-01-naltrexone-mechanism` published |
| `tests/e2e/core-app-pages.spec.ts` | `placeholder-01-naltrexone-mechanism` published + bookmarkable question |
| `tests/e2e/cross-page-navigation.spec.ts` | `placeholder-01-naltrexone-mechanism` published + bookmarkable question |
| `tests/e2e/review-mode-audit.spec.ts` | `placeholder-01...` and `placeholder-02...` published; at least one bookmark row |
| `tests/e2e/session-review-navigation.spec.ts` | At least one completed 2-question session + at least one attempted question row |
| `tests/e2e/bug-151-affordance-audit.spec.ts` | At least one completed session, one attempted question row, one bookmark row |
| `tests/e2e/bs-019-action-bar-audit.spec.ts` | At least one completed session with 2 reviewable questions |
| `tests/e2e/bs-020-card-contrast-audit.spec.ts` | Active subscription row |
| `tests/e2e/bs-028-history-ux-audit.spec.ts` | At least one completed session, and both correct + incorrect attempted question rows |
| `tests/e2e/brainstorming-audit.spec.ts` | `anton-2006-combine-001` published and containing per-choice explanations |
| `tests/e2e/bs-028-history-ux-audit.spec.ts` (BS-027 block) | No extra data beyond authenticated history access |

### Deterministic seed contract to implement in `runE2EUserStateReset`

Modify `tests/e2e/helpers/reset-e2e-user-state.ts` only. Add these helpers and invoke them from `runE2EUserStateReset(...)` immediately after `clearUserState(...)`:

1. `resolveRequiredQuestionFixtures(...)`
2. `resolveRequiredChoiceFixtures(...)`
3. `seedDeterministicBaseline(...)`
4. `verifyDeterministicBaseline(...)`

#### Required published questions

Resolve IDs by slug and fail hard if any is missing/unpublished:

- `placeholder-01-naltrexone-mechanism`
- `placeholder-02-buprenorphine-induction-timing`
- `anton-2006-combine-001`

Error code:

- `E2E_RESET:REQUIRED_QUESTION_FIXTURE_MISSING`

#### Required fixture resolution SQL

Execute this lookup before seeding:

```sql
SELECT id, slug
FROM questions
WHERE slug IN (
  'placeholder-01-naltrexone-mechanism',
  'placeholder-02-buprenorphine-induction-timing',
  'anton-2006-combine-001'
)
  AND status = 'published';
```

Expected row count: `3`.  
If count is not `3`, throw `E2E_RESET:REQUIRED_QUESTION_FIXTURE_MISSING`.

#### Required choice resolution SQL

Resolve all choices for the two placeholder questions:

```sql
SELECT id, question_id, is_correct
FROM choices
WHERE question_id IN ($1, $2);
```

From that result, require:

- one `is_correct = true` choice for `placeholder-01-naltrexone-mechanism`
- one `is_correct = false` choice for `placeholder-02-buprenorphine-induction-timing`

If any required choice is missing, throw `E2E_RESET:CHOICE_FIXTURE_MISSING`.

#### Required deterministic seed rows

Use these exact constants inside `seedDeterministicBaseline(...)`:

- `seededSessionId = '00000000-0000-4000-8000-000000000244'`
- `seededAttemptInSessionId = '00000000-0000-4000-8000-000000000245'`
- `seededAdhocAttemptId = '00000000-0000-4000-8000-000000000246'`
- `seededStartedAt = 2026-01-01T00:00:00.000Z`
- `seededEndedAt = 2026-01-01T00:02:00.000Z`
- `seededAnsweredAtInSession = 2026-01-01T00:00:30.000Z`
- `seededAnsweredAtAdhoc = 2026-01-01T00:03:00.000Z`
- `seededBookmarkCreatedAt = 2026-01-01T00:05:00.000Z`

Execute all inserts in one transaction, in this order:

1. Insert into `practice_sessions`:
- `id = seededSessionId`
- `user_id = appUserId`
- `mode = 'tutor'`
- `started_at = seededStartedAt`
- `ended_at = seededEndedAt`
- `params_json` exactly:
  - `count: 2`
  - `tagSlugs: []`
  - `difficulties: []`
  - `questionIds: [placeholder01Id, placeholder02Id]`
  - `questionStates[0]`:
    - `questionId: placeholder01Id`
    - `markedForReview: false`
    - `latestSelectedChoiceId: placeholder01CorrectChoiceId`
    - `latestIsCorrect: true`
    - `latestAnsweredAt: '2026-01-01T00:00:30.000Z'`
  - `questionStates[1]`:
    - `questionId: placeholder02Id`
    - `markedForReview: false`
    - `latestSelectedChoiceId: null`
    - `latestIsCorrect: null`
    - `latestAnsweredAt: null`

2. Insert first row into `attempts`:
- `id = seededAttemptInSessionId`
- `user_id = appUserId`
- `question_id = placeholder01Id`
- `practice_session_id = seededSessionId`
- `selected_choice_id = placeholder01CorrectChoiceId`
- `is_correct = true`
- `time_spent_seconds = 30`
- `answered_at = seededAnsweredAtInSession`

3. Insert second row into `attempts`:
- `id = seededAdhocAttemptId`
- `user_id = appUserId`
- `question_id = placeholder02Id`
- `practice_session_id = null`
- `selected_choice_id = placeholder02IncorrectChoiceId`
- `is_correct = false`
- `time_spent_seconds = 45`
- `answered_at = seededAnsweredAtAdhoc`

4. Insert one row into `bookmarks`:
- `user_id = appUserId`
- `question_id = placeholder01Id`
- `created_at = seededBookmarkCreatedAt`

5. Do not insert any row into `idempotency_keys`.
6. Do not mutate `stripe_subscriptions`; `tests/e2e/helpers/seed-test-user.ts` remains the only subscription seeding path.

#### Required post-seed invariant checks

Immediately after insertions, verify:

- Completed sessions for user: `>= 1`
- Attempts for user: `>= 2`
- Bookmarks for user: `>= 1`

Fail with:

- `E2E_RESET:BASELINE_STATE_INCOMPLETE`

## §4 Repair Stale References (DB vs UI Source-of-Truth)

### Read-path audit results

History and dashboard paths are already defensive and do not emit broken links for unavailable questions:

- History Questions list:
  - `app/(app)/app/history/page.tsx`
  - `src/adapters/controllers/review-controller.ts`
  - `src/application/use-cases/get-attempted-questions.ts`
- Dashboard Recent Activity:
  - `app/(app)/app/dashboard/page.tsx`
  - `src/adapters/controllers/stats-controller.ts`
  - `src/application/use-cases/get-user-stats.ts`
- Session breakdown rows:
  - `app/(app)/app/history/hooks/use-history-sessions.ts`
  - `src/adapters/controllers/practice-controller.ts` (`getPracticeSessionReview`)
  - `src/application/use-cases/get-practice-session-review.ts`

All three use `fetchQuestionsById(...)` + `enrichWithQuestion(...)` and render `isAvailable=false` placeholders instead of broken links.

### Definitive conclusion

Stale-reference incidents are caused by persisted user state drift in the database, not by UI link rendering defects.

### Required fix

Do not modify application read-path code for this debt item. Modify only `tests/e2e/helpers/reset-e2e-user-state.ts` to add deterministic reseeding and invariant checks exactly as specified in §3.

## §5 Stale Assertion Audit (Current Code vs Current Specs)

Audited files:

- `tests/e2e/bug-151-affordance-audit.spec.ts`
- `tests/e2e/session-review-navigation.spec.ts`

Result: **no stale assertion deltas remain** between these files and current implementations in:

- `app/(app)/app/history/components/history-sessions-tab.tsx`
- `app/(app)/app/history/components/history-questions-tab.tsx`
- `app/(app)/app/questions/[slug]/question-page-client.tsx`

Action: no assertion rewrites are required under DEBT-244.

## §6 Integration Seed Dependency (Deterministic Failure Contract)

### Current gap

`tests/integration/tag-taxonomy-census.integration.test.ts` assumes seeded `tags` rows exist and currently fails via low-signal assertions (`rows.length > 0`) when seed is missing.

### Required change

Add an explicit precondition guard at the top of `tests/integration/tag-taxonomy-census.integration.test.ts`:

1. Query total tag rows once:
- `select count(*)::int as count from tags`

2. If zero rows, throw exactly:

`[INTEGRATION_SEED_MISSING] tags table is empty. Run pnpm db:seed before pnpm test:integration.`

No automatic seeding in test runtime. Failure must remain explicit and immediate.

## §7 Web Server Stability for Playwright

### Current gap

`playwright.config.ts` runs local E2E against `pnpm dev` (`webServer.command`), which is the observed source of long-run `ECONNRESET` noise/failures.

### Required change

Update `playwright.config.ts` `webServer` to run production server for both local and CI E2E:

- `command: 'pnpm build && pnpm start'`
- `reuseExistingServer: false`
- keep `url: ${baseURL}/api/health`

This is the only accepted server-mode policy for E2E under DEBT-244.

## Verification Plan

1. Break baseline intentionally by removing seeded attempts, then run `pnpm test:e2e`.  
Expected: deterministic setup failure from `runE2EUserStateReset` with explicit `E2E_RESET:*` code.

2. Unpublish `placeholder-02-buprenorphine-induction-timing` and run E2E.  
Expected: `E2E_RESET:REQUIRED_QUESTION_FIXTURE_MISSING` before spec execution.

3. Run `pnpm test:integration` without seeding on a clean DB.  
Expected: explicit `[INTEGRATION_SEED_MISSING] ...` failure message.

4. Run two consecutive `pnpm test:e2e` executions locally.  
Expected: no web-server `ECONNRESET` crashes after switching to production server mode.
