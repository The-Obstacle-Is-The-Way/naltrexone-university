# DEBT-337: Future Feedback & Practice Session Enhancements

**Priority:** P4
**Created:** 2026-03-24
**Source:** [DEBT-275](../_archive/debt/debt-275-bs033-residual-open-items.md) (Future Enhancement Ideas F2/F3/F5/F6/F7)
**Scope:** Five deferred enhancements identified during BS-033 analysis. None are bugs — all are polish or new features. Build when prioritized.

**Audit verified:** 2026-04-27 against `87284372`.
**Re-verified accurate against `ddad8eee` on 2026-07-18.**

---

## Context

These were identified during the BS-033 question display and feedback UX audit. Three sibling enhancements (F1: clinical pearl callout, F4: question counter, F8: correct-answer card) have already shipped. The remaining five are parked here for future consideration.

---

## Enhancements

### F2: Clinical Pearl as Separate Seed Field

**Current:** The `<Markdown>` component detects `**Clinical pearl:**` patterns inline and renders them as styled callouts.

**Enhancement:** Parse the clinical pearl at seed time (like `reference_md`), store as its own database column, and render it as a first-class field rather than relying on regex detection in the markdown renderer.

**Benefit:** Cleaner data model, enables future features like "browse all clinical pearls" or pearl-specific search. No visible change to the learner initially.

---

### F3: Reference Section Styling Improvements

**Current:** The reference/citation text renders at the bottom of the feedback block in a small, basic format.

**Enhancement:** Improve the visual hierarchy — better label/content separation, link styling for DOIs (when added), and readability improvements.

**Benefit:** Visual polish. Low priority.

---

### F5: Running Score Tracker

**Current:** Learners see their score only at the end of a session (summary page).

**Enhancement:** Show "3/5 correct so far" as a running tally during practice sessions. Applicable to **tutor mode only** — exam mode should not reveal scoring mid-session.

**Benefit:** Motivational feedback loop. Learners can gauge their performance as they go rather than waiting until the end.

---

### F6: Post-Submit Question Card Collapse

**Current:** After submitting an answer, both the question card and feedback card are visible, requiring scrolling — especially on mobile.

**Enhancement:** Collapse or minimize the question card after submission so the feedback section is immediately visible without scrolling.

**Benefit:** Reduces scroll distance to reach feedback. Particularly valuable on mobile where screen real estate is limited.

---

### F7: Difficulty / Topic Tag Display

**Current:** Questions have difficulty levels and topic tags in the database, but these are not shown on the question card during practice.

**Enhancement:** Display difficulty level (easy/medium/hard) and/or topic tags on the question card so learners know what they're working with.

**Benefit:** Informational context. Helps learners understand the expected challenge level and subject area before answering.

---

## Minor Edge Case (from DEBT-275)

### Direct URL Context Mismatch

Hitting `/app/questions/<slug>` directly (no query params) shows dashboard review copy ("Review a question from your recent activity." / "Back to Dashboard") but renders submit-mode controls. Internally inconsistent, but requires manual URL entry — not reachable through normal app navigation.

**Severity:** Cosmetic. No user impact in practice. Fix if convenient during related work.

---

## Acceptance Criteria

These are individual enhancements — each would be its own PR when prioritized. No action required now.
