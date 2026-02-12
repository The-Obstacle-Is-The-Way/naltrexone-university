# BS-011: History Review Wiring Bug & Choice Label Randomization Desync

**Date:** 2026-02-11
**Triggered by:** Systematic Chrome browser audit of all review mode entry points and feedback rendering
**Scope:** Two related-but-independent bugs found during the same audit session
**Related:** BS-009 (session navigation gap), BS-010 (attempt identity gap), SPEC-023 (question review mode)

---

## Bug A: History Questions Tab — Incorrect Questions Missing `&mode=review`

### The Problem

On the History > Questions tab (`/app/history?tab=questions`), **all Incorrect questions are missing `&mode=review` in their URLs**. Both the question title link and the action button route users to a blank attempt form instead of review mode. Correct questions on the same tab work perfectly.

This is isolated to the History Questions tab. Dashboard Recent Activity and Sessions Breakdown entry points handle the same Incorrect questions correctly.

### Evidence (Verified on Live Deployment)

| Question | Status | History Questions Tab URL | Dashboard URL (same question) |
|---|---|---|---|
| palamar-2023-001 | Incorrect | `/app/questions/palamar-2023-001?from=history` | `/app/questions/palamar-2023-001?from=dashboard&mode=review` |
| stahls-zaleplon-001 | Incorrect | `/app/questions/stahls-zaleplon-001?from=history` | `/app/questions/stahls-zaleplon-001?from=dashboard&mode=review` |
| stahls-zaleplon-002 | Incorrect | `/app/questions/stahls-zaleplon-002?from=history` | N/A |
| kelly-2020-010 | Incorrect | `/app/questions/kelly-2020-010?from=history` | N/A |
| rimawi-hamlin-2025-009 | Incorrect | `/app/questions/rimawi-hamlin-2025-009?from=history` | N/A |
| stahls-zaleplon-003 | Correct | `/app/questions/stahls-zaleplon-003?from=history&mode=review` | N/A |
| stahls-zaleplon-004 | Correct | `/app/questions/stahls-zaleplon-004?from=history&mode=review` | N/A |

Pattern: **100% of Incorrect questions are broken, 100% of Correct questions work.** There are zero paths to review mode for Incorrect questions from this tab — both the title link and the action button route to the same broken URL.

### What the User Sees

**Incorrect question (broken):**
- Click title or "Reattempt" button
- Page loads as a fresh attempt form: all choices neutral/unselected, "Submit" button at bottom
- No feedback card, no indication of previous answer, no explanation
- Subtitle misleadingly says "Reviewing a question from your history." despite being in attempt mode

**Correct question (working):**
- Click title or "Review" button
- Page loads in review mode: choices locked, previous answer highlighted with green border, Feedback card renders immediately with badge, explanation, clinical pearl, per-choice breakdowns

### Root Cause (Suspected)

The component that renders the question list on the History Questions tab has a conditional branch based on result status:

```
if (result === 'correct') {
  buttonLabel = 'Review'
  href = `/app/questions/${slug}?from=history&mode=review`
} else {
  buttonLabel = 'Reattempt'
  href = `/app/questions/${slug}?from=history`  // BUG: missing &mode=review
}
```

The developer made a deliberate distinction — assuming "Incorrect = user wants to try again" — but that's backwards. A physician who got something wrong primarily wants to review *why* they got it wrong, not immediately reattempt blind.

### Where to Look in Code

- The History Questions tab component: `app/(app)/app/history/components/history-questions-tab.tsx`
- Look for the link/href generation logic per question row
- Compare with how Dashboard Recent Activity builds its links (correctly appends `&mode=review` for all items)
- Compare with Sessions Breakdown links (also correct)

### Proposed Fix

1. **Question title link:** ALWAYS include `&mode=review` regardless of Correct/Incorrect status. Clicking a question title from history is a review action — "show me what happened."

2. **Incorrect questions — button behavior (two options):**
   - **Option A (minimal):** Keep "Reattempt" button as-is (no `&mode=review`), but make the title link include `&mode=review`. This gives Incorrect questions two paths: title = review, button = reattempt.
   - **Option B (better UX):** Show TWO buttons for Incorrect questions — "Review" (with `&mode=review`) and "Reattempt" (without). Makes both actions explicitly available.

