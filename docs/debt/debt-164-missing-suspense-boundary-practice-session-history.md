# DEBT-164: Missing Suspense Boundary for Practice Session History Panel

**Status:** Open
**Priority:** P2
**Date:** 2026-02-07

---

## Description

The `PracticeSessionHistoryPanel` component on the practice page loads session history asynchronously but lacks a React Suspense boundary. Loading states are managed internally through hooks rather than Suspense, which prevents streaming and progressive rendering.

```tsx
<PracticeSessionHistoryPanel
  status={sessionControls.sessionHistoryStatus}
  error={sessionControls.sessionHistoryError}
  rows={sessionControls.sessionHistoryRows}
/>
```

The entire practice page must wait for session history to load before any content renders, rather than streaming the page shell first and filling in the history panel when data arrives.

## Impact

- Perceived performance is worse than necessary — the page shell could render immediately
- No progressive rendering / streaming for session history
- Consistent with how the page was originally built, but inconsistent with Next.js best practices for data-heavy panels

## Resolution

Wrap `PracticeSessionHistoryPanel` in a Suspense boundary with a loading fallback, or convert to a server component with streaming.

## Verification

- [ ] Suspense boundary added around session history panel
- [ ] Page shell renders immediately
- [ ] Session history streams in when data arrives
- [ ] Error state still handled correctly

## Related

- `app/(app)/app/practice/page.tsx:80-90`
