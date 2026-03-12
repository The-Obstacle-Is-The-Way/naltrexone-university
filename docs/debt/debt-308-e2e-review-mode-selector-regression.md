# DEBT-308: E2E Review-Mode Audit Selector Regression

**Priority:** P1
**Created:** 2026-03-12
**Source:** PR #206 (BS-049 / DEBT-307 — Bookmarks Row Visual Unification)
**Status:** Open
**CI Impact:** Blocks `main` — E2E suite fails on every push

---

## Problem

The E2E test `review-mode-audit.spec.ts › bookmark review mode › bookmarks links include mode=review and open in review mode` fails with a 15-second timeout on CI (and locally). It has failed consistently since PR #206 was merged.

### Error

```
TimeoutError: locator.waitFor: Timeout 15000ms exceeded.
Call log:
  - waiting for locator('a[aria-label^="Review question:"]')
    .first().or(getByText('No bookmarks yet.', { exact: true })) to be visible
```

---

## Root Cause

PR #206 (DEBT-307) refactored the bookmarks page from per-row `<Card>` components to tonal `<div>` rows wrapped in a `<BookmarkRowShell>`. As part of this change, the dedicated **"Review" button** per bookmark row was removed:

### Before (old markup)

```jsx
<Button asChild variant="outline" className="rounded-full">
  <Link
    href={toQuestionRoute(row.slug, { from: 'bookmarks', mode: 'review' })}
    aria-label={`Review question: ${ariaLabelStem}`}
  >
    Review
  </Link>
</Button>
```

### After (new markup)

The "Review" `<Link>` was removed entirely. The whole row is now clickable via `BookmarkRowShell` (a `<div onClick={...}>` wrapper). The only remaining `<Link>` inside each row is the stem preview text, which has **no `aria-label`** attribute:

```jsx
<Link
  href={reviewHref}
  className="rounded-sm focus-visible:outline-none ..."
>
  {getStemPreview(row.stemMd, 80)}
</Link>
```

### E2E Selector That Broke

```ts
// tests/e2e/review-mode-audit.spec.ts:322
const reviewLinks = page.locator('a[aria-label^="Review question:"]');
```

This selector now matches **zero elements**, so the `waitFor` call times out every run.

---

## Why This Was Missed

1. **E2E tests run only in CI** — the pre-PR gate (`pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:browser && pnpm test:integration && pnpm build`) does not include `pnpm test:e2e`.
2. **No local E2E run was performed** before opening the PR.
3. **Unit and browser tests were updated** in the PR (the `page.test.tsx` changes and new `bookmark-row-shell.browser.spec.tsx`), but the E2E test was not checked for selector compatibility with the new DOM structure.

---

## Fix Options

### Option A: Add `aria-label` to the stem preview link (minimal change)

Add `aria-label={`Review question: ${ariaLabelStem}`}` to the inner `<Link>` that renders the stem preview text. This restores the selector target without re-adding the removed "Review" button.

```jsx
<Link
  href={reviewHref}
  aria-label={`Review question: ${ariaLabelStem}`}
  className="rounded-sm focus-visible:outline-none ..."
>
  {getStemPreview(row.stemMd, 80)}
</Link>
```

**Pros:** One-line fix, restores accessibility affordance, E2E passes unchanged.
**Cons:** The `aria-label` on a link whose visible text is the question stem may be slightly redundant, though it adds useful context for screen readers.

### Option B: Update the E2E selector to match the new DOM structure

Change the E2E test to locate bookmark rows by a different stable selector (e.g., the stem preview links by `href` pattern or a `data-testid`).

```ts
// Example: find all links whose href contains mode=review and from=bookmarks
const reviewLinks = page.locator('a[href*="mode=review"][href*="from=bookmarks"]');
```

**Pros:** Doesn't require any production code changes.
**Cons:** `href`-based selectors are less semantic; if route structure changes, the test breaks again.

### Recommended: Option A

Adding the `aria-label` back is the right call. It was a meaningful accessibility attribute that was lost in the refactor — the "Review question:" prefix gives screen-reader users context that the link leads to a review-mode question view. The E2E fix is a free side-effect of restoring the correct a11y markup.

---

## Files to Modify

| File | Change |
|------|--------|
| `app/(app)/app/bookmarks/page.tsx` (line ~146) | Add `aria-label={...}` to inner `<Link>` |
| `app/(app)/app/bookmarks/page.test.tsx` | Verify unit test still passes (no selector change needed) |

---

## Verification

```bash
# After fix, run:
pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:browser && pnpm build
# And confirm E2E passes in CI (or locally if Playwright + Clerk credentials available)
```