3. **Subtitle text (minor polish):** When in reattempt mode (no `&mode=review`), the subtitle should say something like "Reattempting a question" rather than "Reviewing a question from your history."

---

## Bug B: Choice Letter Randomization Desync Between Question Card and Feedback Card

### The Problem

When a question's choices are randomized/shuffled for display, **the question card and the feedback card's "Why other answers are wrong" section use two different orderings.** The question card renders choices in the shuffled order and assigns A/B/C/D labels based on that position. But the feedback card assigns its letter labels using a different ordering — likely the original/canonical order from the database, or a second independent shuffle.

This affects **all questions**, **all entry points**, both Correct and Incorrect. It's a global rendering bug.

### Evidence

**Question: palamar-2023-001**

Question card (shuffled display order):
- A = Alcohol (red border — user's incorrect pick)
- B = Benzodiazepines
- C = Gamma-hydroxybutyrate/GHB (green border — correct answer)
- D = Cannabis

Feedback card "Why other answers are wrong":
- B) Cannabis — but Cannabis is **D** in the question card
- C) Benzodiazepines — but Benzodiazepines is **B** in the question card
- D) Alcohol — but Alcohol is **A** in the question card

The explanation text for each answer is correct (the Cannabis explanation discusses Cannabis). Only the **letter labels are scrambled** relative to the question card.

**Question: stahls-zaleplon-003**

Question card (shuffled display order):
- A = Increase zaleplon dose to 20 mg...
- B = Reduce zaleplon to 5 mg... (green border — correct, user chose this)
- C = No adjustment needed...
- D = Cimetidine is contraindicated...

Feedback card "Why other answers are wrong":
- B) No adjustment needed... — but "No adjustment" is **C** in the question card
- C) Increase zaleplon dose to 20 mg... — but "Increase" is **A** in the question card
- D) Cimetidine is contraindicated... — happens to match D (coincidence)

Same pattern. Confirmed on both Correct and Incorrect questions, from both Dashboard and History entry points.

**Additional verification (re-verified live):**

| Question | Status | Entry Point | Letter Desync? |
|---|---|---|---|
| palamar-2023-001 | Incorrect | Dashboard | Yes — mismatched |
| stahls-zaleplon-003 | Correct | History Questions | Yes — mismatched |
| stahls-zaleplon-004 | Correct | History Questions | Yes — mismatched |
| stahls-serdexmethylphenidate-001 | Correct | Sessions Breakdown | Yes — mismatched |

**4 out of 4 questions tested, 100% reproduction rate**, across Correct and Incorrect results, across Dashboard, History Questions, and Sessions Breakdown entry points. Zero were correct by coincidence. This is a **deterministic logic bug** — not random or intermittent.

### Root Cause (Suspected)

Two separate orderings exist and they're not synced:

1. **Question card:** Shuffles the choices at some point (on attempt creation, on page load, or stored in the attempt record) and renders them as A/B/C/D in that shuffled order. This is what the user sees and interacts with.

2. **Feedback card:** The "Why other answers are wrong" section iterates over the non-correct choices and labels them B/C/D sequentially — but it's iterating in a **different order**. Most likely it's pulling from the original question data (canonical authoring order) rather than using the shuffled order from the attempt.

Pseudocode of the bug:
```typescript
// Question card component:
const shuffledChoices = shuffle(question.choices, attemptSeed)
// Renders A=shuffledChoices[0], B=shuffledChoices[1], etc.

// Feedback component (WRONG):
const wrongChoices = question.choices.filter(c => c.id !== correctId)
// Labels them B, C, D in ORIGINAL order — doesn't know about the shuffle

// Feedback component (CORRECT FIX):
const wrongChoices = shuffledChoices.filter(c => c.id !== correctId)
// Labels them using the same shuffled positions from the question card
```

### Where to Look in Code

1. **Find how the question card renders its choices** — there's a shuffle/randomization step that maps original choice indices to displayed A/B/C/D positions. This shuffle mapping needs to be captured or passed down.

