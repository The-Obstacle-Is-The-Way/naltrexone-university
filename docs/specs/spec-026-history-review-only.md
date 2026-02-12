# SPEC-026: History Tab — Review-Only Question Links

> **TDD MANDATE:** This spec follows Test-Driven Development (Uncle Bob / Robert C. Martin).
> Write tests FIRST. Red → Green → Refactor. No implementation without a failing test.
> Principles: SOLID, DRY, Clean Code, Gang of Four patterns where appropriate.

**Status:** Ready
**Layer:** Feature
**Date:** 2026-02-12
**Depends On:** SPEC-024 (Question Status Filter — provides the Practice-based reattempt path)
**Brainstorming:** `docs/brainstorming/bs-011-history-review-wiring-and-choice-label-desync.md` (Bug A)

---

## 1. The Bug

On the History > Questions tab (`/app/history?tab=questions`), question links are **result-dependent**:

- **Correct** rows → `toQuestionRoute(slug, { from: 'history', mode: 'review' })` — opens in review mode
- **Incorrect** rows → `toQuestionRoute(slug, { from: 'history' })` — opens in reattempt mode (no `mode=review`)

This is an explicit conditional at `history-questions-tab.tsx:330-332`:

```typescript
const href = row.isCorrect
  ? toQuestionRoute(row.slug, { from: 'history', mode: 'review' })
  : toQuestionRoute(row.slug, { from: 'history' });
```

The action button also varies: "Review" for correct, "Reattempt" for incorrect (lines 365-367).

### Why This Is Wrong

1. **Inconsistent with other entry points.** Dashboard Recent Activity and Session Breakdown always include `mode=review` regardless of correctness. History Questions is the only entry point with result-dependent routing.

2. **Misleading subtitle.** The question page says "Reviewing a question from your history." in both cases (the subtitle is origin-based, not mode-based per SPEC-023). The user reads "Reviewing" but sees a fresh attempt form.

3. **Reattempt belongs in Practice.** Once SPEC-024 ships, users can target incorrect questions through Practice → Incorrect status filter. History should be a review surface, not a reattempt entry point.

---

## 2. The Fix

**Make all History > Questions links review-only: always include `mode=review`, always label the button "Review".**

This is a 3-line change in one file.

---

## 3. Detailed Design

### 3.1 Component Change

**File:** `app/(app)/app/history/components/history-questions-tab.tsx`

**Before (lines 330-332):**

```typescript
const href = row.isCorrect
  ? toQuestionRoute(row.slug, { from: 'history', mode: 'review' })
  : toQuestionRoute(row.slug, { from: 'history' });
```

**After:**

```typescript
const href = toQuestionRoute(row.slug, { from: 'history', mode: 'review' });
```

**Before (lines 363-368):**

```tsx
<Link
  href={href}
  aria-label={`${row.isCorrect ? 'Review' : 'Reattempt'} question: ${title}`}
>
  {row.isCorrect ? 'Review' : 'Reattempt'}
</Link>
```

**After:**

```tsx
<Link
  href={href}
  aria-label={`Review question: ${title}`}
>
  Review
</Link>
```

### 3.2 What Does NOT Change

- Dashboard Recent Activity links — already use `mode: 'review'` for all rows
- Session Breakdown links — already use `mode: 'review'` for all rows
- Bookmarks links — separate entry point, not affected
- Question page rendering — `mode=review` triggers `loadPreviousAttempt`, which pre-fills the previous answer and shows feedback. This already works for incorrect questions (tested in SPEC-023).
- Question page "Try Again" button — still available after review, allowing reattempt from the question page itself

---

## 4. Files Summary

### Modified Files

| File | Change |
|------|--------|
| `app/(app)/app/history/components/history-questions-tab.tsx` | Remove conditional: always include `mode: 'review'`, always label "Review" |
| `app/(app)/app/history/components/history-questions-tab.test.tsx` | Update tests to expect `mode=review` on all links, "Review" label on all buttons |

### No New Files

---

## 5. Test Plan

### 5.1 Unit Tests (Vitest)

**File:** `app/(app)/app/history/components/history-questions-tab.test.tsx`

Update existing tests:

```
BEFORE: Asserts incorrect rows have href without mode=review, button says "Reattempt"
AFTER:  Asserts ALL rows have href with mode=review, ALL buttons say "Review"
```

Add regression test:

```
- incorrect question links include mode=review
  → Create a row with isCorrect=false
  → Assert href contains mode=review
  → Assert button text is "Review" (not "Reattempt")
```

### 5.2 E2E Tests (Playwright)

**File:** `tests/e2e/brainstorming-audit.spec.ts`

The existing Bug A test validates that incorrect rows on History > Questions lack `mode=review`. After implementation, update or remove this test to assert that all rows include `mode=review`.

---

## 6. Implementation Order

```
Phase 1: Test (RED)
  1. Update history-questions-tab.test.tsx to expect mode=review on all links
  2. Update test to expect "Review" label on all buttons

Phase 2: Fix (GREEN)
  3. Remove conditional in history-questions-tab.tsx line 330-332
  4. Remove conditional in button label at lines 365-367

Phase 3: Verification
  5. Run: pnpm typecheck && pnpm lint && pnpm test --run && pnpm build
  6. Run: pnpm test:e2e
```

---

## 7. Acceptance Criteria

- [ ] All History > Questions links include `mode=review` regardless of correctness
- [ ] All action buttons say "Review" (never "Reattempt")
- [ ] Clicking an incorrect question from History shows review mode (previous answer highlighted, feedback visible)
- [ ] "Try Again" button is still available on the question page for users who want to reattempt
- [ ] `pnpm typecheck && pnpm lint && pnpm test --run && pnpm build` all pass

---

## 8. Non-Goals

- **Practice-based reattempt path** — SPEC-024 handles this separately
- **Subtitle copy changes** — The subtitle "Reviewing a question from your history." is already correct for review mode
- **History Sessions tab** — `SessionBreakdownList` already uses `mode: 'review'` unconditionally; no change needed
- **Dashboard links** — Already use `mode: 'review'`; no change needed

---

## 9. Dependency Note

This spec depends on SPEC-024 (Question Status Filter). Without SPEC-024, removing the reattempt path from History would leave users with no way to target incorrect questions for reattempt. The implementation order is:

1. **SPEC-024** — Add Question Status filter to Practice (gives users the "Incorrect" reattempt path)
2. **SPEC-026** — Make History review-only (safe because Practice now handles reattempts)

Do NOT implement this spec before SPEC-024 ships.

---

## 10. Risk Assessment

**Risk: Very Low.**

- 3-line change in one file
- Makes History consistent with Dashboard and Session Breakdown (both already use `mode: 'review'`)
- Review mode for incorrect questions already works (SPEC-023)
- "Try Again" button on the question page preserves the reattempt affordance

---

## 11. Related

- **BS-011 Bug A** (Brainstorming) — Problem discovery and root cause analysis
- **SPEC-023** (Question Review Mode) — The review mode feature that makes `mode=review` work for both correct and incorrect questions
- **SPEC-024** (Question Status Filter) — Provides the Practice-based reattempt path that makes this change safe
- **E2E:** `tests/e2e/brainstorming-audit.spec.ts` — Playwright test confirming the current conditional routing
