# DEBT-215: Backwards Compatibility Shims in a Greenfield Codebase

**Status:** Open
**Priority:** P3
**Date:** 2026-02-14

---

## Description

This is a greenfield project with no external API consumers, no published URL contracts, and a controlled user base. Despite this, the codebase has accumulated several backwards-compatibility shims — URL parameter aliases, legacy value mappings, and dead origin handlers. Each one adds a branch that future developers will be afraid to remove ("what if something depends on this?"), compounding into cruft that makes the codebase look older than it is.

Uncle Bob's Clean Code principle: **dead code is a lie**. It tells future readers that something matters when it doesn't. In a greenfield project, backwards compat is almost never necessary — just change the canonical value and update all references.

## Inventory

### 1. `tab=missed` Backward-Compat Mode (Alias + Default `result=incorrect`)

**Files:**
- `app/(app)/app/history/history-search-params.ts:18`
- `app/(app)/app/history/page.tsx:56-64`

```typescript
if (value === 'questions' || value === 'missed') return 'questions';
```

```typescript
const defaultResultFilter =
  rawTab === 'missed' ? ('incorrect' as const) : null;
// ...
result: parseResultFilter(params.result) ?? defaultResultFilter,
```

The `missed` tab name was renamed to `questions` in SPEC-022. Today, `?tab=missed` semantically means **Questions tab with `result=incorrect`** (i.e., “review incorrect questions”).

No external system generates `?tab=missed` URLs. This exists only because old bookmarks (and some internal tests) might contain it.

**Fix:** Remove the `missed` alias in `parseHistoryTab()` **and** remove the `rawTab === 'missed'` default-result behavior. Update any internal references/tests that still generate `?tab=missed` to use the canonical `?tab=questions&result=incorrect`.

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

### 4. Legacy `from=review` Handler (Dead Origin Value)

**Files:**
- `lib/routes.ts:22-27` (type includes `'review'`)
- `app/(app)/app/questions/[slug]/question-page-client.tsx:21-28` (parses `'review'`)
- `app/(app)/app/questions/[slug]/question-page-client.tsx:45-51` (UI branch)

```typescript
if (resolvedOrigin === 'review') {
  return {
    backHref: `${ROUTES.APP_HISTORY}?tab=missed`,
    backLabel: 'Back to History',
    subtitle: 'Reattempt a question from your review list.',
  };
}
```

The legacy value is `from=review` (query param name is `from`, not `origin`). This refers to the old “Review” concept/route (see `/app/review` redirect in item #5 and DEBT-210).

No current production flow generates `from=review`, but old links/tests still rely on it.

**Fix:** Remove the `'review'` case entirely (type + parsing + UI branch). If someone lands on a question page with `?from=review`, they should get the default dashboard back-link (or whatever the new canonical behavior is).

### 5. Legacy `/app/review` Redirect (Infrastructure Shim)

**Files:**
- `next.config.ts:39-42`
- `next.config.test.ts:19-35`

```typescript
{
  source: '/app/review',
  destination: '/app/history?tab=questions&result=incorrect',
  permanent: true,
},
```

This is an explicit backwards-compat route shim. In a greenfield project, we should not preserve old routes unless there is a concrete consumer.

**Fix:** Remove this redirect rule and its unit + E2E test coverage once `/app/review` is no longer considered supported.

### 6. Backwards-Compat Tests

These tests exist solely to verify the shims above work. Once the shims are removed, the tests should be removed too:

| Test File | Line | What It Tests |
|-----------|------|---------------|
| `app/(app)/app/history/history-search-params.test.ts` | 27 | `parseHistoryTab('missed')` returns `'questions'` |
| `app/(app)/app/history/page.test.tsx` | 78 | Page renders correctly with `tab=missed` |
| `app/(app)/app/history/history-search-params.test.ts` | 111 | `parseSourceFilter('quick')` returns `'adhoc'` |
| `app/(app)/app/questions/[slug]/question-page-client.test.tsx` | 62 | `from=review` produces a back-link to `/app/history?tab=missed` |
| `next.config.test.ts` | 19 | Redirect rule exists for `/app/review` |
| `tests/e2e/core-app-pages.spec.ts` | 27 | `/app/review` returns HTTP 308 and lands on History (Questions, Incorrect) |
| `tests/e2e/core-app-pages.spec.ts` | 51 | Visiting `/app/history?tab=missed` works (alias behavior) |
| `tests/e2e/history.spec.ts` | 28, 46 | Uses `/app/history?tab=missed` as the “missed questions” view |

### 7. Dead `ROUTES.APP_REVIEW` Constant

**File:** `lib/routes.ts:12`

Already tracked as **DEBT-210**. The constant has zero consumers in production code (grep shows only `lib/routes.ts` and docs/tests). Runtime backwards-compat for `/app/review` **does** exist today via `next.config.ts` (item #5), but the redirect uses a string literal, so `ROUTES.APP_REVIEW` is still truly orphaned.

**Fix:** Covered by DEBT-210. This debt doc cross-references it for completeness.

## Impact

- **Cognitive overhead**: Each shim makes developers ask "can I remove this?" and then not remove it out of caution
- **Compounding cruft**: Shims #3 and #4 depend on shim #1, creating a dependency chain of legacy code
- **False maturity signal**: Makes the codebase look like it has external consumers when it doesn't
- **Test maintenance**: Multiple unit + E2E tests exist solely to verify backwards compat that isn't needed (see inventory)

## Resolution

Remove all shims in a single atomic commit:

1. Update `question-page-client.tsx` back link from `?tab=missed` to `?tab=questions&result=incorrect` (stop generating legacy URLs)
2. Update/remove E2E + unit tests that navigate to `?tab=missed` or assert it
3. Remove the `rawTab === 'missed'` default-result behavior in `app/(app)/app/history/page.tsx`
4. Remove `'missed'` from `parseHistoryTab()` — only accept `'questions'` and `'sessions'`
5. Remove `'quick'` from `parseSourceFilter()` — only accept `'tutor'`, `'exam'`, `'adhoc'`
6. Remove `from=review` support (type + parsing + UI branch)
7. Remove `/app/review` redirect in `next.config.ts` and delete its unit + E2E test coverage
8. Delete `ROUTES.APP_REVIEW` constant (DEBT-210)

### Order

Do item 1 first (stop generating legacy URLs), then 2 (stop relying on legacy URLs in tests), then 3–7 (stop accepting legacy inputs/routes). This avoids a window where the app generates URLs it can’t parse.

## Verification

1. `pnpm typecheck` — no compile errors from removed branches
2. `pnpm test --run` — all tests pass (after removing compat-specific tests)
3. `pnpm lint` — no unused imports
4. `rg -n "tab=missed|rawTab === 'missed'|source=quick|from=review|/app/review|\\bAPP_REVIEW\\b" app src lib components tests next.config.ts next.config.test.ts` — zero hits
5. Manual: navigate History, Quick Practice, and question detail pages — all links work with canonical URLs

## Related

- DEBT-210 — Dead `ROUTES.APP_REVIEW` constant (overlapping item)
- SPEC-022 — Original spec that renamed `missed` → `questions`
- `app/(app)/app/history/history-search-params.ts`
- `app/(app)/app/history/page.tsx`
- `app/(app)/app/questions/[slug]/question-page-client.tsx`
- `lib/routes.ts`
- `next.config.ts`