2. **Find the Feedback component** that renders "Why other answers are wrong" — it's iterating over the incorrect choices and assigning letter labels. It needs to use the same shuffle mapping, not the original/canonical order.

3. **The shuffle mapping is the key.** Either:
   - It's stored in the attempt record (`shuffled_order` or `choice_map`) and the Feedback component isn't reading it
   - It's computed at render time for the question card but not passed to the Feedback component
   - It's computed independently in both places using different seeds or different logic

### Proposed Fix

Pass the shuffled choice order (or the shuffle mapping) from the question card context into the Feedback component. The "Why other answers are wrong" section must label each choice with the letter it was assigned in the question card's displayed order, not the database/canonical order.

Alternatively, pass fully resolved data to the feedback component: "Here are the wrong answers, and here are their displayed letters." Don't let it recompute the letters independently.

---

## Severity Assessment

### Bug A (Missing `&mode=review`)
**High.** This breaks the most common use case — physicians reviewing what they got wrong. Every single Incorrect question on the History Questions tab is affected. The History Questions tab is the primary entry point for "what did I get wrong across all my studying?"

### Bug B (Choice Label Desync)
**Medium-High.** The correct answer is still identifiable by border color, and the explanation text is accurate. But the letter labels create confusion: a user who reads "B) Cannabis" in the feedback and looks up at B in the question card sees "Benzodiazepines," not Cannabis. For a medical education platform, this kind of mislabeling is unacceptable.

### Combined Impact
These two bugs together mean that even when a physician successfully reaches review mode, the feedback they see has scrambled letter labels. The "learn from mistakes" loop — the entire reason review mode exists — is doubly broken: hard to reach (Bug A) and confusing when you get there (Bug B).

---

## Verification Plan

### Bug A Verification
1. Go to `/app/history?tab=questions`
2. Find any Incorrect question
3. Hover over the question title — confirm the href contains `&mode=review`
4. Click the question title — confirm review mode loads (choices locked, previous answer shown, Feedback card visible)
5. Go back, click the "Reattempt" button — confirm it loads as a fresh form (if Option A was chosen)
6. Repeat for a Correct question to confirm no regression
7. Test Dashboard and Sessions entry points to confirm no regression

### Bug B Verification
1. Open any question in review mode
2. Note the A/B/C/D to answer text mapping in the question card
3. Scroll to "Why other answers are wrong" in the feedback card
4. Confirm every letter label in the feedback matches the same answer text in the question card
5. Test across multiple questions to ensure consistent

---

## Relationship to Other Brainstorming Docs

| Doc | Relationship |
|-----|-------------|
| BS-009 (Session Review Navigation Gap) | **Sibling issue.** BS-009 covers the broader session navigation flow (back links, sequential next/prev). Bug A here is a simpler, more targeted wiring bug on one specific entry point. BS-009's fix (adding `sessionId` to URLs) is additive and won't fix Bug A — they're independent. |
| BS-010 (Review Mode Attempt Identity Gap) | **Sibling issue.** BS-010 covers multi-attempt questions showing the wrong attempt. Bug B here is about letter label ordering within a single attempt — different root cause entirely. |
| SPEC-023 (Question Review Mode) | **Predecessor.** SPEC-023 built review mode. Both bugs are post-SPEC-023 issues: Bug A is a wiring gap in one entry point, Bug B is a rendering gap in the feedback component. |

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-11 | Documented as brainstorming, not spec or bug report | User preference for cognitive consistency; these may be rolled into a broader fix spec alongside BS-009/BS-010 |
| 2026-02-11 | Validated via live Chrome browser audit with screenshots | Both bugs confirmed visually on deployed application across multiple questions and entry points |
| 2026-02-11 | Classified as two separate bugs in one doc | Discovered during the same audit session; both relate to History Questions tab review experience but have independent root causes |
| 2026-02-11 | Re-verified by Chrome agent; BS-011 confirmed 100% accurate | Bug A: all details correct, zero paths to review for Incorrect questions confirmed. Bug B: 4/4 questions tested across all entry points, 100% deterministic reproduction rate. Subtitle text bug already captured. |
