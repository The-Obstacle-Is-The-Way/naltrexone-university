# BS-011: History Review Wiring Bug & Choice Label Randomization Desync

**Date:** 2026-02-11
**Last Verified:** 2026-02-12 (code audit)
**Triggered by:** Systematic Chrome browser audit of all review mode entry points and feedback rendering
**Scope:** Two related-but-independent bugs found during the same audit session
**Related:** BS-009 (session navigation gap), BS-010 (attempt identity gap), SPEC-023 (question review mode)

---

## Bug A: History Questions Tab — Result-Dependent Review Wiring (`mode=review` only for Correct)

### The Problem

On the History > Questions tab (`/app/history?tab=questions`), the question links are **result-dependent**:

- **Correct** rows include `mode=review` (label: **Review**)
- **Incorrect** rows omit `mode=review` (label: **Reattempt**)

Both the question title link and the action button share the same `href` for a row.

This is isolated to the History Questions tab. Dashboard Recent Activity and Session Breakdown links always include `mode=review` for review entry points (regardless of correctness).

### Evidence (Verified in Code)

- History Questions tab conditional wiring: `app/(app)/app/history/components/history-questions-tab.tsx:330-368`
- Dashboard uses review mode on links: `app/(app)/app/dashboard/page.tsx:208-213`
- Session breakdown uses review mode on links: `app/(app)/app/shared/components/session-breakdown-list.tsx:23-25`
- Question page subtitle for `from=history` does not vary by `mode`: `app/(app)/app/questions/[slug]/question-page-client.tsx:44-50`

### What the User Sees

**Incorrect question (current behavior):**
- Click title or "Reattempt"
- Page loads as a fresh attempt form: all choices neutral/unselected, "Submit" visible
- Subtitle still says "Reviewing a question from your history." despite being in attempt mode

**Correct question (current behavior):**
- Click title or "Review"
- Page loads in review mode: previous answer pre-selected and Feedback renders on load

### Root Cause (Confirmed)

The History Questions tab intentionally chooses review vs reattempt based on `row.isCorrect`. The missing `mode=review` for incorrect rows is an explicit conditional, not a missing query param.

### Proposed Fix (Product + UX)

> **Spec status:** Bug A is specced as `docs/specs/spec-026-history-review-only.md`.
> The v1 decision there is **review-only** History > Questions links (always `mode=review`,
> always label "Review"), relying on Practice-based reattempt via the "Incorrect" status
> filter (`docs/specs/spec-024-question-status-filter.md`). The multi-action approach below
> is deferred.

1. **Make the title link review-only:** Always include `mode=review` on the stem/title link for both Correct and Incorrect rows; keep the action button as "Review"/"Reattempt".
2. **Offer both actions for Incorrect rows:** Add an explicit "Review" path (with `mode=review`) alongside "Reattempt" (without).
3. **Subtitle copy:** Update the question page subtitle for `from=history` to reflect `mode` (review vs reattempt), not just `from`.

---

## Bug B: Choice Label Desync Between Question Card and Feedback Card (Standalone Question Page)

### The Problem

On the standalone question page (`/app/questions/[slug]`), **QuestionCard and Feedback can receive different label semantics**:

- The question **choices** come from `getQuestionBySlug`, which returns canonical DB labels (`choice.label`, A–E in `sortOrder` order).
- The feedback **choiceExplanations** come from `submitAnswer` / `getPreviousAttempt`, which uses `buildShuffledChoiceViews()` to assign **shuffled** `displayLabel` values (A=first shuffled choice, B=second, etc.).

Because QuestionCard renders `choice.label` while Feedback renders `choice.displayLabel`, the letter labels can refer to different answer text across the two sections.

This does **not** affect practice-session question flow (`GetNextQuestion`), because that use case also uses `buildShuffledChoiceViews()` and returns shuffled labels for the question card — so QuestionCard and Feedback stay in sync.

### Evidence (Verified in Code)

- Controller returns canonical labels for the question card: `src/adapters/controllers/question-view-controller.ts:70-80`
- Question page passes labels straight into QuestionCard: `app/(app)/app/questions/[slug]/question-page-client.tsx:136-148`
- Feedback choice explanations use shuffled display labels:
  - `src/application/use-cases/submit-answer.ts:49-60`
  - `src/application/use-cases/get-previous-attempt.ts:58-67`
- Feedback renders displayLabel as received: `components/question/feedback.tsx:70-86`

### Root Cause (Confirmed)

There is no shared “label mapping” for `/app/questions/[slug]`. The page mixes:
- canonical labels for QuestionCard (from `getQuestionBySlug`)
- shuffled display labels for Feedback (from submit/review use cases)

### Proposed Fix (Design Direction)

Make QuestionCard and Feedback consume the **same** label mapping on the standalone question page. Options include:

