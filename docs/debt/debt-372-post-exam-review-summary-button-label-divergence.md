# DEBT-372: Post-Exam Review Has Two Buttons With Different Labels For The Same Action

**Priority:** P3
**Created:** 2026-05-01
**Source:** Manual UX walkthrough of post-exam review surface, 2026-05-01
**Related:** [DEBT-365 Exam flow affordance and label consistency (archived)](../_archive/debt/debt-365-exam-flow-affordance-and-label-consistency.md), [DEBT-359 Session Summary CTA labels (archived)](../_archive/debt/debt-359-session-summary-cta-labels.md), [Frontend Standards](../frontend/standards.md), [Pattern Registry](../frontend/pattern-registry.md)

**Audit verified:** 2026-05-01 against `63a3fa5a`.

---

## Review Notes

Second-opinion review on 2026-05-01 re-verified the central premise against `63a3fa5a`:

- `post-exam-review-view.tsx:85-92` renders the top `View Summary` button and wires it directly to `onViewSummary`.
- `post-exam-review-view.tsx:170-186` renders `Next` when `nextRow` exists and otherwise renders the terminal `Finish review` button. The terminal button also wires directly to `onViewSummary` at `post-exam-review-view.tsx:182`.
- `rg "Finish review|View Summary" app components src tests` found no additional production `Finish review` call site. It did find one additional production `View Summary` surface in the post-exam review hydration-error fallback (`practice-session-exam-results-renderer.tsx:96-103`), which supports preserving `View Summary` as the summary-navigation label. It also found additional assertions that this ticket must account for: `tests/e2e/practice.spec.ts` asserts both `View Summary` and `Finish review`; `practice-session-exam-results-renderer.test.tsx` asserts `View Summary`; and `practice-session-page-view-review-stage.browser.spec.tsx` asserts `View Summary`. No integration test literal was found.
- DEBT-365 does support preserving the top-right `View Summary` affordance, but the precise citation is narrower than "exam answering": Concern 5 promoted `View Summary` in place on the post-exam review card, and Concern 6 kept that top-right asymmetry as intentional for long-form review content. It did not explicitly adjudicate the bottom terminal label.
- Option B's critique still holds after stress-testing: the bottom slot does not show `Finish review` on questions 1 through N−1, but Option B would rename the persistent top button to `Finish review`, so users would encounter that label mid-review.
- Remaining UX caveat: Option A creates two same-label `View Summary` buttons on the final review question. That resolves terminology drift, but it may make the bottom terminal CTA feel more like alternate navigation than stage completion. If product wants to preserve completion language, Option C is the honest alternative.

---

## Context

`app/(app)/app/practice/[sessionId]/components/post-exam-review-view.tsx` renders the post-exam review surface — the page where a student walks through each question with detailed feedback after finishing an exam-mode session. The view exposes **two buttons that call the same handler (`onViewSummary`) with two different visible labels**:

- **Top button (persistent across every question)** at `post-exam-review-view.tsx:85-92`:
  ```tsx
  <Button
    type="button"
    variant="outline"
    className="self-start rounded-full sm:self-auto"
    onClick={onViewSummary}
  >
    View Summary
  </Button>
  ```
  Lives inside the score-banner card alongside `Exam complete`, `Score: …`, and `Review each question with detailed feedback.`

- **Bottom button (last question only)** at `post-exam-review-view.tsx:178-186`:
  ```tsx
  <Button
    type="button"
    className="rounded-full"
    onClick={onViewSummary}
  >
    Finish review
  </Button>
  ```
  Replaces the bottom-bar `Next` button on the final reviewed question. Only renders when `nextRow === null`.

Both buttons are wired to the same `onViewSummary` callback and route to the same destination (the Session Summary screen). The labels diverge.

## Why This Is Debt

- **Same action, two names.** "View Summary" and "Finish review" describe one mechanical operation. A user reading both labels in the same view has to decide whether they are the same action — that's cognitive overhead the surface should not impose.
- **The "Finish review" label is contextually accurate only on the last question.** When the bottom slot renders mid-session as `Next` and only switches to "Finish review" on the final question, the label is honest. But it sits next to a persistent top button labeled "View Summary" that has the *same* effect at all times. The relationship between the two is unclear.
- **No prior ticket covers this specific divergence.** DEBT-359 (resolved 2026-04-11) renamed Summary CTAs ("Back to Practice" → "New Session", "Review your answers" → "Review Answers") on the *Session Summary* surface. DEBT-365 (resolved 2026-04-23) addressed footer grouping and the `View Summary` outline variant on the *post-exam review* surface. Neither addressed the label *split* on the post-exam review surface itself.
- **Past intent matters.** Per the DEBT-365 archive, the `View Summary` outline came from a deliberate exam-flow affordance pass. Renaming it without understanding why it landed could undo prior reasoning. This ticket should be paired with a quick read of DEBT-365 before changing copy.

