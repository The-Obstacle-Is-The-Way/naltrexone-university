# SPEC-025: Choice Label Desync Fix (Standalone Question Page)

> **TDD MANDATE:** This spec follows Test-Driven Development (Uncle Bob / Robert C. Martin).
> Write tests FIRST. Red → Green → Refactor. No implementation without a failing test.
> Principles: SOLID, DRY, Clean Code, Gang of Four patterns where appropriate.

**Status:** Ready
**Layer:** Feature
**Date:** 2026-02-12
**Depends On:** SPEC-023 (Question Review Mode)
**Brainstorming:** `docs/brainstorming/bs-011-history-review-wiring-and-choice-label-desync.md` (Bug B)

---

## 1. The Bug

On the standalone question page (`/app/questions/[slug]`), **the QuestionCard and Feedback sections can show different letter labels for the same answer text.**

A user who reads "B) Cannabis" in the Feedback section and looks up at the QuestionCard sees "B) Benzodiazepines" — not Cannabis. The letter labels are meaningless across the two sections.

**Reproduction rate:** 100%. Every question with multiple choices exhibits this mismatch (confirmed via Playwright E2E and Chrome browser audit).

### Root Cause

Two independent data sources feed the same page with conflicting label semantics:

| Component | Data Source | Labels |
|-----------|------------|--------|
| **QuestionCard** | `getQuestionBySlug` (controller) | **Canonical** — `choice.label` from DB `sortOrder` |
| **Feedback** | `submitAnswer` / `getPreviousAttempt` (use cases) | **Shuffled** — `buildShuffledChoiceViews()` assigns `displayLabel` by shuffled position |

The controller at `question-view-controller.ts:70-80` returns raw `choice.label`:

```typescript
choices: question.choices.map((choice) => ({
  id: choice.id,
  label: choice.label,       // ← canonical DB label (A=sortOrder 1, B=sortOrder 2, etc.)
  textMd: choice.textMd,
})),
```

Meanwhile, `submitAnswer` (submit-answer.ts:49-60) and `getPreviousAttempt` (get-previous-attempt.ts:58-67) both call `buildShuffledChoiceViews(question, userId)` which deterministically shuffles choices and assigns `displayLabel` (A=first shuffled position, B=second, etc.).

### Why Practice Sessions Don't Have This Bug

`GetNextQuestion.mapChoicesForOutput` (get-next-question.ts:86-96) also uses `buildShuffledChoiceViews` to produce shuffled labels for the QuestionCard. So in practice sessions, both QuestionCard and Feedback receive shuffled labels from the same mapping — they agree.

---

## 2. The Fix

**Make `getQuestionBySlug` return shuffled labels using `buildShuffledChoiceViews`, the same way `GetNextQuestion.mapChoicesForOutput` does.**

The controller already calls `requireEntitledUserId(d)` (line 63). Currently the return value is discarded. Capture it and pass it to `buildShuffledChoiceViews`.

This is a ~5-line change in one file. No new files. No frontend changes. No type changes.

---

## 3. Detailed Design

### 3.1 Controller Change

**File:** `src/adapters/controllers/question-view-controller.ts`

**Before (lines 59-81):**

```typescript
export const getQuestionBySlug = createAction({
  schema: GetQuestionBySlugInputSchema,
  getDeps,
  execute: async (input, d) => {
    await requireEntitledUserId(d);

    const question = await d.questionRepository.findPublishedBySlug(input.slug);
    if (!question) {
      throw new ApplicationError('NOT_FOUND', 'Question not found');
    }

    return {
      questionId: question.id,
      slug: question.slug,
      stemMd: question.stemMd,
      difficulty: question.difficulty,
      choices: question.choices.map((choice) => ({
        id: choice.id,
        label: choice.label,
        textMd: choice.textMd,
      })),
    };
  },
});
```

**After:**

```typescript
import { buildShuffledChoiceViews } from '@/src/application/shared/shuffled-choice-views';

export const getQuestionBySlug = createAction({
  schema: GetQuestionBySlugInputSchema,
  getDeps,
  execute: async (input, d) => {
    const userId = await requireEntitledUserId(d);    // ← capture userId

    const question = await d.questionRepository.findPublishedBySlug(input.slug);
    if (!question) {
      throw new ApplicationError('NOT_FOUND', 'Question not found');
    }

    return {
      questionId: question.id,
      slug: question.slug,
      stemMd: question.stemMd,
      difficulty: question.difficulty,
      choices: buildShuffledChoiceViews(question, userId).map((choice) => ({
        id: choice.choiceId,
        label: choice.displayLabel,    // ← shuffled label
        textMd: choice.textMd,
      })),
    };
  },
});
```

**What changes:**
1. `await requireEntitledUserId(d)` → `const userId = await requireEntitledUserId(d)` — capture the return value
2. `question.choices.map(...)` → `buildShuffledChoiceViews(question, userId).map(...)` — use shuffled views
3. `choice.id` → `choice.choiceId` — field name differs in `ShuffledChoiceView`
4. `choice.label` → `choice.displayLabel` — shuffled label instead of canonical

