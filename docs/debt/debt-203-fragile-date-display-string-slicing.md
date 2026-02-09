# DEBT-203: Fragile Date Display Using String Slicing

**Status:** Open
**Priority:** P4
**Date:** 2026-02-09

---

## Description

Four locations in the bookmarks and review pages use `.slice(0, 10)` on ISO date strings to extract the `YYYY-MM-DD` portion for display. This pattern is fragile — it assumes the backend always returns ISO 8601 format, provides no timezone-aware display, and would silently produce garbage if the date format ever changes.

## Affected Files

| File | Line | Code |
|------|------|------|
| `app/(app)/app/bookmarks/page.tsx` | 127 | `Bookmarked {row.bookmarkedAt.slice(0, 10)}` |
| `app/(app)/app/bookmarks/page.tsx` | 143 | `Bookmarked {row.bookmarkedAt.slice(0, 10)}` |
| `app/(app)/app/review/page.tsx` | 126 | `Missed {row.lastAnsweredAt.slice(0, 10)}` |
| `app/(app)/app/review/page.tsx` | 149 | `Missed {row.lastAnsweredAt.slice(0, 10)}` |

## Data Flow

The ISO strings originate in the application use cases:

- `bookmarkedAt` — `src/application/use-cases/get-bookmarks.ts:50,61` → `bookmark.createdAt.toISOString()`
- `lastAnsweredAt` — `src/application/use-cases/get-missed-questions.ts:89,96` → `missed.answeredAt.toISOString()`

Both pages are React Server Components (RSC), so date formatting runs on the server, not in the browser.

## Impact

- **Fragility:** If the backend ever returns a non-ISO date string or a `Date` object, `.slice(0, 10)` silently produces wrong output
- **No locale awareness:** Always displays `YYYY-MM-DD` regardless of user's locale preferences
- **No timezone handling:** ISO strings are UTC; users see UTC dates, not local dates
- **Low severity** because the backend currently always returns ISO strings

## Resolution

Replace `.slice(0, 10)` with a proper date formatting utility. Since both pages are server components, formatting runs on the server — hardcoding `en-US` locale is appropriate (no user locale detection possible without a client component wrapper).

**Recommended — shared utility function:**
```typescript
// lib/format-date.ts
export function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString('en-US', { dateStyle: 'medium' });
}
// "Jan 15, 2026" — more readable than "2026-01-15", still UTC date
```

No existing `formatDate` utility exists in the codebase — this would be a new file.

## Verification

- All 4 locations display correctly formatted dates
- Dates respect user timezone (or explicitly display UTC)
- No `.slice(0, 10)` on date strings in production code

## Related

- Bookmarks page: `app/(app)/app/bookmarks/page.tsx`
- Review page: `app/(app)/app/review/page.tsx`
