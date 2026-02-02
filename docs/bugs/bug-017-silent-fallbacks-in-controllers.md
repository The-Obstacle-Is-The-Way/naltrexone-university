# BUG-017: Silent Fallbacks in Controllers — Data Inconsistency Without Warning

**Status:** Open
**Priority:** P2
**Date:** 2026-02-02

---

## Description

Multiple controllers silently skip data when referenced entities (questions) are not found. Users see incomplete lists without any indication that data is missing.

**Observed behavior:**
- Bookmark list missing entries with no warning
- Review list missing entries with no warning
- Recent activity missing entries with no warning

**Expected behavior:**
- Either: Log a warning when skipping orphaned references
- Or: Show users "X items could not be loaded"
- Or: Clean up orphaned references proactively

## Steps to Reproduce

1. Create bookmarks for questions
2. Delete one of the bookmarked questions from database
3. Navigate to bookmarks (when implemented)
4. Observe: Bookmark count doesn't match displayed items
5. No error, no warning, no indication of missing data

## Root Cause

Three controllers use the same pattern — silent `continue` when question lookup fails:

**bookmark-controller.ts:135**
```typescript
for (const bookmark of bookmarks) {
  const question = byId.get(bookmark.questionId);
  if (!question) continue;  // ← Silent skip
  rows.push({...});
}
```

**review-controller.ts:121**
```typescript
for (const m of page) {
  const question = byId.get(m.questionId);
  if (!question) continue;  // ← Silent skip
  rows.push({...});
}
```

**stats-controller.ts:140**
```typescript
for (const attempt of recentAttempts) {
  const slug = slugByQuestionId.get(attempt.questionId);
  if (!slug) continue;  // ← Silent skip
  recentActivity.push({...});
}
```

## Fix

Option 1: Add logging for observability:
```typescript
if (!question) {
  logger.warn({ bookmarkId: bookmark.id, questionId: bookmark.questionId },
    'Bookmark references deleted question');
  continue;
}
```

Option 2: Return metadata about skipped items:
```typescript
return {
  rows,
  skipped: skippedCount,
  message: skippedCount > 0 ? `${skippedCount} items could not be loaded` : undefined
};
```

Option 3: Add a cleanup job that removes orphaned references.

## Verification

- [ ] Add logging statements to all three locations
- [ ] Verify logs appear when question is deleted
- [ ] Consider adding skipped count to response
- [ ] Manual verification with orphaned data

## Related

- `src/adapters/controllers/bookmark-controller.ts:135`
- `src/adapters/controllers/review-controller.ts:121`
- `src/adapters/controllers/stats-controller.ts:140`
