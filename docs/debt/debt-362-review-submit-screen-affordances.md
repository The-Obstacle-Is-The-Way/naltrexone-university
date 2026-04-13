# DEBT-362: Review & Submit Screen Return Affordance Gap

**Priority:** P3
**Created:** 2026-04-11
**Status:** Open
**Affected surface:** `ExamReviewView` (`app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx`)
**Verified by:** Browser walkthrough on 2026-04-11 plus code trace

---

## Problem

`ExamReviewView` gives the user a clear `Submit exam` action, but it does not provide an equally explicit "continue reviewing" action outside the clickable question rows.

The current screen is not a dead end:

- each available row is a real `<button>`
- the rows have hover and focus styles
- the submit confirmation dialog includes `Keep reviewing`

But the primary return path is still implicit. A user has to infer that the question list itself is the way back into question editing.

---

## Verified Current Implementation

In [exam-review-view.tsx](/Users/ray/Desktop/github/naltrexone-university-3/app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx:167):

- every available question row renders as a `<button>` that calls `onOpenQuestion(row.questionId)`
- the footer renders only `Submit exam`
- the confirm dialog exposes `Keep reviewing` as a cancel action

The earlier draft of this debt doc overstated the accessibility issue. The row buttons are **not unnamed**:

- the visible row text sits inside the button
- the `sr-only` prefix adds `Open question`
- there is no `aria-hidden` on the row content

So this is not a WCAG 4.1.2 "button with no accessible name" failure. The gap is primarily discoverability and affordance.

---

## What Still Feels Weak

### 1. No dedicated return CTA

The footer presents the irreversible action (`Submit exam`) without a sibling action that explicitly says "keep reviewing" or "return to questions."

### 2. The list itself carries the burden of explanation

The question rows are interactive, but the screen does not tell the user that selecting a row is how they return to a question. The affordance depends on pattern recognition.

---

## Decision

DEBT-362 will ship as Option A plus a light-touch Option B. Add one short instructional sentence above the question list telling the student that selecting a row is how they continue reviewing before they submit, and add a subtle trailing chevron to each available row. The chevron earns its place because the interactive row buttons and the non-interactive unavailable cards in [exam-review-view.tsx](/Users/ray/Desktop/github/naltrexone-university-3/app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx:197) currently render with nearly identical card treatment; the chevron is not decoration, it disambiguates "this opens a question" from "this is a display-only card" at a glance.

Option C is rejected, but for product-design reasons rather than architecture. A generic `Continue reviewing` footer button is semantically ambiguous because it does not tell the student which question will open, and any implicit default would surprise some users. It would also compete visually with `Submit exam` at the exact checkpoint moment. Public references from UWorld, ARDMS, and AMBOSS show that comparable exam-review surfaces can expose explicit review shortcuts, so the earlier "real board-exam platforms keep the footer to a single action" rationale was unsupported and is removed.

- Add one short instructional sentence above the list. Exact wording is an implementation detail, but it must tell the student that selecting a row is how they keep reviewing before submitting.
- Add a subtle trailing chevron icon only on available rows. The chevron must be decorative, `aria-hidden="true"`, and must not change the computed accessible name of the row button.
- Do not add visible per-row `Continue reviewing` microcopy.
- Do not add new `aria-label` overrides or `aria-describedby` attributes on the row buttons. Keep the existing `sr-only` `Open question ` prefix.

## Future Escalation

If Option A plus the light-touch chevron proves insufficient in practice, the correct escalation path is targeted shortcuts above the list, for example `Review unanswered` and `Review marked`, rather than a generic footer `Continue reviewing` button. That better matches exam-platform precedent because each shortcut has an unambiguous target and avoids competing with `Submit exam` in the footer. It is not part of the current fix because it requires product-policy decisions about which shortcuts to expose, in what order, and how empty states behave, and the current fix should ship small; if this is ever picked up, it should be tracked as a new debt item with its own ID rather than an amendment to DEBT-362.

---

## Files Affected

| File | Change |
|------|--------|
| `app/(app)/app/practice/[sessionId]/components/exam-review-view.tsx` | Add explicit helper copy and/or stronger row affordance |
| `app/(app)/app/practice/[sessionId]/components/exam-review-view.test.tsx` | Update markup assertions if helper text or new cues are added |
| `app/(app)/app/practice/[sessionId]/components/exam-review-view.browser.spec.tsx` | Update browser assertions if the visible guidance changes |

No `aria-label` remediation is required for correctness based on the current code.

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-11 | Corrected the accessibility claim | The question-row buttons already expose accessible text through their button content. |
| 2026-04-11 | Reframed the debt as discoverability/affordance, not missing accessible names | That matches the actual code and the observed UX issue. |
| 2026-04-11 | Kept severity at P3 | The user is not blocked, but the current screen makes the return path more implicit than it needs to be. |
| 2026-04-13 | Locked decision on Option A + light Option B | Add explicit helper copy plus a subtle decorative chevron to make the return path explicit without changing flow or accessible names. |
| 2026-04-13 | Rejected Option C for semantic ambiguity and footer competition, not prop plumbing or false platform-precedent claims | A generic continue-reviewing footer action has an unclear target and would compete with Submit exam at the checkpoint moment. |
| 2026-04-13 | Recorded targeted-shortcuts as future escalation path, not part of this fix | Targeted shortcuts are the right escalation if this ships and still underperforms, but they require separate product-policy decisions and should get their own debt item. |