**What does NOT change:**
- The output type `GetQuestionBySlugOutput` is unchanged — `choices[].label` is still a string
- The QuestionCard component is unchanged — it still renders `choice.label`
- The Feedback component is unchanged — it still renders `choice.displayLabel`
- The choice `id` values are unchanged — the same database IDs are returned
- The choice `textMd` values are unchanged
- Submission still works — it uses `choiceId`, not labels

### 3.2 Why This Approach

| Option | Description | Verdict |
|--------|-------------|---------|
| **Option 1: Shuffle in controller** | `getQuestionBySlug` calls `buildShuffledChoiceViews` | **Chosen** — minimal change, follows existing `mapChoicesForOutput` pattern |
| Option 2: Return label mapping | Add a `choiceId→displayLabel` mapping to the output; QuestionCard uses it | Over-engineered — requires frontend changes for no benefit |
| Option 3: Make labels invariant | Stop shuffling labels entirely | Product decision — breaks "A=first row" mental model |

---

## 4. Files Summary

### Modified Files

| File | Change |
|------|--------|
| `src/adapters/controllers/question-view-controller.ts` | Capture `userId` from `requireEntitledUserId`, use `buildShuffledChoiceViews` for choice mapping |
| `src/adapters/controllers/question-view-controller.test.ts` | Update test assertions for shuffled labels |

### No New Files

---

## 5. Test Plan

### 5.1 Unit Tests (Vitest)

**File:** `src/adapters/controllers/question-view-controller.test.ts`

Update existing test `'returns the question with choices when found'` (line 148):

```
BEFORE: Asserts choices have canonical labels (label: 'A', label: 'B')
AFTER:  Asserts choices have labels from AllChoiceLabels, both IDs present, labels are unique
```

Add new test:

```
- returns choices with shuffled labels matching buildShuffledChoiceViews output
  → Create a question with 4 choices (A, B, C, D in sortOrder)
  → Call getQuestionBySlug
  → Verify returned labels match what buildShuffledChoiceViews(question, userId) produces
  → Verify choice order matches shuffled order (not canonical sortOrder)
```

Add regression test:

```
- shuffled labels are consistent with submitAnswer / getPreviousAttempt
  → This is the actual bug scenario: verify that getQuestionBySlug returns the same
    label-to-choiceId mapping that submitAnswer's choiceExplanations would use
```

### 5.2 E2E Tests (Playwright)

**File:** `tests/e2e/brainstorming-audit.spec.ts`

The existing Bug B test already validates this:
- Navigates to `/app/questions/anton-2006-combine-001`
- Extracts label→text mappings from QuestionCard and Feedback
- Asserts they match

After implementation, this test (which currently FAILS) should PASS.

---

## 6. Implementation Order

```
Phase 1: Test (RED)
  1. Update existing test to expect shuffled labels
  2. Add regression test for label consistency with buildShuffledChoiceViews

Phase 2: Fix (GREEN)
  3. Import buildShuffledChoiceViews in question-view-controller.ts
  4. Capture userId from requireEntitledUserId
  5. Replace choice mapping with buildShuffledChoiceViews

Phase 3: Verification
  6. Run: pnpm typecheck && pnpm lint && pnpm test --run && pnpm build
  7. Run: pnpm test:e2e (Bug B test in brainstorming-audit.spec.ts should now pass)
```

---

## 7. Acceptance Criteria

- [ ] QuestionCard and Feedback show the same letter label for the same answer text on `/app/questions/[slug]`
- [ ] Choice labels on the standalone question page match the shuffled labels used by practice sessions
- [ ] Existing choice selection and submission still works (uses `choiceId`, not labels)
- [ ] Review mode (`?mode=review`) still works — previous attempt data uses the same shuffle
- [ ] `pnpm typecheck && pnpm lint && pnpm test --run && pnpm build` all pass
- [ ] E2E Bug B test in `brainstorming-audit.spec.ts` passes

---

## 8. Non-Goals (Explicitly Out of Scope)

- **Practice session flow** — already uses `buildShuffledChoiceViews`; no change needed
- **History review wiring** (BS-011 Bug A) — separate spec (SPEC-026)
- **Label display format** — "A)" vs "A." vs "(A)" — no change to rendering
- **Shuffle algorithm** — `buildShuffledChoiceViews` is unchanged; this spec only adds a new caller

---

## 9. Risk Assessment

**Risk: Very Low.**

- The fix is a 5-line change in one file
- `buildShuffledChoiceViews` is already used by 3 other callers (`GetNextQuestion`, `SubmitAnswer`, `GetPreviousAttempt`) — it's battle-tested
- The output type is unchanged — no frontend or API contract changes
- The fix makes `getQuestionBySlug` consistent with `GetNextQuestion.mapChoicesForOutput`, which is the pattern that already works correctly in practice sessions

---

## 10. Related

- **BS-011 Bug B** (Brainstorming) — Problem discovery, Chrome agent validation, Playwright E2E confirmation
- **SPEC-023** (Question Review Mode) — The review mode feature that makes this bug visible (without review mode, Feedback only appears after submission on the same page load)
- **E2E:** `tests/e2e/brainstorming-audit.spec.ts` — Playwright test confirming the current mismatch (will pass after fix)
