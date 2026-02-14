# DEBT-215: Backwards Compatibility Shims in a Greenfield Codebase

**Status:** Open
**Priority:** P3
**Date:** 2026-02-14

---

## Description

This is a greenfield project with no external API consumers, no published URL contracts, and a controlled user base. Despite this, the codebase has accumulated several backwards-compatibility shims — URL parameter aliases, legacy value mappings, and dead origin handlers. Each one adds a branch that future developers will be afraid to remove ("what if something depends on this?"), compounding into cruft that makes the codebase look older than it is.

Uncle Bob's Clean Code principle: **dead code is a lie**. It tells future readers that something matters when it doesn't. In a greenfield project, backwards compat is almost never necessary — just change the canonical value and update all references.

## Inventory

### 1. `tab=missed` → `tab=questions` Alias

**File:** `app/(app)/app/history/history-search-params.ts:18`

```typescript
if (value === 'questions' || value === 'missed') return 'questions';
```

The `missed` tab name was renamed to `questions` in SPEC-022. No external system generates `?tab=missed` URLs. This alias exists only because old bookmarks might contain it.

**Fix:** Remove `|| value === 'missed'`. Update any internal references that still generate `?tab=missed`.

### 2. `source=quick` → `source=adhoc` Alias

**File:** `app/(app)/app/history/history-search-params.ts:67-68`

```typescript
// Backward-compat: legacy URLs used `source=quick`. Tests cover this mapping.
if (value === 'quick') return 'adhoc';
```

The source value was renamed from `quick` to `adhoc`. Same situation — no external system generates this.

**Fix:** Remove the `'quick'` branch and its comment.

### 3. Back Link Uses Legacy `?tab=missed`

**File:** `app/(app)/app/questions/[slug]/question-page-client.tsx:47`

```typescript
backHref: `${ROUTES.APP_HISTORY}?tab=missed`,
```

This generates a URL using the legacy alias instead of the canonical form. It works only because alias #1 above exists.

**Fix:** Change to `?tab=questions&result=incorrect` (the canonical form for the "review incorrect questions" view).

### 4. Legacy `origin=review` Handler

**File:** `app/(app)/app/questions/[slug]/question-page-client.tsx:45-51`

```typescript
if (resolvedOrigin === 'review') {
  return {
    backHref: `${ROUTES.APP_HISTORY}?tab=missed`,
    backLabel: 'Back to History',
    subtitle: 'Reattempt a question from your review list.',
  };
}
```

The `origin=review` value refers to the old `/app/review` route (now dead — see DEBT-210). This handler exists because old URLs might still have `?origin=review`. Since `/app/review` itself is dead, no flow generates this origin value anymore.

**Fix:** Remove the `origin === 'review'` branch entirely. If someone lands on a question page with `?origin=review`, they'll get the default dashboard back-link, which is correct.

### 5. Backwards-Compat Tests

These tests exist solely to verify the shims above work. Once the shims are removed, the tests should be removed too:

| Test File | Line | What It Tests |
|-----------|------|---------------|
| `app/(app)/app/history/history-search-params.test.ts` | 27 | `parseHistoryTab('missed')` returns `'questions'` |
| `app/(app)/app/history/page.test.tsx` | 78 | Page renders correctly with `tab=missed` |
| `app/(app)/app/history/history-search-params.test.ts` | 111 | `parseSourceFilter('quick')` returns `'adhoc'` |
| `tests/e2e/core-app-pages.spec.ts` | 51-52 | E2E test for `/app/review` 308 redirect |

### 6. Dead `ROUTES.APP_REVIEW` Constant

**File:** `lib/routes.ts:12`

Already tracked as **DEBT-210**. The constant has zero consumers in production code. The E2E test at `tests/e2e/core-app-pages.spec.ts:27-43` expects a 308 redirect from `/app/review` → `/app/history?tab=questions&result=incorrect`, but no redirect implementation exists in source code (may be in Vercel config or may be aspirational).

**Fix:** Covered by DEBT-210. This debt doc cross-references it for completeness.

## Impact

- **Cognitive overhead**: Each shim makes developers ask "can I remove this?" and then not remove it out of caution
- **Compounding cruft**: Shims #3 and #4 depend on shim #1, creating a dependency chain of legacy code
- **False maturity signal**: Makes the codebase look like it has external consumers when it doesn't
- **Test maintenance**: ~4 tests exist solely to verify backwards compat that isn't needed

## Resolution

Remove all shims in a single atomic commit:

1. Remove `'missed'` from `parseHistoryTab()` — only accept `'questions'`
2. Remove `'quick'` from `parseSourceFilter()` — only accept `'tutor'`, `'exam'`, `'adhoc'`
3. Update `question-page-client.tsx` back link from `?tab=missed` to `?tab=questions&result=incorrect`
4. Remove `origin === 'review'` branch from `question-page-client.tsx`
5. Remove all backwards-compat tests
6. Delete `ROUTES.APP_REVIEW` constant (DEBT-210) and update/remove its E2E test

### Order

Do items 3 and 4 first (stop generating legacy values), then 1 and 2 (stop accepting them). This avoids a window where the app generates URLs it can't parse.

## Verification

1. `pnpm typecheck` — no compile errors from removed branches
2. `pnpm test --run` — all tests pass (after removing compat-specific tests)
3. `pnpm lint` — no unused imports
4. `grep -r "missed\|quick\|origin=review\|APP_REVIEW" app/ src/ lib/` — zero hits
5. Manual: navigate History, Quick Practice, and question detail pages — all links work with canonical URLs

## Related

- DEBT-210 — Dead `ROUTES.APP_REVIEW` constant (overlapping item)
- SPEC-022 — Original spec that renamed `missed` → `questions`
- `app/(app)/app/history/history-search-params.ts`
- `app/(app)/app/questions/[slug]/question-page-client.tsx`
- `lib/routes.ts`
