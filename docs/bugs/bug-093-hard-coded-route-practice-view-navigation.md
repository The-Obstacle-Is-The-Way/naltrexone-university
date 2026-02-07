# BUG-093: Hard-Coded Route in Practice View Navigation

**Status:** Open
**Priority:** P4
**Date:** 2026-02-07

---

## Description

The "Back to Dashboard" link in `practice-view.tsx` uses a hard-coded string `"/app/dashboard"` instead of the `ROUTES.APP_DASHBOARD` constant from `lib/routes.ts`. This is inconsistent with the rest of the codebase which uses route constants for navigation.

## Root Cause

`app/(app)/app/practice/components/practice-view.tsx:72`:

```tsx
<Link
  href="/app/dashboard"
  className="text-sm font-medium text-muted-foreground hover:text-foreground"
>
  Back to Dashboard
</Link>
```

Should be:

```tsx
import { ROUTES } from '@/lib/routes';
// ...
<Link href={ROUTES.APP_DASHBOARD}>
```

## Impact

- If the dashboard route changes in `lib/routes.ts`, this link would silently break (404)
- Inconsistent with codebase convention — all other navigation uses route constants
- No runtime issue today (route is correct)

## Proposed Fix

Replace the hard-coded string with `ROUTES.APP_DASHBOARD` and add the import.

## Verification

- [ ] Link uses `ROUTES.APP_DASHBOARD` constant
- [ ] Navigation still works correctly
- [ ] No other hard-coded route strings in practice components

## Related

- `lib/routes.ts`
- `app/(app)/app/practice/components/practice-view.tsx`
- BUG-005 (historical: nav links to missing /app/dashboard — resolved)
