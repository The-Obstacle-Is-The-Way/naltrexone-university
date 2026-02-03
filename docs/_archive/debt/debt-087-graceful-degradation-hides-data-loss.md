# DEBT-087: Graceful Degradation Hides Data Loss from Users

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-03
**Resolved:** 2026-02-03

---

## Description

Multiple controllers silently skip orphaned records (bookmarks, missed questions, recent activity) when the referenced questions no longer exist. Users see incomplete lists without knowing data was dropped.

```typescript
// Example from bookmark-controller.ts:122-130
for (const bookmark of bookmarks) {
  const question = byId.get(bookmark.questionId);
  if (!question) {
    // Graceful degradation: skip orphans
    d.logger?.warn({ questionId: bookmark.questionId }, 'Bookmark references missing question');
    continue;  // ← User never knows this happened
  }
  rows.push({...});
}
```

## Affected Locations

| File | Lines | What's Skipped |
|------|-------|----------------|
| `bookmark-controller.ts` | 122-130 | Bookmarks for deleted questions |
| `review-controller.ts` | 94-102 | Missed questions that were deleted |
| `stats-controller.ts` | 140-147 | Recent activity for deleted questions |

## Why This Is a Problem

1. **Silent Data Loss:** User bookmarked 10 questions, sees only 7 in the list. No indication that 3 were dropped.

2. **Optional Logger:** `d.logger?.warn(...)` means if logger isn't configured, we don't even know internally.

3. **No Metrics:** We can't detect when orphan rate spikes (data integrity issue).

4. **SRP Violation:** Controllers are handling data consistency recovery, not just request handling.

## Root Cause

Questions can be unpublished/deleted while user data (bookmarks, attempts) persists. This is **expected** — the cascade delete only goes user → data, not question → data.

The current approach chooses "show partial data" over "fail the request."

## Resolution Options

### Option A: Add "Unavailable" Indicator (Recommended)

Instead of silently skipping, include unavailable items in the response:

```typescript
for (const bookmark of bookmarks) {
  const question = byId.get(bookmark.questionId);
  if (!question) {
    rows.push({
      questionId: bookmark.questionId,
      title: '[Question no longer available]',
      isAvailable: false,  // ← UI can render differently
    });
    continue;
  }
  rows.push({
    ...question,
    isAvailable: true,
  });
}
```

**Pros:** User sees complete list, understands some items unavailable
**Cons:** Requires UI changes to handle `isAvailable: false`

### Option B: Add Count Indicator

Return total count alongside results:

```typescript
return ok({
  rows,
  totalBookmarks: bookmarks.length,  // Includes unavailable
  availableCount: rows.length,        // Only available
});
```

**Pros:** UI can show "Showing 7 of 10 bookmarks (3 unavailable)"
**Cons:** Still doesn't explain which ones are missing

### Option C: Make Logger Required

At minimum, ensure orphans are always logged:

```typescript
// In container.ts
logger: primitives.logger ?? console,  // Never undefined

// In controller
d.logger.warn(...)  // No optional chaining
```

**Pros:** Always have visibility into orphan rate
**Cons:** Doesn't help users, just operators

### Option D: Cleanup Job

Add a scheduled job to delete orphaned user data when questions are removed:

```typescript
// Cleanup query
DELETE FROM bookmarks
WHERE question_id NOT IN (SELECT id FROM questions);
```

**Pros:** No orphans in the first place
**Cons:** Adds infrastructure, may delete data users care about

## Recommendation

**Option A + C:** Show unavailable items in UI AND ensure logging is always active.

This provides:
- User transparency (they see something was there)
- Operator visibility (logs show orphan rate)
- No data loss (items are shown, just marked unavailable)

## Example UI Treatment

```text
Your Bookmarks
─────────────
✓ Question about naltrexone dosing
✓ Question about alcohol withdrawal
⚠ [Question no longer available]
✓ Question about opioid use disorder
```

## Verification

After implementing:
- [x] UI shows unavailable items with indicator
- [x] Logger.warn called for each orphan
- [ ] Metrics/alerts for high orphan rate (optional)

## Resolution

We implemented **Option A + C**:

- Controllers return "unavailable" rows instead of silently skipping orphans.
- Controller `logger` deps are required (no optional chaining), ensuring warnings are not silently dropped.

## Related

- `src/adapters/controllers/bookmark-controller.ts:122-130`
- `src/adapters/controllers/review-controller.ts:94-102`
- `src/adapters/controllers/stats-controller.ts:140-147`
- `lib/container.ts` — Logger injection
