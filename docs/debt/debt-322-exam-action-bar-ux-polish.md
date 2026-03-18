# DEBT-322: Exam action bar UX polish — Q1 layout imbalance, "Review answers" duplication and naming

**Priority:** P2
**Created:** 2026-03-18
**Related:** [BS-055](../brainstorming/bs-055-exam-session-interaction-model-rethink.md), [DEBT-321](./debt-321-bs055-exam-interaction-model-overhaul.md), [Interaction Contracts](../practice-engine/interaction-contracts.md)

---

## Context

DEBT-321 shipped the exam action bar redesign: fixed three-slot layout (`[Previous] [Next/Review answers] [Mark for review]`), no per-question Submit, draft-save on navigation. The structural overhaul is correct. These are UX refinements discovered during manual walkthrough of the live exam flow.

---

## D-1: Q1 action bar visual imbalance

### Current behavior

On Q1, `hasPreviousQuestion` is false. The code renders an `ActionBarSpacer` (invisible `<span>` with `h-9 min-w-24`) in position 1, keeping Next in position 2. This is per-spec — BS-055 interaction contracts say "Previous always occupies position 1 (hidden on Q1 with spacer, per BS-037 pattern)."

**Result:** Q1 shows `[___invisible___] [Next] [Mark for review]` — two visible buttons with an empty left gap. Q2+ shows `[Previous] [Next] [Mark for review]` — three visible buttons filling the space naturally.

### Problem

The spacer preserves positional stability (Next stays in slot 2), but the visual weight shift between Q1 and Q2+ is noticeable. The action bar on Q1 looks unbalanced — two visible buttons floating right of an empty void.

### Possible fixes

1. **Left-align on Q1:** When the spacer is active, remove it and let the remaining buttons left-align naturally. Accept the position shift on Q1→Q2 transition as a one-time event (Q1 is always the entry point, so users haven't built spatial memory yet).
2. **Center-align the visible buttons:** Use CSS to center the non-spacer buttons when the spacer is present.
3. **Keep as-is:** The positional stability argument from BS-055 still holds — Next never moves between questions. The visual imbalance is a minor aesthetic issue.

**Decision needed:** Which approach to take. Option 1 is simplest and aligns with the user's instinct that it "looks awkward."

### Files

- `app/(app)/app/practice/components/practice-view.tsx` — `ExamActionBar` component (lines 186-239), `ActionBarSpacer` (line 88-90)
- `app/(app)/app/practice/components/practice-view.test.tsx` — Q1 action bar assertions

---

## D-2: "Review answers" label is misleading

### Current behavior

Both the header button and the last-question action bar button say "Review answers." Clicking either triggers `onEndSession`, which transitions to the review stage — a pre-submit checklist page titled "Review Questions" showing answered/unanswered/marked counts with an "Open question" button per question and a "Submit exam" button at the bottom.

### Problem

"Review answers" implies the system is reviewing/grading your answers, not that you're navigating to a pre-submission checklist. The mental model mismatch:

- **User expectation:** "Review answers" → some kind of feedback or grading
- **Actual behavior:** Opens a checklist where you can still go back and change things, then explicitly submit

The page heading itself ("Review Questions") is slightly better but still ambiguous. The actual finalization action is "Submit exam" — buried at the bottom of the review page.

### Suggested rename

| Current label | Suggested label | Rationale |
|--------------|----------------|-----------|
| "Review answers" (header button) | "End exam" or "Finish exam" | Signals session termination, not grading. The review stage naturally follows as a confirmation step before "Submit exam." |
| "Review answers" (last-Q action bar) | Same as header | Consistency |
| "Review Questions" (review page heading) | Keep or rename to "Review & Submit" | The page already serves as the pre-submit gate. Adding "Submit" to the heading makes the purpose explicit. |

**Decision needed:** Exact wording. "End exam" is direct but may sound abrupt. "Finish exam" is softer. Both are clearer than "Review answers." Alternative: "Review & submit" to signal both steps happen from this exit point.

### Files

- `app/(app)/app/practice/components/practice-view.tsx` — `endSessionLabel` (line 248), `ExamActionBar` middle button label (line 191)
- `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx` — `endSessionLabel` prop passed to `PracticeView` (search for `endSessionLabel`)
- `app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx` — "Review Questions" heading

---

## D-3: "Review answers" duplication on last question

### Current behavior

On the last exam question, "Review answers" appears in **two** places:
1. **Header** (top right) — persistent across all questions, styled as outline button
2. **Action bar** (position 2) — replaces "Next" on the last question only

Both call the same `onEndSession` handler. Both navigate to the same review stage.

### Problem

The BS-055 interaction contracts explicitly marked this as intentional: "The last-question duplication of Review answers (header + position 2) is intentional. Same label, same destination." The rationale was that replacing Next with Review answers signals "you've reached the end."

In practice, having the same button in two places on one screen looks redundant. The user correctly identifies this as awkward. On non-last questions, the header is the only escape hatch — fine. On the last question, doubling it adds visual noise without new information.

### Possible fixes

1. **Keep action bar, hide header on last Q:** The action bar's "Review answers" (renamed per D-2) is the primary CTA on the last question. Temporarily hide the header button on the last question to avoid duplication.
2. **Keep both but differentiate:** Make the action bar button the primary CTA ("Finish exam") and keep the header as a secondary outline escape hatch ("Review & submit"). Different labels reduce the "why are there two" feeling.
3. **Remove action bar duplication:** Keep "Next" on the last question (it just navigates to the review stage instead of the next question). The header button is always available as the explicit "Finish exam" exit. This is the simplest option and preserves the "buttons don't change labels" principle — Next always says Next.
4. **Keep as-is:** Accept the duplication per original BS-055 rationale.

**Decision needed:** Which approach. Option 3 has the cleanest alignment with "buttons don't move AND don't change labels" — Next always means "advance one step forward," and on the last question, the next step is the review stage.

### Files

- `app/(app)/app/practice/components/practice-view.tsx` — `ExamActionBar` (lines 189-196), header button (lines 315-326)
- `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx` — `isLastSessionQuestion` prop derivation
- `docs/practice-engine/interaction-contracts.md` — Section 3 action bar layout

---

## Out of scope

These items were observed during the same walkthrough but are tracked elsewhere or are separate concerns:

- **Tutor mode button timing** (DEBT-318): Bookmark visible before feedback
- **Post-exam reattempt suppression** (AF-6 in BS-055): "Practice Again" / "Try Again" in post-exam review
- **Periodic autosave / `visibilitychange` saves** (future enhancement noted in interaction contracts)
- **Downstream post-submit flows** (summary, history, question review navigation): Require their own walkthrough and separate debt tracking

---

## Implementation notes

- D-1, D-2, and D-3 are independent and can be shipped in any order
- All changes are frontend-only — no backend/use-case/repository changes needed
- D-2 requires updating test assertions that match on button label text
- D-3 may require updating interaction contracts doc to reflect the new decision
- If D-2 and D-3 are done together, the label rename + deduplication can land in one PR
