# DEBT-322: Exam action bar UX polish — Q1 layout imbalance and "Review answers" duplication/naming

**Priority:** P2
**Created:** 2026-03-18
**Related:** [BS-055](../brainstorming/bs-055-exam-session-interaction-model-rethink.md), [DEBT-321](./debt-321-bs055-exam-interaction-model-overhaul.md), [Interaction Contracts](../practice-engine/interaction-contracts.md)

---

## Context

DEBT-321 shipped the exam action bar redesign: fixed three-slot layout (`[Previous] [Next/Review answers] [Mark for review]`), no per-question Submit, draft-save on navigation. The structural overhaul is correct. This doc captures the remaining UX refinements that still match the current implementation, plus closely related follow-up issues verified against current `HEAD`.

## Audit status (2026-03-18)

- **Code verification:** Completed against current `HEAD`. D-1, D-2, and D-3 all still match the live code paths in `PracticeView`, `PracticeSessionPageView`, and `ExamReviewView`.
- **Recent-commit check:** No production change after DEBT-322 creation has already resolved these issues. Current `HEAD` still renders the same spacer, labels, and last-question duplication described below.
- **Scope discipline:** This doc now treats the current source code as the implementation SSOT. Items not supported by the audited code paths are explicitly marked as not active debt.
- **Test impact:** Current tests already encode parts of the status quo for D-2 and D-3. D-1 is only partially encoded — visible-button assertions exist, but there is no test that explicitly asserts spacer presence or Q1 visual alignment.

---

## D-1: Q1 action bar visual imbalance

### Current behavior

On Q1, when `PracticeSessionPageView` has `onNavigateQuestion`, it still passes `onPreviousQuestion`, but `hasPreviousQuestion` is false. `PracticeView` therefore renders `ExamActionBar`, which renders an `ActionBarSpacer` (invisible `<span>` with `h-9 min-w-24`) in position 1, keeping Next in position 2. This is per current spec — BS-055 and the interaction contracts say "Previous always occupies position 1 (hidden on Q1 with spacer, per BS-037 pattern)."

**Result:** Q1 shows `[___invisible___] [Next] [Mark for review]` — two visible buttons with an empty left gap. Q2+ shows `[Previous] [Next] [Mark for review]` — three visible buttons filling the space naturally.

### Structural impact

The spacer `<span aria-hidden="true" class="h-9 min-w-24">` reserves a fixed-width empty slot on Q1, keeping "Next" in position 2 instead of letting the visible buttons start at the left edge. That fixed empty slot is present regardless of viewport width.

**Mobile impact is worse in principle:** because the spacer width is fixed via `min-w-24` while the available action-bar width shrinks on narrower screens, the empty slot consumes a larger share of the available space on mobile than on desktop.

### Problem

The spacer preserves positional stability (Next stays in slot 2), but the visual weight shift between Q1 and Q2+ is noticeable. The action bar on Q1 looks unbalanced — two visible buttons floating right of an empty void.

### Possible fixes

