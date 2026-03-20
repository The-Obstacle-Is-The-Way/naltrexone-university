# DEBT-330: Post-Exam Review Action Bar — Bookmark Button Placement

**Priority:** P3
**Created:** 2026-03-20
**Source:** Manual UI review during DEBT-326 investigation
**Related:** [PostExamReviewView](../../app/(app)/app/practice/[sessionId]/components/post-exam-review-view.tsx)

---

## The Problem

In the post-exam review bottom action bar, the Bookmark button sits between Previous and Next (or Finish review). This intermixes a secondary action (bookmark) with primary navigation controls, making the bar confusing at a glance.

Current layout at `app/(app)/app/practice/[sessionId]/components/post-exam-review-view.tsx:133-175`:

```
[ Previous ]  [ Bookmark ]  [ Next ]
[ Previous ]  [ Bookmark ]  [ Finish review ]
              [ Bookmark ]  [ Next ]          ← first question (no Previous)
```

All three buttons share the same flex container (`flex-col gap-3 sm:flex-row`) with no visual separation between navigation and the bookmark action. All use `rounded-full` pill styling — navigation buttons are `outline` variant (except Next/Finish review which is default/filled), and Bookmark is also `outline` variant. The visual weight is nearly identical.

## Why This Is Confusing

- **Fitts's Law grouping**: Previous and Next are a navigation pair. Users expect them adjacent or visually grouped. Bookmark between them breaks the spatial grouping.
- **Action hierarchy**: Navigation is the primary task (reviewing questions sequentially). Bookmarking is a secondary "save for later" action. Equal placement flattens the hierarchy.
- **On the first question** (no Previous), the layout becomes `[ Bookmark ] [ Next ]`, which looks like Bookmark is the "back" action.

## Proposed Fix

Separate Bookmark from the navigation controls. Options:

1. **Far-right separation** — Keep Previous and Next/Finish review grouped together on the left; move Bookmark to the far right of the bar with `ml-auto` or a spacer. This preserves the navigation pair and makes Bookmark visually secondary.

2. **Above the navigation bar** — Move Bookmark above the action bar entirely, near the question content. This separates the action semantically (content-level action vs navigation-level action).

3. **Icon-only bookmark** — Replace the Bookmark text button with an icon-only toggle (star or bookmark icon) positioned at the far right or in the question header area. This is the most compact option and matches common bookmark UX patterns.

## Scope

- **Production file:** `app/(app)/app/practice/[sessionId]/components/post-exam-review-view.tsx:133-175`
- **Test file:** `app/(app)/app/practice/[sessionId]/components/post-exam-review-view.test.tsx` — update if layout assertions exist

## Acceptance Criteria

- [ ] Navigation buttons (Previous, Next/Finish review) are visually grouped as a pair
- [ ] Bookmark is visually separated from navigation controls
- [ ] Bookmark remains accessible and functional
- [ ] Layout works on both mobile (stacked) and desktop (horizontal) breakpoints
