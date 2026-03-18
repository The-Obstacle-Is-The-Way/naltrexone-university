# DEBT-322: Exam action bar UX polish — Q1 layout imbalance, "Review answers" duplication/naming, and browser-verified findings

**Priority:** P2
**Created:** 2026-03-18
**Related:** [BS-055](../brainstorming/bs-055-exam-session-interaction-model-rethink.md), [DEBT-321](./debt-321-bs055-exam-interaction-model-overhaul.md), [Interaction Contracts](../practice-engine/interaction-contracts.md)

---

## Context

DEBT-321 shipped the exam action bar redesign: fixed three-slot layout (`[Previous] [Next/Review answers] [Mark for review]`), no per-question Submit, draft-save on navigation. The structural overhaul is correct. These are UX refinements discovered during manual walkthrough of the live exam flow.

## Audit status (2026-03-18)

- **Code verification:** Completed against current `HEAD`. D-1, D-2, and D-3 all still match the live code paths in `PracticeView`, `PracticeSessionPageView`, and `ExamReviewView`.
- **Recent-commit check:** No production change after DEBT-322 creation has already resolved these issues. Current `HEAD` still renders the same spacer, labels, and last-question duplication described below.
- **Browser verification (2026-03-18):** **Completed** via Claude-in-Chrome on the `dev` Vercel preview (authenticated session). A 2-question exam session was walked through Q1 → Q2 (last) → Review page → back to Q1. All three issues (D-1, D-2, D-3) confirmed with DOM inspection and visual evidence. Additional responsive and naming issues surfaced during the walkthrough (see D-4 below).
- **Test impact:** Current tests already encode parts of the status quo for D-2 and D-3. D-1 is only partially encoded — visible-button assertions exist, but there is no test that explicitly asserts spacer presence or Q1 visual alignment.

---

## D-1: Q1 action bar visual imbalance

### Current behavior

On Q1, `PracticeSessionPageView` still passes `onPreviousQuestion`, but `hasPreviousQuestion` is false. `PracticeView` therefore renders `ExamActionBar`, which renders an `ActionBarSpacer` (invisible `<span>` with `h-9 min-w-24`) in position 1, keeping Next in position 2. This is per current spec — BS-055 and the interaction contracts say "Previous always occupies position 1 (hidden on Q1 with spacer, per BS-037 pattern)."

**Result:** Q1 shows `[___invisible___] [Next] [Mark for review]` — two visible buttons with an empty left gap. Q2+ shows `[Previous] [Next] [Mark for review]` — three visible buttons filling the space naturally.

### Browser-verified measurements

The spacer `<span aria-hidden="true" class="h-9 min-w-24">` renders at **96px wide** (matching a "Previous" button), pushing "Next" (63px) and "Mark for review" (133px) **~108px to the right** of where they'd naturally start. On a desktop-width viewport (~1000px content area), the ~100px dead zone on the left is prominent. On Q2, the real "Previous" button (91px) fills that slot and all three buttons flow naturally from the left edge — the contrast between Q1 and Q2 is striking.

### Problem

The spacer preserves positional stability (Next stays in slot 2), but the visual weight shift between Q1 and Q2+ is noticeable. The action bar on Q1 looks unbalanced — two visible buttons floating right of an empty void.

### Possible fixes

