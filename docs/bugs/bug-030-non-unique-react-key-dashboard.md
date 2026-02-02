# BUG-030: Non-Unique React Key in Dashboard Recent Activity

## Severity: P3 - Low

## Summary
The dashboard recent activity list uses `row.answeredAt` (timestamp) as the React key. If two questions are answered in the same millisecond, the key duplicates, causing React warnings and potential rendering bugs.

## Location
- `app/(app)/app/dashboard/page.tsx:90`

## Current Behavior
```typescript
{stats.recentActivity.map((row) => (
  <li key={row.answeredAt} className="flex items-center gap-2">
    <span className="font-medium text-foreground">{row.slug}</span>
    <span className="text-muted-foreground">
      {row.isCorrect ? 'Correct' : 'Incorrect'}
    </span>
  </li>
))}
```

`answeredAt` is a timestamp string (ISO format). While collisions are rare in normal use, they can occur:
- Automated testing with rapid submissions
- Fast users double-clicking
- Clock synchronization issues

## Expected Behavior
Use a unique identifier that cannot collide:
- `attemptId` (UUID) - guaranteed unique
- Composite key: `${row.questionId}-${row.answeredAt}`

## Impact
- **React warnings in console:** Duplicate keys warning
- **Rendering bugs:** React may reuse DOM nodes incorrectly
- **Test failures:** Automated tests with rapid submissions may fail unpredictably

## Root Cause
`answeredAt` was chosen for simplicity, but it's not guaranteed unique.

## Recommended Fix
```typescript
// Option A: Use attempt ID (if available in stats response)
<li key={row.attemptId} ...>

// Option B: Composite key
<li key={`${row.questionId}-${row.answeredAt}`} ...>

// Option C: Add index (last resort)
{stats.recentActivity.map((row, index) => (
  <li key={`${row.answeredAt}-${index}`} ...>
))}
```

**Prefer Option A** if `attemptId` can be added to the stats response.

## Related
- React docs: https://react.dev/learn/rendering-lists#keeping-list-items-in-order-with-key
