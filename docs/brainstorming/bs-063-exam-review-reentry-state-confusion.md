# BS-063: Exam Review Re-Entry State Confusion

**Date:** 2026-04-11
**Triggered by:** User walkthrough of exam flow end-to-end. After completing an exam, the initial post-exam review and the re-entry review (from "Review your answers" on Session Summary) present different button sets and cursor positions, making them feel like different experiences despite using the same component. The user described it as "we're getting crossed here — different states in our state machine, and the review is getting confused with going back to review."
**Scope:** The exam results re-entry path has no spec, no contract, and no cursor/label reset — it's an undocumented loop in a state machine that already has 38 hooks managing 4 screens.
**Related:** [BS-061](./bs-061-review-surface-divergence-audit.md) (review surface divergence — Direction C), [DEBT-350](../_archive/debt/debt-350-exam-results-session-continuity.md) (exam results continuity, resolved), [DEBT-359](../debt/debt-359-session-summary-cta-labels.md) (Session Summary CTA label clarity)

---

## Complete User Flow Map

### Tutor Mode (for contrast — simpler, no review stage)

```
1. Practice setup → pick "Tutor", select question count
2. Question flow → answer each question → see feedback IMMEDIATELY after each answer
3. End session → Session Summary (stats, breakdown)
4. CTAs: [Back to Practice] [View in History]
```

Tutor mode is linear. No review stage, no substages, no re-entry loop. Tutor mode bypasses the review stage state hook entirely — `onEndSession()` calls `finalizeSessionSafely()` directly (`use-practice-session-review-stage-state.ts:111-118`).

### Exam Mode (where the confusion lives)

```
1. Practice setup → pick "Exam", select question count
2. Question flow → answer questions (NO feedback shown during session)
3. Click "Finish exam" → Review & Submit screen (ExamReviewView)
   - See all answers, can change them
   - Click "Submit exam"
4. → POST-EXAM REVIEW (PostExamReviewView) — AUTOMATIC ENTRY
   - Score banner: "Score: 33% (1/3)"
   - Question navigator pills (1, 2, 3)
   - Full feedback, explanations, reference
   - Navigation: Previous / Next / "Finish review" (on last question)
   - Bookmark button
   - "View Summary" ghost button in header
5. Navigate through all questions → on last question, click "Finish review"
6. → SESSION SUMMARY (SessionSummaryView) — stats, breakdown
   - CTAs: [Review your answers] [Back to Practice] [View in History]
7. Click "Review your answers"
8. → POST-EXAM REVIEW AGAIN (same PostExamReviewView) — RE-ENTRY
   - Same component, same data
   - BUT: different starting position (persisted cursor → last question)
   - BUT: same "Finish review" label (semantically wrong — already finished)
9. Navigate or click "Finish review" again
10. → SESSION SUMMARY again — creating an infinite loop
```

**The confusion is in steps 4 vs 8.** Both render `PostExamReviewView`, but they feel different because of cursor position and button context.

**The loop between steps 6-10 is unbounded and unspecified.** No interaction contract defines this cycle.

---

## The Problems

### Problem 1: The re-entry loop has no contract

The interaction contracts doc (`docs/practice-engine/interaction-contracts.md:258-268`) describes summary-launched review as:

```
Route shape: /app/questions/[slug]?from=summary&mode=review&sessionId=...
The question review page resolves its return path back to the session summary, not History
```

**This is stale.** DEBT-350 (resolved 2026-04-08) changed this to an in-session callback re-entry via `onReenterPostExamReview`. The user never leaves the `/app/practice/[sessionId]` route. The contracts still describe the pre-DEBT-350 behavior.

The actual re-entry path — Summary → PostExamReviewView → Summary → PostExamReviewView — is:
- Not documented in interaction contracts
- Not specified in any decision record
- Has no defined cursor semantics (reset vs preserve)
- Has no defined button label semantics (initial vs re-entry)
- Has no defined load behavior (fresh fetch vs cached payload)

**This is the primary root cause.** Every specific symptom flows from this gap. The cursor doesn't reset because no one specified it should. The labels don't change because no one specified they should. These aren't oversights — they're consequences of a state transition that was implemented without a product spec.

### Problem 2: Re-entry cursor lands on last question, not first

**What the user sees:**
- Step 4 (initial review): Lands on Q1. Bottom bar shows `[Next] [Bookmark]`.
- Step 8 (re-entry): Lands on Q3 (last question). Bottom bar shows `[Previous] [Finish review]`.

