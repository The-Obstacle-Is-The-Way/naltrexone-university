# DEBT-018: Missing Next.js Error Boundaries

**Status:** Open
**Priority:** P2
**Date:** 2026-02-01

## Summary

ADR-006 (Error Handling Strategy) specifies that React components should use `error.tsx` for error boundaries, but no `error.tsx` or `global-error.tsx` files exist.

## Current State

```text
app/
├── layout.tsx
├── page.tsx
├── (dashboard)/
│   └── ...
└── NO error.tsx files anywhere
```

## Expected State (per ADR-006)

```text
app/
├── layout.tsx
├── page.tsx
├── global-error.tsx        # Catches errors in root layout
├── error.tsx               # Catches errors in pages
├── (dashboard)/
│   └── error.tsx           # Route group specific errors
└── ...
```

## Why This Matters

Without error boundaries:
- Unhandled errors crash the entire app to a white screen
- Users get no feedback when something breaks
- No opportunity to recover gracefully or show "try again"

## Fix

### File: `app/global-error.tsx`

```tsx
'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        <div className="flex min-h-screen items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold">Something went wrong</h1>
            <p className="mt-2 text-gray-600">We've been notified and are looking into it.</p>
            <button
              onClick={reset}
              className="mt-4 rounded bg-primary px-4 py-2 text-white"
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
```

### File: `app/error.tsx`

```tsx
'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="text-center">
        <h2 className="text-xl font-semibold">Something went wrong</h2>
        <button
          onClick={reset}
          className="mt-4 rounded bg-primary px-4 py-2 text-white"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
```

## Acceptance Criteria

- [ ] `app/global-error.tsx` exists and catches root layout errors
- [ ] `app/error.tsx` exists and catches page errors
- [ ] Error boundaries report to Sentry (when configured)
- [ ] User sees friendly error message, not white screen
- [ ] "Try again" button calls `reset()` to recover

## References

- [Next.js Error Handling](https://nextjs.org/docs/app/building-your-application/routing/error-handling)
- ADR-006: Error Handling Strategy
