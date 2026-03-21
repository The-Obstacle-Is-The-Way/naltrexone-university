# DEBT-330: Post-Exam Review Action Bar — Bookmark Button Placement

**Priority:** P3
**Created:** 2026-03-20
**Source:** Manual UI review during DEBT-326 investigation
**Related:** [PostExamReviewView](../../app/(app)/app/practice/[sessionId]/components/post-exam-review-view.tsx)

---

## The Problem

This debt was re-audited against production code on 2026-03-21.

In the post-exam review bottom action bar, the Bookmark button currently sits between Previous and Next (or Finish review) for available questions. That intermixes a secondary action with the primary sequential-review controls.

Verified production implementation:

- The bottom bar lives at [`app/(app)/app/practice/[sessionId]/components/post-exam-review-view.tsx:143-185`](../../app/(app)/app/practice/[sessionId]/components/post-exam-review-view.tsx). The previous `:133-175` citation was wrong; lines 133-140 are still inside the unavailable/empty-state branch.
- The flex container is exactly `className="flex flex-col gap-3 sm:flex-row"`.
- `Previous` and `Bookmark` both use `<Button variant="outline" className="rounded-full">`.
- `Next` and `Finish review` use the default filled button with the same `rounded-full` shape.
- Bookmark renders only when `currentRow?.isAvailable` is true.

Current as-built layouts:

```text
Available middle question: [ Previous ] [ Bookmark ] [ Next ]
Available first question:  [ Bookmark ] [ Next ]
Available last question:   [ Previous ] [ Bookmark ] [ Finish review ]
Single available question: [ Bookmark ] [ Finish review ]
Unavailable question:      bookmark omitted entirely
```

So the original description was directionally correct for the common available-question states, but it was not fully complete.

Consumer check:

- `PostExamReviewView` is mounted only by [`app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx:176-191`](../../app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx).
- There is no shared action-bar component. [`docs/frontend/design-principles.md:52-83`](../frontend/design-principles.md) explicitly says action bars are inline per context.
- A similar interleaved review layout also exists in [`app/(app)/app/questions/[slug]/question-page-client.tsx:371-469`](../../app/(app)/app/questions/[slug]/question-page-client.tsx), so the pattern is not unique to this file even though this specific component is single-use.
- The active practice-session comparator file named in older notes as `question-page-view.tsx` no longer exists. The current in-session action bar lives in [`app/(app)/app/practice/components/practice-view.tsx:112-170`](../../app/(app)/app/practice/components/practice-view.tsx).

Test coverage check:

- [`app/(app)/app/practice/[sessionId]/components/post-exam-review-view.test.tsx`](../../app/(app)/app/practice/[sessionId]/components/post-exam-review-view.test.tsx) currently covers panel semantics, focus-ring classes, and feedback states only.
- [`app/(app)/app/practice/[sessionId]/components/post-exam-review-view.browser.spec.tsx`](../../app/(app)/app/practice/[sessionId]/components/post-exam-review-view.browser.spec.tsx) currently covers focus movement only.
- There is no existing regression test for button order or grouping.

## Why This Is Confusing

- **Fitts's Law**: In rapid sequential review, Previous and Next are the high-frequency targets. A secondary action inserted between them increases selection cost and raises the chance of mis-hits during repeated paging.
- **Gestalt grouping**: Previous and Next/Finish review are one navigation family. Bookmark is a separate "curate for later" action. The current flat row weakens that distinction.
- **Action hierarchy**: The filled Next/Finish review button correctly signals primacy, but Bookmark and Previous currently share the exact same outline treatment and position in the same cluster, which gives Bookmark more structural prominence than its task frequency warrants.
- **First-question ambiguity**: `[ Bookmark ] [ Next ]` can read as a two-button navigation pair because there is no left-edge Previous anchor.
- **Mobile stacking**: The container becomes a vertical stack on small screens. In the current DOM order, Bookmark still sits between the sequential controls, so the grouping problem survives the breakpoint instead of being fixed by it.

## Cross-Surface Consistency

The closest existing practice-session surface is the tutor/quick-practice action bar in [`PracticeView`](../../app/(app)/app/practice/components/practice-view.tsx). Its shipped order is:

```text
Before submit: [ Previous ] [ Submit ] [ Next ] [ Bookmark ]
After submit:  [ Previous ] [ Next ] [ Bookmark ]
Quick practice after submit: [ Next ] [ Bookmark ]
```

That surface already places Bookmark after the sequential navigation controls, which is more consistent with the underlying task hierarchy.

By contrast, the standalone review question surface in [`question-page-client.tsx`](../../app/(app)/app/questions/[slug]/question-page-client.tsx) currently renders `[ Previous ] [ Bookmark ] [ Next ] [ Back ]` when session navigation exists. That means review surfaces are already inconsistent today. DEBT-330 should fix the post-exam review stage based on first principles and the active-session precedent, not preserve a weaker pattern just because another review page also has it.