**Code path:** `onReenterPostExamReview()` in `use-practice-session-exam-results-continuity.ts:192-206` resolves the cursor with `persistedQuestionId: postExamReviewCurrentQuestionId`. The persisted ID is always the last question (since "Finish review" only appears on the last question, and that's what the user clicked to leave).

Initial entry via `enterPostExamReview()` (line 225-234) passes no persisted ID, so it falls through to first available → Q1.

### Problem 3: "Finish review" label is wrong on re-entry

`PostExamReviewView` has no concept of "initial" vs "re-entry" (`post-exam-review-view.tsx:162-170`). The label is hardcoded to "Finish review" regardless of how many times the user has already finished. On re-entry, this button just goes back to the summary — it should say "Back to Summary."

### Problem 4: Stale interaction contracts mask the real behavior

Because the contracts describe route-based review (`/app/questions/[slug]?from=summary`) instead of in-session re-entry, any future developer consulting them will build the wrong mental model. Changes to the review flow will be validated against a spec that doesn't match the code, producing more artifacts like the ones documented here.

---

## Root Cause Analysis

### The real root cause: Accumulated complexity without contract maintenance

The exam flow has been through 5 rounds of architectural refinement:

| Round | What it solved | State added | Contract updated? |
|-------|---------------|-------------|-------------------|
| BS-055 → DEBT-321 | Exam interaction model overhaul | `isInReviewStage`, review load/error, session mode | Yes — interaction-contracts.md written |
| BS-058 | Post-submit flow reorder (review before summary) | `post_exam_review` / `session_summary` substages | Partially — contracts note post-exam review exists |
| BS-061 → DEBT-350 | Review surface divergence (keep review in-session) | `pendingExamSummary`, `postExamReview`, `postExamReviewLoadState`, `postExamReviewCurrentQuestionId`, re-entry callbacks | **No — contracts still describe route-based review** |
| DEBT-353 | Orchestrator decomposition | Renderer extraction | N/A — structural refactor |
| DEBT-352 | Focus-ring flash | Removed `focusVisible: true` | N/A — bug fix |

Each round correctly solved the identified structural problem. But DEBT-350 — the one that introduced the re-entry loop — never updated the interaction contracts. The loop was implemented and tested at the browser level but never specified at the product level.

### Complexity audit

**38 state management hooks** across 3 files manage 4 screens + 3 async operations:

| Hook file | useState | useRef | useCallback | Total |
|-----------|----------|--------|-------------|-------|
| `use-practice-session-review-stage.ts` | 2 | 2 | 8 | 12 |
| `use-practice-session-review-stage-state.ts` | 3 | 1 | 7 | 11 |
| `use-practice-session-exam-results-continuity.ts` | 5 | 2 | 8 | 15 |
| **Total** | **10** | **5** | **23** | **38** |

10 state variables, 5 refs, and 23 callbacks to manage:
- 4 screens (question flow, Review & Submit, post-exam review, session summary)
- 3 async operations (review load, feedback load, session finalization)
- 2 substage transitions (post_exam_review ↔ session_summary)

This is the complexity-to-surface ratio that makes local reasoning insufficient. Any change to one hook affects the others through callback dependencies. The re-entry cursor behavior is a 1-line fix in isolation, but understanding *why* it's wrong requires tracing through all 3 hooks.

### Why this keeps happening

The pattern repeats because each round:
1. Identifies a structural problem (correct)
2. Adds state to solve it (correct)
3. Tests the new state transitions at the browser level (correct)
4. **Does not update the interaction contracts** (the gap)
5. **Does not revisit UX details of existing states for new entry paths** (the consequence)

Without updated contracts, the next round has no spec to validate against, so it repeats the pattern. The contracts say one thing, the code does another, and the user sees the mismatch.

### Additional risks found in adversarial trace

| Risk | Location | Severity |
|------|----------|----------|
| Entire `reviewStage` object in `onFinalizeReview` dependency array — recreated frequently, stale closure risk under high latency | `use-practice-session-review-stage.ts:237` | Low (isMounted guard catches most cases) |
| Silent failure if `finalizeExamSessionForPostReview` returns null — no error shown, UI stuck | `use-practice-session-review-stage.ts:231` | Low (finalization has its own error handling) |
| Cached `postExamReview` reused on re-entry without revalidation — correct for current flow but fragile if questions change | `use-practice-session-exam-results-continuity.ts:197-206` | Low (questions don't change mid-session) |
| No unit tests for `onReenterPostExamReview` logic — all coverage is browser-level integration | `use-practice-session-review-stage.browser.spec.tsx:476-713` | Medium (correct behavior verified, but no isolated tests for edge cases) |

These are not urgent, but they're symptoms of the same pattern: state added without contracts.

---

## Severity Assessment

**Severity:** P2 (user trust erosion, not just polish)

- **Affects every exam session:** Any user who finishes an exam → views summary → clicks "Review your answers" hits this.
- **Undermines confidence:** The user perceives state confusion ("something is really, really strange and fucked up here"), which erodes trust in the product even though the underlying behavior is technically correct.
- **Compounds with DEBT-359:** The ambiguous "Back to Practice" label on Session Summary, combined with the re-entry state confusion, makes the entire post-exam flow feel unfinished. Both need to ship together.
- **Stale contracts are a maintenance hazard:** Future developers will build the wrong mental model from the interaction contracts, producing more artifacts in the same flow.

Elevated from P3 because this isn't recoverable polish — it's a pattern that produces new bugs each round.

---

## Proposed Fixes

### Fix 1: Update the interaction contracts (prerequisite)

Before any code change, update `docs/practice-engine/interaction-contracts.md` Section 5 to document the actual re-entry behavior:
- State machine: `post_exam_review ↔ session_summary` (bidirectional)
- Cursor semantics: reset to Q1 on "Review Answers" re-entry, land on specific question for breakdown row click
- Load behavior: reuse cached feedback payload on re-entry, lazy-hydrate if missing (page refresh)
- Button labels: "Finish review" on initial, "Back to Summary" on re-entry
- Request safety: deduplicated via `latestPostExamReviewRequestIdRef`

This is the fix that prevents the next round from repeating the pattern.

### Fix 2: Reset cursor on "Review Answers" re-entry

In `onReenterPostExamReview`, when called without a `questionId`, pass `persistedQuestionId: null` so it falls through to first available:

```typescript
// use-practice-session-exam-results-continuity.ts — onReenterPostExamReview
persistedQuestionId: questionId ? postExamReviewCurrentQuestionId : null,
```

### Fix 3: Context-aware "Finish review" / "Back to Summary" label

Track whether the user has visited `session_summary` at least once. Pass a flag to `PostExamReviewView` so the last-question button reads "Back to Summary" on re-entry. The header "View Summary" ghost button can use the same flag.

### Fix 4: Combine with DEBT-359 label changes

Ship together with "Review your answers" → "Review Answers" and "Back to Practice" → "New Session" so the entire Summary ↔ Review round-trip feels intentional.

---

## Open Questions

| # | Question | Leaning |
|---|----------|---------|
| Q1 | Should re-entry from a **breakdown row click** also reset to Q1, or land on the clicked question? | **Land on clicked question.** The user has a specific question in mind. `requestedQuestionId` already handles this correctly. |
| Q2 | Should the header "View Summary" button also change label on re-entry? | **Yes.** "Back to Summary" on re-entry. Consistency with the bottom-bar label. |
| Q3 | Should initial entry always start at Q1, or start at the first incorrect question? | **Q1 for now.** Starting at the first incorrect is a future enhancement. Park it. |
| Q4 | Is the 38-hook complexity a problem that needs structural intervention (e.g., XState), or is it manageable with contracts? | **Contracts first.** The hooks are well-decomposed and tested. The problem is the missing spec, not the number of hooks. If artifacts persist after contract-first development, reconsider. |
| Q5 | Should "Review Answers" be demoted to secondary CTA on Session Summary? | **Maybe.** The user already reviewed everything during initial post-exam review. "New Session" might be the higher-intent action. But this is a separate product decision — park it for now. |

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-11 | Primary root cause is stale interaction contracts, not just cursor behavior | DEBT-350 introduced the re-entry loop without updating contracts; cursor/labels are consequences |
| 2026-04-11 | Elevated severity from P3 → P2 | User trust erosion, not just polish; pattern repeats each architecture round |
| 2026-04-11 | Interaction contracts update is a prerequisite for code changes | Without updated contracts, any fix is another undocumented behavior that the next round will break |
| 2026-04-11 | Cursor reset on untargeted re-entry, preserve on breakdown row click | Untargeted re-entry ("Review Answers" button) is a fresh-pass intent; breakdown row click is a specific-question intent |
| 2026-04-11 | Context-aware button labels via re-entry flag | "Finish review" → "Back to Summary" on re-entry; same flag for header "View Summary" button |
| 2026-04-11 | Pair with DEBT-359 for shipping | Label changes across the Summary ↔ Review round-trip should land together for a coherent experience |
| 2026-04-11 | Browser agent walkthrough surfaced 3 additional debt items | [DEBT-360](../debt/debt-360-action-bar-below-fold.md) (action bar below fold), [DEBT-361](../debt/debt-361-exam-last-question-next-label.md) (last-question "Next" label), [DEBT-362](../debt/debt-362-review-submit-screen-affordances.md) (Review & Submit discoverability/a11y) — all verified against code |
