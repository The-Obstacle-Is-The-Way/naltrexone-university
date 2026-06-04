# DEBT-404: Question Rating Control Placement — Move to a Post-Action Footer

**Priority:** P3
**Created:** 2026-06-04
**Source:** SPEC-041 question-feedback rating (shipped). Placement flagged in use; iterated twice via Claude in Design (round 1: inset box vs fold-in; round 2: fold-in vs post-action footer).
**Related:** [DEBT-337](./debt-337-future-feedback-enhancements.md) (sibling feedback/practice polish), [DEBT-381](./debt-381-question-content-typography-audit-and-preference-path.md), [SPEC-041](../_archive/specs/spec-041-question-feedback.md), design docs `docs/frontend/standards.md` / `docs/frontend/pattern-registry.md` / `docs/frontend/design-principles.md`.

**Status:** Active

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

- **Boxless (variant B1):** separated from the action bar by a full-width `border-t` hairline (documented border token), content centered and de-emphasized (muted). **No fill, no surrounding box, no padding container.** This is the chosen treatment.
- Keep a **minimal muted label** in this position. Unlike the inline placement, the footer sits *after* the action bar and is visually decontextualized from the question, so a short label ("Was this question helpful?", which maps cleanly to the `helpful` / `not_helpful` value object) aids clarity. The label copy is a low-cost, easily-reversible knob — drop it later if real usage shows the thumbs are self-evident here. The `<legend class="sr-only">` stays regardless.

This settles the original complaint outright: the rating **physically follows `Next`, so it cannot gate or compete with the primary CTA**, and it stops floating because a full-width hairline + centered muted content reads unmistakably as a post-action footer rather than a dropped control.

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
3. **`app/(app)/app/practice/[sessionId]/components/post-exam-review-view.tsx:157`** — post-exam review renders `<QuestionFeedbackRating>` **directly**, per question, in a **stacked list** of answered questions. A single page-bottom footer does **not** map here; this surface keeps the rating attached per-question but **must still inherit the spacing/boxless fix** (no collision, no inset box) so the control looks the same everywhere.

Because two surfaces render the control through `QuestionSurfaceBody` and one renders it directly, decide during implementation between:
- (a) giving `QuestionSurfaceBody` an explicit, optional **footer slot** the consumer positions, vs
- (b) lifting the rating out of `QuestionSurfaceBody` entirely and letting each surface place it.

Prefer the approach that keeps a single source of truth for the control's markup and avoids duplicating the footer chrome across surfaces.

## Implementation plan (TDD)

1. **Stop rendering the rating inside the content body.** In `components/question/question-surface-body.tsx:54-61`, remove `<QuestionFeedbackRating />` from `feedbackCard`. Keep `<Feedback />` and the `feedbackRef` wrapper intact — `feedbackRef` exists to `scrollIntoView` the explanation when an answer is submitted (`practice-view.tsx:335-338`) and must continue to target the explanation, not the rating.
2. **Render the footer after the action bar.** In `practice-view.tsx`, render the rating in a footer **after** `{actionBar}` (currently at `:537`), gated on the same condition that produces feedback today (non-exam, answered — `feedbackResult` / `hasBooleanCorrectness`). Wrap it: full-width, `border-t` hairline (documented border token from `pattern-registry.md`), centered, muted.
3. **Apply the same relocation to `question-page-client.tsx`** and ensure **`post-exam-review-view.tsx`** inherits the boxless/spacing fix (no inset, no collision) even though it stays per-question.
4. **Label copy:** update the visible label to "Was this question helpful?" (maps to `helpful`/`not_helpful`); keep it muted. `legend` stays `sr-only` as "Rate this question".
5. **Tests first / updated:**
   - `components/question/question-surface-body.test.tsx` — assert the rating is **no longer** rendered inside the surface body.
   - `app/(app)/app/practice/components/practice-view-answer-feedback.test.tsx` (and `practice-view-layout.test.tsx`) — assert the rating renders **after** the `data-testid="bottom-action-bar"` element, in the footer region.
   - `components/question/question-feedback-rating.test.tsx` — updated label copy; control semantics unchanged.
   - `app/(app)/app/questions/[slug]/question-page-client.test.tsx` and `app/(app)/app/practice/[sessionId]/components/post-exam-review-view.test.tsx` — update any assertions that depend on the rating's old position.

## Accessibility — preserve in all variants

- `<fieldset>` + `<legend className="sr-only">Rate this question</legend>`.
- `aria-pressed` on each toggle Button.
- The canonical focus ring (inherited from `<Button>`) — never hand-rolled.
- `<Button>` for every interactive target (no raw `<button>`).
- An `aria-live="polite"` status region so `saving` / `saved` / `error` are still announced (the existing `<output>`). Visible status text in the footer is acceptable; at minimum keep it `sr-only`.

## Acceptance criteria

- On the active practice answer-review surface, the rating no longer appears between the explanation card and `Next`; it renders **after** the action bar as a hairline-separated, centered, muted footer (boxless — no inset box, no fill).
- No bordered inset box and no above-`Next` placement remain.
- The rating looks consistent across all three surfaces (practice view, question page, post-exam review); the post-exam list keeps per-question placement but with the same boxless/spacing treatment.
- `fieldset`/`legend`, `aria-pressed`, focus ring, `<Button>`, and the `aria-live` status are all preserved.
- `pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:browser && pnpm build` green; design-token regression scan passes (semantic tokens + documented opacity scale only).

## Notes / future

- Fold-in remains the most likely "v2" if usage shows the footer is under-discovered; this doc records *why* it was deferred (action-bar overload on mobile, intent conflation with the `Give feedback` dialog, color-only confirmation) so it is not re-litigated from scratch.
- This is interim by design. Re-evaluate placement and the label after the control has been used in practice.
