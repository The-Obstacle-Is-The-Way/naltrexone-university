# DEBT-367: FakeAttemptRepository Does Not Apply Active-Exam Visibility

**Priority:** P2
**Created:** 2026-04-25
**Source:** Identified as out-of-scope in the BUG-236 doc; resurfaced in the 2026-04-25 post-merge audit
**Related:** [BUG-235](../_archive/bugs/bug-235-attempted-question-history-drops-latest-visible-attempt.md), [BUG-236](../_archive/bugs/bug-236-dashboard-current-streak-includes-active-exam-attempts.md), [BUG-237](../_archive/bugs/bug-237-submit-answer-allows-active-exam-session-writes.md), [BUG-239](../_archive/bugs/bug-239-active-exam-latest-attempt-readers-drop-visible-fallback.md), [exam-answer-secrecy-policy.md](../practice-engine/exam-answer-secrecy-policy.md)

**Audit verified:** 2026-04-27 against `87284372`.

---

## Context

`DrizzleAttemptRepository` (the production adapter) applies the shared `getActiveExamVisibilityCondition()` helper in ten read paths. Every projection that surfaces attempt data to a user must hide rows whose practice session is in active (non-ended) exam mode. This is enforced by the BUG-235/236/237/239 visibility sweep and codified in `docs/practice-engine/exam-answer-secrecy-policy.md`.

`FakeAttemptRepository` (the in-memory fake at `src/application/test-helpers/fakes/fake-attempt-repository.ts`, 389 LOC) does NOT apply this filter. The fake's `InMemoryAttempt` type carries `sessionMode` (line 18) but has no field for session `endedAt` and no helper that mirrors the visibility predicate. As a result, the ten sister methods silently return rows that the real repository would hide:

- `findLatestByUserAndQuestion` (line 124)
- `countByUserId` (line 167)
- `countCorrectByUserId` (line 171)
- `countByUserIdSince` (line 176)
- `countCorrectByUserIdSince` (line 182)
- `listRecentByUserId` (line 191)
- `listAnsweredAtByUserIdSince` (line 206)
- `listAttemptedQuestionsByUserId` (line 217 → `getFilteredAttemptedCandidates` line 242)
- `countAttemptedQuestionsByUserId` (line 235, same path)
- `findMostRecentAnsweredAtByQuestionIds` (line 348)

## Why This Is Debt

This gap was acknowledged inline in the BUG-236 doc:

> Do NOT modify the `FakeAttemptRepository` for this bug; the fake's broader fidelity gap (it does not currently model `activeExamVisibilityCondition()` for any method) is out of scope and would expand the diff unnecessarily — the integration test against real Postgres is the authoritative coverage for this fix.

That decision was correct *for the bug fix*, but it leaves the gap load-bearing now that four production fixes depend on the predicate. Four guarantees the policy depends on are NOT covered by unit-tests-against-the-fake:

1. **Dashboard count parity.** `GetUserStatsUseCase` consumes `countByUserIdSince` and `countCorrectByUserIdSince`. Unit tests using the fake will see active-exam rows contribute to "answered count" / accuracy, while real Postgres hides them. Any regression that drops the predicate in the real repo passes unit tests against the fake.
2. **Streak input.** `listAnsweredAtByUserIdSince` (the BUG-236 fix surface) is silently un-mirrored. The fake-driven `GetUserStatsUseCase` streak tests don't exercise the visibility boundary at all.
3. **History projection.** `listAttemptedQuestionsByUserId` and `countAttemptedQuestionsByUserId` (the BUG-235 fix surface) similarly mask future drift.
4. **Implicit latest-attempt readers.** `findLatestByUserAndQuestion` and `findMostRecentAnsweredAtByQuestionIds` (the BUG-239 fix surface) can return the hidden active-exam row instead of falling back to an older visible row, or surface a hidden active-exam timestamp in quick/ad-hoc selection logic.

Today this is partially papered over by integration tests (`tests/integration/bug-regression.integration.test.ts`), but those tests are slow, opt-in, and skipped on most local cycles. Unit-test trust is lower than it should be — the fake can pass scenarios the real repo would fail.

## Remediation

1. Extend `InMemoryAttempt` (line 16-19) to track session lifecycle: add `sessionEndedAt: Date | null` alongside the existing `sessionMode: 'tutor' | 'exam' | null`.
2. Add a private helper `private isHiddenByActiveExam(attempt: InMemoryAttempt): boolean` that returns `true` when `sessionMode === 'exam' && sessionEndedAt === null`. Mirror the production predicate exactly.
3. Apply the helper in the ten methods listed above. For `listAttemptedQuestionsByUserId` / `countAttemptedQuestionsByUserId`, apply the filter at the *first* step of `getFilteredAttemptedCandidates` (before the `mostRecentByQuestionId` ranking pass) so the fake mirrors BUG-235's filter-before-rank ordering. For `findMostRecentAnsweredAtByQuestionIds`, apply it before the per-question max aggregation so the fake mirrors BUG-239.
4. Update fake-construction call sites that need the new field (test helpers and factories under `src/application/test-helpers/`). Default `sessionEndedAt: null` for back-compat where existing tests don't care.
5. Add a focused unit test (`fake-attempt-repository.test.ts`, create if missing) covering each of the ten methods with a mixed-visibility seed: one active-exam attempt, one ended-exam attempt, one tutor attempt, one standalone attempt. Assert the active-exam row is hidden in every case.

## Constraints

- Do NOT change the `AttemptRepository` port interface. The fake's seed shape is internal.
- Do NOT break existing fake-using tests. `sessionEndedAt` defaults to `null` so the new rule applies only when tests explicitly seed an active-exam row (the common existing seed has `sessionMode: null` or `'tutor'`, which the rule leaves alone).
- Do NOT also extend the fake to model BUG-237's submit-time guard. The fake mirrors the *read* contract here; BUG-237's invariant lives in `SubmitAnswerUseCase` and is already covered by use-case tests.

## Why P2 (not P3)

This is not a user-visible defect *today* — production code is correct and integration coverage is in place. But it is the single most likely vector for a silent regression of the BUG-235/236/237/239 visibility sweep: a future change in the real repo that drops the predicate would pass every unit test and could ship before integration runs catch it. BUG-239 increased the fake gap from eight to ten public read methods, so P2 remains calibrated even though normal active-exam attempt writes are now blocked at the use-case boundary.

## Verification

- All ten target methods filter active-exam rows when seeded with `sessionMode: 'exam', sessionEndedAt: null`.
- All ten target methods include the row when `sessionEndedAt` is set (ended exam) or `sessionMode: 'tutor' | null` or `practiceSessionId: null`.
- Existing tests using the fake continue to pass — no behavior change for any test that doesn't seed an active-exam row.
- `pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:integration` stays green.
