# BUG-031: Non-Unique React Key in Dashboard Recent Activity

**Status:** Resolved
**Priority:** P3 - Low
**Date:** 2026-02-02
**Resolved:** 2026-02-02

---

## Summary
The dashboard recent activity list uses `row.answeredAt` (timestamp) as the React key. If two questions are answered in the same millisecond, the key duplicates, causing React warnings and potential rendering bugs.

## Location
- `app/(app)/app/dashboard/page.tsx:90`
- `src/adapters/controllers/stats-controller.ts`

## Root Cause
`answeredAt` was chosen for simplicity, but it's not guaranteed unique. The stats controller output didn't include the attempt ID.

## Fix
Added `attemptId` to the `UserStatsOutput['recentActivity']` type and implementation:

**stats-controller.ts:**
```typescript
recentActivity: Array<{
  attemptId: string;  // Added
  answeredAt: string;
  questionId: string;
  slug: string;
  isCorrect: boolean;
}>;
```

**dashboard/page.tsx:**
```typescript
<li key={row.attemptId} className="flex items-center gap-2">
```

## Verification
- [x] Unit test added (`stats-controller.test.ts` - includes attemptId in recentActivity)
- [x] Dashboard test updated
- [x] TypeScript compilation passes
- [x] Build succeeds

## Related
- React docs: https://react.dev/learn/rendering-lists#keeping-list-items-in-order-with-key