## Options

The two buttons cannot both be right. Three resolutions, ranked:

### Option A (recommended): Unify on `View Summary`

Bottom button on the last question changes from `Finish review` → `View Summary`. Top stays as-is.

- **Pro:** "View Summary" is accurate in every position (it does in fact view the summary). Eliminates the divergence. Matches the existing top label, which DEBT-365 deliberately landed.
- **Pro:** Smallest diff. One copy change in `post-exam-review-view.tsx`. Test audit must include `post-exam-review-view.test.tsx`, `tests/e2e/practice.spec.ts`, and the existing `View Summary` assertions in `practice-session-page-view-review-stage.browser.spec.tsx` / `practice-session-exam-results-renderer.test.tsx` so duplicate-label selectors stay intentional.
- **Con:** Loses the "you've completed reviewing every question" semantic that "Finish review" conveys. That semantic is still implicit (the bottom slot only shows this button on the last question), but the verb-level signal is gone.

### Option B: Unify on `Finish review`

Top button changes from `View Summary` → `Finish review`. Bottom stays as-is.

- **Pro:** Matches the user's instinct ("both should say Finish review").
- **Con:** "Finish review" lies on questions 1 through N−1. Clicking it on question 1 of 3 is not finishing — it is aborting halfway. The label promises completion of work that has not been done.
- **Con:** Unwinds DEBT-365's deliberate `View Summary` outline copy without a corresponding behavioral change.
- **Con:** Leaves or forces churn on the existing post-exam review hydration-error `View Summary` fallback, which already uses summary-navigation language for the same destination.

### Option C: Differentiate the semantics

Top button changes to `Exit Review` or `Skip to Summary`; bottom keeps `Finish review`.

- **Pro:** Honest in both contexts. Top is "I want out"; bottom is "I am done."
- **Con:** Adds a third concept ("exit") to a surface that already has Previous, Next/Finish, Bookmark, plus question navigator. More verbs is not always less cognitive load.
- **Con:** Two labels still — divergence is preserved, just made semantically distinct rather than collapsed.

## Recommendation

Ship **Option A**. The two buttons currently call the same handler with the same destination — that is the strongest signal that they should carry the same label. The "completion" semantic of `Finish review` is already conveyed by the bottom slot's positional context (last question only), so renaming it does not lose information that the user could not infer from the surface itself.

If product disagrees and prefers Option C, it is the next best path. **Do not ship Option B** — it generates a misleading label on questions 1 through N−1.

## Constraints

- This is a copy + test-assertion change only. Do NOT modify the `onViewSummary` handler, route wiring, or the bottom-slot render condition (`nextRow === null` → render the terminal button). Behavior stays identical; only the label moves.
- Do NOT take this as license to retitle `Score: 33% (1/3)`, `Exam complete`, or `Review each question with detailed feedback.` That copy is out of scope.
- Do NOT fold typography or vertical-rhythm changes on the score banner into this ticket. The score banner's tight `mt-1` stacking and `tracking-tight` heading are a separate concern — file independently if pursued.
- Do NOT change the bottom slot's logic to also render on non-last questions. The current `Next` / terminal-button switching is correct and tested.

## Why P3

The surface ships, the buttons work, and the destination is correct. The cost is one moment of "are these the same button?" cognitive friction per exam completion. Same severity class as DEBT-359 / DEBT-361 (both shipped as P3 copy-cleanup tickets).

## Verification

- After the change: every test that asserts the post-exam-review terminal button reads the unified label. Grep for `Finish review` in `app/`, `components/`, `tests/` returns zero hits (all production and test references aligned to `View Summary`, or whichever label Option A/C lands on).
- `pnpm test --run` and `pnpm test:browser` pass with updated copy assertions.
- Manual walkthrough of the exam flow: finish a 3-question exam, confirm both the top header button and the bottom-of-last-question button carry the same label and both route to Session Summary.
- No change to bottom-bar layout, button order, or Bookmark affordance.
