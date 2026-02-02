# BUG-046: Review Page SQL Error — Ambiguous Column Reference

**Status:** Resolved
**Priority:** P1
**Date:** 2026-02-02

---

## Summary

The Review page (/app/review) crashes with a PostgreSQL error when loading missed questions. The error is "column reference `answered_at` is ambiguous" in the `listMissedQuestionsByUserId` query.

## Observed Error

```
PostgresError: column reference "answered_at" is ambiguous

Failed query: select "latest_attempt_by_question"."question_id", "answered_at"
from (select "question_id", max("answered_at") as "answered_at" from "attempts"
where "attempts"."user_id" = $1 group by "attempts"."question_id") "latest_attempt_by_question"
inner join "attempts" on ("attempts"."user_id" = $2
and "attempts"."question_id" = "latest_attempt_by_question"."question_id"
and "attempts"."answered_at" = "answered_at")  <-- AMBIGUOUS HERE
where "attempts"."is_correct" = $3 order by "answered_at" desc limit $4
```

## User Impact

- Review page shows "Unable to load missed questions" with "Internal error"
- Users cannot review questions they got wrong
- Core study feature broken

## Root Cause

In `src/adapters/repositories/drizzle-attempt-repository.ts:220-226`, the join condition uses:

```typescript
eq(attempts.answeredAt, latestAttemptByQuestion.answeredAt),
```

Drizzle ORM generates SQL where the aggregate alias (`answered_at`) is emitted unqualified inside the join condition, colliding with `attempts.answered_at` and triggering PostgreSQL ambiguity.

## Affected Code

- `src/adapters/repositories/drizzle-attempt-repository.ts:199-240` — `listMissedQuestionsByUserId`

## Fix Implemented

Avoid alias collisions by using a unique aggregate alias:

```typescript
answeredAt: max(attempts.answeredAt).as('max_answered_at'),
```

This causes Drizzle to emit `attempts.answered_at = max_answered_at`, which is unambiguous because only the subquery defines `max_answered_at`.

## Steps to Reproduce

1. Log in as a subscribed user
2. Answer some questions incorrectly in Practice
3. Navigate to /app/review
4. See "Unable to load missed questions" error

## Verification

- [x] Review page loads without error (query no longer ambiguous)
- [x] Missed questions display correctly
- [x] Integration test added for `listMissedQuestionsByUserId` (`tests/integration/repositories.integration.test.ts`)

## Related

- `GET /app/review` route
- Review controller: `src/adapters/controllers/review-controller.ts`
