# BUG-074: Missed Questions Can Be Misclassified on `answered_at` Timestamp Ties

**Status:** Open
**Priority:** P2
**Date:** 2026-02-06

---

## Description

The missed-questions query defines "latest attempt per question" using `MAX(answered_at)` and then joins back on `(question_id, answered_at)`.

If two attempts for the same user/question share the same `answered_at` timestamp, the join can return multiple rows for that question. This can misclassify a question as "missed" even when one tied latest row is correct, and can also duplicate rows.

---

## Steps to Reproduce

1. Insert two attempts for the same `(user_id, question_id)` with identical `answered_at`.
2. Make one row `is_correct = false` and the other `is_correct = true`.
3. Call `listMissedQuestionsByUserId(userId, limit, offset)`.
4. Observe the question may appear in missed output despite a tied correct latest row.

---

## Root Cause

`DrizzleAttemptRepository.listMissedQuestionsByUserId()` and `countMissedQuestionsByUserId()` use:

- subquery: `SELECT question_id, MAX(answered_at) ... GROUP BY question_id`
- join predicate: `attempts.question_id = subquery.question_id AND attempts.answered_at = subquery.answered_at`

No deterministic tie-breaker exists (e.g., `id DESC`), so equal timestamps are ambiguous.

**Affected file:**
- `src/adapters/repositories/drizzle-attempt-repository.ts`

---

## Fix

### Option A: Window Function (Recommended)

Use `ROW_NUMBER() OVER (PARTITION BY question_id ORDER BY answered_at DESC, id DESC)` and select `row_number = 1`, then filter `is_correct = false`.

Apply the same strategy in both:
- `listMissedQuestionsByUserId()`
- `countMissedQuestionsByUserId()`

### Option B: Add Stable Tie-Break Join Key

Keep current shape but include a deterministic "latest attempt id" in the subquery and join by that id.

---

## Verification

- [ ] Integration test inserts same-timestamp attempts and verifies deterministic latest-attempt behavior
- [ ] No duplicate question rows in missed list on tie scenarios
- [ ] `countMissedQuestionsByUserId()` matches list semantics on tie scenarios
- [ ] Existing review/bookmark tests still pass

---

## Related

- `src/adapters/repositories/drizzle-attempt-repository.ts`
- `src/application/use-cases/get-missed-questions.ts`
- `app/(app)/app/review/page.tsx`
