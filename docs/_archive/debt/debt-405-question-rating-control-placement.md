# DEBT-405: Question Rating Control Placement — Move to a Post-Action Footer

**Priority:** P3
**Created:** 2026-06-04
**Source:** SPEC-041 question-feedback rating (shipped). Placement flagged in use; iterated twice via Claude in Design (round 1: inset box vs fold-in; round 2: fold-in vs post-action footer).
**Related:** [DEBT-337](../../debt/debt-337-future-feedback-enhancements.md) (sibling feedback/practice polish), [DEBT-381](./debt-381-question-content-typography-audit-and-preference-path.md) (resolved/archived), [SPEC-041](../specs/spec-041-question-feedback.md), design docs `docs/frontend/standards.md` / `docs/frontend/pattern-registry.md` / `docs/frontend/design-principles.md`.

**Status:** **Resolved 2026-06-05.** Shipped as PR #402 (squash-merged to `dev` as `045240c4`, then `main` fast-forwarded to dev). See Resolution below.

---

## Resolution (2026-06-05)

Shipped as PR #402, squash-merged to `dev` as `045240c4`, then `main` fast-forwarded to dev (all refs synced). The rating control was relocated exactly as decided:

- **Pattern Registry F-9** ("Post-Action Rating Footer") was added to `docs/frontend/pattern-registry.md` before any component change, reusing the M-2 `Standard` separator (`border-t border-border`).
- New shared `components/question/question-rating-footer.tsx` is the single source of truth for the boxless footer chrome.
- The rating was lifted out of `QuestionSurfaceBody` and rendered after each surface's `data-testid="bottom-action-bar"` on all three surfaces (practice view, standalone question review, post-exam review), each behind its existing rating gate. `feedbackRef` still targets the explanation for the submit-scroll.
- Visible copy → "Was this question helpful?"; thumb `aria-label`s → "Mark as helpful" / "Mark as not helpful"; the `<fieldset>` + `sr-only` legend, `aria-pressed`, `aria-live` status, and the canonical focus ring were all preserved.
- TDD throughout: position tests assert the rating renders after the action bar (hardened against `indexOf` false positives), the surface-body test asserts absence, and `theme-token-regression.test.tsx` gained footer coverage. Full gate green under Node 24 (typecheck, lint, unit 2637, browser 295, build); CodeRabbit reviewed and approved with no actionable comments.

The footer is the chosen **interim** placement; folding the rating into the action bar remains a documented future option (see "Notes / future" below) to be re-evaluated after real usage — it is out of scope for this debt. The Acceptance Criteria below were all met.

---

## Problem

The per-question rating control ("Was this a good question?" 👍/👎) ships in the wrong place. It is rendered as a **bare sibling** of the explanation card, sitting in the column **between the explanation and the primary `Next` button**:

- `components/question/question-surface-body.tsx:54-61` — inside `feedbackCard`, `<QuestionFeedbackRating />` is rendered immediately after `<Feedback />` with **no separating spacing**. The `space-y-6` that paces the rest of the surface lives on the parent `<section>` (`app/(app)/app/practice/components/practice-view.tsx:444-451`) and never reaches inside that wrapper, so the rating butts against the bottom of the explanation card.
- Because the thumbs are circular `size="icon"` Buttons (taller than the label text), their **tops** collide with the card while the shorter label keeps its line-height buffer — the asymmetric "buttons touching the card, label floating" look.
- More fundamentally: the rating is an **optional, low-stakes** control, but its position puts it **in the path of the primary CTA**. The reading flow becomes explanation → rating prompt → `Next`, which gives an optional widget false prominence and makes it read like a gate before progressing.

This is live on a shipped feature; the control works, but the placement does not.

## Decision

**Move the rating out of the content column and render it as a quiet, full-width footer *below* the action bar.**

On the active practice answer-review surface, the action bar (`Next` / `Bookmark` / `Give feedback`) is rendered **after** the `<section>` (`practice-view.tsx:537`). The rating moves to render **after** `{actionBar}`, as a post-action footer:

- **Boxless (variant B1):** separated from the action bar by a full-width `border-t border-border` hairline (Pattern Registry M-2 `Standard` content separator), content centered and de-emphasized (`text-sm text-muted-foreground`). **No fill, no surrounding box, no card-like padding container.** This is the chosen treatment.
- Keep a **minimal muted label** in this position. Unlike the inline placement, the footer sits *after* the action bar and is visually decontextualized from the question, so a short label ("Was this question helpful?", which maps cleanly to the `helpful` / `not_helpful` value object) aids clarity. The label copy is a low-cost, easily-reversible knob — drop it later if real usage shows the thumbs are self-evident here. The `<legend class="sr-only">` stays regardless.