1. **Left-align on Q1:** When the spacer is active, remove it and let the remaining buttons left-align naturally. Accept the position shift on Q1→Q2 transition as a one-time event (Q1 is always the entry point, so users haven't built spatial memory yet).
2. **Center-align the visible buttons:** Use CSS to center the non-spacer buttons when the spacer is present.
3. **Keep as-is:** The positional stability argument from BS-055 still holds — Next never moves between questions. The visual imbalance is a minor aesthetic issue.

**Decision needed:** Which approach to take. Option 1 is simplest and aligns with the user's instinct that it "looks awkward."

### Files

- `app/(app)/app/practice/components/practice-view.tsx` — `ActionBarSpacer` (lines 88-90), `ExamActionBar` (lines 186-239), bottom action bar wrapper (lines 438-455)
- `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx` — navigator-backed `previousQuestionId` derivation (lines 67-82) and `onPreviousQuestion` / `hasPreviousQuestion` wiring (lines 101-114, 244-248)
- `app/(app)/app/practice/components/practice-view.test.tsx` — Q1 visible-button assertions (lines 512-560, 735-778)

**Test note:** current tests assert the visible Q1 labels (`Next`, `Mark for review`) and the absence of a visible `Previous` button, but they do **not** assert spacer presence or layout directly. A D-1 fix would likely need new layout-focused coverage, not just existing assertion rewrites.

---

## D-2: "Review answers" label is misleading

### Current behavior

Both the header button and the last-question action bar button say "Review answers." Clicking either triggers `onEndSession`, which transitions to the review stage — a pre-submit checklist page titled "Review Questions" showing answered/unanswered/marked counts with an "Open question" button per question and a "Submit exam" button at the bottom.

### Problem

"Review answers" implies the system is reviewing/grading your answers, not that you're navigating to a pre-submission checklist. The mental model mismatch:

- **User expectation:** "Review answers" → some kind of feedback or grading
- **Actual behavior:** Opens a checklist where you can still go back and change things, then explicitly submit

The page heading itself ("Review Questions") is slightly better but still ambiguous. The actual finalization action is "Submit exam" — buried at the bottom of the review page.

**SSOT note:** this is **not** accidental implementation drift. BS-055 Q3 and the current interaction contract explicitly chose `Review answers` and explicitly rejected `End Exam` for the active exam flow. Treat D-2 as a proposal to reopen that decision, not as a bug fix that can land silently.

### Suggested rename

| Current label | Suggested label | Rationale |
|--------------|----------------|-----------|
| "Review answers" (header button) | "End exam" or "Finish exam" | Signals session termination, not grading. The review stage naturally follows as a confirmation step before "Submit exam." |
| "Review answers" (last-Q action bar) | Same as header | Consistency |
| "Review Questions" (review page heading) | Keep or rename to "Review & Submit" | The page already serves as the pre-submit gate. Adding "Submit" to the heading makes the purpose explicit. |

**Naming inconsistency across the flow:** The current label chain is disjointed — "Review answers" (button) → "Review Questions" (page heading) → "Submit exam" (CTA). Three different terms for related concepts within a 2-click flow creates cognitive friction.

**"Review" is overloaded with three meanings across the exam lifecycle:**
1. **"Review answers"** (pre-submit) — means "go to the pre-submit checklist"
2. **"Review Questions"** (pre-submit page heading) — means "see your answered/unanswered/marked status"
3. **"Review your answers"** (post-submit Session Summary page) — means "see explanations for each question"

A user could easily confuse the pre-submit "Review answers" with the post-submit "Review your answers" — they sound almost identical but do completely different things. This three-way overload makes the rename even more important: the pre-submit label needs to clearly distinguish itself from the post-submit review.

**Additional label options:**
- **"Review & Submit"** — signals both steps happen from this exit point
- **"Go to Summary"** — neutral, implies an overview page
- **"Ready to Submit?"** — action-oriented, matches the actual purpose
- **"Question Summary"** — matches what the review page actually shows

**Decision needed:** Exact wording. "End exam" is direct but may sound abrupt. "Finish exam" is softer. Both are clearer than "Review answers." If renamed, also standardize the full flow (e.g., "Review & Submit" → "Review Summary" → "Submit Exam") to eliminate the three-term inconsistency.

### Files

- `app/(app)/app/practice/components/practice-view.tsx` — header button label render (lines 315-326), last-question middle-button label switch (lines 189-196), default fallback `endSessionLabel` (line 248)
- `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx` — exam-specific `endSessionLabel="Review answers"` wiring (lines 235-236)
- `app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx` — `"Review Questions"` heading (lines 110-115), `Submit exam` CTA + confirm dialog (lines 189-235)
- `app/(app)/app/practice/[sessionId]/components/session-summary-view.tsx` — post-submit `Review your answers` CTA (lines 103-115)
- `app/(app)/app/practice/components/practice-view.test.tsx` — current label assertions that would need updating if renamed (lines 323-350, 641-685)
- `app/(app)/app/practice/components/practice-view.browser.spec.tsx` — browser test that clicks the bottom-bar `Review answers` button by name (lines 447-499)

---

## D-3: "Review answers" duplication on last question

### Current behavior

On the last exam question, "Review answers" appears in **two** places:
1. **Header** (top right) — persistent across all questions, styled as outline button
2. **Action bar** (position 2) — replaces "Next" on the last question only

Both call the same `onEndSession` handler. Both navigate to the same review stage.

Code verification confirms this is implemented in two separate places:
- `PracticeSessionPageView` hard-codes the exam-mode `endSessionLabel` prop to `Review answers`
- `PracticeView` switches the middle action-bar label from `Next` to `Review answers` when `isLastSessionQuestion && onEndSession`

### Problem

The BS-055 interaction contracts explicitly marked this as intentional: "The last-question duplication of Review answers (header + position 2) is intentional. Same label, same destination." The rationale was that replacing Next with Review answers signals "you've reached the end."

In practice, having the same button in two places on one screen looks redundant. Having the same label in two visually distinct locations (outlined header vs. filled action bar) reinforces the perception that they might be *different* actions even though they are not. On non-last questions, the header is the only escape hatch — fine. On the last question, doubling it adds visual noise without new information.

**Additional observation:** The header "Review answers" button is visible on **all** questions, including Q1 where the user hasn't seen all questions yet. This could encourage premature entry into the submission flow. Consider showing it only after the user has visited all questions, or at minimum only on the last question. (This is a D-3 extension, not a separate item.)

### Possible fixes

1. **Keep action bar, hide header on last Q:** The action bar's "Review answers" (renamed per D-2) is the primary CTA on the last question. Temporarily hide the header button on the last question to avoid duplication.
2. **Keep both but differentiate:** Make the action bar button the primary CTA ("Finish exam") and keep the header as a secondary outline escape hatch ("Review & submit"). Different labels reduce the "why are there two" feeling.
3. **Remove action bar duplication:** Keep "Next" on the last question (it just navigates to the review stage instead of the next question). The header button is always available as the explicit "Finish exam" exit. This is the simplest option and preserves the "buttons don't change labels" principle — Next always says Next.
4. **Keep as-is:** Accept the duplication per original BS-055 rationale.

**Decision needed:** Which approach. Option 3 has the cleanest alignment with "buttons don't move AND don't change labels" — Next always means "advance one step forward," and on the last question, the next step is the review stage.

### Files

- `app/(app)/app/practice/components/practice-view.tsx` — last-question derivation from `sessionInfo.index/total` (lines 253-257), `ExamActionBar` middle-label switch (lines 189-196), header button (lines 315-326)
- `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx` — exam-mode `endSessionLabel` wiring and navigation props into `PracticeView` (lines 235-248)
- `docs/practice-engine/interaction-contracts.md` — Section 3 exam action bar layout and explicit "intentional duplication" note
- `app/(app)/app/practice/components/practice-view.test.tsx` — bottom-bar last-question label assertions (lines 641-685)
- `app/(app)/app/practice/components/practice-view.browser.spec.tsx` — browser interaction test for the bottom-bar `Review answers` button (lines 447-499)

**Test note:** current tests encode the bottom-bar `Review answers` label and click path, but there is not yet a dedicated test that asserts the simultaneous header + footer duplication on the last question. If D-3 is implemented, coverage should be added for the deduplicated end state rather than relying on incidental label assertions alone.

---

## D-4: Additional follow-up issues

These are adjacent issues that were raised during follow-up review and then re-audited against the current source. They are not part of the original D-1/D-2/D-3 scope.

### ~~D-4a: Question navigator disappears at narrow viewports~~ — NOT CODE-CONFIRMED

An earlier follow-up report claimed that the question navigator vanished at ~460px. The current code audit does **not** support that claim:

- `QuestionNavigator` itself contains no responsive hiding classes
- `PracticeSessionPageView` does not hide the navigator in its parent render path
- the only responsive classes in the navigator grid are `grid-cols-5`, `sm:grid-cols-8`, and `lg:grid-cols-10`

So D-4a should **not** be treated as active implementation debt from the current source alone. If it is reproduced again on current `HEAD`, it should be reopened as a separate responsive rendering bug with a fresh viewport-specific repro.

**Status:** Removed from active debt unless reproed again on current `HEAD`.

### D-4b: Previous button potential race condition (low probability)

The current implementation leaves open a theoretical race window in which the "Previous" button can temporarily collapse back to the invisible spacer (same as Q1):

- `hasPreviousQuestion` is derived from `navigator` (async-fetched) + `currentQuestionId` (state)
- If the new question loads before the navigator refetch completes, `currentQuestionId` updates but `navigator` is stale
- The `useMemo` runs against stale data: `findIndex` returns -1 for the new question ID → `previousQuestionId` = null → spacer renders instead of "Previous"

**Mitigating factors:** Both navigation paths (Next button and Question Navigator) use the same `onNavigateQuestion` handler. The navigator refetches immediately on `questionId` change. The race window is typically <100ms. Buttons are disabled during loading via `isNavigationDisabled`.

**Important correction:** the implementation currently derives `previousQuestionId` from `navigator + currentQuestionId` via `useMemo`, then passes `hasPreviousQuestion={previousQuestionId !== null}` into `PracticeView`. That part of the original analysis was accurate. The original proposed fix, however, was overstated.

**Visibility-only tweak:** derive the visibility flag from `props.sessionInfo?.index > 0` instead of from `previousQuestionId !== null`:
```typescript
// Current:
hasPreviousQuestion={previousQuestionId !== null}

// Visibility-only tweak:
hasPreviousQuestion={props.sessionInfo?.index > 0}
```

That would make the **button visibility** independent of navigator staleness, but it would **not** remove navigator dependency entirely because `onPreviousQuestion` still resolves the previous target from `previousQuestionId`:

- `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx` — `previousQuestionId` derivation (lines 67-82)
- `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx` — `onPreviousQuestion` callback (lines 101-105)
- `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx` — `hasPreviousQuestion` prop wiring (line 247)

So the fully correct statement is:

1. The current visibility logic is navigator-derived and therefore theoretically race-prone.
2. A one-line change to `props.sessionInfo?.index > 0` would only fix visibility.
3. A complete fix would need both the visibility flag **and** the previous-question target to come from a stable, non-stale source.

**Severity:** Low — theoretically plausible, hard to reproduce reliably, and not fully fixable with the original one-line snippet alone.

### D-4c: Responsive layout breaks header "Review answers" position

At narrower widths, the "Review answers" header button drops from the right-side position to below the heading, changing the visual hierarchy. Users could miss it or confuse it with a different element.

**Code audit clarification:** this is caused by the `PracticeView` header container switching from stacked to horizontal layout at the Tailwind `sm` breakpoint, not by flex-wrap:

- `app/(app)/app/practice/components/practice-view.tsx` — outer header layout `flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between` (lines 302-303)
- `app/(app)/app/practice/components/practice-view.tsx` — header action wrapper `flex items-center gap-3` (line 314)

**Severity:** Low. Only affects narrow viewports; the action bar at the bottom is always available.
**Recommendation:** Track as part of a responsive audit. If D-4a is reproduced on current `HEAD`, handle both together.

---

## Out of scope

These items are adjacent concerns and should be tracked separately:

- **Tutor mode button timing** (DEBT-318): Bookmark visible before feedback
- **Post-exam reattempt suppression** (AF-6 in BS-055): "Practice Again" / "Try Again" in post-exam review
- **Periodic autosave / `visibilitychange` saves** (future enhancement noted in interaction contracts)
- **Downstream post-submit flows** (summary, history, question review navigation): Require their own dedicated audit and separate debt tracking
- **Session duration includes idle time:** The Session Summary currently shows raw wall-clock duration (`endedAt - startedAt`), not active interaction time. This is implemented via `projectPracticeSessionSummary(...).totals.durationSeconds` → `computeSessionDurationSeconds(session.startedAt, endedAt)`. Separate debt item.

---

## Implementation notes

- D-1 is a pure frontend refinement and can ship independently.
- D-2 and D-3 are **not** mere implementation drift; both intentionally reopen the current BS-055 / interaction-contract SSOT. If either lands, the docs must change in the same PR.
- All three D-1/D-2/D-3 issues are frontend-local in production code — no backend/use-case/repository changes needed.
- D-2 requires updating test assertions that currently match the literal `Review answers` label. If renamed, also update the flow naming chain (button → page heading → CTA) for consistency.
- D-3 requires updating the interaction contract if the "intentional duplication" decision is reversed.
- If D-2 and D-3 are done together, the rename + deduplication can land in one PR.
- D-4b (Previous button race condition) is **not** fully solved by a one-line snippet. `props.sessionInfo?.index > 0` would only stabilize button visibility; a complete fix must also remove navigator staleness from the previous-target resolution.
- ~~D-4a~~ — **Not code-confirmed.** The current source contains no responsive hiding for `QuestionNavigator`, so this should stay removed from active implementation debt unless reproed again on current `HEAD`.
- D-4c is a real responsive layout effect caused by the `PracticeView` header stacking below the Tailwind `sm` breakpoint (640px). Low severity — track as part of a responsive audit.
- Current source audit supports D-1, D-2, D-3, D-4b, and D-4c as live implementation concerns. It does **not** support D-4a as active debt.
