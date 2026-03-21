# BUG-229: Marketing Footer Year Uses Local Runtime Time Instead of UTC

**Status:** Resolved
**Priority:** P4
**Date:** 2026-03-21
**Resolved:** 2026-03-21

## Summary

The marketing footer rendered its copyright year with `new Date().getFullYear()`.

That reads the runtime's local timezone, not UTC. At the absolute instant `2026-01-01T00:30:00.000Z`, a UTC runtime produces `2026`, but `America/New_York` still produces `2025`. The rest of the codebase is intentionally disciplined about UTC display and storage, so this footer was a production-facing outlier.

## Impact

- Marketing pages could display the previous year for several hours after UTC midnight on January 1 when rendered in non-UTC runtimes.
- The broader claim that production code contained no local-calendar date reads was false.
- The bug was cosmetic, but it broke the repository's UTC consistency standard.

## Root Cause

`components/marketing/marketing-layout.tsx` used `new Date().getFullYear()` directly in the footer. `getFullYear()` derives its value from the ambient local timezone rather than UTC.

## Fix

Replaced the local-calendar read with a UTC-derived year:

```tsx
new Date().toISOString().slice(0, 4)
```

This keeps the footer aligned with the app's UTC convention without extracting a new helper for a single call site.

## Verification

### Red test

Added a jsdom markup test in `components/marketing/marketing-layout.test.tsx` that:

- freezes time at `2026-01-01T00:30:00.000Z`
- forces `process.env.TZ = 'America/New_York'`
- renders the footer with `renderToStaticMarkup`
- asserts the rendered footer still contains `© 2026 Addiction Boards`

Before the fix, the footer rendered `© 2025 Addiction Boards` and the test failed.

### Green test

After the implementation change, the same test passed.

## Affected Files

| File | Change |
|------|--------|
| `components/marketing/marketing-layout.tsx` | Switched footer year derivation from local time to UTC |
| `components/marketing/marketing-layout.test.tsx` | Added regression coverage for the UTC-vs-local New Year boundary |

## Related

- `components/marketing/marketing-layout.tsx`
- `components/marketing/marketing-layout.test.tsx`
- `docs/bugs/index.md`