1. **Left-align on Q1:** When the spacer is active, remove it and let the remaining buttons left-align naturally. Accept the position shift on Q1→Q2 transition as a one-time event (Q1 is always the entry point, so users haven't built spatial memory yet).
2. **Center-align the visible buttons:** Use CSS to center the non-spacer buttons when the spacer is present.
3. **Keep as-is:** The positional stability argument from BS-055 still holds — Next never moves between questions. The visual imbalance is a minor aesthetic issue.

**Decision needed:** Which approach to take. Option 1 is simplest and aligns with the user's instinct that it "looks awkward."

### Files

- `app/(app)/app/practice/components/practice-view.tsx` — `ActionBarSpacer` (lines 88-90), `ExamActionBar` (lines 186-239), bottom action bar wrapper (lines 438-455)
- `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx` — navigator-backed `onPreviousQuestion` / `hasPreviousQuestion` wiring (lines 101-114, 244-248)
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

**Additional label options from browser walkthrough:**
- **"Review & Submit"** — signals both steps happen from this exit point
- **"Go to Summary"** — neutral, implies an overview page
- **"Ready to Submit?"** — action-oriented, matches the actual purpose
- **"Question Summary"** — matches what the review page actually shows

**Decision needed:** Exact wording. "End exam" is direct but may sound abrupt. "Finish exam" is softer. Both are clearer than "Review answers." If renamed, also standardize the full flow (e.g., "Review & Submit" → "Review Summary" → "Submit Exam") to eliminate the three-term inconsistency.

### Files

- `app/(app)/app/practice/components/practice-view.tsx` — header button label render (lines 315-326), last-question middle-button label switch (lines 189-196), default fallback `endSessionLabel` (line 248)
- `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx` — exam-specific `endSessionLabel="Review answers"` wiring (lines 235-236)
- `app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx` — `"Review Questions"` heading (lines 110-115), `Submit exam` CTA + confirm dialog (lines 189-235)
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
- `PracticeSessionPageView` hard-codes the header label to `Review answers` for exam mode
- `PracticeView` switches the middle action-bar label from `Next` to `Review answers` when `isLastSessionQuestion && onEndSession`

### Problem

The BS-055 interaction contracts explicitly marked this as intentional: "The last-question duplication of Review answers (header + position 2) is intentional. Same label, same destination." The rationale was that replacing Next with Review answers signals "you've reached the end."

In practice, having the same button in two places on one screen looks redundant. The browser walkthrough confirmed this: having the same label in two visually distinct locations (outlined header vs. filled action bar) actually reinforces the perception that they might be *different* actions — users may wonder if they do different things (they don't). On non-last questions, the header is the only escape hatch — fine. On the last question, doubling it adds visual noise without new information.

**Additional observation:** The header "Review answers" button is visible on **all** questions, including Q1 where the user hasn't seen all questions yet. This could encourage premature entry into the submission flow. Consider showing it only after the user has visited all questions, or at minimum only on the last question. (This is a D-3 extension, not a separate item.)

### Possible fixes

1. **Keep action bar, hide header on last Q:** The action bar's "Review answers" (renamed per D-2) is the primary CTA on the last question. Temporarily hide the header button on the last question to avoid duplication.
2. **Keep both but differentiate:** Make the action bar button the primary CTA ("Finish exam") and keep the header as a secondary outline escape hatch ("Review & submit"). Different labels reduce the "why are there two" feeling.
3. **Remove action bar duplication:** Keep "Next" on the last question (it just navigates to the review stage instead of the next question). The header button is always available as the explicit "Finish exam" exit. This is the simplest option and preserves the "buttons don't change labels" principle — Next always says Next.
4. **Keep as-is:** Accept the duplication per original BS-055 rationale.

**Decision needed:** Which approach. Option 3 has the cleanest alignment with "buttons don't move AND don't change labels" — Next always means "advance one step forward," and on the last question, the next step is the review stage.

### Files

- `app/(app)/app/practice/components/practice-view.tsx` — last-question derivation from `sessionInfo.index/total` (lines 253-257), `ExamActionBar` middle-label switch (lines 189-196), header button (lines 315-326)
- `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx` — exam header-label wiring and navigation props into `PracticeView` (lines 235-248)
- `docs/practice-engine/interaction-contracts.md` — Section 3 exam action bar layout and explicit "intentional duplication" note
- `app/(app)/app/practice/components/practice-view.test.tsx` — bottom-bar last-question label assertions (lines 641-685)
- `app/(app)/app/practice/components/practice-view.browser.spec.tsx` — browser interaction test for the bottom-bar `Review answers` button (lines 447-499)

**Test note:** current tests encode the bottom-bar `Review answers` label and click path, but there is not yet a dedicated test that asserts the simultaneous header + footer duplication on the last question. If D-3 is implemented, coverage should be added for the deduplicated end state rather than relying on incidental label assertions alone.

---

## D-4: Additional issues discovered during browser walkthrough

These were surfaced during the 2026-03-18 Chrome agent walkthrough. They are not part of the original D-1/D-2/D-3 scope but are documented here for tracking.

### D-4a: Question navigator disappears at narrow viewports

At ~460px width and below, the question navigator (numbered button bar at the top) vanishes entirely, leaving no way to jump between questions except via Previous/Next. This is a significant mobile usability gap — users on phones lose random-access navigation entirely.

**Severity:** Medium. Mobile users are forced into strictly sequential navigation.
**Recommendation:** Track as a separate responsive/mobile debt item.

### D-4b: Previous button potential race condition (low probability)

The browser walkthrough observed that when navigating to Q2 via certain paths, the "Previous" button was momentarily replaced by the invisible spacer (same as Q1). Code analysis confirms a theoretical race window:

- `hasPreviousQuestion` is derived from `navigator` (async-fetched) + `currentQuestionId` (state)
- If the new question loads before the navigator refetch completes, `currentQuestionId` updates but `navigator` is stale
- The `useMemo` runs against stale data: `findIndex` returns -1 for the new question ID → `previousQuestionId` = null → spacer renders instead of "Previous"

**Mitigating factors:** Both navigation paths (Next button and Question Navigator) use the same `onNavigateQuestion` handler. The navigator refetches immediately on `questionId` change. The race window is typically <100ms. Buttons are disabled during loading via `isNavigationDisabled`.

**Simple fix:** Derive `hasPreviousQuestion` from `sessionInfo.index > 0` instead of from the navigator lookup. This eliminates the navigator dependency entirely:
```typescript
// Current (navigator-dependent, race-prone):
hasPreviousQuestion={previousQuestionId !== null}

// Proposed (index-based, race-free):
hasPreviousQuestion={sessionInfo?.index > 0}
```

**Severity:** Low — hard to reproduce in normal usage, but trivial to fix.
**Files:** `practice-session-page-view.tsx` lines 67-82, 247

### D-4c: Responsive layout breaks header "Review answers" position

At narrower widths, the "Review answers" header button drops from the right-side position to below the heading, changing the visual hierarchy. Users could miss it or confuse it with a different element.

**Severity:** Low. Only affects narrow viewports; the action bar at the bottom is always available.
**Recommendation:** Track with D-4a as part of a responsive audit.

---

## Out of scope

These items were observed during the same walkthrough but are tracked elsewhere or are separate concerns:

- **Tutor mode button timing** (DEBT-318): Bookmark visible before feedback
- **Post-exam reattempt suppression** (AF-6 in BS-055): "Practice Again" / "Try Again" in post-exam review
- **Periodic autosave / `visibilitychange` saves** (future enhancement noted in interaction contracts)
- **Downstream post-submit flows** (summary, history, question review navigation): Require their own walkthrough and separate debt tracking

---

## Implementation notes

- D-1 is a pure frontend refinement and can ship independently.
- D-2 and D-3 are **not** mere implementation drift; both intentionally reopen the current BS-055 / interaction-contract SSOT. If either lands, the docs must change in the same PR.
- All three D-1/D-2/D-3 issues are frontend-local in production code — no backend/use-case/repository changes needed.
- D-2 requires updating test assertions that currently match the literal `Review answers` label. If renamed, also update the flow naming chain (button → page heading → CTA) for consistency.
- D-3 requires updating the interaction contract if the "intentional duplication" decision is reversed.
- If D-2 and D-3 are done together, the rename + deduplication can land in one PR.
- D-4b (Previous button race condition) is a one-line fix (`sessionInfo.index > 0`) that can ship independently in any PR touching this area.
- D-4a and D-4c (responsive issues) should be tracked as a separate responsive audit debt item — they affect more than just the exam action bar.
- ~~Before implementation, rerun the blocked browser walkthrough~~ — **Done.** Browser verification completed 2026-03-18 via Claude-in-Chrome on the `dev` Vercel preview. All items visually confirmed.