1. **Shuffle in `getQuestionBySlug`:** Return shuffled display labels for the question page (requires using `userId` inside the controller and calling `buildShuffledChoiceViews()`).
2. **Return a mapping:** Extend the question view output to include the shuffled views (or a `choiceId → displayLabel` map) so QuestionCard can render with the same labels Feedback uses.
3. **Make labels invariant:** Stop reassigning letter labels on shuffle and instead keep authored labels fixed (broader product decision; likely breaks "A=first row" mental model).

---

## Severity Assessment

### Bug A (History Questions result-dependent wiring)
**Medium.** The History Questions tab is the only review entry point that routes Incorrect rows to reattempt URLs (no `mode=review`) while other entry points route to review mode. Combined with subtitle copy that doesn’t reflect `mode`, this can confuse users and makes the experience inconsistent across entry points.

### Bug B (Choice Label Desync)
**Medium-High.** The correct answer is still identifiable by border color, and the explanation text is accurate. But the letter labels create confusion: a user who reads "B) Cannabis" in the feedback and looks up at B in the question card sees "Benzodiazepines," not Cannabis. For a medical education platform, this kind of mislabeling is unacceptable.

### Combined Impact
These two issues together mean that a physician can hit inconsistent "review vs reattempt" behavior across entry points (Bug A), and even when they are in review mode, the feedback letter labels may not match the question card (Bug B).

---

## Verification Plan

### Bug A Verification
1. Go to `/app/history?tab=questions`
2. Confirm a Correct row’s title link includes `mode=review`
3. Confirm an Incorrect row’s title link omits `mode=review`
4. Confirm both the title link and action button share the same `href` for each row
5. Verify Dashboard recent activity links include `mode=review` (regardless of correctness)
6. Verify Session Breakdown links include `mode=review` (regardless of correctness)
7. Verify the question page subtitle for `from=history` does not vary by `mode` (potential copy mismatch)

### Bug B Verification
1. Open any question in review mode
2. Note the A/B/C/D(/E) to answer text mapping in the question card
3. Scroll to "Why other answers are wrong" in the feedback card
4. Confirm every letter label in the feedback matches the same answer text in the question card
5. Test across multiple questions to ensure consistent

### Bug B Reproduction Examples (Chrome Agent Audit, 2026-02-12)

**Palamar question** (via Dashboard `?from=dashboard&mode=review`):
- Question card: A=Alcohol, B=Benzodiazepines, C=GHB, D=Cannabis
- Feedback: B)Cannabis, C)Benzodiazepines, D)Alcohol
- Letters B, C, D all point to different answer text across the two sections.

**Cimetidine/Zaleplon question** (via Dashboard, Correct entry):
- Same pattern — letter labels mismatch between question card and feedback.

**Reproduction rate:** 100% across all questions tested. The mismatch is systematic, not intermittent.

---

## Relationship to Other Brainstorming Docs

| Doc | Relationship |
|-----|-------------|
| BS-009 (Session Review Navigation Gap) | **Sibling issue.** BS-009 covers session-aware navigation (back links, next/prev) when reviewing multiple questions. Bug A here is a more narrow, entry-point-specific wiring inconsistency. |
| BS-010 (Review Mode Attempt Identity Gap) | **Sibling issue.** BS-010 is about selecting which attempt to display. Bug B here is about label semantics mismatching between question and feedback data sources. |
| SPEC-023 (Question Review Mode) | **Foundation.** SPEC-023 introduced `mode=review`. Bug A is about which entry points use it; Bug B is about label consistency once in review mode. |

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-11 | Documented as brainstorming, not spec or bug report | User preference for cognitive consistency; these may be rolled into a broader fix spec alongside BS-009/BS-010 |
| 2026-02-11 | Validated via live Chrome browser audit with screenshots | Both bugs confirmed visually on deployed application across multiple questions and entry points |
| 2026-02-11 | Classified as two separate bugs in one doc | Discovered during the same audit session; both relate to History Questions tab review experience but have independent root causes |
| 2026-02-12 | Re-audited against current code and corrected | Bug A clarified as explicit conditional wiring. Bug B root cause corrected to canonical-vs-shuffled label mismatch on the standalone question page. |
| 2026-02-12 | Bug B confirmed 100% reproduction via Chrome browser agent | Palamar question and cimetidine/zaleplon question both show systematic letter label mismatch. Every tested question reproduced the issue. |
| 2026-02-12 | Bug A and Bug B confirmed via Playwright E2E audit (`brainstorming-audit.spec.ts`) | Bug A: incorrect rows on History > Questions tab lack `mode=review` param. Bug B: `anton-2006-combine-001` — QuestionCard shows B=Naltrexone, C=Disulfiram, D=Topiramate while Feedback shows B=Disulfiram, C=Topiramate, D=Acamprosate. 3 of 3 non-correct labels mismatched. |
