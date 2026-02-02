# BUG-046: Review Page SQL Error — Ambiguous Column Reference

**Status:** Open
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

Drizzle ORM generates SQL where the subquery alias `answered_at` is not properly qualified, causing PostgreSQL to not know which `answered_at` column is being referenced.

## Affected Code

- `src/adapters/repositories/drizzle-attempt-repository.ts:199-240` — `listMissedQuestionsByUserId`

## Fix Required

The join condition needs to explicitly qualify the column references. Options:

1. **Use SQL template** — Write raw SQL with explicit table qualifiers
2. **Rename subquery alias** — Use a unique name like `max_answered_at` to avoid collision
3. **Different query strategy** — Use a window function or different approach

## Steps to Reproduce

1. Log in as a subscribed user
2. Answer some questions incorrectly in Practice
3. Navigate to /app/review
4. See "Unable to load missed questions" error

## Verification

- [ ] Review page loads without error
- [ ] Missed questions display correctly
- [ ] Unit test added for `listMissedQuestionsByUserId`

## Related

- `GET /app/review` route
- Review controller: `src/adapters/controllers/review-controller.ts`
