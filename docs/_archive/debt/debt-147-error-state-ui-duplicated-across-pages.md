# DEBT-147: Error State UI Duplicated Across 9+ Pages

**Status:** Resolved
**Priority:** P2
**Date:** 2026-02-07

---

## Description

Error state rendering is copy-pasted across 9+ app pages with slight variations in styling and structure. There is no shared `ErrorCard` or `ErrorBanner` component. Each page independently implements:

```tsx
<div role="alert" className="rounded-2xl border border-border bg-card p-4 text-sm text-destructive shadow-sm">
  {error message}
</div>
```

But the styling varies:

| File | Border | Background | Padding |
|------|--------|------------|---------|
| `billing/page.tsx:141` | `border-border` | `bg-card` | `p-4` |
| `bookmarks/page.tsx:226` | `border-border` | `bg-card` | `p-4` |
| `practice-view.tsx:84` | `border-border` | `bg-card` | `p-6` |
| `practice-view.tsx:104` | `border-destructive/30` | `bg-destructive/10` | `p-4` |
| `practice/page.tsx:56` | `border-destructive/30` | `bg-destructive/10` | `p-4` |
| `question-page-client.tsx:60` | `border-border` | `bg-card` | `p-6` |

## Impact

- Inconsistent error presentation across the app (some use destructive borders, others neutral)
- Missing `role="alert"` on some error states
- Harder to add features like dismissibility or retry buttons uniformly

## Resolution

Implemented shared `ErrorCard` and replaced duplicated error containers across app pages:

- added `components/error-card.tsx` (+ test coverage in `components/error-card.test.tsx`)
- integrated into:
  - `app/(app)/app/billing/page.tsx`
  - `app/(app)/app/bookmarks/page.tsx`
  - `app/(app)/app/review/page.tsx`
  - `app/(app)/app/dashboard/page.tsx`
  - `app/(app)/app/questions/[slug]/question-page-client.tsx`
  - `app/(app)/app/practice/components/practice-view.tsx`
  - `app/(app)/app/practice/[sessionId]/components/practice-session-page-view.tsx`
  - `app/(app)/app/practice/page.tsx`

## Verification

- [x] Shared `ErrorCard` exists and is used in the duplicated app-page error paths
- [x] Standardized `role="alert"` + semantic destructive styling via shared component
- [x] `pnpm typecheck && pnpm lint && pnpm test --run`

## Related

- DEBT-144: Hardcoded colors bypass design system
- DEBT-145: Card components never used
