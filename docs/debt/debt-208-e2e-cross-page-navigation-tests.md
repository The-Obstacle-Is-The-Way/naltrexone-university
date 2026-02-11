# DEBT-208: Missing E2E Tests for Cross-Page Navigation Flows

**Status:** Open
**Priority:** P3
**Date:** 2026-02-11
**GitHub Issue:** #81

---

## Description

SPEC-019 Phase 3 added cross-page navigation: clickable dashboard activity items, origin-aware question detail "Back to..." links, and review/bookmarks stem links. While comprehensive unit tests exist via `renderToStaticMarkup` (verifying `href` attributes and link text), no Playwright E2E tests cover the full click-through browser flows.

### What Exists (Partial Coverage)

- `tests/e2e/core-app-pages.spec.ts:58-66` — Tests History → Question forward navigation (click link, verify URL) but does NOT test the "Back to History" click
- `tests/e2e/history.spec.ts:28-42` — Tests missed questions tab → question navigation, but no back-link verification
- `tests/e2e/review-mode-audit.spec.ts` — Tests 5 entry points (dashboard, history correct/incorrect, session breakdown, bookmarks) reaching the question page, but never clicks the "Back to..." link
- Unit tests in `question-page-client.test.tsx` verify correct `href` attributes and label text for all origins

### What's Missing

The specific gap is **clicking the "Back to..." link and verifying return navigation** in a real browser:

1. **Dashboard → Question detail → Back to Dashboard**: Click an activity item on the dashboard, verify the question detail page loads, click "Back to Dashboard" link, verify return
2. **History → Question detail → Back to History**: Click a question stem in the Questions tab, verify navigation, click back link
3. **Bookmarks → Question detail → Back to Bookmarks**: Click a bookmarked question, verify navigation flow

### Clean Architecture Analysis

Uncle Bob emphasizes that **boundaries should be tested at the boundary**. Unit tests verify that components render correct `href` attributes (output boundary), but they don't test that the browser actually navigates correctly when those links are clicked (integration at the framework boundary). E2E tests close this gap.

## Impact

- **Low regression risk**: Navigation is simple `<Link>` components with static `href` values — unlikely to break silently
- **Confidence gap**: No automated proof that click-through flows work end-to-end in a real browser
- **Blocked by infrastructure**: DEBT-104 (E2E test credentials for authenticated flows) is "Accepted" — infrastructure is in place but CI secrets need manual setup

## Resolution

### Prerequisite

Complete DEBT-104's remaining manual steps:
1. Add `E2E_CLERK_USER_EMAIL` and `E2E_CLERK_USER_PASSWORD` to CI secrets
2. Verify Clerk test mode configuration

### Step 1: Add Cross-Page Navigation E2E Tests

Create `tests/e2e/cross-page-navigation.spec.ts`:

```typescript
test('dashboard activity item navigates to question detail and back', async ({ page }) => {
  await page.goto('/app/dashboard');
  const activityItem = page.getByRole('link', { name: /some-question-stem/ });
  await activityItem.click();
  await expect(page).toHaveURL(/\/app\/questions\//);
  const backLink = page.getByRole('link', { name: /Back to Dashboard/ });
  await backLink.click();
  await expect(page).toHaveURL('/app/dashboard');
});
```

Repeat for History → Question and Bookmarks → Question flows.

### Step 2: Test Origin-Aware Back Links

Verify that the `from` query parameter controls the back link destination:
- `?from=dashboard` → "Back to Dashboard"
- `?from=history` → "Back to History"
- `?from=bookmarks` → "Back to Bookmarks"

## Verification

1. `pnpm test:e2e` passes with new navigation tests
2. Each flow exercises: page load → link click → destination verification → back link → return verification

## Related

- SPEC-019 Phase 3 (PR #79)
- DEBT-104 (Missing E2E Test Credentials — Accepted)
- `tests/e2e/core-app-pages.spec.ts` (existing E2E coverage)
- `app/(app)/app/questions/[slug]/` (question detail page with origin-aware back links)