## Option Review

### 1. Far-right separation in the same bar

- **Pros:** Best match to the existing `PracticeView` action bar. Keeps the primary sequential pair visually related. Minimal product change because Bookmark stays a text pill in the familiar bottom-zone location.
- **Breaks / risks:** A bare `ml-auto` on the existing flat button row is not enough. On mobile `flex-col`, Bookmark still lands between navigation controls in DOM order unless the layout is restructured into separate groups. Desktop-only separation is insufficient.
- **Mobile verdict:** Good only if implemented as a two-group responsive layout, not as a one-line spacer hack.

### 2. Move Bookmark above the bar

- **Pros:** Strongest semantic separation. The bottom bar becomes purely sequential navigation, which is excellent for fast paging.
- **Breaks / risks:** This would create a one-off placement that differs from the current active-session practice surface, where Bookmark still lives in the bottom action zone. It also increases pointer travel for the less-frequent bookmark action and adds another control near already-dense question/explanation content.
- **Mobile verdict:** Technically safe, but less consistent with the rest of the product.

### 3. Replace the text button with an icon-only bookmark toggle

- **Pros:** Strong visual distinction between navigation pills and bookmarking. If the product ever needs bookmark and mark-for-review on the same surface again, icon vs text would help. This direction is also compatible with the future-facing note in [`docs/frontend/bookmark-surface-policy.md:87`](../frontend/bookmark-surface-policy.md).
- **Breaks / risks:** On its own, icon-only does not solve grouping; placement still has to be decided. It would also be inconsistent with the currently shipped text-pill bookmark affordance in `PracticeView` and `question-page-client.tsx`. Discoverability would drop unless the icon treatment is rolled out deliberately across all bookmark surfaces with proper `aria-label` coverage.
- **Mobile verdict:** Compact, but only worth the tradeoff as part of a broader bookmark-pattern redesign, not as an isolated fix for this debt.

### 4. Recommended refinement: two-group responsive action bar

This is the strongest implementation path and should be treated as the practical version of Option 1 rather than a separate visual experiment.

```text
Desktop: [ Previous ] [ Next / Finish review ]                     [ Bookmark ]
Mobile:  [ Previous ] [ Next / Finish review ]
         [ Bookmark ]
```

- Keep the sequential controls in a dedicated navigation group.
- Render Bookmark after that group in DOM order.
- On desktop, push Bookmark to the trailing edge with `sm:ml-auto` on the secondary-action group.
- On mobile, stack the secondary action below the navigation group so Bookmark no longer interrupts the paging flow.

## Recommendation

Choose **Option 4: a two-group responsive action bar**.

Why this is the best fit:

- It satisfies **Fitts's Law** and **Gestalt grouping** by keeping the high-frequency navigation targets together.
- It preserves **action hierarchy** by demoting Bookmark without hiding it.
- It is the most **mobile-safe** solution because the stacked layout still keeps navigation first and Bookmark second.
- It is the best **consistency match** for the current active practice-session surface in `PracticeView`, which already places Bookmark after Next.
- It keeps the existing **text-label affordance**, which is clearer than an icon-only toggle for a targeted debt fix.

Recommendation boundaries:

- Do **not** implement this as only `ml-auto` on the current single flat row.
- Do **not** switch to an icon-only bookmark here unless the product is ready to update the bookmark affordance across all major reflection surfaces.
- Treat the similar `[Previous] [Bookmark] [Next]` ordering in `question-page-client.tsx` as a separate follow-up consistency issue if we want cross-review-surface unification.

## Scope

- **Production file:** [`app/(app)/app/practice/[sessionId]/components/post-exam-review-view.tsx:143-185`](../../app/(app)/app/practice/[sessionId]/components/post-exam-review-view.tsx)
- **Comparator file:** [`app/(app)/app/practice/components/practice-view.tsx:112-170`](../../app/(app)/app/practice/components/practice-view.tsx)
- **Related review surface:** [`app/(app)/app/questions/[slug]/question-page-client.tsx:371-469`](../../app/(app)/app/questions/[slug]/question-page-client.tsx)
- **Test files:** [`app/(app)/app/practice/[sessionId]/components/post-exam-review-view.test.tsx`](../../app/(app)/app/practice/[sessionId]/components/post-exam-review-view.test.tsx), [`app/(app)/app/practice/[sessionId]/components/post-exam-review-view.browser.spec.tsx`](../../app/(app)/app/practice/[sessionId]/components/post-exam-review-view.browser.spec.tsx)

## Acceptance Criteria

- [ ] Previous and Next/Finish review render as one visual navigation group on desktop
- [ ] On mobile, the stacked order is navigation group first, Bookmark second
- [ ] Bookmark remains a labeled, accessible toggle (`aria-pressed` preserved)
- [ ] Bookmark remains visually subordinate to the primary navigation flow
- [ ] Regression coverage is added for button order / grouping because no current test file asserts it
