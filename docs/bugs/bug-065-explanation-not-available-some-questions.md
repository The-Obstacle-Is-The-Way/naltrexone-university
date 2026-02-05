# BUG-065: Confusing "Explanation not available" Message in Exam Mode

**Status:** Open
**Priority:** P3
**Date:** 2026-02-05

---

## Description

In **EXAM mode**, the message "Explanation not available" is displayed after answering questions. While this is technically correct behavior (exam mode hides explanations until session ends), the message is confusing and makes users think the data is missing.

**Current Behavior (EXAM mode):**
- User answers a question
- Message shows: "Explanation not available."
- User thinks the question has no explanation

**Expected Behavior (EXAM mode):**
- User answers a question
- Message shows: "Explanations will be shown after you complete the session."
- User understands this is intentional

**Note:** TUTOR mode correctly shows explanations immediately. This is only a UX issue in EXAM mode.

---

## Steps to Reproduce

1. Sign in as subscribed user
2. Start a practice session in **EXAM mode**
3. Answer any question
4. Observe "Explanation not available" message (confusing)

---

## Root Cause

The `Feedback.tsx` component shows a generic "Explanation not available" message when `explanationMd` is null. In EXAM mode, the backend intentionally returns `null` for explanations until the session ends. The message should clarify this is intentional, not a data problem.

**Code location:** `components/question/Feedback.tsx:31-33`

```tsx
// Current (confusing)
<p className="mt-2 text-sm text-muted-foreground">
  Explanation not available.
</p>
```

---

## Fix

Update `Feedback.tsx` to accept a `mode` prop and show a contextual message:

```tsx
// Proposed (clear)
{mode === 'exam' ? (
  <p className="mt-2 text-sm text-muted-foreground">
    Explanations will be shown after you complete the session.
  </p>
) : (
  <p className="mt-2 text-sm text-muted-foreground">
    Explanation not available.
  </p>
)}
```

---

## Verification

- [ ] `Feedback` component updated with mode-aware message
- [ ] EXAM mode shows "will be shown after session" message
- [ ] TUTOR mode still shows explanations immediately
- [ ] Session summary shows all explanations after exam ends

---

## Related

- `components/question/Feedback.tsx` - UI component
- `src/domain/value-objects/practice-mode.ts` - Mode logic
- `src/application/use-cases/submit-answer.ts` - Returns null in exam mode
