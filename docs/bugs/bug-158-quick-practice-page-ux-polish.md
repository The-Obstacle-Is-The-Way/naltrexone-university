# BUG-158: Quick Practice Page UX Polish — Back Link Arrow and Filter Tab Affordance

**Status:** Open
**Priority:** P3
**Date:** 2026-02-25
**Source:** [BS-033](../brainstorming/bs-033-question-display-formatting-and-feedback-ux.md) (Problems 16, 20)

---

## Description

Two lower-severity UX issues on the Quick Practice page that affect navigation clarity and filter discoverability.

### Issue 1: "Back to Practice" link lacks arrow affordance (Problem 16)

The "Back to Practice" link in the top right of the Quick Practice page is plain gray text with no directional indicator. Standard pattern is `← Back to Practice` with an arrow icon.

**Current rendering:**
```
Back to Practice
```

**Expected rendering:**
```
← Back to Practice
```

The link is rendered via `practice-view.tsx:147-153`:
```tsx
<Button asChild variant="link" className="h-auto p-0 text-muted-foreground ...">
  <Link href={backLink.href}>{backLink.label}</Link>
</Button>
```

The `backLink.label` comes from the caller. `quick-practice-client.tsx:72` explicitly passes `label: 'Back to Practice'` — plain text with no arrow character.

### Issue 2: Filter tabs have weak inactive affordance and no counts (Problem 20)

The status tabs (Unanswered / Incorrect / Bookmarked) on the Quick Practice page:
- Inactive tabs look disabled rather than clickable — dim gray text with no border or background to signal interactivity
- No question counts shown (e.g., "Unanswered (48)")
- Touch targets may be under the 44px minimum recommended by Apple HIG / WCAG

**Note:** The tabs are NOT actually disabled — they are clickable. But the inactive styling is so muted that users may not realize they can tap them.

## Steps to Reproduce

### Back link:
1. Navigate to Quick Practice
2. Observe: "Back to Practice" or "Back to Dashboard" text in top right — no arrow icon

### Filter tabs:
1. Navigate to Quick Practice
2. Observe: Inactive tabs are very dim; no counts; touch targets feel small

## Root Cause

### Back link
`app/(app)/app/practice/components/practice-view.tsx:88-91`:
```tsx
const backLink = props.backLink ?? {
  href: ROUTES.APP_DASHBOARD,
  label: 'Back to Dashboard',
};
```

`app/(app)/app/practice/quick/quick-practice-client.tsx:72`:
The Quick Practice page passes `backLink={{ href: ROUTES.APP_PRACTICE, label: 'Back to Practice' }}` — no arrow character.

### Filter tabs
`app/(app)/app/practice/quick/quick-practice-client.tsx:76` and `components/ui/tab-switch-styles.ts:15`:

The tab styling uses `py-1.5` which may produce touch targets under 44px. Inactive tabs use muted colors with no background or border to signal clickability.

Counts are not rendered because labels are currently static (`statusDisplayLabel(s)`) and Quick Practice does not expose per-status counts in its view model. `usePracticeQuestionFlow` returns the active question flow only; it does not return counts for `unanswered` / `incorrect` / `bookmarked`.

## Fix

### Fix 1: Add arrow to back link

**File:** `app/(app)/app/practice/quick/quick-practice-client.tsx`

Update the back link label to include an arrow:

```diff
-backLink={{ href: ROUTES.APP_PRACTICE, label: 'Back to Practice' }}
+backLink={{ href: ROUTES.APP_PRACTICE, label: '← Back to Practice' }}
```

Or alternatively, add a `ChevronLeft` icon in `practice-view.tsx` before the label text. The text arrow `←` is simpler and consistent with the existing `← Previous` and `Next →` button patterns in the codebase.

### Fix 2: Improve filter tab affordance and add counts

**Files:** Quick Practice client + a new status-count hook

1. **Add counts:** Change tab labels from `"Unanswered"` to `"Unanswered (${count})"` by fetching counts explicitly. The counts are **not** already available in the current Quick Practice flow state.
   - Implement a small hook (e.g., `useQuickPracticeStatusCounts`) that calls `countAvailableQuestions` for each status (`unanswered`, `incorrect`, `bookmarked`) with current filters.
   - Keep this hook independent from the active-question hook (`usePracticeQuestionFlow`) so count loading/error state does not block question answering.
2. **Improve inactive styling:** Add a subtle border or background to inactive tabs (e.g., `border border-border/40` or `bg-muted/30`) so they look clickable rather than disabled
3. **Increase touch target:** Bump `py-1.5` to `py-2.5` or add `min-h-[44px]` to meet the 44px minimum

## Affected Files

| File | Change |
|------|--------|
| `app/(app)/app/practice/quick/quick-practice-client.tsx` | Update back link label. Render status labels with fetched counts. |
| `app/(app)/app/practice/hooks/use-quick-practice-status-counts.ts` | NEW: fetch per-status counts for Quick Practice segmented control. |
| `components/ui/tab-switch-styles.ts` | Improve inactive tab styling. Increase touch target. |
| `app/(app)/app/practice/quick/quick-practice-client.test.tsx` | Update assertions for back link text and count-enriched tab labels. |
| `app/(app)/app/practice/quick/quick-practice-client.browser.spec.tsx` | Add/adjust interaction assertions for count labels and tab affordance. |
| `app/(app)/app/practice/hooks/use-quick-practice-status-counts.test.tsx` | NEW: unit tests for count loading/error/success behavior. |

## Verification

- [ ] "← Back to Practice" shows with arrow on Quick Practice page
- [ ] Back link navigates correctly (no regression)
- [ ] Filter tabs show question counts (e.g., "Unanswered (48)")
- [ ] Inactive tabs look clickable (not disabled)
- [ ] Touch targets meet 44px minimum height
- [ ] Active tab styling is clearly differentiated from inactive
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm test --run` passes

## Related

- [BS-033](../brainstorming/bs-033-question-display-formatting-and-feedback-ux.md) — Problems 16 and 20
