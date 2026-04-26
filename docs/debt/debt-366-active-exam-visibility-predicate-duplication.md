# DEBT-366: Active-Exam Visibility Predicate Duplicated Across Repositories

**Priority:** P3
**Created:** 2026-04-25
**Source:** Post-merge audit after the BUG-235/236/237 trilogy (2026-04-25)
**Related:** [BUG-235](../_archive/bugs/bug-235-attempted-question-history-drops-latest-visible-attempt.md), [BUG-236](../_archive/bugs/bug-236-dashboard-current-streak-includes-active-exam-attempts.md), [BUG-237](../_archive/bugs/bug-237-submit-answer-allows-active-exam-session-writes.md), [exam-answer-secrecy-policy.md](../practice-engine/exam-answer-secrecy-policy.md)
**Resolution State:** Fix on branch `debt-366-shared-active-exam-visibility`; pending PR review, merge verification, and archival.

---

## Context

The active-exam visibility predicate — the SQL fragment that hides attempt rows belonging to active (non-ended) exam sessions — currently exists as identical 14-line private methods on two adapter classes:

- `src/adapters/repositories/drizzle-attempt-repository.ts:53-66`
- `src/adapters/repositories/drizzle-question-repository.ts:39-52`

Both build the same condition:

```typescript
or(
  isNull(practiceSessions.id),
  ne(practiceSessions.mode, 'exam'),
  isNotNull(practiceSessions.endedAt),
)
```

with the same defensive `INTERNAL_ERROR` throw if Drizzle returns a falsy condition, and the same upstream `leftJoin(practiceSessions, eq(attempts.practiceSessionId, practiceSessions.id))` shape at every caller.

## Why This Is Debt

The visibility policy is a single domain concern (see `docs/practice-engine/exam-answer-secrecy-policy.md`), but the SQL implementing it lives in two places. A future policy change — for example, adding a new "abandoned exam" state, narrowing the freshness window on `endedAt`, or introducing a per-user override — must be applied in lock-step in both files or the two repositories will drift.

BUG-235 already exposed how brittle this surface is: the Attempt repo applied `activeExamVisibilityCondition()` *after* ranking while the Question repo applied it *before* ranking. Even after BUG-235 closed that specific divergence, the underlying root cause (two copies of the same predicate, no shared definition) remains.

## Remediation

Extract to a single shared module:

- New file: `src/adapters/repositories/shared/active-exam-visibility.ts`
- Export one function — `getActiveExamVisibilityCondition(): SQL` — with the same body the two private methods carry today.
- Both repositories import and call it instead of redefining the private method.

Pure deduplication. No call sites change shape. No behavior change is intended.

## Constraints

- Do NOT rename or relocate the upstream `leftJoin(practiceSessions, ...)` calls. The shared helper returns only the `WHERE` fragment; the join must remain at the call site.
- Do NOT extract a higher-level "visible attempts subquery" helper. BUG-235 explicitly pinned the rank-then-filter scaffold as duplication-by-design (different SELECT lists in the two repos). Only the inner predicate is genuinely shared.

## When To Do It

Pick up next time either repository file is opened for change. Pair with any future visibility-policy work so the test footprint is justified by the policy change.

## Verification

- All existing unit tests for `DrizzleAttemptRepository` and `DrizzleQuestionRepository` continue to pass without modification.
- `tests/integration/bug-regression.integration.test.ts` BUG-192/235/236 cases stay green.
- Full pre-push gate: `pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:browser && pnpm test:integration && pnpm build`.