This settles the original complaint outright: the rating **physically follows `Next`, so it cannot gate or compete with the primary CTA**, and it stops floating because a full-width hairline + centered muted content reads unmistakably as a post-action footer rather than a dropped control.

**Design-system prerequisite:** a full-width, post-action rating footer is a **new composition pattern**, not an existing named Pattern Registry entry. Before changing `app/**` or `components/**`, add a registry entry for this pattern (for example, a question-flow footer/chrome entry) that canonically defines:

- wrapper: `border-t border-border` (M-2 `Standard` separator) plus only spacing needed to separate the footer from the action bar;
- content row: centered, wrapping, `gap-3`, `text-sm text-muted-foreground`;
- no `bg-*` fill, no `Card`, no bordered inset container, and no undocumented opacity values;
- interactive targets remain `<Button>` instances, so focus rings stay inherited from the Button primitive.

This is the **minimal, lower-risk** step. It is explicitly an interim placement chosen to fix the current broken state and learn from real usage — not a claim that it is the permanent final form. Fold-in (below) remains a live future option.

## Rejected / deferred alternatives

| Option | Verdict | Why |
|--------|---------|-----|
| **Bordered inset box** at end of the explanation (`bg-muted/20` + border + padding) | **Rejected** | Adds a *third* boxed surface to the column; the border/fill reads as a visual "stop sign" right before `Next`. Heavy for a two-button control. |
| **In-place above `Next`** (current placement, even with spacing/divider fixes) | **Rejected** | Spacing fixes the collision but not the root issue — it still sits between the content and the primary CTA. This is the complaint. |
| **Fold into the action bar** (👍/👎 join the right secondary cluster beside `Give feedback`) | **Deferred, not rejected** | Cleanest grouping of meta-actions, and intuitively attractive — but it overloads a bar that **already wraps on mobile** (nav + save + rate + report), pairs a one-tap signal with the heavier `Give feedback` *dialog* (conflating two intents), and makes the filled button color the **sole** confirmation. Revisit after living with the footer. |
| **Light-container footer (variant B2)** — same footer position, `bg-muted/20` band | **Not chosen** | Re-introduces a boxed surface close in spirit to the rejected inset, for no added clarity over B1's hairline. Hold in reserve only if the footer ever needs to anchor more than the rating. |

## Scope — surfaces affected

The rating control is **centralized**, so relocating it touches every consumer. Keep them visually consistent:

1. **`app/(app)/app/practice/components/practice-view.tsx`** — active practice / tutor answer-review (the flagged surface, has the bottom action bar). **Primary target** of this decision.
2. **`app/(app)/app/questions/[slug]/question-page-client.tsx:369`** — standalone question-review page; also renders the rating via `QuestionSurfaceBody`'s `questionFeedbackRating` prop. Must receive the same treatment; confirm its bottom layout supports a post-action footer.
3. **`app/(app)/app/practice/[sessionId]/components/post-exam-review-view.tsx:157`** — post-exam review currently renders `<QuestionFeedbackRating>` **directly** after `<Feedback />`, but the live surface shows one focused `currentRow` at a time with a `data-testid="bottom-action-bar"` after the review section (`post-exam-review-view.tsx:176-228`). It is not a stacked list in the current code. Apply the same post-action footer treatment here as well: render the rating after that action bar when the current row is available and `questionFeedback` exists.

The footer renders **after each surface's action bar**, and that action bar lives in the parent component (`practice-view.tsx`, `question-page-client.tsx`, `post-exam-review-view.tsx`), **not inside `QuestionSurfaceBody`**. A "footer slot inside `QuestionSurfaceBody`" therefore cannot express this placement. The implementation is:

- **Lift the rating out of `QuestionSurfaceBody`** — remove the `questionFeedbackRating` prop + render at `question-surface-body.tsx:54-61` and its two call sites (`practice-view.tsx:523`, `question-page-client.tsx:369`); `post-exam-review-view.tsx` already renders the control directly, so just relocate it there.
- **Extract one shared footer component** (e.g. `components/question/question-rating-footer.tsx`) that wraps `QuestionFeedbackRating` in the registry-approved post-action footer chrome, and render it after the `data-testid="bottom-action-bar"` in all three parents. Single source of truth for both the control and the footer chrome — no duplicated chrome.

