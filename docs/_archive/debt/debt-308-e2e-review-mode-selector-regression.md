# DEBT-308: E2E Bookmark Review Selector Drift After DEBT-307

**Priority:** P1
**Created:** 2026-03-12
**Source:** PR #206 (BS-049 / DEBT-307 — Bookmarks Row Visual Unification)
**Status:** Resolved
**Resolved:** 2026-03-12
**Resolution:** Updated `tests/e2e/review-mode-audit.spec.ts` to select bookmark review links by their current `href` contract (`/app/questions/*` + `from=bookmarks` + `mode=review`) instead of the removed `Review question:` action-link `aria-label`.
**Verification:** `pnpm test:e2e --grep "bookmarks links include mode=review and open in review mode"`, `pnpm typecheck`, `pnpm lint`, `pnpm test --run`, `pnpm test:browser`, and `pnpm build` passed on 2026-03-12.

---

## Problem

The E2E test `review-mode-audit.spec.ts › bookmark review mode › bookmarks links include mode=review and open in review mode` is selecting an element that no longer exists. After DEBT-307 removed the dedicated per-row `Review` action link, the test still looks for anchors with `aria-label^="Review question:"`, so it times out even though bookmark navigation still works through the remaining title link.

Verified evidence:
- PR #206 CI run `23013822896` failed on this exact selector.
- `main` merge CI run `23014540939` failed on this exact selector.
- The latest failing `dev` run `22911593463` also included this selector failure, but that run had 9 E2E failures total, so it is not clean evidence that `dev` is blocked solely by this issue.

### Error

```text
TimeoutError: locator.waitFor: Timeout 15000ms exceeded.
Call log:
  - waiting for locator('a[aria-label^="Review question:"]')
    .first().or(getByText('No bookmarks yet.', { exact: true })) to be visible
```

---

## Root Cause

PR #206 (DEBT-307) intentionally changed the bookmarks interaction model:
- Removed the dedicated per-row `Review` button/link.
- Kept an explicit title `<Link>` for keyboard and screen-reader navigation.
- Added delegated container activation for pointer users via `BookmarkRowShell`.

Before DEBT-307, the audit test could find bookmark review entry points by selecting the old action link:

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

The dedicated `Review` action link is gone. The row is pointer-clickable via `BookmarkRowShell`, and the remaining keyboard-focusable `<Link>` is the visible stem preview:

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

That selector now matches zero elements because the element it described was intentionally removed.

### What Did NOT Break

This is **not** a production accessibility regression by itself:
- The remaining title link still has a discernible accessible name from its visible text.
- `docs/frontend/standards.md` requires contextual `aria-label`s for repeated generic controls like `Remove`, not for text links that already expose meaningful visible names.
- `app/(app)/app/bookmarks/page.test.tsx` was explicitly updated in DEBT-307 to assert that `Review question:` labels are absent from the new markup.

---

## Why This Was Missed

1. **E2E tests run only in CI** — the pre-PR gate does not include `pnpm test:e2e`.
2. **No local E2E run was performed** before opening the PR.
3. **Unit and browser tests were updated** in the PR, including explicit assertions that the old `Review question:` label no longer exists, but the E2E audit selector was left behind.

---

## Fix Options

### Option A: Add `aria-label` to the stem preview link

Add `aria-label={`Review question: ${ariaLabelStem}`}` to the inner `<Link>` that renders the stem preview text.

```jsx
<Link
  href={reviewHref}
  aria-label={`Review question: ${ariaLabelStem}`}
  className="rounded-sm focus-visible:outline-none ..."
>
  {getStemPreview(row.stemMd, 80)}
</Link>
```

**Pros:** Minimal code diff. The stale E2E selector would pass unchanged.
**Cons:** Wrong layer of fix. It reintroduces a removed label contract solely to satisfy a stale test, conflicts with the DEBT-307 render test that now asserts the label is absent, and changes the link's accessible name without any documented product or standards requirement to do so.

### Option B: Update the E2E selector to match the current contract

Change the E2E test to locate the current bookmark review links by the behavior the test actually cares about: question-detail navigation carrying `from=bookmarks` and `mode=review`.

```ts
const reviewLinks = page.locator(
  'a[href^="/app/questions/"][href*="from=bookmarks"][href*="mode=review"]',
);
```

**Pros:** Aligns the test with the current SSOT and with existing E2E selector precedent in `cross-page-navigation.spec.ts` and earlier sections of `review-mode-audit.spec.ts`, both of which already use `href`-based review-link selectors. No production markup churn.
**Cons:** Still couples the test to the route contract, but that route contract is exactly what this audit is asserting.

### Option C: Add a test-only hook (for example, `data-testid`)

**Pros:** Stable explicit selector.
**Cons:** Adds production-only test chrome for a case where an existing stable contract already exists. Unnecessary.

### Recommended: Option B

Update the E2E selector. The failure is a stale test contract after an intentional UI change, not evidence that the bookmarks page should regain `Review question:` labels. Adding that label back would be a half-measure that makes production markup serve a dead test instead of the product.

---

## Files Updated

| File | Change |
|------|--------|
| `tests/e2e/review-mode-audit.spec.ts` | Replace the obsolete `aria-label` selector with an `href`-based selector that matches the current bookmark review-link contract |
| `docs/_archive/debt/debt-308-e2e-review-mode-selector-regression.md` | Archive the debt with the verified root cause, chosen fix, and final verification record |

---

## Final Verification

```bash
# Targeted E2E regression check
pnpm test:e2e --grep "bookmarks links include mode=review and open in review mode"

# Pre-PR gate
pnpm typecheck && pnpm lint && pnpm test --run && pnpm test:browser && pnpm build

# CI should then confirm the merge path is green
```
