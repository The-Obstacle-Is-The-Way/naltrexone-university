# QA-001: Practice Core Flows (Tutor, Exam, Quick Practice)

**Status:** Draft
**Created:** 2026-08-13
**Surfaces:** `/app/practice`, `/app/practice/quick`, `/app/practice/[sessionId]`
**Preconditions:** Local dev (`pnpm dev`) or a Vercel preview; an **entitled** user signed in (the seeded E2E user, or any subscribed account). No incomplete session at start (finish or abandon leftovers first — the starter blocks new sessions while one is open).
**Execution modes:** Human or Playwright-assisted in full. Agent modes run the tutor/quick sections only — the Tutor/Exam mode toggle and the quick-practice status filter are `SegmentedControl`s with no agent workaround (DEBT-323); answer selection and Submit need the `eval` label/button-click fallback.
**Estimated time:** 15–20 min
**Promotion gate:** yes
**Promoted to:** — (overlaps `practice.spec.ts`, `session-continuation.spec.ts`; this procedure keeps the judgment checks and the not-yet-automated edges)

This procedure absorbs Flows A–C of the Core Flow Verification section in `docs/dev/stabilization-checklist.md` (that section remains in place until this procedure reaches Active). Behavior contracts cited below live in `docs/practice-engine/interaction-contracts.md` and `docs/practice-engine/exam-answer-secrecy-policy.md`.

---

## Steps — Tutor session

| # | Action | Expected |
|---|--------|----------|
| 1 | Go to `/app/practice` | Session starter renders: mode toggle (Tutor/Exam, `aria-pressed` reflects selection), count input, status/difficulty/tag filter chips, availability count (`data-testid="available-count"`), **Start session** button |
| 2 | Narrow filters (e.g. one tag + "Unanswered") | Availability count updates to match the narrowed pool |
| 3 | With mode = Tutor, count = 5, press **Start session** | URL becomes `/app/practice/<sessionId>`; question 1 of 5 renders; **no timer is shown** (tutor has no clock) |
| 4 | Select a choice, press **Submit** | Verdict pill (`data-testid="verdict-pill"`) and the explanation render **immediately** — tutor mode always shows feedback on submit |
| 5 | Check the question footer | Bookmark control **is present** (tutor = YES in `docs/frontend/bookmark-surface-policy.md`); rating footer (helpful / not helpful) present |
| 6 | Press **Next**, answer one more, then navigate away (e.g. Dashboard) mid-session | No error on leaving |
| 7 | Return to `/app/practice` | **Continue session** card shows the session with its mode label and progress, with **Resume session** and abandon actions |
| 8 | Press **Resume session** | Returns to the exact `/app/practice/<sessionId>` URL at the next unanswered question |
| 9 | Answer remaining questions; on the last, finish from the footer | Session summary renders: score, per-question breakdown, **Review Answers** entry point |
| 10 | Press **Review Answers** | Review opens at question 1; navigator and prev/next work; answers and explanations visible |

## Steps — Exam session (⚠ human/PW: steps 11, 17 use toggles)

| # | Action | Expected |
|---|--------|----------|
| 11 | ⚠ On `/app/practice`, switch mode toggle to **Exam**, count = 5, **Start session** | Session starts; **exam timer visible** (`aria-label="Exam time remaining"`), allotment scales with question count |
| 12 | Select an answer on Q1 | **No verdict, no explanation, no correct-answer reveal** — the exam-answer-secrecy invariant. Selection is saved as a draft |
| 13 | Use **Mark for review** on one question | Mark toggles; navigator shows the flag (mark-for-review is exam-only) |
| 14 | Leave one question unanswered; press **Review & Submit** | Pre-submit review lists all questions with answered/unanswered/marked state; **still no correctness shown**; bookmark control **absent** on this surface (policy: NO) |
| 15 | Press **Submit exam** (confirm dialog if present) | Post-exam review renders: verdicts + explanations now visible for every question |
| 16 | Open the summary | The unanswered question is recorded as **omitted and incorrect**; accuracy is computed **out of the total question count**, not out of answered — verify the math against your run |
| 17 | ⚠ Start another exam, answer nothing, and use the abandon path (starter card or in-session) with **Abandon anyway** | Exam session is discarded; starter no longer shows a continue card; repeating abandon on the gone session does not error (idempotent discard) |

## Steps — Quick practice

| # | Action | Expected |
|---|--------|----------|
| 18 | Go to `/app/practice/quick` | One question renders with the status `SegmentedControl` filter showing counts |
| 19 | Answer (choice + **Submit**) | Verdict pill + explanation render (tutor-style feedback); **Next** loads another question |
| 20 | ⚠ Switch the status filter (e.g. to "Incorrect") | Question pool and counts change accordingly |

## Visual checks

- [ ] Entire flow renders forced-dark; no light-mode leakage anywhere (DEBT-421 invariant)
- [ ] Choice buttons use the recessed-surface rest/hover/selected states — `docs/frontend/pattern-registry.md` I-3 / `docs/frontend/pages/quick-practice.md`
- [ ] Action bar stays reachable on long questions (sticky bottom bar; whole-page scroll) — `docs/frontend/design-principles.md`
- [ ] Focus rings on all interactive controls are the canonical ring — `docs/frontend/standards.md` §3
- [ ] Question stem/choices/explanation render at the Medium content tier (16px/24px) — `docs/frontend/typography-policy.md`
- [ ] Bookmark presence matches the per-surface registry on every surface touched — `docs/frontend/bookmark-surface-policy.md`
- [ ] At 390×844: starter, question card, and summary have no horizontal overflow; action bar usable

## Evidence

Screenshots: step 9 (summary), step 12 (exam question showing draft-with-no-feedback), step 15 (post-exam review), one 390×844 capture of the active question. Representative WebP → `docs/qa/assets/qa-001/`.

## On failure

Behavioral defect → file `BUG-NNN` (`docs/bugs/index.md`) citing the step number and the governing contract doc. Visual drift → check `docs/frontend/` policy first; undocumented pattern = Discoverability Rule finding, not a pass.
