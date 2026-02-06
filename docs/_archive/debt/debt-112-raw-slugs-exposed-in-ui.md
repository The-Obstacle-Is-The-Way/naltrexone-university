# DEBT-112: Raw Content-Pipeline Slugs Exposed to Users in Dashboard, Review, and Bookmarks

**Status:** Resolved
**Priority:** P1
**Date:** 2026-02-06
**Resolved:** 2026-02-06

---

## Description

Raw question slugs (content-pipeline identifiers such as `stahls-topiramate-003`) were visible in user-facing list UIs:

- Dashboard "Recent Activity"
- Review cards
- Bookmarks cards

These slugs are internal naming artifacts and not meaningful to learners.

---

## Impact

- UI showed internal identifiers instead of educationally meaningful text.
- Recent activity readability was poor.
- The product leaked implementation details in primary study surfaces.

---

## Resolution (Implemented, Option A)

### 1. Stats Use Case Enrichment

Extended `GetUserStatsUseCase` recent activity rows to include:

- `stemMd`
- `difficulty`

This provides dashboard-ready question text context without schema changes.

### 2. Shared Stem Preview Helper

Added `getStemPreview(stemMd, maxLength)` to normalize markdown to plain text and apply deterministic truncation with ellipsis.

### 3. UI Rendering Changes

Replaced slug text display with truncated stem preview in:

- Dashboard recent activity rows
- Review card title
- Bookmarks card title

The full `stemMd` body remains shown on Review/Bookmarks for context.

### 4. Regression Test Coverage

Added/updated tests to verify:

- stem preview is shown in list titles
- raw slug text is not rendered as visible card/title content
- truncation behavior is deterministic

---

## Verification

- [x] Dashboard shows truncated stem text in recent activity
- [x] Review cards show truncated stem title (not slug text)
- [x] Bookmarks cards show truncated stem title (not slug text)
- [x] Stem preview helper has dedicated unit tests
- [x] No direct slug text rendering remains in these user-facing list UIs
- [x] Full unit suite passes (`pnpm test --run`)

Note: slugs remain internal navigation identifiers for question routes (e.g., link hrefs), but they are no longer displayed as user-facing list/card labels.

---

## Related

- `src/application/use-cases/get-user-stats.ts`
- `src/adapters/shared/stem-preview.ts`
- `app/(app)/app/dashboard/page.tsx`
- `app/(app)/app/review/page.tsx`
- `app/(app)/app/bookmarks/page.tsx`
