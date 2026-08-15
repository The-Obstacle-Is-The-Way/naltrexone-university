# QA-001: Practice Core Flows (Tutor, Exam, Quick Practice)

**Status:** Draft
**Created:** 2026-08-13
**Surfaces:** `/app/practice`, `/app/practice/quick`, `/app/practice/[sessionId]`
**Preconditions:** Local dev (`pnpm dev`) or a Vercel preview; an **entitled** user signed in and able to open `/app/dashboard` (do not assume the hermetic `pnpm test:e2e` database seeded the database used by `pnpm dev`). No incomplete session at start (finish or abandon leftovers first — the starter blocks new sessions while one is open).
**Execution modes:** Human in full. Playwright-assisted runs can execute all behavior steps but need human/vision review for the judgment checks. Agent modes can run the remaining tutor/quick steps, but steps 2 and 21 need `SegmentedControl`/`FilterChip` interaction and are marked `⚠ human/PW` (DEBT-323); pointer choice activation submits immediately, while keyboard/AT or the agent `eval` label-click fallback exposes a **Submit** button that needs the button-click fallback.
**Estimated time:** 15–20 min
**Promotion gate:** yes
**Promoted to:** — (overlaps `practice.spec.ts`, `session-continuation.spec.ts`; this procedure keeps the judgment checks and the not-yet-automated edges)

This procedure is written to absorb Flows A–C of the Core Flow Verification section in `docs/dev/stabilization-checklist.md` once it is Active (that section remains in place until then). Behavior contracts cited below live in `docs/practice-engine/interaction-contracts.md` and `docs/practice-engine/exam-answer-secrecy-policy.md`.

---

## Steps — Tutor session

| # | Action | Expected |
|---|--------|----------|
| 1 | Go to `/app/practice` | Session starter renders: mode and status/difficulty segmented controls (`aria-pressed` reflects selection), tag filter chips, count input, live "N questions available" output, **Start session** button |
| 2 | ⚠ Narrow filters (e.g. one tag + "Unanswered") | Availability output updates to match the narrowed pool |
| 3 | Restore or widen filters until at least 5 questions are available; with mode = Tutor and count = 5, press **Start session** | URL becomes `/app/practice/<sessionId>`; question 1 of 5 renders; **no timer is shown** (tutor has no clock) |
| 4 | Activate a choice; if using keyboard/AT or the agent label-click fallback, press **Submit** when it appears | Verdict pill (`data-testid="verdict-pill"`) and the explanation render **immediately** after pointer activation or Submit — tutor mode always shows feedback on commit |
| 5 | Check the question footer | Bookmark control **is present** (tutor = YES in `docs/frontend/bookmark-surface-policy.md`); rating footer (helpful / not helpful) present |
| 6 | Press **Next**, answer one more, then navigate away (e.g. Dashboard) mid-session | The question progress indicator advances; no error on leaving |
| 7 | Return to `/app/practice` | **Continue session** card shows the session with its mode label and progress, with **Resume session** and abandon actions |
| 8 | Press **Resume session** | Returns to the exact `/app/practice/<sessionId>` URL at the next unanswered question |
| 9 | Answer remaining questions; on the last, press **End session** | Session summary renders: score and linked per-question breakdown rows; tutor summaries intentionally have no separate **Review Answers** CTA |
| 10 | Open the first linked question in **Question breakdown** | Review opens at that question; navigator and prev/next work; answers and explanations are visible |

## Steps — Exam session (⚠ human/PW: steps 11, 18 use toggles)

| # | Action | Expected |
|---|--------|----------|
| 11 | ⚠ On `/app/practice`, switch mode toggle to **Exam**, count = 5, **Start session** | Session starts; **exam timer visible** (`aria-label="Exam time remaining"`), allotment scales with question count |
| 12 | Select an answer on Q1 | **No verdict, no explanation, no correct-answer reveal** — the exam-answer-secrecy invariant. Selection becomes the local draft and is persisted at the navigation/review boundary |
| 13 | Use **Mark for review** on one question | Mark toggles; navigator shows the flag (mark-for-review is exam-only) |
| 14 | Leave one question unanswered; go to the final question and press **Review & Submit** | Pre-submit review lists all questions with answered/unanswered/marked state; **still no correctness shown**; bookmark control **absent** on this surface (policy: NO) |
| 15 | Open the unanswered question from the pre-submit review, then return with **Review & Submit** | The jump opens the selected question; returning preserves its unanswered state and the answered/unanswered/marked counts |
| 16 | Press **Submit exam**, then **Confirm submit** in the dialog | Post-exam review renders with a score banner; verdicts + inline explanations are now visible for every question |
| 17 | Press **View Summary** | The unanswered question is recorded as **omitted and incorrect**; accuracy is computed **out of the total question count**, not out of answered — verify the math against your run |
| 18 | ⚠ Start another exam, answer nothing, navigate back to `/app/practice`, press **Abandon session**, then **Abandon anyway** | Exam session is discarded; starter no longer shows a continue card (there is no in-session abandon control or repeat-abandon UI once the card is gone) |

## Steps — Quick practice

| # | Action | Expected |
|---|--------|----------|
| 19 | Go to `/app/practice/quick` | One question renders with the status `SegmentedControl` filter showing counts |
| 20 | Activate a choice; if using keyboard/AT or the agent label-click fallback, press **Submit** when it appears | Verdict pill + explanation render (tutor-style feedback); **Next** loads another question |
| 21 | ⚠ Switch the status filter (e.g. to "Incorrect") | Question pool and counts change accordingly |

## Visual checks

- [ ] Entire flow renders forced-dark; no light-mode leakage anywhere (DEBT-421 invariant)
- [ ] Choice buttons use the recessed-surface rest/hover/selected states — `docs/frontend/pattern-registry.md` I-3 / `docs/frontend/pages/quick-practice.md`
- [ ] Action bar stays reachable on long questions (sticky bottom bar; whole-page scroll) — `docs/frontend/design-principles.md`
- [ ] Focus rings on all interactive controls are the canonical ring — `docs/frontend/standards.md` §3
- [ ] Question stem and choices render at the Primary content tier (`text-base`, 16px); the post-submit explanation is promoted to Primary per the Feedback Context Override — `docs/frontend/typography-policy.md` § Content Tier System
- [ ] Bookmark presence matches the per-surface registry on every surface touched — `docs/frontend/bookmark-surface-policy.md`
- [ ] At 390×844: starter, question card, and summary have no horizontal overflow; action bar usable

## Evidence

Screenshots: step 9 (summary), step 12 (exam question showing draft-with-no-feedback), step 16 (post-exam review), one 390×844 capture of the active question. Representative WebP → `docs/qa/assets/qa-001/`.

## On failure

Behavioral defect → file `BUG-NNN` (`docs/bugs/index.md`) citing the step number and the governing contract doc. Visual drift → check `docs/frontend/` policy first; undocumented pattern = Discoverability Rule finding, not a pass.
