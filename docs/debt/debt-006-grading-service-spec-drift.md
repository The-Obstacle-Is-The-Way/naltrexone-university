# DEBT-006: Grading Service Stricter Than Spec

**Status:** Resolved
**Priority:** P1
**Date:** 2026-01-31
**Resolved:** 2026-02-01

## Summary

The `gradeAnswer()` function in the grading service enforces exactly 1 correct choice per question, which is stricter than the specification. This could break questions with multiple correct answers or legacy data.

## Location

- **File:** `src/domain/services/grading.ts` lines 26-32
- **Spec:** SPEC-003 grading service test

## Current Implementation

```typescript
const correctChoices = question.choices.filter((c) => c.isCorrect);
if (correctChoices.length !== 1) {
  throw new DomainError(
    'INVALID_QUESTION',
    `Question must have exactly 1 correct choice, found ${correctChoices.length}`,
  );
}
```

## Spec Expectation

SPEC-003 test shows:
```typescript
const correct = question.choices.find((c) => c.isCorrect);
if (!correct) {
  throw new DomainError('INVALID_QUESTION', 'No correct choice');
}
```

## Difference

| Aspect | Spec | Implementation |
|--------|------|----------------|
| Zero correct | Throws | Throws |
| One correct | OK | OK |
| Multiple correct | OK (uses first) | Throws |

## Impact

- Multiple-answer questions not supported
- Legacy data migration could fail if any questions have >1 correct
- Defensive, but unspecified behavior

## Decision Needed

1. **Keep strict (update spec)** - If we want single-answer-only questions
2. **Match spec (relax code)** - If we want to support multi-answer questions
3. **Add question type** - Support both via `questionType: 'single' | 'multiple'`

## Resolution

We are **single-best-answer only** (board-style MCQ). The SSOT already requires exactly one `isCorrect=true` choice per question.

- Kept `gradeAnswer()` strict (throws when 0 or >1 correct choices exist).
- Updated SPEC-003 to include a test for “multiple correct choices” and document the single-best-answer constraint.

## Acceptance Criteria

- Spec and implementation aligned
- Decision documented in ADR or spec
- Test coverage for chosen behavior