## Implementation plan (TDD)

1. **Pattern Registry first.** Add the post-action rating footer pattern to `docs/frontend/pattern-registry.md` before changing source. The governing docs require this for novel UI patterns (`standards.md:29-31`, `.claude/rules/frontend.md:96-108`); today the registry documents the usable tokens (`M-2`, Button conventions), but not this composition.
2. **Stop rendering the rating inside the content body.** In `components/question/question-surface-body.tsx:54-61`, remove `<QuestionFeedbackRating />` from `feedbackCard`. Keep `<Feedback />` and the `feedbackRef` wrapper intact — `feedbackRef` exists to `scrollIntoView` the explanation when an answer is submitted (`practice-view.tsx:335-338`) and must continue to target the explanation, not the rating.
3. **Render the footer after the action bar.** In `practice-view.tsx`, render the rating in a footer **after** `{actionBar}` (currently at `:537`), gated on the same condition that produces feedback today (non-exam, answered — `feedbackResult` / `hasBooleanCorrectness`). Wrap it with the registry-approved post-action footer classes: full-width `border-t border-border`, centered, wrapping `gap-3`, muted label/status, no fill.
4. **Apply the same relocation to `question-page-client.tsx` and `post-exam-review-view.tsx`.** The standalone review page has its action bar at `question-page-client.tsx:391-499`; post-exam review has its action bar at `post-exam-review-view.tsx:176-228`. Both should render the rating footer after those action bars using their existing rating gates (`isReviewMode && questionFeedback` for standalone review; `currentRow?.isAvailable && questionFeedback` for post-exam review).
5. **Label copy:** update the visible label to "Was this question helpful?" (maps to `helpful`/`not_helpful`); keep it muted. `legend` stays `sr-only` as "Rate this question".
6. **Tests first / updated:**
   - `components/question/question-surface-body.test.tsx` — assert the rating is **no longer** rendered inside the surface body.
   - `app/(app)/app/practice/components/practice-view-answer-feedback.test.tsx` (and `practice-view-layout.test.tsx` if the footer wrapper needs a layout-level assertion) — assert the rating renders **after** the `data-testid="bottom-action-bar"` element, in the footer region.
   - `components/question/question-feedback-rating.test.tsx` — updated label copy; control semantics unchanged.
   - `app/(app)/app/questions/[slug]/question-page-client.test.tsx` and `app/(app)/app/practice/[sessionId]/components/post-exam-review-view.test.tsx` — assert the rating footer follows each surface's `data-testid="bottom-action-bar"`, not merely that it appears after the explanation.
   - Grep cleanup: the current position-sensitive assertions are in `question-surface-body.test.tsx`, `practice-view-answer-feedback.test.tsx`, `question-page-client.test.tsx`, and `post-exam-review-view.test.tsx`; update all of them so no old "after explanation" contract remains.

## Accessibility — preserve in all variants

- `<fieldset>` + `<legend className="sr-only">Rate this question</legend>`.
- `aria-pressed` on each toggle Button.
- The canonical focus ring (inherited from `<Button>`) — never hand-rolled.
- `<Button>` for every interactive target (no raw `<button>`).
- An `aria-live="polite"` status region so `saving` / `saved` / `error` are still announced (the existing `<output>`). Visible status text in the footer is acceptable; at minimum keep it `sr-only`.
- Mobile behavior: the footer row must wrap without overlapping the action bar, and its tab/reading order must follow the action bar. Do not convert the action bar or rating footer into a sticky shell; current review action bars are document-flow siblings.

## Acceptance criteria

- On the active practice answer-review surface, the rating no longer appears between the explanation card and `Next`; it renders **after** the action bar as a hairline-separated, centered, muted footer (boxless — no inset box, no fill).
- No bordered inset box and no above-`Next` placement remain.
- The rating looks consistent across all three surfaces (practice view, question page, post-exam review); all three render the rating after their respective action bars as the same boxless post-action footer.
- `fieldset`/`legend`, `aria-pressed`, focus ring, `<Button>`, and the `aria-live` status are all preserved.
- `pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:browser && pnpm build` green; design-token regression scan passes (semantic tokens + documented opacity scale only).

## Notes / future

- Fold-in remains the most likely "v2" if usage shows the footer is under-discovered; this doc records *why* it was deferred (action-bar overload on mobile, intent conflation with the `Give feedback` dialog, color-only confirmation) so it is not re-litigated from scratch.
- This is interim by design. Re-evaluate placement and the label after the control has been used in practice.
